import { AppSettings } from '../types';
import { DEFAULT_ENABLED_TOOLS } from './capabilityRegistry';

export const SETTINGS_SCHEMA_VERSION = 19;

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'light',
  themeMode: 'system',
  mode: 'fast',
  style: 'concise',
  replyLang: 'auto',
  vlang: 'bn-BD',
  appLanguage: 'bn',
  creativity: 'balanced',
  accent: 'indigo',
  accentCustom: '#6366f1',
  fontsize: 'normal',
  fontFamily: 'geist',
  radius: 'soft',
  density: 'cozy',
  bubbleStyle: 'rounded',
  reducedMotion: false,
  mono: false,
  autoVoice: false,
  sendOnEnter: true,
  proactiveAuto: false,
  customInst: '',
  autoMemory: true,
  includeHistory: true,
  maxHistoryMessages: 18,
  customCss: '',
  // Modern Productivity
  workPersona: 'allrounder',
  voiceSpeed: 1.0,
  smartFormatting: true,
  // Out-of-the-box engine: keyless free API (no setup needed at all).
  provider: 'xrahat',
  externalKeys: '',
  externalModel: '',
  externalBaseUrl: '',
  allowKeylessFallback: false,
  // Spec defaults: temperature 0.7 · top P 0.9 · max output tokens 1024.
  weightTemp: 0.7,
  topP: 0.9,
  maxOutputTokens: 4096,
  trainingData: '',
  fastDecision: true,
  thinkingMode: 'medium',
  gpuAccel: true,
  memoryCache: true,
  // v18.11 settings system
  autoSaveChat: true,
  streamingReveal: true,
  markdownRender: true,
  codeHighlight: true,
  autoScroll: true,
  showTimestamps: true,
  showTokenUsage: false,
  responseTone: 'friendly',
  codingPrefs: '',
  notifEnabled: false,
  notifTaskDone: true,
  notifErrors: true,
  notifUsageLimit: true,
  notifSound: false,
  retentionDays: 0,
  maxRetries: 2,
  requestTimeoutSec: 120,
  dailyMessageLimit: 0,
  webSearchDefault: false,
  maxUploadMb: 10,
  accountEmail: '',
  avatarDataUrl: '',
  // v19.0.0 settings system
  settingsVersion: SETTINGS_SCHEMA_VERSION,
  newChatDefaultMode: 'last',
  codeFontSize: 'normal',
  codeBlockTheme: 'dark',
  messageSpacing: 'normal',
  layoutWidth: 'standard',
  highContrast: false,
  focusRingVisible: true,
  largeTouchTargets: false,
  diagnosticsEnabled: false,
  enabledTools: { ...DEFAULT_ENABLED_TOOLS },
};


export const VALID_PROVIDERS: ReadonlyArray<NonNullable<AppSettings['provider']>> = [
  'xrahat',
  'smfta_cloud',
  'mercury',
  'inceptionlabs',
  'custom',
  'gemini_custom',
  'gemini_openai',
  'anthropic',
  'unorouter',
  'codecraft',
  'openrouter',
  'groq',
  'deepseek',
  'openai',
  'cerebras',
  'mistral',
  'together',
  'fireworks',
  'perplexity',
  'sambanova',
  'xai',
  'github',
  'nvidia',
  'huggingface',
  'novita',
  'hyperbolic',
  'chutes',
  'scaleway',
  'nebius',
  'cohere',
  'cloudflare',
  'lmstudio',
  'ollama',
];

/**
 * Keeps stored settings clean & valid. Drops unknown/legacy fields, clamps
 * enum values and trims strings so an outdated localStorage blob can never
 * break the app ("key যোগ করলে কাজ করে না" class of bugs).
 */
export function sanitizeSettings(input: unknown): AppSettings {
  const raw = (input && typeof input === 'object' ? input : {}) as Record<
    string,
    unknown
  >;
  const str = (v: unknown, fallback: string) =>
    typeof v === 'string' ? v : fallback;
  const bool = (v: unknown, fallback: boolean) =>
    typeof v === 'boolean' ? v : fallback;
  const num = (v: unknown, min: number, max: number, fallback: number) =>
    typeof v === 'number' && Number.isFinite(v)
      ? Math.min(max, Math.max(min, Number(v.toFixed(2))))
      : fallback;
  const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T) =>
    typeof v === 'string' && (allowed as readonly string[]).includes(v)
      ? (v as T)
      : fallback;

  const provider = oneOf(
    raw.provider,
    VALID_PROVIDERS,
    DEFAULT_SETTINGS.provider as NonNullable<AppSettings['provider']>
  );
  const externalKeys = str(raw.externalKeys, '').slice(0, 4000);

  // A key prefix is not a reliable vendor identity; preserve the user's selection.

  let externalModel = str(raw.externalModel, '').trim().slice(0, 200);
  if (/^gemini-1\.5/i.test(externalModel)) {
    externalModel = 'gemini-2.5-flash';
  }

  // Clamp (and round) instead of rejecting: an outdated/corrupt stored value
  // still yields a safe in-range setting rather than silently resetting it.
  const int = (v: unknown, min: number, max: number, fallback: number) => {
    if (typeof v !== 'number' || !Number.isFinite(v)) return fallback;
    return Math.min(max, Math.max(min, Math.round(v)));
  };

  const hex = (v: unknown, fallback: string) =>
    typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v.trim())
      ? v.trim().toLowerCase()
      : fallback;

  return {
    theme: oneOf(raw.theme, ['light', 'dark'] as const, DEFAULT_SETTINGS.theme),
    themeMode: oneOf(
      raw.themeMode,
      ['dark', 'light', 'system'] as const,
      DEFAULT_SETTINGS.themeMode ?? 'system'
    ),
    mode: oneOf(
      raw.mode,
      ['fast', 'balanced', 'power'] as const,
      DEFAULT_SETTINGS.mode
    ),
    style: oneOf(
      raw.style,
      ['concise', 'detailed'] as const,
      DEFAULT_SETTINGS.style
    ),
    replyLang: oneOf(
      raw.replyLang,
      ['auto', 'bn', 'en'] as const,
      DEFAULT_SETTINGS.replyLang
    ),
    vlang: oneOf(
      raw.vlang,
      ['bn-BD', 'en-US', 'hi-IN'] as const,
      DEFAULT_SETTINGS.vlang
    ),
    appLanguage: oneOf(
      raw.appLanguage,
      ['bn', 'en', 'hi'] as const,
      DEFAULT_SETTINGS.appLanguage ?? 'bn'
    ),
    creativity: oneOf(
      raw.creativity,
      ['precise', 'balanced', 'creative'] as const,
      DEFAULT_SETTINGS.creativity
    ),
    accent: oneOf(
      raw.accent,
      ['indigo', 'emerald', 'rose', 'amber', 'sky', 'teal', 'custom'] as const,
      DEFAULT_SETTINGS.accent
    ),
    accentCustom: hex(raw.accentCustom, DEFAULT_SETTINGS.accentCustom ?? '#6366f1'),
    fontsize: oneOf(
      raw.fontsize,
      ['small', 'normal', 'large'] as const,
      DEFAULT_SETTINGS.fontsize
    ),
    fontFamily: oneOf(
      raw.fontFamily,
      ['geist', 'inter', 'system', 'mono'] as const,
      DEFAULT_SETTINGS.fontFamily ?? 'geist'
    ),
    bubbleStyle: oneOf(
      raw.bubbleStyle,
      ['rounded', 'sharp', 'minimal'] as const,
      DEFAULT_SETTINGS.bubbleStyle ?? 'rounded'
    ),
    reducedMotion: bool(raw.reducedMotion, DEFAULT_SETTINGS.reducedMotion ?? false),
    radius: oneOf(
      raw.radius,
      ['sharp', 'soft', 'round'] as const,
      DEFAULT_SETTINGS.radius ?? 'soft'
    ),
    density: oneOf(
      raw.density,
      ['compact', 'cozy', 'spacious'] as const,
      DEFAULT_SETTINGS.density ?? 'cozy'
    ),
    mono: bool(raw.mono, DEFAULT_SETTINGS.mono),
    autoVoice: bool(raw.autoVoice, DEFAULT_SETTINGS.autoVoice),
    sendOnEnter: bool(raw.sendOnEnter, DEFAULT_SETTINGS.sendOnEnter),
    proactiveAuto: bool(raw.proactiveAuto, DEFAULT_SETTINGS.proactiveAuto),
    customInst: str(raw.customInst, DEFAULT_SETTINGS.customInst).slice(0, 4000),
    autoMemory: bool(raw.autoMemory, DEFAULT_SETTINGS.autoMemory),
    includeHistory: bool(raw.includeHistory, DEFAULT_SETTINGS.includeHistory ?? true),
    maxHistoryMessages: int(raw.maxHistoryMessages, 1, 40, DEFAULT_SETTINGS.maxHistoryMessages ?? 18),
    customCss: str(raw.customCss, '').slice(0, 20000),
    workPersona: oneOf(
      raw.workPersona,
      ['allrounder', 'office', 'developer', 'content', 'academic'] as const,
      DEFAULT_SETTINGS.workPersona ?? 'allrounder'
    ),
    voiceSpeed: num(raw.voiceSpeed, 0.5, 2.0, DEFAULT_SETTINGS.voiceSpeed ?? 1.0),
    smartFormatting: bool(
      raw.smartFormatting,
      DEFAULT_SETTINGS.smartFormatting ?? true
    ),
    provider,
    externalKeys,
    externalModel,
    externalBaseUrl: str(raw.externalBaseUrl, '').slice(0, 500),
    customHeaders: str(raw.customHeaders, '').slice(0, 2000),
    activeProfileId: str(raw.activeProfileId, '').trim().slice(0, 120),
    displayName: str(raw.displayName, '').trim().slice(0, 80),
    allowKeylessFallback: bool(
      raw.allowKeylessFallback,
      DEFAULT_SETTINGS.allowKeylessFallback ?? false
    ),
    weightTemp: num(raw.weightTemp, 0.1, 1.2, DEFAULT_SETTINGS.weightTemp ?? 0.7),
    topP: num(raw.topP, 0.1, 1.0, DEFAULT_SETTINGS.topP ?? 0.9),
    maxOutputTokens: int(raw.maxOutputTokens, 256, 32768, DEFAULT_SETTINGS.maxOutputTokens ?? 4096),
    trainingData: str(raw.trainingData, '').slice(0, 4000),
    fastDecision: bool(raw.fastDecision, DEFAULT_SETTINGS.fastDecision ?? true),
    thinkingMode: oneOf(
      raw.thinkingMode,
      ['off', 'low', 'medium', 'high'] as const,
      DEFAULT_SETTINGS.thinkingMode ?? 'medium'
    ),
    gpuAccel: bool(raw.gpuAccel, DEFAULT_SETTINGS.gpuAccel ?? true),
    memoryCache: bool(raw.memoryCache, DEFAULT_SETTINGS.memoryCache ?? true),
    // ── v18.11 fields ──────────────────────────────────────────────────────
    autoSaveChat: bool(raw.autoSaveChat, DEFAULT_SETTINGS.autoSaveChat ?? true),
    streamingReveal: bool(raw.streamingReveal, DEFAULT_SETTINGS.streamingReveal ?? true),
    markdownRender: bool(raw.markdownRender, DEFAULT_SETTINGS.markdownRender ?? true),
    codeHighlight: bool(raw.codeHighlight, DEFAULT_SETTINGS.codeHighlight ?? true),
    autoScroll: bool(raw.autoScroll, DEFAULT_SETTINGS.autoScroll ?? true),
    showTimestamps: bool(raw.showTimestamps, DEFAULT_SETTINGS.showTimestamps ?? true),
    showTokenUsage: bool(raw.showTokenUsage, DEFAULT_SETTINGS.showTokenUsage ?? false),
    responseTone: oneOf(
      raw.responseTone,
      ['professional', 'friendly', 'creative', 'concise', 'technical'] as const,
      DEFAULT_SETTINGS.responseTone ?? 'friendly'
    ),
    codingPrefs: str(raw.codingPrefs, '').slice(0, 500),
    notifEnabled: bool(raw.notifEnabled, DEFAULT_SETTINGS.notifEnabled ?? false),
    notifTaskDone: bool(raw.notifTaskDone, DEFAULT_SETTINGS.notifTaskDone ?? true),
    notifErrors: bool(raw.notifErrors, DEFAULT_SETTINGS.notifErrors ?? true),
    notifUsageLimit: bool(raw.notifUsageLimit, DEFAULT_SETTINGS.notifUsageLimit ?? true),
    notifSound: bool(raw.notifSound, DEFAULT_SETTINGS.notifSound ?? false),
    retentionDays: int(raw.retentionDays, 0, 3650, DEFAULT_SETTINGS.retentionDays ?? 0),
    maxRetries: int(raw.maxRetries, 0, 4, DEFAULT_SETTINGS.maxRetries ?? 2),
    requestTimeoutSec: int(raw.requestTimeoutSec, 30, 240, DEFAULT_SETTINGS.requestTimeoutSec ?? 120),
    dailyMessageLimit: int(raw.dailyMessageLimit, 0, 10000, DEFAULT_SETTINGS.dailyMessageLimit ?? 0),
    webSearchDefault: bool(raw.webSearchDefault, DEFAULT_SETTINGS.webSearchDefault ?? false),
    maxUploadMb: int(raw.maxUploadMb, 1, 25, DEFAULT_SETTINGS.maxUploadMb ?? 10),
    accountEmail: str(raw.accountEmail, '').trim().slice(0, 120),
    avatarDataUrl: str(raw.avatarDataUrl, '').slice(0, 120_000),
    // ── v19.0.0 fields ─────────────────────────────────────────────────────
    settingsVersion: SETTINGS_SCHEMA_VERSION,
    newChatDefaultMode: oneOf(
      raw.newChatDefaultMode,
      ['last', 'fast', 'balanced', 'power'] as const,
      DEFAULT_SETTINGS.newChatDefaultMode ?? 'last'
    ),
    codeFontSize: oneOf(
      raw.codeFontSize,
      ['small', 'normal', 'large'] as const,
      DEFAULT_SETTINGS.codeFontSize ?? 'normal'
    ),
    codeBlockTheme: oneOf(
      raw.codeBlockTheme,
      ['dark', 'high-contrast', 'minimal'] as const,
      DEFAULT_SETTINGS.codeBlockTheme ?? 'dark'
    ),
    messageSpacing: oneOf(
      raw.messageSpacing,
      ['compact', 'normal', 'relaxed'] as const,
      DEFAULT_SETTINGS.messageSpacing ?? 'normal'
    ),
    layoutWidth: oneOf(
      raw.layoutWidth,
      ['standard', 'wide', 'full'] as const,
      DEFAULT_SETTINGS.layoutWidth ?? 'standard'
    ),
    highContrast: bool(raw.highContrast, DEFAULT_SETTINGS.highContrast ?? false),
    focusRingVisible: bool(raw.focusRingVisible, DEFAULT_SETTINGS.focusRingVisible ?? true),
    largeTouchTargets: bool(raw.largeTouchTargets, DEFAULT_SETTINGS.largeTouchTargets ?? false),
    diagnosticsEnabled: bool(raw.diagnosticsEnabled, DEFAULT_SETTINGS.diagnosticsEnabled ?? false),
    enabledTools: sanitizeEnabledTools(raw.enabledTools),
  };
}

function sanitizeEnabledTools(rawTools: unknown): Record<string, boolean> {
  const result: Record<string, boolean> = { ...DEFAULT_ENABLED_TOOLS };
  if (rawTools && typeof rawTools === 'object') {
    for (const [k, v] of Object.entries(rawTools as Record<string, unknown>)) {
      if ((k in result || /^[a-z0-9_]{1,40}$/.test(k)) && typeof v === 'boolean') {
        result[k] = v;
      }
    }
  }
  return result;
}

/**
 * Migrates any legacy v17/v18 settings payload to the v19.0.0 schema
 * while preserving user preferences and provider configurations.
 */
export function migrateSettings(input: unknown): AppSettings {
  return sanitizeSettings(input);
}

