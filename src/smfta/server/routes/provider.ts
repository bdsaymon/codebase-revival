import crypto from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { Router, Request, Response } from '../runtime/express';
import {
  normalizeEndpointUrl,
  PROVIDER_ENDPOINTS,
  CODECRAFT_FALLBACK_MODELS,
  isKeylessProvider,
  resolveEffectiveProvider,
  detectProviderFromKey,
  inferModelForCustomBaseUrl,
} from '../providers';
import {
  buildAdHocProviderConfig,
  callXrahatKeylessJson,
  normalizeGeminiModelName,
  sanitizeErrorMsg,
} from '../aiClient';
import { verifyConnectionTargetSafe } from '../engine/config';
import { parseCustomParamsSafe } from '../engine/adapters';
import {
  getSharedHardenedEngine,
  formatActionableProviderError,
} from '../engine/router';
import { redactSecrets } from '../engine/security';

export const providerRouter = Router();

interface CachedModelsEntry {
  models: string[];
  expiresAt: number;
}

const MODEL_CACHE_TTL_MS = 5 * 60 * 1_000; // 5 minutes (Phase 3.4)
const MODEL_CACHE_MAX_ENTRIES = 500;
const modelDiscoveryCache = new Map<string, CachedModelsEntry>();

export function clearModelDiscoveryCache(): void {
  modelDiscoveryCache.clear();
}

function getModelCacheKey(
  provider: string,
  baseUrl: string,
  apiKey: string
): string {
  const keyHash = apiKey
    ? crypto.createHash('sha256').update(apiKey).digest('hex').slice(0, 16)
    : 'nokey';
  return `${provider}::${baseUrl}::${keyHash}`;
}

function getCachedModels(cacheKey: string, now = Date.now()): string[] | null {
  const entry = modelDiscoveryCache.get(cacheKey);
  if (!entry) return null;
  if (now >= entry.expiresAt) {
    modelDiscoveryCache.delete(cacheKey);
    return null;
  }
  return entry.models;
}

function setCachedModels(
  cacheKey: string,
  models: string[],
  now = Date.now()
): void {
  if (
    !modelDiscoveryCache.has(cacheKey) &&
    modelDiscoveryCache.size >= MODEL_CACHE_MAX_ENTRIES
  ) {
    const oldestKey = modelDiscoveryCache.keys().next().value;
    if (oldestKey !== undefined) {
      modelDiscoveryCache.delete(oldestKey);
    }
  }
  modelDiscoveryCache.set(cacheKey, {
    models,
    expiresAt: now + MODEL_CACHE_TTL_MS,
  });
}

function getCuratedFallbackModels(provider: string): string[] {
  if (provider === 'xrahat' || provider === 'smfta_cloud') {
    return [
      'deepseek-r1',
      'gpt-4o',
      'claude-3.5-sonnet',
      'gemini-3.8-flash',
      'gemini-3.5-flash-lite',
      'qwen-2.5-coder',
      'llama-3.3-70b',
    ];
  }
  const preset = PROVIDER_ENDPOINTS[provider];
  if (preset) {
    return Array.from(
      new Set([preset.defaultModel, ...(preset.fallbackModels || [])].filter(Boolean))
    );
  }
  return [
    'gpt-4o-mini',
    'gpt-4o',
    'gemini-3.8-flash',
    'gemini-3.5-flash-lite',
    'deepseek-chat',
    'llama-3.3-70b-versatile',
  ];
}

// ============================================================================
// 1. LIVE MODEL DISCOVERY ENDPOINT (Phase 3.4)
// ============================================================================
providerRouter.post('/provider-models', async (req: Request, res: Response) => {
  const {
    provider = 'unorouter',
    externalKeys = '',
    externalBaseUrl = '',
    forceRefresh = false,
  } = req.body || {};

  const keys = String(externalKeys || '')
    .split(/[\n,;]+/)
    .map((k: string) => k.trim())
    .filter(Boolean);
  const firstKey = keys[0] || '';
  const effectiveProvider = resolveEffectiveProvider(
    provider,
    keys,
    externalBaseUrl
  );

  if (
    effectiveProvider === 'xrahat' ||
    effectiveProvider === 'smfta_cloud'
  ) {
    return res.json({
      ok: true,
      models: getCuratedFallbackModels(effectiveProvider),
      source: 'curated',
    });
  }

  const isLocal =
    effectiveProvider === 'ollama' || effectiveProvider === 'lmstudio';
  const allowInsecureLocalhost =
    isLocal || process.env.ALLOW_INSECURE_LOCALHOST === 'true';

  const rawExternalBase = String(externalBaseUrl || '').trim();
  if (rawExternalBase) {
    const normalizedForSsrf = /^https?:\/\//i.test(rawExternalBase)
      ? rawExternalBase
      : `https://${rawExternalBase}`;
    const ssrf = await verifyConnectionTargetSafe(normalizedForSsrf, {
      isCustomProvider: effectiveProvider === 'custom',
      allowInsecureLocalhost,
    });
    if (!ssrf.safe) {
      return res.json({
        ok: true,
        models: getCuratedFallbackModels(effectiveProvider),
        source: 'fallback',
        warning: redactSecrets(ssrf.reason || 'Blocked unsafe URL'),
      });
    }
  }

  const normalizedChatUrl = normalizeEndpointUrl(
    effectiveProvider,
    externalBaseUrl
  );
  const cacheKey = getModelCacheKey(
    effectiveProvider,
    normalizedChatUrl,
    firstKey
  );

  if (!forceRefresh) {
    const cached = getCachedModels(cacheKey);
    if (cached && cached.length > 0) {
      return res.json({
        ok: true,
        models: cached,
        source: 'cache',
      });
    }
  }

  // 1A. Gemini Native (/v1beta/models?key=...)
  if (effectiveProvider === 'gemini_custom') {
    if (!firstKey) {
      return res.json({
        ok: true,
        models: getCuratedFallbackModels('gemini_custom'),
        source: 'fallback',
        warning: 'No Gemini API key provided; showing default models.',
      });
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8_000);
    try {
      const gemUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(
        firstKey
      )}`;
      const response = await fetch(gemUrl, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (response.ok) {
        const data = (await response.json()) as Record<string, unknown>;
        const rawList = Array.isArray(data.models) ? data.models : [];
        const models = rawList
          .map((item: unknown) => {
            if (item && typeof item === 'object') {
              const name = String(
                (item as Record<string, unknown>).name || ''
              );
              return name.replace(/^models\//, '');
            }
            return '';
          })
          .filter((id) => id.startsWith('gemini-'));
        if (models.length > 0) {
          setCachedModels(cacheKey, models);
          return res.json({ ok: true, models, source: 'live' });
        }
      }
      return res.json({
        ok: true,
        models: getCuratedFallbackModels('gemini_custom'),
        source: 'fallback',
        warning: `Gemini models endpoint returned HTTP ${response.status}`,
      });
    } catch (err) {
      clearTimeout(timer);
      return res.json({
        ok: true,
        models: getCuratedFallbackModels('gemini_custom'),
        source: 'fallback',
        warning: sanitizeErrorMsg(err),
      });
    }
  }

  // 1B. Anthropic Native (/v1/models with x-api-key and anthropic-version)
  if (effectiveProvider === 'anthropic') {
    if (!firstKey) {
      return res.json({
        ok: true,
        models: getCuratedFallbackModels('anthropic'),
        source: 'fallback',
        warning: 'No Anthropic API key provided; showing default models.',
      });
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8_000);
    try {
      const response = await fetch('https://api.anthropic.com/v1/models', {
        method: 'GET',
        headers: {
          'x-api-key': firstKey,
          'anthropic-version': '2023-06-01',
          Accept: 'application/json',
        },
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (response.ok) {
        const data = (await response.json()) as Record<string, unknown>;
        const rawList = Array.isArray(data.data) ? data.data : [];
        const models = rawList
          .map((item: unknown) =>
            item && typeof item === 'object'
              ? String((item as Record<string, unknown>).id || '')
              : ''
          )
          .filter(Boolean);
        if (models.length > 0) {
          setCachedModels(cacheKey, models);
          return res.json({ ok: true, models, source: 'live' });
        }
      }
      return res.json({
        ok: true,
        models: getCuratedFallbackModels('anthropic'),
        source: 'fallback',
        warning: `Anthropic models endpoint returned HTTP ${response.status}`,
      });
    } catch (err) {
      clearTimeout(timer);
      return res.json({
        ok: true,
        models: getCuratedFallbackModels('anthropic'),
        source: 'fallback',
        warning: sanitizeErrorMsg(err),
      });
    }
  }

  // 1C. OpenAI-Compatible (<base>/models)
  const modelsUrl = normalizedChatUrl.replace(
    /\/chat\/completions$/i,
    '/models'
  );

  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  if (firstKey) {
    headers['Authorization'] = `Bearer ${firstKey}`;
  }
  const presetHeaders = PROVIDER_ENDPOINTS[effectiveProvider]?.headers;
  if (presetHeaders) {
    Object.assign(headers, presetHeaders);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);

  try {
    const response = await fetch(modelsUrl, {
      method: 'GET',
      headers,
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!response.ok) {
      return res.json({
        ok: true,
        models: getCuratedFallbackModels(effectiveProvider),
        source: 'fallback',
        warning: `Model discovery returned HTTP ${response.status}`,
      });
    }

    const data = (await response.json()) as Record<string, unknown>;
    const rawList = Array.isArray(data?.data)
      ? data.data
      : Array.isArray(data?.models)
      ? data.models
      : [];

    const models: string[] = rawList
      .map((item: unknown) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object') {
          const obj = item as Record<string, unknown>;
          return String(obj.id || obj.name || '');
        }
        return '';
      })
      .filter(Boolean);

    if (models.length > 0) {
      const sliced = models.slice(0, 250);
      setCachedModels(cacheKey, sliced);
      return res.json({
        ok: true,
        models: sliced,
        source: 'live',
      });
    }

    return res.json({
      ok: true,
      models: getCuratedFallbackModels(effectiveProvider),
      source: 'fallback',
      warning: 'Provider returned an empty model list; using defaults.',
    });
  } catch (err: unknown) {
    clearTimeout(timer);
    return res.json({
      ok: true,
      models: getCuratedFallbackModels(effectiveProvider),
      source: 'fallback',
      warning: sanitizeErrorMsg(err),
    });
  }
});

// ============================================================================
// 2. TEST PROVIDER CONNECTION ENDPOINT (Phase 4.1)
// ============================================================================
providerRouter.post('/test-provider', async (req: Request, res: Response) => {
  const startPerf = performance.now();
  const {
    provider = 'unorouter',
    externalKeys = '',
    externalModel = '',
    externalBaseUrl = '',
    testStreaming = false,
    contextWindow,
    customParams,
  } = req.body || {};

  const parsedCustomParams = parseCustomParamsSafe(customParams);

  const keys = String(externalKeys || '')
    .split(/[\n,;]+/)
    .map((k: string) => k.trim())
    .filter(Boolean);

  const effectiveProvider = resolveEffectiveProvider(
    provider,
    keys,
    externalBaseUrl
  );

  // SSRF verification on externalBaseUrl before any request (Phase 4.1)
  const rawBaseUrl = String(externalBaseUrl || '').trim();
  const normalizedBaseUrlForSsrf =
    rawBaseUrl && !/^https?:\/\//i.test(rawBaseUrl)
      ? `https://${rawBaseUrl}`
      : rawBaseUrl;
  if (normalizedBaseUrlForSsrf) {
    const isLocal =
      effectiveProvider === 'ollama' || effectiveProvider === 'lmstudio';
    const ssrf = await verifyConnectionTargetSafe(normalizedBaseUrlForSsrf, {
      isCustomProvider:
        effectiveProvider === 'custom' ||
        (!PROVIDER_ENDPOINTS[effectiveProvider] && !isLocal),
      allowInsecureLocalhost:
        isLocal || process.env.ALLOW_INSECURE_LOCALHOST === 'true',
    });
    if (!ssrf.safe) {
      const latencyMs = Math.max(1, Math.round(performance.now() - startPerf));
      const reasonRaw = ssrf.reason || 'Unsafe target URL';
      let friendlyReason = `মেটাডাটা বা প্রাইভেট আইপি অনুমোদিত নয় (${redactSecrets(reasonRaw)})`;
      if (/example\.com/i.test(rawBaseUrl)) {
        friendlyReason =
          "'api.example.com' একটি কাল্পনিক ডোমেন (Placeholder), এটি অনুমোদিত নয়। অনুগ্রহ করে আপনার আসল প্রোভাইডারের Base URL দিন (যেমন: https://api.openai.com/v1)";
      } else if (/Disallowed protocol "http:"/i.test(reasonRaw)) {
        friendlyReason =
          "মেটাডাটা বা সাধারণ HTTP অনুমোদিত নয় — অনলাইন এপিআই-এর জন্য নিরাপদ HTTPS আবশ্যক (https:// দিয়ে শুরু করুন)। লোকাল মডেলের জন্য ড্রপডাউন থেকে 'Ollama' বা 'LM Studio' নির্বাচন করুন।";
      } else if (/ENOTFOUND/i.test(reasonRaw) || /DNS resolution failed/i.test(reasonRaw)) {
        friendlyReason = `সার্ভারের ডোমেন ঠিকানা খুঁজে পাওয়া যায়নি (${redactSecrets(
          reasonRaw
        )}) — এই হোস্ট অনুমোদিত নয়। Base URL-এর বানান ও ইন্টারনেট সংযোগ সঠিক কিনা যাচাই করুন।`;
      }
      return res.json({
        ok: false,
        latencyMs,
        message: `❌ ${friendlyReason}`,
      });
    }
  }

  // Built-in Keyless Engine probe
  if (effectiveProvider === 'xrahat' || effectiveProvider === 'smfta_cloud') {
    const selectedCustomMdl = String(externalModel || '').trim();
    const reply = await callXrahatKeylessJson({
      systemInstruction: 'Reply with a short greeting in 3 words.',
      history: [{ role: 'user', content: 'Hello' }],
      timeoutMs: 10_000,
    });
    const latencyMs = Math.max(1, Math.round(performance.now() - startPerf));
    if (reply) {
      return res.json({
        ok: true,
        workingModel: selectedCustomMdl || 'smfta-core',
        latencyMs,
        message: `✅ SMFTA Core Engine সচল! (${latencyMs}ms) — উত্তর: "${reply.slice(
          0,
          40
        )}"`,
      });
    }
    return res.json({
      ok: false,
      latencyMs,
      message: '❌ ফ্রি ইঞ্জিন থেকে উত্তর পাওয়া যায়নি।',
    });
  }

  const keylessAllowed = isKeylessProvider(effectiveProvider);
  if (keys.length === 0 && !keylessAllowed) {
    const latencyMs = Math.max(1, Math.round(performance.now() - startPerf));
    return res.json({
      ok: false,
      latencyMs,
      message: '❌ কোনো API Key দেওয়া হয়নি। অনুগ্রহ করে সঠিক API Key দিন।',
    });
  }

  let effectiveBaseUrl = rawBaseUrl;
  if (effectiveProvider === 'custom' && !effectiveBaseUrl && keys[0]) {
    const detected = detectProviderFromKey(keys[0]);
    if (detected === 'gemini_custom') {
      effectiveBaseUrl = 'https://generativelanguage.googleapis.com/v1beta';
    } else if (detected && PROVIDER_ENDPOINTS[detected]?.url) {
      effectiveBaseUrl = PROVIDER_ENDPOINTS[detected].url.replace(/\/chat\/completions$/i, '');
    } else if (keys[0].startsWith('sk-')) {
      effectiveBaseUrl = 'https://api.openai.com/v1';
    }
  }

  if (effectiveProvider === 'custom' && !effectiveBaseUrl) {
    const latencyMs = Math.max(1, Math.round(performance.now() - startPerf));
    return res.json({
      ok: false,
      latencyMs,
      message:
        '❌ Custom Provider-এর জন্য Base URL দেওয়া আবশ্যক (যেমন: https://api.openai.com/v1 বা https://openrouter.ai/api/v1)।',
    });
  }

  let discoveredModels: string[] = [];
  const requestedExplicitModel = String(externalModel || '').trim();
  const normalizedEndpoint = normalizeEndpointUrl(effectiveProvider, effectiveBaseUrl, {
    respectCustomBaseUrl: true,
  });

  if (
    (effectiveProvider === 'codecraft' && keys[0]) ||
    effectiveProvider === 'custom' ||
    !requestedExplicitModel
  ) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5_000);
    try {
      const modelsUrl = normalizedEndpoint.replace(/\/chat\/completions$/i, '/models');
      const mHeaders: Record<string, string> = {
        Accept: 'application/json',
      };
      if (keys[0] && keys[0] !== 'keyless') {
        mHeaders['Authorization'] = `Bearer ${keys[0]}`;
      }
      const mRes = await fetch(modelsUrl, {
        method: 'GET',
        headers: mHeaders,
        signal: ctrl.signal,
      });
      if (mRes.ok) {
        const mData = (await mRes.json().catch(() => null)) as Record<
          string,
          unknown
        > | null;
        const rawList = Array.isArray(mData?.data)
          ? mData.data
          : Array.isArray(mData?.models)
          ? mData.models
          : [];
        discoveredModels = rawList
          .map((item: unknown) => {
            if (typeof item === 'string') return item;
            if (item && typeof item === 'object') {
              const obj = item as Record<string, unknown>;
              return String(obj.id || obj.name || '');
            }
            return '';
          })
          .filter(Boolean);
      }
    } catch {
      // Ignore discovery error during test-provider; discovery failure does not fail chat test (P1-03)
    } finally {
      clearTimeout(t);
    }
  }

  const inferredFromUrl = inferModelForCustomBaseUrl(effectiveBaseUrl);
  // P1-03: Always probe the exact selected model if the user provided one; only use discoveredModels[0] when user left model blank
  const effectiveProbeModel =
    effectiveProvider === 'gemini_custom' || effectiveProvider === 'gemini_openai'
      ? normalizeGeminiModelName(requestedExplicitModel)
      : requestedExplicitModel
      ? requestedExplicitModel
      : inferredFromUrl || discoveredModels[0] || PROVIDER_ENDPOINTS[effectiveProvider]?.defaultModel || 'gpt-4o-mini';

  const testedAt = new Date().toISOString();
  const configFingerprint = crypto
    .createHash('sha256')
    .update(
      `${effectiveProvider}|${normalizedEndpoint}|${effectiveProbeModel}|${keys.length}:${
        keys[0] ? keys[0].slice(-4) : 'nokey'
      }`
    )
    .digest('hex')
    .slice(0, 16);

  const isReasoningProbe = /mercury|o1|o3|o4|reasoner/i.test(effectiveProbeModel);
  const probeMaxTokens = isReasoningProbe ? 256 : 8;

  // Send a real probe through HardenedAIEngine (Phase 4.1 & P1-03)
  const engine = getSharedHardenedEngine();
  engine.resetEphemeralKeyPool();
  const built = buildAdHocProviderConfig({
    provider: effectiveProvider,
    externalKeys: keys,
    externalModel: effectiveProbeModel,
    externalBaseUrl: effectiveBaseUrl,
    maxOutputTokens: probeMaxTokens,
    contextWindow,
    discoveredModels,
    exactModelOnly: Boolean(requestedExplicitModel),
    respectCustomBaseUrl: true,
  });

  // Step 1: Test non-streaming request (stream: false)
  let probeRes = await engine.generate({
    userId: String(req.userId || 'provider_probe'),
    messages: [{ role: 'user', content: 'Say OK' }],
    preferredProviderId: effectiveProvider,
    preferredModelId: effectiveProbeModel,
    maxOutputTokens: probeMaxTokens,
    temperature: 0.7,
    customParams: parsedCustomParams,
    adHocProviders: built.adHocProviders,
    skipServerRegistry: true,
    overallDeadlineMs: 25_000,
    perAttemptTimeoutMs: 25_000,
  });

  // Only if the UI supplied the generic placeholder 'gpt-4o-mini' or left model blank,
  // automatically retry using discovered or candidate models. Never silently replace an explicit model like 'mercury-3'.
  const firstFailClass =
    !probeRes.ok && probeRes.attempts?.length
      ? probeRes.attempts[probeRes.attempts.length - 1]?.class
      : null;
  const isGenericPlaceholderModel = !requestedExplicitModel || requestedExplicitModel === 'gpt-4o-mini';
  if (
    !probeRes.ok &&
    isGenericPlaceholderModel &&
    (firstFailClass === 'MODEL_UNAVAILABLE' ||
      firstFailClass === 'BAD_REQUEST' ||
      firstFailClass === 'BAD_RESPONSE' ||
      firstFailClass === 'SERVER_ERROR')
  ) {
    const candidateModelsToTry = Array.from(
      new Set([
        inferredFromUrl,
        ...discoveredModels,
        'deepseek-chat',
        'gpt-4o-mini',
        'llama-3.3-70b-versatile',
        'gemini-3.8-flash',
        'claude-3-haiku',
        'default',
      ])
    ).filter((m): m is string => Boolean(m) && m !== effectiveProbeModel);

    for (const fallbackModel of candidateModelsToTry.slice(0, 4)) {
      engine.resetEphemeralKeyPool();
      const fallbackBuilt = buildAdHocProviderConfig({
        provider: effectiveProvider,
        externalKeys: keys,
        externalModel: fallbackModel,
        externalBaseUrl: effectiveBaseUrl,
        maxOutputTokens: 8,
        discoveredModels,
        exactModelOnly: false,
        respectCustomBaseUrl: true,
      });
      const retryRes = await engine.generate({
        userId: String(req.userId || 'provider_probe'),
        messages: [{ role: 'user', content: 'Say OK' }],
        preferredProviderId: effectiveProvider,
        preferredModelId: fallbackModel || undefined,
        maxOutputTokens: 8,
        temperature: 0.7,
        adHocProviders: fallbackBuilt.adHocProviders,
        skipServerRegistry: true,
        overallDeadlineMs: 15_000,
        perAttemptTimeoutMs: 15_000,
      });
      if (retryRes.ok) {
        probeRes = retryRes;
        break;
      }
    }
  }

  // Step 2: Test SSE streaming separately when requested (testStreaming === true)
  // OR when non-streaming failed with BAD_REQUEST / BAD_RESPONSE (some gateways require stream: true).
  let streamingTested = false;
  let supportsStreaming = true;
  let streamProbeText = '';

  if (probeRes.ok && testStreaming === true) {
    streamingTested = true;
    engine.resetEphemeralKeyPool();
    const streamRes = await engine.stream(
      {
        userId: String(req.userId || 'provider_probe_stream'),
        messages: [{ role: 'user', content: 'Say OK' }],
        preferredProviderId: effectiveProvider,
        preferredModelId: probeRes.modelId || effectiveProbeModel,
        maxOutputTokens: probeMaxTokens,
        temperature: 0.7,
        customParams: parsedCustomParams,
        adHocProviders: built.adHocProviders,
        skipServerRegistry: true,
        overallDeadlineMs: 15_000,
        perAttemptTimeoutMs: 15_000,
      },
      {
        onToken: (tok) => {
          streamProbeText += tok;
        },
      }
    );
    supportsStreaming = streamRes.ok && Boolean(streamProbeText.trim() || streamRes.text?.trim());
  } else if (
    !probeRes.ok &&
    (testStreaming === true ||
      firstFailClass === 'BAD_REQUEST' ||
      firstFailClass === 'BAD_RESPONSE')
  ) {
    streamingTested = true;
    engine.resetEphemeralKeyPool();
    const streamFallbackRes = await engine.stream(
      {
        userId: String(req.userId || 'provider_probe_stream'),
        messages: [{ role: 'user', content: 'Say OK' }],
        preferredProviderId: effectiveProvider,
        preferredModelId: effectiveProbeModel,
        maxOutputTokens: probeMaxTokens,
        temperature: 0.7,
        adHocProviders: built.adHocProviders,
        skipServerRegistry: true,
        overallDeadlineMs: 15_000,
        perAttemptTimeoutMs: 15_000,
      },
      {
        onToken: (tok) => {
          streamProbeText += tok;
        },
      }
    );
    if (streamFallbackRes.ok && (streamProbeText.trim() || streamFallbackRes.text?.trim())) {
      supportsStreaming = true;
      probeRes = {
        ok: true,
        requestId: streamFallbackRes.messageId,
        text: streamProbeText || streamFallbackRes.text,
        truncated: false,
        providerUsed: streamFallbackRes.providerUsed || effectiveProvider,
        providerId: streamFallbackRes.providerId || effectiveProvider,
        modelUsed: streamFallbackRes.modelUsed || effectiveProbeModel,
        modelId: streamFallbackRes.modelId || effectiveProbeModel,
        attempts: streamFallbackRes.attempts,
      };
    } else if (streamFallbackRes.attempts?.length) {
      probeRes.attempts = [...(probeRes.attempts || []), ...streamFallbackRes.attempts];
    }
  }

  const latencyMs = Math.max(1, Math.round(performance.now() - startPerf));
  const availableModelsForGateway =
    discoveredModels.length > 0
      ? discoveredModels
      : effectiveProvider === 'codecraft' || normalizedEndpoint.includes('codecraftapi.com')
      ? [...CODECRAFT_FALLBACK_MODELS]
      : [];

  if (probeRes.ok) {
    const workingModel =
      probeRes.modelId ||
      effectiveProbeModel ||
      built.adHocProviders[0]?.provider.models[0]?.model_id ||
      'default';
    const streamModeNote =
      streamingTested && !supportsStreaming
        ? ' [Batch mode — SSE streaming not supported by gateway, auto-switched to non-streaming]'
        : streamingTested && supportsStreaming
        ? ' [SSE Stream + Non-Stream verified]'
        : '';
    return res.json({
      ok: true,
      workingModel,
      testedProvider: effectiveProvider,
      testedModel: workingModel,
      normalizedEndpoint,
      testedAt,
      configFingerprint,
      discoveredModels: availableModelsForGateway,
      supportsStreaming,
      nonStreamingTested: true,
      streamingTested,
      latencyMs,
      message: `✅ কানেকশন সফল! সচল মডেল: ${workingModel} (${latencyMs}ms)${streamModeNote} — উত্তর: "${(
        probeRes.text || 'OK'
      ).slice(0, 35)}"`,
    });
  }

  const lastAttempt =
    probeRes.attempts && probeRes.attempts.length > 0
      ? probeRes.attempts[probeRes.attempts.length - 1]
      : null;
  const errorCode = lastAttempt?.class || 'SERVER_ERROR';
  const httpStatus = lastAttempt?.http_status ?? null;
  const upstreamError = sanitizeErrorMsg(lastAttempt?.error_message || '', keys);

  // Check whether the selected model ID (e.g. mercury-3) is invalid/unsupported on this gateway
  const isModelInvalidOnGateway =
    errorCode === 'MODEL_UNAVAILABLE' ||
    (errorCode === 'BAD_REQUEST' && /model|channel|unsupported|not\s+found|does\s+not\s+exist/i.test(upstreamError)) ||
    Boolean(
      requestedExplicitModel &&
        availableModelsForGateway.length > 0 &&
        !availableModelsForGateway.includes(requestedExplicitModel) &&
        (errorCode === 'BAD_REQUEST' || errorCode === 'SERVER_ERROR' || errorCode === 'BAD_RESPONSE')
    );

  const effectiveErrorCode = isModelInvalidOnGateway ? 'MODEL_UNAVAILABLE' : errorCode;

  // Capture the actual HTTP status and redacted provider error response in secure server logs
  engine.storage.appendAuditLog({
    eventType: 'PROVIDER_VERIFICATION_FAILED',
    providerId: effectiveProvider,
    details: {
      provider: effectiveProvider,
      endpoint: normalizedEndpoint,
      requested_model: effectiveProbeModel,
      http_status: httpStatus,
      error_code: effectiveErrorCode,
      upstream_error: upstreamError.slice(0, 300),
      non_streaming_tested: true,
      streaming_tested: streamingTested,
      available_models: availableModelsForGateway.slice(0, 20),
    },
  });

  const statusBadge = httpStatus ? `HTTP ${httpStatus}` : effectiveErrorCode;
  const upstreamSnippet = upstreamError ? ` — Upstream response: "${upstreamError.slice(0, 220)}"` : '';
  const availableModelsHint =
    availableModelsForGateway.length > 0
      ? ` সাপোর্টেড মডেলসমূহ: ${availableModelsForGateway.slice(0, 6).join(', ')}।`
      : /mercury/i.test(effectiveProbeModel)
      ? ' নোট: CodeCraft / OpenAI গেটওয়েতে "mercury-3" মডেলটি নেই (CodeCraft মডেল: gemini-3.8-flash, claude-sonnet-5, deepseek-v4-flash-0731; অথবা Inception Labs API-এর জন্য Base URL: https://api.inceptionlabs.ai/v1 ও মডেল: mercury / mercury-coder ব্যবহার করুন)।'
      : '';

  let detailedFailReason = '';
  if (effectiveErrorCode === 'AUTH_INVALID') {
    detailedFailReason = `API Key ভুল বা অনুমোদনহীন (${statusBadge} Unauthorized)${upstreamSnippet}। অনুগ্রহ করে সঠিক API Key ও Base URL যাচাই করুন।`;
  } else if (effectiveErrorCode === 'PERMISSION_DENIED') {
    detailedFailReason = `প্রোভাইডার অ্যাক্সেস প্রত্যাখ্যান করেছে (${statusBadge} Permission Denied)${upstreamSnippet}। এই মডেলের জন্য আপনার API Key-এর অনুমতি আছে কিনা দেখুন।`;
  } else if (effectiveErrorCode === 'MODEL_UNAVAILABLE') {
    detailedFailReason = `মডেল "${effectiveProbeModel}" এই গেটওয়েতে (${normalizedEndpoint}) বৈধ বা সচল নয় (${statusBadge} Model Not Found / Unsupported)${upstreamSnippet}।${availableModelsHint}`;
  } else if (effectiveErrorCode === 'QUOTA_EXHAUSTED') {
    detailedFailReason = `প্রোভাইডারের ব্যালেন্স বা কোটা শেষ (${statusBadge} Quota / Credits Exhausted)${upstreamSnippet}।`;
  } else if (effectiveErrorCode === 'RATE_LIMITED') {
    detailedFailReason = `রিকোয়েস্টের হার অতিক্রম করেছে (${statusBadge} Rate Limit 429)${upstreamSnippet}। অনুগ্রহ করে কিছুক্ষণ অপেক্ষা করুন।`;
  } else if (effectiveErrorCode === 'NETWORK_ERROR') {
    detailedFailReason = `Base URL (${normalizedEndpoint})-এ সংযোগ করা যায়নি (${statusBadge} Network Error)${upstreamSnippet}।`;
  } else if (effectiveErrorCode === 'TIMEOUT') {
    detailedFailReason = `টাইমআউট (${statusBadge}) — গেটওয়ে সার্ভার থেকে নির্ধারিত সময়ে কোনো উত্তর আসেনি${upstreamSnippet}।`;
  } else if (effectiveErrorCode === 'BAD_REQUEST') {
    detailedFailReason = `গেটওয়ে রিকোয়েস্টটি গ্রহণ করেনি (${statusBadge} Bad Request on model "${effectiveProbeModel}")${upstreamSnippet}।${availableModelsHint}`;
  } else if (effectiveErrorCode === 'BAD_RESPONSE') {
    detailedFailReason = `গেটওয়ে থেকে খালি বা অপ্রত্যাশিত রেসপন্স এসেছে (${statusBadge} Invalid Response on model "${effectiveProbeModel}")${upstreamSnippet}। Base URL-টি OpenAI-compatible /v1/chat/completions কিনা যাচাই করুন।`;
  } else {
    detailedFailReason = `${formatActionableProviderError(probeRes.attempts || [], 'bn')}${availableModelsHint}`;
  }

  return res.json({
    ok: false,
    errorCode: effectiveErrorCode,
    httpStatus,
    upstreamError,
    testedProvider: effectiveProvider,
    testedModel: effectiveProbeModel,
    normalizedEndpoint,
    testedAt,
    configFingerprint,
    suggestedModels: availableModelsForGateway,
    nonStreamingTested: true,
    streamingTested,
    latencyMs,
    message: `❌ কানেকশন ব্যর্থ: ${detailedFailReason}`,
  });
});
