import type { AutonomyLevel, SelfSkill } from './utils/selfEngine';
import type { VaultConnections } from './utils/cloudVault';

export type { AutonomyLevel, SelfSkill };
export type ConnectionsState = VaultConnections;

export interface ImageAttachment {
  mime: string;
  data: string;
  url: string;
}

export interface GeneratedImageMeta {
  url: string;
  prompt: string;
}

export interface ProactiveSuggestion {
  id: string;
  category: 'Clarity' | 'Punchiness' | 'Flow' | 'Tone' | 'Grammar' | string;
  targetText: string;
  replacementText: string;
  reason: string;
}

export interface InlineRevision {
  id: string;
  timestamp: number;
  feedback: string;
  scope: 'sentence' | 'paragraph' | 'full_weave';
  previousText: string;
  newText: string;
  summary: string;
}

export interface SelfUpdateWidget {
  id: string;
  title: string;
  description?: string;
  code: string;
  enabled: boolean;
  createdAt: number;
}

/** A note written in the built-in Notebook (Google-Notebook style workspace). */
export interface NotebookNote {
  id: string;
  title: string;
  content: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
  pinned?: boolean;
  driveFileId?: string;
  driveUrl?: string;
  driveSyncedAt?: number;
  githubPath?: string;
  githubUrl?: string;
  githubSyncedAt?: number;
  /** Optional real file name (e.g. "app.py") used when committing to GitHub. */
  filename?: string;
}

export type NotebookEntry = NotebookNote;

/** The AI can write notes by itself via ⟦NOTE⟧ control blocks. */
export interface AINoteDraft {
  title: string;
  content: string;
  tags?: string[];
  save?: 'local' | 'drive' | 'github';
  /** Commit/upload as this exact file name (great for real code files). */
  filename?: string;
}

export interface SelfUpdatePayload {
  theme?: 'light' | 'dark';
  accent?: 'indigo' | 'emerald' | 'rose' | 'amber' | 'sky' | 'teal' | 'custom';
  fontsize?: 'small' | 'normal' | 'large';
  /** v18.2.0 UI/UX control: corner shape of the whole interface. */
  radius?: 'sharp' | 'soft' | 'round';
  /** v18.2.0 UI/UX control: information density of the interface. */
  density?: 'compact' | 'cozy' | 'spacious';
  mode?: 'fast' | 'balanced' | 'power';
  style?: 'concise' | 'detailed';
  replyLang?: 'auto' | 'bn' | 'en';
  customInst?: string;
  customCss?: string;
  weightTemp?: number;
  topP?: number;
  trainingData?: string;
  fastDecision?: boolean;
  gpuAccel?: boolean;
  memoryCache?: boolean;
  widget?: {
    id?: string;
    title: string;
    description?: string;
    code: string;
  };
  removeWidgetId?: string;
  resetCustomCss?: boolean;
  summary?: string;
  // ── Full self-control surface (v17.9.0) ────────────────────────────────
  /** Switch the active engine/provider by id (e.g. "groq", "xrahat"). */
  provider?: ExternalProviderId;
  /** Switch the active model id inside the current provider. */
  externalModel?: string;
  workPersona?: 'allrounder' | 'office' | 'developer' | 'content' | 'academic';
  creativity?: 'precise' | 'balanced' | 'creative';
  autoMemory?: boolean;
  smartFormatting?: boolean;
  proactiveAuto?: boolean;
  sendOnEnter?: boolean;
  mono?: boolean;
  voiceSpeed?: number;
  displayName?: string;
  /** Facts the AI wants to permanently remember about the user. */
  memory?: string[];
  /** Wipe the whole memory bank. */
  clearMemory?: boolean;
  /** Write a note into the Notebook, optionally pushing it to the cloud. */
  note?: {
    title: string;
    content: string;
    tags?: string[];
    filename?: string;
    save?: 'local' | 'drive' | 'github';
  };
  /** Push the newest notes to a connected cloud account. */
  syncNotes?: 'drive' | 'github';
  /** Toggle the built-in Notebook docking for a self-check report. */
  selfCheck?: boolean;
  // ── Self-evolution surface (v18.0.0) ───────────────────────────────────
  /** Raise/lower the AI's own authority over the system. */
  autonomy?: 'safe' | 'full';
  /** Run the deterministic self-repair pass (broken CSS, ranges, memory…). */
  selfRepair?: boolean;
  /** Uninstall a self-built skill. */
  removeSkillId?: string;
  /** Enable / disable a self-built skill. */
  toggleSkillId?: string;
  /** Skills the AI wants to install (also accepted via ⟦SELF_CODE⟧). */
  skills?: Array<{
    name: string;
    description?: string;
    triggers?: string[];
    type?: 'prompt' | 'widget';
    prompt?: string;
    code?: string;
  }>;
}

export type MessageStatus =
  | 'queued'
  | 'running'
  | 'streaming'
  | 'complete'
  | 'stopped'
  | 'failed';

export interface ChatMessageTiming {
  createdAt: string;
  startedAt?: string;
  firstTokenAt?: string;
  completedAt?: string;
  ttftMs?: number;
  latencyMs?: number;
}

export interface MessageFeedback {
  rating: 'up' | 'down';
  reason?: string;
  createdAt?: number;
  updatedAt: number;
}

export interface ChatProject {
  id: string;
  name: string;
  instructions: string;
  createdAt: number;
  updatedAt: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'ai';
  text: string;
  ts: number;
  turnId?: string;
  status?: MessageStatus;
  requestedProvider?: string;
  requestedModel?: string;
  providerUsed?: string;
  modelUsed?: string;
  fallbackNotice?: string;
  attemptCount?: number;
  errorCode?: string;
  timing?: ChatMessageTiming;
  isError?: boolean;
  latencySec?: string;
  imgs?: ImageAttachment[];
  imgGen?: GeneratedImageMeta;
  sources?: Array<{ title: string; uri: string }>;
  proactiveSuggestions?: ProactiveSuggestion[];
  revisions?: InlineRevision[];
  memoryAdded?: string[];
  /** v18.3.0 — the live reasoning trace captured while answering. */
  thinking?: string;
  /** Elapsed thinking duration in whole seconds for collapsed UI summary. */
  thinkingDurationSec?: number;
  /** Truthful status step labels observed during response generation. */
  statusSteps?: string[];
  /** Persistent user thumbs up/down feedback (outside message text). */
  feedback?: MessageFeedback;
  /** v20.0.0 — Active V2 Special model identifier for label attribution. */
  v2ModelId?: string;
  selfUpdateSummary?: string;
  selfUpdateWidgetId?: string;
  /** v18.6.0 — files rewritten inside the loaded .zip by the assistant. */
  projectFilesUpdated?: string[];
}

export interface ChatServiceSelectionContext {
  activeService?: 'github' | 'vercel' | 'supabase' | 'google' | null;
  github?: {
    owner: string;
    repo: string;
    branch: string;
    selectedFiles?: string[];
  };
  vercel?: {
    projectId: string;
    projectName?: string;
    teamId?: string;
    lastDeploymentId?: string;
    lastDeploymentState?: string;
  };
  supabase?: {
    projectRef?: string;
    projectName?: string;
    schema?: string;
    selectedTable?: string;
  };
  google?: {
    selectedFileId?: string;
    selectedFileName?: string;
    selectedMimeType?: string;
  };
  updatedAt?: number;
}

export interface ChatSession {
  id: number;
  title: string;
  titleSource?: 'auto' | 'user';
  pinned?: boolean;
  draft?: string;
  msgs: ChatMessage[];
  /** Optional simple project association (applies only that project's instructions). */
  projectId?: string;
  /** Incognito mode: uses no old memory and saves nothing to memory. */
  incognito?: boolean;
  /** v19.0.0 — Rolling intelligent summary of older turns in long conversations. */
  conversationSummary?: string;
  /** v19.0.0 — Per-conversation selected services & resources (GitHub repo/branch/files, Vercel project, Supabase DB, Google Doc). */
  serviceContext?: ChatServiceSelectionContext;
  /** v19.0.0 — Extracted key instructions, decisions, and task continuity state for this conversation. */
  importantDecisions?: string[];
  /** v19.0.0 — Last tool/service operation or pending confirmation in this conversation. */
  pendingOperations?: string[];
}

export interface UserProfile {
  name: string;
}

export type ExternalProviderId =
  | 'xrahat'
  | 'smfta_cloud'
  | 'mercury'
  | 'inceptionlabs'
  | 'unorouter'
  | 'codecraft'
  | 'gemini_custom'
  | 'gemini_openai'
  | 'anthropic'
  | 'groq'
  | 'openrouter'
  | 'deepseek'
  | 'openai'
  | 'cerebras'
  | 'mistral'
  | 'fireworks'
  | 'together'
  | 'perplexity'
  | 'xai'
  | 'sambanova'
  | 'github'
  | 'nvidia'
  | 'huggingface'
  | 'novita'
  | 'hyperbolic'
  | 'chutes'
  | 'scaleway'
  | 'nebius'
  | 'cohere'
  | 'cloudflare'
  | 'lmstudio'
  | 'ollama'
  | 'custom';

export type ProfileVerificationStatus =
  | 'untested'
  | 'testing'
  | 'verified'
  | 'stale'
  | 'degraded'
  | 'failed';

export interface SavedProviderProfile {
  id: string;
  name: string;
  provider: ExternalProviderId;
  externalKeys: string;
  externalModel: string;
  externalBaseUrl: string;
  customHeaders?: string;
  endpointMode?: 'base' | 'full';
  availableModels?: string[];
  verified?: boolean;
  verificationStatus?: ProfileVerificationStatus;
  verifiedModel?: string;
  verifiedEndpoint?: string;
  configFingerprint?: string;
  lastTestedAt?: number;
  statusMessage?: string;
  quotaExhausted?: boolean;
  /** v19.0.0 — whether this provider profile is enabled for routing/selection. */
  enabled?: boolean;
  /** v19.0.0 — optional context window limit (in tokens) when supported. */
  contextWindow?: number;
  /** v19.0.0 — optional per-profile max output token override. */
  maxOutputTokens?: number;
  /** v19.0.0 — whether streaming SSE is supported by this provider/model. */
  supportsStreaming?: boolean;
  /** v19.0.0 — verified model capabilities (e.g. 'streaming', 'vision', 'json', 'code'). */
  capabilities?: string[];
  /** Whether this profile represents a built-in provider engine. */
  isBuiltin?: boolean;
  /** Provider priority order (lower number = higher priority in fallback chain). */
  priority?: number;
  /** Custom JSON request parameters forwarded cleanly (never overriding model/messages). */
  customParams?: string;
}

export interface ModelRoleSlots {
  defaultModel?: string;
  fastModel?: string;
  reasoningModel?: string;
  visionModel?: string;
}

export type ToolPermissionMode = 'allow' | 'ask' | 'deny';

export type McpTransport = 'http' | 'sse' | 'stdio';

export interface McpToolInfo {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export interface McpServerConfig {
  id: string;
  name: string;
  urlOrCommand: string;
  transport: McpTransport;
  authType: 'none' | 'bearer' | 'header';
  authHeaderName?: string;
  /** Encrypted at rest via AES-256-GCM (`enc:v1:...`), plaintext only in memory when unlocked. */
  authSecret?: string;
  enabled: boolean;
  lastTestedAt?: number;
  status?: 'untested' | 'connected' | 'error' | 'edge_blocked';
  statusMessage?: string;
  latencyMs?: number;
  tools?: McpToolInfo[];
  edgeLimited?: boolean;
}

export type DbProviderKind =
  | 'supabase'
  | 'firebase'
  | 'postgresql'
  | 'mysql'
  | 'mongodb'
  | 'custom_rest';

export interface DbConnectionConfig {
  id: string;
  name: string;
  kind: DbProviderKind;
  endpointOrUri: string;
  authHeaderOrKeyName?: string;
  /** Encrypted at rest via AES-256-GCM (`enc:v1:...`), stripped from cloud/exports. */
  secret?: string;
  enabled: boolean;
  transportMode: 'http_rest' | 'direct_tcp';
  status?: 'untested' | 'connected' | 'error' | 'edge_blocked';
  statusMessage?: string;
  lastTestedAt?: number;
  latencyMs?: number;
  tables?: string[];
}

export interface DbFieldMapping {
  id: string;
  sourceField: string;
  targetField: string;
  transform?: 'none' | 'trim' | 'lowercase' | 'uppercase' | 'string' | 'number';
}

export interface DataBridgeConfig {
  sourceConnectionId: string;
  destinationConnectionId: string;
  sourceTable: string;
  destinationTable: string;
  syncMode: 'append' | 'upsert';
  fieldMappings: DbFieldMapping[];
  lastSyncAt?: number;
  lastSyncStatus?: string;
  lastSyncCount?: number;
}

export interface KnowledgeChunk {
  id: string;
  docId: string;
  docTitle: string;
  index: number;
  text: string;
  tokens: number;
}

export interface KnowledgeDocument {
  id: string;
  title: string;
  mimeType: string;
  sizeBytes: number;
  content: string;
  chunkCount: number;
  createdAt: number;
  updatedAt: number;
  tags?: string[];
}

export interface KnowledgeSettings {
  enabled: boolean;
  vectorSearchEnabled: boolean;
  topK: number;
  minScore: number;
  chunkSize: number;
  chunkOverlap: number;
}

export interface TelemetryRequestLog {
  id: string;
  timestamp: number;
  provider: string;
  model: string;
  status: 'success' | 'error' | 'aborted';
  httpStatus?: number | null;
  errorCode?: string;
  errorMessage?: string;
  latencyMs?: number;
  ttftMs?: number;
  inputTokens?: number;
  outputTokens?: number;
}

export interface ProviderTestStatus {
  ok: boolean;
  message: string;
  testedAt: number;
  provider?: string;
  model?: string;
  normalizedEndpoint?: string;
  latencyMs?: number;
  errorCode?: string;
  configFingerprint?: string;
  supportsStreaming?: boolean;
}

export interface AppSettings {
  theme: 'light' | 'dark';
  /** v18.11 — when 'system', theme follows the OS preference. */
  themeMode?: 'dark' | 'light' | 'system';
  mode: 'fast' | 'balanced' | 'power';
  style: 'concise' | 'detailed';
  replyLang: 'auto' | 'bn' | 'en';
  vlang: 'bn-BD' | 'en-US' | 'hi-IN';
  /** General UI/application language preference. */
  appLanguage?: 'bn' | 'en' | 'hi';
  /** Language reading direction (RTL / LTR / Auto). */
  dir?: 'ltr' | 'rtl' | 'auto';
  creativity: 'precise' | 'balanced' | 'creative';
  accent: 'indigo' | 'emerald' | 'rose' | 'amber' | 'sky' | 'teal' | 'custom';
  /** Hex color used when accent === 'custom'. */
  accentCustom?: string;
  fontsize: 'small' | 'normal' | 'large';
  fontFamily?: 'geist' | 'inter' | 'system' | 'mono';
  /** Corner shape across the UI (set by the user or the AI itself). */
  radius?: 'sharp' | 'soft' | 'round';
  /** Spacing/density across the UI (set by the user or the AI itself). */
  density?: 'compact' | 'cozy' | 'spacious';
  bubbleStyle?: 'rounded' | 'sharp' | 'minimal';
  /** Honour the OS reduced-motion preference / disable UI animations. */
  reducedMotion?: boolean;
  mono: boolean;
  autoVoice: boolean;
  sendOnEnter: boolean;
  proactiveAuto: boolean;
  customInst: string;
  autoMemory: boolean;
  /** Include recent conversation history with each request. */
  includeHistory?: boolean;
  maxHistoryMessages?: number;
  customCss?: string;
  provider?: ExternalProviderId;
  externalKeys?: string;
  externalModel?: string;
  externalBaseUrl?: string;
  customHeaders?: string;
  customParams?: string;
  activeProfileId?: string;
  displayName?: string;
  allowKeylessFallback?: boolean;
  maxOutputTokens?: number;
  // Modern Productivity & Work Persona
  workPersona?: 'allrounder' | 'office' | 'developer' | 'content' | 'academic';
  voiceSpeed?: number;
  smartFormatting?: boolean;
  // 1. Model Weights & Custom Retraining
  weightTemp?: number;
  topP?: number;
  topK?: number;
  stopSequences?: string[];
  trainingData?: string;
  // 2. Thinking Algorithm (Fast Decision Logic)
  fastDecision?: boolean;
  thinkingMode?: ThinkingEffortLevel;
  liveThinkingSummary?: boolean;
  // 3. Hardware Interface (GPU/CPU Speed Optimization)
  gpuAccel?: boolean;
  // 4. System Memory (High-Speed Cache & Processing Rate)
  memoryCache?: boolean;

  // ── v18.11 Settings System ──────────────────────────────────────────────
  /** General: persist conversations automatically. */
  autoSaveChat?: boolean;
  /** Chat: smooth typewriter reveal (false = render chunks instantly). */
  streamingReveal?: boolean;
  markdownRender?: boolean;
  codeHighlight?: boolean;
  autoScroll?: boolean;
  showTimestamps?: boolean;
  showTokenUsage?: boolean;
  /** Personalization. */
  responseTone?: 'professional' | 'friendly' | 'creative' | 'concise' | 'technical';
  codingPrefs?: string;
  userProfileContext?: string;
  /** Notifications (real browser Notification + WebAudio sound). */
  notifEnabled?: boolean;
  notifTaskDone?: boolean;
  notifErrors?: boolean;
  notifUsageLimit?: boolean;
  notifSound?: boolean;
  /** Privacy: chat retention in days; 0 = keep forever. */
  retentionDays?: number;
  /** Memory retention days; 0 = keep forever. */
  memoryRetentionDays?: number;
  /** Automation & fallback. */
  maxRetries?: number;
  requestTimeoutSec?: number;
  concurrentRequests?: number;
  errorHandlingPolicy?: 'retry_fallback' | 'fail_fast' | 'notify_only';
  fallbackOrder?: string[];
  /** Usage & limits: per-device daily message cap; 0 = no cap. */
  dailyMessageLimit?: number;
  /** AI tools. */
  webSearchDefault?: boolean;
  maxUploadMb?: number;
  /** Local-only account information (no server auth provider exists). */
  accountEmail?: string;
  avatarDataUrl?: string;

  // ── v19.0.0 & 10-Category System Upgrade Settings ──────────────────────
  /** Versioned schema marker for settings migration. */
  settingsVersion?: number;
  /** General: default mode when starting a new conversation. */
  newChatDefaultMode?: 'last' | 'fast' | 'balanced' | 'power';
  /** Appearance: dedicated code block font size. */
  codeFontSize?: 'small' | 'normal' | 'large';
  /** Appearance: code block visual theme. */
  codeBlockTheme?: 'dark' | 'high-contrast' | 'minimal';
  /** Appearance: vertical spacing between chat messages. */
  messageSpacing?: 'compact' | 'normal' | 'relaxed';
  /** Appearance: desktop/mobile conversation column width preference. */
  layoutWidth?: 'standard' | 'wide' | 'full';
  /** Accessibility: high-contrast text & border surfaces. */
  highContrast?: boolean;
  /** Accessibility: strong keyboard focus ring indicators. */
  focusRingVisible?: boolean;
  /** Accessibility: enlarged mobile/touch target sizing (48px min). */
  largeTouchTargets?: boolean;
  /** Advanced: show live streaming & provider diagnostic metrics. */
  diagnosticsEnabled?: boolean;
  /** AI Tools & Permissions: per-tool enable/disable map. */
  enabledTools?: Record<string, boolean>;
  /** AI Tools & Permissions: allow / ask / deny per tool. */
  toolPermissions?: Record<string, ToolPermissionMode>;
  /** Model role assignments (default, fast, reasoning, vision). */
  modelSlots?: ModelRoleSlots;
  /** Preferred output format directive. */
  outputFormat?: 'markdown' | 'plain' | 'json' | 'structured';
  /** Knowledge Base & Vector Search settings. */
  knowledgeSettings?: KnowledgeSettings;
  /** Image generation tool defaults. */
  imageGenPrefs?: { defaultStyle?: string; defaultSize?: number };
  /** Context compression & handling. */
  contextCompressionEnabled?: boolean;
  contextCompressionThreshold?: number;
  autoContextMode?: 'balanced' | 'aggressive' | 'minimal';
  /** Security & Privacy. */
  telemetryOptOut?: boolean;
  conversationPrivacyMode?: boolean;
  /** Backup & Restore. */
  autoBackupEnabled?: boolean;
  autoBackupIntervalHours?: number;

  // ── Simple 7-Section Settings Fields ────────────────────────────────────
  /** "আপনাকে কী নামে ডাকব" */
  nickname?: string;
  /** Global instructions (max 3000 chars) applied to every chat */
  globalInstructions?: string;
  /** Response style preset */
  responseStyle?: ResponseStylePreset;
  /** Optional user writing sample when custom style is active */
  customStyleSample?: string;
  /** Allow searching older chats when building context */
  memorySearchChats?: boolean;
  /** Pause memory: keep saved memories intact without reading or adding */
  memoryPaused?: boolean;
  /** Thinking toggle */
  thinkingEnabled?: boolean;
  /** Response length preference */
  responseLength?: 'short' | 'medium' | 'detailed';
  /** Simple projects list (id, name, instructions) */
  projects?: ChatProject[];
  /** TTS Voice profile identifier (separate from externalModel so changing voice never alters the chat AI model). */
  ttsVoice?: 'default' | 'bengali_female' | 'bengali_male' | 'english_us_female' | 'english_us_male';
  /** Show real-time live captions above the voice waveform bar while speaking. */
  voiceLiveCaptions?: boolean;
  /** Show compact starter prompt chips on the empty home screen. */
  showHomeStarters?: boolean;
  /** Lead Thinking UI with the active subject/topic right from the first moment. */
  showThinkingTopic?: boolean;
  /** Automatically collapse Thinking accordion once the final answer begins. */
  autoCollapseThinking?: boolean;
  /** Automatically open the side-by-side Live Preview panel when previewable HTML/React/UI code completes. */
  autoOpenLivePreview?: boolean;
  /** Preserve and inject full conversation context across mid-thread model or provider switches. */
  crossModelMemoryCarryover?: boolean;
  /** Require Simple Name + Password entry gate when opening a fresh session. */
  simpleEntryRequireOnLoad?: boolean;
  /** Optional local passcode hint/state for Simple Name + Password lock. */
  simpleEntryPasscode?: string;
}

export type ResponseStylePreset =
  | 'normal'
  | 'concise'
  | 'explanatory'
  | 'formal'
  | 'custom';

export type ThinkingEffortLevel = 'off' | 'low' | 'medium' | 'high' | 'auto';
