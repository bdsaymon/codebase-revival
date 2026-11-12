import {
  buildProviderModelCandidates,
  buildXrahatPrompt,
  buildXrahatUrl,
  detectProviderFromKey,
  extractXrahatReply,
  inferModelForCustomBaseUrl,
  normalizeEndpointUrl,
  PROVIDER_ENDPOINTS,
  resolveEffectiveProvider,
  sanitizeProprietaryOutput,
} from './providers';
import {
  getSharedHardenedEngine,
  type AdHocProviderInput,
  type HardenedAIEngine,
} from './engine/router';
import type { ProviderConfig, SupportedProtocol } from './engine/config';
import type { CanonicalMessage } from './engine/context';
import type { JsonObjectSchema } from './engine/outputValidator';
import { redactSecrets } from './engine/security';
import { SERVER_KEY_DAILY_CAP_REACHED_MESSAGE_BN } from './engine/defaults';

export function sanitizeErrorMsg(err: unknown, additionalKeys?: string[]): string {
  const raw =
    err instanceof Error ? err.message : typeof err === 'string' ? err : 'Unknown error';
  let legacyCleaned = raw
    .replace(/AIza[0-9A-Za-z_-]{8,}/g, '[REDACTED_GEMINI_KEY]')
    .replace(/sk-(?:proj-|or-|ant-|svcacct-)?[A-Za-z0-9_-]{8,}/g, '[REDACTED_API_KEY]')
    .replace(/gsk_[A-Za-z0-9_-]{8,}/g, '[REDACTED_GROQ_KEY]')
    .replace(/nvapi-[A-Za-z0-9_-]{8,}/g, '[REDACTED_NVIDIA_KEY]')
    .replace(/ghp_[A-Za-z0-9_]{8,}/g, '[REDACTED_GITHUB_KEY]')
    .replace(/github_pat_[A-Za-z0-9_]{8,}/g, '[REDACTED_GITHUB_KEY]')
    .replace(/cc_[A-Za-z0-9_-]{8,}/g, '[REDACTED_CODECRAFT_KEY]')
    .replace(/Bearer\s+[^\s"']+/gi, 'Bearer [REDACTED]');
  if (Array.isArray(additionalKeys)) {
    for (const k of additionalKeys) {
      const cleanKey = (k || '').trim();
      if (cleanKey.length >= 6) {
        legacyCleaned = legacyCleaned.split(cleanKey).join('[REDACTED_KEY]');
      }
    }
  }
  return redactSecrets(legacyCleaned, additionalKeys).slice(0, 260);
}

export function getServerGeminiKey(): string {
  return (
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.API_KEY ||
    ''
  ).trim();
}

export function normalizeGeminiModelName(requestedModel?: string): string {
  const raw = (requestedModel || '').trim();
  if (!raw) return 'gemini-2.5-flash';
  const bare = raw.includes('/') ? raw.split('/').pop() || raw : raw;
  const lower = bare.toLowerCase();

  if (lower.startsWith('gemini-')) {
    return bare;
  }

  if (
    lower.includes('reasoner') ||
    lower.includes('r1') ||
    lower.includes('opus') ||
    lower.includes('sonnet') ||
    lower.includes('gpt-4o') ||
    lower.includes('gpt-5') ||
    lower.includes('pro') ||
    lower.includes('70b') ||
    lower.includes('72b') ||
    lower.includes('405b')
  ) {
    return 'gemini-2.5-pro';
  }
  return 'gemini-2.5-flash';
}

export function mapKeylessModelAlias(requestedModel?: string): string[] {
  const raw = (requestedModel || '').trim().toLowerCase();
  const bare = raw.includes('/') ? raw.split('/').pop() || raw : raw;
  const candidates: string[] = [];
  const add = (m: string) => {
    if (m && !candidates.includes(m)) candidates.push(m);
  };

  if (bare.includes('deepseek-r1') || bare.includes('reasoner')) {
    add('deepseek-reasoner');
    add('deepseek');
  } else if (bare.includes('deepseek')) {
    add('deepseek');
  } else if (bare.includes('claude')) {
    add('claude-hybridspace');
    add('openai-large');
  } else if (bare.includes('gemini')) {
    add('gemini');
    add('gemini-search');
  } else if (bare.includes('qwen') && bare.includes('coder')) {
    add('qwen-coder');
  } else if (bare.includes('llama')) {
    add('llama');
  } else if (bare.includes('mistral')) {
    add('mistral');
  } else if (bare.includes('gpt-4o') || bare.includes('gpt-5')) {
    add('openai-large');
  }

  add('openai');
  add('mistral');
  return candidates;
}

export function buildAdHocProviderConfig(params: {
  provider: string;
  externalKeys?: string | string[];
  externalModel?: string;
  externalBaseUrl?: string;
  maxOutputTokens?: number;
  discoveredModels?: string[];
  exactModelOnly?: boolean;
  respectCustomBaseUrl?: boolean;
  contextWindow?: number;
}): {
  effectiveProvider: string;
  adHocProviders: AdHocProviderInput[];
  hasUserKeys: boolean;
  allowKeylessFallback: boolean;
} {
  const rawKeys = Array.isArray(params.externalKeys)
    ? params.externalKeys.map((k) => k.trim()).filter(Boolean)
    : (params.externalKeys || '')
        .split(/[\n,;]+/)
        .map((k) => k.trim())
        .filter(Boolean);

  const effectiveProvider = resolveEffectiveProvider(
    params.provider || 'xrahat',
    rawKeys,
    params.externalBaseUrl
  );

  const hasUserKeys = rawKeys.length > 0;
  const isExplicitKeyless =
    effectiveProvider === 'xrahat' || effectiveProvider === 'smfta_cloud';
  const isLocalKeyless =
    effectiveProvider === 'ollama' || effectiveProvider === 'lmstudio';

  const adHocProviders: AdHocProviderInput[] = [];
  const maxOut = Math.min(32_768, Math.max(8, params.maxOutputTokens || 4096));

  if (
    !isExplicitKeyless &&
    (hasUserKeys || isLocalKeyless || effectiveProvider === 'custom')
  ) {
    const rawUrl = (params.externalBaseUrl || '').trim();
    const detectedFromKey = rawKeys[0] ? detectProviderFromKey(rawKeys[0]) : null;
    const isCustomGeminiNative =
      effectiveProvider === 'custom' &&
      ((rawUrl &&
        /generativelanguage\.googleapis\.com/i.test(rawUrl) &&
        !/\/openai/i.test(rawUrl)) ||
        (!rawUrl && detectedFromKey === 'gemini_custom'));
    const isCustomAnthropicNative =
      effectiveProvider === 'custom' &&
      ((rawUrl &&
        (/api\.anthropic\.com/i.test(rawUrl) || /\/v1\/messages\/?$/i.test(rawUrl))) ||
        (!rawUrl && detectedFromKey === 'anthropic'));

    const preset =
      PROVIDER_ENDPOINTS[effectiveProvider] ||
      (!rawUrl && detectedFromKey ? PROVIDER_ENDPOINTS[detectedFromKey] : undefined);

    const protocol: SupportedProtocol =
      effectiveProvider === 'gemini_custom' || isCustomGeminiNative
        ? 'gemini_native'
        : effectiveProvider === 'anthropic' || isCustomAnthropicNative
        ? 'anthropic_native'
        : 'openai_compatible';

    const fallbackProviderForUrl =
      effectiveProvider === 'custom' && !rawUrl
        ? detectedFromKey ||
          (rawKeys[0]?.startsWith('sk-') ? 'openai' : 'custom')
        : effectiveProvider;

    const baseUrl = isCustomGeminiNative
      ? 'https://generativelanguage.googleapis.com/v1beta'
      : isCustomAnthropicNative && !rawUrl
      ? 'https://api.anthropic.com/v1/messages'
      : normalizeEndpointUrl(
          fallbackProviderForUrl,
          rawUrl,
          { respectCustomBaseUrl: params.respectCustomBaseUrl ?? true }
        );

    let customHeaders = preset?.headers;
    if (effectiveProvider === 'custom') {
      if (/openrouter\.ai/i.test(baseUrl)) {
        customHeaders = {
          'HTTP-Referer': 'https://smfta.ai',
          'X-Title': 'SMFTA AI Pro',
          ...(customHeaders || {}),
        };
      } else if (protocol === 'anthropic_native' || /api\.anthropic\.com/i.test(baseUrl)) {
        customHeaders = {
          'anthropic-version': '2023-06-01',
          ...(customHeaders || {}),
        };
      }
    }

    const defaultModel =
      preset?.defaultModel ||
      (protocol === 'gemini_native'
        ? 'gemini-2.5-flash'
        : protocol === 'anthropic_native'
        ? 'claude-sonnet-4-20250514'
        : effectiveProvider === 'custom'
        ? inferModelForCustomBaseUrl(rawUrl || baseUrl)
        : 'gpt-4o-mini');

    const modelList =
      protocol === 'gemini_native'
        ? params.exactModelOnly && (params.externalModel || '').trim()
          ? [normalizeGeminiModelName(params.externalModel)]
          : Array.from(
              new Set([
                ...(params.externalModel ? [normalizeGeminiModelName(params.externalModel)] : []),
                ...(params.discoveredModels || []).map((m) => normalizeGeminiModelName(m)),
                'gemini-flash-latest',
                'gemini-3.5-flash-lite',
                'gemini-3.1-flash-lite',
                'gemini-3-flash-preview',
                'gemini-2.5-flash',
                'gemini-2.5-pro',
                'gemini-2.5-flash-lite',
              ])
            )
        : buildProviderModelCandidates(
            fallbackProviderForUrl,
            params.externalModel,
            defaultModel,
            params.discoveredModels || [],
            { exactOnly: params.exactModelOnly }
          );

    const models = (modelList.length > 0 ? modelList : [defaultModel]).map(
      (modelId) => {
        const lower = modelId.toLowerCase();
        let ctx = 256_000;
        if (lower.includes('gemini')) ctx = 1_000_000;
        else if (lower.includes('claude')) ctx = 256_000;
        if (typeof params.contextWindow === 'number' && Number.isFinite(params.contextWindow)) {
          ctx = Math.max(2048, Math.min(1_000_000, Math.round(params.contextWindow)));
        }
        return {
          model_id: modelId,
          context_window: ctx,
          max_output: maxOut,
          tools: true,
          json: true,
          stream: true,
          input_price_per_1k: 0,
          output_price_per_1k: 0,
        };
      }
    );

    const providerCfg: ProviderConfig = {
      provider_id: effectiveProvider,
      protocol,
      base_url: baseUrl,
      custom_headers: customHeaders,
      models,
      rpm: 600,
      rpd: 50_000,
      tpm: 2_000_000,
      tpd: 20_000_000,
      reset_timezone: 'UTC',
      reset_time: '00:00',
      priority: 1,
      custom: effectiveProvider === 'custom',
      enabled: true,
    };

    adHocProviders.push({
      provider: providerCfg,
      rawKeys,
      isKeyless: !hasUserKeys && (isLocalKeyless || effectiveProvider === 'custom'),
      isServerHeldKey: false,
    });
  }

  // Server Gemini key if available and either smfta_cloud or fallback
  const serverGemKey = getServerGeminiKey();
  if (serverGemKey && isExplicitKeyless) {
    // Built-in SMFTA tier ids (smfta-flash/pro/ultra) and legacy fabricated
    // placeholders are client-side labels only — the keyless engine picks its
    // own vendor model, so never forward them as a real Gemini model name.
    const requestedModel =
      isExplicitKeyless &&
      (!params.externalModel ||
        /^(smfta-|gpt-|claude-|gemini-2\.[05]-|deepseek-|llama-|qwen-)/i.test(
          params.externalModel.trim()
        ))
        ? ''
        : params.externalModel;
    const gemModels = Array.from(
      new Set([
        ...(requestedModel ? [normalizeGeminiModelName(requestedModel)] : []),
        'gemini-flash-latest',
        'gemini-3.5-flash-lite',
        'gemini-3.1-flash-lite',
        'gemini-3-flash-preview',
        'gemini-2.5-flash',
        'gemini-2.5-pro',
        'gemini-2.5-flash-lite',
      ])
    ).map((m) => ({
      model_id: m,
      context_window: 1_000_000,
      max_output: maxOut,
      tools: true,
      json: true,
      stream: true,
      input_price_per_1k: 0.00015,
      output_price_per_1k: 0.0006,
    }));

    adHocProviders.push({
      provider: {
        provider_id: 'gemini_server',
        protocol: 'gemini_native',
        base_url: 'https://generativelanguage.googleapis.com/v1beta',
        models: gemModels,
        rpm: 60,
        rpd: 1_500,
        tpm: 1_000_000,
        tpd: 10_000_000,
        reset_timezone: 'America/Los_Angeles',
        reset_time: '00:00',
        priority: 2,
        custom: false,
        enabled: true,
      },
      rawKeys: [serverGemKey],
      isKeyless: false,
      isServerHeldKey: true,
    });
  }

  return {
    effectiveProvider,
    adHocProviders,
    hasUserKeys,
    allowKeylessFallback: isExplicitKeyless && !hasUserKeys,
  };
}

export async function callXrahatKeylessJson(params: {
  systemInstruction: string;
  history: Array<{ role: string; content: string }>;
  uid?: string;
  timeoutMs?: number;
}): Promise<string> {
  const prompt = buildXrahatPrompt(params.systemInstruction, params.history);
  if (!prompt) return '';
  const url = buildXrahatUrl(
    prompt,
    params.uid || `smfta-aux-${Date.now().toString(36)}`,
    false
  );
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    params.timeoutMs ?? 15_000
  );
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!res.ok) return '';
    const data = await res.json().catch(() => null);
    return extractXrahatReply(data).trim();
  } catch {
    return '';
  } finally {
    clearTimeout(timer);
  }
}

export async function callBackendEngine(
  prompt: string,
  systemInstruction = 'You are SMFTA Pro, an elite bilingual (Bengali & English) AI engine.',
  options?: {
    maxTokens?: number;
    preferredModel?: string;
    preferredProvider?: string;
    externalKeys?: string | string[];
    externalBaseUrl?: string;
    userId?: string;
    structuredSchema?: JsonObjectSchema;
    temperature?: number;
    topP?: number;
    engine?: HardenedAIEngine;
    allowKeylessFallback?: boolean;
  }
): Promise<{
  text: string;
  structuredData?: Record<string, unknown>;
  ok: boolean;
  error?: string;
}> {
  const engine = options?.engine || getSharedHardenedEngine();
  const maxOut = options?.maxTokens || 2048;

  const built = buildAdHocProviderConfig({
    provider: options?.preferredProvider || 'xrahat',
    externalKeys: options?.externalKeys,
    externalModel: options?.preferredModel,
    externalBaseUrl: options?.externalBaseUrl,
    maxOutputTokens: maxOut,
  });

  const messages: CanonicalMessage[] = [
    { role: 'system', content: systemInstruction },
    { role: 'user', content: prompt },
  ];

  if (built.adHocProviders.length > 0 || !built.allowKeylessFallback) {
    const genRes = await engine.generate({
      userId: options?.userId || 'aux-user',
      messages,
      preferredProviderId: built.adHocProviders[0]?.provider.provider_id,
      preferredModelId: options?.preferredModel,
      maxOutputTokens: maxOut,
      maxUserMessageChars: 120_000,
      temperature: options?.temperature,
      topP: options?.topP,
      structuredSchema: options?.structuredSchema,
      adHocProviders: built.adHocProviders,
      skipServerRegistry:
        options?.allowKeylessFallback !== true &&
        (built.hasUserKeys || built.effectiveProvider === 'custom'),
    });

    if (genRes.ok && genRes.text.trim()) {
      return {
        ok: true,
        text: sanitizeProprietaryOutput(genRes.text.trim()),
        structuredData: genRes.structuredData as
          | Record<string, unknown>
          | undefined,
      };
    }

    if (
      genRes.userMessage === SERVER_KEY_DAILY_CAP_REACHED_MESSAGE_BN &&
      options?.allowKeylessFallback === false
    ) {
      return {
        ok: false,
        text: SERVER_KEY_DAILY_CAP_REACHED_MESSAGE_BN,
        error: SERVER_KEY_DAILY_CAP_REACHED_MESSAGE_BN,
      };
    }

    if (!built.allowKeylessFallback && options?.allowKeylessFallback !== true) {
      return {
        ok: false,
        text: genRes.text || '',
        error: sanitizeErrorMsg(
          genRes.userMessage || 'Provider request failed'
        ),
      };
    }
  }

  // Keyless fallback (Xrahat) when allowed
  if (!engine.storage.isKillSwitchEnabled()) {
    return {
      ok: false,
      text: '',
      error: 'AI service is temporarily paused.',
    };
  }

  const xrahatReply = await callXrahatKeylessJson({
    systemInstruction,
    history: [{ role: 'user', content: prompt }],
  });

  if (xrahatReply) {
    return {
      ok: true,
      text: sanitizeProprietaryOutput(xrahatReply),
    };
  }

  if (engine.isServerKeyBudgetReached()) {
    return {
      ok: false,
      text: SERVER_KEY_DAILY_CAP_REACHED_MESSAGE_BN,
      error: SERVER_KEY_DAILY_CAP_REACHED_MESSAGE_BN,
    };
  }

  return {
    ok: false,
    text: '',
    error: 'No AI provider could complete the request.',
  };
}
