import {
  AppSettings,
  ExternalProviderId,
  SavedProviderProfile,
} from '../types';
import {
  decryptSecret,
  encryptSecret,
  isEncrypted,
} from './secureKeystore';

/**
 * Shared provider metadata used by the Settings Hub (and any other surface
 * that needs to render an engine picker). Keeping this in one place means the
 * settings screen, the model menu and the server stay in sync.
 */

/**
 * The built-in keyless engines do not accept vendor model IDs — the server
 * routes them internally. Their only honest "models" are three reasoning
 * tiers exposed under stable SMFTA ids. Never display GPT/Claude/Gemini names
 * for these engines: those were fabricated placeholders, not real models.
 */
export interface BuiltinTier {
  id: 'fast' | 'balanced' | 'power';
  model: string;
  label: string;
  desc: string;
}

export const BUILTIN_TIERS: BuiltinTier[] = [
  {
    id: 'fast',
    model: 'smfta-flash',
    label: 'SMFTA Flash',
    desc: 'দ্রুত ও সরাসরি উত্তর · Fastest everyday answers',
  },
  {
    id: 'balanced',
    model: 'smfta-pro',
    label: 'SMFTA Pro',
    desc: 'ভারসাম্যপূর্ণ স্মার্ট উত্তর · Balanced reasoning',
  },
  {
    id: 'power',
    model: 'smfta-ultra',
    label: 'SMFTA Ultra',
    desc: 'গভীর বিশ্লেষণ · Deep, thorough analysis',
  },
];

export const BUILTIN_TIER_MODELS = BUILTIN_TIERS.map((t) => t.model);

export const V2_SPECIAL_MODEL_LABELS: Record<string, string> = {
  'smfta-v5': 'SMFTA V5',
  'smfta-v2-pro': 'SMFTA Pro',
  'smfta-max': 'SMFTA Max',
};

export function isV2SpecialModel(model?: string | null): boolean {
  const m = (model || '').trim().toLowerCase();
  return Boolean(V2_SPECIAL_MODEL_LABELS[m]);
}

export function isBuiltinProviderId(id?: string | null): boolean {
  return id === 'xrahat' || id === 'smfta_cloud';
}

export function isBuiltinTierModel(model?: string | null): boolean {
  const m = (model || '').trim().toLowerCase();
  return BUILTIN_TIER_MODELS.includes(m) || isV2SpecialModel(m);
}

/** Resolve the tier for a built-in profile (migrates legacy placeholders). */
export function builtinTierForModel(
  model?: string | null,
  mode?: string | null
): BuiltinTier {
  const m = (model || '').trim().toLowerCase();
  const byModel = BUILTIN_TIERS.find((t) => t.model === m);
  if (byModel) return byModel;
  if (m === 'smfta-v5') {
    return {
      id: 'fast',
      model: 'smfta-v5',
      label: 'SMFTA V5',
      desc: 'Firebase AI Logic · Speed & everyday tasks',
    };
  }
  if (m === 'smfta-v2-pro') {
    return {
      id: 'balanced',
      model: 'smfta-v2-pro',
      label: 'SMFTA Pro',
      desc: 'Firebase AI Logic · Advanced reasoning & complex tasks',
    };
  }
  if (m === 'smfta-max') {
    return {
      id: 'power',
      model: 'smfta-max',
      label: 'SMFTA Max',
      desc: 'Firebase AI Logic · Deeper analysis & demanding tasks',
    };
  }
  if (mode === 'fast') return BUILTIN_TIERS[0];
  if (mode === 'power') return BUILTIN_TIERS[2];
  return BUILTIN_TIERS[1];
}

/** Human label for the active built-in tier (used by chat UI). */
export function builtinTierLabel(
  model?: string | null,
  mode?: string | null
): string {
  const m = (model || '').trim().toLowerCase();
  if (V2_SPECIAL_MODEL_LABELS[m]) {
    return V2_SPECIAL_MODEL_LABELS[m];
  }
  return builtinTierForModel(model, mode).label;
}

export const DEFAULT_PROVIDER_MODELS: Record<string, string> = {
  mercury: 'mercury-3',
  inceptionlabs: 'mercury-3',
  xrahat: '',
  smfta_cloud: '',
  unorouter: 'google/gemini-2.5-flash',
  codecraft: 'gemini-3.7-flash',
  gemini_custom: 'gemini-2.5-flash',
  gemini_openai: 'gemini-2.5-flash',
  anthropic: 'claude-sonnet-4-20250514',
  openrouter: 'google/gemini-2.5-flash',
  groq: 'llama-3.3-70b-versatile',
  deepseek: 'deepseek-chat',
  openai: 'gpt-4o-mini',
  cerebras: 'llama-3.3-70b',
  mistral: 'mistral-small-latest',
  fireworks: 'accounts/fireworks/models/llama-v3p3-70b-instruct',
  together: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
  perplexity: 'sonar',
  xai: 'grok-2-latest',
  sambanova: 'Meta-Llama-3.3-70B-Instruct',
  github: 'gpt-4o-mini',
  nvidia: 'meta/llama-3.3-70b-instruct',
  huggingface: 'Qwen/Qwen2.5-72B-Instruct',
  novita: 'deepseek/deepseek-r1',
  hyperbolic: 'meta-llama/Llama-3.3-70B-Instruct',
  chutes: 'deepseek-ai/DeepSeek-V3',
  scaleway: 'llama-3.3-70b-instruct',
  nebius: 'meta-llama/Llama-3.3-70B-Instruct',
  cohere: 'command-r-plus-08-2024',
  cloudflare: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  lmstudio: 'local-model',
  ollama: 'llama3.2',
  custom: 'gpt-4o-mini',
};

export const DEFAULT_PROVIDER_BASE_URLS: Record<string, string> = {
  mercury: 'https://api.inceptionlabs.ai/v1/chat/completions',
  inceptionlabs: 'https://api.inceptionlabs.ai/v1/chat/completions',
  xrahat: '',
  smfta_cloud: '',
  custom: '',
  unorouter: 'https://api.unorouter.com/v1',
  codecraft: 'https://codecraftapi.com/v1',
  gemini_custom: '',
  gemini_openai: 'https://generativelanguage.googleapis.com/v1beta/openai',
  anthropic: 'https://api.anthropic.com/v1/messages',
  openrouter: 'https://openrouter.ai/api/v1',
  deepseek: 'https://api.deepseek.com/v1',
  openai: 'https://api.openai.com/v1',
  groq: 'https://api.groq.com/openai/v1',
  mistral: 'https://api.mistral.ai/v1',
  fireworks: 'https://api.fireworks.ai/inference/v1',
  together: 'https://api.together.xyz/v1',
  perplexity: 'https://api.perplexity.ai',
  xai: 'https://api.x.ai/v1',
  cerebras: 'https://api.cerebras.ai/v1',
  sambanova: 'https://api.sambanova.ai/v1',
  github: 'https://models.inference.ai.azure.com',
  nvidia: 'https://integrate.api.nvidia.com/v1',
  huggingface: 'https://router.huggingface.co/v1',
  novita: 'https://api.novita.ai/v3/openai',
  hyperbolic: 'https://api.hyperbolic.xyz/v1',
  chutes: 'https://llm.chutes.ai/v1',
  scaleway: 'https://api.scaleway.com/v1',
  nebius: 'https://api.studio.nebius.ai/v1',
  cohere: 'https://api.cohere.ai/compatibility/v1',
  cloudflare: '',
  lmstudio: 'http://localhost:1234/v1',
  ollama: 'http://localhost:11434/v1',
};

export const QUICK_PROVIDER_CHIPS: Record<string, string[]> = {
  mercury: ['mercury-3', 'mercury', 'mercury-coder'],
  inceptionlabs: ['mercury-3', 'mercury', 'mercury-coder'],
  xrahat: [
    'deepseek-r1',
    'gpt-4o',
    'claude-3.5-sonnet',
    'gemini-2.5-pro',
    'qwen-2.5-coder',
    'llama-3.3-70b',
  ],
  smfta_cloud: [
    'deepseek-r1',
    'gpt-4o',
    'claude-3.5-sonnet',
    'gemini-2.5-pro',
    'gemini-2.5-flash',
    'qwen-2.5-coder',
  ],
  unorouter: [
    'google/gemini-2.5-flash',
    'google/gemini-2.5-pro',
    'anthropic/claude-3.5-sonnet',
    'openai/gpt-4o-mini',
  ],
  codecraft: [
    'gemini-3.7-flash',
    'deepseek-v4-flash-0731',
    'claude-sonnet-5',
    'claude-opus-4.8',
  ],
  gemini_custom: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.5-flash-lite'],
  gemini_openai: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.5-flash-lite'],
  anthropic: ['claude-sonnet-4-20250514', 'claude-3-5-haiku-latest'],
  openrouter: [
    'google/gemini-2.5-flash',
    'openai/gpt-4o-mini',
    'deepseek/deepseek-chat',
    'deepseek/deepseek-r1',
  ],
  groq: [
    'llama-3.3-70b-versatile',
    'llama-3.1-8b-instant',
    'deepseek-r1-distill-llama-70b',
  ],
  deepseek: ['deepseek-chat', 'deepseek-reasoner'],
  openai: ['gpt-4o-mini', 'gpt-4o'],
  mistral: ['mistral-small-latest', 'mistral-large-latest'],
  fireworks: ['accounts/fireworks/models/llama-v3p3-70b-instruct'],
  together: ['meta-llama/Llama-3.3-70B-Instruct-Turbo'],
  perplexity: ['sonar', 'sonar-pro'],
  xai: ['grok-2-latest'],
  cerebras: ['llama-3.3-70b'],
  sambanova: ['Meta-Llama-3.3-70B-Instruct'],
  github: ['gpt-4o-mini', 'gpt-4o'],
  nvidia: ['meta/llama-3.3-70b-instruct', 'deepseek-ai/deepseek-r1'],
  huggingface: ['Qwen/Qwen2.5-72B-Instruct'],
  novita: ['deepseek/deepseek-r1'],
  hyperbolic: ['meta-llama/Llama-3.3-70B-Instruct'],
  chutes: ['deepseek-ai/DeepSeek-V3'],
  scaleway: ['llama-3.3-70b-instruct'],
  nebius: ['meta-llama/Llama-3.3-70B-Instruct'],
  cohere: ['command-r-plus-08-2024', 'command-r-08-2024'],
  cloudflare: ['@cf/meta/llama-3.3-70b-instruct-fp8-fast'],
  lmstudio: ['local-model'],
  ollama: ['llama3.2', 'qwen2.5', 'deepseek-r1'],
  custom: ['mercury-3', 'gpt-4o-mini', 'deepseek-r1', 'gemini-2.5-flash', 'claude-3.5-sonnet'],
};

export const PROVIDER_HELP_BN: Record<string, string> = {
  xrahat: 'Built-in keyless engine',
  smfta_cloud: 'Built-in cloud engine',
  mercury: 'Mercury 3 API',
  inceptionlabs: 'Mercury 3 API',
  custom: 'OpenAI-compatible endpoint',
  unorouter: 'UnoRouter API',
  codecraft: 'CodeCraft API',
  gemini_custom: 'Google Gemini API',
  gemini_openai: 'Gemini OpenAI-compatible API',
  anthropic: 'Anthropic Claude API',
  openrouter: 'OpenRouter API',
  groq: 'Groq Cloud API',
  deepseek: 'DeepSeek API',
  openai: 'OpenAI API',
  cerebras: 'Cerebras API',
  mistral: 'Mistral AI API',
  fireworks: 'Fireworks AI API',
  together: 'Together AI API',
  perplexity: 'Perplexity Sonar API',
  xai: 'xAI Grok API',
  sambanova: 'SambaNova API',
  github: 'GitHub Models API',
  nvidia: 'NVIDIA NIM API',
  huggingface: 'Hugging Face Router',
  novita: 'Novita AI API',
  hyperbolic: 'Hyperbolic API',
  chutes: 'Chutes AI API',
  scaleway: 'Scaleway AI API',
  nebius: 'Nebius AI Studio API',
  cohere: 'Cohere API',
  cloudflare: 'Cloudflare Workers AI',
  lmstudio: 'LM Studio Local Server',
  ollama: 'Ollama Local Server',
};

export type ProviderGroup = 'builtin' | 'popular' | 'custom' | 'local';

export interface ProviderCatalogEntry {
  id: ExternalProviderId;
  label: string;
  short: string;
  group: ProviderGroup;
  keyHint?: string;
  keyless?: boolean;
  docsUrl?: string;
  note: string;
}

export const PROVIDER_GROUP_LABELS: Record<ProviderGroup, string> = {
  builtin: 'Built-in',
  popular: 'Cloud Providers',
  custom: 'Custom & Gateways',
  local: 'Local Servers',
};

export const PROVIDER_CATALOG: ProviderCatalogEntry[] = [
  {
    id: 'mercury',
    label: 'Mercury (Inception Labs)',
    short: 'Mercury',
    group: 'popular',
    keyHint: 'sk-...',
    docsUrl: 'https://docs.inceptionlabs.ai',
    note: 'Mercury 3',
  },
  {
    id: 'inceptionlabs',
    label: 'Inception Labs (Mercury)',
    short: 'Mercury',
    group: 'popular',
    keyHint: 'sk-...',
    docsUrl: 'https://docs.inceptionlabs.ai',
    note: 'Mercury 3',
  },
  {
    id: 'gemini_custom',
    label: 'Google Gemini',
    short: 'Gemini',
    group: 'popular',
    keyHint: 'AIza...',
    docsUrl: 'https://aistudio.google.com/apikey',
    note: 'Gemini 2.5',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    short: 'OpenAI',
    group: 'popular',
    keyHint: 'sk-proj-...',
    docsUrl: 'https://platform.openai.com/api-keys',
    note: 'GPT-4o',
  },
  {
    id: 'anthropic',
    label: 'Anthropic Claude',
    short: 'Anthropic',
    group: 'popular',
    keyHint: 'sk-ant-...',
    docsUrl: 'https://console.anthropic.com',
    note: 'Claude 4 Sonnet',
  },
  {
    id: 'xrahat',
    label: 'SMFTA Core Engine',
    short: 'SMFTA Core',
    group: 'builtin',
    keyless: true,
    note: 'Built-in free engine',
  },
  {
    id: 'smfta_cloud',
    label: 'SMFTA Cloud',
    short: 'SMFTA Cloud',
    group: 'builtin',
    keyless: true,
    note: 'Built-in cloud engine',
  },
  {
    id: 'codecraft',
    label: 'CodeCraft API',
    short: 'CodeCraft',
    group: 'popular',
    keyHint: 'cc_...',
    docsUrl: 'https://codecraftapi.com/docs/chat-completions',
    note: 'CodeCraft API',
  },
  {
    id: 'gemini_openai',
    label: 'Gemini (OpenAI endpoint)',
    short: 'Gemini OA',
    group: 'popular',
    keyHint: 'AIza...',
    docsUrl: 'https://aistudio.google.com/apikey',
    note: 'OpenAI-compatible Gemini',
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    short: 'OpenRouter',
    group: 'popular',
    keyHint: 'sk-or-...',
    docsUrl: 'https://openrouter.ai/keys',
    note: 'Multi-model router',
  },
  {
    id: 'groq',
    label: 'Groq Cloud',
    short: 'Groq',
    group: 'popular',
    keyHint: 'gsk_...',
    docsUrl: 'https://console.groq.com/keys',
    note: 'Fast inference',
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    short: 'DeepSeek',
    group: 'popular',
    keyHint: 'sk-...',
    docsUrl: 'https://platform.deepseek.com/api_keys',
    note: 'DeepSeek V3 & R1',
  },
  {
    id: 'cerebras',
    label: 'Cerebras',
    short: 'Cerebras',
    group: 'popular',
    keyHint: 'csk-...',
    docsUrl: 'https://cloud.cerebras.ai',
    note: 'Fast inference',
  },
  {
    id: 'mistral',
    label: 'Mistral AI',
    short: 'Mistral',
    group: 'popular',
    keyHint: '...',
    docsUrl: 'https://console.mistral.ai/api-keys',
    note: 'Mistral models',
  },
  {
    id: 'fireworks',
    label: 'Fireworks AI',
    short: 'Fireworks',
    group: 'popular',
    keyHint: 'fw_...',
    docsUrl: 'https://fireworks.ai/account/api-keys',
    note: 'Open-weight inference',
  },
  {
    id: 'together',
    label: 'Together AI',
    short: 'Together',
    group: 'popular',
    keyHint: '...',
    docsUrl: 'https://api.together.xyz/settings/api-keys',
    note: 'Open-source models',
  },
  {
    id: 'perplexity',
    label: 'Perplexity Sonar',
    short: 'Perplexity',
    group: 'popular',
    keyHint: 'pplx-...',
    docsUrl: 'https://www.perplexity.ai/settings/api',
    note: 'Search models',
  },
  {
    id: 'xai',
    label: 'xAI (Grok)',
    short: 'Grok',
    group: 'popular',
    keyHint: 'xai-...',
    docsUrl: 'https://console.x.ai',
    note: 'Grok models',
  },
  {
    id: 'sambanova',
    label: 'SambaNova',
    short: 'SambaNova',
    group: 'popular',
    keyHint: '...',
    docsUrl: 'https://cloud.sambanova.ai',
    note: 'Llama 3.3 inference',
  },
  {
    id: 'github',
    label: 'GitHub Models',
    short: 'GitHub',
    group: 'popular',
    keyHint: 'ghp_...',
    docsUrl: 'https://github.com/settings/tokens',
    note: 'GitHub Models',
  },
  {
    id: 'nvidia',
    label: 'NVIDIA NIM',
    short: 'NVIDIA',
    group: 'popular',
    keyHint: 'nvapi-...',
    docsUrl: 'https://build.nvidia.com',
    note: 'NVIDIA NIM',
  },
  {
    id: 'huggingface',
    label: 'Hugging Face',
    short: 'HF Router',
    group: 'popular',
    keyHint: 'hf_...',
    docsUrl: 'https://huggingface.co/settings/tokens',
    note: 'HF Inference Router',
  },
  {
    id: 'novita',
    label: 'Novita AI',
    short: 'Novita',
    group: 'custom',
    keyHint: 'sk-...',
    docsUrl: 'https://novita.ai',
    note: 'Novita AI',
  },
  {
    id: 'hyperbolic',
    label: 'Hyperbolic',
    short: 'Hyperbolic',
    group: 'custom',
    keyHint: '...',
    docsUrl: 'https://app.hyperbolic.xyz',
    note: 'Hyperbolic AI',
  },
  {
    id: 'chutes',
    label: 'Chutes AI',
    short: 'Chutes',
    group: 'custom',
    keyHint: '...',
    docsUrl: 'https://chutes.ai',
    note: 'Chutes AI',
  },
  {
    id: 'scaleway',
    label: 'Scaleway AI',
    short: 'Scaleway',
    group: 'custom',
    keyHint: '...',
    docsUrl: 'https://console.scaleway.com',
    note: 'Scaleway AI',
  },
  {
    id: 'nebius',
    label: 'Nebius AI Studio',
    short: 'Nebius',
    group: 'custom',
    keyHint: '...',
    docsUrl: 'https://studio.nebius.ai',
    note: 'Nebius Studio',
  },
  {
    id: 'cohere',
    label: 'Cohere',
    short: 'Cohere',
    group: 'custom',
    keyHint: '...',
    docsUrl: 'https://dashboard.cohere.com/api-keys',
    note: 'Command R+',
  },
  {
    id: 'cloudflare',
    label: 'Cloudflare Workers AI',
    short: 'Cloudflare',
    group: 'custom',
    keyHint: '...',
    docsUrl: 'https://developers.cloudflare.com/workers-ai',
    note: 'Workers AI',
  },
  {
    id: 'unorouter',
    label: 'UnoRouter',
    short: 'UnoRouter',
    group: 'custom',
    keyHint: '...',
    docsUrl: 'https://unorouter.com',
    note: 'UnoRouter',
  },
  {
    id: 'custom',
    label: 'Custom API',
    short: 'Custom',
    group: 'custom',
    keyHint: 'sk-...',
    keyless: true,
    note: 'OpenAI-compatible endpoint',
  },
  {
    id: 'lmstudio',
    label: 'LM Studio',
    short: 'LM Studio',
    group: 'local',
    keyless: true,
    note: 'localhost:1234/v1',
  },
  {
    id: 'ollama',
    label: 'Ollama',
    short: 'Ollama',
    group: 'local',
    keyless: true,
    note: 'localhost:11434/v1',
  },
];

export function providerEntry(
  id?: string | null
): ProviderCatalogEntry | undefined {
  if (!id) return undefined;
  return PROVIDER_CATALOG.find((p) => p.id === id);
}

export function isKeylessProviderId(id?: string | null): boolean {
  if (id === 'custom') return true;
  const entry = providerEntry(id);
  return Boolean(entry?.keyless);
}

/** Mask a stored key so it can be shown safely in the UI. */
export function maskKey(key?: string): string {
  const value = (key || '').split(/[\n,;]+/)[0]?.trim() || '';
  if (!value) return '';
  if (value.length <= 8) return '••••';
  return `${value.slice(0, 4)}••••${value.slice(-4)}`;
}

export function countKeys(keys?: string): number {
  return (keys || '')
    .split(/[\n,;]+/)
    .map((k) => k.trim())
    .filter(Boolean).length;
}

export function detectProviderFromKey(apiKey: string): ExternalProviderId | null {
  const key = (apiKey || '').trim();
  if (!key) return null;
  if (key.startsWith('AIza')) return 'gemini_custom';
  if (key.startsWith('sk-ant-')) return 'anthropic';
  if (key.startsWith('gsk_')) return 'groq';
  if (key.startsWith('sk-or-')) return 'openrouter';
  if (key.startsWith('nvapi-')) return 'nvidia';
  if (key.startsWith('ghp_') || key.startsWith('github_pat_')) return 'github';
  if (key.startsWith('xai-')) return 'xai';
  if (key.startsWith('csk-')) return 'cerebras';
  if (key.startsWith('fw_')) return 'fireworks';
  if (key.startsWith('pplx-')) return 'perplexity';
  if (key.startsWith('hf_')) return 'huggingface';
  if (key.startsWith('cc_')) return 'codecraft';
  if (key.startsWith('sk-proj-') || key.startsWith('sk-svcacct-')) return 'openai';
  return null;
}

/**
 * Map a pasted key to the right provider — but ONLY when the prefix is
 * recognised. Unknown keys keep the current provider (an older build forced
 * them onto UnoRouter, which made freshly added keys fail silently).
 */
export function applyKeyToDraft(
  draft: AppSettings,
  value: string
): AppSettings {
  const trimmed = value.trim();
  const provider = draft.provider || 'xrahat';
  if (trimmed.length < 6) return { ...draft, externalKeys: value };

  const detected = detectProviderFromKey(trimmed);

  const endpointOwned =
    provider === 'custom' ||
    provider === 'ollama' ||
    provider === 'lmstudio' ||
    provider === 'gemini_openai';
  if (endpointOwned) {
    return { ...draft, externalKeys: value };
  }

  if (!detected) {
    if (provider === 'xrahat' || provider === 'smfta_cloud') {
      const target = draft.externalBaseUrl?.trim() ? 'custom' : 'openai';
      return {
        ...draft,
        provider: target as AppSettings['provider'],
        externalKeys: value,
        externalModel:
          draft.externalModel || DEFAULT_PROVIDER_MODELS[target] || '',
      };
    }
    return { ...draft, externalKeys: value };
  }

  if (detected === provider) {
    return { ...draft, externalKeys: value };
  }

  return {
    ...draft,
    provider: detected,
    externalKeys: value,
    externalModel: draft.externalModel || DEFAULT_PROVIDER_MODELS[detected] || '',
    externalBaseUrl:
      draft.externalBaseUrl || DEFAULT_PROVIDER_BASE_URLS[detected] || '',
  };
}

/* ---------------- saved provider profiles ---------------- */

export const SAVED_PROFILES_KEY = 'smfta_provider_profiles';

export const DEFAULT_BUILTIN_PROFILE: SavedProviderProfile = {
  id: 'default-builtin',
  name: 'Msfta shop ai',
  provider: 'xrahat',
  externalKeys: '',
  externalModel: 'smfta-pro',
  externalBaseUrl: '',
  availableModels: [...BUILTIN_TIER_MODELS],
  verified: true,
  statusMessage: 'Built-in Engine · Connected',
  quotaExhausted: false,
};

/**
 * Migrate profiles written by older builds: built-in keyless engines used to
 * carry fabricated vendor model IDs (gpt-4o-mini, claude-…, gemini-…). Normalise
 * them to the honest SMFTA tier list so no fake model ever reaches the UI.
 */
export function normalizeProviderProfile(
  p: SavedProviderProfile
): SavedProviderProfile {
  if (!isBuiltinProviderId(p.provider)) return p;
  const current = (p.externalModel || '').trim();
  return {
    ...p,
    availableModels: [...BUILTIN_TIER_MODELS],
    externalModel: isBuiltinTierModel(current)
      ? current
      : builtinTierForModel(current).model,
  };
}

export const VALID_CATALOG_PROVIDERS = new Set<string>(
  Object.keys(DEFAULT_PROVIDER_MODELS)
);

export function isValidProviderId(id: unknown): id is ExternalProviderId {
  return typeof id === 'string' && VALID_CATALOG_PROVIDERS.has(id);
}

export function loadSavedProfiles(
  opts: { keepSealed?: boolean } = {}
): SavedProviderProfile[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(SAVED_PROFILES_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (p): p is SavedProviderProfile =>
          Boolean(p) &&
          typeof (p as SavedProviderProfile).id === 'string' &&
          isValidProviderId((p as SavedProviderProfile).provider)
      )
      .map((p) => {
        const rawKeys =
          typeof p.externalKeys === 'string' ? p.externalKeys : '';
        const item: SavedProviderProfile = {
          id: p.id,
          name: typeof p.name === 'string' && p.name.trim() ? p.name : p.id,
          provider: p.provider,
          // Sealed (encrypted) keys must never surface through the sync path;
          // the async hydrator passes keepSealed and decrypts them after mount.
          externalKeys:
            !opts.keepSealed && isEncrypted(rawKeys) ? '' : rawKeys,
          externalModel: typeof p.externalModel === 'string' ? p.externalModel : '',
          externalBaseUrl:
            typeof p.externalBaseUrl === 'string' ? p.externalBaseUrl : '',
        };
        if (typeof p.customHeaders === 'string' && p.customHeaders.trim()) {
          item.customHeaders = p.customHeaders;
        }
        if (Array.isArray(p.availableModels)) {
          item.availableModels = p.availableModels.filter(
            (m): m is string => typeof m === 'string' && Boolean(m.trim())
          );
        }
        if (typeof p.verified === 'boolean') item.verified = p.verified;
        if (typeof p.verificationStatus === 'string') {
          item.verificationStatus = p.verificationStatus;
        }
        if (typeof p.verifiedModel === 'string') {
          item.verifiedModel = p.verifiedModel;
        }
        if (typeof p.verifiedEndpoint === 'string') {
          item.verifiedEndpoint = p.verifiedEndpoint;
        }
        if (typeof p.configFingerprint === 'string') {
          item.configFingerprint = p.configFingerprint;
        }
        if (typeof p.lastTestedAt === 'number') item.lastTestedAt = p.lastTestedAt;
        if (typeof p.statusMessage === 'string') item.statusMessage = p.statusMessage;
        if (typeof p.quotaExhausted === 'boolean') {
          item.quotaExhausted = p.quotaExhausted;
        }
        if (typeof p.enabled === 'boolean') {
          item.enabled = p.enabled;
        } else {
          item.enabled = true;
        }
        if (typeof p.contextWindow === 'number' && Number.isFinite(p.contextWindow)) {
          item.contextWindow = p.contextWindow;
        }
        if (typeof p.maxOutputTokens === 'number' && Number.isFinite(p.maxOutputTokens)) {
          item.maxOutputTokens = p.maxOutputTokens;
        }
        if (typeof p.supportsStreaming === 'boolean') {
          item.supportsStreaming = p.supportsStreaming;
        }
        if (Array.isArray(p.capabilities)) {
          item.capabilities = p.capabilities.filter(
            (c): c is string => typeof c === 'string' && Boolean(c.trim())
          );
        }
        return normalizeProviderProfile(item);
      });
  } catch {
    return [];
  }
}

export function getInitialProviderProfiles(
  settings?: AppSettings
): SavedProviderProfile[] {
  const saved = loadSavedProfiles();
  if (saved.length > 0) return saved;
  return [
    {
      ...DEFAULT_BUILTIN_PROFILE,
      enabled: true,
      supportsStreaming: true,
      name: settings?.displayName?.trim() || DEFAULT_BUILTIN_PROFILE.name,
      externalModel:
        settings?.externalModel?.trim() || DEFAULT_BUILTIN_PROFILE.externalModel,
    },
  ];
}

/**
 * Single authoritative resolver for the active provider profile (P1-20).
 * Ensures chat requests, model discovery, and Settings UI all derive from the same profile.
 */
export function resolveActiveProfile(
  settings: AppSettings,
  savedProfiles: SavedProviderProfile[]
): SavedProviderProfile {
  const enabledPool = savedProfiles.filter((p) => p.enabled !== false);
  const pool = enabledPool.length > 0 ? enabledPool : savedProfiles;
  if (pool.length === 0) {
    return {
      ...DEFAULT_BUILTIN_PROFILE,
      enabled: true,
      supportsStreaming: true,
      provider: isValidProviderId(settings.provider) ? settings.provider : 'xrahat',
      externalKeys: settings.externalKeys || '',
      externalModel: settings.externalModel || DEFAULT_BUILTIN_PROFILE.externalModel,
      externalBaseUrl: settings.externalBaseUrl || '',
    };
  }
  if (settings.activeProfileId) {
    const byId = pool.find((p) => p.id === settings.activeProfileId);
    if (byId) return byId;
  }
  const byProviderAndUrl = pool.find(
    (p) =>
      p.provider === settings.provider &&
      (p.externalBaseUrl || '').trim() === (settings.externalBaseUrl || '').trim()
  );
  if (byProviderAndUrl) return byProviderAndUrl;
  const byProvider = pool.find((p) => p.provider === settings.provider);
  if (byProvider) return byProvider;
  return pool[0];
}


/**
 * The ONLY model ids a surface is allowed to show as selectable.
 *
 * Built-in keyless engines expose the three SMFTA reasoning tiers. Every other
 * provider returns just the model the user picked plus the ids discovered from
 * the live provider endpoint (or explicitly typed in Settings). Hardcoded
 * vendor names are intentionally NOT injected: an unverified model must never
 * appear available, and the chat request always carries the exact id shown.
 * Returns an empty list when an external profile has no verified model yet —
 * callers render an explicit "verify in Settings" empty state instead.
 */
export function getModelsForProfile(
  profile?: SavedProviderProfile | null
): string[] {
  if (!profile || isBuiltinProviderId(profile.provider)) {
    return [...BUILTIN_TIER_MODELS];
  }
  const current = (profile.externalModel || '').trim();
  const discovered = Array.isArray(profile.availableModels)
    ? profile.availableModels.map((m) => m.trim()).filter(Boolean)
    : [];
  return Array.from(new Set([current, ...discovered].filter(Boolean)));
}

/**
 * v18.11 — secrets are encrypted at rest (AES-GCM via secureKeystore) before
 * anything touches localStorage. The write chain serializes overlapping saves
 * so an older snapshot can never overwrite a newer one.
 */
let profileWriteChain: Promise<'saved' | 'quota_exceeded' | 'blocked'> =
  Promise.resolve('saved');

function writeProfiles(
  list: SavedProviderProfile[]
): Promise<'saved' | 'quota_exceeded' | 'blocked'> {
  return (async () => {
    try {
      if (typeof localStorage === 'undefined') return 'blocked';
      const sealed = await Promise.all(
        list.map(async (p) => ({
          ...p,
          externalKeys: await encryptSecret(p.externalKeys || ''),
        }))
      );
      localStorage.setItem(SAVED_PROFILES_KEY, JSON.stringify(sealed));
      return 'saved';
    } catch (err) {
      const name = err instanceof Error ? err.name : '';
      if (name.includes('Quota') || name.includes('storage')) {
        return 'quota_exceeded';
      }
      return 'blocked';
    }
  })();
}

export function persistSavedProfiles(
  list: SavedProviderProfile[]
): 'saved' | 'quota_exceeded' | 'blocked' {
  if (typeof localStorage === 'undefined') return 'blocked';
  // Fire-and-forget but chained: callers keep their sync contract while the
  // actual write happens after encryption settles.
  profileWriteChain = profileWriteChain.then(() => writeProfiles(list));
  return 'saved';
}

/** Awaits any pending encrypted write (used by tests and backup flows). */
export function flushProfileWrites(): Promise<'saved' | 'quota_exceeded' | 'blocked'> {
  return profileWriteChain;
}

/** True when the stored profile blob currently contains encrypted secrets. */
export function hasSealedProfileSecrets(): boolean {
  try {
    if (typeof localStorage === 'undefined') return false;
    const raw = localStorage.getItem(SAVED_PROFILES_KEY);
    return typeof raw === 'string' && raw.includes('enc:v1:');
  } catch {
    return false;
  }
}

/**
 * Loads profiles and decrypts their keys. The sync `loadSavedProfiles()` is
 * kept for SSR/first paint (it returns empty key fields for sealed entries);
 * the app calls this async hydrator on mount before any provider request.
 */
export async function hydrateSavedProfiles(): Promise<SavedProviderProfile[]> {
  const sealed = loadSavedProfiles({ keepSealed: true });
  return Promise.all(
    sealed.map(async (p) => ({
      ...p,
      externalKeys: await decryptSecret(p.externalKeys || ''),
    }))
  );
}

export function providerReadiness(settings: AppSettings): {
  ready: boolean;
  title: string;
  detail: string;
} {
  const id = (settings.provider || 'xrahat') as ExternalProviderId;
  const entry = providerEntry(id);
  const hasKey = countKeys(settings.externalKeys) > 0;
  const model = (settings.externalModel || '').trim();
  const base = (settings.externalBaseUrl || '').trim();

  if (id === 'xrahat' || id === 'smfta_cloud') {
    return {
      ready: true,
      title: 'Ready — Keyless Mode Active',
      detail: model
        ? `Preferred model: ${model}`
        : 'Using automatic fast model',
    };
  }
  if (id === 'custom') {
    const firstKey = (settings.externalKeys || '').split(/[\n,;]+/)[0]?.trim() || '';
    const detected = detectProviderFromKey(firstKey);
    const inferredBase =
      base ||
      (detected ? DEFAULT_PROVIDER_BASE_URLS[detected] : '') ||
      (firstKey.startsWith('sk-') ? DEFAULT_PROVIDER_BASE_URLS.openai : '');
    if (!inferredBase) {
      return {
        ready: false,
        title: 'Base URL Required',
        detail: 'Please provide a Base URL for the custom provider.',
      };
    }
    return {
      ready: true,
      title: hasKey ? 'Custom API Ready' : 'Custom — Keyless Endpoint Ready',
      detail: `${inferredBase} · Model: ${model || 'Auto'}`,
    };
  }
  if (entry?.keyless) {
    return {
      ready: true,
      title: `${entry.short} — Local, No Key Required`,
      detail: base || DEFAULT_PROVIDER_BASE_URLS[id] || 'Local endpoint',
    };
  }
  if (!hasKey) {
    return {
      ready: false,
      title: 'API Key Required',
      detail: `${entry?.short || id} requires an API key (${entry?.keyHint || 'key'}).`,
    };
  }
  return {
    ready: true,
    title: 'Configuration Ready',
    detail: `${countKeys(settings.externalKeys)} key(s) · Model: ${
      model || DEFAULT_PROVIDER_MODELS[id] || 'Auto'
    }`,
  };
}
