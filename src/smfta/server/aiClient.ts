import {
  buildProviderModelCandidates,
  buildXrahatPrompt,
  buildXrahatUrl,
  detectProviderFromKey,
  extractTextFromOpenAIJson,
  extractXrahatReply,
  inferModelForCustomBaseUrl,
  normalizeEndpointUrl,
  POLLINATIONS_OPENAI_URL,
  PROVIDER_ENDPOINTS,
  resolveEffectiveProvider,
  resolveGroqModel,
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
import { decryptKeyPayloadIfSupported, resolveServerEnvGeminiKey } from './keyResolver';

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
  return resolveServerEnvGeminiKey();
}

export function normalizeGeminiModelName(requestedModel?: string): string {
  const raw = (requestedModel || '').trim();
  if (!raw) return 'gemini-3.8-flash';
  const bare = raw.includes('/') ? raw.split('/').pop() || raw : raw;
  const lower = bare.toLowerCase();

  if (
    lower === 'gemini-2.0-flash' ||
    lower === 'gemini-1.5-flash' ||
    lower === 'gemini-1.5-pro' ||
    lower === 'gemini-pro'
  ) {
    return 'gemini-3-flash-preview';
  }

  if (lower === 'smfta-flash') return 'gemini-3.1-flash-lite';
  if (lower === 'smfta-pro' || lower === 'smfta-ultra' || lower === 'smfta-v2-pro') {
    return 'gemini-3.8-flash';
  }
  if (lower === 'smfta-v5') return 'gemini-3.5-flash-lite';
  if (lower === 'smfta-max') return 'gemini-4-hydrogen';

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
    return 'gemini-4-hydrogen';
  }
  return 'gemini-3.1-flash-lite';
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
  apiKeyOverride?: string;
}): {
  effectiveProvider: string;
  adHocProviders: AdHocProviderInput[];
  hasUserKeys: boolean;
  allowKeylessFallback: boolean;
} {
  const rawKeyCandidates = Array.isArray(params.externalKeys)
    ? params.externalKeys.map((k) => k.trim()).filter(Boolean)
    : (params.externalKeys || '')
        .split(/[\n,;]+/)
        .map((k) => k.trim())
        .filter(Boolean);
  const rawKeys = rawKeyCandidates
    .map((k) => {
      const dec = decryptKeyPayloadIfSupported(k);
      return dec.ok ? dec.key : '';
    })
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
  const maxOut = Math.min(32_768, Math.max(8, params.maxOutputTokens || 16_384));

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
        ? 'gemini-4-hydrogen'
        : protocol === 'anthropic_native'
        ? 'claude-sonnet-4-20250514'
        : effectiveProvider === 'custom'
        ? inferModelForCustomBaseUrl(rawUrl || baseUrl)
        : 'gpt-4o-mini');

    const requestedExternalModel =
      effectiveProvider === 'groq'
        ? resolveGroqModel(params.externalModel)
        : params.externalModel;

    const modelList =
      protocol === 'gemini_native'
        ? params.exactModelOnly && (params.externalModel || '').trim()
          ? [normalizeGeminiModelName(params.externalModel)]
          : Array.from(
              new Set([
                ...(params.externalModel ? [normalizeGeminiModelName(params.externalModel)] : []),
                ...(params.discoveredModels || []).map((m) => normalizeGeminiModelName(m)),
                'gemini-4-hydrogen',
                'gemini-3.1-flash-lite',
                'gemini-4-neon',
                'gemini-4-carbon',
              ])
            )
        : buildProviderModelCandidates(
            fallbackProviderForUrl,
            requestedExternalModel,
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

  // Server/resolved Gemini key if available for smfta_cloud / xrahat OR keyless gemini_custom
  const serverGemKey = (params.apiKeyOverride || getServerGeminiKey()).trim();
  const useServerGemini =
    Boolean(serverGemKey) &&
    (isExplicitKeyless ||
      (!hasUserKeys &&
        (effectiveProvider === 'gemini_custom' ||
          effectiveProvider === 'gemini_openai')));
  if (useServerGemini) {
    // Map built-in SMFTA V1/V2 tier IDs cleanly to valid Gemini models.
    const rawExt = (params.externalModel || '').trim().toLowerCase();
    const isFastTier =
      rawExt === 'smfta-flash' ||
      rawExt === 'smfta-v5' ||
      rawExt.includes('flash-lite');
    const mappedTierModel =
      rawExt === 'smfta-flash'
        ? 'gemini-3.1-flash-lite'
        : rawExt === 'smfta-ultra' || rawExt === 'smfta-pro' || rawExt === 'smfta-v2-pro'
        ? 'gemini-3.8-flash'
        : rawExt === 'smfta-v5'
        ? 'gemini-3.5-flash-lite'
        : rawExt === 'smfta-max'
        ? 'gemini-4-hydrogen'
        : rawExt &&
          !/^(smfta-|gpt-|claude-|deepseek-|llama-|qwen-)/i.test(rawExt)
        ? normalizeGeminiModelName(params.externalModel)
        : '';
    const orderedFallbacks = isFastTier
      ? [
          ...(mappedTierModel ? [mappedTierModel] : []),
          'gemini-3.1-flash-lite',
          'gemini-flash-lite-latest',
          'gemini-3-flash-preview',
          'gemini-2.5-flash-lite',
          'gemini-4-hydrogen',
        ]
      : [
          ...(mappedTierModel ? [mappedTierModel] : []),
          'gemini-3.8-flash',
          'gemini-4-hydrogen',
          'gemini-3-flash-preview',
          'gemini-3.1-flash-lite',
          'gemini-flash-lite-latest',
        ];
    const gemModels = Array.from(new Set(orderedFallbacks)).map((m) => ({
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

  const isBuiltinDefaultServerGemini =
    !hasUserKeys &&
    !String(params.externalBaseUrl || '').trim() &&
    (effectiveProvider === 'gemini_custom' || effectiveProvider === 'gemini_openai');

  return {
    effectiveProvider,
    adHocProviders,
    hasUserKeys,
    allowKeylessFallback: (isExplicitKeyless || isBuiltinDefaultServerGemini) && !hasUserKeys,
  };
}

export async function callXrahatKeylessJson(params: {
  systemInstruction: string;
  history: Array<{ role: string; content: string }>;
  uid?: string;
  timeoutMs?: number;
}): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    params.timeoutMs ?? 15_000
  );
  try {
    const cleanMessages = params.history
      .filter((m) => (m.content || '').trim())
      .slice(-8)
      .map((m) => ({
        role: m.role === 'ai' || m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content.trim(),
      }));
    if (cleanMessages.length > 0) {
      const postRes = await fetch(POLLINATIONS_OPENAI_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          model: 'openai',
          messages: [
            ...(params.systemInstruction?.trim()
              ? [{ role: 'system', content: params.systemInstruction.trim().slice(0, 1200) }]
              : []),
            ...cleanMessages,
          ],
          stream: false,
        }),
        signal: controller.signal,
      }).catch(() => null);
      if (postRes && postRes.ok) {
        const ct = (postRes.headers.get('content-type') || '').toLowerCase();
        if (ct.includes('json')) {
          const data = await postRes.json().catch(() => null);
          const extracted = extractTextFromOpenAIJson(data) || extractXrahatReply(data);
          if (extracted.trim()) return sanitizeProprietaryOutput(extracted.trim());
        } else {
          const txt = await postRes.text().catch(() => '');
          if (txt.trim() && !/^\s*</.test(txt)) {
            return sanitizeProprietaryOutput(txt.trim());
          }
        }
      }
    }

    const prompt = buildXrahatPrompt(params.systemInstruction, params.history);
    if (!prompt) return '';
    const url = buildXrahatUrl(
      prompt,
      params.uid || `smfta-aux-${Date.now().toString(36)}`,
      false
    );
    const res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'text/plain, application/json' },
      signal: controller.signal,
    });
    if (!res.ok) return '';
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    if (ct.includes('json')) {
      const data = await res.json().catch(() => null);
      return sanitizeProprietaryOutput(extractXrahatReply(data).trim());
    }
    const rawText = await res.text().catch(() => '');
    if (!rawText.trim() || /^\s*<(?:!doctype|html)/i.test(rawText)) return '';
    return sanitizeProprietaryOutput(rawText.trim());
  } catch {
    return '';
  } finally {
    clearTimeout(timer);
  }
}

export const callPublicKeylessJson = callXrahatKeylessJson;

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
  const maxOut = options?.maxTokens || 8192;

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
