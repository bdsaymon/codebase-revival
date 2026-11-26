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
  if (m === 'gemini-3.1-flash-lite' || m === 'gemini-3.5-flash-lite') return BUILTIN_TIERS[0];
  if (m === 'gemini-3-flash-preview' || m === 'gemini-4-hydrogen') return BUILTIN_TIERS[1];
  if (m === 'gemini-4-neon' || m === 'gemini-4-carbon') return BUILTIN_TIERS[2];
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
  unorouter: 'google/gemini-4-hydrogen',
  codecraft: 'gemini-4-hydrogen',
  gemini_custom: 'gemini-3-flash-preview',
  gemini_openai: 'gemini-3-flash-preview',
  anthropic: 'claude-sonnet-4-20250514',
  openrouter: 'google/gemini-4-hydrogen',
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
    'gemini-4-hydrogen',
    'gemini-3.1-flash-lite',
    'gemini-4-neon',
    'gemini-4-carbon',
  ],
  smfta_cloud: [
    'gemini-4-hydrogen',
    'gemini-3.1-flash-lite',
    'gemini-4-neon',
    'gemini-4-carbon',
  ],
  unorouter: [
    'google/gemini-4-hydrogen',
    'google/gemini-3.1-flash-lite',
    'anthropic/claude-3.5-sonnet',
    'openai/gpt-4o-mini',
  ],
  codecraft: [
    'gemini-4-hydrogen',
    'deepseek-v4-flash-0731',
    'claude-sonnet-5',
    'claude-opus-4.8',
  ],
  gemini_custom: ['gemini-4-hydrogen', 'gemini-3.1-flash-lite', 'gemini-4-neon', 'gemini-4-carbon'],
  gemini_openai: ['gemini-4-hydrogen', 'gemini-3.1-flash-lite', 'gemini-4-neon', 'gemini-4-carbon'],
  anthropic: ['claude-sonnet-4-20250514', 'claude-3-5-haiku-latest'],
  openrouter: [
    'google/gemini-4-hydrogen',
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
  custom: ['gpt-4o-mini', 'claude-sonnet-4-20250514', 'gemini-4-hydrogen', 'deepseek-r1'],
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
    label: 'Google Gemini (Server SDK)',
    short: 'Gemini',
    group: 'builtin',
    keyless: true,
    docsUrl: 'https://aistudio.google.com/apikey',
    note: 'Gemini 4 / 3.1 (Server Secret)',
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
    label: 'Gemini Server Engine',
    short: 'Gemini',
    group: 'builtin',
    keyless: true,
    note: 'Server Gemini SDK',
  },
  {
    id: 'smfta_cloud',
    label: 'SMFTA Cloud (Gemini)',
    short: 'Cloud',
    group: 'builtin',
    keyless: true,
    note: 'Server Gemini SDK',
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

export function isGoogleGeminiApiKey(apiKey: string): boolean {
  const key = (apiKey || '').trim();
  return key.startsWith('AIza') || key.startsWith('AQ.');
}

export function detectProviderFromKey(apiKey: string): ExternalProviderId | null {
  const key = (apiKey || '').trim();
  if (!key) return null;
  if (isGoogleGeminiApiKey(key)) return 'gemini_custom';
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
export function resolveGroqModel(requestedModel?: string): string {
  const clean = (requestedModel || '').trim();
  if (!clean) return 'llama-3.3-70b-versatile';
  const lower = clean.toLowerCase();
  if (
    lower.startsWith('llama-') ||
    lower.startsWith('llama3') ||
    lower.startsWith('mixtral-') ||
    lower.startsWith('gemma') ||
    lower.startsWith('qwen') ||
    lower.startsWith('deepseek-r1-distill') ||
    lower.startsWith('whisper-') ||
    lower.startsWith('openai/gpt-oss-') ||
    lower.startsWith('meta-llama/') ||
    lower.startsWith('moonshotai/')
  ) {
    return clean;
  }
  if (
    /\b(flash|fast|lite|mini|nano|instant)\b/i.test(lower) ||
    lower === 'smfta-v5'
  ) {
    return 'llama-3.1-8b-instant';
  }
  return 'llama-3.3-70b-versatile';
}

export function applyKeyToDraft(
  draft: AppSettings,
  value: string
): AppSettings {
  const trimmed = value.trim();
  const provider = draft.provider || 'xrahat';
  if (trimmed.length < 6) return { ...draft, externalKeys: value };

  const detected = detectProviderFromKey(trimmed);

  // Unambiguous Groq key should switch even from generic custom/default providers
  if (detected === 'groq' && provider !== 'ollama' && provider !== 'lmstudio') {
    return {
      ...draft,
      provider: 'groq',
      externalKeys: value,
      externalModel: resolveGroqModel(draft.externalModel),
      externalBaseUrl: DEFAULT_PROVIDER_BASE_URLS.groq || 'https://api.groq.com/openai/v1',
    };
  }

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

export const GEMINI_ACTIVE_MODELS = [
  'gemini-3-flash-preview',
  'gemini-3.1-flash-lite',
  'gemini-3.5-flash-lite',
  'gemini-flash-lite-latest',
  'gemini-4-hydrogen',
  'gemini-4-neon',
  'gemini-4-carbon',
];

export const DEFAULT_BUILTIN_PROFILE: SavedProviderProfile = {
  id: 'default-builtin',
  name: 'Google Gemini (Server)',
  provider: 'gemini_custom',
  externalKeys: '',
  externalModel: 'gemini-3-flash-preview',
  externalBaseUrl: '',
  availableModels: [...GEMINI_ACTIVE_MODELS],
  verified: true,
  statusMessage: 'Server Gemini SDK',
  quotaExhausted: false,
};

export function normalizeProviderProfile(
  p: SavedProviderProfile
): SavedProviderProfile {
  if (p.provider === 'gemini_custom' || isBuiltinProviderId(p.provider)) {
    const cleaned = (p.externalModel || '').trim();
    const isKeyless = !String(p.externalKeys || '').trim();
    // Auto-migrate stalled built-in defaults (gemini-4-hydrogen / gemini-3.8-flash)
    // on keyless server profiles so previously saved sessions immediately recover.
    const migratedModel =
      isKeyless &&
      (cleaned.toLowerCase() === 'gemini-4-hydrogen' ||
        cleaned.toLowerCase() === 'gemini-3.8-flash')
        ? 'gemini-3-flash-preview'
        : cleaned;
    return {
      ...p,
      availableModels: [...GEMINI_ACTIVE_MODELS, ...BUILTIN_TIER_MODELS],
      externalModel:
        GEMINI_ACTIVE_MODELS.includes(migratedModel) ||
        isBuiltinTierModel(migratedModel)
          ? migratedModel
          : 'gemini-3-flash-preview',
    };
  }
  return p;
}

export function findKeylessServerProfile(
  savedProfiles: SavedProviderProfile[]
): SavedProviderProfile {
  return (
    savedProfiles.find(
      (p) =>
        p.id === DEFAULT_BUILTIN_PROFILE.id ||
        isBuiltinProviderId(p.provider) ||
        ((p.provider === 'gemini_custom' || p.provider === 'gemini_openai') &&
          !String(p.externalKeys || '').trim())
    ) || DEFAULT_BUILTIN_PROFILE
  );
}

/**
 * Pure state transition for selecting a model from the Model Selector.
 * Ensures selecting any built-in V1 tier or V2 special model atomically
 * switches activeProfileId back to the keyless server profile, clears custom
 * credentials from active settings, and NEVER mutates custom user profiles.
 */
export function computeSelectModelTransition(params: {
  modelId: string;
  settings: AppSettings;
  savedProfiles: SavedProviderProfile[];
  activeProfile: SavedProviderProfile | null;
}): {
  nextSettingsPatch: Partial<AppSettings>;
  nextProfiles: SavedProviderProfile[];
  isBuiltinOrV2: boolean;
  tier: BuiltinTier | null;
  isV2: boolean;
} {
  const trimmed = params.modelId.trim();
  const isV2 = isV2SpecialModel(trimmed);
  const tier = BUILTIN_TIERS.find((t) => t.model === trimmed) || null;
  const isBuiltinOrV2 = isV2 || Boolean(tier);

  if (isBuiltinOrV2) {
    const builtinProf = findKeylessServerProfile(params.savedProfiles);
    const nextMode: AppSettings['mode'] = tier
      ? tier.id
      : trimmed === 'smfta-v5'
        ? 'fast'
        : trimmed === 'smfta-max'
          ? 'power'
          : 'balanced';

    const nextSettingsPatch: Partial<AppSettings> = {
      activeProfileId: builtinProf.id,
      provider: 'smfta_cloud',
      externalKeys: '',
      externalBaseUrl: '',
      externalModel: trimmed,
      displayName: builtinProf.name || DEFAULT_BUILTIN_PROFILE.name,
      mode: nextMode,
    };

    const hasBuiltinInList = params.savedProfiles.some(
      (p) => p.id === builtinProf.id
    );
    const updatedBuiltin: SavedProviderProfile = {
      ...builtinProf,
      provider: 'smfta_cloud',
      externalKeys: '',
      externalBaseUrl: '',
      externalModel: trimmed,
    };
    const nextProfiles = hasBuiltinInList
      ? params.savedProfiles.map((p) =>
          p.id === builtinProf.id ? updatedBuiltin : p
        )
      : [updatedBuiltin, ...params.savedProfiles];

    return {
      nextSettingsPatch,
      nextProfiles,
      isBuiltinOrV2: true,
      tier,
      isV2,
    };
  }

  const nextProfiles = params.activeProfile
    ? params.savedProfiles.map((p) =>
        p.id === params.activeProfile!.id ? { ...p, externalModel: trimmed } : p
      )
    : params.savedProfiles;

  return {
    nextSettingsPatch: { externalModel: trimmed },
    nextProfiles,
    isBuiltinOrV2: false,
    tier: null,
    isV2: false,
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
        if (typeof p.customParams === 'string' && p.customParams.trim()) {
          item.customParams = p.customParams;
        }
        if (typeof p.priority === 'number' && Number.isFinite(p.priority)) {
          item.priority = Math.max(0, Math.min(999, Math.round(p.priority)));
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

export function sortProvidersByPriority(
  profiles: SavedProviderProfile[],
  fallbackOrder?: string[]
): SavedProviderProfile[] {
  const orderMap = new Map<string, number>();
  (fallbackOrder || []).forEach((id, idx) => orderMap.set(id, idx));
  return [...profiles].sort((a, b) => {
    const idxA = orderMap.has(a.id) ? orderMap.get(a.id)! : a.priority ?? 100;
    const idxB = orderMap.has(b.id) ? orderMap.get(b.id)! : b.priority ?? 100;
    if (idxA !== idxB) return idxA - idxB;
    return 0;
  });
}

export function resolveFallbackProfileChain(
  activeProfileId: string | undefined,
  profiles: SavedProviderProfile[],
  fallbackOrder?: string[]
): SavedProviderProfile[] {
  const ordered = sortProvidersByPriority(
    profiles.filter((p) => p.enabled !== false && p.id !== activeProfileId),
    fallbackOrder
  );
  return ordered;
}

export function getAllVerifiedModelChoices(
  profiles: SavedProviderProfile[]
): Array<{ profileId: string; profileName: string; provider: ExternalProviderId; modelId: string }> {
  const choices: Array<{
    profileId: string;
    profileName: string;
    provider: ExternalProviderId;
    modelId: string;
  }> = [];
  const seen = new Set<string>();
  for (const prof of profiles) {
    if (prof.enabled === false) continue;
    const models = getModelsForProfile(prof);
    for (const modelId of models) {
      const key = `${prof.id}:${modelId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      choices.push({
        profileId: prof.id,
        profileName: prof.name,
        provider: prof.provider,
        modelId,
      });
    }
  }
  return choices;
}

export function resolveModelForSlot(
  slot: 'defaultModel' | 'fastModel' | 'reasoningModel' | 'visionModel',
  settings: AppSettings,
  profiles: SavedProviderProfile[]
): { profile?: SavedProviderProfile; modelId: string } | null {
  const rawSlotValue = (settings.modelSlots?.[slot] || '').trim();
  if (!rawSlotValue) return null;

  // Allow composite "profileId::modelId" or plain modelId
  const sep = rawSlotValue.indexOf('::');
  const targetProfId = sep > 0 ? rawSlotValue.slice(0, sep) : '';
  const targetModel = sep > 0 ? rawSlotValue.slice(sep + 2) : rawSlotValue;

  if (targetProfId) {
    const prof = profiles.find((p) => p.id === targetProfId && p.enabled !== false);
    if (prof && getModelsForProfile(prof).includes(targetModel)) {
      return { profile: prof, modelId: targetModel };
    }
  }

  for (const prof of profiles) {
    if (prof.enabled === false) continue;
    if (getModelsForProfile(prof).includes(targetModel)) {
      return { profile: prof, modelId: targetModel };
    }
  }
  if (BUILTIN_TIER_MODELS.includes(targetModel) || isV2SpecialModel(targetModel)) {
    const builtin = profiles.find((p) => isBuiltinProviderId(p.provider));
    return { profile: builtin, modelId: targetModel };
  }
  return null;
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
  if (!profile || profile.provider === 'gemini_custom' || isBuiltinProviderId(profile.provider)) {
    return [...GEMINI_ACTIVE_MODELS];
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
        list.map(async (p) => {
          const { decryptionFailed: _dropDecryptionFlag, ...rest } = p;
          return {
            ...rest,
            externalKeys: await encryptSecret(p.externalKeys || ''),
          };
        })
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
    sealed.map(async (p) => {
      const raw = String(p.externalKeys || '').trim();
      if (!raw) {
        return { ...p, externalKeys: '', decryptionFailed: false };
      }
      try {
        const plain = await decryptSecret(raw);
        return {
          ...p,
          externalKeys: plain,
          decryptionFailed: false,
        };
      } catch {
        return {
          ...p,
          externalKeys: '',
          decryptionFailed: true,
          verified: false,
          verificationStatus: 'failed' as const,
          statusMessage: 'এই ঠিকানায় আগের সেভ করা কী পড়া যায় না, আবার দিন।',
        };
      }
    })
  );
}

const FORBIDDEN_HEADER_NAMES = new Set([
  'host',
  'connection',
  'content-length',
  'transfer-encoding',
  'te',
  'trailer',
  'upgrade',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'cookie',
  'set-cookie',
]);

export function extractCustomEndpointFromParams(raw?: string): string {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return '';
  try {
    const parsed = JSON.parse(trimmed);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return '';
    }
    const rec = parsed as Record<string, unknown>;
    return String(
      rec.endpoint || rec.url || rec.baseUrl || rec.base_url || ''
    ).trim();
  } catch {
    return '';
  }
}

export function validateCustomJsonInputs(
  customHeaders?: string,
  customParams?: string
): {
  valid: boolean;
  error?: string;
  parsedHeaders?: Record<string, string>;
  parsedParams?: Record<string, unknown>;
} {
  let parsedHeaders: Record<string, string> | undefined;
  let parsedParams: Record<string, unknown> | undefined;

  const trimmedHeaders = String(customHeaders || '').trim();
  if (trimmedHeaders) {
    try {
      const obj = JSON.parse(trimmedHeaders);
      if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
        return {
          valid: false,
          error: 'Custom Headers অবশ্যই একটি বৈধ JSON অবজেক্ট ({...}) হতে হবে।',
        };
      }
      const cleanHeaders: Record<string, string> = {};
      for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
        const key = k.trim();
        if (!key || !/^[!#$%&'*+\-.^_`|~0-9a-zA-Z]+$/.test(key)) {
          return {
            valid: false,
            error: `অবৈধ HTTP হেডার নাম: "${k}"`,
          };
        }
        if (FORBIDDEN_HEADER_NAMES.has(key.toLowerCase())) {
          return {
            valid: false,
            error: `"${key}" হেডারটি নিরাপত্তার কারণে অনুমোদিত নয়।`,
          };
        }
        if (v !== undefined && v !== null) {
          const val = String(v);
          if (/[\r\n]/.test(val)) {
            return {
              valid: false,
              error: `"${key}" হেডার মানের মধ্যে নতুন লাইন (newline) থাকা যাবে না।`,
            };
          }
          cleanHeaders[key] = val;
        }
      }
      parsedHeaders = cleanHeaders;
    } catch (err) {
      return {
        valid: false,
        error: `Custom Headers JSON ফরম্যাট সঠিক নয়: ${
          err instanceof Error ? err.message : 'Syntax error'
        }`,
      };
    }
  }

  const trimmedParams = String(customParams || '').trim();
  if (trimmedParams) {
    try {
      const obj = JSON.parse(trimmedParams);
      if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
        return {
          valid: false,
          error: 'JSON Provider / Custom Params অবশ্যই একটি বৈধ JSON অবজেক্ট ({...}) হতে হবে।',
        };
      }
      parsedParams = obj as Record<string, unknown>;
    } catch (err) {
      return {
        valid: false,
        error: `Custom Params JSON ফরম্যাট সঠিক নয়: ${
          err instanceof Error ? err.message : 'Syntax error'
        }`,
      };
    }
  }

  return { valid: true, parsedHeaders, parsedParams };
}

/**
 * Validates non-empty custom Gemini API keys supplied by the user (AIza... or AQ... prefix).
 * Empty string is allowed when using the built-in server GEMINI_API_KEY on `gemini_custom`.
 */
export function validateGeminiApiKeyFormat(rawKeys: string): {
  valid: boolean;
  error?: string;
} {
  const keys = String(rawKeys || '')
    .split(/[\n,;]+/)
    .map((k) => k.trim())
    .filter(Boolean);
  if (keys.length === 0) {
    return { valid: true };
  }
  const invalid = keys.find(
    (k) => !isGoogleGeminiApiKey(k) || k.length < 20 || /\s/.test(k)
  );
  if (invalid) {
    return {
      valid: false,
      error:
        'ভুল Gemini API কী ফরম্যাট: কাস্টম Gemini কী অবশ্যই "AIza" বা "AQ." দিয়ে শুরু হতে হবে (কমপক্ষে ২০ অক্ষর, কোনো স্পেস ছাড়া)। Settings → Custom Providers থেকে সঠিক কী দিন।',
    };
  }
  return { valid: true };
}

/**
 * Formats upstream/provider errors into clear, actionable Bengali messages (without raw jargon).
 */
export function formatProviderErrorBn(params: {
  code?: string;
  httpStatus?: number | null;
  providerLabel?: string;
  modelName?: string;
  rawMessage?: string;
}): string {
  const code = String(params.code || '').toUpperCase();
  const status = params.httpStatus ?? 0;
  const raw = String(params.rawMessage || '').trim();
  const label = params.providerLabel || 'কাস্টম প্রোভাইডার';
  const model = params.modelName || 'নির্বাচিত মডেল';

  if (code === 'KEY_DECRYPT_FAILED' || /decrypt/i.test(raw)) {
    return 'এই ঠিকানায় আগের সেভ করা কী পড়া যায় না, আবার দিন। Settings → Custom Providers থেকে কী-টি পুনরায় সেভ করুন।';
  }
  if (status === 401 || status === 403 || code === 'AUTH_INVALID') {
    return `${label} API কী সঠিক নয় বা অনুমতি নেই (HTTP ${status || 401})। Settings → Custom Providers থেকে সঠিক কী আপডেট করুন।`;
  }
  if (status === 404 || code === 'MODEL_NOT_FOUND') {
    return `"${model}" মডেল বা এন্ডপয়েন্ট ${label}-এ পাওয়া যায়নি (404)। Settings থেকে বৈধ মডেল বা Base URL পরীক্ষা করুন।`;
  }
  if (status === 429 || code === 'RATE_LIMITED') {
    return `${label}-এ সাময়িক রিকোয়েস্ট সীমা (429) শেষ হয়েছে। একটু অপেক্ষা করে আবার চেষ্টা করুন বা অন্য প্রোভাইডার বেছে নিন।`;
  }
  if (status === 402 || code === 'QUOTA_EXCEEDED' || /credit|billing|insufficient/i.test(raw)) {
    return `${label} অ্যাকাউন্টের কোটা বা ক্রেডিট শেষ (402)। প্রোভাইডারের বিলিং চেক করুন অথবা অন্য প্রোভাইডারে সুইচ করুন।`;
  }
  if (status === 400 || code === 'BAD_REQUEST') {
    return `${label} রিকোয়েস্টটি গ্রহণ করেনি (400: ${raw.slice(0, 120) || 'মডেল বা প্যারামিটার ভুল'})। মডেল নাম ও Base URL যাচাই করুন।`;
  }
  if (code === 'TIMEOUT' || /timeout|timed\s*out/i.test(raw)) {
    return `${label} সার্ভার থেকে উত্তর আসতে দেরি হয়েছে (Timeout)। আবার চেষ্টা করুন।`;
  }
  if (code === 'UPSTREAM_NETWORK' || /network|fetch|econn|enotfound/i.test(raw)) {
    return `${label} সার্ভারে সংযোগ করা যায়নি। ইন্টারনেট বা Base URL ঠিক আছে কিনা দেখুন।`;
  }
  return raw || `${label} থেকে উত্তর আনা যায়নি। আবার চেষ্টা করুন।`;
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
    const paramEndpoint = extractCustomEndpointFromParams(settings.customParams);
    const inferredBase =
      base ||
      paramEndpoint ||
      (detected ? DEFAULT_PROVIDER_BASE_URLS[detected] : '') ||
      (firstKey.startsWith('sk-') ? DEFAULT_PROVIDER_BASE_URLS.openai : '');
    if (!inferredBase) {
      return {
        ready: false,
        title: 'Base URL Required',
        detail: 'Please provide a Base URL or JSON Gateway endpoint for the custom provider.',
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
