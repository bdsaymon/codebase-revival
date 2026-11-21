import { ExternalProviderId } from '../types';
import {
  DEFAULT_PROVIDER_BASE_URLS,
  DEFAULT_PROVIDER_MODELS,
  PROVIDER_CATALOG,
  PROVIDER_GROUP_LABELS,
  PROVIDER_HELP_BN,
  QUICK_PROVIDER_CHIPS,
  ProviderCatalogEntry,
  ProviderGroup,
} from '../utils/providers';

export type ProviderTier =
  | 'builtin_free'
  | 'popular_cloud'
  | 'custom_gateway'
  | 'local_server';

export type ProviderProtocol =
  | 'openai_compatible'
  | 'gemini_native'
  | 'anthropic_native'
  | 'keyless_custom';

export interface UnifiedProviderCatalogItem extends ProviderCatalogEntry {
  tier: ProviderTier;
  protocol: ProviderProtocol;
  defaultModel: string;
  defaultBaseUrl: string;
  curatedModels: string[];
  helpTextBn: string;
}

function mapGroupToTier(group: ProviderGroup): ProviderTier {
  switch (group) {
    case 'builtin':
      return 'builtin_free';
    case 'popular':
      return 'popular_cloud';
    case 'local':
      return 'local_server';
    case 'custom':
    default:
      return 'custom_gateway';
  }
}

function resolveProtocol(id: ExternalProviderId): ProviderProtocol {
  if (id === 'xrahat' || id === 'smfta_cloud') return 'keyless_custom';
  if (id === 'gemini_custom') return 'gemini_native';
  if (id === 'anthropic') return 'anthropic_native';
  return 'openai_compatible';
}

export const PRIMARY_PROVIDER_OPTIONS: Array<{
  id: ExternalProviderId;
  label: string;
  short: string;
  defaultModel: string;
}> = [
  { id: 'mercury', label: 'Mercury', short: 'Mercury', defaultModel: 'mercury-3' },
  { id: 'gemini_custom', label: 'Gemini', short: 'Gemini', defaultModel: 'gemini-4-hydrogen' },
  { id: 'openai', label: 'OpenAI', short: 'OpenAI', defaultModel: 'gpt-4o-mini' },
  { id: 'anthropic', label: 'Anthropic', short: 'Anthropic', defaultModel: 'claude-sonnet-4-20250514' },
  { id: 'deepseek', label: 'DeepSeek', short: 'DeepSeek', defaultModel: 'deepseek-chat' },
  { id: 'groq', label: 'Groq', short: 'Groq', defaultModel: 'llama-3.3-70b-versatile' },
  { id: 'openrouter', label: 'OpenRouter', short: 'OpenRouter', defaultModel: 'openrouter/auto' },
  { id: 'mistral', label: 'Mistral', short: 'Mistral', defaultModel: 'mistral-large-latest' },
  { id: 'xai', label: 'xAI Grok', short: 'Grok', defaultModel: 'grok-3-mini' },
  { id: 'custom', label: 'Custom / OpenRouter', short: 'Custom / OpenRouter', defaultModel: 'mercury-3' },
];

export const UNIFIED_PROVIDER_CATALOG: UnifiedProviderCatalogItem[] =
  PROVIDER_CATALOG.map((entry) => ({
    ...entry,
    tier: mapGroupToTier(entry.group),
    protocol: resolveProtocol(entry.id),
    defaultModel:
      entry.id === 'mercury' || entry.id === 'inceptionlabs'
        ? 'mercury-3'
        : DEFAULT_PROVIDER_MODELS[entry.id] || '',
    defaultBaseUrl: DEFAULT_PROVIDER_BASE_URLS[entry.id] || '',
    curatedModels: QUICK_PROVIDER_CHIPS[entry.id] || [],
    helpTextBn: '',
  }));

export function getProviderCatalogItem(
  providerId: string
): UnifiedProviderCatalogItem | undefined {
  return UNIFIED_PROVIDER_CATALOG.find((item) => item.id === providerId);
}

export {
  DEFAULT_PROVIDER_BASE_URLS,
  DEFAULT_PROVIDER_MODELS,
  PROVIDER_CATALOG,
  PROVIDER_GROUP_LABELS,
  PROVIDER_HELP_BN,
  QUICK_PROVIDER_CHIPS,
};
