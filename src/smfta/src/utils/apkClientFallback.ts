import { ExternalProviderId } from '../types';
import {
  DEFAULT_PROVIDER_MODELS,
  detectProviderFromKey,
  extractCustomEndpointFromParams,
  isGoogleGeminiApiKey,
  isKeylessProviderId,
  resolveGroqModel,
  validateCustomJsonInputs,
} from './providers';
import { canonicalizeProviderEndpoint } from './providerProtocol';
import { sanitizeProprietaryOutput } from './helpers';
import { FILE_ARTIFACT_SYSTEM_DIRECTIVE } from './fileArtifacts';
import {
  buildCreatorAndSecurityDirective,
  resolveActiveSystemLabel,
} from './creatorIdentity';

const POLLINATIONS_OPENAI_ENDPOINT = 'https://text.pollinations.ai/openai';
const POLLINATIONS_TEXT_ENDPOINT = 'https://text.pollinations.ai/';

export function isStandaloneApkEnv(): boolean {
  if (typeof window === 'undefined') return false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((window as any).SMFTAApkBridge) return true;
  const proto = window.location?.protocol || '';
  const host = window.location?.hostname || '';
  return proto === 'file:' || host === 'appassets.androidplatform.net';
}

function parseApiKeyPool(rawKeys?: string): string[] {
  return (rawKeys || '')
    .split(/[\n,;]+/)
    .map((k) => k.trim())
    .filter(Boolean);
}

function firstApiKey(rawKeys?: string): string {
  return parseApiKeyPool(rawKeys)[0] || '';
}

function normalizeGeminiDirectModel(requestedModel?: string): string {
  const clean = (requestedModel || '').trim();
  const lower = clean.toLowerCase();
  if (!clean || lower.startsWith('smfta-') || !lower.startsWith('gemini')) {
    return 'gemini-2.5-flash';
  }
  if (lower.includes('hydrogen') || lower.includes('neon') || lower.includes('carbon')) {
    return 'gemini-2.5-flash';
  }
  return clean;
}

async function consumeOpenAISseStream(
  res: Response,
  onDelta?: (delta: string) => void
): Promise<string> {
  const contentType = (res.headers.get('content-type') || '').toLowerCase();
  if (contentType.includes('text/html')) {
    return '';
  }
  if (contentType.includes('text/plain')) {
    const rawTxt = await res.text().catch(() => '');
    if (rawTxt.trim() && !/^\s*<(?:!doctype|html)/i.test(rawTxt)) {
      const clean = sanitizeProprietaryOutput(rawTxt.trim());
      onDelta?.(clean);
      return clean;
    }
    return '';
  }
  if (contentType.includes('application/json') || !res.body) {
    const data = await res.json().catch(() => null);
    const text =
      data?.choices?.[0]?.message?.content?.trim() ||
      data?.content?.[0]?.text?.trim() ||
      (typeof data?.reply === 'string' ? data.reply.trim() : '') ||
      (typeof data?.response === 'string' ? data.response.trim() : '') ||
      (typeof data === 'string' ? data.trim() : '');
    if (text) {
      const clean = sanitizeProprietaryOutput(text);
      onDelta?.(clean);
      return clean;
    }
    return '';
  }

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let fullText = '';

  const handleLine = (rawLine: string) => {
    const trimmed = rawLine.trim();
    if (!trimmed.startsWith('data:')) return;
    const raw = trimmed.slice(5).trim();
    if (!raw || raw === '[DONE]') return;
    try {
      const j = JSON.parse(raw);
      const delta =
        j.choices?.[0]?.delta?.content ??
        j.choices?.[0]?.delta?.reasoning_content ??
        j.choices?.[0]?.message?.content ??
        j.delta?.text ??
        j.delta ??
        '';
      if (typeof delta === 'string' && delta) {
        const clean = sanitizeProprietaryOutput(delta);
        if (clean) {
          fullText += clean;
          onDelta?.(clean);
        }
      }
    } catch {
      // Ignore malformed SSE comment
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      buf += dec.decode();
      break;
    }
    buf += dec.decode(value, { stream: true });
    const lines = buf.split(/\r?\n/);
    buf = lines.pop() ?? '';
    for (const line of lines) {
      handleLine(line);
    }
  }

  if (buf.trim()) {
    for (const line of buf.split(/\r?\n/)) {
      handleLine(line);
    }
  }

  return sanitizeProprietaryOutput(fullText);
}

async function consumeGeminiSseStream(
  res: Response,
  onDelta?: (delta: string) => void
): Promise<string> {
  const contentType = (res.headers.get('content-type') || '').toLowerCase();
  if (contentType.includes('text/html')) return '';
  if (contentType.includes('application/json') || !res.body) {
    const data = await res.json().catch(() => null);
    const parts = data?.candidates?.[0]?.content?.parts;
    const text = Array.isArray(parts)
      ? parts
          .map((p: { text?: string }) => p?.text || '')
          .join('')
          .trim()
      : '';
    if (text) {
      const clean = sanitizeProprietaryOutput(text);
      onDelta?.(clean);
      return clean;
    }
    return '';
  }

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let fullText = '';

  const extractParts = (rawJson: string) => {
    try {
      const parsed = JSON.parse(rawJson);
      const parts = parsed?.candidates?.[0]?.content?.parts;
      if (Array.isArray(parts)) {
        for (const p of parts) {
          if (typeof p?.text === 'string' && p.text) {
            const clean = sanitizeProprietaryOutput(p.text);
            if (clean) {
              fullText += clean;
              onDelta?.(clean);
            }
          }
        }
      }
    } catch {
      // Ignore partial chunk
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      buf += dec.decode();
      break;
    }
    buf += dec.decode(value, { stream: true });
    const lines = buf.split(/\r?\n/);
    buf = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const raw = trimmed.slice(5).trim();
      if (!raw || raw === '[DONE]') continue;
      extractParts(raw);
    }
  }

  if (buf.trim()) {
    for (const line of buf.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const raw = trimmed.slice(5).trim();
      if (!raw || raw === '[DONE]') continue;
      extractParts(raw);
    }
  }

  return sanitizeProprietaryOutput(fullText);
}

async function runPublicKeylessFallback(params: {
  messages: Array<{ role: 'user' | 'ai'; text: string }>;
  systemPrompt: string;
  signal?: AbortSignal;
  onDelta?: (delta: string) => void;
}): Promise<string> {
  const cleanMsgs = params.messages
    .filter((m) => (m.text || '').trim())
    .slice(-10)
    .map((m) => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.text.trim(),
    }));
  const postPayload = {
    model: 'openai',
    messages: [
      ...(params.systemPrompt.trim()
        ? [{ role: 'system', content: params.systemPrompt.trim().slice(0, 1200) }]
        : []),
      ...(cleanMsgs.length > 0 ? cleanMsgs : [{ role: 'user', content: 'Hello' }]),
    ],
    stream: Boolean(params.onDelta),
  };

  const postRes = await fetch(POLLINATIONS_OPENAI_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: params.onDelta
        ? 'text/event-stream, application/json'
        : 'application/json',
    },
    body: JSON.stringify(postPayload),
    signal: params.signal,
  }).catch(() => null);

  if (postRes && postRes.ok) {
    const streamedText = await consumeOpenAISseStream(postRes, params.onDelta);
    if (streamedText.trim()) {
      return streamedText.trim();
    }
  }

  const lastPrompt =
    cleanMsgs.map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n') ||
    'Hello';
  const getUrl = `${POLLINATIONS_TEXT_ENDPOINT}${encodeURIComponent(
    lastPrompt.slice(0, 1500)
  )}?model=openai`;
  const getRes = await fetch(getUrl, {
    method: 'GET',
    headers: { Accept: 'text/plain, application/json' },
    signal: params.signal,
  }).catch(() => null);

  if (getRes && getRes.ok) {
    const ct = (getRes.headers.get('content-type') || '').toLowerCase();
    if (ct.includes('application/json')) {
      const json = await getRes.json().catch(() => null);
      const txt =
        json?.choices?.[0]?.message?.content?.trim() ||
        json?.reply?.trim() ||
        json?.response?.trim() ||
        '';
      if (txt) {
        const clean = sanitizeProprietaryOutput(txt);
        params.onDelta?.(clean);
        return clean;
      }
    } else {
      const txt = await getRes.text().catch(() => '');
      if (txt.trim() && !/^\s*<(?:!doctype|html)/i.test(txt)) {
        const clean = sanitizeProprietaryOutput(txt.trim());
        params.onDelta?.(clean);
        return clean;
      }
    }
  }

  throw new Error(
    'Public keyless fallback could not reach upstream AI gateway. Please configure an API key (Groq or Gemini) in Settings > Providers.'
  );
}

const CLIENT_GATEWAY_CONTROL_KEYS = new Set([
  'endpoint',
  'url',
  'baseUrl',
  'base_url',
  'method',
  'headers',
  'requestFormat',
  'bodyTemplate',
  'responsePath',
  'streamPath',
  'stream',
  'streaming',
  'models',
  'apiKeyHeader',
  'apiKeyPrefix',
]);

function extractJsonValueByPath(root: unknown, pathExpr?: string): string {
  if (!root || !pathExpr) return '';
  const tokens: Array<string | number> = [];
  const clean = pathExpr.trim().replace(/^\$\.?/, '');
  const segRegex = /([^.[\]]+)|\[(\d+)\]/g;
  let match: RegExpExecArray | null;
  while ((match = segRegex.exec(clean)) !== null) {
    if (match[1] !== undefined) tokens.push(match[1]);
    else if (match[2] !== undefined) tokens.push(Number(match[2]));
  }
  let cur: unknown = root;
  for (const tok of tokens) {
    if (cur === null || cur === undefined) return '';
    if (typeof tok === 'number') {
      if (!Array.isArray(cur)) return '';
      cur = cur[tok];
    } else {
      if (typeof cur !== 'object') return '';
      cur = (cur as Record<string, unknown>)[tok];
    }
  }
  if (typeof cur === 'string') return cur;
  if (typeof cur === 'number' || typeof cur === 'boolean') return String(cur);
  if (Array.isArray(cur)) {
    return cur
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object' && 'text' in item) {
          return String((item as { text?: unknown }).text || '');
        }
        return '';
      })
      .join('');
  }
  return '';
}

function interpolateClientTemplate(
  node: unknown,
  vars: {
    model: string;
    prompt: string;
    system: string;
    messages: Array<{ role: string; content: string }>;
  }
): unknown {
  if (typeof node === 'string') {
    if (node === '{{messages}}') return vars.messages;
    if (node === '{{model}}') return vars.model;
    if (node === '{{prompt}}') return vars.prompt;
    if (node === '{{system}}') return vars.system;
    return node
      .replace(/\{\{model\}\}/g, vars.model)
      .replace(/\{\{prompt\}\}/g, vars.prompt)
      .replace(/\{\{system\}\}/g, vars.system);
  }
  if (Array.isArray(node)) {
    return node.map((item) => interpolateClientTemplate(item, vars));
  }
  if (node && typeof node === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      out[k] = interpolateClientTemplate(v, vars);
    }
    return out;
  }
  return node;
}

function extractClientExtraParams(
  parsedParams?: Record<string, unknown>
): Record<string, unknown> {
  if (!parsedParams) return {};
  const extra: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(parsedParams)) {
    if (!CLIENT_GATEWAY_CONTROL_KEYS.has(k) && v !== undefined) {
      extra[k] = v;
    }
  }
  return extra;
}

function mergeSpecHeaders(
  parsedHeaders?: Record<string, string>,
  parsedParams?: Record<string, unknown>
): Record<string, string> {
  const merged: Record<string, string> = { ...(parsedHeaders || {}) };
  const rawObj = parsedParams?.headers;
  if (rawObj && typeof rawObj === 'object' && !Array.isArray(rawObj)) {
    for (const [k, v] of Object.entries(rawObj as Record<string, unknown>)) {
      const key = k.trim();
      if (key && v !== undefined && v !== null && !/[\r\n]/.test(String(v))) {
        merged[key] = String(v);
      }
    }
  }
  return merged;
}

async function readClientErrorText(res: Response): Promise<string> {
  const raw = await res.text().catch(() => '');
  if (!raw.trim()) return `Provider HTTP ${res.status}`;
  if (/^\s*<(?:!doctype|html)/i.test(raw)) {
    return `Provider endpoint returned HTML instead of JSON (HTTP ${res.status})`;
  }
  try {
    const data = JSON.parse(raw);
    return (
      data?.error?.message ||
      (typeof data?.error === 'string' ? data.error : '') ||
      data?.message ||
      raw.slice(0, 220)
    );
  } catch {
    return raw.slice(0, 220);
  }
}

async function consumeCustomSseStream(
  res: Response,
  streamPath?: string,
  responsePath?: string,
  onDelta?: (delta: string) => void
): Promise<string> {
  if (!streamPath && !responsePath) {
    return consumeOpenAISseStream(res, onDelta);
  }
  const ct = (res.headers.get('content-type') || '').toLowerCase();
  if (ct.includes('application/json') || !res.body) {
    const data = await res.json().catch(() => null);
    const extracted =
      extractJsonValueByPath(data, responsePath) ||
      extractJsonValueByPath(data, streamPath) ||
      data?.choices?.[0]?.message?.content ||
      data?.reply ||
      data?.response ||
      data?.text ||
      '';
    const clean = sanitizeProprietaryOutput(String(extracted || '').trim());
    if (clean) onDelta?.(clean);
    return clean;
  }

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let fullText = '';

  const parseLine = (rawLine: string) => {
    const trimmed = rawLine.trim();
    if (!trimmed.startsWith('data:')) return;
    const raw = trimmed.slice(5).trim();
    if (!raw || raw === '[DONE]') return;
    try {
      const parsed = JSON.parse(raw);
      const delta =
        (streamPath ? extractJsonValueByPath(parsed, streamPath) : '') ||
        (responsePath ? extractJsonValueByPath(parsed, responsePath) : '') ||
        parsed?.choices?.[0]?.delta?.content ||
        parsed?.choices?.[0]?.message?.content ||
        parsed?.delta?.text ||
        parsed?.text ||
        '';
      if (typeof delta === 'string' && delta) {
        const clean = sanitizeProprietaryOutput(delta);
        if (clean) {
          fullText += clean;
          onDelta?.(clean);
        }
      }
    } catch {
      // Ignore partial chunk
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      buf += dec.decode();
      break;
    }
    buf += dec.decode(value, { stream: true });
    const lines = buf.split(/\r?\n/);
    buf = lines.pop() ?? '';
    for (const line of lines) parseLine(line);
  }
  if (buf.trim()) {
    for (const line of buf.split(/\r?\n/)) parseLine(line);
  }
  return sanitizeProprietaryOutput(fullText);
}

async function executeJsonGatewayDirect(params: {
  specObj: Record<string, unknown>;
  mergedHeaders: Record<string, string>;
  apiKey: string;
  model: string;
  fallbackBaseUrl?: string;
  sysInstruction: string;
  messages: Array<{
    role: 'user' | 'ai';
    text: string;
    imgs?: Array<{ mime: string; data: string }>;
  }>;
  signal?: AbortSignal;
  onDelta?: (delta: string) => void;
}): Promise<string> {
  const spec = params.specObj;
  let targetUrl = String(
    spec.endpoint || spec.url || spec.baseUrl || spec.base_url || params.fallbackBaseUrl || ''
  ).trim();
  if (!targetUrl) {
    throw new Error('JSON Gateway requires an endpoint URL or Base URL.');
  }
  if (!/^https?:\/\//i.test(targetUrl)) {
    targetUrl = `https://${targetUrl}`;
  }

  const rawFormat = String(spec.requestFormat || '').trim().toLowerCase();
  const format =
    rawFormat === 'gemini' || rawFormat === 'gemini_native'
      ? 'gemini'
      : rawFormat === 'anthropic' || rawFormat === 'anthropic_native'
      ? 'anthropic'
      : rawFormat === 'custom' || rawFormat === 'custom_template' || spec.bodyTemplate
      ? 'custom_template'
      : /generativelanguage\.googleapis\.com/i.test(targetUrl) && !/\/openai/i.test(targetUrl)
      ? 'gemini'
      : /api\.anthropic\.com/i.test(targetUrl)
      ? 'anthropic'
      : 'openai';

  const method = String(spec.method || 'POST').toUpperCase() === 'GET' ? 'GET' : 'POST';
  const streamPref =
    typeof spec.stream === 'boolean'
      ? spec.stream
      : typeof spec.streaming === 'boolean'
      ? spec.streaming
      : Boolean(params.onDelta);
  const useStream = Boolean(params.onDelta) && streamPref;
  const responsePath =
    typeof spec.responsePath === 'string' && spec.responsePath.trim()
      ? spec.responsePath.trim()
      : undefined;
  const streamPath =
    typeof spec.streamPath === 'string' && spec.streamPath.trim()
      ? spec.streamPath.trim()
      : undefined;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...params.mergedHeaders,
  };
  const apiKeyHeader =
    typeof spec.apiKeyHeader === 'string' && spec.apiKeyHeader.trim()
      ? spec.apiKeyHeader.trim()
      : format === 'anthropic'
      ? 'x-api-key'
      : 'Authorization';
  const apiKeyPrefix =
    typeof spec.apiKeyPrefix === 'string'
      ? spec.apiKeyPrefix
      : format === 'anthropic'
      ? ''
      : 'Bearer ';
  if (
    params.apiKey &&
    !Object.keys(headers).some((k) => k.toLowerCase() === apiKeyHeader.toLowerCase())
  ) {
    headers[apiKeyHeader] = `${apiKeyPrefix}${params.apiKey}`;
  }
  if (format === 'anthropic' && !headers['anthropic-version']) {
    headers['anthropic-version'] = '2023-06-01';
  }

  const chatMessages = params.messages.slice(-16).map((m) => ({
    role: m.role === 'user' ? 'user' : 'assistant',
    content: m.text || 'Hello',
  }));
  const lastUserText =
    [...chatMessages].reverse().find((m) => m.role === 'user')?.content || 'Hello';
  const extraParams = extractClientExtraParams(spec);

  let body: unknown;
  if (method === 'POST') {
    if (spec.bodyTemplate && typeof spec.bodyTemplate === 'object' && !Array.isArray(spec.bodyTemplate)) {
      body = {
        ...extraParams,
        ...(interpolateClientTemplate(spec.bodyTemplate, {
          model: params.model,
          prompt: lastUserText,
          system: params.sysInstruction,
          messages: chatMessages,
        }) as Record<string, unknown>),
      };
    } else if (format === 'gemini') {
      body = {
        systemInstruction: { parts: [{ text: params.sysInstruction }] },
        contents: params.messages.slice(-16).map((m) => ({
          role: m.role === 'user' ? 'user' : 'model',
          parts: [{ text: m.text || 'Hello' }],
        })),
        ...extraParams,
      };
    } else if (format === 'anthropic') {
      body = {
        model: params.model,
        max_tokens: 16384,
        system: params.sysInstruction,
        messages: chatMessages,
        stream: useStream,
        ...extraParams,
      };
    } else {
      body = {
        model: params.model,
        messages: [
          { role: 'system', content: params.sysInstruction },
          ...chatMessages,
        ],
        stream: useStream,
        ...extraParams,
      };
    }
  }

  const res = await fetch(targetUrl, {
    method,
    headers,
    ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
    signal: params.signal,
  });

  if (!res.ok) {
    const errMsg = await readClientErrorText(res);
    const err = new Error(`HTTP ${res.status}: ${errMsg}`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }

  if (format === 'gemini') {
    const text = await consumeGeminiSseStream(res, params.onDelta);
    if (!text.trim()) throw new Error('Empty response from JSON Gemini gateway');
    return text.trim();
  }

  const ct = (res.headers.get('content-type') || '').toLowerCase();
  if (useStream && ct.includes('text/event-stream')) {
    const streamed = await consumeCustomSseStream(
      res,
      streamPath,
      responsePath,
      params.onDelta
    );
    if (!streamed.trim()) throw new Error('Empty stream response from JSON provider');
    return streamed.trim();
  }

  const rawText = await res.text().catch(() => '');
  if (!rawText.trim()) throw new Error('Empty response from JSON provider');
  if (/^\s*<(?:!doctype|html)/i.test(rawText)) {
    throw new Error('JSON Provider endpoint returned an HTML page instead of API data.');
  }

  try {
    const data = JSON.parse(rawText);
    const extracted =
      (responsePath ? extractJsonValueByPath(data, responsePath) : '') ||
      data?.choices?.[0]?.message?.content ||
      data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      data?.content?.[0]?.text ||
      data?.reply ||
      data?.response ||
      data?.output_text ||
      data?.text ||
      '';
    const clean = sanitizeProprietaryOutput(String(extracted || '').trim());
    if (!clean) throw new Error('JSON provider returned no extractable text at responsePath');
    params.onDelta?.(clean);
    return clean;
  } catch (parseErr) {
    if (parseErr instanceof Error && parseErr.message.includes('extractable text')) {
      throw parseErr;
    }
    const clean = sanitizeProprietaryOutput(rawText.trim());
    params.onDelta?.(clean);
    return clean;
  }
}

export async function runStandaloneClientSideAI(params: {
  provider: ExternalProviderId;
  externalKeys?: string;
  externalModel?: string;
  externalBaseUrl?: string;
  customHeaders?: string;
  customParams?: string;
  mode?: 'fast' | 'balanced' | 'power';
  messages: Array<{
    role: 'user' | 'ai';
    text: string;
    imgs?: Array<{ mime: string; data: string }>;
  }>;
  systemPrompt?: string;
  signal?: AbortSignal;
  onDelta?: (delta: string) => void;
}): Promise<string> {
  const jsonCheck = validateCustomJsonInputs(
    params.customHeaders,
    params.customParams
  );
  if (!jsonCheck.valid) {
    throw new Error(jsonCheck.error || 'Invalid Custom Headers or JSON Provider configuration');
  }

  const keyPool = parseApiKeyPool(params.externalKeys);
  const apiKey = keyPool[0] || '';
  const detectedFromKey = apiKey ? detectProviderFromKey(apiKey) : null;
  const specEndpoint = extractCustomEndpointFromParams(params.customParams);
  const explicitEndpointUrl = (params.externalBaseUrl || '').trim() || specEndpoint;
  const isExplicitThirdPartyProxy =
    (params.provider || 'xrahat') === 'custom' &&
    Boolean(explicitEndpointUrl) &&
    !/api\.groq\.com/i.test(explicitEndpointUrl) &&
    !/generativelanguage\.googleapis\.com/i.test(explicitEndpointUrl);

  let provider: ExternalProviderId = params.provider || 'xrahat';
  if (
    detectedFromKey === 'groq' &&
    provider !== 'ollama' &&
    provider !== 'lmstudio' &&
    !isExplicitThirdPartyProxy
  ) {
    provider = 'groq';
  } else if (
    detectedFromKey === 'gemini_custom' &&
    provider !== 'ollama' &&
    provider !== 'lmstudio' &&
    provider !== 'gemini_openai' &&
    !isExplicitThirdPartyProxy
  ) {
    provider = 'gemini_custom';
  } else if (
    detectedFromKey &&
    (provider === 'xrahat' || provider === 'smfta_cloud' || (provider === 'custom' && !explicitEndpointUrl))
  ) {
    provider = detectedFromKey;
  }

  const rawRequestedModel = (params.externalModel || '').trim();
  const parsedSpecModels = Array.isArray(jsonCheck.parsedParams?.models)
    ? (jsonCheck.parsedParams?.models as unknown[])
        .map((m) => String(m || '').trim())
        .filter(Boolean)
    : [];
  const model =
    provider === 'groq'
      ? resolveGroqModel(rawRequestedModel)
      : rawRequestedModel || parsedSpecModels[0] || DEFAULT_PROVIDER_MODELS[provider] || 'gpt-4o-mini';

  const modeRule =
    params.mode === 'power'
      ? 'ACTIVE MODE — SMFTA ULTRA (গভীর বিশ্লেষণ ও বিশেষ বিচার): Examine the user request specially and deeply from every angle. Provide a thorough, comprehensive, expert-level breakdown with structured headings, step-by-step reasoning, and complete examples. '
      : params.mode === 'fast'
      ? 'ACTIVE MODE — SMFTA FAST (দ্রুত ও সরাসরি উত্তর): Deliver a fast, direct, concise, and immediately useful answer without long introductions or filler. '
      : 'ACTIVE MODE — SMFTA PRO (স্মার্ট ও ভারসাম্যপূর্ণ): Deliver a clear, well-structured, balanced response. ';
  const webBoundaryRule =
    'WEB BROWSING & LIVE LINK VISITATION BOUNDARY: You do NOT have live web browsing, real-time URL inspection, or live internet scraping abilities. When a user asks you to check a live URL or browse external websites, politely and honestly explain that you cannot access live web pages or browse the internet, and provide guidance strictly based on the context, code, or details provided inside the conversation. ';
  const activeSystemName = resolveActiveSystemLabel({
    externalModel: params.externalModel,
    mode: params.mode,
  });
  const sysInstruction =
    params.systemPrompt ||
    `You are ${activeSystemName}, an intelligent, fast bilingual AI assistant. Reply naturally, clearly, and completely in the same language as the user (Bengali or English) once without duplicate translations. ${modeRule}${webBoundaryRule}\n\n${buildCreatorAndSecurityDirective(activeSystemName)}\n\n${FILE_ARTIFACT_SYSTEM_DIRECTIVE}\n\nWhenever the user asks you to update yourself, change your theme ("dark"|"light"), accent color ("indigo"|"emerald"|"rose"|"amber"|"sky"), font size ("small"|"normal"|"large"), mode ("fast"|"balanced"|"power"), style ("concise"|"detailed"), replyLang ("auto"|"bn"|"en"), customCss, customInst, or add/create a live widget/tool inside yourself, reply helpfully AND append a valid JSON block at the very end wrapped in ⟦SELF_UPDATE⟧{"theme":"dark","accent":"emerald","fontsize":"large","mode":"power","customCss":"...","widget":{"title":"Tool Name","description":"Short desc","code":"<!DOCTYPE html>...complete interactive HTML/CSS/JS..."},"summary":"What you updated"}⟦/SELF_UPDATE⟧ (include only keys being changed). When the user shares a personal fact, append ⟦MEMORY: concise fact⟧ at the end.`;

  const mergedCustomHeaders = mergeSpecHeaders(
    jsonCheck.parsedHeaders,
    jsonCheck.parsedParams
  );
  const hasJsonGatewaySpec = Boolean(
    jsonCheck.parsedParams &&
      (specEndpoint ||
        jsonCheck.parsedParams.bodyTemplate ||
        jsonCheck.parsedParams.requestFormat ||
        jsonCheck.parsedParams.responsePath ||
        jsonCheck.parsedParams.streamPath)
  );
  if (hasJsonGatewaySpec && jsonCheck.parsedParams) {
    return executeJsonGatewayDirect({
      specObj: jsonCheck.parsedParams,
      mergedHeaders: mergedCustomHeaders,
      apiKey,
      model,
      fallbackBaseUrl: params.externalBaseUrl,
      sysInstruction,
      messages: params.messages,
      signal: params.signal,
      onDelta: params.onDelta,
    });
  }

  // 1. Keyless public fallback when built-in provider is active or no API key is present
  if (
    (provider === 'xrahat' || provider === 'smfta_cloud' || provider === 'gemini_custom') &&
    !apiKey
  ) {
    return runPublicKeylessFallback({
      messages: params.messages,
      systemPrompt: sysInstruction,
      signal: params.signal,
      onDelta: params.onDelta,
    });
  }

  // Canonical endpoint resolution shared with web server
  const canonical = canonicalizeProviderEndpoint(provider, explicitEndpointUrl || params.externalBaseUrl, {
    respectCustomBaseUrl: provider !== 'groq' || !explicitEndpointUrl,
  });

  if (provider === 'cloudflare' && canonical.diagnostic) {
    throw new Error(canonical.diagnostic);
  }

  // 2. Google Gemini Direct Browser SSE Stream (?alt=sse&key=...)
  if (
    canonical.protocol === 'gemini_native' ||
    (isGoogleGeminiApiKey(apiKey) && !isExplicitThirdPartyProxy && provider !== 'gemini_openai')
  ) {
    if (keyPool.length === 0) {
      return runPublicKeylessFallback({
        messages: params.messages,
        systemPrompt: sysInstruction,
        signal: params.signal,
        onDelta: params.onDelta,
      });
    }
    const primaryGemModel = normalizeGeminiDirectModel(model);
    const gemCandidates = Array.from(
      new Set([
        primaryGemModel,
        'gemini-2.5-flash',
        'gemini-2.5-flash-lite',
        'gemini-2.0-flash',
      ])
    );

    const contents = params.messages.slice(-16).map((m) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const parts: any[] = [];
      if (m.text) parts.push({ text: m.text });
      if (m.imgs && m.imgs.length > 0) {
        for (const im of m.imgs) {
          parts.push({
            inlineData: {
              mimeType: im.mime || 'image/jpeg',
              data: im.data,
            },
          });
        }
      }
      if (parts.length === 0) parts.push({ text: 'Hello' });
      return {
        role: m.role === 'user' ? 'user' : 'model',
        parts,
      };
    });

    let lastGemError: Error | null = null;
    for (const candidateKey of keyPool) {
      for (const gemModel of gemCandidates) {
        const useSse = Boolean(params.onDelta);
        const endpointUrl = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
          gemModel
        )}:${useSse ? 'streamGenerateContent?alt=sse&' : 'generateContent?'}key=${encodeURIComponent(
          candidateKey
        )}`;

        const res = await fetch(endpointUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...mergedCustomHeaders },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: sysInstruction }] },
            contents,
          }),
          signal: params.signal,
        });

        if (!res.ok) {
          const errMsg = await readClientErrorText(res);
          lastGemError = new Error(errMsg || `Gemini HTTP ${res.status}`);
          if (res.status === 404 || res.status === 400) {
            continue;
          }
          if (res.status === 401 || res.status === 403 || res.status === 429) {
            break;
          }
          throw lastGemError;
        }

        const streamed = await consumeGeminiSseStream(res, params.onDelta);
        if (streamed.trim()) {
          return streamed.trim();
        }
        lastGemError = new Error('Empty response from Gemini API');
      }
    }
    throw lastGemError || new Error('Gemini API request failed');
  }

  // 3. Anthropic Native API (/v1/messages)
  if (canonical.protocol === 'anthropic_native') {
    if (keyPool.length === 0) {
      throw new Error('Anthropic API key is missing.');
    }
    const extraParams = extractClientExtraParams(jsonCheck.parsedParams);
    let lastAnthError: Error | null = null;
    for (const candidateKey of keyPool) {
      const res = await fetch(canonical.chatUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': candidateKey,
          'anthropic-version': '2023-06-01',
          ...mergedCustomHeaders,
        },
        body: JSON.stringify({
          model,
          max_tokens: 16384,
          system: sysInstruction,
          messages: params.messages.slice(-16).map((m) => ({
            role: m.role === 'user' ? 'user' : 'assistant',
            content: m.text || 'Hello',
          })),
          stream: Boolean(params.onDelta),
          ...extraParams,
        }),
        signal: params.signal,
      });
      if (!res.ok) {
        const errMsg = await readClientErrorText(res);
        lastAnthError = new Error(errMsg || `Anthropic HTTP ${res.status}`);
        if (res.status === 401 || res.status === 403 || res.status === 429) {
          continue;
        }
        throw lastAnthError;
      }
      const text = await consumeOpenAISseStream(res, params.onDelta);
      if (!text.trim()) {
        throw new Error('Empty response from Anthropic API');
      }
      return text.trim();
    }
    throw lastAnthError || new Error('Anthropic API request failed');
  }

  // 4. OpenAI-Compatible Providers (Groq, OpenAI, Custom endpoints, OpenRouter, etc.)
  if (!isKeylessProviderId(provider) && keyPool.length === 0) {
    return runPublicKeylessFallback({
      messages: params.messages,
      systemPrompt: sysInstruction,
      signal: params.signal,
      onDelta: params.onDelta,
    });
  }

  const candidateKeys = keyPool.length > 0 ? keyPool : ['keyless'];
  const targetUrl =
    provider === 'groq'
      ? 'https://api.groq.com/openai/v1/chat/completions'
      : canonical.chatUrl;
  const candidateModels =
    provider === 'groq'
      ? Array.from(
          new Set([
            resolveGroqModel(model),
            'llama-3.3-70b-versatile',
            'llama-3.1-8b-instant',
          ])
        )
      : [model];
  const extraParams = extractClientExtraParams(jsonCheck.parsedParams);

  let lastOpenAIError: Error | null = null;

  for (const candidateKey of candidateKeys) {
    for (const candidateModel of candidateModels) {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...mergedCustomHeaders,
      };
      if (
        candidateKey &&
        candidateKey !== 'keyless' &&
        !Object.keys(headers).some((k) => k.toLowerCase() === 'authorization')
      ) {
        headers['Authorization'] = `Bearer ${candidateKey}`;
      }

      const res = await fetch(targetUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: candidateModel,
          ...(/mercury/i.test(candidateModel) ? { reasoning_effort: 'low' } : {}),
          messages: [
            { role: 'system', content: sysInstruction },
            ...params.messages.slice(-16).map((m) => ({
              role: m.role === 'user' ? 'user' : 'assistant',
              content: m.text || 'Hello',
            })),
          ],
          stream: Boolean(params.onDelta),
          ...extraParams,
        }),
        signal: params.signal,
      });

      if (!res.ok) {
        const errMsg = await readClientErrorText(res);
        const openAiErr = new Error(
          `HTTP ${res.status}: ${errMsg}`
        ) as Error & { code?: string; status?: number };
        openAiErr.status = res.status;
        if (res.status === 401 || res.status === 403) {
          openAiErr.code = 'AUTH_INVALID';
          lastOpenAIError = openAiErr;
          break;
        }
        if (res.status === 404 || res.status === 400) {
          openAiErr.code = 'MODEL_UNAVAILABLE';
          lastOpenAIError = openAiErr;
          if (candidateModels.length > 1) {
            continue;
          }
          throw openAiErr;
        }
        lastOpenAIError = openAiErr;
        if (res.status === 429 && candidateKeys.length > 1) {
          break;
        }
        throw lastOpenAIError;
      }

      const text = await consumeOpenAISseStream(res, params.onDelta);
      if (!text.trim()) {
        throw new Error('Empty response from provider');
      }
      return text.trim();
    }
  }

  throw lastOpenAIError || new Error('Provider request failed');
}

export const clientDirectCall = runStandaloneClientSideAI;

export async function testProviderClientSide(params: {
  provider: ExternalProviderId;
  externalKeys?: string;
  externalModel?: string;
  externalBaseUrl?: string;
  customHeaders?: string;
  customParams?: string;
}): Promise<{
  ok: boolean;
  message: string;
  workingModel?: string;
  normalizedEndpoint?: string;
  discoveredModels?: string[];
}> {
  const jsonCheck = validateCustomJsonInputs(
    params.customHeaders,
    params.customParams
  );
  if (!jsonCheck.valid) {
    return {
      ok: false,
      message: jsonCheck.error || 'Invalid Custom Headers or JSON Provider configuration',
    };
  }
  const specEndpoint = extractCustomEndpointFromParams(params.customParams);
  const specModels = Array.isArray(jsonCheck.parsedParams?.models)
    ? (jsonCheck.parsedParams?.models as unknown[])
        .map((m) => String(m || '').trim())
        .filter(Boolean)
    : [];
  const explicitEndpointUrl = (params.externalBaseUrl || '').trim() || specEndpoint;
  const isExplicitThirdPartyProxy =
    params.provider === 'custom' &&
    Boolean(explicitEndpointUrl) &&
    !/api\.groq\.com/i.test(explicitEndpointUrl) &&
    !/generativelanguage\.googleapis\.com/i.test(explicitEndpointUrl);

  const firstKey = firstApiKey(params.externalKeys);
  const detected = firstKey ? detectProviderFromKey(firstKey) : null;
  const effectiveProvider: ExternalProviderId =
    detected === 'groq' &&
    params.provider !== 'ollama' &&
    params.provider !== 'lmstudio' &&
    !isExplicitThirdPartyProxy
      ? 'groq'
      : params.provider;
  const workingModel =
    effectiveProvider === 'groq'
      ? resolveGroqModel(params.externalModel)
      : (params.externalModel || '').trim() ||
        specModels[0] ||
        DEFAULT_PROVIDER_MODELS[effectiveProvider] ||
        'gpt-4o-mini';
  const canonical = canonicalizeProviderEndpoint(
    effectiveProvider,
    effectiveProvider === 'groq' ? undefined : explicitEndpointUrl || params.externalBaseUrl,
    { respectCustomBaseUrl: effectiveProvider !== 'groq' }
  );
  const normalizedEndpoint = specEndpoint || canonical.chatUrl;
  try {
    await runStandaloneClientSideAI({
      provider: effectiveProvider,
      externalKeys: params.externalKeys,
      externalModel: workingModel,
      externalBaseUrl: params.externalBaseUrl,
      customHeaders: params.customHeaders,
      customParams: params.customParams,
      messages: [{ role: 'user', text: 'Ping. Reply with OK.' }],
      systemPrompt: 'Reply with OK.',
    });
    return {
      ok: true,
      workingModel,
      normalizedEndpoint,
      ...(specModels.length > 0 ? { discoveredModels: specModels } : {}),
      message: `Connected (${workingModel})`,
    };
  } catch (err: unknown) {
    return {
      ok: false,
      normalizedEndpoint,
      ...(specModels.length > 0 ? { discoveredModels: specModels } : {}),
      message: err instanceof Error ? err.message : 'Verification failed',
    };
  }
}

export async function fetchProviderModelsClientSide(params: {
  provider: ExternalProviderId;
  externalKeys?: string;
  externalBaseUrl?: string;
  customHeaders?: string;
  customParams?: string;
}): Promise<string[]> {
  const jsonCheck = validateCustomJsonInputs(
    params.customHeaders,
    params.customParams
  );
  const specEndpoint = extractCustomEndpointFromParams(params.customParams);
  const specModels = Array.isArray(jsonCheck.parsedParams?.models)
    ? (jsonCheck.parsedParams?.models as unknown[])
        .map((m) => String(m || '').trim())
        .filter(Boolean)
    : [];
  const explicitEndpointUrl = (params.externalBaseUrl || '').trim() || specEndpoint;
  const isExplicitThirdPartyProxy =
    params.provider === 'custom' &&
    Boolean(explicitEndpointUrl) &&
    !/api\.groq\.com/i.test(explicitEndpointUrl) &&
    !/generativelanguage\.googleapis\.com/i.test(explicitEndpointUrl);

  const apiKey = firstApiKey(params.externalKeys);
  if (
    params.provider === 'gemini_custom' ||
    (isGoogleGeminiApiKey(apiKey) && !isExplicitThirdPartyProxy && params.provider !== 'gemini_openai')
  ) {
    if (!apiKey) return specModels;
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(
        apiKey
      )}`
    ).catch(() => null);
    if (!res || !res.ok) return specModels;
    const data = await res.json().catch(() => null);
    if (!Array.isArray(data?.models)) return specModels;
    const remote = data.models
      .map((m: { name?: string }) => String(m?.name || '').replace(/^models\//, ''))
      .filter((name: string) => /^gemini/i.test(name));
    return remote.length > 0 ? remote : specModels;
  }

  const effectiveProvider: ExternalProviderId =
    apiKey.startsWith('gsk_') &&
    params.provider !== 'ollama' &&
    params.provider !== 'lmstudio' &&
    !isExplicitThirdPartyProxy
      ? 'groq'
      : params.provider;

  const canonical = canonicalizeProviderEndpoint(
    effectiveProvider,
    effectiveProvider === 'groq' ? undefined : explicitEndpointUrl || params.externalBaseUrl,
    { respectCustomBaseUrl: effectiveProvider !== 'groq' }
  );
  if (!canonical.modelsUrl) return specModels;
  const headers: Record<string, string> = mergeSpecHeaders(
    jsonCheck.parsedHeaders,
    jsonCheck.parsedParams
  );
  if (
    apiKey &&
    apiKey !== 'keyless' &&
    apiKey !== 'nokey' &&
    !Object.keys(headers).some((k) => k.toLowerCase() === 'authorization')
  ) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }
  const res = await fetch(canonical.modelsUrl, { headers }).catch(() => null);
  if (!res || !res.ok) return specModels;
  const data = await res.json().catch(() => null);
  if (!Array.isArray(data?.data)) return specModels;
  const remote = data.data
    .map((m: { id?: string }) => String(m?.id || '').trim())
    .filter(Boolean);
  return Array.from(new Set([...remote, ...specModels]));
}
