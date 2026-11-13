import crypto from 'node:crypto';
import {
  buildProbeRequest,
  buildProtocolRequest,
  parseProtocolResponse,
} from './adapters';
import {
  DEFAULT_ENGINE_REGISTRY_CONFIG,
  validateCustomHeaders,
  validateRegistryConfig,
  verifyConnectionTargetSafe,
  type DnsLookupFn,
  type EngineRegistryConfig,
  type ModelConfig,
  type ProviderConfig,
  type ValidatedProvider,
} from './config';
import {
  buildContextWithinBudget,
  estimateTokens,
  type CanonicalMessage,
  type CanonicalToolCall,
} from './context';
import { ENGINE_DEFAULTS } from './defaults';
import {
  classifyProviderError,
  type ErrorClass,
} from './errorClassifier';
import { KeyPoolManager, type KeyStateName } from './keyPool';
import {
  computeEffectiveLimits,
  getCurrentPeriodWindow,
  QuotaLedger,
} from './ledger';
import {
  sanitizeModelTextOutput,
  validateStructuredOutput,
  validateTextOutput,
  type JsonObjectSchema,
  type JsonPropertySchema,
} from './outputValidator';
import {
  buildPromptInjectionGuard,
  formatKeyLast4,
  redactHeaders,
  redactPersonalData,
  redactSecrets,
} from './security';
import { DurableStorage } from './storage';
import { ToolsEngine, type ToolDefinition } from './toolsEngine';

/**
 * Sections 7, 9, 14, 15: ROUTING, FALLBACK, RETRY, STREAMING, USAGE, KILL SWITCHES, AND HEALTH
 */

export interface AdHocProviderInput {
  provider: ProviderConfig;
  rawKeys: string[];
  isKeyless?: boolean;
  isServerHeldKey?: boolean;
}

function normalizeAdHocProvider(
  input: ValidatedProvider | AdHocProviderInput
): ValidatedProvider {
  if ('resolved_keys' in input && Array.isArray(input.resolved_keys)) {
    return input;
  }
  const adhoc = input as AdHocProviderInput;
  const p = adhoc.provider;
  const hdrCheck = validateCustomHeaders(p.custom_headers);
  const resolvedKeys =
    adhoc.rawKeys.length > 0
      ? adhoc.rawKeys.map((rawKey, idx) => {
          const keyHash = crypto
            .createHash('sha256')
            .update(rawKey)
            .digest('hex')
            .slice(0, 10);
          return {
            key_id: `adhoc_k_${idx + 1}_${keyHash}`,
            ephemeral_raw_key: rawKey,
          };
        })
      : adhoc.isKeyless
      ? [{ key_id: 'adhoc_keyless', ephemeral_raw_key: 'keyless' }]
      : [];

  return {
    provider_id: p.provider_id,
    protocol: p.protocol,
    base_url: p.base_url,
    auth_header_name: p.auth_header_name,
    auth_header_format: p.auth_header_format,
    allowed_custom_headers: hdrCheck.sanitized,
    models: p.models,
    rpm: p.rpm || 600,
    rpd: p.rpd || 50_000,
    tpm: p.tpm || 2_000_000,
    tpd: p.tpd || 20_000_000,
    reset_timezone: p.reset_timezone || 'UTC',
    reset_time: p.reset_time || '00:00',
    priority: p.priority ?? 1,
    custom: Boolean(p.custom),
    probed: true,
    enabled: p.enabled !== false,
    resolved_keys: resolvedKeys,
    config_hash: `adhoc_${p.provider_id}`,
    is_client_supplied: !adhoc.isServerHeldKey,
  };
}

export interface CandidateId {
  provider_id: string;
  key_id: string;
  model_id: string;
}

export interface AttemptRecord {
  request_id: string;
  attempt_no: number;
  candidate: CandidateId;
  class: ErrorClass | 'SUCCESS' | 'CLIENT_ABORT';
  http_status: number | null;
  latency_ms: number;
  error_message?: string;
}

export interface EngineRequest {
  requestId?: string;
  userId: string;
  conversationId?: string;
  messages: CanonicalMessage[];
  language?: 'bn' | 'en' | 'auto';
  preferredProviderId?: string;
  preferredModelId?: string;
  adHocProviders?: Array<ValidatedProvider | AdHocProviderInput>;
  skipServerRegistry?: boolean;
  allowResetUnderChars?: number;
  temperature?: number;
  topP?: number;
  topK?: number;
  stopSequences?: string[];
  thinkingMode?: 'off' | 'low' | 'medium' | 'high';
  customParams?: Record<string, unknown>;
  maxOutputTokens?: number;
  perAttemptTimeoutMs?: number;
  requiredCapabilities?: {
    tools?: boolean;
    json?: boolean;
    stream?: boolean;
  };
  structuredSchema?: JsonObjectSchema | JsonPropertySchema;
  tools?: ToolDefinition[];
  allowPersonalData?: {
    allowEmail?: boolean;
    allowPhone?: boolean;
  };
  overallDeadlineMs?: number;
  maxUserMessageChars?: number;
  abortSignal?: AbortSignal;
}

export interface EngineResponse {
  ok: boolean;
  requestId: string;
  text: string;
  userMessage?: string;
  structuredData?: unknown;
  truncated: boolean;
  busy?: boolean;
  messageTooLong?: boolean;
  contentBlocked?: boolean;
  providerUsed?: string;
  providerId?: string;
  modelUsed?: string;
  modelId?: string;
  pendingActions?: Array<{
    actionId: string;
    confirmationCode: string;
    previewText: string;
    expiresAt: number;
  }>;
  attempts: AttemptRecord[];
}

export interface HttpResponseLike {
  status: number;
  headers: Record<string, string | undefined>;
  bodyText: string;
  streamChunks?: AsyncIterable<string>;
}

export type HttpTransportFn = (params: {
  url: string;
  method: 'POST' | 'GET';
  headers: Record<string, string>;
  body: string;
  signal: AbortSignal;
  redirect: 'manual';
}) => Promise<HttpResponseLike>;

function extractTokenFromSseDataLine(dataStr: string): string {
  const trimmed = dataStr.trim();
  if (!trimmed || trimmed === '[DONE]') return '';
  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    return '';
  }
  if (!parsed) return '';
  if (parsed.error) {
    const errObj = parsed.error as Record<string, unknown> | string;
    const msg =
      typeof errObj === 'string'
        ? errObj
        : String(errObj.message || 'Upstream SSE error');
    throw new Error(msg);
  }
  if (Array.isArray(parsed.choices) && parsed.choices.length > 0) {
    const c0 = parsed.choices[0] as Record<string, unknown>;
    const delta = (c0.delta || c0.message || {}) as Record<string, unknown>;
    if (typeof delta.content === 'string' && delta.content) return delta.content;
    if (Array.isArray(delta.content)) {
      const t = delta.content
        .map((p) =>
          typeof p === 'string' ? p : typeof p?.text === 'string' ? p.text : ''
        )
        .join('');
      if (t) return t;
    }
    if (
      typeof delta.reasoning_content === 'string' &&
      delta.reasoning_content
    ) {
      return delta.reasoning_content;
    }
    if (typeof delta.reasoning === 'string' && delta.reasoning) {
      return delta.reasoning;
    }
    if (typeof c0.text === 'string' && c0.text) return c0.text;
  }
  if (Array.isArray(parsed.candidates) && parsed.candidates.length > 0) {
    const cand0 = parsed.candidates[0] as Record<string, unknown>;
    const content = (cand0.content || {}) as { parts?: Array<{ text?: string; thought?: boolean }> };
    if (Array.isArray(content.parts)) {
      return content.parts
        .filter((p) => !p.thought)
        .map((p) => (typeof p.text === 'string' ? p.text : ''))
        .join('');
    }
  }
  if (parsed.delta && typeof (parsed.delta as Record<string, unknown>).text === 'string') {
    return (parsed.delta as Record<string, unknown>).text as string;
  }
  if (parsed.content_block && typeof (parsed.content_block as Record<string, unknown>).text === 'string') {
    return (parsed.content_block as Record<string, unknown>).text as string;
  }
  if (typeof parsed.text === 'string') return parsed.text;
  if (typeof parsed.delta === 'string') return parsed.delta;
  return '';
}

const defaultHttpTransport: HttpTransportFn = async (params) => {
  const resp = await fetch(params.url, {
    method: params.method,
    headers: params.headers,
    body: params.body,
    signal: params.signal,
    redirect: 'manual',
  });

  const headersObj: Record<string, string | undefined> = {};
  resp.headers.forEach((v, k) => {
    headersObj[k.toLowerCase()] = v;
  });

  let requestedStream = false;
  try {
    if (params.url.includes('streamGenerateContent')) {
      requestedStream = true;
    } else if (params.body && params.body.includes('"stream":true')) {
      requestedStream = true;
    }
  } catch {
    // Ignore
  }

  const contentType = headersObj['content-type'] || '';
  if (
    resp.ok &&
    resp.body &&
    requestedStream &&
    (contentType.includes('text/event-stream') ||
      params.url.includes('streamGenerateContent'))
  ) {
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    async function* generateChunks(): AsyncGenerator<string> {
      let sseBuffer = '';
      let detectedSse = false;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const decoded = decoder.decode(value, { stream: true });
          if (
            detectedSse ||
            /^(?:event:|data:\s*(?:\[DONE\]|\{)|:\s*\w)/m.test(sseBuffer + decoded)
          ) {
            detectedSse = true;
            sseBuffer += decoded;
            const lines = sseBuffer.split(/\r?\n/);
            sseBuffer = lines.pop() ?? '';
            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed || trimmed.startsWith(':') || trimmed.startsWith('event:')) {
                continue;
              }
              if (trimmed.startsWith('data:')) {
                const token = extractTokenFromSseDataLine(trimmed.slice(5));
                if (token) yield token;
              }
            }
          } else {
            yield decoded;
          }
        }
        if (detectedSse && sseBuffer.trim().startsWith('data:')) {
          const token = extractTokenFromSseDataLine(sseBuffer.trim().slice(5));
          if (token) yield token;
        }
      } finally {
        try {
          reader.releaseLock();
        } catch {
          // Ignore
        }
      }
    }
    return {
      status: resp.status,
      headers: headersObj,
      bodyText: '',
      streamChunks: generateChunks(),
    };
  }

  let bodyText = await resp.text().catch(() => '');

  // If the request asked for non-streaming (requestedStream === false), but the upstream gateway
  // still returned SSE event-stream lines (common on some CodeCraft / proxy gateways),
  // aggregate the SSE chunks into a standard OpenAI-compatible JSON completion body.
  if (resp.ok && !requestedStream && bodyText.trim()) {
    const trimmedBody = bodyText.trim();
    if (/^(?:event:|data:\s*(?:\[DONE\]|\{))/m.test(trimmedBody)) {
      let aggregatedText = '';
      let sseErrorMsg = '';
      for (const line of trimmedBody.split(/\r?\n/)) {
        const t = line.trim();
        if (t.startsWith('data:')) {
          try {
            const tok = extractTokenFromSseDataLine(t.slice(5));
            if (tok) aggregatedText += tok;
          } catch (sseErr: unknown) {
            sseErrorMsg =
              sseErr instanceof Error ? sseErr.message : String(sseErr);
          }
        }
      }
      if (sseErrorMsg && !aggregatedText.trim()) {
        bodyText = JSON.stringify({
          error: { message: sseErrorMsg, type: 'upstream_sse_error' },
        });
      } else if (aggregatedText.trim()) {
        bodyText = JSON.stringify({
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content: aggregatedText },
              finish_reason: 'stop',
            },
          ],
        });
      }
    }
  }

  // If the request asked for streaming, but the custom provider returned 200 OK with non-SSE JSON or SSE under text/plain
  if (resp.ok && requestedStream && bodyText.trim()) {
    const trimmedBody = bodyText.trim();
    if (/^(?:event:|data:\s*(?:\[DONE\]|\{))/m.test(trimmedBody)) {
      async function* replaySseLines(): AsyncGenerator<string> {
        for (const line of trimmedBody.split(/\r?\n/)) {
          const t = line.trim();
          if (t.startsWith('data:')) {
            const tok = extractTokenFromSseDataLine(t.slice(5));
            if (tok) yield tok;
          }
        }
      }
      return {
        status: resp.status,
        headers: headersObj,
        bodyText,
        streamChunks: replaySseLines(),
      };
    }
    try {
      const parsedJson = JSON.parse(trimmedBody) as Record<string, unknown>;
      if (!parsedJson.error) {
        const parsedProto = parseProtocolResponse(
          params.url.includes('generativelanguage.googleapis.com') &&
            !params.url.includes('/openai')
            ? 'gemini_native'
            : params.url.includes('/v1/messages')
            ? 'anthropic_native'
            : 'openai_compatible',
          parsedJson
        );
        if (parsedProto.text && parsedProto.text.trim()) {
          async function* singleChunk(): AsyncGenerator<string> {
            yield parsedProto.text;
          }
          return {
            status: resp.status,
            headers: headersObj,
            bodyText,
            streamChunks: singleChunk(),
          };
        }
      }
    } catch {
      // Not JSON
    }
  }

  return {
    status: resp.status,
    headers: headersObj,
    bodyText,
  };
};

class ConcurrencyLimiter {
  private globalInFlight = 0;
  private readonly keyInFlight = new Map<string, number>();
  private readonly waitQueue: Array<() => void> = [];

  constructor(
    private readonly maxPerKey: number = ENGINE_DEFAULTS.MAX_IN_FLIGHT_PER_KEY,
    private readonly maxGlobal: number = ENGINE_DEFAULTS.MAX_IN_FLIGHT_GLOBAL
  ) {}

  public canAcquireImmediately(keyCompositeId: string): boolean {
    if (this.globalInFlight >= this.maxGlobal) return false;
    const curKey = this.keyInFlight.get(keyCompositeId) || 0;
    return curKey < this.maxPerKey;
  }

  public async acquire(
    keyCompositeId: string,
    waitTimeoutMs: number = ENGINE_DEFAULTS.SLOT_WAIT_TIMEOUT_MS
  ): Promise<(() => void) | null> {
    if (this.canAcquireImmediately(keyCompositeId)) {
      return this.lockSlot(keyCompositeId);
    }

    if (waitTimeoutMs <= 0) return null;

    return new Promise<(() => void) | null>((resolve) => {
      let settled = false;
      const tryWake = () => {
        if (settled) return;
        if (this.canAcquireImmediately(keyCompositeId)) {
          settled = true;
          clearTimeout(timer);
          const idx = this.waitQueue.indexOf(tryWake);
          if (idx !== -1) this.waitQueue.splice(idx, 1);
          resolve(this.lockSlot(keyCompositeId));
        }
      };

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        const idx = this.waitQueue.indexOf(tryWake);
        if (idx !== -1) this.waitQueue.splice(idx, 1);
        resolve(null);
      }, waitTimeoutMs);

      this.waitQueue.push(tryWake);
    });
  }

  private lockSlot(keyCompositeId: string): () => void {
    this.globalInFlight += 1;
    this.keyInFlight.set(
      keyCompositeId,
      (this.keyInFlight.get(keyCompositeId) || 0) + 1
    );
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.globalInFlight = Math.max(0, this.globalInFlight - 1);
      const cur = (this.keyInFlight.get(keyCompositeId) || 1) - 1;
      if (cur <= 0) {
        this.keyInFlight.delete(keyCompositeId);
      } else {
        this.keyInFlight.set(keyCompositeId, cur);
      }
      // Notify queued waiters
      const snapshot = [...this.waitQueue];
      for (const wake of snapshot) {
        wake();
      }
    };
  }
}

export function getSafeUserMessage(
  kind: 'unavailable' | 'busy' | 'message_too_long' | 'content_blocked',
  language: 'bn' | 'en' | 'auto' = 'auto',
  sampleInput = ''
): string {
  const isBangla =
    language === 'bn' ||
    (language === 'auto' && /[\u0980-\u09FF]/.test(sampleInput));

  if (kind === 'busy') {
    return isBangla
      ? 'সিস্টেমটি এই মুহূর্তে ব্যস্ত রয়েছে। অনুগ্রহ করে কিছুক্ষণ পর আবার চেষ্টা করুন।'
      : 'The assistant is currently busy. Please try again in a moment.';
  }
  if (kind === 'message_too_long') {
    return isBangla
      ? 'আপনার বার্তাটি নির্ধারিত সীমার চেয়ে অনেক বড়। অনুগ্রহ করে ছোট করে আবার পাঠান।'
      : 'Your message is too long to process. Please shorten your message and try again.';
  }
  if (kind === 'content_blocked') {
    return isBangla
      ? 'নিরাপত্তা নীতিমালার কারণে এই অনুরোধটি প্রক্রিয়া করা সম্ভব নয়।'
      : 'This request cannot be fulfilled due to safety and content guidelines.';
  }
  return isBangla
    ? 'সহকারী এই মুহূর্তে সাময়িকভাবে অনুপলব্ধ। অনুগ্রহ করে একটু পরে আবার চেষ্টা করুন।'
    : 'The assistant is temporarily unavailable. Please try again shortly.';
}

/**
 * Formats a clear, actionable, secret-redacted error message from recorded provider attempts
 * instead of masking upstream HTTP failures with a generic "temporarily unavailable" string.
 */
export function formatActionableProviderError(
  attempts: AttemptRecord[],
  language: 'bn' | 'en' | 'auto' = 'auto',
  sampleInput = ''
): string {
  if (!attempts || attempts.length === 0) {
    return getSafeUserMessage('unavailable', language, sampleInput);
  }
  const last = attempts[attempts.length - 1];
  const statusStr = last.http_status ? `HTTP ${last.http_status}` : last.class;
  const modelId = last.candidate?.model_id || 'unknown';
  const rawDetail = redactSecrets((last.error_message || '').trim()).slice(0, 260);
  const detailSuffix = rawDetail ? ` Upstream error: "${rawDetail}".` : '';

  switch (last.class) {
    case 'AUTH_INVALID':
      return `Authentication failed (${statusStr} · AUTH_INVALID) for model "${modelId}".${detailSuffix} Verify that your API key is valid and matches the configured Base URL.`;
    case 'PERMISSION_DENIED':
      return `Access denied by provider (${statusStr} · PERMISSION_DENIED) for model "${modelId}".${detailSuffix} Check that your API key has permission to use this model/gateway.`;
    case 'MODEL_UNAVAILABLE':
      return `Model "${modelId}" is not valid or unavailable on this gateway (${statusStr} · MODEL_UNAVAILABLE).${detailSuffix} Select a supported model ID in AI Providers settings.`;
    case 'QUOTA_EXHAUSTED':
      return `API quota or billing credits exhausted (${statusStr} · QUOTA_EXHAUSTED) on model "${modelId}".${detailSuffix} Check your provider billing balance or switch to another key/provider.`;
    case 'RATE_LIMITED':
      return `Rate limit reached (${statusStr} · RATE_LIMITED) on model "${modelId}".${detailSuffix} Wait briefly and retry, or add another API key.`;
    case 'BAD_REQUEST':
      return `Gateway rejected the request (${statusStr} · BAD_REQUEST) for model "${modelId}".${detailSuffix} Verify that model "${modelId}" is supported and the Base URL uses OpenAI-compatible Chat Completions.`;
    case 'CONTEXT_TOO_LONG':
      return `Prompt exceeds the context window for model "${modelId}" (${statusStr} · CONTEXT_TOO_LONG).${detailSuffix} Shorten the message or choose a larger-context model.`;
    case 'TIMEOUT':
      return `Gateway request timed out (${statusStr} · TIMEOUT) while waiting for model "${modelId}".${detailSuffix} Check gateway availability or try a faster model.`;
    case 'NETWORK_ERROR':
      return `Network connection to the provider gateway failed (${statusStr} · NETWORK_ERROR).${detailSuffix} Check your Base URL and network connection.`;
    case 'BAD_RESPONSE':
      return `Gateway returned an empty or non-conforming response (${statusStr} · BAD_RESPONSE) for model "${modelId}".${detailSuffix} Verify that the Base URL points to a valid /v1/chat/completions endpoint.`;
    case 'SERVER_ERROR':
      return `Upstream gateway returned a server error (${statusStr} · SERVER_ERROR) for model "${modelId}".${detailSuffix} The provider gateway may be experiencing an outage or channel failure.`;
    default:
      return `Provider request failed (${statusStr} · ${last.class}) for model "${modelId}".${detailSuffix}`;
  }
}

/**
 * Full-jitter backoff calculation: sleep random in [0, min(cap, base * factor^attempt)],
 * never sleeping more than remaining budget (capped at 2000ms total per request).
 */
export function computeFullJitterBackoffMs(
  retryIndex: number,
  remainingSleepBudgetMs: number,
  randomFn: () => number = Math.random
): number {
  if (remainingSleepBudgetMs <= 0) return 0;
  const exp = Math.min(
    ENGINE_DEFAULTS.BACKOFF_CAP_MS,
    ENGINE_DEFAULTS.BACKOFF_BASE_MS *
      Math.pow(ENGINE_DEFAULTS.BACKOFF_FACTOR, retryIndex)
  );
  const jittered = Math.floor(randomFn() * (exp + 1));
  return Math.min(jittered, remainingSleepBudgetMs, ENGINE_DEFAULTS.BACKOFF_CAP_MS);
}

export interface HealthReport {
  engine_enabled: boolean;
  killSwitchEnabled: boolean;
  serverKeyDailyCap: number;
  serverKeyDailyCount: number;
  serverKeyBudgetReached: boolean;
  providers: Array<{
    provider_id: string;
    enabled: boolean;
    custom: boolean;
    probed: boolean;
    keys: Array<{
      key_id: string;
      key_masked: string;
      state: KeyStateName;
      simplified_status?: 'usable' | 'rate_limited' | 'no_credit' | 'broken';
      reset_time: number | null;
      last_error_class: string | null;
      circuit_open_count: number;
      half_open_probe_in_flight: boolean;
      models: Array<{
        model_id: string;
        available: boolean;
        remaining_effective_quota: {
          rpm: number;
          rpd: number;
          tpm: number;
          tpd: number;
          period_end_ms: number;
        };
      }>;
    }>;
    counts_last_24h_by_class: Record<string, number>;
  }>;
}

export class HardenedAIEngine {
  public readonly storage: DurableStorage;
  public readonly ledger: QuotaLedger;
  public readonly keyPool: KeyPoolManager;
  public ephemeralKeyPool: KeyPoolManager;
  public readonly toolsEngine: ToolsEngine;
  public readonly concurrency: ConcurrencyLimiter;

  private activeConfig: EngineRegistryConfig;
  private validatedProviders: ValidatedProvider[] = [];
  private configHash = '';
  private httpTransport: HttpTransportFn;
  private dnsLookup?: DnsLookupFn;
  private sleepFn: (ms: number) => Promise<void>;
  private allowInsecureLocalhost?: boolean;
  private serverKeyDailyCapOverride?: number;

  constructor(options?: {
    storage?: DurableStorage;
    dbPath?: string;
    masterKeySecret?: string;
    allowInsecureLocalhost?: boolean;
    serverKeyDailyCap?: number;
    config?: EngineRegistryConfig;
    httpTransport?: HttpTransportFn;
    dnsLookup?: DnsLookupFn;
    sleepFn?: (ms: number) => Promise<void>;
    maxPerKeyConcurrency?: number;
    maxGlobalConcurrency?: number;
  }) {
    this.storage =
      options?.storage ||
      new DurableStorage({
        dbPath: options?.dbPath,
        masterKeyHex: options?.masterKeySecret,
      });
    this.ledger = new QuotaLedger(this.storage);
    this.keyPool = new KeyPoolManager(this.storage);
    this.ephemeralKeyPool = KeyPoolManager.createEphemeral(() => this.storage.now());
    this.toolsEngine = new ToolsEngine(this.storage);
    this.concurrency = new ConcurrencyLimiter(
      options?.maxPerKeyConcurrency ?? ENGINE_DEFAULTS.MAX_IN_FLIGHT_PER_KEY,
      options?.maxGlobalConcurrency ?? ENGINE_DEFAULTS.MAX_IN_FLIGHT_GLOBAL
    );
    this.httpTransport = options?.httpTransport || defaultHttpTransport;
    this.dnsLookup = options?.dnsLookup;
    this.allowInsecureLocalhost = options?.allowInsecureLocalhost;
    this.serverKeyDailyCapOverride = options?.serverKeyDailyCap;
    this.sleepFn =
      options?.sleepFn ||
      ((ms: number) => new Promise((r) => setTimeout(r, ms)));

    this.activeConfig =
      options?.config || DEFAULT_ENGINE_REGISTRY_CONFIG;
    this.reloadConfig(this.activeConfig, {
      allowInsecureLocalhost: this.allowInsecureLocalhost,
    });
  }

  public close(): void {
    this.storage.close();
  }

  public resetEphemeralKeyPool(): void {
    this.ephemeralKeyPool = KeyPoolManager.createEphemeral(() =>
      this.storage.now()
    );
  }

  private getKeyPool(provider: ValidatedProvider): KeyPoolManager {
    return provider.is_client_supplied ? this.ephemeralKeyPool : this.keyPool;
  }

  /**
   * PR1 & PR2: Validates config on load and on every change.
   * A half-applied config is never used.
   */
  public reloadConfig(
    newConfig: EngineRegistryConfig,
    options?: { allowInsecureLocalhost?: boolean }
  ): {
    applied: boolean;
    validProvidersCount: number;
    disabledProviders: Array<{ provider_id: string; errors: string[] }>;
  } {
    if (!newConfig || !Array.isArray(newConfig.providers)) {
      return {
        applied: false,
        validProvidersCount: this.validatedProviders.length,
        disabledProviders: [
          { provider_id: 'root', errors: ['Invalid top-level config structure'] },
        ],
      };
    }

    const report = validateRegistryConfig(newConfig, {
      allowInsecureLocalhost: options?.allowInsecureLocalhost,
      logger: (msg) => {
        this.storage.appendAuditLog({
          eventType: 'CONFIG_VALIDATION_WARNING',
          details: { message: redactSecrets(msg) },
        });
      },
    });

    // Atomic in-memory swap of validated providers
    this.activeConfig = newConfig;
    this.validatedProviders = report.validProviders;
    this.configHash = report.configHash;

    for (const vp of this.validatedProviders) {
      for (const k of vp.resolved_keys) {
        this.keyPool.ensureKeyInitialized(vp.provider_id, k.key_id);
      }
    }

    return {
      applied: true,
      validProvidersCount: this.validatedProviders.length,
      disabledProviders: report.disabledProviders,
    };
  }

  /**
   * Resolves a key's secret value in memory only at call time (PR4, SEC2).
   */
  private resolveKeySecretInMemory(
    providerId: string,
    keyConfig: {
      key_id: string;
      key_env_var_name?: string;
      encrypted_key_ref?: string;
      ephemeral_raw_key?: string;
    }
  ): string | null {
    if (keyConfig.ephemeral_raw_key && keyConfig.ephemeral_raw_key.trim()) {
      return keyConfig.ephemeral_raw_key.trim();
    }

    // 1. Check encrypted storage first
    const decrypted = this.storage.getDecryptedKey(providerId, keyConfig.key_id);
    if (decrypted) return decrypted;

    // 2. Check environment variable reference
    if (keyConfig.key_env_var_name) {
      const envVal = process.env[keyConfig.key_env_var_name];
      if (envVal && envVal.trim() && envVal !== 'MY_GEMINI_API_KEY') {
        return envVal.trim();
      }
    }
    return null;
  }

  /**
   * CP5: Probes a custom provider with a minimal request (max_tokens = 4) and enables it
   * ONLY if the SSRF guard, redirect check, and adapter response validation succeed.
   */
  public async probeAndEnableCustomProvider(
    providerId: string
  ): Promise<{ enabled: boolean; reason?: string }> {
    const provider = this.validatedProviders.find(
      (p) => p.provider_id === providerId
    );
    if (!provider) {
      return { enabled: false, reason: `Provider "${providerId}" not found or invalid` };
    }
    if (!provider.custom) {
      return { enabled: provider.enabled, reason: 'Not a custom provider' };
    }

    const ssrfCheck = await verifyConnectionTargetSafe(provider.base_url, {
      isCustomProvider: true,
      dnsLookup: this.dnsLookup,
    });
    if (!ssrfCheck.safe) {
      this.storage.appendAuditLog({
        eventType: 'CUSTOM_PROVIDER_SSRF_BLOCKED',
        providerId,
        details: { reason: ssrfCheck.reason },
      });
      return { enabled: false, reason: ssrfCheck.reason };
    }

    const firstKeyEntry = provider.resolved_keys[0];
    const firstModel = provider.models[0];
    if (!firstKeyEntry || !firstModel) {
      return { enabled: false, reason: 'Missing key or model for probe' };
    }

    const apiKey = this.resolveKeySecretInMemory(providerId, firstKeyEntry);
    if (!apiKey) {
      return { enabled: false, reason: 'Key secret could not be resolved for probe' };
    }

    const hdrCheck = validateCustomHeaders(provider.allowed_custom_headers);
    if (!hdrCheck.valid) {
      return { enabled: false, reason: hdrCheck.errors.join('; ') };
    }

    const probePayload = buildProbeRequest({
      protocol: provider.protocol,
      baseUrl: provider.base_url,
      apiKey,
      modelId: firstModel.model_id,
      authHeaderName: provider.auth_header_name,
      authHeaderFormat: provider.auth_header_format,
      sanitizedCustomHeaders: hdrCheck.sanitized,
    });

    try {
      const resp = await this.httpTransport({
        url: probePayload.url,
        method: 'POST',
        headers: probePayload.headers,
        body: JSON.stringify(probePayload.body),
        signal: AbortSignal.timeout(10_000),
        redirect: 'manual',
      });

      const classified = classifyProviderError({
        protocol: provider.protocol,
        httpStatus: resp.status,
        rawBody: resp.bodyText,
        headers: resp.headers,
        providerId,
        keyId: firstKeyEntry.key_id,
      });

      if (resp.status < 200 || resp.status >= 300 || classified.errorClass !== 'UNKNOWN' && resp.status >= 400) {
        return {
          enabled: false,
          reason: `Probe failed with ${classified.errorClass} (HTTP ${resp.status})`,
        };
      }

      const parsedJson = JSON.parse(resp.bodyText) as Record<string, unknown>;
      const parsed = parseProtocolResponse(provider.protocol, parsedJson);
      if (!parsed.text && parsed.toolCalls.length === 0) {
        return {
          enabled: false,
          reason: 'Probe response failed adapter validation (empty output)',
        };
      }

      provider.probed = true;
      provider.enabled = true;
      this.storage.appendAuditLog({
        eventType: 'CUSTOM_PROVIDER_PROBE_SUCCEEDED',
        providerId,
        keyId: firstKeyEntry.key_id,
        details: { model_id: firstModel.model_id },
      });
      return { enabled: true };
    } catch (err: unknown) {
      return {
        enabled: false,
        reason: `Probe error: ${redactSecrets(err instanceof Error ? err.message : 'unknown')}`,
      };
    }
  }

  /**
   * U3: Kill switches for the whole engine ('engine'/'global'), per provider ('provider'/provider_id),
   * and per key ('key'/`${provider_id}:${key_id}`).
   */
  public setKillSwitch(
    scope: 'engine' | 'provider' | 'key',
    targetId: string,
    killed: boolean,
    reason = killed ? 'manual_kill_switch' : 'manual_restore'
  ): void {
    const now = this.storage.now();
    this.storage.transaction(() => {
      this.storage.db
        .prepare(
          `INSERT INTO ai_kill_switches (scope, target_id, killed, reason, updated_at, version)
           VALUES (?, ?, ?, ?, ?, 1)
           ON CONFLICT(scope, target_id)
           DO UPDATE SET
             killed = excluded.killed,
             reason = excluded.reason,
             updated_at = excluded.updated_at,
             version = ai_kill_switches.version + 1`
        )
        .run(scope, targetId, killed ? 1 : 0, reason, now);

      this.storage.appendAuditLog({
        eventType: 'KILL_SWITCH_UPDATED',
        details: { scope, target_id: targetId, killed, reason },
      });
    });
  }

  public setGlobalKillSwitch(killed: boolean, reason?: string): void {
    this.setKillSwitch('engine', 'global', killed, reason);
    this.storage.setKillSwitchEnabled(!killed);
  }

  public isKilled(scope: 'engine' | 'provider' | 'key', targetId: string): boolean {
    if (scope === 'engine' && targetId === 'global') {
      if (!this.storage.isKillSwitchEnabled()) return true;
    }
    const row = this.storage.db
      .prepare(
        'SELECT killed FROM ai_kill_switches WHERE scope = ? AND target_id = ?'
      )
      .get(scope, targetId) as { killed: number } | undefined;
    return Boolean(row && row.killed === 1);
  }

  /**
   * U1 & I7: Records one usage record per attempt.
   */
  private recordUsageAttempt(params: {
    requestId: string;
    attemptNo: number;
    providerId: string;
    keyId: string;
    model: ModelConfig;
    errorClass: string;
    httpStatus: number | null;
    latencyMs: number;
    inputTokens: number;
    outputTokens: number;
    tokensEstimated: boolean;
  }): void {
    const inCost =
      ((params.model.input_price_per_1k || 0) * params.inputTokens) / 1_000;
    const outCost =
      ((params.model.output_price_per_1k || 0) * params.outputTokens) / 1_000;
    const costUsd = Number((inCost + outCost).toFixed(8));

    this.storage.db
      .prepare(
        `INSERT INTO ai_usage_records
         (request_id, attempt_no, provider_id, key_id, model_id, class, http_status,
          latency_ms, input_tokens, output_tokens, tokens_estimated, cost_usd, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        params.requestId,
        params.attemptNo,
        params.providerId,
        params.keyId,
        params.model.model_id,
        params.errorClass,
        params.httpStatus,
        Math.max(0, Math.round(params.latencyMs)),
        Math.max(0, Math.round(params.inputTokens)),
        Math.max(0, Math.round(params.outputTokens)),
        params.tokensEstimated ? 1 : 0,
        costUsd,
        this.storage.now()
      );
  }

  /**
   * U2: Checks if the daily spend cap has been reached.
   */
  public isDailySpendCapReached(): boolean {
    const cap =
      this.activeConfig.global?.daily_spend_cap_usd ??
      ENGINE_DEFAULTS.DAILY_SPEND_CAP_USD;
    const now = this.storage.now();
    const dayStart = now - 24 * 60 * 60 * 1_000;
    const row = this.storage.db
      .prepare(
        'SELECT COALESCE(SUM(cost_usd), 0) AS total_spend FROM ai_usage_records WHERE created_at >= ?'
      )
      .get(dayStart) as { total_spend: number };
    return row.total_spend >= cap;
  }

  public getServerKeyDailyCap(): number {
    if (
      typeof this.serverKeyDailyCapOverride === 'number' &&
      Number.isFinite(this.serverKeyDailyCapOverride)
    ) {
      return Math.max(0, Math.floor(this.serverKeyDailyCapOverride));
    }
    const rawCap = Number(process.env.AI_SERVER_KEY_DAILY_CAP);
    return Number.isFinite(rawCap) && rawCap >= 0
      ? Math.floor(rawCap)
      : ENGINE_DEFAULTS.SERVER_KEY_DAILY_REQUEST_CAP;
  }

  public isServerKeyBudgetReached(): boolean {
    const cap = this.getServerKeyDailyCap();
    return (
      this.storage.isServerKeyDailyCapReached(cap) ||
      this.isDailySpendCapReached()
    );
  }

  /**
   * RT2: Builds the ordered candidate list:
   * - priority ascending
   * - among equal priority, least recently used key first (last_used_at ascending)
   * - model order as listed in config
   * - filters out disabled/killed providers, unprobed custom providers, and models lacking required capabilities
   */
  public buildOrderedCandidates(
    requiredCapabilities?: {
      tools?: boolean;
      json?: boolean;
      stream?: boolean;
    },
    extraOptions?: {
      adHocProviders?: Array<ValidatedProvider | AdHocProviderInput>;
      preferredProviderId?: string;
      preferredModelId?: string;
      skipServerRegistry?: boolean;
    }
  ): Array<{
    provider: ValidatedProvider;
    keyEntry: {
      key_id: string;
      key_env_var_name?: string;
      encrypted_key_ref?: string;
      ephemeral_raw_key?: string;
    };
    model: ModelConfig;
    lastUsedAt: number;
  }> {
    if (this.isKilled('engine', 'global')) {
      return [];
    }

    const candidates: Array<{
      provider: ValidatedProvider;
      keyEntry: {
        key_id: string;
        key_env_var_name?: string;
        encrypted_key_ref?: string;
        ephemeral_raw_key?: string;
      };
      model: ModelConfig;
      lastUsedAt: number;
      modelIndex: number;
      preferredScore: number;
    }> = [];

    const normalizedAdHoc = (extraOptions?.adHocProviders || []).map((item) =>
      normalizeAdHocProvider(item)
    );

    const allProviders: ValidatedProvider[] = [
      ...normalizedAdHoc,
      ...(extraOptions?.skipServerRegistry ? [] : this.validatedProviders),
    ];

    const serverBudgetReached = this.isServerKeyBudgetReached();

    for (const provider of allProviders) {
      if (!provider.enabled) continue;
      if (provider.custom && !provider.probed) continue;
      if (!provider.is_client_supplied && serverBudgetReached) continue;
      if (this.isKilled('provider', provider.provider_id)) continue;

      const kp = this.getKeyPool(provider);

      for (const keyEntry of provider.resolved_keys) {
        const keyKillId = `${provider.provider_id}:${keyEntry.key_id}`;
        if (this.isKilled('key', keyKillId)) continue;

        const keyState = kp.getKeyState(
          provider.provider_id,
          keyEntry.key_id
        );
        if (keyState.state === 'INVALID' || keyState.state === 'DISABLED') {
          continue;
        }

        provider.models.forEach((model, modelIndex) => {
          // RT1: Check capability requirements
          if (requiredCapabilities?.tools && !model.tools) return;
          if (requiredCapabilities?.json && !model.json) return;
          if (requiredCapabilities?.stream && !model.stream) return;

          // RT1: Check model availability for this key
          if (
            !kp.isModelAvailableForKey(
              provider.provider_id,
              keyEntry.key_id,
              model.model_id,
              provider.config_hash
            )
          ) {
            return;
          }

          let preferredScore = 2;
          if (
            extraOptions?.preferredProviderId &&
            provider.provider_id === extraOptions.preferredProviderId
          ) {
            preferredScore =
              extraOptions.preferredModelId &&
              model.model_id === extraOptions.preferredModelId
                ? 0
                : 1;
          }

          candidates.push({
            provider,
            keyEntry,
            model,
            lastUsedAt: keyState.last_used_at,
            modelIndex,
            preferredScore,
          });
        });
      }
    }

    // RT2: Sort by preferredScore ASC, priority ASC, then lastUsedAt ASC (LRU key first), then model order in config
    candidates.sort((a, b) => {
      if (a.preferredScore !== b.preferredScore) {
        return a.preferredScore - b.preferredScore;
      }
      if (a.provider.priority !== b.provider.priority) {
        return a.provider.priority - b.provider.priority;
      }
      if (a.lastUsedAt !== b.lastUsedAt) {
        return a.lastUsedAt - b.lastUsedAt;
      }
      return a.modelIndex - b.modelIndex;
    });

    return candidates;
  }

  /**
   * Executes a non-streaming AI request adhering to Sections 1–17.
   */
  public async generate(req: EngineRequest): Promise<EngineResponse> {
    const requestId = req.requestId || crypto.randomUUID();
    const startMs = this.storage.now();
    const overallDeadlineMs =
      req.overallDeadlineMs ??
      this.activeConfig.global?.overall_deadline_ms ??
      ENGINE_DEFAULTS.OVERALL_DEADLINE_MS;
    const deadlineAt = startMs + overallDeadlineMs;
    const lang = req.language || 'auto';

    const lastUserMsg =
      [...req.messages].reverse().find((m) => m.role === 'user')?.content || '';

    const maxUserChars =
      req.maxUserMessageChars ?? ENGINE_DEFAULTS.MAX_USER_MESSAGE_CHARS;
    if (lastUserMsg.length > maxUserChars) {
      return {
        ok: false,
        requestId,
        text: getSafeUserMessage('message_too_long', lang, lastUserMsg),
        truncated: false,
        messageTooLong: true,
        attempts: [],
      };
    }

    // SEC4: Per-user rate limit check
    const rateCheck = this.storage.checkAndRecordUserRateLimit(req.userId, {
      perMinute: this.activeConfig.global?.user_messages_per_minute,
      perDay: this.activeConfig.global?.user_daily_message_cap,
    });
    if (!rateCheck.allowed) {
      return {
        ok: false,
        requestId,
        text: getSafeUserMessage('busy', lang, lastUserMsg),
        truncated: false,
        busy: true,
        attempts: [],
      };
    }

    const hasAdHoc = Boolean(req.adHocProviders && req.adHocProviders.length > 0);

    // U3 & U2: Check global kill switch and daily spend cap before routing
    if (
      this.isKilled('engine', 'global') ||
      (!hasAdHoc && this.isServerKeyBudgetReached())
    ) {
      return {
        ok: false,
        requestId,
        text: getSafeUserMessage('unavailable', lang, lastUserMsg),
        truncated: false,
        attempts: [],
      };
    }

    // SEC5 & SEC6: Apply prompt injection guard on system message & redact personal data in user messages
    const preparedMessages: CanonicalMessage[] = [];
    let hasSystem = false;
    for (const m of req.messages) {
      if (m.role === 'system') {
        hasSystem = true;
        preparedMessages.push({
          ...m,
          content: buildPromptInjectionGuard(m.content),
        });
      } else if (m.role === 'user') {
        preparedMessages.push({
          ...m,
          content: redactPersonalData(m.content, req.allowPersonalData),
        });
      } else {
        preparedMessages.push({ ...m });
      }
    }
    if (!hasSystem) {
      preparedMessages.unshift({
        role: 'system',
        content: buildPromptInjectionGuard(),
      });
    }

    const candidates = this.buildOrderedCandidates(
      {
        tools:
          Boolean(req.tools && req.tools.length > 0) ||
          req.requiredCapabilities?.tools,
        json: Boolean(req.structuredSchema) || req.requiredCapabilities?.json,
        stream: false,
      },
      {
        adHocProviders: req.adHocProviders,
        preferredProviderId: req.preferredProviderId,
        preferredModelId: req.preferredModelId,
        skipServerRegistry: req.skipServerRegistry,
      }
    );

    const attempts: AttemptRecord[] = [];
    let totalSleptMs = 0;
    let sawMessageTooLong = false;
    let sawSlotBusy = false;

    for (const cand of candidates) {
      if (attempts.length >= ENGINE_DEFAULTS.MAX_ATTEMPTS_PER_REQUEST) break;
      const nowBeforeCand = this.storage.now();
      if (nowBeforeCand >= deadlineAt) break;

      const provider = cand.provider;
      const keyId = cand.keyEntry.key_id;
      const model = cand.model;
      const kp = this.getKeyPool(provider);

      // Re-check kill switches right before attempting (RT3)
      if (
        this.isKilled('engine', 'global') ||
        this.isKilled('provider', provider.provider_id) ||
        this.isKilled('key', `${provider.provider_id}:${keyId}`)
      ) {
        continue;
      }

      if (!provider.is_client_supplied && this.isServerKeyBudgetReached()) {
        continue;
      }

      // Resolve key secret in memory
      const apiKey = this.resolveKeySecretInMemory(
        provider.provider_id,
        cand.keyEntry
      );
      if (!apiKey) {
        continue;
      }

      // Check SSRF on custom providers right before connecting (CP2, I11)
      if (provider.custom) {
        const ssrf = await verifyConnectionTargetSafe(provider.base_url, {
          isCustomProvider: true,
          allowInsecureLocalhost:
            this.allowInsecureLocalhost ||
            process.env.ALLOW_INSECURE_LOCALHOST === 'true',
          dnsLookup: this.dnsLookup,
        });
        if (!ssrf.safe) {
          this.storage.appendAuditLog({
            eventType: 'SSRF_REJECTED_AT_CALL_TIME',
            providerId: provider.provider_id,
            keyId,
            details: { reason: ssrf.reason },
          });
          continue;
        }
      }

      let budgetRatio = 1.0;
      let retriesOnThisCandidate = 0;
      let contextRebuiltOnce = false;
      let structuredRepairUsed = false;
      let workingMessages = [...preparedMessages];
      const effectiveMaxOut = req.maxOutputTokens ?? model.max_output;

      while (attempts.length < ENGINE_DEFAULTS.MAX_ATTEMPTS_PER_REQUEST) {
        const loopNow = this.storage.now();
        const remainingDeadline = deadlineAt - loopNow;
        if (remainingDeadline <= 0) break;

        // C3 & C4: Build context within budget
        const ctxResult = await buildContextWithinBudget({
          messages: workingMessages,
          contextWindow: model.context_window,
          maxOutput: effectiveMaxOut,
          budgetRatio,
        });

        if (ctxResult.messageTooLong) {
          sawMessageTooLong = true;
          break;
        }

        // RT1 & RT3: Re-check key eligibility right before sending
        if (
          !kp.isModelAvailableForKey(
            provider.provider_id,
            keyId,
            model.model_id,
            provider.config_hash
          )
        ) {
          break;
        }

        const elig = kp.acquireEligibilityForAttempt(
          provider.provider_id,
          keyId
        );
        if (!elig.eligible) {
          break;
        }

        // L2: Reserve quota atomically BEFORE sending
        const reservation = this.ledger.reserveQuota({
          requestId,
          providerId: provider.provider_id,
          keyId,
          modelId: model.model_id,
          estimatedInputTokens: ctxResult.estimatedInputTokens,
          maxOutputTokens: effectiveMaxOut,
          limits: {
            rpm: provider.rpm,
            rpd: provider.rpd,
            tpm: provider.tpm,
            tpd: provider.tpd,
            reset_timezone: provider.reset_timezone,
            reset_time: provider.reset_time,
          },
        });

        if (!reservation.allowed || !reservation.reservationId) {
          // L2: Skip candidate silently and move on
          break;
        }

        // Concurrency slot acquisition (wait at most 3 seconds)
        const keyComposite = `${provider.provider_id}:${keyId}`;
        const slotWait = Math.min(
          ENGINE_DEFAULTS.SLOT_WAIT_TIMEOUT_MS,
          Math.max(0, deadlineAt - this.storage.now())
        );
        const releaseSlot = await this.concurrency.acquire(keyComposite, slotWait);
        if (!releaseSlot) {
          sawSlotBusy = true;
          this.ledger.finalizeReservation({
            reservationId: reservation.reservationId,
            actualInputTokens: 0,
            actualOutputTokens: 0,
          });
          break;
        }

        const attemptNo = attempts.length + 1;
        const attemptStartMs = this.storage.now();
        const attemptTimeoutMs = Math.max(
          50,
          Math.min(
            req.perAttemptTimeoutMs ??
              this.activeConfig.global?.per_attempt_timeout_ms ??
              ENGINE_DEFAULTS.PER_ATTEMPT_TIMEOUT_MS,
            deadlineAt - attemptStartMs
          )
        );

        const hdrValidation = validateCustomHeaders(
          provider.allowed_custom_headers
        );

        const protocolReq = buildProtocolRequest({
          protocol: provider.protocol,
          baseUrl: provider.base_url,
          apiKey,
          modelId: model.model_id,
          messages: ctxResult.messages,
          maxOutput: effectiveMaxOut,
          temperature: req.temperature,
          topP: req.topP,
          topK: req.topK,
          stopSequences: req.stopSequences,
          thinkingMode: req.thinkingMode,
          customParams: req.customParams,
          stream: false,
          jsonMode: Boolean(req.structuredSchema),
          tools: req.tools,
          authHeaderName: provider.auth_header_name,
          authHeaderFormat: provider.auth_header_format,
          sanitizedCustomHeaders: hdrValidation.sanitized,
        });

        let httpResp: HttpResponseLike | null = null;
        let transportErr: unknown = null;
        let isLocalTimeout = false;

        try {
          const timeoutSignal = AbortSignal.timeout(attemptTimeoutMs);
          const combinedSignal = req.abortSignal
            ? AbortSignal.any([req.abortSignal, timeoutSignal])
            : timeoutSignal;

          httpResp = await this.httpTransport({
            url: protocolReq.url,
            method: 'POST',
            headers: protocolReq.headers,
            body: JSON.stringify(protocolReq.body),
            signal: combinedSignal,
            redirect: 'manual',
          });
        } catch (err: unknown) {
          transportErr = err;
          const msg = err instanceof Error ? `${err.name} ${err.message}` : String(err);
          if (/TimeoutError|AbortError|timed?\s*out/i.test(msg)) {
            isLocalTimeout = true;
          }
        } finally {
          releaseSlot();
        }

        const latencyMs = Math.max(0, this.storage.now() - attemptStartMs);

        // Check if HTTP 2xx and parseable
        if (
          httpResp &&
          httpResp.status >= 200 &&
          httpResp.status < 300 &&
          !transportErr
        ) {
          const preliminaryCheck = classifyProviderError({
            protocol: provider.protocol,
            httpStatus: httpResp.status,
            rawBody: httpResp.bodyText,
            headers: httpResp.headers,
            nowMs: this.storage.now(),
            providerId: provider.provider_id,
            keyId,
            requestId,
          });

          if (preliminaryCheck.errorClass === 'CONTENT_BLOCKED') {
            this.ledger.finalizeReservation({
              reservationId: reservation.reservationId,
              actualInputTokens: ctxResult.estimatedInputTokens,
              actualOutputTokens: 0,
            });
            this.recordUsageAttempt({
              requestId,
              attemptNo,
              providerId: provider.provider_id,
              keyId,
              model,
              errorClass: 'CONTENT_BLOCKED',
              httpStatus: httpResp.status,
              latencyMs,
              inputTokens: ctxResult.estimatedInputTokens,
              outputTokens: 0,
              tokensEstimated: true,
            });
            attempts.push({
              request_id: requestId,
              attempt_no: attemptNo,
              candidate: {
                provider_id: provider.provider_id,
                key_id: keyId,
                model_id: model.model_id,
              },
              class: 'CONTENT_BLOCKED',
              http_status: httpResp.status,
              latency_ms: latencyMs,
              error_message: preliminaryCheck.redactedMessage,
            });
            // Section 5 & RT3: CONTENT_BLOCKED stops the loop immediately with safe message
            return {
              ok: false,
              requestId,
              text: getSafeUserMessage('content_blocked', lang, lastUserMsg),
              truncated: false,
              contentBlocked: true,
              attempts,
            };
          }

          if (
            preliminaryCheck.errorClass === 'AUTH_INVALID' ||
            preliminaryCheck.errorClass === 'QUOTA_EXHAUSTED' ||
            preliminaryCheck.errorClass === 'MODEL_UNAVAILABLE'
          ) {
            this.applyErrorClassToKeyState({
              classified: preliminaryCheck,
              provider,
              keyId,
              modelId: model.model_id,
            });
            this.ledger.finalizeReservation({
              reservationId: reservation.reservationId,
              actualInputTokens: ctxResult.estimatedInputTokens,
              actualOutputTokens: 0,
            });
            this.recordUsageAttempt({
              requestId,
              attemptNo,
              providerId: provider.provider_id,
              keyId,
              model,
              errorClass: preliminaryCheck.errorClass,
              httpStatus: httpResp.status,
              latencyMs,
              inputTokens: ctxResult.estimatedInputTokens,
              outputTokens: 0,
              tokensEstimated: true,
            });
            attempts.push({
              request_id: requestId,
              attempt_no: attemptNo,
              candidate: {
                provider_id: provider.provider_id,
                key_id: keyId,
                model_id: model.model_id,
              },
              class: preliminaryCheck.errorClass,
              http_status: httpResp.status,
              latency_ms: latencyMs,
              error_message: preliminaryCheck.redactedMessage,
            });
            break;
          }

          if (preliminaryCheck.errorClass === 'BAD_RESPONSE') {
            kp.recordSuccess(provider.provider_id, keyId);
            this.ledger.finalizeReservation({
              reservationId: reservation.reservationId,
              actualInputTokens: ctxResult.estimatedInputTokens,
              actualOutputTokens: 0,
            });
            this.recordUsageAttempt({
              requestId,
              attemptNo,
              providerId: provider.provider_id,
              keyId,
              model,
              errorClass: 'BAD_RESPONSE',
              httpStatus: httpResp.status,
              latencyMs,
              inputTokens: ctxResult.estimatedInputTokens,
              outputTokens: 0,
              tokensEstimated: true,
            });
            attempts.push({
              request_id: requestId,
              attempt_no: attemptNo,
              candidate: {
                provider_id: provider.provider_id,
                key_id: keyId,
                model_id: model.model_id,
              },
              class: 'BAD_RESPONSE',
              http_status: httpResp.status,
              latency_ms: latencyMs,
              error_message:
                preliminaryCheck.redactedMessage ||
                redactSecrets(httpResp.bodyText.slice(0, 200), [apiKey]),
            });
            break; // Fallback to next candidate
          }

          const rawJson = JSON.parse(httpResp.bodyText) as Record<string, unknown>;
          const parsedResp = parseProtocolResponse(provider.protocol, rawJson);
          const estOutTokens = estimateTokens(parsedResp.text);
          const finalizedUsage = this.ledger.finalizeReservation({
            reservationId: reservation.reservationId,
            actualInputTokens: parsedResp.inputTokens,
            actualOutputTokens: parsedResp.outputTokens,
          });

          // Handle tool calls if present (Section 11: T2, T3, OV5)
          if (
            parsedResp.toolCalls.length > 0 &&
            req.tools &&
            req.tools.length > 0
          ) {
            kp.recordSuccess(provider.provider_id, keyId);
            if (!provider.is_client_supplied) {
              this.storage.incrementServerKeyDailyCount();
            }
            this.recordUsageAttempt({
              requestId,
              attemptNo,
              providerId: provider.provider_id,
              keyId,
              model,
              errorClass: 'SUCCESS',
              httpStatus: httpResp.status,
              latencyMs,
              inputTokens:
                parsedResp.inputTokens ?? ctxResult.estimatedInputTokens,
              outputTokens: parsedResp.outputTokens ?? estOutTokens,
              tokensEstimated: finalizedUsage.estimated,
            });
            attempts.push({
              request_id: requestId,
              attempt_no: attemptNo,
              candidate: {
                provider_id: provider.provider_id,
                key_id: keyId,
                model_id: model.model_id,
              },
              class: 'SUCCESS',
              http_status: httpResp.status,
              latency_ms: latencyMs,
            });

            const toolLoopRes = await this.executeToolCallLoop({
              requestId,
              userId: req.userId,
              conversationId: req.conversationId || 'default',
              initialMessages: ctxResult.messages,
              initialAssistantText: parsedResp.text,
              initialToolCalls: parsedResp.toolCalls,
              tools: req.tools,
              provider,
              keyId,
              apiKey,
              model,
              deadlineAt,
              attempts,
              lang,
              lastUserMsg,
            });
            return toolLoopRes;
          }

          // OV1: Structured output validation & 1 repair attempt on same candidate if ledger allows
          if (req.structuredSchema) {
            const structVal = validateStructuredOutput(
              parsedResp.text,
              req.structuredSchema
            );
            if (!structVal.valid) {
              kp.recordSuccess(provider.provider_id, keyId);
              this.recordUsageAttempt({
                requestId,
                attemptNo,
                providerId: provider.provider_id,
                keyId,
                model,
                errorClass: 'BAD_RESPONSE',
                httpStatus: httpResp.status,
                latencyMs,
                inputTokens:
                  parsedResp.inputTokens ?? ctxResult.estimatedInputTokens,
                outputTokens: parsedResp.outputTokens ?? estOutTokens,
                tokensEstimated: finalizedUsage.estimated,
              });
              attempts.push({
                request_id: requestId,
                attempt_no: attemptNo,
                candidate: {
                  provider_id: provider.provider_id,
                  key_id: keyId,
                  model_id: model.model_id,
                },
                class: 'BAD_RESPONSE',
                http_status: httpResp.status,
                latency_ms: latencyMs,
              });

              if (
                !structuredRepairUsed &&
                attempts.length < ENGINE_DEFAULTS.MAX_ATTEMPTS_PER_REQUEST &&
                deadlineAt - this.storage.now() > 1_000
              ) {
                structuredRepairUsed = true;
                workingMessages = [
                  ...workingMessages,
                  { role: 'assistant', content: parsedResp.text },
                  {
                    role: 'user',
                    content: `Repair your JSON response to strictly match the required schema. Validation error: ${structVal.error}`,
                  },
                ];
                continue;
              }
              break; // Move on to next candidate
            }

            kp.recordSuccess(provider.provider_id, keyId);
            if (!provider.is_client_supplied) {
              this.storage.incrementServerKeyDailyCount();
            }
            this.recordUsageAttempt({
              requestId,
              attemptNo,
              providerId: provider.provider_id,
              keyId,
              model,
              errorClass: 'SUCCESS',
              httpStatus: httpResp.status,
              latencyMs,
              inputTokens:
                parsedResp.inputTokens ?? ctxResult.estimatedInputTokens,
              outputTokens: parsedResp.outputTokens ?? estOutTokens,
              tokensEstimated: finalizedUsage.estimated,
            });
            attempts.push({
              request_id: requestId,
              attempt_no: attemptNo,
              candidate: {
                provider_id: provider.provider_id,
                key_id: keyId,
                model_id: model.model_id,
              },
              class: 'SUCCESS',
              http_status: httpResp.status,
              latency_ms: latencyMs,
            });

            return {
              ok: true,
              requestId,
              text: sanitizeModelTextOutput(parsedResp.text, [apiKey]),
              structuredData: structVal.data,
              truncated: parsedResp.stopReason === 'length',
              providerUsed: provider.provider_id,
              modelUsed: model.model_id,
              modelId: model.model_id,
              attempts,
            };
          }

          // OV2, OV3, OV4: Text output validation
          const textVal = validateTextOutput({
            rawText: parsedResp.text,
            stopReason: parsedResp.stopReason,
            language: lang,
            extraSecrets: [apiKey],
          });

          if (!textVal.valid) {
            kp.recordSuccess(provider.provider_id, keyId);
            this.recordUsageAttempt({
              requestId,
              attemptNo,
              providerId: provider.provider_id,
              keyId,
              model,
              errorClass: 'BAD_RESPONSE',
              httpStatus: httpResp.status,
              latencyMs,
              inputTokens:
                parsedResp.inputTokens ?? ctxResult.estimatedInputTokens,
              outputTokens: parsedResp.outputTokens ?? 0,
              tokensEstimated: finalizedUsage.estimated,
            });
            attempts.push({
              request_id: requestId,
              attempt_no: attemptNo,
              candidate: {
                provider_id: provider.provider_id,
                key_id: keyId,
                model_id: model.model_id,
              },
              class: 'BAD_RESPONSE',
              http_status: httpResp.status,
              latency_ms: latencyMs,
              error_message: 'Empty text content returned by upstream model',
            });
            break;
          }

          kp.recordSuccess(provider.provider_id, keyId);
          if (!provider.is_client_supplied) {
            this.storage.incrementServerKeyDailyCount();
          }
          this.recordUsageAttempt({
            requestId,
            attemptNo,
            providerId: provider.provider_id,
            keyId,
            model,
            errorClass: 'SUCCESS',
            httpStatus: httpResp.status,
            latencyMs,
            inputTokens:
              parsedResp.inputTokens ?? ctxResult.estimatedInputTokens,
            outputTokens: parsedResp.outputTokens ?? estOutTokens,
            tokensEstimated: finalizedUsage.estimated,
          });
          attempts.push({
            request_id: requestId,
            attempt_no: attemptNo,
            candidate: {
              provider_id: provider.provider_id,
              key_id: keyId,
              model_id: model.model_id,
            },
            class: 'SUCCESS',
            http_status: httpResp.status,
            latency_ms: latencyMs,
          });

          return {
            ok: true,
            requestId,
            text: textVal.text,
            truncated: textVal.truncated,
            providerUsed: provider.provider_id,
            providerId: provider.provider_id,
            modelUsed: model.model_id,
            modelId: model.model_id,
            attempts,
          };
        }

        // Non-2xx or network/timeout error -> Classify (Section 5)
        const classified = classifyProviderError({
          protocol: provider.protocol,
          httpStatus: httpResp?.status ?? null,
          rawBody: httpResp?.bodyText,
          headers: httpResp?.headers,
          networkError: transportErr,
          isLocalTimeout,
          nowMs: this.storage.now(),
          providerId: provider.provider_id,
          keyId,
          requestId,
          logger: (entry) => {
            this.storage.appendAuditLog({
              eventType: 'CLASSIFIED_PROVIDER_ERROR',
              providerId: provider.provider_id,
              keyId,
              details: entry,
            });
          },
        });

        this.ledger.finalizeReservation({
          reservationId: reservation.reservationId,
          actualInputTokens: ctxResult.estimatedInputTokens,
          actualOutputTokens: 0,
        });

        this.recordUsageAttempt({
          requestId,
          attemptNo,
          providerId: provider.provider_id,
          keyId,
          model,
          errorClass: classified.errorClass,
          httpStatus: classified.httpStatus,
          latencyMs,
          inputTokens: ctxResult.estimatedInputTokens,
          outputTokens: 0,
          tokensEstimated: true,
        });

        attempts.push({
          request_id: requestId,
          attempt_no: attemptNo,
          candidate: {
            provider_id: provider.provider_id,
            key_id: keyId,
            model_id: model.model_id,
          },
          class: classified.errorClass,
          http_status: classified.httpStatus,
          latency_ms: latencyMs,
          error_message: classified.redactedMessage,
        });

        // Update key state based on error class (Section 4 & 5)
        this.applyErrorClassToKeyState({
          classified,
          provider,
          keyId,
          modelId: model.model_id,
        });

        // Stop immediately on CONTENT_BLOCKED, or on BAD_REQUEST when no other client-supplied model candidates remain (RT3)
        if (classified.errorClass === 'CONTENT_BLOCKED') {
          this.storage.appendAuditLog({
            eventType: 'ALERT_NON_RETRYABLE_ERROR',
            providerId: provider.provider_id,
            keyId,
            details: {
              request_id: requestId,
              error_class: classified.errorClass,
              attempts,
            },
          });
          return {
            ok: false,
            requestId,
            text: getSafeUserMessage('content_blocked', lang, lastUserMsg),
            truncated: false,
            contentBlocked: true,
            attempts,
          };
        }

        if (classified.errorClass === 'BAD_REQUEST') {
          if (provider.is_client_supplied && candidates.length > 1) {
            kp.markModelUnavailableForKey({
              providerId: provider.provider_id,
              keyId,
              modelId: model.model_id,
              durationMs: ENGINE_DEFAULTS.PERMISSION_DENIED_UNAVAILABLE_MS,
              reason: 'bad_request_model_fallback',
            });
            break;
          }
          this.storage.appendAuditLog({
            eventType: 'ALERT_NON_RETRYABLE_ERROR',
            providerId: provider.provider_id,
            keyId,
            details: {
              request_id: requestId,
              error_class: classified.errorClass,
              attempts,
            },
          });
          const actionableErr = formatActionableProviderError(
            attempts,
            lang,
            lastUserMsg
          );
          return {
            ok: false,
            requestId,
            text: actionableErr,
            userMessage: actionableErr,
            truncated: false,
            contentBlocked: false,
            attempts,
          };
        }

        // Section 5: CONTEXT_TOO_LONG -> rebuild context at 70% of budget, retry once on same candidate; then fallback
        if (
          classified.errorClass === 'CONTEXT_TOO_LONG' &&
          !contextRebuiltOnce &&
          attempts.length < ENGINE_DEFAULTS.MAX_ATTEMPTS_PER_REQUEST
        ) {
          contextRebuiltOnce = true;
          budgetRatio = ENGINE_DEFAULTS.CONTEXT_TOO_LONG_REBUILD_RATIO;
          continue;
        }

        // RT3 & Section 1: On a transient error, retry the same candidate once if at least 10s of deadline remain
        const remainingNow = deadlineAt - this.storage.now();
        if (
          classified.transient &&
          retriesOnThisCandidate < ENGINE_DEFAULTS.MAX_RETRIES_SAME_CANDIDATE &&
          remainingNow >= ENGINE_DEFAULTS.MIN_DEADLINE_FOR_RETRY_MS &&
          attempts.length < ENGINE_DEFAULTS.MAX_ATTEMPTS_PER_REQUEST
        ) {
          // Only retry on same candidate if circuit did not open
          const postFailState = kp.getKeyState(
            provider.provider_id,
            keyId
          );
          if (postFailState.state === 'ACTIVE') {
            const sleepBudget =
              ENGINE_DEFAULTS.MAX_SLEEP_PER_REQUEST_MS - totalSleptMs;
            const sleepMs = computeFullJitterBackoffMs(
              retriesOnThisCandidate,
              sleepBudget
            );
            if (sleepMs > 0 && deadlineAt - this.storage.now() - sleepMs >= ENGINE_DEFAULTS.MIN_DEADLINE_FOR_RETRY_MS) {
              await this.sleepFn(sleepMs);
              totalSleptMs += sleepMs;
            }
            retriesOnThisCandidate += 1;
            continue;
          }
        }

        // Move to the next candidate
        break;
      }
    }

    if (sawMessageTooLong && attempts.length === 0) {
      return {
        ok: false,
        requestId,
        text: getSafeUserMessage('message_too_long', lang, lastUserMsg),
        truncated: false,
        messageTooLong: true,
        attempts,
      };
    }

    if (sawSlotBusy && attempts.length === 0) {
      return {
        ok: false,
        requestId,
        text: getSafeUserMessage('busy', lang, lastUserMsg),
        truncated: false,
        busy: true,
        attempts,
      };
    }

    // RT4: Log an alert containing the attempt list and return actionable error
    this.storage.appendAuditLog({
      eventType: 'ALERT_ALL_CANDIDATES_FAILED',
      details: {
        request_id: requestId,
        attempts,
      },
    });

    const actionableErr = formatActionableProviderError(
      attempts,
      lang,
      lastUserMsg
    );

    return {
      ok: false,
      requestId,
      text: actionableErr,
      userMessage: actionableErr,
      truncated: false,
      attempts,
    };
  }

  /**
   * Section 11 (T2, OV5): Handles multi-step tool execution & model repair (max 5 iterations, max 8 tool calls per turn).
   */
  private async executeToolCallLoop(params: {
    requestId: string;
    userId: string;
    conversationId: string;
    initialMessages: CanonicalMessage[];
    initialAssistantText: string;
    initialToolCalls: CanonicalToolCall[];
    tools: ToolDefinition[];
    provider: ValidatedProvider;
    keyId: string;
    apiKey: string;
    model: ModelConfig;
    deadlineAt: number;
    attempts: AttemptRecord[];
    lang: 'bn' | 'en' | 'auto';
    lastUserMsg: string;
  }): Promise<EngineResponse> {
    const turnCache = new Map<string, string>();
    const pendingActions: NonNullable<EngineResponse['pendingActions']> = [];
    const messages: CanonicalMessage[] = [...params.initialMessages];

    let currentToolCalls = params.initialToolCalls;
    let currentAssistantText = params.initialAssistantText;
    let totalToolCallsInTurn = 0;
    let repairCount = 0;

    for (
      let iter = 0;
      iter < ENGINE_DEFAULTS.MAX_TOOL_ITERATIONS_PER_TURN;
      iter++
    ) {
      if (currentToolCalls.length === 0) break;

      messages.push({
        role: 'assistant',
        content: currentAssistantText || '',
        tool_calls: currentToolCalls,
      });

      let hadValidationError = false;

      for (const tc of currentToolCalls) {
        totalToolCallsInTurn += 1;
        if (totalToolCallsInTurn > ENGINE_DEFAULTS.MAX_TOOL_CALLS_PER_TURN) {
          return {
            ok: false,
            requestId: params.requestId,
            text: getSafeUserMessage('unavailable', params.lang, params.lastUserMsg),
            truncated: false,
            pendingActions,
            attempts: params.attempts,
          };
        }

        const propRes = await this.toolsEngine.handleToolProposal({
          toolName: tc.name,
          rawArgumentsJson: tc.argumentsJson,
          userId: params.userId,
          conversationId: params.conversationId,
          turnCache,
        });

        if (propRes.validationError) {
          hadValidationError = true;
        }
        if (propRes.pendingAction) {
          pendingActions.push(propRes.pendingAction);
        }

        messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          name: tc.name,
          content: propRes.wrappedOutput,
        });
      }

      // OV5: An invalid tool call returns a tool error to the model, which may repair it at most twice. After that the step fails.
      if (hadValidationError) {
        repairCount += 1;
        if (repairCount > ENGINE_DEFAULTS.MAX_TOOL_REPAIR_ATTEMPTS) {
          return {
            ok: false,
            requestId: params.requestId,
            text: getSafeUserMessage('unavailable', params.lang, params.lastUserMsg),
            truncated: false,
            pendingActions,
            attempts: params.attempts,
          };
        }
      }

      if (this.storage.now() >= params.deadlineAt) break;

      const estIn = messages.reduce(
        (s, m) => s + estimateTokens(m.content || ''),
        0
      );
      const reservation = this.ledger.reserveQuota({
        requestId: params.requestId,
        providerId: params.provider.provider_id,
        keyId: params.keyId,
        modelId: params.model.model_id,
        estimatedInputTokens: estIn,
        maxOutputTokens: params.model.max_output,
        limits: {
          rpm: params.provider.rpm,
          rpd: params.provider.rpd,
          tpm: params.provider.tpm,
          tpd: params.provider.tpd,
          reset_timezone: params.provider.reset_timezone,
          reset_time: params.provider.reset_time,
        },
      });

      if (!reservation.allowed || !reservation.reservationId) {
        break;
      }

      const attemptNo = params.attempts.length + 1;
      const t0 = this.storage.now();
      const timeoutMs = Math.max(
        50,
        Math.min(
          ENGINE_DEFAULTS.PER_ATTEMPT_TIMEOUT_MS,
          params.deadlineAt - t0
        )
      );

      const protocolReq = buildProtocolRequest({
        protocol: params.provider.protocol,
        baseUrl: params.provider.base_url,
        apiKey: params.apiKey,
        modelId: params.model.model_id,
        messages,
        maxOutput: params.model.max_output,
        stream: false,
        tools: params.tools,
      });

      const resp = await this.httpTransport({
        url: protocolReq.url,
        method: 'POST',
        headers: protocolReq.headers,
        body: JSON.stringify(protocolReq.body),
        signal: AbortSignal.timeout(timeoutMs),
        redirect: 'manual',
      });

      const latencyMs = Math.max(0, this.storage.now() - t0);
      if (resp.status < 200 || resp.status >= 300) {
        this.ledger.finalizeReservation({
          reservationId: reservation.reservationId,
          actualInputTokens: estIn,
          actualOutputTokens: 0,
        });
        this.recordUsageAttempt({
          requestId: params.requestId,
          attemptNo,
          providerId: params.provider.provider_id,
          keyId: params.keyId,
          model: params.model,
          errorClass: 'SERVER_ERROR',
          httpStatus: resp.status,
          latencyMs,
          inputTokens: estIn,
          outputTokens: 0,
          tokensEstimated: true,
        });
        params.attempts.push({
          request_id: params.requestId,
          attempt_no: attemptNo,
          candidate: {
            provider_id: params.provider.provider_id,
            key_id: params.keyId,
            model_id: params.model.model_id,
          },
          class: 'SERVER_ERROR',
          http_status: resp.status,
          latency_ms: latencyMs,
        });
        break;
      }

      const parsed = parseProtocolResponse(
        params.provider.protocol,
        JSON.parse(resp.bodyText) as Record<string, unknown>
      );
      const fin = this.ledger.finalizeReservation({
        reservationId: reservation.reservationId,
        actualInputTokens: parsed.inputTokens,
        actualOutputTokens: parsed.outputTokens,
      });

      this.recordUsageAttempt({
        requestId: params.requestId,
        attemptNo,
        providerId: params.provider.provider_id,
        keyId: params.keyId,
        model: params.model,
        errorClass: 'SUCCESS',
        httpStatus: resp.status,
        latencyMs,
        inputTokens: parsed.inputTokens ?? estIn,
        outputTokens: parsed.outputTokens ?? estimateTokens(parsed.text),
        tokensEstimated: fin.estimated,
      });
      params.attempts.push({
        request_id: params.requestId,
        attempt_no: attemptNo,
        candidate: {
          provider_id: params.provider.provider_id,
          key_id: params.keyId,
          model_id: params.model.model_id,
        },
        class: 'SUCCESS',
        http_status: resp.status,
        latency_ms: latencyMs,
      });

      currentAssistantText = parsed.text;
      currentToolCalls = parsed.toolCalls;
      if (currentToolCalls.length === 0) {
        const cleanText = sanitizeModelTextOutput(currentAssistantText, [
          params.apiKey,
        ]);
        return {
          ok: true,
          requestId: params.requestId,
          text: cleanText,
          truncated: parsed.stopReason === 'length',
          providerUsed: params.provider.provider_id,
          modelUsed: params.model.model_id,
          pendingActions,
          attempts: params.attempts,
        };
      }
    }

    return {
      ok: Boolean(currentAssistantText.trim() || pendingActions.length > 0),
      requestId: params.requestId,
      text: sanitizeModelTextOutput(
        currentAssistantText ||
          (pendingActions.length > 0
            ? pendingActions.map((p) => p.previewText).join('\n')
            : getSafeUserMessage('unavailable', params.lang, params.lastUserMsg)),
        [params.apiKey]
      ),
      truncated: false,
      providerUsed: params.provider.provider_id,
      modelUsed: params.model.model_id,
      pendingActions,
      attempts: params.attempts,
    };
  }

  /**
   * Section 9 (S1 - S5): Streaming execution with:
   * - S1 & I5: Fallback allowed ONLY before the first byte/token reaches the client (or within allowResetUnderChars if configured).
   * - S2: First token within 12 seconds; each next chunk within 15 seconds.
   * - S3: After output has started beyond reset threshold, any failure ends the stream with an explicit error event (no provider switch mid-answer).
   * - S4: Client disconnect aborts upstream, does NOT change key state, and records one usage record with estimated tokens.
   * - S5 & I10: Stored assistant message is marked 'complete' only when stream ends normally; otherwise 'interrupted'.
   */
  public async stream(
    req: EngineRequest,
    callbacks: {
      onToken: (token: string) => void;
      onReset?: () => void;
      onErrorEvent?: (safeMessage: string) => void;
      onComplete?: (finalText: string) => void;
    }
  ): Promise<{
    ok: boolean;
    messageId: string;
    status: 'complete' | 'interrupted' | 'failed';
    text: string;
    providerUsed?: string;
    providerId?: string;
    modelUsed?: string;
    modelId?: string;
    attempts: AttemptRecord[];
  }> {
    const requestId = req.requestId || crypto.randomUUID();
    const messageId = crypto.randomUUID();
    const conversationId = req.conversationId || 'default';
    const lang = req.language || 'auto';
    const allowResetUnderChars = req.allowResetUnderChars ?? 0;
    const lastUserMsg =
      [...req.messages].reverse().find((m) => m.role === 'user')?.content || '';

    const nowInit = this.storage.now();
    // Create initial stored message row marked as 'interrupted' until stream completes normally (S5, I10)
    this.storage.db
      .prepare(
        `INSERT INTO ai_stored_messages
         (message_id, conversation_id, user_id, role, content, status, created_at, updated_at)
         VALUES (?, ?, ?, 'assistant', '', 'interrupted', ?, ?)`
      )
      .run(messageId, conversationId, req.userId, nowInit, nowInit);

    const updateStoredMessage = (
      content: string,
      status: 'complete' | 'interrupted'
    ) => {
      this.storage.db
        .prepare(
          `UPDATE ai_stored_messages
           SET content = ?, status = ?, updated_at = ?
           WHERE message_id = ?`
        )
        .run(content, status, this.storage.now(), messageId);
    };

    const maxUserChars =
      req.maxUserMessageChars ?? ENGINE_DEFAULTS.MAX_USER_MESSAGE_CHARS;
    if (lastUserMsg.length > maxUserChars) {
      const msg = getSafeUserMessage('message_too_long', lang, lastUserMsg);
      callbacks.onErrorEvent?.(msg);
      return { ok: false, messageId, status: 'failed', text: msg, attempts: [] };
    }

    const candidates = this.buildOrderedCandidates(
      {
        stream: true,
        tools: req.requiredCapabilities?.tools,
        json: req.requiredCapabilities?.json,
      },
      {
        adHocProviders: req.adHocProviders,
        preferredProviderId: req.preferredProviderId,
        preferredModelId: req.preferredModelId,
        skipServerRegistry: req.skipServerRegistry,
      }
    );

    const attempts: AttemptRecord[] = [];
    let firstTokenEmitted = false;
    let lockedToProvider = false;
    let accumulatedText = '';

    for (const cand of candidates) {
      if (attempts.length >= ENGINE_DEFAULTS.MAX_ATTEMPTS_PER_REQUEST) break;
      // S1 & I5: Never switch providers after output has locked to provider!
      if (lockedToProvider) break;

      const provider = cand.provider;
      const keyId = cand.keyEntry.key_id;
      const model = cand.model;
      const kp = this.getKeyPool(provider);
      const effectiveMaxOut = req.maxOutputTokens ?? model.max_output;

      if (!provider.is_client_supplied && this.isServerKeyBudgetReached()) {
        continue;
      }

      const apiKey = this.resolveKeySecretInMemory(
        provider.provider_id,
        cand.keyEntry
      );
      if (!apiKey) continue;

      const ctxResult = await buildContextWithinBudget({
        messages: req.messages,
        contextWindow: model.context_window,
        maxOutput: effectiveMaxOut,
      });
      if (ctxResult.messageTooLong) continue;

      const elig = kp.acquireEligibilityForAttempt(
        provider.provider_id,
        keyId
      );
      if (!elig.eligible) continue;

      const reservation = this.ledger.reserveQuota({
        requestId,
        providerId: provider.provider_id,
        keyId,
        modelId: model.model_id,
        estimatedInputTokens: ctxResult.estimatedInputTokens,
        maxOutputTokens: effectiveMaxOut,
        limits: {
          rpm: provider.rpm,
          rpd: provider.rpd,
          tpm: provider.tpm,
          tpd: provider.tpd,
          reset_timezone: provider.reset_timezone,
          reset_time: provider.reset_time,
        },
      });
      if (!reservation.allowed || !reservation.reservationId) continue;

      const keyComposite = `${provider.provider_id}:${keyId}`;
      const releaseSlot = await this.concurrency.acquire(keyComposite);
      if (!releaseSlot) {
        this.ledger.finalizeReservation({
          reservationId: reservation.reservationId,
          actualInputTokens: 0,
          actualOutputTokens: 0,
        });
        continue;
      }

      const attemptNo = attempts.length + 1;
      const attemptStart = this.storage.now();
      const upstreamAbort = new AbortController();
      firstTokenEmitted = false;
      accumulatedText = '';

      // S2: First token within 12 seconds
      let firstTokenTimer: ReturnType<typeof setTimeout> | null = setTimeout(
        () => {
          if (!firstTokenEmitted && !upstreamAbort.signal.aborted) {
            upstreamAbort.abort(new Error('FirstTokenTimeoutError'));
          }
        },
        ENGINE_DEFAULTS.STREAM_FIRST_TOKEN_TIMEOUT_MS
      );

      let nextChunkTimer: ReturnType<typeof setTimeout> | null = null;
      const resetNextChunkTimer = () => {
        if (nextChunkTimer) clearTimeout(nextChunkTimer);
        nextChunkTimer = setTimeout(() => {
          if (!upstreamAbort.signal.aborted) {
            upstreamAbort.abort(new Error('NextChunkTimeoutError'));
          }
        }, ENGINE_DEFAULTS.STREAM_NEXT_CHUNK_TIMEOUT_MS);
      };

      const onClientAbort = () => {
        if (!upstreamAbort.signal.aborted) {
          upstreamAbort.abort(new Error('ClientDisconnectAbort'));
        }
      };
      req.abortSignal?.addEventListener('abort', onClientAbort, { once: true });

      const hdrValidation = validateCustomHeaders(
        provider.allowed_custom_headers
      );

      const protocolReq = buildProtocolRequest({
        protocol: provider.protocol,
        baseUrl: provider.base_url,
        apiKey,
        modelId: model.model_id,
        messages: ctxResult.messages,
        maxOutput: effectiveMaxOut,
        temperature: req.temperature,
        topP: req.topP,
        topK: req.topK,
        stopSequences: req.stopSequences,
        thinkingMode: req.thinkingMode,
        customParams: req.customParams,
        stream: true,
        authHeaderName: provider.auth_header_name,
        authHeaderFormat: provider.auth_header_format,
        sanitizedCustomHeaders: hdrValidation.sanitized,
      });

      try {
        const resp = await this.httpTransport({
          url: protocolReq.url,
          method: 'POST',
          headers: protocolReq.headers,
          body: JSON.stringify(protocolReq.body),
          signal: upstreamAbort.signal,
          redirect: 'manual',
        });

        if (resp.status < 200 || resp.status >= 300 || !resp.streamChunks) {
          if (firstTokenTimer) clearTimeout(firstTokenTimer);
          const latencyMs = Math.max(0, this.storage.now() - attemptStart);
          const classified = classifyProviderError({
            protocol: provider.protocol,
            httpStatus: resp.status,
            rawBody: resp.bodyText,
            headers: resp.headers,
            providerId: provider.provider_id,
            keyId,
            requestId,
            logger: (entry) => {
              this.storage.appendAuditLog({
                eventType: 'CLASSIFIED_PROVIDER_ERROR',
                providerId: provider.provider_id,
                keyId,
                details: entry,
              });
            },
          });

          this.applyErrorClassToKeyState({
            classified,
            provider,
            keyId,
            modelId: model.model_id,
          });
          this.ledger.finalizeReservation({
            reservationId: reservation.reservationId,
            actualInputTokens: ctxResult.estimatedInputTokens,
            actualOutputTokens: 0,
          });
          this.recordUsageAttempt({
            requestId,
            attemptNo,
            providerId: provider.provider_id,
            keyId,
            model,
            errorClass: classified.errorClass,
            httpStatus: resp.status,
            latencyMs,
            inputTokens: ctxResult.estimatedInputTokens,
            outputTokens: 0,
            tokensEstimated: true,
          });
          attempts.push({
            request_id: requestId,
            attempt_no: attemptNo,
            candidate: {
              provider_id: provider.provider_id,
              key_id: keyId,
              model_id: model.model_id,
            },
            class: classified.errorClass,
            http_status: resp.status,
            latency_ms: latencyMs,
            error_message: classified.redactedMessage,
          });
          continue; // S1: No token emitted yet, so fallback to next candidate is allowed
        }

        for await (const rawChunk of resp.streamChunks) {
          if (req.abortSignal?.aborted) {
            throw new Error('ClientDisconnectAbort');
          }
          const cleanToken = sanitizeModelTextOutput(rawChunk, [apiKey]);
          if (cleanToken) {
            if (!firstTokenEmitted) {
              firstTokenEmitted = true;
              if (firstTokenTimer) {
                clearTimeout(firstTokenTimer);
                firstTokenTimer = null;
              }
            }
            resetNextChunkTimer();
            accumulatedText += cleanToken;
            if (accumulatedText.length > allowResetUnderChars) {
              lockedToProvider = true;
            }
            updateStoredMessage(accumulatedText, 'interrupted');
            callbacks.onToken(cleanToken);
          }
        }

        if (firstTokenTimer) clearTimeout(firstTokenTimer);
        if (nextChunkTimer) clearTimeout(nextChunkTimer);

        if (!firstTokenEmitted) {
          // Empty stream with 0 tokens -> BAD_RESPONSE, fallback allowed
          const latencyMs = Math.max(0, this.storage.now() - attemptStart);
          this.ledger.finalizeReservation({
            reservationId: reservation.reservationId,
            actualInputTokens: ctxResult.estimatedInputTokens,
            actualOutputTokens: 0,
          });
          this.recordUsageAttempt({
            requestId,
            attemptNo,
            providerId: provider.provider_id,
            keyId,
            model,
            errorClass: 'BAD_RESPONSE',
            httpStatus: resp.status,
            latencyMs,
            inputTokens: ctxResult.estimatedInputTokens,
            outputTokens: 0,
            tokensEstimated: true,
          });
          attempts.push({
            request_id: requestId,
            attempt_no: attemptNo,
            candidate: {
              provider_id: provider.provider_id,
              key_id: keyId,
              model_id: model.model_id,
            },
            class: 'BAD_RESPONSE',
            http_status: resp.status,
            latency_ms: latencyMs,
            error_message: 'SSE stream closed with 0 tokens emitted',
          });
          continue;
        }

        // Stream completed normally (S5)
        const latencyMs = Math.max(0, this.storage.now() - attemptStart);
        const estOut = estimateTokens(accumulatedText);
        kp.recordSuccess(provider.provider_id, keyId);
        if (!provider.is_client_supplied) {
          this.storage.incrementServerKeyDailyCount();
        }
        this.ledger.finalizeReservation({
          reservationId: reservation.reservationId,
          actualInputTokens: null,
          actualOutputTokens: null,
        });
        this.recordUsageAttempt({
          requestId,
          attemptNo,
          providerId: provider.provider_id,
          keyId,
          model,
          errorClass: 'SUCCESS',
          httpStatus: resp.status,
          latencyMs,
          inputTokens: ctxResult.estimatedInputTokens,
          outputTokens: estOut,
          tokensEstimated: true,
        });
        attempts.push({
          request_id: requestId,
          attempt_no: attemptNo,
          candidate: {
            provider_id: provider.provider_id,
            key_id: keyId,
            model_id: model.model_id,
          },
          class: 'SUCCESS',
          http_status: resp.status,
          latency_ms: latencyMs,
        });

        updateStoredMessage(accumulatedText, 'complete');
        callbacks.onComplete?.(accumulatedText);
        return {
          ok: true,
          messageId,
          status: 'complete',
          text: accumulatedText,
          providerUsed: provider.provider_id,
          providerId: provider.provider_id,
          modelUsed: model.model_id,
          modelId: model.model_id,
          attempts,
        };
      } catch (streamErr: unknown) {
        if (firstTokenTimer) clearTimeout(firstTokenTimer);
        if (nextChunkTimer) clearTimeout(nextChunkTimer);
        const latencyMs = Math.max(0, this.storage.now() - attemptStart);
        const estOut = estimateTokens(accumulatedText);
        const errMsg =
          streamErr instanceof Error ? streamErr.message : String(streamErr);

        // S4: Client disconnect aborts upstream request, is NOT a provider failure, must NOT change key state,
        // and still gets one usage record with estimated tokens.
        if (req.abortSignal?.aborted || /ClientDisconnectAbort/i.test(errMsg)) {
          this.ledger.finalizeReservation({
            reservationId: reservation.reservationId,
            actualInputTokens: null,
            actualOutputTokens: null,
          });
          this.recordUsageAttempt({
            requestId,
            attemptNo,
            providerId: provider.provider_id,
            keyId,
            model,
            errorClass: 'CLIENT_ABORT',
            httpStatus: null,
            latencyMs,
            inputTokens: ctxResult.estimatedInputTokens,
            outputTokens: estOut,
            tokensEstimated: true,
          });
          attempts.push({
            request_id: requestId,
            attempt_no: attemptNo,
            candidate: {
              provider_id: provider.provider_id,
              key_id: keyId,
              model_id: model.model_id,
            },
            class: 'CLIENT_ABORT',
            http_status: null,
            latency_ms: latencyMs,
          });
          updateStoredMessage(accumulatedText, 'interrupted');
          return {
            ok: false,
            messageId,
            status: 'interrupted',
            text: accumulatedText,
            attempts,
          };
        }

        // Provider timeout or mid-stream error
        const isTimeout = /FirstTokenTimeoutError|NextChunkTimeoutError|TimeoutError|AbortError/i.test(
          errMsg
        );
        const errorClass: ErrorClass = isTimeout ? 'TIMEOUT' : 'NETWORK_ERROR';
        kp.recordTransientFailure(
          provider.provider_id,
          keyId,
          errorClass
        );
        this.ledger.finalizeReservation({
          reservationId: reservation.reservationId,
          actualInputTokens: null,
          actualOutputTokens: null,
        });
        this.recordUsageAttempt({
          requestId,
          attemptNo,
          providerId: provider.provider_id,
          keyId,
          model,
          errorClass,
          httpStatus: null,
          latencyMs,
          inputTokens: ctxResult.estimatedInputTokens,
          outputTokens: estOut,
          tokensEstimated: true,
        });
        attempts.push({
          request_id: requestId,
          attempt_no: attemptNo,
          candidate: {
            provider_id: provider.provider_id,
            key_id: keyId,
            model_id: model.model_id,
          },
          class: errorClass,
          http_status: null,
          latency_ms: latencyMs,
          error_message: redactSecrets(errMsg, [apiKey]),
        });

        // S3 & I5: After output has locked to provider, any failure ends the stream with an explicit error event. No provider switch mid-answer!
        if (lockedToProvider) {
          updateStoredMessage(accumulatedText, 'interrupted');
          callbacks.onErrorEvent?.(
            formatActionableProviderError(attempts, lang, lastUserMsg)
          );
          return {
            ok: false,
            messageId,
            status: 'interrupted',
            text: accumulatedText,
            attempts,
          };
        }

        // If < allowResetUnderChars were emitted before error, notify client to reset buffer before falling back (Phase 2.1)
        if (firstTokenEmitted && accumulatedText.length <= allowResetUnderChars) {
          callbacks.onReset?.();
          accumulatedText = '';
          firstTokenEmitted = false;
        }
        // Otherwise lockedToProvider is false -> fallback to next candidate is allowed (S1)
      } finally {
        releaseSlot();
        req.abortSignal?.removeEventListener('abort', onClientAbort);
      }
    }

    const fallbackMsg = formatActionableProviderError(
      attempts,
      lang,
      lastUserMsg
    );
    updateStoredMessage(accumulatedText, 'interrupted');
    callbacks.onErrorEvent?.(fallbackMsg);
    return {
      ok: false,
      messageId,
      status: 'interrupted',
      text: accumulatedText || fallbackMsg,
      attempts,
    };
  }

  private applyErrorClassToKeyState(params: {
    classified: ReturnType<typeof classifyProviderError>;
    provider: ValidatedProvider;
    keyId: string;
    modelId: string;
  }): void {
    const { classified, provider, keyId, modelId } = params;
    const kp = this.getKeyPool(provider);
    switch (classified.errorClass) {
      case 'RATE_LIMITED':
        if (
          provider.is_client_supplied &&
          provider.resolved_keys.length === 1 &&
          provider.models.length > 1
        ) {
          kp.markModelUnavailableForKey({
            providerId: provider.provider_id,
            keyId,
            modelId,
            durationMs: ENGINE_DEFAULTS.RATE_LIMIT_MIN_COOLDOWN_MS,
            reason: 'model_rate_limited',
          });
        } else {
          kp.recordRateLimited({
            providerId: provider.provider_id,
            keyId,
            retryAfterTimestampMs: classified.retryAfterTimestampMs,
            resetTimezone: provider.reset_timezone,
            resetTime: provider.reset_time,
          });
        }
        break;
      case 'QUOTA_EXHAUSTED':
        if (
          provider.is_client_supplied &&
          provider.resolved_keys.length === 1 &&
          provider.models.length > 1
        ) {
          kp.markModelUnavailableForKey({
            providerId: provider.provider_id,
            keyId,
            modelId,
            durationMs: ENGINE_DEFAULTS.PERMISSION_DENIED_UNAVAILABLE_MS,
            reason: 'model_billing_or_quota_unavailable',
          });
        } else {
          kp.recordQuotaExhausted({
            providerId: provider.provider_id,
            keyId,
            resetTimezone: provider.reset_timezone,
            resetTime: provider.reset_time,
          });
        }
        break;
      case 'AUTH_INVALID':
        kp.recordAuthInvalid(provider.provider_id, keyId);
        break;
      case 'PERMISSION_DENIED':
        kp.markModelUnavailableForKey({
          providerId: provider.provider_id,
          keyId,
          modelId,
          durationMs: ENGINE_DEFAULTS.PERMISSION_DENIED_UNAVAILABLE_MS,
          reason: 'permission_denied_10m',
        });
        break;
      case 'MODEL_UNAVAILABLE':
        kp.markModelUnavailableForKey({
          providerId: provider.provider_id,
          keyId,
          modelId,
          configHash: provider.config_hash,
          reason: 'model_unavailable_until_config_change',
        });
        break;
      case 'TIMEOUT':
      case 'SERVER_ERROR':
      case 'NETWORK_ERROR':
      case 'UNKNOWN':
        kp.recordTransientFailure(
          provider.provider_id,
          keyId,
          classified.errorClass
        );
        break;
      default:
        break;
    }
  }

  /**
   * Section 15 (H1): get_ai_health() returns, per provider: enabled state; per key: state and reset time;
   * last error class; remaining effective quota per window; circuit states; counts for the last 24 hours by class.
   * Never a secret.
   */
  public get_ai_health(): HealthReport {
    const now = this.storage.now();
    const dayAgo = now - 24 * 60 * 60 * 1_000;
    const engineEnabled = !this.isKilled('engine', 'global');

    const providersHealth: HealthReport['providers'] = [];

    for (const provider of this.validatedProviders) {
      const providerKilled = this.isKilled('provider', provider.provider_id);
      const isEnabled =
        engineEnabled &&
        provider.enabled &&
        (!provider.custom || provider.probed) &&
        !providerKilled;

      // Counts for the last 24 hours by class
      const countRows = this.storage.db
        .prepare(
          `SELECT class, COUNT(*) AS cnt
           FROM ai_usage_records
           WHERE provider_id = ? AND created_at >= ?
           GROUP BY class`
        )
        .all(provider.provider_id, dayAgo) as Array<{
        class: string;
        cnt: number;
      }>;

      const countsByClass: Record<string, number> = {};
      for (const r of countRows) {
        countsByClass[r.class] = r.cnt;
      }

      const keysHealth: HealthReport['providers'][number]['keys'] = [];

      for (const kEntry of provider.resolved_keys) {
        const keyState = this.keyPool.getKeyState(
          provider.provider_id,
          kEntry.key_id
        );
        const last4 =
          this.storage.getKeyLast4(provider.provider_id, kEntry.key_id) || '';

        const modelsHealth = provider.models.map((m) => {
          const rem = this.ledger.getRemainingQuota(
            provider.provider_id,
            kEntry.key_id,
            m.model_id,
            {
              rpm: provider.rpm,
              rpd: provider.rpd,
              tpm: provider.tpm,
              tpd: provider.tpd,
              reset_timezone: provider.reset_timezone,
              reset_time: provider.reset_time,
            }
          );

          return {
            model_id: m.model_id,
            available: this.keyPool.isModelAvailableForKey(
              provider.provider_id,
              kEntry.key_id,
              m.model_id,
              provider.config_hash
            ),
            remaining_effective_quota: {
              rpm: rem.remainingRpm,
              rpd: rem.remainingRpd,
              tpm: rem.remainingTpm,
              tpd: rem.remainingTpd,
              period_end_ms: rem.periodEndMs,
            },
          };
        });

        keysHealth.push({
          key_id: kEntry.key_id,
          key_masked: formatKeyLast4(last4),
          state: keyState.state,
          simplified_status: keyState.simplified_status,
          reset_time: keyState.state_until,
          last_error_class: keyState.last_error_class,
          circuit_open_count: keyState.circuit_open_count,
          half_open_probe_in_flight: keyState.half_open_probe_in_flight === 1,
          models: modelsHealth,
        });
      }

      providersHealth.push({
        provider_id: provider.provider_id,
        enabled: isEnabled,
        custom: provider.custom,
        probed: provider.probed,
        keys: keysHealth,
        counts_last_24h_by_class: countsByClass,
      });
    }

    const cap = this.getServerKeyDailyCap();
    const dailyCount = this.storage.getServerKeyDailyCount();

    return {
      engine_enabled: engineEnabled,
      killSwitchEnabled: engineEnabled,
      serverKeyDailyCap: cap,
      serverKeyDailyCount: dailyCount,
      serverKeyBudgetReached: this.isServerKeyBudgetReached(),
      providers: providersHealth,
    };
  }

  public getHealth(): HealthReport {
    return this.get_ai_health();
  }
}

let sharedEngineInstance: HardenedAIEngine | null = null;

export function getSharedHardenedEngine(): HardenedAIEngine {
  if (!sharedEngineInstance) {
    sharedEngineInstance = new HardenedAIEngine();
  }
  return sharedEngineInstance;
}

export function resetSharedHardenedEngine(): void {
  if (sharedEngineInstance) {
    try {
      sharedEngineInstance.close();
    } catch {
      // Ignore close error
    }
    sharedEngineInstance = null;
  }
}

export { redactHeaders, computeEffectiveLimits, getCurrentPeriodWindow };
