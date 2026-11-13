import {
  AppSettings,
  ChatProject,
  KnowledgeSettings,
  ModelRoleSlots,
  ToolPermissionMode,
} from '../types';
import { DEFAULT_ENABLED_TOOLS } from './capabilityRegistry';

export const SETTINGS_SCHEMA_VERSION = 20;

export const DEFAULT_KNOWLEDGE_SETTINGS: KnowledgeSettings = {
  enabled: true,
  vectorSearchEnabled: true,
  topK: 4,
  minScore: 0.12,
  chunkSize: 600,
  chunkOverlap: 80,
};

export const DEFAULT_TOOL_PERMISSIONS: Record<string, ToolPermissionMode> = {
  web_search: 'allow',
  generate_image: 'allow',
  fetch_url: 'allow',
  read_github: 'allow',
  write_github: 'ask',
  read_google: 'allow',
  write_google: 'ask',
  read_supabase: 'allow',
  write_supabase: 'ask',
  read_vercel: 'allow',
  write_vercel: 'ask',
  code_workspace: 'allow',
};

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'light',
  themeMode: 'system',
  mode: 'fast',
  style: 'concise',
  replyLang: 'auto',
  vlang: 'bn-BD',
  appLanguage: 'bn',
  dir: 'auto',
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
  // Spec defaults: temperature 0.7 · top P 0.9 · max output tokens 4096.
  weightTemp: 0.7,
  topP: 0.9,
  topK: 40,
  stopSequences: [],
  maxOutputTokens: 4096,
  trainingData: '',
  fastDecision: true,
  thinkingMode: 'medium',
  liveThinkingSummary: true,
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
  userProfileContext: '',
  notifEnabled: false,
  notifTaskDone: true,
  notifErrors: true,
  notifUsageLimit: true,
  notifSound: false,
  retentionDays: 0,
  memoryRetentionDays: 0,
  maxRetries: 2,
  requestTimeoutSec: 120,
  concurrentRequests: 2,
  errorHandlingPolicy: 'retry_fallback',
  fallbackOrder: [],
  dailyMessageLimit: 0,
  webSearchDefault: false,
  maxUploadMb: 10,
  accountEmail: '',
  avatarDataUrl: '',
  // v19.0.0 & v20.0.0 10-category settings system
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
  toolPermissions: { ...DEFAULT_TOOL_PERMISSIONS },
  modelSlots: {},
  outputFormat: 'markdown',
  knowledgeSettings: { ...DEFAULT_KNOWLEDGE_SETTINGS },
  imageGenPrefs: { defaultStyle: 'photorealistic', defaultSize: 1024 },
  contextCompressionEnabled: true,
  contextCompressionThreshold: 24,
  autoContextMode: 'balanced',
  telemetryOptOut: false,
  conversationPrivacyMode: false,
  autoBackupEnabled: false,
  autoBackupIntervalHours: 24,
  nickname: '',
  globalInstructions: '',
  responseStyle: 'normal',
  customStyleSample: '',
  memorySearchChats: true,
  memoryPaused: false,
  thinkingEnabled: true,
  responseLength: 'medium',
  projects: [],
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
    dir: oneOf(
      raw.dir,
      ['ltr', 'rtl', 'auto'] as const,
      DEFAULT_SETTINGS.dir ?? 'auto'
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
    customParams: str(raw.customParams, '').slice(0, 4000),
    activeProfileId: str(raw.activeProfileId, '').trim().slice(0, 120),
    displayName: str(raw.displayName, '').trim().slice(0, 80),
    allowKeylessFallback: bool(
      raw.allowKeylessFallback,
      DEFAULT_SETTINGS.allowKeylessFallback ?? false
    ),
    weightTemp: num(raw.weightTemp, 0.1, 1.2, DEFAULT_SETTINGS.weightTemp ?? 0.7),
    topP: num(raw.topP, 0.1, 1.0, DEFAULT_SETTINGS.topP ?? 0.9),
    topK: int(raw.topK, 1, 200, DEFAULT_SETTINGS.topK ?? 40),
    stopSequences: Array.isArray(raw.stopSequences)
      ? raw.stopSequences
          .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
          .map((item) => item.trim().slice(0, 80))
          .slice(0, 8)
      : [],
    maxOutputTokens: int(raw.maxOutputTokens, 256, 32768, DEFAULT_SETTINGS.maxOutputTokens ?? 4096),
    trainingData: str(raw.trainingData, '').slice(0, 4000),
    fastDecision: bool(raw.fastDecision, DEFAULT_SETTINGS.fastDecision ?? true),
    thinkingMode: oneOf(
      raw.thinkingMode,
      ['off', 'low', 'medium', 'high'] as const,
      DEFAULT_SETTINGS.thinkingMode ?? 'medium'
    ),
    liveThinkingSummary: bool(
      raw.liveThinkingSummary,
      DEFAULT_SETTINGS.liveThinkingSummary ?? true
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
    userProfileContext: str(raw.userProfileContext, '').slice(0, 2000),
    notifEnabled: bool(raw.notifEnabled, DEFAULT_SETTINGS.notifEnabled ?? false),
    notifTaskDone: bool(raw.notifTaskDone, DEFAULT_SETTINGS.notifTaskDone ?? true),
    notifErrors: bool(raw.notifErrors, DEFAULT_SETTINGS.notifErrors ?? true),
    notifUsageLimit: bool(raw.notifUsageLimit, DEFAULT_SETTINGS.notifUsageLimit ?? true),
    notifSound: bool(raw.notifSound, DEFAULT_SETTINGS.notifSound ?? false),
    retentionDays: int(raw.retentionDays, 0, 3650, DEFAULT_SETTINGS.retentionDays ?? 0),
    memoryRetentionDays: int(raw.memoryRetentionDays, 0, 3650, DEFAULT_SETTINGS.memoryRetentionDays ?? 0),
    maxRetries: int(raw.maxRetries, 0, 4, DEFAULT_SETTINGS.maxRetries ?? 2),
    requestTimeoutSec: int(raw.requestTimeoutSec, 30, 240, DEFAULT_SETTINGS.requestTimeoutSec ?? 120),
    concurrentRequests: int(raw.concurrentRequests, 1, 6, DEFAULT_SETTINGS.concurrentRequests ?? 2),
    errorHandlingPolicy: oneOf(
      raw.errorHandlingPolicy,
      ['retry_fallback', 'fail_fast', 'notify_only'] as const,
      DEFAULT_SETTINGS.errorHandlingPolicy ?? 'retry_fallback'
    ),
    fallbackOrder: Array.isArray(raw.fallbackOrder)
      ? raw.fallbackOrder
          .filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
          .map((id) => id.trim().slice(0, 120))
          .slice(0, 30)
      : [],
    dailyMessageLimit: int(raw.dailyMessageLimit, 0, 10000, DEFAULT_SETTINGS.dailyMessageLimit ?? 0),
    webSearchDefault: bool(raw.webSearchDefault, DEFAULT_SETTINGS.webSearchDefault ?? false),
    maxUploadMb: int(raw.maxUploadMb, 1, 25, DEFAULT_SETTINGS.maxUploadMb ?? 10),
    accountEmail: str(raw.accountEmail, '').trim().slice(0, 120),
    avatarDataUrl: str(raw.avatarDataUrl, '').slice(0, 120_000),
    // ── v19.0.0 & v20.0.0 fields ───────────────────────────────────────────
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
    toolPermissions: sanitizeToolPermissions(raw.toolPermissions),
    modelSlots: sanitizeModelSlots(raw.modelSlots),
    outputFormat: oneOf(
      raw.outputFormat,
      ['markdown', 'plain', 'json', 'structured'] as const,
      DEFAULT_SETTINGS.outputFormat ?? 'markdown'
    ),
    knowledgeSettings: sanitizeKnowledgeSettings(raw.knowledgeSettings),
    imageGenPrefs: sanitizeImageGenPrefs(raw.imageGenPrefs),
    contextCompressionEnabled: bool(
      raw.contextCompressionEnabled,
      DEFAULT_SETTINGS.contextCompressionEnabled ?? true
    ),
    contextCompressionThreshold: int(
      raw.contextCompressionThreshold,
      8,
      100,
      DEFAULT_SETTINGS.contextCompressionThreshold ?? 24
    ),
    autoContextMode: oneOf(
      raw.autoContextMode,
      ['balanced', 'aggressive', 'minimal'] as const,
      DEFAULT_SETTINGS.autoContextMode ?? 'balanced'
    ),
    telemetryOptOut: bool(raw.telemetryOptOut, DEFAULT_SETTINGS.telemetryOptOut ?? false),
    conversationPrivacyMode: bool(
      raw.conversationPrivacyMode,
      DEFAULT_SETTINGS.conversationPrivacyMode ?? false
    ),
    autoBackupEnabled: bool(raw.autoBackupEnabled, DEFAULT_SETTINGS.autoBackupEnabled ?? false),
    autoBackupIntervalHours: int(
      raw.autoBackupIntervalHours,
      1,
      168,
      DEFAULT_SETTINGS.autoBackupIntervalHours ?? 24
    ),
    nickname: str(raw.nickname ?? raw.displayName, '').trim().slice(0, 80),
    globalInstructions: str(raw.globalInstructions ?? raw.customInst, '').slice(0, 3000),
    responseStyle: oneOf(
      raw.responseStyle,
      ['normal', 'concise', 'explanatory', 'formal', 'custom'] as const,
      raw.style === 'detailed' ? 'explanatory' : 'normal'
    ),
    customStyleSample: str(raw.customStyleSample, '').slice(0, 2000),
    memorySearchChats: bool(raw.memorySearchChats, true),
    memoryPaused: bool(raw.memoryPaused, false),
    thinkingEnabled:
      typeof raw.thinkingEnabled === 'boolean'
        ? raw.thinkingEnabled
        : raw.thinkingMode !== 'off',
    responseLength: oneOf(
      raw.responseLength,
      ['short', 'medium', 'detailed'] as const,
      raw.style === 'concise' ? 'short' : raw.style === 'detailed' ? 'detailed' : 'medium'
    ),
    projects: sanitizeProjects(raw.projects),
  };
}

function sanitizeProjects(rawProjects: unknown): ChatProject[] {
  if (!Array.isArray(rawProjects)) return [];
  const seen = new Set<string>();
  const out: ChatProject[] = [];
  for (const item of rawProjects) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    const id = typeof obj.id === 'string' && obj.id.trim() ? obj.id.trim().slice(0, 80) : '';
    const name = typeof obj.name === 'string' ? obj.name.trim().slice(0, 100) : '';
    if (!id || !name || seen.has(id)) continue;
    seen.add(id);
    const now = Date.now();
    out.push({
      id,
      name,
      instructions:
        typeof obj.instructions === 'string' ? obj.instructions.slice(0, 4000) : '',
      createdAt:
        typeof obj.createdAt === 'number' && Number.isFinite(obj.createdAt)
          ? obj.createdAt
          : now,
      updatedAt:
        typeof obj.updatedAt === 'number' && Number.isFinite(obj.updatedAt)
          ? obj.updatedAt
          : now,
    });
    if (out.length >= 50) break;
  }
  return out;
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

function sanitizeToolPermissions(rawPerms: unknown): Record<string, ToolPermissionMode> {
  const result: Record<string, ToolPermissionMode> = { ...DEFAULT_TOOL_PERMISSIONS };
  if (rawPerms && typeof rawPerms === 'object') {
    for (const [k, v] of Object.entries(rawPerms as Record<string, unknown>)) {
      if (
        (k in result || /^[a-z0-9_:.-]{1,60}$/.test(k)) &&
        (v === 'allow' || v === 'ask' || v === 'deny')
      ) {
        result[k] = v;
      }
    }
  }
  return result;
}

function sanitizeModelSlots(rawSlots: unknown): ModelRoleSlots {
  if (!rawSlots || typeof rawSlots !== 'object') return {};
  const obj = rawSlots as Record<string, unknown>;
  const clean = (v: unknown) =>
    typeof v === 'string' && v.trim() ? v.trim().slice(0, 160) : undefined;
  return {
    ...(clean(obj.defaultModel) ? { defaultModel: clean(obj.defaultModel) } : {}),
    ...(clean(obj.fastModel) ? { fastModel: clean(obj.fastModel) } : {}),
    ...(clean(obj.reasoningModel) ? { reasoningModel: clean(obj.reasoningModel) } : {}),
    ...(clean(obj.visionModel) ? { visionModel: clean(obj.visionModel) } : {}),
  };
}

function sanitizeKnowledgeSettings(rawKb: unknown): KnowledgeSettings {
  if (!rawKb || typeof rawKb !== 'object') return { ...DEFAULT_KNOWLEDGE_SETTINGS };
  const obj = rawKb as Record<string, unknown>;
  const clampInt = (v: unknown, min: number, max: number, fallback: number) =>
    typeof v === 'number' && Number.isFinite(v)
      ? Math.min(max, Math.max(min, Math.round(v)))
      : fallback;
  const clampNum = (v: unknown, min: number, max: number, fallback: number) =>
    typeof v === 'number' && Number.isFinite(v)
      ? Math.min(max, Math.max(min, Number(v.toFixed(2))))
      : fallback;
  return {
    enabled: typeof obj.enabled === 'boolean' ? obj.enabled : DEFAULT_KNOWLEDGE_SETTINGS.enabled,
    vectorSearchEnabled:
      typeof obj.vectorSearchEnabled === 'boolean'
        ? obj.vectorSearchEnabled
        : DEFAULT_KNOWLEDGE_SETTINGS.vectorSearchEnabled,
    topK: clampInt(obj.topK, 1, 12, DEFAULT_KNOWLEDGE_SETTINGS.topK),
    minScore: clampNum(obj.minScore, 0, 0.9, DEFAULT_KNOWLEDGE_SETTINGS.minScore),
    chunkSize: clampInt(obj.chunkSize, 200, 2000, DEFAULT_KNOWLEDGE_SETTINGS.chunkSize),
    chunkOverlap: clampInt(obj.chunkOverlap, 0, 400, DEFAULT_KNOWLEDGE_SETTINGS.chunkOverlap),
  };
}

function sanitizeImageGenPrefs(rawPrefs: unknown): { defaultStyle?: string; defaultSize?: number } {
  if (!rawPrefs || typeof rawPrefs !== 'object') {
    return { defaultStyle: 'photorealistic', defaultSize: 1024 };
  }
  const obj = rawPrefs as Record<string, unknown>;
  const allowedSizes = [512, 768, 1024, 1536];
  const size =
    typeof obj.defaultSize === 'number' && allowedSizes.includes(obj.defaultSize)
      ? obj.defaultSize
      : 1024;
  const style =
    typeof obj.defaultStyle === 'string' && obj.defaultStyle.trim()
      ? obj.defaultStyle.trim().slice(0, 60)
      : 'photorealistic';
  return { defaultStyle: style, defaultSize: size };
}

/**
 * Migrates any legacy v17/v18/v19 settings payload to the v20 schema
 * while preserving user preferences and provider configurations.
 */
export function migrateSettings(input: unknown): AppSettings {
  return sanitizeSettings(input);
}

