import { ExternalProviderId } from '../types';

export type ProviderProtocolType =
  | 'openai_compat'
  | 'anthropic_native'
  | 'gemini_native'
  | 'xrahat_custom'
  | 'cloudflare_workers_ai';

export type StableErrorCode =
  | 'AUTH_INVALID'
  | 'MODEL_UNAVAILABLE'
  | 'RATE_LIMITED'
  | 'QUOTA_EXHAUSTED'
  | 'BAD_REQUEST'
  | 'SERVER_ERROR'
  | 'TIMEOUT'
  | 'NETWORK_ERROR'
  | 'ABORTED'
  | 'BAD_RESPONSE'
  | 'EMPTY_RESPONSE';

export interface CanonicalEndpointResult {
  chatUrl: string;
  modelsUrl: string;
  protocol: ProviderProtocolType;
  usedPresetFallback: boolean;
  diagnostic?: string;
}

const PRESET_CHAT_URLS: Record<string, string> = {
  inceptionlabs: 'https://api.inceptionlabs.ai/v1/chat/completions',
  xrahat: 'https://xrahat-worm-ai.vercel.app/api/chat',
  smfta_cloud: 'https://xrahat-worm-ai.vercel.app/api/chat',
  unorouter: 'https://api.unorouter.com/v1/chat/completions',
  codecraft: 'https://codecraftapi.com/v1/chat/completions',
  gemini_custom:
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
  gemini_openai:
    'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
  anthropic: 'https://api.anthropic.com/v1/messages',
  groq: 'https://api.groq.com/openai/v1/chat/completions',
  openrouter: 'https://openrouter.ai/api/v1/chat/completions',
  deepseek: 'https://api.deepseek.com/v1/chat/completions',
  openai: 'https://api.openai.com/v1/chat/completions',
  cerebras: 'https://api.cerebras.ai/v1/chat/completions',
  mistral: 'https://api.mistral.ai/v1/chat/completions',
  fireworks: 'https://api.fireworks.ai/inference/v1/chat/completions',
  together: 'https://api.together.xyz/v1/chat/completions',
  perplexity: 'https://api.perplexity.ai/chat/completions',
  xai: 'https://api.x.ai/v1/chat/completions',
  sambanova: 'https://api.sambanova.ai/v1/chat/completions',
  github: 'https://models.inference.ai.azure.com/chat/completions',
  nvidia: 'https://integrate.api.nvidia.com/v1/chat/completions',
  huggingface: 'https://router.huggingface.co/v1/chat/completions',
  novita: 'https://api.novita.ai/v3/openai/chat/completions',
  hyperbolic: 'https://api.hyperbolic.xyz/v1/chat/completions',
  chutes: 'https://llm.chutes.ai/v1/chat/completions',
  scaleway: 'https://api.scaleway.ai/v1/chat/completions',
  nebius: 'https://api.studio.nebius.ai/v1/chat/completions',
  cohere: 'https://api.cohere.ai/compatibility/v1/chat/completions',
  cloudflare: 'https://api.cloudflare.com/client/v4/accounts',
  lmstudio: 'http://localhost:1234/v1/chat/completions',
  ollama: 'http://localhost:11434/v1/chat/completions',
};

export function resolveProviderProtocol(
  provider: ExternalProviderId | string
): ProviderProtocolType {
  if (provider === 'xrahat' || provider === 'smfta_cloud') {
    return 'xrahat_custom';
  }
  if (provider === 'gemini_custom') {
    return 'gemini_native';
  }
  if (provider === 'anthropic') {
    return 'anthropic_native';
  }
  if (provider === 'cloudflare') {
    return 'cloudflare_workers_ai';
  }
  return 'openai_compat';
}

/**
 * Pure, side-effect-free endpoint normalizer shared across Web server, Settings test,
 * and Android APK standalone client.
 */
export function canonicalizeProviderEndpoint(
  providerRaw: string,
  customUrlRaw?: string,
  options?: {
    respectCustomBaseUrl?: boolean;
    endpointMode?: 'base' | 'full';
  }
): CanonicalEndpointResult {
  const provider = (providerRaw || 'unorouter').trim();
  const protocol = resolveProviderProtocol(provider);
  const customInput = (customUrlRaw || '').trim();
  const respectCustom = options?.respectCustomBaseUrl ?? false;

  if (protocol === 'xrahat_custom') {
    return {
      chatUrl: PRESET_CHAT_URLS.xrahat,
      modelsUrl: PRESET_CHAT_URLS.xrahat,
      protocol,
      usedPresetFallback: Boolean(customInput),
      diagnostic: customInput
        ? 'Built-in keyless engine ignores custom base URL.'
        : undefined,
    };
  }

  let raw = '';
  let usedPresetFallback = false;

  const isAlwaysCustomUrlProvider =
    provider === 'custom' || provider === 'lmstudio' || provider === 'ollama';

  if (customInput && (isAlwaysCustomUrlProvider || respectCustom)) {
    raw = customInput;
  } else if (PRESET_CHAT_URLS[provider]) {
    raw = PRESET_CHAT_URLS[provider];
    if (customInput && !isAlwaysCustomUrlProvider && !respectCustom) {
      usedPresetFallback = true;
    }
  } else if (customInput) {
    raw = customInput;
  } else {
    raw = PRESET_CHAT_URLS.unorouter;
    usedPresetFallback = true;
  }

  raw = raw.replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(raw)) {
    raw = `https://${raw}`;
  }

  raw = raw.replace(
    /^https?:\/\/(www\.)?unorouter\.com(?=\/|$)/i,
    'https://api.unorouter.com'
  );
  raw = raw.replace(
    /^https?:\/\/((?:www|api)\.)?codecraftapi\.com(?=\/|$)/i,
    'https://codecraftapi.com'
  );
  if (/^https?:\/\/codecraftapi\.com(?:\/|$)/i.test(raw)) {
    if (
      /\/docs(?:\/|$)/i.test(raw) ||
      !/\/v1(?:\/chat\/completions|\/models)?$/i.test(raw)
    ) {
      return {
        chatUrl: PRESET_CHAT_URLS.codecraft,
        modelsUrl: 'https://codecraftapi.com/v1/models',
        protocol: 'openai_compat',
        usedPresetFallback: true,
        diagnostic: 'Repaired CodeCraft documentation URL to /v1/chat/completions',
      };
    }
  }

  if (protocol === 'anthropic_native') {
    const chatUrl = /\/v1\/messages$/i.test(raw)
      ? raw
      : /\/v1$/i.test(raw)
      ? `${raw}/messages`
      : `${raw}/v1/messages`;
    const modelsUrl = chatUrl.replace(/\/messages$/i, '/models');
    return { chatUrl, modelsUrl, protocol, usedPresetFallback };
  }

  if (protocol === 'gemini_native') {
    return {
      chatUrl: raw,
      modelsUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
      protocol,
      usedPresetFallback,
    };
  }

  let chatUrl = raw;
  if (options?.endpointMode === 'full') {
    chatUrl = raw;
  } else if (/\/chat\/completions$/i.test(raw) || /\/v1\/messages$/i.test(raw)) {
    chatUrl = raw;
  } else if (/\/chat$/i.test(raw)) {
    chatUrl = `${raw}/completions`;
  } else if (/\/v1beta\/openai$/i.test(raw)) {
    chatUrl = `${raw}/chat/completions`;
  } else if (/\/(?:v\d+|openai\/v\d+|api\/v\d+)$/i.test(raw)) {
    chatUrl = `${raw}/chat/completions`;
  } else if (/models\.inference\.ai\.azure\.com$/i.test(raw)) {
    chatUrl = `${raw}/chat/completions`;
  } else {
    chatUrl = `${raw}/v1/chat/completions`;
  }

  const modelsUrl = chatUrl
    .replace(/\/chat\/completions$/i, '/models')
    .replace(/\/messages$/i, '/models');

  return {
    chatUrl,
    modelsUrl,
    protocol,
    usedPresetFallback,
  };
}

export function computeProfileFingerprint(input: {
  provider?: string;
  baseUrl?: string;
  model?: string;
  keys?: string;
}): string {
  const provider = (input.provider || '').trim().toLowerCase();
  const baseUrl = (input.baseUrl || '').trim().replace(/\/+$/, '').toLowerCase();
  const model = (input.model || '').trim();
  const keys = (input.keys || '')
    .split(/[\n,;]+/)
    .map((k) => k.trim())
    .filter(Boolean);
  const keySig = keys
    .map((k) => `${k.length}:${k.slice(0, 3)}..${k.slice(-3)}`)
    .join(',');
  return `${provider}|${baseUrl}|${model}|${keySig}`;
}

export function classifyHttpFailure(
  status: number,
  bodyText = ''
): {
  code: StableErrorCode;
  retryable: boolean;
  quotaExhausted: boolean;
} {
  const lower = (bodyText || '').toLowerCase();
  if (status === 401 || status === 403) {
    return { code: 'AUTH_INVALID', retryable: false, quotaExhausted: false };
  }
  if (status === 404) {
    return { code: 'MODEL_UNAVAILABLE', retryable: false, quotaExhausted: false };
  }
  if (
    status === 402 ||
    (status === 429 &&
      /(insufficient_quota|billing|credit balance|out of credits|quota exceeded|payment required)/i.test(
        lower
      ))
  ) {
    return { code: 'QUOTA_EXHAUSTED', retryable: false, quotaExhausted: true };
  }
  if (status === 429) {
    return { code: 'RATE_LIMITED', retryable: true, quotaExhausted: false };
  }
  if (status >= 400 && status < 500) {
    if (/(model.*not found|does not exist|unsupported model)/i.test(lower)) {
      return { code: 'MODEL_UNAVAILABLE', retryable: false, quotaExhausted: false };
    }
    return { code: 'BAD_REQUEST', retryable: false, quotaExhausted: false };
  }
  return { code: 'SERVER_ERROR', retryable: true, quotaExhausted: false };
}
