import React, { useState, useEffect, useRef } from 'react';
import {
  Menu,
  Plus,
  Search,
  Pin,
  Edit2,
  Trash2,
  Settings,
  Cloud,
  Square,
  Mic,
  Globe,
  Copy,
  RotateCcw,
  Download,
  FileText,
  X,
  ExternalLink,
  MoreVertical,
  ChevronDown,
  Check,
  AlertTriangle,
  Zap,
  User,
  MessageSquare,
  Send,
  ArrowUp,
  ChevronRight,
  CircleHelp,
  Code2,
  FileArchive,
  FolderOpen,
  Image as ImageIcon,
  LayoutDashboard,
  LayoutGrid,
  LayoutTemplate,
  Loader2,
  LogOut,
  MessageSquarePlus,
  MoreHorizontal,
  Pause,
  PenLine,
  Play,
  Server,
  Sparkles,
  Volume2,
} from 'lucide-react';

const StaggeredMenuIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" className={className} aria-hidden="true">
    <line x1="4" y1="6.5" x2="19" y2="6.5" />
    <line x1="4" y1="12" x2="13.5" y2="12" />
    <line x1="4" y1="17.5" x2="16.5" y2="17.5" />
  </svg>
);

const SunburstMarkIcon: React.FC<{ className?: string }> = ({ className = 'w-11 h-11' }) => (
  <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" className={className} aria-hidden="true">
    <line x1="24" y1="5" x2="24" y2="15" />
    <line x1="24" y1="33" x2="24" y2="43" />
    <line x1="5" y1="24" x2="15" y2="24" />
    <line x1="33" y1="24" x2="43" y2="24" />
    <line x1="10.6" y1="10.6" x2="17.6" y2="17.6" />
    <line x1="30.4" y1="30.4" x2="37.4" y2="37.4" />
    <line x1="37.4" y1="10.6" x2="30.4" y2="17.6" />
    <line x1="17.6" y1="30.4" x2="10.6" y2="37.4" />
    <line x1="16.7" y1="6.4" x2="20.6" y2="15.7" />
    <line x1="27.4" y1="32.3" x2="31.3" y2="41.6" />
    <line x1="6.4" y1="31.3" x2="15.7" y2="27.4" />
    <line x1="32.3" y1="20.6" x2="41.6" y2="16.7" />
  </svg>
);
import {
  AINoteDraft,
  AppSettings,
  ChatMessage,
  ChatServiceSelectionContext,
  ChatSession,
  ImageAttachment,
  InlineRevision,
  NotebookNote,
  ProviderTestStatus,
  SavedProviderProfile,
  SelfUpdatePayload,
  SelfUpdateWidget,
  UserProfile,
} from './types';
import {
  APP_VERSION,
  createUniqueId,
  detectInstantSelfUpdate,
  extractFallbackWidgetFromReply,
  extractImplicitUserMemory,
  formatTime,
  getClientCachedReply,
  parseAIControlTags,
  sanitizeProprietaryOutput,
  setClientCachedReply,
  tryLocalMath,
} from './utils/helpers';
import {
  BUILTIN_TIERS,
  DEFAULT_BUILTIN_PROFILE,
  builtinTierForModel,
  builtinTierLabel,
  getInitialProviderProfiles,
  getModelsForProfile,
  hydrateSavedProfiles,
  isBuiltinProviderId,
  isBuiltinTierModel,
  normalizeProviderProfile,
  persistSavedProfiles,
  PROVIDER_CATALOG,
  resolveActiveProfile,
  SAVED_PROFILES_KEY,
} from './utils/providers';
import {
  decryptSecret,
  encryptSecret,
  ensureKeystore,
  isEncrypted,
} from './utils/secureKeystore';
import {
  buildExportEnvelope,
  parseImportPayload,
  sanitizeSettingsForExport,
} from './utils/exportData';
import { InteractiveMessageContent } from './components/InteractiveMessageContent';
import {
  Project,
  buildProjectPreview,
  downloadZipProject,
  parseFileEdits,
  projectPromptBlock,
  projectSummary,
  readZipProject,
  updateProjectFiles,
} from './utils/projectZip';
import { revealChars, safeSlice } from './utils/typewriter';
import {
  BattleArenaModal,
  CodeLabModal,
  ImageStudioModal,
  StatsAndWhatsNewModal,
  VoiceCallOverlay,
} from './components/ToolModals';
import { SettingsModal, SettingsTabId } from './components/SettingsHub';
import { NotebookModal, createNote, sanitizeNotes } from './components/NotebookModal';
import { ConnectionsModal } from './components/ConnectionsModal';
import { ChatConnectedServicesToolbar } from './components/ChatConnectedServicesToolbar';
import { CodeWorkspaceModal } from './components/CodeWorkspace';
import { CodeWorkspacePage } from './components/CodeWorkspacePage';
import { TaskExecutionPanel } from './components/TaskExecutionPanel';
import {
  TaskExecutionPlan,
  createTaskPlan,
  parseTaskPlanFromText,
  advanceTaskPlan,
  isMultiStepRequest,
  setPlanPaused,
  setPlanResumed,
  setPlanCancelled,
  retryFailedTask,
} from './utils/taskExecutionEngine';
import {
  buildSmartConversationContext,
  deriveLiveOperationProgressSteps,
} from './utils/conversationContextEngine';
import { flushOfflineSyncQueue } from './utils/cloudSync';
import {
  WorkspaceHandoffPayload,
  createWorkspaceHandoffPayload,
  loadWorkspaceHandoff,
  saveWorkspaceHandoff,
} from './utils/workspaceHandoff';
import { CodeBlockInfo, extractCodeBlocks, hasPreviewableCode } from './utils/livePreview';
import {
  applyProjectFileEdits,
  buildWebsiteProjectFromBlocks,
  createStarterWebsiteProject,
  extractAiWebsiteFileEdits,
  loadWebsiteProjects,
  saveWebsiteProjects,
} from './utils/websiteProjectEngine';
import {
  ReadDocumentResult,
  buildQueryAwareDocumentPayload,
  readDocumentFile,
} from './utils/documentReader';
import {
  addFacts,
  clearEntireMemoryBank,
  ensureMasterProfileMemory,
  extractMemoryCandidates,
  factsToText,
  MASTER_PROFILE_FACTS,
  MASTER_PROFILE_NAME,
  migrateMemory,
  retrieveRelevantMemories,
  MEMORY_MAX,
} from './utils/memoryBank';
import {
  SelfAction,
  interpretSelfCommand,
  isPureSelfCommand,
} from './utils/selfCommand';
import {
  DEFAULT_IDLE_TIMEOUT_MS,
  MAX_AUTO_CONTINUATIONS,
  continuationDirective,
  createIdleWatchdog,
  dropStallSentences,
  looksTruncated,
  matchAnswerLength,
  mergeContinuationText,
  polishReply,
} from './utils/streamGuard';
import {
  CONNECTING_FALLBACK_MS,
  GEN_PHASE_LABEL,
  GenPhase,
  nextGenPhase,
} from './utils/genPhase';
import {
  AutonomyLevel,
  SelfSkill,
  SelfSkillDraft,
  applyAutoRepairs,
  buildSkillInstruction,
  loadAutonomy,
  loadSkills,
  matchSkills,
  persistAutonomy,
  persistSkills,
  reconcileSettings,
  runSelfCheck,
  skillFromDraft,
} from './utils/selfEngine';
import {
  VaultConnections,
  loadVaultConnections,
  persistVaultConnections,
  sanitizeVaultConnections,
  backupWorkspaceToGithub,
  pushAllNotes,
  pushNoteToDrive,
  pushNoteToGithub,
  buildLiveIntegrationContextForPrompt,
  storeEncryptedProviderSession,
  verifyProviderPermissions,
} from './utils/cloudVault';
import { DEFAULT_SETTINGS, sanitizeSettings } from './utils/settings';
import { isToolEnabled } from './utils/capabilityRegistry';
import { notifyUser } from './utils/notify';
import {
  isStandaloneApkEnv,
  runStandaloneClientSideAI,
} from './utils/apkClientFallback';
import { useAuth } from './context/AuthContext';
import { getSupabase } from './utils/supabaseClient';
import {
  CloudSessionRow,
  CloudStatePayload,
  CloudStateRow,
  deleteCloudSession,
  fetchCloudSessions,
  fetchCloudState,
  isCloudEmpty,
  isPersistableSession,
  mergeProviderProfiles,
  mergeSessions,
  parseCloudSettings,
  saveCloudProfile,
  saveCloudState,
  sessionVersion,
  stripProfileSecrets,
  stripSettingsSecrets,
  upsertCloudSession,
  wipeCloudWorkspace,
} from './utils/cloudSync';
import { friendlyAuthError } from './utils/authErrors';
import type { User as FirebaseUser } from 'firebase/auth';
import {
  V2ModelId,
  V2_SPECIAL_MODELS,
  V2ModelQuotaStatus,
  V2QuotaConfig,
  DEFAULT_V2_QUOTA_CONFIG,
  isV2ModelId,
  evaluateV2ModelQuota,
  getNextRiyadhResetInfo,
  getV2ModelLabel,
  getV2ModelSpec,
} from './utils/v2UsageLimits';
import {
  signInWithFirebaseGoogle,
  signOutFromFirebase,
  observeFirebaseAuth,
  syncConversationToFirestore,
  subscribeToFirestoreConversations,
  saveMemoryFactToFirestore,
  subscribeToFirestoreMemories,
  clearAllFirestoreMemories,
  subscribeToFirestoreV2Usage,
  saveSessionMessageToFirestore,
  selectRelevantFirestoreMemories,
  isAuthorizedTestingUser,
  tryStreamViaFirebaseAiLogic,
  FirestoreUsageSnapshot,
} from './utils/firebaseV2Client';
import {
  bilingualSpeechPlayer,
  isSpeechRecognitionSupported,
  resolveRecognitionLanguage,
  VoiceLangMode,
} from './utils/voiceEngine';
import {
  cleanupStaleLocalStorage,
  runSystemDiagnostics,
} from './utils/systemDiagnostics';

/** A pasted code block means real work — never short-circuit it with a self answer. */
function mentionsPastedCode(text: string): boolean {
  return /```|<\/?(?:div|html|body|script|style)\b/i.test(text || '');
}

const LS_KEYS = {
  profile: 'smfta_profile',
  settings: 'smfta_settings',
  chats: 'smfta_chats_v2',
  usage: 'smfta_usage',
  memory: 'smfta_memory',
  memoryBackup: 'smfta_memory_backup',
  widgets: 'smfta_self_widgets',
  providerStatus: 'smfta_provider_test_status',
  rollback: 'smfta_rollback_snapshot',
  notes: 'smfta_notebook_notes',
  vault: 'smfta_vault_connections',
};

function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

const STATE_PENDING_KEY = 'smfta_state_pending_uid';

export default function App() {
  const [profile, setProfile] = useState<UserProfile>(() => {
    const loaded = loadJSON<UserProfile>(LS_KEYS.profile, {
      name: MASTER_PROFILE_NAME,
    });
    const cleanName = (loaded?.name || '').trim();
    if (!cleanName || cleanName === 'Bossবোদা' || cleanName === 'Boss') {
      return { ...loaded, name: MASTER_PROFILE_NAME };
    }
    return loaded;
  });
  const [settings, setSettings] = useState<AppSettings>(() => {
    const saved = loadJSON<Partial<AppSettings>>(LS_KEYS.settings, {});
    return sanitizeSettings({
      theme: 'dark',
      accent: 'indigo',
      ...saved,
    });
  });
  const [savedProfiles, setSavedProfiles] = useState<SavedProviderProfile[]>(
    () => getInitialProviderProfiles(settings)
  );
  // v18.11 — true when IndexedDB is unavailable and encrypted keys only live
  // in page memory (surfaced as a security warning in Settings → Security).
  const [keystoreEphemeral, setKeystoreEphemeral] = useState(false);

  // One-time unseal: the initial state may contain AES-GCM ciphertext from
  // storage. Decrypt into memory before any provider request can run. Legacy
  // plaintext values pass through untouched and get sealed on the next save.
  useEffect(() => {
    let cancelled = false;
    const sealedSettingsKey = settings.externalKeys;
    (async () => {
      try {
        const ks = await ensureKeystore();
        setKeystoreEphemeral(ks.ephemeral || !ks.available);
        if (isEncrypted(sealedSettingsKey)) {
          const plain = await decryptSecret(sealedSettingsKey);
          if (!cancelled && plain) {
            setSettings((s) =>
              s.externalKeys === sealedSettingsKey
                ? { ...s, externalKeys: plain }
                : s
            );
          }
        }
        const profiles = await hydrateSavedProfiles();
        if (!cancelled && profiles.length > 0) setSavedProfiles(profiles);
      } catch {
        // A failed unseal degrades to keyless mode; it must never crash boot.
        if (!cancelled) setKeystoreEphemeral(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [chats, setChats] = useState<ChatSession[]>(() => {
    const saved = loadJSON<ChatSession[]>(LS_KEYS.chats, []);
    const freshSession: ChatSession = {
      id: Date.now(),
      title: 'New Chat',
      msgs: [],
    };
    const historySessions = Array.isArray(saved)
      ? saved.filter((c) => c && Array.isArray(c.msgs) && c.msgs.length > 0)
      : [];
    return [freshSession, ...historySessions];
  });
  const [activeId, setActiveId] = useState<number>(() => chats[0]?.id || Date.now());

  // ── Supabase Auth + per-user cloud sync ─────────────────────────────────
  const auth = useAuth();
  const cloudClient = auth.configured ? getSupabase() : null;
  const userId = auth.user?.id ?? null;
  // Signed-in accounts show their own name instead of the placeholder name.
  useEffect(() => {
    const meta = (auth.user?.user_metadata || {}) as Record<string, unknown>;
    const accountName = String(
      meta.display_name || meta.full_name || meta.name || ''
    ).trim();
    if (!accountName) return;
    setProfile((prev) =>
      !prev.name || prev.name === 'Bossবোদা' || prev.name === 'Boss'
        ? { ...prev, name: accountName }
        : prev
    );
  }, [auth.user]);
  /** False until the first cloud hydration for this account has completed. */
  const [cloudReady, setCloudReady] = useState(false);
  const [cloudStatus, setCloudStatus] = useState<
    'idle' | 'syncing' | 'saved' | 'offline'
  >('idle');
  /** Last user id that was hydrated, so hydration runs once per account. */
  const hydratedUserRef = useRef<string | null>(null);
  /** Tracks the last authenticated user id so account switch or external sign-out scrubs previous user data. */
  const lastAuthenticatedUidRef = useRef<string | null>(null);
  /** Per-session change signatures already acknowledged by the cloud. */
  const syncedSessionVersions = useRef<Map<number, string>>(new Map());
  const sessionPushTimer = useRef<number | null>(null);
  const statePushTimer = useRef<number | null>(null);
  // v18.2.0 memory bank: migrate and ensure Master Profile baseline (SAYMON HASAN) is always saved.
  const [memory, setMemory] = useState<string[]>(() => {
    const primary = loadJSON<unknown>(LS_KEYS.memory, []);
    const primaryFacts = migrateMemory(primary).facts;
    if (primaryFacts.length > 0) return ensureMasterProfileMemory(primaryFacts);
    const backup = loadJSON<unknown>(LS_KEYS.memoryBackup, []);
    return ensureMasterProfileMemory(migrateMemory(backup).facts);
  });
  const memoryRef = useRef<string[]>(memory);
  useEffect(() => {
    memoryRef.current = memory;
  }, [memory]);
  const [selfWidgets, setSelfWidgets] = useState<SelfUpdateWidget[]>(() =>
    loadJSON<SelfUpdateWidget[]>(LS_KEYS.widgets, [])
  );
  const [notes, setNotes] = useState<NotebookNote[]>(() =>
    sanitizeNotes(loadJSON<NotebookNote[]>(LS_KEYS.notes, []))
  );
  const [connections, setConnections] = useState<VaultConnections>(() =>
    loadVaultConnections()
  );
  const [notebookOpen, setNotebookOpen] = useState(false);
  const [connectionsOpen, setConnectionsOpen] = useState(false);
  // v18.8.0 — code + live preview side workspace (any language, .zip download)
  const [codeWorkspace, setCodeWorkspace] = useState<{
    blocks: CodeBlockInfo[];
    title: string;
  } | null>(null);
  const [skills, setSkills] = useState<SelfSkill[]>(() => loadSkills());
  const [autonomy, setAutonomy] = useState<AutonomyLevel>(() => loadAutonomy());
  const [activeWidgetModal, setActiveWidgetModal] =
    useState<SelfUpdateWidget | null>(null);
  const [selfEvolutionOpen, setSelfEvolutionOpen] = useState(false);

  // View & Primary Model state
  const [currentView, setCurrentView] = useState<'chat' | 'settings' | 'workspace'>(() => {
    if (
      typeof window !== 'undefined' &&
      window.location?.pathname === '/workspace/code'
    ) {
      return 'workspace';
    }
    return 'chat';
  });
  const [workspacePayload, setWorkspacePayload] =
    useState<WorkspaceHandoffPayload | null>(() => loadWorkspaceHandoff());
  const [topProviderMenuOpen, setTopProviderMenuOpen] = useState(false);
  const [bottomProviderMenuOpen, setBottomProviderMenuOpen] = useState(false);
  const [bottomModelMenuOpen, setBottomModelMenuOpen] = useState(false);
  const [moreModelsOpen, setMoreModelsOpen] = useState(false);
  const [providerLimitBanner, setProviderLimitBanner] = useState<{
    profileName: string;
    message: string;
    profileId?: string;
  } | null>(null);

  const [providerTestStatus, setProviderTestStatus] =
    useState<ProviderTestStatus | null>(() => {
      const savedStatus = loadJSON<ProviderTestStatus | null>(
        LS_KEYS.providerStatus,
        null
      );
      if (savedStatus && savedStatus.ok) {
        return {
          ...savedStatus,
          message: sanitizeProprietaryOutput(savedStatus.message || ''),
        };
      }
      return {
        ok: true,
        message: 'Connected · SMFTA Pro',
        testedAt: Date.now(),
        provider: 'xrahat',
      };
    });

  const [usageToday, setUsageToday] = useState<number>(() => {
    const today = new Date().toDateString();
    const u = loadJSON<{ date: string; count: number }>(LS_KEYS.usage, {
      date: today,
      count: 0,
    });
    return u.date === today ? u.count : 0;
  });

  // UI state
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [chatRowMenuId, setChatRowMenuId] = useState<number | null>(null);
  const [engineMenuOpen, setEngineMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [inputText, setInputText] = useState('');
  const [pendingImgs, setPendingImgs] = useState<ImageAttachment[]>([]);
  const [pendingFiles, setPendingFiles] = useState<
    Array<{
      name: string;
      content: string;
      summary?: string;
      doc?: ReadDocumentResult;
    }>
  >([]);
  // v18.6.0 — a loaded .zip project: the assistant can edit exact paths and
  // hand back a repacked archive.
  const [project, setProject] = useState<Project | null>(null);
  const [webSearch, setWebSearch] = useState(
    () => settings.webSearchDefault === true
  );
  const [activeTaskPlan, setActiveTaskPlan] = useState<TaskExecutionPlan | null>(null);
  const [talkMode] = useState(false);
  const [isListening, setIsListening] = useState(false);

  // Flush offline sync queue whenever connectivity returns
  useEffect(() => {
    const handleOnline = () => {
      flushOfflineSyncQueue(cloudClient).catch(() => {});
    };
    window.addEventListener('online', handleOnline);
    if (typeof navigator !== 'undefined' && navigator.onLine) {
      flushOfflineSyncQueue(cloudClient).catch(() => {});
    }
    return () => window.removeEventListener('online', handleOnline);
  }, [cloudClient]);

  // Generation / Streaming state
  const [isGenerating, setIsGenerating] = useState(false);
  const inFlightSendRef = useRef(false);
  const [isWaitingFirstToken, setIsWaitingFirstToken] = useState(false);
  const [streamingMsgId, setStreamingMsgId] = useState<string | null>(null);
  const [genPhase, setGenPhase] = useState<GenPhase | null>(null);
  const [genStepDetail, setGenStepDetail] = useState<string | null>(null);

  // In-Chat Search state
  const [inChatSearchOpen, setInChatSearchOpen] = useState(false);
  const [inChatSearchQuery, setInChatSearchQuery] = useState('');

  // Modals state
  const [studioOpen, setStudioOpen] = useState(false);
  const [codeLabOpen, setCodeLabOpen] = useState(false);
  const [codeLabInit, setCodeLabInit] = useState('');
  const [battleOpen, setBattleOpen] = useState(false);
  const [voiceCallOpen, setVoiceCallOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTabId>('engine');
  const [infoModal, setInfoModal] = useState<'stats' | 'whatsnew' | null>(null);
  const [cmdkOpen, setCmdkOpen] = useState(false);
  const [cmdkQuery, setCmdkQuery] = useState('');
  const [lightboxImg, setLightboxImg] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [speakingMsgId, setSpeakingMsgId] = useState<string | null>(null);
  const [speechState, setSpeechState] = useState<'idle' | 'speaking' | 'paused'>('idle');
  const [voiceLangMode, setVoiceLangMode] = useState<VoiceLangMode>('auto');
  const [voiceReviewPending, setVoiceReviewPending] = useState(false);

  // V2 – Special (Firebase AI) Auth, Firestore Memory Sync & Quota State
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [v2QuotaConfig, setV2QuotaConfig] = useState<V2QuotaConfig>(
    DEFAULT_V2_QUOTA_CONFIG
  );
  const [v2ServerQuotaMap, setV2ServerQuotaMap] = useState<Record<
    V2ModelId,
    V2ModelQuotaStatus
  > | null>(null);
  const [firestoreUsageSnapshot, setFirestoreUsageSnapshot] =
    useState<FirestoreUsageSnapshot | null>(null);
  const [v2TestingBypass, setV2TestingBypass] = useState(false);

  // Renaming chat inline state
  const [renamingChatId, setRenamingChatId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const abortRef = useRef<AbortController | null>(null);
  const chatBoxRef = useRef<HTMLDivElement | null>(null);
  const userScrolledUpRef = useRef<boolean>(false);
  const touchStartYRef = useRef<number | null>(null);
  const [showScrollBottomBtn, setShowScrollBottomBtn] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const sentHistoryRef = useRef<string[]>([]);
  const histIdxRef = useRef<number>(-1);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recogRef = useRef<any>(null);

  const activeChat = chats.find((c) => c.id === activeId) || chats[0];

  const showToast = (msg: string, ms = 2800) => {
    setToastMsg(msg);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToastMsg(null), ms);
  };

  const handleUpdateProfiles = (next: SavedProviderProfile[]) => {
    setSavedProfiles(next);
    const status = persistSavedProfiles(next);
    if (status === 'quota_exceeded') {
      showToast('⚠️ ব্রাউজার স্টোরেজ পূর্ণ — পুরোনো চ্যাট বা ব্যাকআপ এক্সপোর্ট করুন', 4200);
    }
  };

  // P1-20: Single authoritative active profile resolver
  const activeProfile = resolveActiveProfile(settings, savedProfiles);

  const activeDisplayName =
    activeProfile?.name?.trim() ||
    settings.displayName?.trim() ||
    'Msfta shop ai';

  // Raw model id used in requests/metadata. For the built-in keyless engines
  // this is one of the honest SMFTA tier ids — never a fabricated vendor name.
  const activeIsBuiltin = isBuiltinProviderId(
    activeProfile?.provider || settings.provider
  );
  const activeModelName =
    activeProfile?.externalModel?.trim() ||
    settings.externalModel?.trim() ||
    (activeIsBuiltin ? builtinTierForModel('', settings.mode).model : '');

  // Human label for chrome (header, message heads, selector button).
  const activeModelLabel = activeIsBuiltin
    ? builtinTierLabel(activeModelName, settings.mode)
    : activeModelName || 'No model selected';

  const activeAvailableModels = activeProfile
    ? getModelsForProfile(activeProfile)
    : [];

  const activeIsV2 = isV2ModelId(activeModelName);
  const isV2AuthorizedTester = isAuthorizedTestingUser(firebaseUser);
  const v2ResetInfo = getNextRiyadhResetInfo();

  const getV2QuotaStatusForModel = (modelId: V2ModelId): V2ModelQuotaStatus => {
    if (v2ServerQuotaMap && v2ServerQuotaMap[modelId]) {
      return v2ServerQuotaMap[modelId];
    }
    const usedCount = firestoreUsageSnapshot?.usedByModel?.[modelId] ?? 0;
    const testingUsedCount =
      firestoreUsageSnapshot?.testingUsedByModel?.[modelId] ?? 0;
    return evaluateV2ModelQuota({
      modelId,
      usedCount,
      testingUsedCount,
      config: {
        ...v2QuotaConfig,
        testingBypassEnabled: isV2AuthorizedTester
          ? true
          : Boolean(v2TestingBypass && isV2AuthorizedTester),
      },
      isAuthorizedTester: isV2AuthorizedTester,
    });
  };

  const activeV2QuotaStatus = activeIsV2
    ? getV2QuotaStatusForModel(activeModelName as V2ModelId)
    : null;

  useEffect(() => {
    const unsubSpeech = bilingualSpeechPlayer.subscribe((st) => {
      setSpeechState(st.status);
      setSpeakingMsgId(st.msgId);
    });
    return () => unsubSpeech();
  }, []);

  const firestoreSyncedChatSigsRef = useRef<Map<number, string>>(new Map());
  const masterSeededUidRef = useRef<string | null>(null);

  // Observe Firebase Auth & attach real Cloud Firestore listeners when authenticated
  useEffect(() => {
    let unsubConvs: (() => void) | null = null;
    let unsubMems: (() => void) | null = null;
    let unsubUsage: (() => void) | null = null;

    const unsubAuth = observeFirebaseAuth((user) => {
      setFirebaseUser(user);
      unsubConvs?.();
      unsubMems?.();
      unsubUsage?.();
      unsubConvs = null;
      unsubMems = null;
      unsubUsage = null;

      if (user && user.emailVerified) {
        unsubConvs = subscribeToFirestoreConversations(user, (remoteSessions) => {
          setChats((prev) => {
            const byId = new Map(prev.map((c) => [c.id, c]));
            let changed = false;
            for (const rs of remoteSessions) {
              const local = byId.get(rs.id);
              if (
                !local ||
                rs.msgs.length > local.msgs.length ||
                (rs.msgs.length === local.msgs.length && rs.title !== local.title)
              ) {
                byId.set(rs.id, rs);
                changed = true;
              }
            }
            if (!changed) return prev;
            const all = Array.from(byId.values());
            const emptyFirst = all.filter((c) => c.msgs.length === 0);
            const nonEmpty = all
              .filter((c) => c.msgs.length > 0)
              .sort((a, b) => {
                const ta = a.msgs[a.msgs.length - 1]?.ts || a.id;
                const tb = b.msgs[b.msgs.length - 1]?.ts || b.id;
                return tb - ta;
              });
            return [...emptyFirst.slice(0, 1), ...nonEmpty];
          });
        });

        unsubMems = subscribeToFirestoreMemories(user, (remoteFacts) => {
          setMemory((prev) => {
            const merged = ensureMasterProfileMemory([...prev, ...remoteFacts]);
            memoryRef.current = merged;
            return merged;
          });
          if (masterSeededUidRef.current !== user.uid) {
            masterSeededUidRef.current = user.uid;
            for (const fact of MASTER_PROFILE_FACTS) {
              if (!remoteFacts.some((rf) => rf.includes(fact))) {
                void saveMemoryFactToFirestore(
                  user,
                  fact,
                  'master_profile',
                  'smfta-system'
                ).catch(() => {});
              }
            }
          }
        });

        unsubUsage = subscribeToFirestoreV2Usage(user, (snap) => {
          setFirestoreUsageSnapshot(snap);
        });
      }
    });

    return () => {
      unsubAuth();
      unsubConvs?.();
      unsubMems?.();
      unsubUsage?.();
    };
  }, []);

  // Automatically sync all persisted chats (both V1 and V2) to Cloud Firestore when signed in
  useEffect(() => {
    if (!firebaseUser?.uid || !firebaseUser.emailVerified) return;
    if (streamingMsgId !== null) return;
    const timer = window.setTimeout(() => {
      for (const session of chats) {
        if (!session.msgs || session.msgs.length === 0) continue;
        const lastMsg = session.msgs[session.msgs.length - 1];
        const sig = `${session.title}:${session.msgs.length}:${lastMsg?.id || ''}:${(lastMsg?.text || '').length}`;
        if (firestoreSyncedChatSigsRef.current.get(session.id) === sig) continue;
        firestoreSyncedChatSigsRef.current.set(session.id, sig);
        const hasV2 = session.msgs.some((m) => Boolean(m.v2ModelId));
        const modelTag =
          [...session.msgs].reverse().find((m) => m.v2ModelId)?.v2ModelId ||
          activeModelName ||
          'smfta-flash';
        void syncConversationToFirestore(
          firebaseUser,
          session,
          hasV2 ? 'v2' : 'v1',
          modelTag
        ).catch(() => {});
      }
    }, 650);
    return () => window.clearTimeout(timer);
  }, [chats, firebaseUser, streamingMsgId, activeModelName]);

  // Sync V2 server-side daily quota status on mount or user change
  useEffect(() => {
    let cancelled = false;
    const fetchV2Quota = async () => {
      try {
        const uid = firebaseUser?.uid || 'default-user';
        const email = firebaseUser?.email || '';
        const verified = Boolean(firebaseUser?.emailVerified);
        const qs = new URLSearchParams({
          userId: uid,
          userEmail: email,
          emailVerified: verified ? 'true' : 'false',
        });
        const res = await fetch(`/api/v2/quota?${qs.toString()}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data?.ok && data.models) {
          setV2ServerQuotaMap(data.models);
          if (data.config) setV2QuotaConfig(data.config);
        }
      } catch {
        // Ignore offline/standalone quota fetch
      }
    };
    void fetchV2Quota();
    return () => {
      cancelled = true;
    };
  }, [firebaseUser]);

  const handleSelectProfile = (prof: SavedProviderProfile) => {
    const nextModel =
      prof.externalModel?.trim() ||
      prof.availableModels?.[0] ||
      (isBuiltinProviderId(prof.provider)
        ? builtinTierForModel('', settings.mode).model
        : '');
    setSettings((prev) =>
      sanitizeSettings({
        ...prev,
        provider: prof.provider,
        externalKeys: prof.externalKeys,
        externalModel: nextModel,
        externalBaseUrl: prof.externalBaseUrl,
        activeProfileId: prof.id,
        displayName: prof.name,
      })
    );
    setProviderLimitBanner(null);
    setTopProviderMenuOpen(false);
    setBottomProviderMenuOpen(false);
    showToast(
      nextModel
        ? `Switched to ${prof.name} · ${
            isBuiltinProviderId(prof.provider)
              ? builtinTierLabel(nextModel, settings.mode)
              : nextModel
          }`
        : `Switched to ${prof.name}`
    );
  };

  const handleSelectModel = (modelId: string) => {
    const trimmed = modelId.trim();
    if (!trimmed) return;
    const isV2 = isV2ModelId(trimmed);
    // Picking a built-in tier also switches the reasoning mode so request and
    // label stay consistent; external models only change the model id.
    const tier = BUILTIN_TIERS.find((t) => t.model === trimmed);
    setSettings((prev) =>
      sanitizeSettings(
        tier
          ? { ...prev, externalModel: trimmed, mode: tier.id }
          : isV2
          ? {
              ...prev,
              provider: 'smfta_cloud',
              externalModel: trimmed,
              mode:
                trimmed === 'smfta-v5'
                  ? 'fast'
                  : trimmed === 'smfta-max'
                    ? 'power'
                    : 'balanced',
            }
          : { ...prev, externalModel: trimmed }
      )
    );
    if (activeProfile) {
      const updated = savedProfiles.map((p) =>
        p.id === activeProfile.id
          ? {
              ...p,
              provider: isV2 ? 'smfta_cloud' : p.provider,
              externalModel: trimmed,
            }
          : p
      );
      handleUpdateProfiles(updated);
    }
    setBottomModelMenuOpen(false);
    showToast(
      tier
        ? `Model: ${tier.label}`
        : isV2
          ? `V2 – Special: ${getV2ModelSpec(trimmed).label}`
          : `Model: ${trimmed}`
    );
  };

  // ── v19.0.0 Full-screen Code Workspace (/workspace/code) handoff ─────────
  useEffect(() => {
    if (typeof window === 'undefined' || !window.addEventListener) return;
    const onPopState = () => {
      if (window.location?.pathname === '/workspace/code') {
        setWorkspacePayload(loadWorkspaceHandoff());
        setCurrentView('workspace');
      } else {
        setCurrentView((prev) => (prev === 'workspace' ? 'chat' : prev));
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    cleanupStaleLocalStorage();
    if (typeof window !== 'undefined') {
      (
        window as Window & {
          runSystemDiagnostics?: typeof runSystemDiagnostics;
        }
      ).runSystemDiagnostics = () => runSystemDiagnostics();
    }
  }, []);

  const handleOpenCodeWorkspace = (
    blocks: CodeBlockInfo[],
    selectedBlockIndex = 0,
    messageId?: string
  ) => {
    const rawBlocks =
      blocks.length > 0
        ? blocks.map((b) => ({ lang: b.lang, code: b.content }))
        : [
            {
              lang: 'html',
              code: '<!doctype html>\n<html lang="en">\n<head>\n  <meta charset="utf-8" />\n  <title>SMFTA Workspace</title>\n  <style>\n    body { font-family: system-ui, sans-serif; padding: 24px; background: #0f172a; color: #f8fafc; }\n    button { padding: 10px 16px; border-radius: 8px; border: 0; background: #6366f1; color: #fff; font-weight: 600; cursor: pointer; }\n  </style>\n</head>\n<body>\n  <h1>SMFTA Code Workspace</h1>\n  <p>Click Run in the toolbar above to execute inside the isolated sandbox.</p>\n  <button onclick="console.log(\'Clicked at\', new Date().toLocaleTimeString())">Log to Console</button>\n</body>\n</html>',
            },
          ];
    const payload = createWorkspaceHandoffPayload({
      rawBlocks,
      selectedIndex: selectedBlockIndex,
      conversationId: activeChat.id,
      messageId: messageId || null,
      conversationTitle: activeChat.title || 'Code Workspace',
    });
    saveWorkspaceHandoff(payload);
    setWorkspacePayload(payload);
    // Stay on "/": the site router has no /workspace/code page, so changing
    // the address showed a 404 instead of the workspace and its preview.
    setCurrentView('workspace');
  };

  const handleBackFromWorkspace = (returnContext?: {
    conversationId?: string | number | null;
    messageId?: string | null;
  }) => {
    try {
      if (
        typeof window !== 'undefined' &&
        window.history?.pushState &&
        window.location?.pathname === '/workspace/code'
      ) {
        window.history.pushState({ view: 'chat' }, '', '/');
      }
    } catch {
      // Ignore history API errors
    }
    if (returnContext?.conversationId != null) {
      const targetId = Number(returnContext.conversationId);
      if (Number.isFinite(targetId) && chats.some((c) => c.id === targetId)) {
        setActiveId(targetId);
      }
    }
    setCurrentView('chat');
  };

  // ── v18.5.0 mobile viewport guard ────────────────────────────────────────
  // On phones the on-screen keyboard shrinks the *visual* viewport while the
  // layout viewport stays tall, which used to push the composer off-screen and
  // "break" the layout. Track the real height so the shell always fits.
  useEffect(() => {
    const vv = (window as unknown as { visualViewport?: VisualViewport })
      .visualViewport;
    if (!vv) return;
    const apply = () => {
      const h = Math.round(vv.height);
      if (h > 120) {
        document.documentElement.style.setProperty('--app-height', `${h}px`);
      }
    };
    apply();
    vv.addEventListener('resize', apply);
    vv.addEventListener('scroll', apply);
    return () => {
      vv.removeEventListener('resize', apply);
      vv.removeEventListener('scroll', apply);
    };
  }, []);

  // Sync theme, accent, fontsize, mono, and AI self-updated custom CSS
  useEffect(() => {
    // v18.11 — 'system' follows the OS color scheme until the user picks one.
    const resolveTheme = (): 'dark' | 'light' => {
      if (settings.themeMode === 'system') {
        return window.matchMedia?.('(prefers-color-scheme: light)').matches
          ? 'light'
          : 'dark';
      }
      return settings.theme;
    };
    document.documentElement.setAttribute('data-theme', resolveTheme());
    const appLang = settings.appLanguage || 'bn';
    document.documentElement.lang = appLang;
    document.documentElement.setAttribute('data-app-lang', appLang);
    document.documentElement.setAttribute('data-accent', settings.accent);
    document.documentElement.setAttribute('data-fontsize', settings.fontsize);
    document.documentElement.setAttribute(
      'data-font-family',
      settings.fontFamily || 'system'
    );
    document.documentElement.setAttribute(
      'data-bubble',
      settings.bubbleStyle || 'rounded'
    );
    document.documentElement.setAttribute(
      'data-reduced-motion',
      settings.reducedMotion ? '1' : '0'
    );
    // v18.11 — custom accent hex drives the same accent variables.
    if (settings.accent === 'custom' && settings.accentCustom) {
      document.documentElement.style.setProperty(
        '--custom-accent',
        settings.accentCustom
      );
    } else {
      document.documentElement.style.removeProperty('--custom-accent');
    }
    // v18.2.0 — real UI/UX self-control: the AI can reshape the interface.
    document.documentElement.setAttribute(
      'data-radius',
      settings.radius || 'soft'
    );
    document.documentElement.setAttribute(
      'data-density',
      settings.density || 'cozy'
    );
    document.documentElement.setAttribute(
      'data-mono',
      settings.mono ? '1' : '0'
    );
    // v19.0.0 — extended appearance & accessibility attributes
    document.documentElement.setAttribute(
      'data-code-font',
      settings.codeFontSize || 'normal'
    );
    document.documentElement.setAttribute(
      'data-code-theme',
      settings.codeBlockTheme || 'dark'
    );
    document.documentElement.setAttribute(
      'data-msg-spacing',
      settings.messageSpacing || 'normal'
    );
    document.documentElement.setAttribute(
      'data-layout-width',
      settings.layoutWidth || 'standard'
    );
    document.documentElement.setAttribute(
      'data-high-contrast',
      settings.highContrast ? '1' : '0'
    );
    document.documentElement.setAttribute(
      'data-focus-ring',
      settings.focusRingVisible !== false ? '1' : '0'
    );
    document.documentElement.setAttribute(
      'data-touch-targets',
      settings.largeTouchTargets ? '1' : '0'
    );
    // v18.11 — API keys are sealed with AES-GCM before they touch localStorage.
    // Plaintext lives only in React state / request memory, never on disk.
    if (settings.externalKeys) {
      encryptSecret(settings.externalKeys)
        .then((sealed) => {
          localStorage.setItem(
            LS_KEYS.settings,
            JSON.stringify({ ...settings, externalKeys: sealed })
          );
        })
        .catch(() => {
          // Keystore unavailable: persist every non-secret setting, but never
          // fall back to writing a plaintext key.
          localStorage.setItem(
            LS_KEYS.settings,
            JSON.stringify({ ...settings, externalKeys: '' })
          );
        });
    } else {
      localStorage.setItem(LS_KEYS.settings, JSON.stringify(settings));
    }

    let styleTag = document.getElementById(
      'smfta-self-css'
    ) as HTMLStyleElement | null;
    if (settings.customCss && settings.customCss.trim()) {
      if (!styleTag) {
        styleTag = document.createElement('style');
        styleTag.id = 'smfta-self-css';
        document.head.appendChild(styleTag);
      }
      styleTag.textContent = settings.customCss;
    } else if (styleTag) {
      styleTag.textContent = '';
    }
  }, [settings]);

  // v18.11 — live OS theme changes while Theme Mode is "System".
  useEffect(() => {
    if (settings.themeMode !== 'system') return;
    const mq = window.matchMedia?.('(prefers-color-scheme: light)');
    if (!mq) return;
    const apply = () =>
      document.documentElement.setAttribute(
        'data-theme',
        mq.matches ? 'light' : 'dark'
      );
    apply();
    mq.addEventListener?.('change', apply);
    return () => mq.removeEventListener?.('change', apply);
  }, [settings.themeMode]);

  useEffect(() => {
    localStorage.setItem(LS_KEYS.profile, JSON.stringify(profile));
  }, [profile]);

  useEffect(() => {
    if (streamingMsgId !== null) return;
    // v18.11 — Auto-Save Conversations can be turned off entirely.
    if (settings.autoSaveChat === false) return;
    try {
      localStorage.setItem(LS_KEYS.chats, JSON.stringify(chats));
    } catch {
      showToast(
        '⚠️ স্টোরেজ কোটা পূর্ণ — চ্যাট সংরক্ষণে সমস্যা হচ্ছে। অনুগ্রহ করে Backup এক্সপোর্ট করুন।',
        4500
      );
    }
  }, [chats, streamingMsgId, settings.autoSaveChat]);

  // v18.11 — real retention enforcement: prune chats older than retentionDays
  // (0 = keep forever) once on mount. Uses message timestamps, not estimates.
  useEffect(() => {
    const days = settings.retentionDays ?? 0;
    if (!days || days <= 0) return;
    const cutoff = Date.now() - days * 86400000;
    setChats((prev) => {
      const kept = prev
        .map((c) => ({
          ...c,
          msgs: c.msgs.filter((m) => (m.ts || 0) >= cutoff),
        }))
        .filter((c) => c.msgs.length > 0);
      const unchanged =
        kept.length === prev.length &&
        kept.every((c, i) => c.msgs.length === prev[i]?.msgs.length);
      if (unchanged) return prev;
      // Never leave the workspace without a usable active chat.
      if (kept.length === 0) {
        return [
          { id: Date.now(), title: 'New Chat', msgs: [] } as ChatSession,
        ];
      }
      return kept;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (providerTestStatus) {
      try {
        localStorage.setItem(
          LS_KEYS.providerStatus,
          JSON.stringify(providerTestStatus)
        );
      } catch {
        // Ignore storage quota errors
      }
    }
  }, [providerTestStatus]);

  useEffect(() => {
    try {
      const ranked = factsToText(migrateMemory(memory).facts, MEMORY_MAX);
      if (ranked.length === 0) {
        clearEntireMemoryBank();
        return;
      }
      // Primary + backup copy: memory must survive a single corrupted/cleared key.
      localStorage.setItem(LS_KEYS.memory, JSON.stringify(ranked));
      localStorage.setItem(
        LS_KEYS.memoryBackup,
        JSON.stringify({ facts: ranked, savedAt: Date.now() })
      );
    } catch {
      // Storage full/blocked: the in-memory copy still works this session.
    }
  }, [memory]);

  /** Wipes the memory bank AND its backup so "forget everything" really sticks. */
  const forgetAllMemory = () => {
    memoryRef.current = [];
    setMemory([]);
    clearEntireMemoryBank();
  };

  /** Central memory writer: de-dupes, merges same-key facts, caps at MEMORY_MAX.
   *  Returns the facts that were genuinely new so the UI can confirm them. */
  const rememberFacts = (incoming: string[], source: 'ai' | 'user' | 'auto' = 'ai') => {
    const clean = incoming
      .map((t) => (t || '').trim())
      .filter((t) => t.length >= 2)
      .slice(0, 40);
    if (clean.length === 0) return [] as string[];
    const res = addFacts(migrateMemory(memoryRef.current).facts, clean, { source });
    if (res.added.length > 0 || res.facts.length > 0) {
      const next = factsToText(res.facts, MEMORY_MAX);
      memoryRef.current = next;
      setMemory(next);
    }
    return res.added;
  };

  useEffect(() => {
    localStorage.setItem(LS_KEYS.widgets, JSON.stringify(selfWidgets));
  }, [selfWidgets]);

  useEffect(() => {
    try {
      localStorage.setItem(LS_KEYS.notes, JSON.stringify(notes));
    } catch {
      // Ignore storage quota errors (very large notebooks)
    }
  }, [notes]);

  useEffect(() => {
    persistSkills(skills);
  }, [skills]);

  useEffect(() => {
    persistAutonomy(autonomy);
  }, [autonomy]);

  // ==========================================================================
  // SUPABASE CLOUD WORKSPACE — per-account hydration & two-way sync.
  // All tables are RLS-protected owner-only; API keys are stripped before
  // upload and remain exclusively in the on-device AES-GCM keystore.
  // ==========================================================================

  /** Builds the secret-free state document pushed to smfta_user_state. */
  const buildCloudStatePayload = (): CloudStatePayload => ({
    settings: stripSettingsSecrets(settings) as unknown as Record<
      string,
      unknown
    >,
    memory,
    saved_profiles: stripProfileSecrets(savedProfiles),
    notes,
    widgets: selfWidgets,
    skills,
    autonomy,
    active_project: project ? {
      name: project.name,
      files: project.files.map((f) => ({ path: f.path, content: f.text || '' })),
    } : undefined,
    connections: connections ? (sanitizeVaultConnections(connections) as unknown as Record<string, unknown>) : undefined,
  });

  /** First login on a fresh account: upload this device's local workspace. */
  const migrateLocalToCloud = async (client: NonNullable<typeof cloudClient>, uid: string) => {
    await saveCloudState(client, uid, buildCloudStatePayload());
    await saveCloudProfile(
      client,
      uid,
      profile,
      auth.user?.email,
      settings.avatarDataUrl
    ).catch(() => undefined);
    for (const session of chats.filter(isPersistableSession)) {
      const status = await upsertCloudSession(client, uid, session);
      if (status === 'saved') {
        syncedSessionVersions.current.set(session.id, sessionVersion(session));
      }
    }
  };

  /** Replace local workspace state with the account's cloud document. */
  const applyCloudWorkspace = (
    state: CloudStateRow | null,
    rows: CloudSessionRow[],
    ignoreLocalChats = false
  ) => {
    const merged = mergeSessions(ignoreLocalChats ? [] : chats, rows);
    const nextSessions: ChatSession[] =
      merged.length > 0
        ? merged
        : [{ id: Date.now(), title: 'New Chat', msgs: [] } as ChatSession];
    syncedSessionVersions.current = new Map(
      nextSessions
        .filter(isPersistableSession)
        .map((s) => [s.id, sessionVersion(s)])
    );
    setChats(nextSessions);
    if (!nextSessions.some((c) => c.id === activeId)) {
      setActiveId(nextSessions[0].id);
    }
    if (!state) return;
    if (state.settings && Object.keys(state.settings).length > 0) {
      // The live API key never leaves the device — keep the local one only for the same user.
      setSettings((prev) =>
        sanitizeSettings({
          ...parseCloudSettings(state.settings),
          externalKeys: ignoreLocalChats ? '' : prev.externalKeys,
        })
      );
    }
    if (Array.isArray(state.memory) && state.memory.length > 0) {
      const restored = factsToText(
        migrateMemory(state.memory).facts,
        MEMORY_MAX
      );
      memoryRef.current = restored;
      setMemory(restored);
    }
    if (Array.isArray(state.notes) && state.notes.length > 0) {
      setNotes(sanitizeNotes(state.notes));
    }
    if (Array.isArray(state.widgets) && state.widgets.length > 0) {
      setSelfWidgets(state.widgets);
    }
    if (Array.isArray(state.skills) && state.skills.length > 0) {
      setSkills(state.skills);
    }
    if (state.autonomy) setAutonomy(state.autonomy);
    if (Array.isArray(state.saved_profiles) && state.saved_profiles.length > 0) {
      setSavedProfiles((prev) =>
        mergeProviderProfiles(
          state.saved_profiles,
          ignoreLocalChats ? [{ ...DEFAULT_BUILTIN_PROFILE }] : prev
        ).map(normalizeProviderProfile)
      );
    }
  };

  // Hydrate once per authenticated account and scrub workspace on account switch / external sign-out.
  useEffect(() => {
    if (!auth.configured || !cloudClient || !userId) {
      if (lastAuthenticatedUidRef.current !== null) {
        resetLocalWorkspace();
        lastAuthenticatedUidRef.current = null;
      }
      setCloudReady(false);
      hydratedUserRef.current = null;
      syncedSessionVersions.current.clear();
      setCloudStatus('idle');
      return;
    }
    const switchedFromAnotherUser =
      lastAuthenticatedUidRef.current !== null &&
      lastAuthenticatedUidRef.current !== userId;
    if (switchedFromAnotherUser) {
      resetLocalWorkspace();
    }
    lastAuthenticatedUidRef.current = userId;
    if (hydratedUserRef.current === userId) return;
    let cancelled = false;
    setCloudStatus('syncing');
    (async () => {
      try {
        const [state, rows] = await Promise.all([
          fetchCloudState(cloudClient, userId),
          fetchCloudSessions(cloudClient, userId),
        ]);
        if (cancelled) return;
        if (isCloudEmpty(state, rows)) {
          if (!switchedFromAnotherUser) {
            await migrateLocalToCloud(cloudClient, userId);
          }
        } else {
          // A settings change that had not reached the cloud yet (e.g. the page
          // was reloaded right after a change) wins over the older cloud copy.
          let localPending = false;
          try {
            localPending = localStorage.getItem(STATE_PENDING_KEY) === userId;
          } catch {
            /* storage unavailable */
          }
          applyCloudWorkspace(
            localPending && !switchedFromAnotherUser ? null : state,
            rows,
            switchedFromAnotherUser
          );
        }
        hydratedUserRef.current = userId;
        setCloudReady(true);
        setCloudStatus('saved');
      } catch (hydrateErr) {
        if (cancelled) return;
        // Valid session but unreachable database: stay usable in offline mode.
        setCloudReady(true);
        setCloudStatus('offline');
        showToast('Cloud sync unavailable — working offline');
        console.warn('[cloudSync.hydrate]', hydrateErr);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, auth.configured]);

  // Debounced push of conversation changes (one row per conversation).
  useEffect(() => {
    if (!cloudReady || !cloudClient || !userId) return;
    if (sessionPushTimer.current) window.clearTimeout(sessionPushTimer.current);
    sessionPushTimer.current = window.setTimeout(async () => {
      try {
        for (const session of chats) {
          if (!isPersistableSession(session)) continue;
          if (
            syncedSessionVersions.current.get(session.id) ===
            sessionVersion(session)
          ) {
            continue;
          }
          const status = await upsertCloudSession(cloudClient, userId, session);
          if (status === 'too_large') {
            showToast(
              'Conversation is too large to sync — export it as a backup file.'
            );
            continue;
          }
          syncedSessionVersions.current.set(
            session.id,
            sessionVersion(session)
          );
        }
        setCloudStatus('saved');
      } catch (pushErr) {
        setCloudStatus('offline');
        console.warn('[cloudSync.pushSessions]', pushErr);
      }
    }, 1500);
    return () => {
      if (sessionPushTimer.current) {
        window.clearTimeout(sessionPushTimer.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chats, cloudReady, userId, cloudClient]);

  // Debounced push of the secret-free user state document.
  useEffect(() => {
    if (!cloudReady || !cloudClient || !userId) return;
    if (statePushTimer.current) window.clearTimeout(statePushTimer.current);
    try {
      localStorage.setItem(STATE_PENDING_KEY, userId);
    } catch {
      /* storage unavailable */
    }
    const pushState = async () => {
      statePushTimer.current = null;
      try {
        const result = await saveCloudState(
          cloudClient,
          userId,
          buildCloudStatePayload()
        );
        if (result === 'too_large') {
          showToast('Workspace data is too large to sync.');
          return;
        }
        try {
          localStorage.removeItem(STATE_PENDING_KEY);
        } catch {
          /* storage unavailable */
        }
        await saveCloudProfile(
          cloudClient,
          userId,
          profile,
          auth.user?.email,
          settings.avatarDataUrl
        ).catch(() => undefined);
        setCloudStatus('saved');
      } catch (pushErr) {
        setCloudStatus('offline');
        console.warn('[cloudSync.pushState]', pushErr);
      }
    };
    statePushTimer.current = window.setTimeout(pushState, 600);
    // Leaving or hiding the page: send the pending change right away.
    const flushNow = () => {
      if (statePushTimer.current === null) return;
      window.clearTimeout(statePushTimer.current);
      void pushState();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flushNow();
    };
    window.addEventListener('pagehide', flushNow);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', flushNow);
      document.removeEventListener('visibilitychange', onVisibility);
      if (statePushTimer.current) {
        window.clearTimeout(statePushTimer.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    settings,
    memory,
    savedProfiles,
    notes,
    selfWidgets,
    skills,
    autonomy,
    profile,
    cloudReady,
    userId,
    cloudClient,
  ]);

  /** Flush every pending change before sign-out so nothing is lost. */
  const flushCloudWrites = async () => {
    if (!cloudClient || !userId || !cloudReady) return;
    try {
      await saveCloudState(cloudClient, userId, buildCloudStatePayload());
      for (const session of chats.filter(isPersistableSession)) {
        await upsertCloudSession(cloudClient, userId, session);
      }
    } catch (flushErr) {
      console.warn('[cloudSync.flush]', flushErr);
    }
  };

  /** Clears every local/private cache (used on sign-out and full wipe). */
  const resetLocalWorkspace = () => {
    try {
      Object.values(LS_KEYS).forEach((k) => localStorage.removeItem(k));
      localStorage.removeItem(SAVED_PROFILES_KEY);
      localStorage.removeItem('smfta_autonomy');
      localStorage.removeItem('smfta_self_skills');
      localStorage.removeItem('smfta_battle_wins');
    } catch {
      // Storage blocked — in-memory reset still applies.
    }
    const fresh: ChatSession = {
      id: Date.now(),
      title: 'New Chat',
      titleSource: 'auto',
      msgs: [],
    };
    setChats([fresh]);
    setActiveId(fresh.id);
    forgetAllMemory();
    setSettings({ ...DEFAULT_SETTINGS });
    setSavedProfiles([{ ...DEFAULT_BUILTIN_PROFILE }]);
    setNotes([]);
    setSelfWidgets([]);
    setSkills([]);
    setConnections(sanitizeVaultConnections({}));
    setProviderTestStatus(null);
    setProviderLimitBanner(null);
    syncedSessionVersions.current.clear();
  };

  /** Sign out: flush cloud writes, end the Supabase session, scrub local data. */
  const handleSignOut = async () => {
    try {
      await flushCloudWrites();
      await auth.signOut();
      resetLocalWorkspace();
      setSettingsOpen(false);
      setCurrentView('chat');
      showToast('Signed out — local workspace cleared');
    } catch (err) {
      showToast(friendlyAuthError(err));
    }
  };

  // Boot self-repair: a broken stored setting can never brick the engine.
  useEffect(() => {
    setSettings((prev) => {
      const repaired = applyAutoRepairs(prev, {
        memory,
        notes: notes.length,
        widgets: selfWidgets,
        skills,
        driveConnected: Boolean(connections.drive.connected),
        githubConnected: Boolean(connections.github.connected),
        autonomy,
      });
      if (repaired.actions.length === 0) return prev;
      showToast(`Self-repair: ${repaired.actions.join(' · ')}`, 4200);
      return sanitizeSettings(repaired.settings);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Installs skills the AI built for itself (⟦SELF_CODE⟧ / payload.skills). */
  const applySelfSkills = (drafts: SelfSkillDraft[]): string[] => {
    const installed: string[] = [];
    const widgetsToOpen: SelfUpdateWidget[] = [];
    setSkills((prev) => {
      const next = [...prev];
      for (const draft of drafts.slice(0, 5)) {
        const skill = skillFromDraft(draft, 'ai');
        if (!skill) continue;
        // Never duplicate a capability the AI already owns.
        const existingIndex = next.findIndex(
          (sk) => sk.name.toLowerCase() === skill.name.toLowerCase()
        );
        if (existingIndex >= 0) {
          next[existingIndex] = { ...skill, id: next[existingIndex].id, runs: next[existingIndex].runs };
        } else {
          next.unshift(skill);
        }
        installed.push(skill.name);
        if (skill.type === 'widget' && skill.code) {
          const widget: SelfUpdateWidget = {
            id: `w-${skill.id}`,
            title: skill.name,
            description: skill.description || 'AI-built skill',
            code: skill.code,
            enabled: true,
            createdAt: Date.now(),
          };
          widgetsToOpen.push(widget);
        }
      }
      return next.slice(0, 40);
    });
    if (widgetsToOpen.length > 0) {
      setSelfWidgets((prev) => [
        ...widgetsToOpen.filter((w) => !prev.some((x) => x.id === w.id)),
        ...prev,
      ].slice(0, 20));
      setActiveWidgetModal(widgetsToOpen[0]);
    }
    if (installed.length > 0) {
      showToast(`Skill installed: ${installed.join(' · ')}`, 4200);
    }
    return installed;
  };

  const handleSelfRepair = () => {
    const repaired = applyAutoRepairs(settings, {
      memory,
      notes: notes.length,
      widgets: selfWidgets,
      skills,
      driveConnected: Boolean(connections.drive.connected),
      githubConnected: Boolean(connections.github.connected),
      autonomy,
    });
    setSettings(sanitizeSettings(repaired.settings));
    setMemory(factsToText(migrateMemory(repaired.memory).facts, MEMORY_MAX));
    const report = runSelfCheck({
      settings: repaired.settings,
      memory: repaired.memory,
      notes: notes.length,
      widgets: selfWidgets,
      skills,
      driveConnected: Boolean(connections.drive.connected),
      githubConnected: Boolean(connections.github.connected),
      autonomy,
    });
    showToast(
      repaired.actions.length > 0
        ? `Repaired: ${repaired.actions.join(' · ')}`
        : `Self-check ${report.score}% — nothing to repair`,
      4600
    );
    return report;
  };

  /**
   * Executes deterministic self-update orders understood from plain language.
   * This is what makes "নিজেকে বদলাও" work 100% of the time — it never depends
   * on the model remembering to emit a ⟦SELF_UPDATE⟧ block.
   */
  const applySelfActions = (actions: SelfAction[]): string[] => {
    const applied: string[] = [];
    const patch: Partial<AppSettings> = {};
    let touchedPatch = false;

    for (const action of actions) {
      if (action.kind === 'settings' && action.patch) {
        Object.assign(patch, action.patch);
        touchedPatch = true;
        applied.push(action.label);
        continue;
      }
      if (action.kind === 'memory') {
        if (action.clearMemory) {
          forgetAllMemory();
          applied.push('Memory cleared');
        }
        if (action.memory?.length) {
          setMemory((prev) => {
            let updated = [...prev];
            for (const fact of action.memory || []) {
              if (!updated.some((x) => x.toLowerCase() === fact.toLowerCase())) {
                updated = [...updated.slice(-59), fact];
              }
            }
            return updated;
          });
          applied.push('Memory saved');
        }
        continue;
      }
      if (action.kind === 'autonomy' && action.autonomy) {
        setAutonomy(action.autonomy);
        applied.push(`Autonomy → ${action.autonomy.toUpperCase()}`);
        continue;
      }
      if (action.kind === 'skill' && action.skill) {
        const installed = applySelfSkills([action.skill]);
        if (installed.length) applied.push(`Skill → ${installed.join(', ')}`);
        continue;
      }
      if (action.kind === 'repair') {
        handleSelfRepair();
        applied.push('Self-repair done');
        continue;
      }
      if (action.kind === 'connector') {
        if (action.connector === 'drive' || action.connector === 'github') {
          setConnectionsOpen(true);
          applied.push('Opened Cloud Connectors');
        }
        continue;
      }
      if (action.kind === 'launch') {
        if (typeof action.webSearch === 'boolean') {
          setWebSearch(action.webSearch);
          applied.push(`Web search → ${action.webSearch ? 'ON' : 'OFF'}`);
          continue;
        }
        if (action.connector === 'notebook') {
          setNotebookOpen(true);
          applied.push('Opened Notebook');
        } else if (action.connector === 'settings') {
          setSettingsTab('self');
          setCurrentView('settings');
          applied.push('Opened Control Center');
        }
      }
    }

    if (touchedPatch) {
      setSettings((prev) => {
        const { next, changes, rejected } = reconcileSettings(prev, patch);
        if (rejected.length) {
          showToast(`Skipped invalid: ${rejected.join(', ')}`, 3800);
        }
        return changes.length ? sanitizeSettings(next) : prev;
      });
    }
    return applied;
  };

  const handleUpdateConnections = (next: VaultConnections) => {
    const clean = sanitizeVaultConnections(next);
    setConnections(clean);
    persistVaultConnections(clean);
  };

  const handleUpdateActiveChatServiceContext = (
    nextCtx: ChatServiceSelectionContext
  ) => {
    setChats((prev) =>
      prev.map((c) =>
        c.id === activeChat.id
          ? {
              ...c,
              serviceContext: nextCtx,
            }
          : c
      )
    );
  };

  // Global 1-Click Direct OAuth Callback Listener (so connecting from Chatbox Toolbar works even when Settings is closed)
  useEffect(() => {
    if (settingsOpen || connectionsOpen || currentView === 'settings') {
      // VaultConnectionsPanel handles its own message listener when open
      return;
    }
    const onOAuthMessage = async (event: MessageEvent) => {
      const data = event.data;
      if (
        !data ||
        (data.type !== 'OAUTH_AUTH_SUCCESS' &&
          data.type !== 'OAUTH_AUTH_ERROR' &&
          data.type !== 'smfta_oauth_callback')
      ) {
        return;
      }
      const provider = data.provider as 'github' | 'vercel' | 'supabase' | 'google';
      if (data.type === 'OAUTH_AUTH_ERROR' || data.ok === false || data.error) {
        showToast(data.error || `${provider} OAuth failed`, 4200);
        return;
      }
      const accessToken = String(data.accessToken || '').trim();
      const refreshToken = String(data.refreshToken || '').trim();
      if (!accessToken) return;

      await storeEncryptedProviderSession({
        provider,
        accessToken,
        refreshToken: refreshToken || undefined,
        expiresIn: Number(data.expiresIn || 0) || undefined,
      });

      const verifyRes = await verifyProviderPermissions({
        provider,
        token: accessToken,
      });

      setConnections((prev) => {
        const next = sanitizeVaultConnections({ ...prev });
        if (provider === 'github') {
          const meta = (verifyRes.accountMeta || {}) as Record<string, any>;
          next.github = {
            ...next.github,
            token: accessToken,
            owner: meta.defaultOwner || next.github.owner,
            repo: meta.defaultRepo || next.github.repo,
            branch: meta.defaultBranch || next.github.branch || 'main',
            connected: verifyRes.ok,
            status: verifyRes.status,
            account: verifyRes.account || next.github.account,
            grantedPermissions: verifyRes.grantedScopes || verifyRes.grantedPermissions,
            missingPermissions: verifyRes.missingScopes || verifyRes.missingPermissions,
            permissionChecks: verifyRes.permissions,
            availableServices: verifyRes.availableServices,
            lastSyncAt: Date.now(),
          };
        } else if (provider === 'vercel') {
          next.vercel = {
            ...(next.vercel || { token: '', projectId: '', connected: false }),
            token: accessToken,
            connected: verifyRes.ok,
            status: verifyRes.status,
            account: verifyRes.account || next.vercel?.account,
            grantedPermissions: verifyRes.grantedPermissions,
            missingPermissions: verifyRes.missingPermissions,
            availableServices: verifyRes.availableServices,
            lastSyncAt: Date.now(),
          };
        } else if (provider === 'supabase') {
          next.supabase = {
            ...(next.supabase || {
              projectUrl: '',
              anonKey: '',
              serviceRoleKey: '',
              connected: false,
            }),
            managementToken: accessToken,
            connected: verifyRes.ok,
            status: verifyRes.status,
            account: verifyRes.account || next.supabase?.account,
            grantedPermissions: verifyRes.grantedPermissions,
            missingPermissions: verifyRes.missingPermissions,
            availableServices: verifyRes.availableServices,
            lastSyncAt: Date.now(),
          };
        } else if (provider === 'google') {
          next.drive = {
            ...next.drive,
            accessToken,
            connected: verifyRes.ok,
            status: verifyRes.status,
            account: verifyRes.account || next.drive.account,
            grantedScopes: verifyRes.grantedPermissions,
            missingScopes: verifyRes.missingPermissions,
            availableServices: verifyRes.availableServices,
            lastSyncAt: Date.now(),
          };
        }
        persistVaultConnections(next);
        return next;
      });

      showToast(
        verifyRes.message || `${provider.toUpperCase()} connected successfully!`,
        4000
      );
    };
    window.addEventListener('message', onOAuthMessage);
    return () => window.removeEventListener('message', onOAuthMessage);
  }, [settingsOpen, connectionsOpen, currentView]);

  /**
   * AI-written notes (⟦NOTE⟧ blocks) → Notebook, optionally pushed straight to
   * the user's Google Drive / GitHub account.
   */
  const applyAINotes = (drafts: AINoteDraft[]): string[] => {
    const created: Array<{ note: NotebookNote; draft: AINoteDraft }> = [];
    for (const draft of drafts.slice(0, 5)) {
      const note = createNote({
        title: (draft.title || 'Untitled note').slice(0, 200),
        content: draft.content || '',
        tags: (draft.tags || []).slice(0, 8),
        filename: draft.filename,
      });
      created.push({ note, draft });
    }
    if (created.length === 0) return [];

    // 1. Local-first: notes appear instantly, the chat never waits on the cloud.
    setNotes((prev) => [...created.map((c) => c.note), ...prev].slice(0, 300));

    // 2. Background cloud push (explicit save target or auto-sync).
    void (async () => {
      for (const { note, draft } of created) {
        let target: 'local' | 'drive' | 'github' = draft.save || 'local';
        if (target === 'local') {
          if (connections.drive.autoSync && connections.drive.connected) {
            target = 'drive';
          } else if (
            connections.github.autoSync &&
            connections.github.connected
          ) {
            target = 'github';
          }
        }
        if (target === 'local') continue;
        const res =
          target === 'drive'
            ? await pushNoteToDrive(connections.drive, note)
            : await pushNoteToGithub(connections.github, note);
        if (res.ok) {
          const patch: Partial<NotebookNote> =
            target === 'drive'
              ? {
                  driveFileId: res.fileId,
                  driveUrl: res.url,
                  driveSyncedAt: Date.now(),
                }
              : {
                  githubPath: res.path,
                  githubUrl: res.url,
                  githubSyncedAt: Date.now(),
                };
          setNotes((prev) =>
            prev.map((n) => (n.id === note.id ? { ...n, ...patch } : n))
          );
          showToast(
            target === 'drive'
              ? `"${note.title}" → Google Drive`
              : `"${note.title}" → GitHub (${res.path})`,
            4200
          );
        } else {
          showToast(res.message, 5200);
        }
      }
    })();

    const titles = created.map((c) => `"${c.note.title}"`).join(' · ');
    showToast(`Notebook updated: ${titles}`, 3600);
    return created.map((c) => `"${c.note.title}"`);
  };

  const handleBackupToGithub = async () => {
    if (!connections.github.connected || !connections.github.token) {
      showToast('আগে GitHub কানেক্ট করুন (Cloud Connectors)', 4200);
      return;
    }
    const res = await backupWorkspaceToGithub(connections.github, {
      app: 'SMFTA AI Pro',
      version: APP_VERSION,
      createdAt: new Date().toISOString(),
      settings,
      profile,
      memory,
      notes,
      widgets: selfWidgets,
      chats: chats.map((c) => ({
        title: c.title,
        msgs: c.msgs.length,
        lastAt: c.msgs[c.msgs.length - 1]?.ts || 0,
      })),
    });
    if (res.ok) {
      handleUpdateConnections({
        ...connections,
        github: {
          ...connections.github,
          lastSyncAt: Date.now(),
          lastCommitUrl: res.htmlUrl || connections.github.lastCommitUrl,
        },
      });
      showToast(`Backup committed — ${res.path}`, 4500);
    } else {
      showToast(res.message, 5000);
    }
  };

  const handlePushAllNotes = async (target: 'drive' | 'github') => {
    const res = await pushAllNotes(connections, notes, target);
    showToast(res.message, 4200);
  };

  const applySelfUpdatePayload = (
    payload: SelfUpdatePayload
  ): { summary: string; widgetId?: string } => {
    const changes: string[] = [];
    let createdWidgetId: string | undefined;

    // 1. Atomic, validated settings reconciliation (invalid keys are rejected,
    //    never written — so a self-update can't brick the engine).
    setSettings((prev) => {
      const { next, changes: applied, rejected } = reconcileSettings(prev, payload);
      changes.push(...applied);
      if (rejected.length > 0) {
        changes.push(`Skipped invalid: ${rejected.join(', ')}`);
      }
      return sanitizeSettings(next);
    });

    // 2. Memory bank control.
    if (payload.clearMemory) {
      forgetAllMemory();
      changes.push('Memory cleared');
    }
    if (Array.isArray(payload.memory) && payload.memory.length > 0) {
      const incoming = payload.memory
        .map((m) => String(m || '').trim())
        .filter(Boolean)
        .slice(0, 12);
      // Memory bank writer: dedupes, merges same-key facts, caps at 200.
      const added = rememberFacts(incoming, 'ai');
      changes.push(
        added.length > 0
          ? `Remembered ${added.length} fact(s)`
          : 'Memory already up to date'
      );
    }

    // 3. Autonomy + deterministic self-repair.
    if (payload.autonomy === 'full' || payload.autonomy === 'safe') {
      setAutonomy(payload.autonomy);
      changes.push(`Autonomy → ${payload.autonomy.toUpperCase()}`);
    }
    if (payload.selfRepair) {
      setSettings((prev) => {
        const repaired = applyAutoRepairs(prev, {
          memory,
          notes: notes.length,
          widgets: selfWidgets,
          skills,
          driveConnected: Boolean(connections.drive.connected),
          githubConnected: Boolean(connections.github.connected),
          autonomy,
        });
        if (repaired.actions.length > 0) {
          changes.push(...repaired.actions);
          setMemory(factsToText(migrateMemory(repaired.memory).facts, MEMORY_MAX));
        }
        return sanitizeSettings(repaired.settings);
      });
    }

    // 4. Self-built skills (create / toggle / remove).
    if (Array.isArray(payload.skills) && payload.skills.length > 0) {
      const installed = applySelfSkills(payload.skills);
      if (installed.length > 0) changes.push(`Skill → ${installed.join(', ')}`);
    }
    if (payload.removeSkillId) {
      setSkills((prev) => prev.filter((s) => s.id !== payload.removeSkillId));
      changes.push('Skill removed');
    }
    if (payload.toggleSkillId) {
      setSkills((prev) =>
        prev.map((s) =>
          s.id === payload.toggleSkillId ? { ...s, enabled: !s.enabled } : s
        )
      );
      changes.push('Skill toggled');
    }

    // 5. Self-coded live widgets (legacy payload.widget, still supported).
    if (payload.removeWidgetId === 'all') {
      setSelfWidgets([]);
      changes.push('Cleared self-widgets');
    } else if (payload.removeWidgetId) {
      setSelfWidgets((prev) =>
        prev.filter((w) => w.id !== payload.removeWidgetId)
      );
      changes.push('Removed widget');
    }

    if (payload.widget && payload.widget.title && payload.widget.code) {
      const newW: SelfUpdateWidget = {
        id: payload.widget.id || 'w-' + Date.now(),
        title: payload.widget.title,
        description: payload.widget.description || 'Self-coded AI live feature',
        code: payload.widget.code,
        enabled: true,
        createdAt: Date.now(),
      };
      createdWidgetId = newW.id;
      setSelfWidgets((prev) => [
        newW,
        ...prev.filter((x) => x.title !== newW.title).slice(0, 14),
      ]);
      setActiveWidgetModal(newW);
      changes.push(`Installed "${newW.title}"`);
    }

    // 6. Notebook notes + cloud sync.
    if (payload.note && (payload.note.title || payload.note.content)) {
      const noteSummary = applyAINotes([
        {
          title: payload.note.title || 'AI note',
          content: payload.note.content || '',
          tags: payload.note.tags,
          filename: payload.note.filename,
          save: payload.note.save || 'local',
        },
      ]);
      changes.push(noteSummary[0] || 'Notebook note created');
    }
    if (payload.syncNotes === 'drive' || payload.syncNotes === 'github') {
      changes.push(`Notebook sync → ${payload.syncNotes}`);
      void handlePushAllNotes(payload.syncNotes);
    }

    // 7. Self-check report.
    if (payload.selfCheck) {
      const report = runSelfCheck({
        settings,
        memory,
        notes: notes.length,
        widgets: selfWidgets,
        skills,
        driveConnected: Boolean(connections.drive.connected),
        githubConnected: Boolean(connections.github.connected),
        autonomy,
      });
      const bad = report.items.filter((i) => i.level !== 'ok');
      showToast(
        `Self-check ${report.score}%${bad.length ? ` · ${bad.map((b) => b.label).join(', ')}` : ' · all green'}`,
        5200
      );
      changes.push(`Self-check ${report.score}%`);
    }

    const summary =
      payload.summary ||
      (changes.length > 0 ? changes.join(' · ') : 'Self-Update Applied');
    showToast(`Self-updated: ${summary}`, 4200);
    return { summary, widgetId: createdWidgetId };
  };

  // Global keyboard shortcuts (Ctrl+K for Command Palette)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCmdkOpen((v) => !v);
      } else if (e.key === 'Escape') {
        setCmdkOpen(false);
        setLightboxImg(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const scrollToBottom = (force = false) => {
    // v18.11 — honor the user's Auto-Scroll setting (forced calls still win).
    if (!force && settings.autoScroll === false) return;
    if (force) {
      userScrolledUpRef.current = false;
      setShowScrollBottomBtn(false);
    } else if (userScrolledUpRef.current) {
      return;
    }
    requestAnimationFrame(() => {
      if (!force && userScrolledUpRef.current) return;
      if (chatBoxRef.current) {
        chatBoxRef.current.scrollTop = chatBoxRef.current.scrollHeight;
      }
    });
  };

  const incrementUsage = () => {
    const today = new Date().toDateString();
    const next = usageToday + 1;
    setUsageToday(next);
    localStorage.setItem(
      LS_KEYS.usage,
      JSON.stringify({ date: today, count: next })
    );
  };

  // Create or switch to new chat
  const handleNewChat = () => {
    if (
      settings.newChatDefaultMode &&
      settings.newChatDefaultMode !== 'last' &&
      settings.newChatDefaultMode !== settings.mode
    ) {
      const nextMode = settings.newChatDefaultMode;
      setSettings((prev) => sanitizeSettings({ ...prev, mode: nextMode }));
    }
    if (chats.length > 0 && chats[0].msgs.length === 0) {
      setActiveId(chats[0].id);
      setSidebarOpen(false);
      return;
    }
    const newChat: ChatSession = {
      id: Date.now(),
      title: 'New Conversation',
      msgs: [],
    };
    setChats((prev) => [newChat, ...prev]);
    setActiveId(newChat.id);
    setSidebarOpen(false);
  };

  const handleDeleteChat = (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    // The whole conversation (all of its messages) is one cloud row: one
    // DELETE removes every message atomically with the conversation.
    if (cloudClient && userId && cloudReady) {
      deleteCloudSession(cloudClient, userId, id)
        .then(() => setCloudStatus('saved'))
        .catch((delErr) => {
          setCloudStatus('offline');
          console.warn('[cloudSync.deleteSession]', delErr);
        });
    }
    syncedSessionVersions.current.delete(id);
    const remaining = chats.filter((c) => c.id !== id);
    if (remaining.length === 0) {
      const fresh: ChatSession = {
        id: Date.now(),
        title: 'New Conversation',
        msgs: [],
      };
      setChats([fresh]);
      setActiveId(fresh.id);
    } else {
      setChats(remaining);
      if (activeId === id) setActiveId(remaining[0].id);
    }
    showToast('Chat deleted');
  };

  const handleClearActiveChat = () => {
    setChats((prev) =>
      prev.map((c) =>
        c.id === activeChat.id ? { ...c, msgs: [] } : c
      )
    );
    if (cloudClient && userId && cloudReady) {
      upsertCloudSession(cloudClient, userId, {
        ...activeChat,
        msgs: [],
      })
        .then(() => setCloudStatus('saved'))
        .catch((err) => console.warn('[cloudSync.clearMsgs]', err));
    }
    showToast('Chat messages cleared');
  };

  const handleTogglePin = (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    setChats((prev) =>
      prev.map((c) => (c.id === id ? { ...c, pinned: !c.pinned } : c))
    );
  };

  const appendMessageToChat = (chatId: number, msg: ChatMessage) => {
    setChats((prev) =>
      prev.map((c) => {
        if (c.id !== chatId) return c;
        if (c.msgs.some((existing) => existing.id === msg.id)) {
          return c;
        }
        const nextMsgs = [...c.msgs, msg];
        const isDefaultUntouchedTitle =
          c.titleSource !== 'user' &&
          (c.title === 'New Conversation' || c.title === 'New Chat');
        const nextTitle =
          isDefaultUntouchedTitle && msg.role === 'user' && msg.text
            ? msg.text.replace(/⟦FILE:[\s\S]*$/, '').trim().slice(0, 42) ||
              'Conversation'
            : c.title;
        return {
          ...c,
          title: nextTitle,
          titleSource:
            nextTitle !== c.title ? ('auto' as const) : c.titleSource,
          msgs: nextMsgs,
        };
      })
    );
  };

  const updateMessageInChat = (
    chatId: number,
    messageId: string,
    updater: (m: ChatMessage) => ChatMessage
  ) => {
    setChats((prev) =>
      prev.map((c) =>
        c.id !== chatId
          ? c
          : {
              ...c,
              msgs: c.msgs.map((m) =>
                m.id === messageId ? updater(m) : m
              ),
            }
      )
    );
  };

  // Image Generation (Pollinations HD engine) — P1-13: avoid duplicate user message when invoked from handleSend
  const handleRunImageGen = (
    prompt: string,
    style = 'high quality, detailed',
    size = 768,
    skipUserMessage = false
  ) => {
    if (!isToolEnabled('generate_image', settings.enabledTools)) {
      showToast('Image generation tool is disabled in Settings → Tools.');
      return;
    }
    const targetChatId = activeChat.id;
    const nowTs = Date.now();
    const nowIso = new Date(nowTs).toISOString();
    if (!skipUserMessage) {
      const userMsg: ChatMessage = {
        id: createUniqueId('u'),
        role: 'user',
        text: prompt,
        ts: nowTs,
        timing: { createdAt: nowIso },
      };
      appendMessageToChat(targetChatId, userMsg);
    }

    const seed = Math.floor(Math.random() * 100000);
    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(
      `${prompt}, ${style}`.slice(0, 240)
    )}?width=${size}&height=${size}&nologo=true&seed=${seed}`;

    const aiMsg: ChatMessage = {
      id: createUniqueId('ai'),
      role: 'ai',
      text: `**${prompt}**`,
      ts: nowTs,
      status: 'complete',
      timing: {
        createdAt: nowIso,
        startedAt: nowIso,
        completedAt: nowIso,
      },
      imgGen: { url, prompt },
    };
    appendMessageToChat(targetChatId, aiMsg);
    scrollToBottom(true);
  };

  // Bilingual Speech synthesis (Bengali + English mixed segmentation)
  const speakText = (text: string, msgId?: string, onDone?: () => void) => {
    bilingualSpeechPlayer.speak({
      text,
      msgId,
      preferredLang: voiceLangMode,
      rate: settings.voiceSpeed || 1.0,
      onDone,
    });
  };

  // Bilingual Voice Recognition (Mic: bn-BD / en-US / Banglish)
  const toggleMic = () => {
    if (!isSpeechRecognitionSupported()) {
      showToast(
        'Voice input is unavailable in this browser — type or edit your message in the box below.',
        4000
      );
      return;
    }
    if (isListening && recogRef.current) {
      recogRef.current.stop();
      setIsListening(false);
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const r = new SR();
    r.lang = resolveRecognitionLanguage(voiceLangMode, settings.appLanguage);
    r.interimResults = true;
    r.continuous = false;
    let finalTranscript = '';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    r.onresult = (e: any) => {
      let t = '';
      for (const res of e.results) {
        t += res[0].transcript;
      }
      setInputText(t);
      if (e.results[e.results.length - 1].isFinal) {
        finalTranscript = t;
      }
    };
    r.onend = () => {
      setIsListening(false);
      const captured = finalTranscript.trim();
      if ((talkMode || voiceCallOpen) && captured) {
        setVoiceReviewPending(false);
        handleSend(captured);
      } else if (captured) {
        setVoiceReviewPending(true);
        composerRef.current?.focus();
      }
    };
    r.onerror = () => {
      setIsListening(false);
      showToast('Voice capture interrupted — you can edit text or try again.');
    };
    recogRef.current = r;
    try {
      r.start();
      setIsListening(true);
      setVoiceReviewPending(false);
      showToast(
        `Listening (${r.lang === 'bn-BD' ? 'বাংলা / Banglish' : 'English'}) — speak now`
      );
    } catch (err: unknown) {
      console.warn(
        '[App.toggleMic]',
        err instanceof Error ? err.message : 'SpeechRecognition start failed'
      );
      setIsListening(false);
    }
  };

  // Main Send handler
  const handleSend = async (overrideText?: string) => {
    if (isGenerating || inFlightSendRef.current) return;
    const rawTxt = (overrideText ?? inputText).trim();
    const imgs = [...pendingImgs];
    const files = [...pendingFiles];

    if (!rawTxt && imgs.length === 0 && files.length === 0) return;

    // V2 – Special independent daily quota pre-check (blocks cleanly at 100%)
    if (activeIsV2 && activeV2QuotaStatus?.isBlocked) {
      showToast(
        activeV2QuotaStatus.blockedMessage ||
          `Daily limit reached for ${activeV2QuotaStatus.label}.`,
        5200
      );
      notifyUser(
        settings,
        'usageLimit',
        `${activeV2QuotaStatus.label} limit reached`,
        activeV2QuotaStatus.blockedMessage || 'Daily request limit reached.'
      );
      return;
    }
    setVoiceReviewPending(false);

    // v18.11 — real daily cap, enforced before any state change or request.
    const dailyCap = settings.dailyMessageLimit ?? 0;
    if (dailyCap > 0 && usageToday >= dailyCap) {
      showToast(
        'Daily message limit reached — change it in Settings → Usage & Limits.'
      );
      notifyUser(
        settings,
        'usageLimit',
        'Daily limit reached',
        'Your configured daily message cap has been reached.'
      );
      return;
    }

    inFlightSendRef.current = true;
    try {
      let mergedTxt = rawTxt;
      if (files.length > 0) {
        // Keep total inline message text under 54,000 chars so it never trips the
        // 60,000-char requestGuard limit even when multiple large files are attached.
        const maxInlineTotal = Math.max(8_000, 52_000 - rawTxt.length);
        const perFileBudget = Math.max(
          3_000,
          Math.floor(maxInlineTotal / files.length)
        );
        files.forEach((f) => {
          let fileBody = f.doc
            ? buildQueryAwareDocumentPayload(f.doc, rawTxt, perFileBudget)
            : f.content || '';
          if (fileBody.length > perFileBudget) {
            const headLen = Math.floor(perFileBudget * 0.65);
            const tailLen = Math.max(500, perFileBudget - headLen - 220);
            const omitted = Math.max(0, fileBody.length - (headLen + tailLen));
            fileBody = `${fileBody.slice(0, headLen)}\n\n[COVERAGE NOTICE: Multi-file budget windowed — ${omitted.toLocaleString()} middle chars omitted (${(
              headLen + tailLen
            ).toLocaleString()} of ${fileBody.length.toLocaleString()} chars included)]\n\n${fileBody.slice(
              -tailLen
            )}`;
          }
          mergedTxt += `\n\n⟦FILE:${f.name}⟧\n${fileBody}\n⟦/FILE⟧`;
        });
      }

    setInputText('');
    setPendingImgs([]);
    setPendingFiles([]);
    if (rawTxt) {
      sentHistoryRef.current.push(rawTxt);
      histIdxRef.current = -1;
    }
    incrementUsage();

    const targetChatId = activeChat.id;
    const sendTs = Date.now();
    const sendIso = new Date(sendTs).toISOString();
    const userMsg: ChatMessage = {
      id: createUniqueId('u'),
      role: 'user',
      text: mergedTxt,
      ts: sendTs,
      timing: { createdAt: sendIso },
      imgs: imgs.length > 0 ? imgs : undefined,
    };
    appendMessageToChat(targetChatId, userMsg);
    scrollToBottom(true);

    // 0. DETERMINISTIC SELF-CONTROL: understand plain-language self orders
    //    ("থিম ডার্ক করো", "মডেল groq করে দাও", "ড্রাইভ কানেক্ট করো", "নিজেকে
    //    রিপেয়ার করো") and apply them immediately — no model round-trip needed.
    const selfActions = interpretSelfCommand(rawTxt);
    if (selfActions.length > 0) {
      const applied = applySelfActions(selfActions);
      if (isPureSelfCommand(rawTxt, selfActions) && applied.length > 0) {
        appendMessageToChat(targetChatId, {
          id: createUniqueId('ai'),
          role: 'ai',
          text: `**নিজেকে আপডেট করেছি**\n\n${applied
            .map((a) => `• ${a}`)
            .join('\n')}\n\n_Instant self-update · 0 ms — কোনো মডেলের উপর নির্ভর করেনি._`,
          ts: Date.now(),
          status: 'complete',
          selfUpdateSummary: applied.join(' · '),
        });
        setInputText('');
        scrollToBottom(true);
        return;
      }
      if (applied.length > 0) {
        showToast(applied.join(' · '), 3800);
      }
    }

    // 1. Check Memory commands ("মনে রাখো ..." / "remember ...")
    const memMatch = rawTxt.match(
      /^(?:মনে রাখো|মনে রেখো|মনে রাখবে|remember(?: that)?|keep in mind)[,:\s]+(.{3,400})$/i
    );
    if (memMatch) {
      const fact = memMatch[1].trim();
      // A directly stated fact is pinned: never evicted, always sent to the model.
      rememberFacts([fact, ...extractMemoryCandidates(fact)], 'user');
      appendMessageToChat(targetChatId, {
        id: createUniqueId('ai'),
        role: 'ai',
        text: `**মনে রেখেছি।** এখন থেকে প্রতিটি উত্তরে এটি মনে রাখব:\n> ${fact}\n\n_মেমোরি ব্যাংকে সংরক্ষিত — এই ব্রাউজারে সংরক্ষিত থাকবে (অন্য ডিভাইসে সিঙ্ক করতে Cloud Vault বা Backup ব্যবহার করুন)।_`,
        ts: Date.now(),
        status: 'complete',
      });
      return;
    }

    if (
      /^(?:সব ভুলে যাও|মেমরি মুছো|মেমরি ক্লিয়ার|clear memory|forget everything)$/i.test(
        rawTxt
      )
    ) {
      forgetAllMemory();
      appendMessageToChat(targetChatId, {
        id: createUniqueId('ai'),
        role: 'ai',
        text: '**মেমরি মুছে ফেলেছি** — এখন নতুন করে শুরু।',
        ts: Date.now(),
        status: 'complete',
      });
      return;
    }

    if (
      /^(?:তুমি কী কী মনে রেখেছো|কী কী মনে আছে|মেমরি দেখাও|what do you remember)\??$/i.test(
        rawTxt
      )
    ) {
      const memText =
        memory.length > 0
          ? `**মেমরিতে সংরক্ষিত তথ্য**\n${memory
              .map((x, i) => `${i + 1}. ${x}`)
              .join('\n')}`
          : 'মেমরি এখনো খালি — `মনে রাখো ...` লিখে আমাকে কোনো তথ্য মনে রাখতে বলুন।';
      appendMessageToChat(targetChatId, {
        id: createUniqueId('ai'),
        role: 'ai',
        text: memText,
        ts: Date.now(),
        status: 'complete',
      });
      return;
    }

    // 2. Check Image Generation command ("/img ..." or "ছবি বানাও ...")
    const imgCmdMatch =
      rawTxt.match(/^\/img[:\s]+(.+)$/i) ||
      rawTxt.match(
        /^(?:ছবি বানাও|ছবি আঁকো|ইমেজ বানাও|draw|generate (?:an? )?image(?: of)?)[,:\s]+(.{3,200})$/i
      );
    if (imgCmdMatch) {
      handleRunImageGen(imgCmdMatch[1].trim(), 'high quality, detailed', 768, true);
      return;
    }

    // 2b. Check Direct Self-Update Command ("নিজেকে আপডেট করো", "থিম ডার্ক/লাইট করো", "কালার সবুজ করো", "ক্যালকুলেটর উইজেট যুক্ত করো", etc.)
    const selfUpdCheck = detectInstantSelfUpdate(rawTxt);
    if (selfUpdCheck.payload && selfUpdCheck.instantReply) {
      const res = applySelfUpdatePayload(selfUpdCheck.payload);
      appendMessageToChat(targetChatId, {
        id: createUniqueId('ai'),
        role: 'ai',
        text: selfUpdCheck.instantReply,
        ts: Date.now(),
        status: 'complete',
        latencySec: '0.0s',
        selfUpdateSummary: res.summary,
        selfUpdateWidgetId: res.widgetId,
      });
      return;
    } else if (selfUpdCheck.payload) {
      applySelfUpdatePayload(selfUpdCheck.payload);
    }

    const isCustomProviderOrKey = Boolean(
      (settings.provider &&
        settings.provider !== 'xrahat' &&
        settings.provider !== 'smfta_cloud') ||
        (activeProfile?.provider &&
          activeProfile.provider !== 'xrahat' &&
          activeProfile.provider !== 'smfta_cloud') ||
        settings.externalKeys?.trim() ||
        activeProfile?.externalKeys?.trim() ||
        settings.externalBaseUrl?.trim() ||
        activeProfile?.externalBaseUrl?.trim()
    );

    const deliverLocalReplyWithThinking = async (
      replyText: string,
      extraFields?: Partial<ChatMessage>
    ) => {
      setGenPhase((cur) => nextGenPhase(cur, { type: 'first-token' }));
      setGenStepDetail(null);
      appendMessageToChat(targetChatId, {
        id: 'ai-' + Date.now(),
        role: 'ai',
        text: replyText,
        thinking: undefined,
        ts: Date.now(),
        ...extraFields,
      });
      scrollToBottom(false);
    };

    // 3. Check Instant Local Math (ONLY in Default Profile so Custom API Keys are always invoked)
    const mathVal =
      !isCustomProviderOrKey && isToolEnabled('calculate', settings.enabledTools)
        ? tryLocalMath(rawTxt.replace(/^\/math[:=\s]*/i, ''))
        : null;
    if (imgs.length === 0 && files.length === 0 && mathVal !== null) {
      const expr = rawTxt.replace(/[=?]+/g, '').trim();
      await deliverLocalReplyWithThinking(
        `**${expr}** = \`${mathVal}\`\n\n*Instant local math solver*`
      );
      return;
    }

    const isRecallQuery =
      /(আগে কী|আগে কি|কী কথা|কি কথা|কী চ্যাট|কি চ্যাট|মনে আছে|মনে রাখতে|কী বলেছিলাম|কি বলেছিলাম|কী বলেছি|কি বলেছি|আগের চ্যাট|পূর্বের চ্যাট|কোন মডেল|কাস্টম মডেল|what did we|what did i say|do you remember|previous chat|earlier chat|talked about|which model|what model)/i.test(
        rawTxt
      );

    // 3c. Check High-Speed Client System Memory LRU Cache (ONLY when no custom API key/service is active)
    const clientCacheModeKey = `${settings.provider || 'xrahat'}:${settings.externalModel || ''}:${settings.mode}`;
    if (
      settings.memoryCache !== false &&
      imgs.length === 0 &&
      files.length === 0 &&
      !webSearch &&
      !isCustomProviderOrKey &&
      !isRecallQuery &&
      !selfUpdCheck.isSelfUpdateIntent &&
      activeChat.msgs.length === 0
    ) {
      const cachedHit = getClientCachedReply(rawTxt, clientCacheModeKey);
      if (cachedHit) {
        await deliverLocalReplyWithThinking(cachedHit);
        return;
      }
    }

    // 4. Auto-extract implicit user memory only for concise personal messages (never block/pollute on large notes)
    let currentMemory = [...memory];
    if (settings.autoMemory !== false && rawTxt.length <= 450) {
      const implicit = extractImplicitUserMemory(rawTxt);
      if (implicit.detectedName) {
        setProfile((prev) => ({ ...prev, name: implicit.detectedName as string }));
      }
      const candidates = Array.from(
        new Set([...implicit.facts, ...extractMemoryCandidates(rawTxt)])
      );
      if (candidates.length > 0) {
        const res = addFacts(migrateMemory(currentMemory).facts, candidates, {
          source: 'user',
        });
        if (res.added.length > 0) {
          currentMemory = factsToText(res.facts, MEMORY_MAX);
          memoryRef.current = currentMemory;
          setMemory(currentMemory);
        }
      }
    }

    // Clear any stale task progress panel so large notes process cleanly without step bars
    if (activeTaskPlan) {
      setActiveTaskPlan(null);
    }

      // Persist implicit extracted facts to Cloud Firestore for cross-device sync when signed in
      if (
        firebaseUser &&
        firebaseUser.emailVerified &&
        settings.autoMemory !== false &&
        rawTxt.length <= 450 &&
        currentMemory.length > 0
      ) {
        const latestFact = currentMemory[currentMemory.length - 1];
        if (latestFact) {
          void saveMemoryFactToFirestore(
            firebaseUser,
            latestFact,
            'conversation',
            activeModelName || 'smfta-v5'
          ).catch(() => {});
        }
      }

      // 5. Stream from Server-Side Neural Engine (0ms delay, no blocking pre-fetches)
      await streamAIResponse(
        targetChatId,
        [...activeChat.msgs, userMsg],
        currentMemory
      );
    } finally {
      inFlightSendRef.current = false;
    }
  };

  const streamAIResponse = async (
    chatId: number,
    historyMsgs: ChatMessage[],
    latestMemory?: string[],
    overrideProvider?: AppSettings['provider'],
    appendToMsg?: { id: string; prefixText: string }
  ) => {
    setIsGenerating(true);
    setIsWaitingFirstToken(!appendToMsg);
    setGenPhase(nextGenPhase(null, { type: 'start' }));
    setGenStepDetail(null);
    const abortCtrl = new AbortController();
    abortRef.current = abortCtrl;
    // Honest generic progress: without a server status event, a long
    // "Connecting" would look stuck — advance to Processing on a real timer.
    const phaseFallback = window.setTimeout(() => {
      setGenPhase((cur) =>
        cur === 'connecting'
          ? nextGenPhase(cur, { type: 'response' })
          : cur
      );
    }, CONNECTING_FALLBACK_MS);
    // v18.11 — hard request timeout from Settings → Automation & Fallback.
    const timeoutMs =
      Math.min(240, Math.max(30, settings.requestTimeoutSec ?? 120)) * 1000;
    const timeoutId = window.setTimeout(() => abortCtrl.abort(), timeoutMs);
    // Bounded retries only — the cap comes from user settings, never infinity.
    const maxRetries = Math.min(4, Math.max(0, settings.maxRetries ?? 2));

    const reqStart = Date.now();
    const reqStartIso = new Date(reqStart).toISOString();
    const reqStartPerf =
      typeof performance !== 'undefined' ? performance.now() : reqStart;
    let firstTokenPerf: number | null = null;
    let firstTokenIso: string | undefined;

    const turnId = createUniqueId('turn');
    const aiMsgId = appendToMsg ? appendToMsg.id : createUniqueId('ai');

    // P1-20: Snapshot active profile configuration at request start
    const profileSnapshot = resolveActiveProfile(settings, savedProfiles);
    const activeProvider =
      overrideProvider ||
      profileSnapshot.provider ||
      settings.provider ||
      'smfta_cloud';
    const isDefaultUnlimitedProfile =
      activeProvider === 'xrahat' || activeProvider === 'smfta_cloud';
    const rawEffectiveKeys = isDefaultUnlimitedProfile
      ? ''
      : profileSnapshot.externalKeys?.trim() ||
        settings.externalKeys?.trim() ||
        '';
    const effectiveExternalKeys = isEncrypted(rawEffectiveKeys)
      ? await decryptSecret(rawEffectiveKeys).catch(() => '')
      : rawEffectiveKeys;
    const effectiveExternalBaseUrl = isDefaultUnlimitedProfile
      ? ''
      : profileSnapshot.externalBaseUrl?.trim() ||
        settings.externalBaseUrl?.trim() ||
        '';
    const effectiveExternalModel =
      activeProvider === 'smfta_cloud' && overrideProvider === 'smfta_cloud'
        ? ''
        : profileSnapshot.externalModel?.trim() ||
          settings.externalModel?.trim() ||
          '';

    const isV2Request =
      !overrideProvider && isV2ModelId(effectiveExternalModel);
    let accumulated = appendToMsg
      ? appendToMsg.prefixText + (appendToMsg.prefixText.endsWith('\n') ? '' : '\n')
      : '';
    let attachedSources: Array<{ title: string; uri: string }> = [];
    let responderMeta: {
      requestId?: string;
      providerUsed?: string;
      modelUsed?: string;
      fallbackNotice?: string;
      attemptCount?: number;
      ttftMs?: number;
      latencyMs?: number;
    } = {};

    let bubbleCreated = Boolean(appendToMsg);

    try {
      // v18.11 + v19.0 — history is user-controlled: off sends only the current
      // prompt; on, the count follows maxHistoryMessages (1..40, default 24).
      // Always filter out empty or failed placeholder messages so stale blank turns
      // never trigger 422 `messages[1] must contain text or at least one image`.
      const cleanHistoryMsgs = historyMsgs.filter(
        (m) =>
          !m.isError &&
          m.status !== 'failed' &&
          (String(m.text || '').trim().length > 0 ||
            (Array.isArray(m.imgs) && m.imgs.length > 0))
      );
      const historyLimit =
        settings.includeHistory === false
          ? 1
          : Math.min(40, Math.max(1, settings.maxHistoryMessages ?? 24));
      const contextSlice = cleanHistoryMsgs
        .slice(-historyLimit)
        .map((m) => ({
          role: m.role,
          text: String(m.text || '').trim(),
          imgs: m.imgs?.map((im) => ({ mime: im.mime, data: im.data })),
        }))
        .filter(
          (m) => m.text.length > 0 || (Array.isArray(m.imgs) && m.imgs.length > 0)
        );

      const lastUserPrompt =
        contextSlice[contextSlice.length - 1]?.text?.trim() || '';
      const hasAttachedImgs = Boolean(
        contextSlice[contextSlice.length - 1]?.imgs?.length
      );

      const targetSession = chats.find((c) => c.id === chatId) || activeChat;
      const contextRelevantMemory = isV2Request
        ? selectRelevantFirestoreMemories(
            lastUserPrompt,
            latestMemory || memory,
            8
          )
        : retrieveRelevantMemories(lastUserPrompt, latestMemory || memory, 12);

      // Build 7-Layer Smart Conversation Context (Parts 7–10)
      const smartCtx =
        settings.includeHistory === false
          ? null
          : buildSmartConversationContext({
              messages: cleanHistoryMsgs,
              currentPrompt: lastUserPrompt,
              existingSummary: targetSession?.conversationSummary,
              memoryFacts: contextRelevantMemory,
              connections,
              serviceContext: targetSession?.serviceContext,
              activeTaskPlan,
              activeProjectName: project?.name,
              activeProjectFilesCount: project?.files.length,
            });

      const resolvedServiceContext: ChatServiceSelectionContext | undefined =
        smartCtx?.resolvedFollowUp.activeService &&
        smartCtx.resolvedFollowUp.activeService !==
          targetSession?.serviceContext?.activeService
          ? {
              ...(targetSession?.serviceContext || {}),
              activeService: smartCtx.resolvedFollowUp.activeService,
              github: smartCtx.resolvedFollowUp.activeRepo
                ? {
                    owner:
                      smartCtx.resolvedFollowUp.activeRepo.split('/')[0] ||
                      connections.github.owner,
                    repo:
                      smartCtx.resolvedFollowUp.activeRepo.split('/')[1] ||
                      connections.github.repo,
                    branch:
                      smartCtx.resolvedFollowUp.activeBranch ||
                      connections.github.branch ||
                      'main',
                    selectedFiles:
                      smartCtx.resolvedFollowUp.activeFiles.length > 0
                        ? smartCtx.resolvedFollowUp.activeFiles
                        : targetSession?.serviceContext?.github?.selectedFiles,
                  }
                : targetSession?.serviceContext?.github,
              updatedAt: Date.now(),
            }
          : targetSession?.serviceContext;

      if (smartCtx) {
        // Persist updated rolling summary, important decisions, pending operations & resolved serviceContext onto the chat session
        setChats((prev) =>
          prev.map((c) =>
            c.id === chatId
              ? {
                  ...c,
                  conversationSummary:
                    smartCtx.updatedSummary || c.conversationSummary,
                  importantDecisions: smartCtx.importantDecisions,
                  pendingOperations: smartCtx.pendingOperations,
                  serviceContext: resolvedServiceContext || c.serviceContext,
                }
              : c
          )
        );

        const explicitActiveService =
          resolvedServiceContext?.activeService ||
          smartCtx.resolvedFollowUp.activeService;
        if (
          explicitActiveService &&
          !isDefaultUnlimitedProfile &&
          activeProvider !== 'custom'
        ) {
          const liveSteps = deriveLiveOperationProgressSteps({
            prompt: lastUserPrompt,
            activeService: explicitActiveService,
            hasHistory: historyMsgs.length > 1,
          });
          if (liveSteps.length > 0) {
            setGenStepDetail(liveSteps[0]);
          }
        }
      }

      const isCrossSessionRecall =
        /(আগে কী|আগে কি|কী কথা|কি কথা|কী চ্যাট|কি চ্যাট|মনে আছে|মনে রাখতে|কী বলেছিলাম|কি বলেছিলাম|কী বলেছি|কি বলেছি|আগের চ্যাট|পূর্বের চ্যাট|what did we|what did i say|do you remember|previous chat|earlier chat|talked about)/i.test(
          lastUserPrompt
        );

      const previousSessionsLines: string[] = [];
      if (isCrossSessionRecall) {
        for (const c of chats.slice(0, 6)) {
          if (c.id === chatId || c.msgs.length === 0) continue;
          const snippet = c.msgs
            .slice(-4)
            .map(
              (m) =>
                `${m.role === 'user' ? 'User' : 'AI'}: ${(m.text || '').slice(0, 180)}`
            )
            .join(' | ');
          if (snippet) {
            previousSessionsLines.push(`- Session "${c.title}": ${snippet}`);
          }
        }
      }
      const chatHistorySummary = [
        smartCtx?.updatedSummary || '',
        previousSessionsLines.join('\n'),
      ]
        .filter(Boolean)
        .join('\n\n');

      const matchedSkills = matchSkills(lastUserPrompt, skills);
      const activeSkillPrompt = buildSkillInstruction(matchedSkills);
      type StreamMsg = {
        role: string;
        text: string;
        imgs?: Array<{ mime: string; data: string }>;
      };
      const MAX_SAFE_MSG_CHARS = 56_000;
      const overflowChunks: string[] = [];
      const clampMsgText = (txt: string, label: string): string => {
        if (!txt || txt.length <= MAX_SAFE_MSG_CHARS) return txt;
        const head = txt.slice(0, 38_000);
        const tail = txt.slice(-16_000);
        const middleOverflow = txt.slice(38_000, txt.length - 16_000);
        if (middleOverflow.trim()) {
          overflowChunks.push(`[ATTACHMENT OVERFLOW FROM ${label}]\n${middleOverflow.slice(0, 60_000)}`);
        }
        return `${head}\n\n[... ${middleOverflow.length} middle characters routed to extended projectContext ...]\n\n${tail}`;
      };

      const rawTargetMsgs: StreamMsg[] = activeSkillPrompt
        ? [
            ...contextSlice,
            {
              role: 'user',
              text:
                contextSlice[contextSlice.length - 1]?.text +
                `\n\n[SELF-BUILT SKILL DIRECTIVE]\n${activeSkillPrompt}`,
            },
          ]
        : contextSlice;

      const safeTargetMsgs: StreamMsg[] = rawTargetMsgs.map((m, idx) => ({
        ...m,
        text: clampMsgText(m.text, `message[${idx}]`),
      }));

      const liveIntegrationContext = await buildLiveIntegrationContextForPrompt(
        lastUserPrompt,
        connections,
        resolvedServiceContext
      ).catch(() => '');

      const combinedProjectContext = [
        smartCtx?.envelopeBlock || '',
        projectPromptBlock(project, 80, 18000, lastUserPrompt),
        liveIntegrationContext,
        ...overflowChunks,
      ]
        .filter(Boolean)
        .join('\n\n')
        .slice(0, 110_000);

      const buildRequestBody = (msgs: StreamMsg[]) =>
        JSON.stringify({
        messages: msgs,
        mode: settings.mode,
        style: settings.style,
        replyLang: settings.replyLang || 'auto',
        workPersona: settings.workPersona || 'allrounder',
        creativity: settings.creativity,
        customInst: settings.customInst,
        // v18.11 personalization signals for the server-side system prompt.
        responseTone: settings.responseTone || 'friendly',
        codingPrefs: settings.codingPrefs || '',
        memory: contextRelevantMemory,
        autoMemory: settings.autoMemory !== false,
        includeHistory: settings.includeHistory !== false,
        activeWidgets: selfWidgets.map((w) => w.title),
        webSearch: Boolean(
          webSearch && isToolEnabled('web_search', settings.enabledTools)
        ),
        enabledTools: settings.enabledTools || {},
        provider: activeProvider,
        externalKeys: effectiveExternalKeys,
        externalModel: effectiveExternalModel,
        externalBaseUrl: effectiveExternalBaseUrl,
        discoveredModels: profileSnapshot.availableModels || [],
        supportsStreaming: profileSnapshot.supportsStreaming !== false,
        allowKeylessFallback: Boolean(settings.allowKeylessFallback),
        maxOutputTokens: profileSnapshot.maxOutputTokens ?? settings.maxOutputTokens,
        contextWindow: profileSnapshot.contextWindow,
        weightTemp: settings.weightTemp ?? 0.7,
        topP: settings.topP ?? 0.9,
        trainingData: settings.trainingData || '',
        fastDecision: settings.fastDecision !== false,
        memoryCache: isDefaultUnlimitedProfile && settings.memoryCache !== false,
        userName: profile.name || MASTER_PROFILE_NAME,
        chatHistorySummary,
        activeSkills: matchedSkills
          .filter((sk) => sk.type === 'prompt' && sk.prompt)
          .map((sk) => ({ name: sk.name, description: sk.description, prompt: sk.prompt })),
        installedSkills: skills.map((sk) => sk.name).slice(0, 20),
        autonomy,
        projectContext: combinedProjectContext,
        notebook: notes.slice(0, 6).map((n) => ({
          title: n.title || 'Untitled',
          content: (n.content || '').slice(0, 1200),
        })),
        firebaseUid: firebaseUser?.uid || '',
        firebaseUserEmail: firebaseUser?.email || '',
        firebaseEmailVerified: Boolean(firebaseUser?.emailVerified),
        v2TestingBypass: isV2AuthorizedTester
          ? true
          : Boolean(v2TestingBypass && isV2AuthorizedTester),
        v2QuotaConfig,
        selfState: {
          displayName: activeDisplayName,
          provider: activeProvider,
          model: effectiveExternalModel || activeModelName,
          mode: settings.mode,
          style: settings.style,
          theme: settings.theme,
          accent: settings.accent,
          replyLang: settings.replyLang || 'auto',
          persona: settings.workPersona || 'allrounder',
          temp: settings.weightTemp,
          topP: settings.topP,
          memoryFacts: (latestMemory || memory).length,
          widgets: selfWidgets.map((w) => w.title).slice(0, 12),
          notes: notes.slice(0, 10).map((n) => n.title || 'Untitled'),
          noteCount: notes.length,
          driveConnected: Boolean(connections.drive.connected),
          githubConnected: Boolean(connections.github.connected),
          vercelConnected: Boolean(connections.vercel?.connected),
          supabaseConnected: Boolean(connections.supabase?.connected),
          driveAutoSync: Boolean(connections.drive.autoSync),
          githubAutoSync: Boolean(connections.github.autoSync),
          skills: skills.filter((sk) => sk.enabled).map((sk) => sk.name).slice(0, 12),
          autonomy,
        },
      });

      const requestBody = buildRequestBody(safeTargetMsgs);

      // P1-06: Do NOT send duplicate X-Custom-API-Key header
      const streamReqHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Custom-Provider': activeProvider,
      };

      let response: Response | null = null;
      let lastFetchErr: unknown = null;
      const inStandaloneApk = isStandaloneApkEnv();

      if (!inStandaloneApk) {
        const fetchRetries = isV2Request ? 0 : maxRetries;
        for (let attempt = 0; attempt <= fetchRetries; attempt++) {
          if (abortCtrl.signal.aborted) break;
          try {
            const res = await fetch('/api/chat/stream', {
              method: 'POST',
              headers: streamReqHeaders,
              body: requestBody,
              signal: abortCtrl.signal,
            });
            if (
              !isV2Request &&
              (res.status === 502 || res.status === 503 || res.status === 504) &&
              attempt < fetchRetries
            ) {
              await new Promise((r) => setTimeout(r, 120));
              continue;
            }
            if (res.status === 404) {
              response = null;
              break;
            }
            response = res;
            break;
          } catch (fetchErr: unknown) {
            lastFetchErr = fetchErr;
            if (fetchErr instanceof Error && fetchErr.name === 'AbortError') {
              throw fetchErr;
            }
            if (attempt < fetchRetries && !abortCtrl.signal.aborted) {
              await new Promise((r) => setTimeout(r, 120));
              continue;
            }
          }
        }
      }

      bubbleCreated = Boolean(appendToMsg);
      if (appendToMsg) {
        setStreamingMsgId(aiMsgId);
      }
      let frameTimer: number | null = null;
      const useGpuRaf =
        settings.gpuAccel !== false &&
        typeof window.requestAnimationFrame === 'function';

      let revealTarget = '';
      let revealShown = 0;
      let revealRaf: number | null = null;
      let revealLast = 0;
      let revealFinishing = false;
      let revealDoneCb: (() => void) | null = null;
      let liveThinking = '';

      const scheduleReveal = (): number => {
        if (typeof window.requestAnimationFrame === 'function') {
          return window.requestAnimationFrame((t) => revealPump(t));
        }
        return window.setTimeout(() => revealPump(Date.now()), 16);
      };

      const cancelReveal = () => {
        if (revealRaf === null) return;
        if (typeof window.cancelAnimationFrame === 'function') {
          window.cancelAnimationFrame(revealRaf);
        }
        window.clearTimeout(revealRaf);
        revealRaf = null;
      };

      const paintReveal = () => {
        const visible = safeSlice(revealTarget, revealShown);
        if (!bubbleCreated) {
          if (!visible.trim() && !liveThinking.trim()) {
            return;
          }
          bubbleCreated = true;
          setIsWaitingFirstToken(false);
          setStreamingMsgId(aiMsgId);
          // P1-12: Preserve request start timestamp (reqStart), never reveal animation paint timestamp
          appendMessageToChat(chatId, {
            id: aiMsgId,
            role: 'ai',
            text: visible || ' ',
            thinking: liveThinking || undefined,
            v2ModelId: isV2Request ? effectiveExternalModel : undefined,
            ts: reqStart,
            turnId,
            status: 'streaming',
            requestedProvider: activeProvider,
            requestedModel: effectiveExternalModel || activeModelName,
            timing: {
              createdAt: reqStartIso,
              startedAt: reqStartIso,
              firstTokenAt: firstTokenIso,
            },
          });
        } else {
          updateMessageInChat(chatId, aiMsgId, (m) => ({
            ...m,
            text: visible || m.text || ' ',
            thinking: liveThinking || m.thinking,
          }));
        }
        scrollToBottom(false);
      };

      function revealPump(now: number) {
        revealRaf = null;
        const dt = revealLast ? now - revealLast : 16;
        revealLast = now;
        const backlog = revealTarget.length - revealShown;
        if (backlog > 0) {
          revealShown += revealChars(backlog, dt, revealFinishing);
          paintReveal();
        }
        if (revealShown < revealTarget.length) {
          revealRaf = scheduleReveal();
        } else if (revealDoneCb) {
          const cb = revealDoneCb;
          revealDoneCb = null;
          cb();
        }
      }

      const kickReveal = () => {
        if (revealRaf !== null) return;
        revealLast = 0;
        revealRaf = scheduleReveal();
      };

      const drainReveal = (timeoutMs = 1500) =>
        new Promise<void>((resolve) => {
          if (revealShown >= revealTarget.length) return resolve();
          revealFinishing = true;
          revealDoneCb = resolve;
          kickReveal();
          window.setTimeout(() => {
            if (revealDoneCb === resolve) revealDoneCb = null;
            resolve();
          }, timeoutMs);
        });

      const flushStreamText = (flushNow = false) => {
        frameTimer = null;
        const liveAnswer = accumulated.includes('⟦FILE:')
          ? parseFileEdits(accumulated).cleanText
          : accumulated;
        const parsedTags = parseAIControlTags(liveAnswer || accumulated);
        if (parsedTags.thinking) {
          liveThinking = parsedTags.thinking;
        }
        const displayTxt = parsedTags.cleanText;
        if (displayTxt !== revealTarget) {
          revealTarget = displayTxt;
          if (revealShown > revealTarget.length) revealShown = revealTarget.length;
        }
        // v18.11 — Streaming Reveal off: render every chunk instantly, or paint immediately while thinking is streaming
        if (
          flushNow ||
          settings.streamingReveal === false ||
          (Boolean(liveThinking) && !displayTxt)
        ) {
          revealShown = revealTarget.length;
          paintReveal();
          return;
        }
        kickReveal();
      };

      const scheduleFlush = () => {
        if (frameTimer !== null) return;
        if (useGpuRaf) {
          frameTimer = window.requestAnimationFrame(() => flushStreamText(false));
        } else {
          flushStreamText(false);
        }
      };

      const pipeSSE = async (res: Response): Promise<{ stalled: boolean }> => {
        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let stalled = false;
        const watchdog = createIdleWatchdog(() => {
          stalled = true;
          void reader.cancel().catch(() => undefined);
        }, DEFAULT_IDLE_TIMEOUT_MS);

        try {
          watchdog.arm();
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            watchdog.arm();
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split(/\r?\n/);
            buffer = lines.pop() || '';

            for (const rawLine of lines) {
              const line = rawLine.trim();
              if (!line.startsWith('data:')) continue;
              const payload = line.slice(5).trim();
              if (!payload || payload === '[DONE]') continue;

              let parsed: {
                type?:
                  | 'meta'
                  | 'delta'
                  | 'done'
                  | 'error'
                  | 'reset'
                  | 'sources'
                  | 'progress'
                  | 'v2_quota';
                ok?: boolean;
                code?: string;
                step?: string;
                label?: string;
                status?: unknown;
                snapshot?: { models?: Record<V2ModelId, V2ModelQuotaStatus>; config?: V2QuotaConfig };
                detail?: string;
                message?: string;
                error?: string;
                requestId?: string;
                providerUsed?: string;
                modelUsed?: string;
                fallbackUsed?: boolean;
                fallbackNotice?: string;
                attemptCount?: number;
                ttftMs?: number;
                latencyMs?: number;
                sources?: Array<{ title: string; uri?: string; url?: string }>;
                text?: string;
                delta?: string;
                thinking?: string;
                reset?: string | boolean;
                providerReasoning?: boolean;
              } | null = null;
              try {
                parsed = JSON.parse(payload);
              } catch {
                continue;
              }
              if (!parsed) continue;

              // P1-07: Handle structured SSE terminal error event
              if (parsed.type === 'error' || parsed.ok === false || parsed.error) {
                const errObj = new Error(
                  parsed.message || parsed.error || parsed.text || 'Provider error'
                ) as Error & { code?: string; requestId?: string };
                errObj.code = parsed.code;
                errObj.requestId = parsed.requestId;
                throw errObj;
              }

              if (parsed.type === 'v2_quota') {
                if (parsed.snapshot?.models) {
                  setV2ServerQuotaMap(parsed.snapshot.models);
                }
                if (parsed.snapshot?.config) {
                  setV2QuotaConfig(parsed.snapshot.config);
                }
                const qStatus = parsed.status as V2ModelQuotaStatus | undefined;
                if (qStatus?.warningMessage) {
                  showToast(qStatus.warningMessage, 5000);
                }
                continue;
              }

              if (parsed.type === 'progress') {
                // Bypass simulated progress/thinking steps for keyless & custom APIs
                continue;
              }

              if (typeof parsed.thinking === 'string' && parsed.thinking) {
                liveThinking += parsed.thinking;
                if (!bubbleCreated) {
                  flushStreamText();
                } else {
                  scheduleFlush();
                }
              }

              if (parsed.type === 'meta' && parsed.requestId) {
                responderMeta.requestId = parsed.requestId;
              }

              if (parsed.type === 'done' && parsed.ok === true) {
                responderMeta = {
                  ...responderMeta,
                  requestId: parsed.requestId || responderMeta.requestId,
                  providerUsed: parsed.providerUsed,
                  modelUsed: parsed.modelUsed,
                  fallbackNotice: parsed.fallbackNotice,
                  attemptCount: parsed.attemptCount,
                  ttftMs: parsed.ttftMs,
                  latencyMs: parsed.latencyMs,
                };
                if (Array.isArray(parsed.sources) && parsed.sources.length > 0) {
                  attachedSources = parsed.sources.map((s) => ({
                    title: s.title,
                    uri: s.uri || s.url || '',
                  }));
                }
                continue;
              }

              if (parsed.sources && Array.isArray(parsed.sources)) {
                attachedSources = parsed.sources.map((s) => ({
                  title: s.title,
                  uri: s.uri || s.url || '',
                }));
              }
              if (parsed.reset === true) {
                accumulated = appendToMsg
                  ? appendToMsg.prefixText +
                    (appendToMsg.prefixText.endsWith('\n') ? '' : '\n')
                  : '';
                revealTarget = '';
                revealShown = 0;
                scheduleFlush();
              } else if (typeof parsed.reset === 'string' && parsed.reset) {
                accumulated = parsed.reset;
                scheduleFlush();
              }
              const deltaTxt =
                typeof parsed.text === 'string'
                  ? parsed.text
                  : typeof parsed.delta === 'string'
                  ? parsed.delta
                  : '';
              if (deltaTxt) {
                if (firstTokenPerf === null) {
                  firstTokenPerf =
                    typeof performance !== 'undefined'
                      ? performance.now()
                      : Date.now();
                  firstTokenIso = new Date().toISOString();
                  setGenPhase((cur) =>
                    nextGenPhase(cur, { type: 'first-token' })
                  );
                }
                accumulated += deltaTxt;
                if (!bubbleCreated) {
                  flushStreamText();
                } else {
                  scheduleFlush();
                }
              }
            }
          }
        } catch (readErr: unknown) {
          if (readErr instanceof Error && readErr.name === 'AbortError') {
            throw readErr;
          }
          if (!accumulated.trim() || (readErr as { code?: string })?.code) {
            throw readErr;
          }
        } finally {
          watchdog.disarm();
        }
        return { stalled };
      };

      if (response && response.ok && response.body) {
        setGenPhase((cur) => nextGenPhase(cur, { type: 'response' }));
        try {
          await pipeSSE(response);
        } catch (streamErr: unknown) {
          const streamCode = (streamErr as { code?: string })?.code;
          if (
            isV2Request &&
            streamCode === 'V2_AI_UNAVAILABLE' &&
            !accumulated.trim() &&
            !abortCtrl.signal.aborted
          ) {
            const v2Spec = getV2ModelSpec(effectiveExternalModel);
            const fbOk = await tryStreamViaFirebaseAiLogic({
              modelId: effectiveExternalModel as V2ModelId,
              systemInstruction: v2Spec.systemDirective,
              history: contextSlice.map((m) => ({
                role: m.role === 'user' ? 'user' : 'assistant',
                content: m.text,
              })),
              signal: abortCtrl.signal,
              onDelta: (deltaTxt) => {
                if (!deltaTxt) return;
                if (firstTokenPerf === null) {
                  firstTokenPerf =
                    typeof performance !== 'undefined'
                      ? performance.now()
                      : Date.now();
                  firstTokenIso = new Date().toISOString();
                  setGenPhase((cur) => nextGenPhase(cur, { type: 'first-token' }));
                }
                accumulated += deltaTxt;
                if (!bubbleCreated) {
                  flushStreamText();
                } else {
                  scheduleFlush();
                }
              },
            });
            if (!fbOk) {
              throw streamErr;
            }
          } else {
            throw streamErr;
          }
        }
      } else if (response && !response.ok) {
        const errPayload = await response.json().catch(() => null);
        const extractedError =
          typeof errPayload?.error === 'string'
            ? errPayload.error
            : typeof errPayload?.error?.message === 'string'
            ? errPayload.error.message
            : typeof errPayload?.message === 'string'
            ? errPayload.message
            : `HTTP ${response.status}`;
        const httpErr = new Error(extractedError) as Error & { code?: string };
        httpErr.code = errPayload?.errorCode || errPayload?.error?.code;
        throw httpErr;
      } else if (isV2Request) {
        // Standalone APK / direct Firebase AI Logic client path (V2-only, zero retry loops)
        const v2Spec = getV2ModelSpec(effectiveExternalModel);
        const fbOk = await tryStreamViaFirebaseAiLogic({
          modelId: effectiveExternalModel as V2ModelId,
          systemInstruction: v2Spec.systemDirective,
          history: contextSlice.map((m) => ({
            role: m.role === 'user' ? 'user' : 'assistant',
            content: m.text,
          })),
          signal: abortCtrl.signal,
          onDelta: (deltaTxt) => {
            if (!deltaTxt) return;
            if (firstTokenPerf === null) {
              firstTokenPerf =
                typeof performance !== 'undefined'
                  ? performance.now()
                  : Date.now();
              firstTokenIso = new Date().toISOString();
              setGenPhase((cur) => nextGenPhase(cur, { type: 'first-token' }));
            }
            accumulated += deltaTxt;
            if (!bubbleCreated) {
              flushStreamText();
            } else {
              scheduleFlush();
            }
          },
        });
        if (!fbOk) {
          throw new Error(
            `${v2Spec.label} is temporarily unavailable. Verify server API configuration or try again shortly.`
          );
        }
      } else {
        // Standalone APK or direct client-side fallback (V1 untouched)
        try {
          let streamedViaCallback = false;
          const directReply = await runStandaloneClientSideAI({
            provider: activeProvider,
            externalKeys: effectiveExternalKeys,
            externalModel: effectiveExternalModel,
            externalBaseUrl: effectiveExternalBaseUrl,
            messages: contextSlice,
            signal: abortCtrl.signal,
            onDelta: (deltaTxt) => {
              if (!deltaTxt) return;
              if (firstTokenPerf === null) {
                firstTokenPerf =
                  typeof performance !== 'undefined'
                    ? performance.now()
                  : Date.now();
                firstTokenIso = new Date().toISOString();
                setGenPhase((cur) =>
                  nextGenPhase(cur, { type: 'first-token' })
                );
              }
              streamedViaCallback = true;
              accumulated += deltaTxt;
              if (!bubbleCreated) {
                flushStreamText();
              } else {
                scheduleFlush();
              }
            },
          });
          if (directReply && !streamedViaCallback) {
            if (firstTokenPerf === null) {
              firstTokenPerf =
                typeof performance !== 'undefined'
                  ? performance.now()
                  : Date.now();
              firstTokenIso = new Date().toISOString();
              setGenPhase((cur) =>
                nextGenPhase(cur, { type: 'first-token' })
              );
            }
            accumulated += directReply;
            flushStreamText();
          }
        } catch (clientFallbackErr: unknown) {
          if (
            clientFallbackErr instanceof Error &&
            clientFallbackErr.name === 'AbortError'
          ) {
            throw clientFallbackErr;
          }
          throw (
            clientFallbackErr ||
            lastFetchErr ||
            new Error(
              isDefaultUnlimitedProfile
                ? 'সার্ভারের সাথে সংযোগ বিচ্ছিন্ন হয়েছে। অনুগ্রহ করে আবার চেষ্টা করুন।'
                : 'কাস্টম API সার্ভিসের সাথে সংযোগ স্থাপন করা যায়নি। নেটওয়ার্ক এবং সেটিংস চেক করুন।'
            )
          );
        }
      }

      let continuationRounds = 0;
      if (!inStandaloneApk) {
        while (
          continuationRounds < MAX_AUTO_CONTINUATIONS &&
          !abortCtrl.signal.aborted &&
          accumulated.trim() &&
          looksTruncated(accumulated)
        ) {
          continuationRounds += 1;
          const baseBeforeCont = accumulated;
          try {
            const contRes = await fetch('/api/chat/stream', {
              method: 'POST',
              headers: streamReqHeaders,
              body: buildRequestBody([
                ...contextSlice,
                { role: 'ai', text: accumulated.slice(-3000) },
                { role: 'user', text: continuationDirective(accumulated) },
              ]),
              signal: abortCtrl.signal,
            });
            if (!contRes.ok || !contRes.body) break;
            await pipeSSE(contRes);
            const rawContChunk = accumulated.slice(baseBeforeCont.length);
            const mergedCont = mergeContinuationText(baseBeforeCont, rawContChunk);
            accumulated = mergedCont.merged;
            if (!mergedCont.deltaToAppend.trim()) {
              break;
            }
            scheduleFlush();
          } catch {
            break;
          }
        }
      }

      if (frameTimer !== null) {
        if (useGpuRaf) {
          window.cancelAnimationFrame(frameTimer);
        } else {
          window.clearTimeout(frameTimer);
        }
      }
      flushStreamText();
      revealFinishing = true;
      await drainReveal();
      cancelReveal();

      const { edits: fileEdits, cleanText: textWithoutFileBlocks } =
        parseFileEdits(accumulated);
      let projectFilesUpdated: string[] = [];
      if (fileEdits.length > 0) {
        const base: Project =
          project || {
            name: 'ai-project.zip',
            files: [],
            entry: null,
            createdAt: Date.now(),
          };
        const applied = updateProjectFiles(base, fileEdits);
        setProject(applied.project);
        projectFilesUpdated = [...applied.changed, ...applied.created];
        showToast(
          `${projectFilesUpdated.length} file${
            projectFilesUpdated.length === 1 ? '' : 's'
          } updated in ${applied.project.name}`,
          3200
        );
      }

      const {
        cleanText,
        thinking: extractedThinking,
        memories,
        selfUpdate,
        notes: aiNotes,
        skills: aiSkills,
      } = parseAIControlTags(textWithoutFileBlocks || accumulated);
      const conciseMode =
        settings.style !== 'detailed' && settings.mode !== 'power';
      const polished = polishReply(cleanText, { concise: conciseMode });
      let finalText = dropStallSentences(polished) || polished;

      finalText = matchAnswerLength(finalText, lastUserPrompt);

      // v19.0.0 — Background Website Project Engine: incrementally update project files
      // while preserving existing untouched files across conversations.
      try {
        const extractedBlocks = extractCodeBlocks(finalText);
        const storedProjects = loadWebsiteProjects();
        const existingForConv =
          storedProjects.find((p) => String(p.conversationId) === String(chatId)) ||
          storedProjects[0];
        const aiWebResult = extractAiWebsiteFileEdits(accumulated, existingForConv);
        if (aiWebResult.edits.length > 0 || hasPreviewableCode(extractedBlocks)) {
          let updatedWebProj = existingForConv;
          if (!updatedWebProj) {
            updatedWebProj =
              extractedBlocks.length > 0
                ? buildWebsiteProjectFromBlocks({
                    blocks: extractedBlocks.map((b) => ({ lang: b.lang, code: b.content })),
                    title: activeChat.title || 'AI Website Project',
                    conversationId: chatId,
                  })
                : createStarterWebsiteProject({
                    title: activeChat.title || 'AI Website Project',
                    template: 'modern-landing',
                    conversationId: chatId,
                  });
          } else if (aiWebResult.edits.length > 0) {
            updatedWebProj = applyProjectFileEdits(
              updatedWebProj,
              aiWebResult.edits,
              `Chat AI update: ${lastUserPrompt.slice(0, 60)}`
            ).project;
          }
          const nextList = [
            updatedWebProj,
            ...storedProjects.filter((p) => p.id !== updatedWebProj.id),
          ];
          saveWebsiteProjects(nextList);
        }
      } catch {
        // Non-blocking background website project sync
      }

      // P1-07: Empty stream is an error, never mark provider Connected
      if (!finalText.trim() && !accumulated.trim()) {
        const emptyErr = new Error(
          'সার্ভার থেকে খালি উত্তর এসেছে (EMPTY_RESPONSE)।'
        ) as Error & { code?: string };
        emptyErr.code = 'EMPTY_RESPONSE';
        throw emptyErr;
      }

      if (
        isDefaultUnlimitedProfile &&
        settings.memoryCache !== false &&
        !hasAttachedImgs &&
        !webSearch &&
        contextSlice.length <= 1 &&
        finalText.trim()
      ) {
        const clientCacheModeKey = `${activeProvider}:${effectiveExternalModel || ''}:${settings.mode}`;
        setClientCachedReply(lastUserPrompt, finalText, clientCacheModeKey);
      }

      const actualProvider = responderMeta.providerUsed || activeProvider;
      const actualModel =
        responderMeta.modelUsed || effectiveExternalModel || activeModelName;

      // P1-07: Only mark provider Connected when the actual selected provider succeeded
      if (actualProvider === activeProvider) {
        setProviderTestStatus({
          ok: true,
          message: `Connected (${activeDisplayName} · ${actualModel})`,
          testedAt: Date.now(),
          provider: activeProvider,
          model: actualModel,
        });
        setProviderLimitBanner(null);

        if (profileSnapshot) {
          setSavedProfiles((prev) => {
            const next = prev.map((p) =>
              p.id === profileSnapshot.id
                ? {
                    ...p,
                    verified: true,
                    verificationStatus: 'verified' as const,
                    quotaExhausted: false,
                    lastTestedAt: Date.now(),
                    statusMessage: `Connected · ${actualModel}`,
                  }
                : p
            );
            persistSavedProfiles(next);
            return next;
          });
        }
      }

      const newlySavedMemories: string[] =
        settings.autoMemory !== false && memories.length > 0
          ? rememberFacts(memories, 'ai')
          : [];

      let appliedSummary: string | undefined;
      let appliedWidgetId: string | undefined;
      const effectiveSelfUpdate =
        selfUpdate ||
        (detectInstantSelfUpdate(lastUserPrompt).isSelfUpdateIntent
          ? extractFallbackWidgetFromReply(cleanText || accumulated, lastUserPrompt)
          : null);
      if (effectiveSelfUpdate) {
        const res = applySelfUpdatePayload(effectiveSelfUpdate);
        appliedSummary = res.summary;
        appliedWidgetId = res.widgetId;
      }

      if (
        aiNotes.length > 0 &&
        isToolEnabled('create_note', settings.enabledTools)
      ) {
        const noteSummaries = applyAINotes(aiNotes);
        if (noteSummaries.length > 0) {
          appliedSummary = [appliedSummary, ...noteSummaries]
            .filter(Boolean)
            .join(' · ');
        }
      }

      if (aiSkills.length > 0) {
        const installedSkills = applySelfSkills(aiSkills);
        if (installedSkills.length > 0) {
          appliedSummary = [appliedSummary, `skill ${installedSkills.join(', ')}`]
            .filter(Boolean)
            .join(' · ');
        }
      }

      if (matchedSkills.length > 0) {
        setSkills((prev) =>
          prev.map((sk) =>
            matchedSkills.some((m) => m.id === sk.id)
              ? { ...sk, runs: sk.runs + 1 }
              : sk
          )
        );
      }

      // P1-12: Compute accurate monotonic duration and completion timestamps
      const completedPerf =
        typeof performance !== 'undefined' ? performance.now() : Date.now();
      const completedIso = new Date().toISOString();
      const computedLatencyMs = Math.max(
        1,
        Math.round(responderMeta.latencyMs ?? completedPerf - reqStartPerf)
      );
      const computedTtftMs =
        responderMeta.ttftMs ??
        (firstTokenPerf !== null
          ? Math.max(1, Math.round(firstTokenPerf - reqStartPerf))
          : undefined);
      const latencySecFormatted = `${(computedLatencyMs / 1000).toFixed(2)}s`;

      const finalCompletedMsg: ChatMessage = {
        id: aiMsgId,
        role: 'ai',
        text: finalText || cleanText || accumulated,
        thinking: extractedThinking || liveThinking || undefined,
        v2ModelId: isV2Request ? effectiveExternalModel : undefined,
        ts: reqStart,
        status: 'complete',
        turnId,
        requestedProvider: activeProvider,
        requestedModel: effectiveExternalModel || activeModelName,
        providerUsed: actualProvider,
        modelUsed: actualModel,
        fallbackNotice: responderMeta.fallbackNotice,
        attemptCount: responderMeta.attemptCount || 1,
        latencySec: latencySecFormatted,
        timing: {
          createdAt: reqStartIso,
          startedAt: reqStartIso,
          firstTokenAt: firstTokenIso,
          completedAt: completedIso,
          ttftMs: computedTtftMs,
          latencyMs: computedLatencyMs,
        },
        sources: attachedSources.length > 0 ? attachedSources : undefined,
        memoryAdded:
          newlySavedMemories.length > 0 ? newlySavedMemories : undefined,
        selfUpdateSummary: appliedSummary,
        selfUpdateWidgetId: appliedWidgetId,
        projectFilesUpdated:
          projectFilesUpdated.length > 0 ? projectFilesUpdated : undefined,
      };

      updateMessageInChat(chatId, aiMsgId, (m) => ({
        ...m,
        ...finalCompletedMsg,
        thinking: finalCompletedMsg.thinking || m.thinking,
      }));

      // Synchronize ALL persistent sessions (V1 & V2) & memory to Cloud Firestore when authenticated
      if (firebaseUser && firebaseUser.emailVerified) {
        const lastUserMessageObj = historyMsgs[historyMsgs.length - 1];
        const sessionVersionTag = isV2Request ? 'v2' : 'v1';
        const sessionModelTag =
          effectiveExternalModel || activeModelName || 'smfta-v5';
        void (async () => {
          try {
            if (lastUserMessageObj) {
              await saveSessionMessageToFirestore({
                user: firebaseUser,
                sessionId: chatId,
                sessionTitle: targetSession?.title || 'SMFTA Chat',
                messageId: lastUserMessageObj.id,
                role: 'user',
                text: lastUserMessageObj.text,
                modelId: sessionModelTag,
                systemVersion: sessionVersionTag,
              });
            }
            await saveSessionMessageToFirestore({
              user: firebaseUser,
              sessionId: chatId,
              sessionTitle: targetSession?.title || 'SMFTA Chat',
              messageId: aiMsgId,
              role: 'ai',
              text: finalCompletedMsg.text,
              modelId: sessionModelTag,
              systemVersion: sessionVersionTag,
            });
            await syncConversationToFirestore(
              firebaseUser,
              {
                ...targetSession,
                msgs: [...historyMsgs, finalCompletedMsg],
              },
              sessionVersionTag,
              sessionModelTag
            );
            for (const newFact of newlySavedMemories) {
              await saveMemoryFactToFirestore(
                firebaseUser,
                newFact,
                isV2Request ? 'v2_memory' : 'v1_memory',
                sessionModelTag
              );
            }
          } catch {
            // Logged in firebaseV2Client
          }
        })();
      }

      if (responderMeta.fallbackNotice) {
        showToast(`ℹ️ ${responderMeta.fallbackNotice}`, 3800);
      }

      // v18.11 — task-completion notification, gated by user settings.
      notifyUser(
        settings,
        'taskDone',
        'Response ready',
        'Your AI reply has finished generating.'
      );

      if (
        finalText.trim() &&
        (settings.autoVoice || talkMode || voiceCallOpen)
      ) {
        speakText(finalText, aiMsgId, () => {
          if (talkMode || voiceCallOpen) {
            setTimeout(() => toggleMic(), 400);
          }
        });
      }
    } catch (err: unknown) {
      setIsWaitingFirstToken(false);
      const stoppedIso = new Date().toISOString();
      const stoppedPerf =
        typeof performance !== 'undefined' ? performance.now() : Date.now();
      const elapsedMs = Math.max(1, Math.round(stoppedPerf - reqStartPerf));

      if (err instanceof Error && err.name === 'AbortError') {
        // P1-08 & P1-09: Stop/Abort must NEVER mark quotaExhausted or pollute provider status
        if (accumulated.trim()) {
          const { cleanText } = parseAIControlTags(accumulated);
          updateMessageInChat(chatId, aiMsgId, (m) => ({
            ...m,
            text: cleanText + '\n\n_Stopped._',
            status: 'stopped',
            turnId,
            timing: {
              createdAt: reqStartIso,
              startedAt: reqStartIso,
              firstTokenAt: firstTokenIso,
              completedAt: stoppedIso,
              latencyMs: elapsedMs,
            },
          }));
        }
        showToast('Generation stopped');
      } else {
        const rawMsg =
          err instanceof Error ? err.message : 'Connection interrupted';
        const errCode =
          (err as { code?: string })?.code ||
          (/401|403|unauthorized|invalid.*key/i.test(rawMsg)
            ? 'AUTH_INVALID'
            : /404|model.*not.*found/i.test(rawMsg)
            ? 'MODEL_UNAVAILABLE'
            : /402|insufficient_quota|credit|billing|কোটা শেষ/i.test(rawMsg)
            ? 'QUOTA_EXHAUSTED'
            : /429|rate.?limit/i.test(rawMsg)
            ? 'RATE_LIMITED'
            : /timeout|timed out|টাইমআউট/i.test(rawMsg)
            ? 'TIMEOUT'
            : /failed to fetch|networkerror|load failed|connection refused/i.test(
                rawMsg
              )
            ? 'NETWORK_ERROR'
            : 'SERVER_ERROR');

        // P1-05: Only fallback to built-in keyless engine for V1 if user explicitly enabled allowKeylessFallback AND no partial tokens were painted yet
        if (
          !isV2Request &&
          settings.allowKeylessFallback === true &&
          !isDefaultUnlimitedProfile &&
          !accumulated.trim()
        ) {
          showToast(
            `Fallback: ${activeProvider} ব্যর্থ — বিল্ট-ইন ইঞ্জিনে চেষ্টা করছি`,
            4200
          );
          setProviderLimitBanner(null);
          await streamAIResponse(
            chatId,
            historyMsgs,
            latestMemory,
            'xrahat',
            appendToMsg
          );
          return;
        }

        // v18.11 — real browser notification for request failures (gated by
        // the user's Notifications settings and browser permission).
        notifyUser(
          settings,
          'errors',
          'Reply failed',
          rawMsg.slice(0, 140)
        );

        const isNetworkFetchErr = errCode === 'NETWORK_ERROR';
        // P1-08: Fix `isQuotaOrRateLimit || true` bug! Only set quotaExhausted on true QUOTA_EXHAUSTED / 402 billing evidence
        const isTrueQuotaExhausted = errCode === 'QUOTA_EXHAUSTED';
        const isRateLimited = errCode === 'RATE_LIMITED';

        const cleanErr = isNetworkFetchErr
          ? 'সার্ভারের সাথে সংযোগ বিচ্ছিন্ন হয়েছে। অনুগ্রহ করে Retry বাটনে ট্যাপ করুন অথবা অন্য প্রোভাইডার সিলেক্ট করুন।'
          : rawMsg;
        const finalErrText = cleanErr.startsWith('⚠️')
          ? cleanErr
          : `⚠️ ${cleanErr}`;

        // Toast alert on custom provider HTTP 401 / 404 or connection failure
        if (errCode === 'AUTH_INVALID') {
          showToast(
            `⚠️ HTTP 401 Unauthorized: Invalid API key for ${activeDisplayName || activeProvider}.`,
            5000
          );
        } else if (errCode === 'MODEL_UNAVAILABLE') {
          showToast(
            `⚠️ HTTP 404 Model Not Found: "${effectiveExternalModel || activeModelName}" on ${activeDisplayName || activeProvider}.`,
            5000
          );
        } else {
          showToast(finalErrText.slice(0, 140), 4500);
        }

        if (!isV2Request) {
          setProviderTestStatus({
            ok: false,
            message: finalErrText,
            testedAt: Date.now(),
            provider: activeProvider,
            model: effectiveExternalModel || activeModelName,
          });
          if (profileSnapshot) {
            setSavedProfiles((prev) => {
              const next = prev.map((p) =>
                p.id === profileSnapshot.id
                  ? {
                      ...p,
                      verified:
                        errCode === 'AUTH_INVALID' || errCode === 'MODEL_UNAVAILABLE'
                          ? false
                          : p.verified,
                      verificationStatus:
                        errCode === 'AUTH_INVALID' || errCode === 'MODEL_UNAVAILABLE'
                          ? ('failed' as const)
                          : ('degraded' as const),
                      quotaExhausted: isTrueQuotaExhausted,
                      statusMessage: finalErrText,
                      lastTestedAt: Date.now(),
                    }
                  : p
              );
              persistSavedProfiles(next);
              return next;
            });
          }
          setProviderLimitBanner({
            profileName: activeDisplayName,
            message: isTrueQuotaExhausted
              ? `Quota/credits exhausted on "${activeDisplayName}". Please switch to another saved property manually below.`
              : isRateLimited
              ? `Rate limit (429) reached on "${activeDisplayName}". Wait briefly or switch to another saved property below.`
              : `"${activeDisplayName}" returned an error [${errCode}]: ${cleanErr.slice(0, 280)}`,
            profileId: profileSnapshot?.id,
          });
        } else {
          const v2Display = getV2ModelLabel(effectiveExternalModel);
          const cleanBannerMsg = cleanErr.startsWith(v2Display)
            ? cleanErr.slice(0, 240)
            : `${v2Display}: ${cleanErr.slice(0, 240)}`;
          setProviderLimitBanner({
            profileName: v2Display,
            message: isRateLimited
              ? `${v2Display} সাময়িকভাবে রেট লিমিটে পৌঁছেছে (429)। অনুগ্রহ করে একটু পর আবার চেষ্টা করুন।`
              : cleanBannerMsg,
          });
        }

        // P1-09: If partial text was already streamed in this bubble, keep it and mark status 'failed'; otherwise append a single error message
        if (accumulated.trim()) {
          const { cleanText } = parseAIControlTags(accumulated);
          updateMessageInChat(chatId, aiMsgId, (m) => ({
            ...m,
            text: `${cleanText}\n\n${finalErrText}`,
            isError: true,
            status: 'failed',
            errorCode: errCode,
            turnId,
            timing: {
              createdAt: reqStartIso,
              startedAt: reqStartIso,
              firstTokenAt: firstTokenIso,
              completedAt: stoppedIso,
              latencyMs: elapsedMs,
            },
          }));
        } else {
          if (bubbleCreated) {
            setChats((prev) =>
              prev.map((c) =>
                c.id === chatId
                  ? { ...c, msgs: c.msgs.filter((m) => m.id !== aiMsgId) }
                  : c
              )
            );
          }
          appendMessageToChat(chatId, {
            id: createUniqueId('err'),
            role: 'ai',
            text: finalErrText,
            ts: reqStart,
            isError: true,
            status: 'failed',
            errorCode: errCode,
            turnId,
            requestedProvider: activeProvider,
            requestedModel: effectiveExternalModel || activeModelName,
            timing: {
              createdAt: reqStartIso,
              startedAt: reqStartIso,
              completedAt: stoppedIso,
              latencyMs: elapsedMs,
            },
          });
        }
      }
    } finally {
      window.clearTimeout(timeoutId);
      window.clearTimeout(phaseFallback);
      setIsWaitingFirstToken(false);
      setStreamingMsgId(null);
      setIsGenerating(false);
      setGenPhase(nextGenPhase(null, { type: 'stop' }));
      setGenStepDetail(null);
      setActiveTaskPlan(null);
    }
  };

  // v18.6.0 — open the loaded zip project in the Code Workspace (idle until Run click)
  const handleRunProject = () => {
    if (!project) return;
    try {
      const preview = buildProjectPreview(project);
      handleOpenCodeWorkspace(
        [{ lang: 'html', content: preview.html, index: 0 } as CodeBlockInfo],
        0
      );
      if (preview.missing.length > 0) {
        showToast(
          `CDN/বাইরের লিংক প্রিভিউতে লোড হবে না: ${preview.missing
            .slice(0, 3)
            .join(', ')}`,
          4200
        );
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'প্রজেক্ট রান করা যায়নি', 3600);
    }
  };

  // Process incoming files (from file picker, drag & drop, or paste) — universal unlimited-size reader
  const handleProcessIncomingFiles = async (files: File[]) => {
    for (const f of files) {
      // 1. .zip project archive (with automatic fallback to universal document reader for huge/binary zips)
      if (/\.zip$/i.test(f.name)) {
        try {
          if (f.size <= 60 * 1024 * 1024) {
            const buf = await f.arrayBuffer();
            const loaded = readZipProject(new Uint8Array(buf), f.name);
            if (loaded.files.length > 0) {
              setProject(loaded);
              showToast(
                `${loaded.name} · ${loaded.files.length} files loaded${
                  loaded.entry ? ` · entry ${loaded.entry}` : ''
                }`,
                4200
              );
              continue;
            }
          }
          // Fallback if zip is > 60MB or contains only non-project files: read via universal document reader
          const doc = await readDocumentFile(f);
          setPendingFiles((prev) => [
            ...prev.slice(-15),
            { name: doc.name, content: doc.content, summary: doc.summary, doc },
          ]);
          showToast(`✓ ${doc.name} (${doc.summary})`, 3200);
        } catch {
          try {
            const doc = await readDocumentFile(f);
            setPendingFiles((prev) => [
              ...prev.slice(-15),
              { name: doc.name, content: doc.content, summary: doc.summary, doc },
            ]);
            showToast(`✓ ${doc.name} (${doc.summary})`, 3200);
          } catch (err) {
            showToast(err instanceof Error ? err.message : 'ZIP could not be read', 4000);
          }
        }
        continue;
      }

      // 2. Images (auto-compress oversized images on canvas so any size photo works without limit errors)
      if (
        /^image\/(png|jpe?g|webp|gif|svg\+xml|bmp)$/i.test(f.type) ||
        /\.(png|jpe?g|webp|gif|svg|bmp)$/i.test(f.name)
      ) {
        const attachImageDataUrl = (url: string, mime: string) => {
          const base64Data = url.includes(',') ? url.split(',')[1] : url;
          setPendingImgs((prev) => [
            ...prev.slice(-3),
            { mime: mime || 'image/jpeg', data: base64Data, url },
          ]);
          showToast(`Attached image "${f.name}"`, 2200);
        };

        if (f.size > 3.2 * 1024 * 1024 && typeof document !== 'undefined') {
          try {
            const bitmapUrl = URL.createObjectURL(f);
            const imgEl = new Image();
            await new Promise<void>((resolve, reject) => {
              imgEl.onload = () => resolve();
              imgEl.onerror = () => reject(new Error('Image decode failed'));
              imgEl.src = bitmapUrl;
            });
            const maxDim = 1920;
            const scale = Math.min(1, maxDim / Math.max(imgEl.width || 1, imgEl.height || 1));
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round((imgEl.width || 800) * scale));
            canvas.height = Math.max(1, Math.round((imgEl.height || 600) * scale));
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(imgEl, 0, 0, canvas.width, canvas.height);
              const compressedUrl = canvas.toDataURL('image/jpeg', 0.84);
              URL.revokeObjectURL(bitmapUrl);
              attachImageDataUrl(compressedUrl, 'image/jpeg');
              continue;
            }
            URL.revokeObjectURL(bitmapUrl);
          } catch {
            // Fall through to FileReader if canvas downscaling is unavailable
          }
        }

        const reader = new FileReader();
        reader.onload = () => {
          const url = String(reader.result || '');
          attachImageDataUrl(url, f.type || 'image/jpeg');
        };
        reader.readAsDataURL(f);
        continue;
      }

      // 3. Universal file reader: documents, spreadsheets, archives, data, code, logs, or binary files of ANY size
      try {
        const doc = await readDocumentFile(f);
        setPendingFiles((prev) => [
          ...prev.slice(-15),
          { name: doc.name, content: doc.content, summary: doc.summary, doc },
        ]);
        showToast(`✓ ${doc.name} (${doc.summary})`, 3200);
      } catch (err) {
        showToast(
          `Could not read "${f.name}": ${err instanceof Error ? err.message : 'Unknown error'}`,
          3600
        );
      }
    }
  };

  // File picker handler
  const handlePickFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []) as File[];
    if (files.length > 0) {
      handleProcessIncomingFiles(files);
    }
    e.target.value = '';
  };

  // Export current chat
  const handleExportChatMarkdown = () => {
    if (!activeChat || activeChat.msgs.length === 0) {
      showToast('Nothing to export yet');
      return;
    }
    let md = `# ${activeChat.title}\n\n_Exported from SMFTA AI Pro v${APP_VERSION} · ${new Date().toLocaleString()}_\n\n---\n\n`;
    activeChat.msgs.forEach((m) => {
      md += `## ${m.role === 'user' ? 'You' : 'SMFTA AI'}\n\n${m.text}\n\n`;
    });
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${
      activeChat.title.replace(/[^\w\d\- ]+/g, '').trim() || 'chat'
    }.md`;
    a.click();
    URL.revokeObjectURL(a.href);
    showToast('Chat exported as Markdown', 2600);
  };

  // P1-24: Secret-free versioned backup envelope
  const handleExportBackup = () => {
    const envelope = buildExportEnvelope({
      chats,
      settings,
      savedProfiles,
      memory,
      notebook: notes,
      widgets: selfWidgets,
      skills,
      autonomy,
      includeKeys: false,
    });
    const blob = new Blob([JSON.stringify(envelope, null, 2)], {
      type: 'application/json',
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `smfta_backup_${envelope.exportedAt.slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    showToast(
      `Backup exported (${envelope.itemCounts.chats} chats, ${envelope.itemCounts.memory} memories — API keys excluded)`
    );
  };

  const handleSaveRollbackPoint = () => {
    try {
      const snap = buildExportEnvelope({
        chats,
        settings,
        savedProfiles,
        memory,
        notebook: notes,
        widgets: selfWidgets,
        skills,
        autonomy,
        includeKeys: false,
      });
      localStorage.setItem(LS_KEYS.rollback, JSON.stringify(snap));
    } catch {
      showToast('⚠️ স্টোরেজ সীমার কারণে রোলব্যাক স্ন্যাপশট সংরক্ষণ করা যায়নি');
    }
  };

  const handleRollback = () => {
    try {
      const raw = localStorage.getItem(LS_KEYS.rollback);
      if (!raw) {
        showToast('কোনো রোলব্যাক স্ন্যাপশট পাওয়া যায়নি');
        return;
      }
      const parsed = parseImportPayload(raw);
      if (parsed.settings) {
        setSettings((prev) =>
          sanitizeSettings({
            ...prev,
            ...parsed.settings,
            externalKeys: prev.externalKeys,
          })
        );
      }
      if (parsed.chats.length > 0) {
        setChats(parsed.chats);
        setActiveId(parsed.chats[0].id);
      }
      if (parsed.memory) {
        const restored = factsToText(
          migrateMemory(parsed.memory).facts,
          MEMORY_MAX
        );
        memoryRef.current = restored;
        setMemory(restored);
      }
      if (parsed.widgets) {
        setSelfWidgets(parsed.widgets);
      }
      if (parsed.skills) {
        setSkills(parsed.skills);
      }
      showToast('⏪ সিস্টেম সফলভাবে পূর্বের অবস্থায় রোলব্যাক করা হয়েছে!');
    } catch {
      showToast('রোলব্যাক করতে সমস্যা হয়েছে');
    }
  };

  // P1-25: Atomic validated import using parseImportPayload
  const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) {
      showToast('Backup file exceeds 15 MB limit — import cancelled');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const rawStr = String(reader.result || '');
        const parsed = parseImportPayload(rawStr);

        // Apply all validated categories in a single synchronous React batch
        if (parsed.chats.length > 0) {
          setChats(parsed.chats);
          setActiveId(parsed.chats[0].id);
        }
        if (parsed.settings) {
          setSettings((prev) =>
            sanitizeSettings({
              ...prev,
              ...parsed.settings,
              // Keep existing live API keys if the backup had secrets stripped
              externalKeys: parsed.settings?.externalKeys || prev.externalKeys,
            })
          );
        }
        if (parsed.savedProfiles && parsed.savedProfiles.length > 0) {
          handleUpdateProfiles(parsed.savedProfiles);
        }
        if (parsed.memory) {
          const restoredMem = factsToText(
            migrateMemory(parsed.memory).facts,
            MEMORY_MAX
          );
          memoryRef.current = restoredMem;
          setMemory(restoredMem);
        }
        if (parsed.notebook) {
          setNotes(sanitizeNotes(parsed.notebook));
        }
        if (parsed.widgets) {
          setSelfWidgets(parsed.widgets);
        }
        if (parsed.skills) {
          setSkills(parsed.skills);
        }
        if (parsed.autonomy) {
          setAutonomy(parsed.autonomy);
        }
        showToast(
          `Restored ${parsed.chats.length} chat(s) (v${parsed.schemaVersion} backup) ✓`
        );
      } catch (err: unknown) {
        const msg =
          err instanceof Error ? err.message : 'Invalid backup JSON';
        console.warn('[App.handleImportBackup]', msg);
        showToast(`Import rejected: ${msg}`);
      }
    };
    reader.readAsText(file);
  };

  // P1-26: Full wipe of all local storage keys and application state
  const handleFullClearAllData = () => {
    // When signed in, wipe the account's cloud rows as well so the reset is
    // complete on every device, not just this browser.
    if (cloudClient && userId && cloudReady) {
      wipeCloudWorkspace(cloudClient, userId)
        .then(() => {
          syncedSessionVersions.current.clear();
          showToast('Cloud workspace wiped');
        })
        .catch((wipeErr) => {
          setCloudStatus('offline');
          console.warn('[cloudSync.wipe]', wipeErr);
          showToast('Local data cleared — cloud wipe failed (offline?)');
        });
    }
    try {
      Object.values(LS_KEYS).forEach((k) => localStorage.removeItem(k));
      localStorage.removeItem(SAVED_PROFILES_KEY);
      localStorage.removeItem('smfta_autonomy');
      localStorage.removeItem('smfta_self_skills');
      localStorage.removeItem('smfta_battle_wins');
    } catch {
      // Ignore storage access errors
    }
    const fresh: ChatSession = {
      id: Date.now(),
      title: 'New Chat',
      titleSource: 'auto',
      msgs: [],
    };
    setChats([fresh]);
    setActiveId(fresh.id);
    forgetAllMemory();
    setSettings({ ...DEFAULT_SETTINGS });
    setSavedProfiles([{ ...DEFAULT_BUILTIN_PROFILE }]);
    setNotes([]);
    setSelfWidgets([]);
    setSkills([]);
    setConnections(sanitizeVaultConnections({}));
    setProviderTestStatus(null);
    setProviderLimitBanner(null);
    setSettingsOpen(false);
    setCurrentView('chat');
    showToast('All local data, chats, profiles, notes & memory wiped');
  };

  // Filtered chats for sidebar
  const orderedChats = [
    ...chats.filter((c) => c.pinned),
    ...chats.filter((c) => !c.pinned),
  ];
  const filteredChats = searchQuery.trim()
    ? orderedChats.filter(
        (c) =>
          c.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          c.msgs.some((m) =>
            m.text.toLowerCase().includes(searchQuery.toLowerCase())
          )
      )
    : orderedChats;

  const lastUserMessage =
    [...activeChat.msgs].reverse().find((m) => m.role === 'user')?.text || '';
  const lastAiMessage =
    [...activeChat.msgs].reverse().find((m) => m.role === 'ai')?.text || '';

  return (
    <div className="app-shell flex h-[100dvh] w-full overflow-hidden bg-[var(--bg)] text-[var(--text)]">
      {/* Slide-over Navigation Drawer (opened from top-left staggered menu icon) */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-50 flex bg-black/50 backdrop-blur-[1px]"
          onClick={() => setSidebarOpen(false)}
        >
          <aside
            className="w-[290px] max-w-[84vw] h-full bg-[var(--sidebar)] border-r border-[var(--border)] flex flex-col p-3.5 gap-3 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2 px-1">
              <span className="ref-serif text-[18px] font-medium text-[var(--ink)]">
                SMFTA AI
              </span>
              <button
                type="button"
                onClick={() => setSidebarOpen(false)}
                className="w-8 h-8 rounded-full inline-flex items-center justify-center text-[var(--ink-dim)] hover:text-[var(--ink)] hover:bg-[var(--surface-2)] cursor-pointer"
                aria-label="Close sidebar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                handleNewChat();
                setSidebarOpen(false);
              }}
              className="w-full h-10 px-3.5 rounded-xl bg-[var(--surface)] border border-[var(--border)] text-[13.5px] font-medium text-[var(--ink)] flex items-center gap-2.5 hover:bg-[var(--surface-2)] cursor-pointer"
            >
              <MessageSquarePlus className="w-4 h-4 text-[var(--primary)]" />
              <span>New chat</span>
            </button>

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-[var(--ink-dim)] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search chats..."
                className="w-full h-9 pl-8 pr-3 rounded-xl bg-[var(--surface)] border border-[var(--border)] text-xs text-[var(--ink)] placeholder:text-[var(--ink-dim)] outline-none focus:border-[var(--primary)]"
              />
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto space-y-1 pr-0.5">
              <div className="px-2 py-1 text-[11px] font-medium text-[var(--ink-dim)]">
                Recent
              </div>
              {filteredChats.length === 0 ? (
                <div className="px-2 py-4 text-xs text-[var(--ink-dim)]">
                  No conversations yet.
                </div>
              ) : (
                filteredChats.map((c) => {
                  const isCurrent = c.id === activeId;
                  return (
                    <div
                      key={c.id}
                      className={`group flex items-center justify-between gap-1.5 px-2.5 py-2 rounded-xl text-[13px] cursor-pointer transition-colors ${
                        isCurrent
                          ? 'bg-[var(--surface-2)] text-[var(--ink)] font-medium'
                          : 'text-[var(--ink-muted)] hover:bg-[var(--surface)] hover:text-[var(--ink)]'
                      }`}
                      onClick={() => {
                        setActiveId(c.id);
                        setSidebarOpen(false);
                      }}
                    >
                      <span className="truncate flex-1">{c.title || 'New chat'}</span>
                      <div className="flex items-center gap-0.5 opacity-80 sm:opacity-0 sm:group-hover:opacity-100">
                        <button
                          type="button"
                          onClick={(e) => handleTogglePin(e, c.id)}
                          className="p-1 rounded-md hover:bg-[var(--surface-3)] text-[var(--ink-dim)]"
                          title={c.pinned ? 'Unpin' : 'Pin'}
                        >
                          <Pin className={`w-3 h-3 ${c.pinned ? 'text-[var(--primary)]' : ''}`} />
                        </button>
                        {chats.length > 1 && (
                          <button
                            type="button"
                            onClick={(e) => handleDeleteChat(e, c.id)}
                            className="p-1 rounded-md hover:bg-[var(--surface-3)] text-[var(--ink-dim)] hover:text-rose-400"
                            title="Delete chat"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="pt-2 border-t border-[var(--border)] space-y-1">
              <button
                type="button"
                onClick={() => {
                  setNotebookOpen(true);
                  setSidebarOpen(false);
                }}
                className="w-full px-3 py-2 rounded-xl text-[13px] text-[var(--ink-muted)] hover:bg-[var(--surface)] hover:text-[var(--ink)] flex items-center gap-2.5 cursor-pointer"
              >
                <FolderOpen className="w-4 h-4" />
                <span>Notebook</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setConnectionsOpen(true);
                  setSidebarOpen(false);
                }}
                className="w-full px-3 py-2 rounded-xl text-[13px] text-[var(--ink-muted)] hover:bg-[var(--surface)] hover:text-[var(--ink)] flex items-center gap-2.5 cursor-pointer"
              >
                <LayoutGrid className="w-4 h-4" />
                <span>Connectors</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setSettingsTab('general');
                  setSettingsOpen(true);
                  setSidebarOpen(false);
                }}
                className="w-full px-3 py-2 rounded-xl text-[13px] text-[var(--ink-muted)] hover:bg-[var(--surface)] hover:text-[var(--ink)] flex items-center gap-2.5 cursor-pointer"
              >
                <Settings className="w-4 h-4" />
                <span>Settings</span>
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 bg-[var(--surface-2)] text-[var(--ink)] px-5 py-2.5 rounded-full text-xs font-medium shadow-lg border border-[var(--border)]">
          {toastMsg}
        </div>
      )}

      {/* MAIN WORKSPACE COLUMN */}
      <div className="flex-1 flex flex-col min-w-0 h-full">
        {currentView === 'workspace' ? (
          <CodeWorkspacePage
            initialPayload={workspacePayload}
            onBackToChat={handleBackFromWorkspace}
            codeFontSize={settings.codeFontSize}
          />
        ) : (
          <main className={`v2-main${activeChat.msgs.length === 0 && !isWaitingFirstToken ? ' is-empty' : ''}`}>
            {/* HEADER — Screenshot 1 & 4: Staggered Menu Left, Quiet Brand, Pill Group [New Chat | •••] Right */}
            <header className="app-header">
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  data-testid="drawer-menu-btn"
                  onClick={() => setSidebarOpen(true)}
                  className="ref-circle-btn"
                  aria-label="Open menu"
                  title="Conversations & Navigation"
                >
                  <StaggeredMenuIcon className="w-4 h-4" />
                </button>
                <span className="hidden sm:inline text-[15px] font-medium text-[var(--ink-muted)]">
                  {activeDisplayName === 'Msfta shop ai'
                    ? 'SMFTA AI'
                    : activeDisplayName || 'SMFTA AI'}
                </span>
              </div>

              <div className="relative flex items-center">
                <div className="ref-pill-group">
                  <button
                    type="button"
                    onClick={handleNewChat}
                    className="ref-pill-icon-btn"
                    aria-label="New chat"
                    title="New chat"
                  >
                    <MessageSquarePlus className="w-[17px] h-[17px]" />
                  </button>
                  <button
                    type="button"
                    data-testid="header-menu-btn"
                    onClick={() => setHeaderMenuOpen((v) => !v)}
                    className="ref-pill-icon-btn"
                    aria-label="Options & Settings"
                    aria-expanded={headerMenuOpen}
                    title="Options & Settings"
                  >
                    <MoreHorizontal className="w-[17px] h-[17px]" />
                  </button>
                </div>

                {headerMenuOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-30"
                      onClick={() => setHeaderMenuOpen(false)}
                    />
                    <div
                      data-testid="header-menu-popover"
                      className="absolute right-0 top-full mt-2 w-44 bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-2xl p-1.5 z-40 space-y-0.5 text-xs"
                    >
                      <button
                        type="button"
                        data-testid="header-menu-new-chat"
                        onClick={() => {
                          handleNewChat();
                          setHeaderMenuOpen(false);
                        }}
                        className="w-full text-left px-3 py-2 rounded-xl flex items-center gap-2 text-[var(--ink)] hover:bg-[var(--surface-2)] cursor-pointer transition-colors font-medium"
                      >
                        <Plus className="w-3.5 h-3.5 text-[var(--primary)]" />
                        <span>New Chat</span>
                      </button>

                      <button
                        type="button"
                        data-testid="header-menu-settings"
                        onClick={() => {
                          setSettingsTab('general');
                          setSettingsOpen(true);
                          setHeaderMenuOpen(false);
                        }}
                        className="w-full text-left px-3 py-2 rounded-xl flex items-center gap-2 text-[var(--ink)] hover:bg-[var(--surface-2)] cursor-pointer transition-colors font-medium"
                      >
                        <Settings className="w-3.5 h-3.5 text-[var(--primary)]" />
                        <span>Settings</span>
                      </button>
                    </div>
                  </>
                )}
              </div>
            </header>

            {/* FULL-WIDTH RESPONSIVE CHAT PANEL */}
            <div className="flex flex-col min-w-0 h-full overflow-hidden">
              {/* IN-CHAT FLOATING SEARCH BAR */}
              {inChatSearchOpen && (
                <div className="app-findbar shrink-0">
                  <Search className="w-4 h-4" style={{ color: 'var(--ink-dim)' }} />
                  <input
                    type="text"
                    autoFocus
                    value={inChatSearchQuery}
                    onChange={(e) => setInChatSearchQuery(e.target.value)}
                    placeholder="Search in this conversation"
                    className="flex-1 bg-transparent outline-none"
                  />
                  {inChatSearchQuery.trim() && (
                    <span className="app-findbar-count">
                      {
                        activeChat.msgs.filter((m) =>
                          m.text.toLowerCase().includes(inChatSearchQuery.toLowerCase())
                        ).length
                      }{' '}
                      matches
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setInChatSearchOpen(false);
                      setInChatSearchQuery('');
                    }}
                    className="icon-btn"
                    title="Close search"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              <div
                ref={chatBoxRef}
                onScroll={(e) => {
                  const el = e.currentTarget;
                  const distFromBottom =
                    el.scrollHeight - el.scrollTop - el.clientHeight;
                  if (distFromBottom > 85) {
                    userScrolledUpRef.current = true;
                    setShowScrollBottomBtn(true);
                  } else if (distFromBottom < 35) {
                    userScrolledUpRef.current = false;
                    setShowScrollBottomBtn(false);
                  }
                }}
                onWheel={(e) => {
                  if (e.deltaY < -2) {
                    userScrolledUpRef.current = true;
                    setShowScrollBottomBtn(true);
                  }
                }}
                onTouchStart={(e) => {
                  if (e.touches.length === 1) {
                    touchStartYRef.current = e.touches[0].clientY;
                  }
                }}
                onTouchMove={(e) => {
                  if (
                    e.touches.length === 1 &&
                    touchStartYRef.current !== null
                  ) {
                    const dy = e.touches[0].clientY - touchStartYRef.current;
                    if (dy > 8) {
                      userScrolledUpRef.current = true;
                      setShowScrollBottomBtn(true);
                    }
                  }
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const files = Array.from(
                    e.dataTransfer?.files || []
                  ) as File[];
                  if (files.length > 0) {
                    handleProcessIncomingFiles(files);
                  }
                }}
                className="content-scroll flex-1"
              >
                {activeChat.msgs.length === 0 && !isWaitingFirstToken ? (
                  <div className="empty-state">
                    <SunburstMarkIcon className="ref-sunburst" />
                    <h1 className="empty-title">What can I help with?</h1>
                  </div>
                ) : (
              <div className="w-full max-w-[780px] mx-auto">
                {activeChat.msgs.map((m) => {
                  const attachedDocNames =
                    m.role === 'user'
                      ? Array.from(
                          m.text.matchAll(/⟦FILE:([^\n⟦]+)⟧[\s\S]*?⟦\/FILE⟧/g)
                        ).map((match) => match[1].trim())
                      : [];
                  const cleanUserText =
                    m.role === 'user'
                      ? m.text
                          .replace(/⟦FILE:([^\n⟦]+)⟧[\s\S]*?⟦\/FILE⟧/g, '')
                          .trim()
                      : m.text;
                  return (
                  <div key={m.id} className={`msg-row ${m.role === 'user' ? 'is-user' : 'is-ai'}`}>
                    {/* Message Body */}
                    <div
                      className={`flex flex-col min-w-0 ${
                        m.role === 'user'
                          ? 'items-end max-w-[92%] sm:max-w-2xl'
                          : 'items-start w-full'
                      }`}
                    >
                      {m.role === 'user' ? (
                        <>
                          {((m.imgs && m.imgs.length > 0) || attachedDocNames.length > 0) && (
                            <div className="ref-attach-grid">
                              {m.imgs?.map((im, idx) => (
                                <img
                                  key={`img-${idx}`}
                                  src={
                                    im.url ||
                                    `data:${im.mime};base64,${im.data}`
                                  }
                                  alt="Uploaded attachment"
                                  referrerPolicy="no-referrer"
                                  onClick={() =>
                                    setLightboxImg(
                                      im.url ||
                                        `data:${im.mime};base64,${im.data}`
                                    )
                                  }
                                  className="ref-attach-img"
                                />
                              ))}
                              {attachedDocNames.map((fname, idx) => {
                                const ext =
                                  fname.split('.').pop()?.slice(0, 4).toUpperCase() ||
                                  'FILE';
                                return (
                                  <div key={`doc-${idx}`} className="ref-attach-doc">
                                    <span className="ref-attach-badge">{ext}</span>
                                    <span className="ref-attach-name">{fname}</span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                          {cleanUserText && (
                            <div className="msg-user-bubble">{cleanUserText}</div>
                          )}
                        </>
                      ) : (
                        <div className="w-full min-w-0">
                          <div className="msg-ai-head">
                            <span className="msg-ai-model">
                              {m.v2ModelId
                                ? getV2ModelSpec(m.v2ModelId).label
                                : activeModelLabel}
                            </span>
                          </div>
                          <InteractiveMessageContent
                            messageId={m.id}
                            text={m.text}
                            thinking={m.thinking}
                            isStreaming={streamingMsgId === m.id}
                            proactiveSuggestions={m.proactiveSuggestions}
                            revisions={m.revisions}
                            onUpdateMessageText={(msgId, newText, rev) => {
                              updateMessageInChat(
                                activeChat.id,
                                msgId,
                                (old) => ({
                                  ...old,
                                  text: newText,
                                  revisions: rev
                                    ? [...(old.revisions || []), rev]
                                    : old.revisions?.slice(0, -1),
                                })
                              );
                            }}
                            onDismissSuggestion={(msgId, sugId) => {
                              updateMessageInChat(
                                activeChat.id,
                                msgId,
                                (old) => ({
                                  ...old,
                                  proactiveSuggestions: (
                                    old.proactiveSuggestions || []
                                  ).filter((s) => s.id !== sugId),
                                })
                              );
                            }}
                            onAcceptSuggestion={(msgId, sug) => {
                              updateMessageInChat(
                                activeChat.id,
                                msgId,
                                (old) => {
                                  if (!old.text.includes(sug.targetText)) {
                                    showToast(
                                      'Phrase already modified; try Inline Rewrite'
                                    );
                                    return old;
                                  }
                                  const updatedText = old.text.replace(
                                    sug.targetText,
                                    sug.replacementText
                                  );
                                  const newRev: InlineRevision = {
                                    id: 'rev-' + Date.now(),
                                    timestamp: Date.now(),
                                    feedback: `Proactive AI (${sug.category})`,
                                    scope: 'sentence',
                                    previousText: old.text,
                                    newText: updatedText,
                                    summary: sug.reason,
                                  };
                                  showToast(
                                    'Suggestion applied inline'
                                  );
                                  return {
                                    ...old,
                                    text: updatedText,
                                    revisions: [
                                      ...(old.revisions || []),
                                      newRev,
                                    ],
                                    proactiveSuggestions: (
                                      old.proactiveSuggestions || []
                                    ).filter((s) => s.id !== sug.id),
                                  };
                                }
                              );
                            }}
                            onOpenCodeLab={(code) => {
                              setCodeLabInit(code);
                              setCodeLabOpen(true);
                            }}
                            onInstallSelfWidget={(code) => {
                              const res = applySelfUpdatePayload({
                                widget: {
                                  title: 'Custom AI Tool #' + (selfWidgets.length + 1),
                                  description: 'Installed from chat code block',
                                  code,
                                },
                                summary: 'Installed live HTML tool into SMFTA AI',
                              });
                              if (res.widgetId) {
                                showToast('Installed into your self-update tools');
                              }
                            }}
                            onToast={showToast}
                            renderMarkdown={settings.markdownRender !== false}
                            highlightCode={settings.codeHighlight !== false}
                          />

                          {/* Artifact / Downloadable Card (Screenshot 1 style) */}
                          {(m.selfUpdateSummary ||
                            m.selfUpdateWidgetId ||
                            (m.memoryAdded && m.memoryAdded.length > 0)) && (
                            <div className="mt-3 space-y-2">
                              {m.selfUpdateWidgetId && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const found = selfWidgets.find(
                                      (w) => w.id === m.selfUpdateWidgetId
                                    );
                                    if (found) {
                                      setActiveWidgetModal(found);
                                    } else {
                                      setSelfEvolutionOpen(true);
                                    }
                                  }}
                                  className="ref-artifact-card"
                                >
                                  <span className="ref-artifact-thumb">
                                    <LayoutTemplate className="w-5 h-5" />
                                  </span>
                                  <span className="min-w-0 flex-1">
                                    <span className="block text-[15.5px] font-semibold text-[var(--ink)] truncate">
                                      {m.selfUpdateSummary || 'Interactive App Solution'}
                                    </span>
                                    <span className="block text-[13px] text-[var(--ink-dim)] mt-0.5">
                                      Interactive Artifact · Open
                                    </span>
                                  </span>
                                </button>
                              )}
                              {!m.selfUpdateWidgetId && m.selfUpdateSummary && (
                                <div className="text-xs text-[var(--ink-dim)] flex items-center gap-1.5">
                                  <Zap className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                                  <span>{m.selfUpdateSummary}</span>
                                </div>
                              )}
                              {m.memoryAdded && m.memoryAdded.length > 0 && (
                                <div className="text-[11px] text-[var(--ink-dim)]">
                                  Memory updated
                                </div>
                              )}
                            </div>
                          )}

                          {/* Generated Image Card */}
                          {m.imgGen && (
                            <div className="mt-3 max-w-xs rounded-2xl overflow-hidden border border-[var(--border)] bg-[var(--surface-2)]">
                              <img
                                src={m.imgGen.url}
                                alt={m.imgGen.prompt}
                                referrerPolicy="no-referrer"
                                onClick={() => setLightboxImg(m.imgGen!.url)}
                                className="w-full aspect-square object-cover block cursor-zoom-in"
                              />
                              <div className="px-3 py-2 flex items-center justify-between text-xs text-[var(--text-2)]">
                                <span>Image Studio</span>
                                <a
                                  href={m.imgGen.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-[var(--primary)] font-semibold inline-flex items-center gap-1 hover:underline"
                                >
                                  Open HD <ExternalLink className="w-3 h-3" />
                                </a>
                              </div>
                            </div>
                          )}

                          {/* Web Search Sources */}
                          {m.sources && m.sources.length > 0 && (
                            <div className="mt-3 pt-2 border-t border-[var(--border)] text-xs text-[var(--text-2)]">
                              <span className="font-semibold text-[var(--text)] mr-2">
                                Sources:
                              </span>
                              {m.sources.map((s, idx) => (
                                <React.Fragment key={idx}>
                                  {idx > 0 && <span className="mx-1.5">·</span>}
                                  <a
                                    href={s.uri}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-[var(--primary)] hover:underline"
                                  >
                                    {s.title}
                                  </a>
                                </React.Fragment>
                              ))}
                            </div>
                          )}
                          {m.fallbackNotice && (
                            <div className="mt-1.5 text-[11px] text-amber-400/90 flex items-center gap-1.5">
                              <span>⚡ {m.fallbackNotice}</span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Plain Single-Line Timestamp & Quiet Actions */}
                      {streamingMsgId !== m.id && (
                        <div className="msg-actions">
                          <span className="font-mono-num whitespace-nowrap">
                            {settings.showTimestamps !== false
                              ? formatTime(m.ts)
                              : ''}
                            {settings.showTokenUsage === true && m.latencySec
                              ? `${
                                  settings.showTimestamps !== false ? ' · ' : ''
                                }${m.latencySec}${
                                  m.timing?.ttftMs
                                    ? ` · TTFT ${m.timing.ttftMs}ms`
                                    : ''
                                }`
                              : ''}
                          </span>

                          {m.role === 'ai' ? (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  navigator.clipboard?.writeText(m.text);
                                  showToast('Copied');
                                }}
                                className="msg-action"
                              >
                                <Copy className="w-3 h-3" />
                                <span>Copy</span>
                              </button>

                              {(m.status === 'stopped' || (!m.isError && looksTruncated(m.text))) && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (isGenerating) return;
                                    const idx = activeChat.msgs.findIndex(
                                      (x) => x.id === m.id
                                    );
                                    if (idx > 0) {
                                      const priorMsgs = activeChat.msgs.slice(0, idx);
                                      streamAIResponse(
                                        activeChat.id,
                                        priorMsgs,
                                        undefined,
                                        undefined,
                                        { id: m.id, prefixText: m.text }
                                      );
                                    }
                                  }}
                                  className="msg-action text-[var(--primary)] font-medium"
                                  title="Continue generating remainder of this answer"
                                >
                                  <Play className="w-3 h-3" />
                                  <span>Continue</span>
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => {
                                  if (isGenerating) return;
                                  const idx = activeChat.msgs.findIndex(
                                    (x) => x.id === m.id
                                  );
                                  if (idx > 0) {
                                    const trimmed = activeChat.msgs.slice(
                                      0,
                                      idx
                                    );
                                    setChats((prev) =>
                                      prev.map((c) =>
                                        c.id === activeChat.id
                                          ? { ...c, msgs: trimmed }
                                          : c
                                      )
                                    );
                                    streamAIResponse(
                                      activeChat.id,
                                      trimmed
                                    );
                                  }
                                }}
                                className="msg-action"
                              >
                                <RotateCcw className="w-3 h-3" />
                                <span>Retry</span>
                              </button>

                              {/* Bilingual TTS controls (Speak / Pause / Resume / Stop) */}
                              <button
                                type="button"
                                data-testid="msg-tts-btn"
                                onClick={() => {
                                  if (speakingMsgId === m.id) {
                                    if (speechState === 'paused') {
                                      bilingualSpeechPlayer.resume();
                                    } else {
                                      bilingualSpeechPlayer.pause();
                                    }
                                  } else {
                                    speakText(m.text, m.id);
                                  }
                                }}
                                className="msg-action"
                                title={
                                  speakingMsgId === m.id
                                    ? speechState === 'paused'
                                      ? 'Resume speech'
                                      : 'Pause speech'
                                    : 'Read aloud (Bengali & English)'
                                }
                              >
                                {speakingMsgId === m.id && speechState === 'speaking' ? (
                                  <>
                                    <Pause className="w-3 h-3" />
                                    <span>Pause</span>
                                  </>
                                ) : (
                                  <>
                                    <Volume2 className="w-3 h-3" />
                                    <span>
                                      {speakingMsgId === m.id && speechState === 'paused'
                                        ? 'Resume'
                                        : 'Listen'}
                                    </span>
                                  </>
                                )}
                              </button>

                              {speakingMsgId === m.id && (
                                <button
                                  type="button"
                                  data-testid="msg-tts-stop-btn"
                                  onClick={() => bilingualSpeechPlayer.stop()}
                                  className="msg-action text-rose-400"
                                  title="Stop speech"
                                >
                                  <Square className="w-2.5 h-2.5 fill-current" />
                                  <span>Stop</span>
                                </button>
                              )}
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  if (isGenerating) return;
                                  const idx = activeChat.msgs.findIndex(
                                    (x) => x.id === m.id
                                  );
                                  if (idx >= 0) {
                                    setInputText(m.text);
                                    setChats((prev) =>
                                      prev.map((c) =>
                                        c.id === activeChat.id
                                          ? {
                                              ...c,
                                              msgs: c.msgs.slice(0, idx),
                                            }
                                          : c
                                      )
                                    );
                                  }
                                }}
                                className="msg-action"
                              >
                                <Edit2 className="w-3 h-3" />
                                <span>Edit</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  navigator.clipboard?.writeText(m.text);
                                  showToast('Copied');
                                }}
                                className="msg-action"
                              >
                                <Copy className="w-3 h-3" />
                                <span>Copy</span>
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  );
                })}

                {/* Live, honest pipeline status before the first answer token */}
                {isWaitingFirstToken && (
                  <div className="msg-row is-ai">
                    <div className="msg-ai-head">
                      <span className="msg-ai-model">{activeModelLabel}</span>
                    </div>
                    <div className="gen-status" role="status" aria-live="polite">
                      <span className="typing-dots" aria-hidden="true">
                        <i />
                        <i />
                        <i />
                      </span>
                      <span className="gen-status-label">
                        {genStepDetail || GEN_PHASE_LABEL[genPhase || 'connecting']}
                        <span className="gen-status-ellipsis" aria-hidden="true">…</span>
                      </span>
                    </div>
                  </div>
                )}
              </div>
                )}
              </div>

              {showScrollBottomBtn && activeChat.msgs.length > 0 && (
                <div className="flex justify-center -mt-9 mb-1 relative z-20 pointer-events-none">
                  <button
                    type="button"
                    onClick={() => scrollToBottom(true)}
                    className="scroll-down-btn pointer-events-auto"
                  >
                    <ChevronDown className="w-4 h-4" />
                    <span>Latest</span>
                  </button>
                </div>
              )}
            </div>

            {/* VARIATION 2 COMPOSER & FOOTER METADATA */}
            <div>
              <section className="composer-wrap">
                {/* Active Multi-Step Task Execution Planner */}
                {activeTaskPlan && (
                  <div className="w-full max-w-[850px] mb-3">
                    <TaskExecutionPanel
                      plan={activeTaskPlan}
                      onChangePlan={(updated) => setActiveTaskPlan(updated)}
                      onDismiss={() => setActiveTaskPlan(null)}
                    />
                  </div>
                )}

                {/* Manual Provider Switch Alert Banner (when active provider hits rate limit / quota / error) */}
                {providerLimitBanner && (
                  <div className="limit-banner w-full max-w-[780px] mb-3 flex flex-col gap-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2 text-xs">
                        <AlertTriangle className="limit-banner-icon w-4 h-4 shrink-0 mt-0.5" />
                        <div>
                          <div className="limit-banner-title">
                            এই AI এখন উত্তর দিতে পারছে না
                          </div>
                          <p className="limit-banner-text">
                            {providerLimitBanner.message}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setProviderLimitBanner(null)}
                        className="icon-btn"
                        title="Dismiss"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      <span className="limit-banner-label">
                        অন্যটা বেছে নিন:
                      </span>
                      {savedProfiles
                        .filter((p) => p.id !== providerLimitBanner.profileId)
                        .map((prof) => (
                          <button
                            key={prof.id}
                            type="button"
                            onClick={() => handleSelectProfile(prof)}
                            className="hdr-btn limit-banner-chip"
                          >
                            <Zap className="w-3 h-3" />
                            <span>
                              {prof.name} ({prof.externalModel || 'default'})
                            </span>
                          </button>
                        ))}
                    </div>
                  </div>
                )}

                {/* Connected services row — only shown once a service is actually linked */}
                {Object.values(connections || {}).some((c: any) => c && c.connected) && (
                <div className="w-full max-w-[850px]">
                  <ChatConnectedServicesToolbar
                    connections={connections}
                    onChangeConnections={handleUpdateConnections}
                    serviceContext={activeChat.serviceContext}
                    onChangeServiceContext={handleUpdateActiveChatServiceContext}
                    onQuickPrompt={(promptText, updatedContext) => {
                      if (updatedContext) {
                        handleUpdateActiveChatServiceContext(updatedContext);
                      }
                      void handleSend(promptText);
                    }}
                    onOpenIntegrationsHub={() => setConnectionsOpen(true)}
                    notify={showToast}
                  />
                </div>
                )}

                {/* Professional composer (v18.4.0) */}
                <div className="composer">
                  {/* Attachment Previews Inside Composer */}
                  {(pendingImgs.length > 0 || pendingFiles.length > 0) && (
                    <div className="flex flex-wrap items-center gap-2 pb-2.5 mb-2 border-b border-[var(--border)]">
                      {pendingImgs.map((im, idx) => (
                        <div key={idx} className="relative w-12 h-12">
                          <img
                            src={im.url}
                            alt="Pending attachment"
                            className="w-full h-full object-cover rounded-xl border border-[var(--border)]"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setPendingImgs((prev) =>
                                prev.filter((_, i) => i !== idx)
                              )
                            }
                            className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-[var(--ink)] text-[var(--bg)] rounded-full flex items-center justify-center text-[10px] cursor-pointer"
                          >
                            <X className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      ))}
                      {pendingFiles.map((f, idx) => (
                        <div
                          key={idx}
                          title={f.summary || f.name}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[var(--surface-2)] border border-[var(--border)] rounded-xl text-xs text-[var(--ink)] max-w-full"
                        >
                          <FileText className="w-3.5 h-3.5 text-[var(--primary)] shrink-0" />
                          <div className="flex flex-col min-w-0">
                            <span className="truncate max-w-[140px] sm:max-w-[220px] text-[11px] font-medium">
                              {f.name}
                            </span>
                            {f.summary && (
                              <span className="text-[10px] text-[var(--ink-dim)] truncate max-w-[140px] sm:max-w-[220px]">
                                {f.summary}
                              </span>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              setPendingFiles((prev) =>
                                prev.filter((_, i) => i !== idx)
                              )
                            }
                            className="text-[var(--ink-dim)] hover:text-rose-500 cursor-pointer ml-1 shrink-0"
                            aria-label={`Remove ${f.name}`}
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* v18.6.0 — loaded ZIP project: run it, download it, or ask the AI to edit it */}
                  {project && (
                    <div className="project-chip">
                      <FileArchive className="w-4 h-4 shrink-0 text-[var(--primary)]" />
                      <div className="project-chip-main">
                        <span className="project-chip-name">{project.name}</span>
                        <span className="project-chip-meta">
                          {project.files.length} files
                          {project.entry ? ` · ${project.entry}` : ''}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="project-chip-btn"
                        onClick={handleRunProject}
                        title="Run in Live Preview"
                      >
                        <Play className="w-3 h-3" />
                        Run
                      </button>
                      <button
                        type="button"
                        className="project-chip-btn"
                        onClick={() => downloadZipProject(project)}
                        title="Download the updated .zip"
                      >
                        <Download className="w-3 h-3" />
                        .zip
                      </button>
                      <button
                        type="button"
                        className="project-chip-btn is-ghost"
                        onClick={() => setProject(null)}
                        title="Close this project"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  )}

                  {/* V2 Daily Quota Warning / Limit Banner (only when V2 model selected & >=80% or blocked) */}
                  {activeIsV2 &&
                    activeV2QuotaStatus &&
                    (activeV2QuotaStatus.isWarning ||
                      activeV2QuotaStatus.isBlocked) && (
                      <div
                        data-testid="v2-quota-alert-banner"
                        className={`mb-2 px-3 py-2 rounded-xl border text-xs flex items-center justify-between gap-2 ${
                          activeV2QuotaStatus.isBlocked
                            ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                            : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                        }`}
                      >
                        <span className="truncate">
                          {activeV2QuotaStatus.blockedMessage ||
                            activeV2QuotaStatus.warningMessage}
                        </span>
                        <span className="text-[10px] font-mono shrink-0 opacity-80">
                          {activeV2QuotaStatus.statusText}
                        </span>
                      </div>
                    )}

                  {/* Bilingual Voice Input Review Bar (editable in composer before send) */}
                  {(isListening || voiceReviewPending) && (
                    <div
                      data-testid="voice-review-bar"
                      className="mb-2 px-3 py-1.5 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] flex flex-wrap items-center justify-between gap-2 text-xs"
                    >
                      <div className="flex items-center gap-2 text-[var(--text-2)]">
                        <Mic
                          className={`w-3.5 h-3.5 ${
                            isListening ? 'text-rose-400 animate-pulse' : 'text-[var(--primary)]'
                          }`}
                        />
                        <span>
                          {isListening
                            ? 'Listening... speak naturally'
                            : 'Review & edit captured voice before sending'}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {(['auto', 'bn-BD', 'en-US'] as VoiceLangMode[]).map(
                          (lng) => (
                            <button
                              key={lng}
                              type="button"
                              onClick={() => setVoiceLangMode(lng)}
                              className={`px-2 py-0.5 rounded-md text-[10px] font-medium cursor-pointer ${
                                voiceLangMode === lng
                                  ? 'bg-[var(--primary)] text-white'
                                  : 'bg-[var(--surface)] text-[var(--ink-dim)] hover:text-[var(--ink)]'
                              }`}
                            >
                              {lng === 'auto'
                                ? 'Auto'
                                : lng === 'bn-BD'
                                  ? 'বাংলা'
                                  : 'English'}
                            </button>
                          )
                        )}
                        {voiceReviewPending && (
                          <button
                            type="button"
                            onClick={() => setVoiceReviewPending(false)}
                            className="p-0.5 text-[var(--ink-dim)] hover:text-[var(--ink)] cursor-pointer"
                            title="Dismiss voice notice"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Textarea */}
                  <div className="composer-input-wrap">
                  <textarea
                    ref={composerRef}
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onPaste={(e) => {
                      const items = e.clipboardData?.items;
                      if (!items) return;
                      const pastedFiles: File[] = [];
                      for (const it of items) {
                        const file = it.getAsFile();
                        if (file) {
                          pastedFiles.push(file);
                        }
                      }
                      if (pastedFiles.length > 0) {
                        e.preventDefault();
                        handleProcessIncomingFiles(pastedFiles);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (
                        e.key === 'Enter' &&
                        ((settings.sendOnEnter && !e.shiftKey) ||
                          e.ctrlKey ||
                          e.metaKey)
                      ) {
                        e.preventDefault();
                        handleSend();
                      } else if (
                        e.key === 'ArrowUp' &&
                        !inputText &&
                        sentHistoryRef.current.length > 0
                      ) {
                        e.preventDefault();
                        if (histIdxRef.current < 0) {
                          histIdxRef.current = sentHistoryRef.current.length;
                        }
                        histIdxRef.current = Math.max(
                          0,
                          histIdxRef.current - 1
                        );
                        setInputText(
                          sentHistoryRef.current[histIdxRef.current] || ''
                        );
                      }
                    }}
                    placeholder={`Ask ${
                      activeIsBuiltin
                        ? activeModelLabel
                        : activeDisplayName === 'Msfta shop ai'
                          ? activeModelLabel
                          : activeDisplayName
                    } anything…`}
                    className="w-full bg-transparent border-none outline-none resize-none text-[15.5px] text-[var(--ink)] placeholder:text-[var(--ink-dim)] min-h-[46px] max-h-[160px] leading-relaxed px-4 pt-3.5"
                  />
                  </div>

                  {/* Screenshot 1 Unified Composer Toolbar: [+  Model Pill  ...  Mic  Terracotta ↑] */}
                  <div className="composer-bar">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="composer-icon"
                        title="Attach photo or file"
                      >
                        <Plus className="w-5 h-5" />
                      </button>

                      <button
                        type="button"
                        data-testid="model-selector-btn"
                        onClick={() => {
                          setMoreModelsOpen(!activeIsBuiltin);
                          setBottomModelMenuOpen((v) => !v);
                        }}
                        className="composer-model"
                        title="Select Model"
                      >
                        <span className="truncate">{activeModelLabel}</span>
                        <ChevronDown className="w-3.5 h-3.5 opacity-60 shrink-0" />
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          if (!isToolEnabled('web_search', settings.enabledTools)) {
                            showToast('Web search tool is disabled in Settings → Tools.');
                            return;
                          }
                          setWebSearch((w) => {
                            showToast(!w ? 'Web search on' : 'Web search off');
                            return !w;
                          });
                        }}
                        className={`composer-icon composer-icon-web ${
                          webSearch && isToolEnabled('web_search', settings.enabledTools)
                            ? 'is-on'
                            : ''
                        }`}
                        title={
                          !isToolEnabled('web_search', settings.enabledTools)
                            ? 'Web Search disabled in Settings → Tools'
                            : webSearch
                              ? 'Web Search active'
                              : 'Enable Web Search'
                        }
                      >
                        <Globe className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={toggleMic}
                        className={`composer-icon ${isListening ? 'is-on' : ''}`}
                        title={isListening ? 'Stop Listening' : 'Voice Input'}
                      >
                        <Mic className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        data-testid="send-btn"
                        onClick={() => {
                          if (isGenerating) {
                            abortRef.current?.abort();
                          } else {
                            handleSend();
                          }
                        }}
                        className={`composer-send${inputText.trim() || isGenerating ? ' is-ready' : ''}`}
                        title={
                          isGenerating ? 'Stop generation' : 'Send message'
                        }
                        aria-label={isGenerating ? 'Stop generating' : 'Send message'}
                      >
                        {isGenerating ? (
                          <Square className="w-4 h-4 fill-current" />
                        ) : (
                          <ArrowUp className="w-4 h-4 stroke-[2.4]" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Screenshot 4 Bottom-Sheet "Select model" Modal */}
                {bottomModelMenuOpen && (
                  <div
                    className="ref-sheet-backdrop"
                    onClick={() => setBottomModelMenuOpen(false)}
                  >
                    <div
                      data-testid="model-menu-popover"
                      className="ref-sheet space-y-4"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="ref-sheet-head">
                        <button
                          type="button"
                          onClick={() => setBottomModelMenuOpen(false)}
                          className="ref-sheet-close"
                          aria-label="Close model selector"
                        >
                          <X className="w-5 h-5" />
                        </button>
                        <div className="ref-sheet-title">Select model</div>
                      </div>

                      {/* Primary Model Group (V2 Special) */}
                      <div className="ref-sheet-group">
                        {[...V2_SPECIAL_MODELS]
                          .sort((a, b) => {
                            const order = { 'smfta-max': 0, 'smfta-v2-pro': 1, 'smfta-v5': 2 } as Record<string, number>;
                            return (order[a.id] ?? 9) - (order[b.id] ?? 9);
                          })
                          .map((spec) => {
                            const isSelectedV2 =
                              activeIsBuiltin && activeModelName === spec.id;
                            const qStat = getV2QuotaStatusForModel(spec.id);
                            const tagText =
                              spec.id === 'smfta-max'
                                ? qStat.isUnlimited
                                  ? 'Max'
                                  : 'Pro or Max'
                                : spec.id === 'smfta-v2-pro'
                                  ? 'Pro'
                                  : null;
                            return (
                              <button
                                key={spec.id}
                                type="button"
                                data-testid={`select-model-${spec.id}`}
                                onClick={() => {
                                  handleSelectModel(spec.id);
                                  setBottomModelMenuOpen(false);
                                }}
                                className="ref-sheet-row"
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2">
                                    <span className="ref-sheet-row-title truncate">
                                      {spec.label}
                                    </span>
                                    {tagText && (
                                      <span className="ref-sheet-tag">{tagText}</span>
                                    )}
                                  </div>
                                  <div className="ref-sheet-row-desc truncate">
                                    {spec.desc}
                                  </div>
                                </div>
                                {isSelectedV2 ? (
                                  <Check className="w-5 h-5 text-[var(--accent-sky)] shrink-0" />
                                ) : (
                                  <span className="text-[11px] text-[var(--ink-dim)] font-mono shrink-0">
                                    {qStat.isUnlimited
                                      ? '∞'
                                      : qStat.isTestingBypass
                                        ? qStat.testingRemaining
                                        : `${qStat.remaining}/${qStat.limit}`}
                                  </span>
                                )}
                              </button>
                            );
                          })}
                      </div>

                      {/* Footnote Caption matching Screenshot 4 */}
                      <div className="px-1 text-[13px] leading-snug text-[var(--ink-dim)]">
                        {isV2AuthorizedTester
                          ? 'Admin Unlimited active with zero daily limits. '
                          : `Daily limits reset in ${v2ResetInfo.label}. `}
                        <button
                          type="button"
                          onClick={() => {
                            setBottomModelMenuOpen(false);
                            setSettingsTab('providers');
                            setSettingsOpen(true);
                          }}
                          className="underline text-[var(--ink-muted)] hover:text-[var(--ink)] cursor-pointer"
                        >
                          Learn more
                        </button>
                      </div>

                      {/* Effort / Processing Mode Row matching Screenshot 4 */}
                      <div className="ref-sheet-group">
                        <button
                          type="button"
                          onClick={() => {
                            const order: AppSettings['mode'][] = ['fast', 'balanced', 'power'];
                            const nextMode =
                              order[(order.indexOf(settings.mode) + 1) % order.length] ||
                              'balanced';
                            setSettings((prev) => {
                              const next = sanitizeSettings({ ...prev, mode: nextMode });
                              if (activeIsBuiltin && !activeIsV2) {
                                next.externalModel = builtinTierForModel(
                                  null,
                                  nextMode
                                ).model;
                              }
                              return next;
                            });
                            if (activeIsBuiltin && !activeIsV2 && activeProfile) {
                              const tierModel = builtinTierForModel(
                                null,
                                nextMode
                              ).model;
                              handleUpdateProfiles(
                                savedProfiles.map((p) =>
                                  p.id === activeProfile.id
                                    ? { ...p, externalModel: tierModel }
                                    : p
                                )
                              );
                            }
                          }}
                          className="ref-sheet-row"
                        >
                          <div className="flex items-center gap-2.5">
                            <span className="ref-sheet-row-title">Effort</span>
                            <span className="ref-sheet-tag">Recommended</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-[14px] text-[var(--ink-dim)]">
                            <span>
                              {settings.mode === 'fast'
                                ? 'Low'
                                : settings.mode === 'power'
                                  ? 'High'
                                  : 'Medium'}
                            </span>
                            <ChevronRight className="w-4 h-4" />
                          </div>
                        </button>
                      </div>

                      {/* More Models (V1 Natural + Custom Providers + Firestore Sync) */}
                      <div className="ref-sheet-group">
                        <button
                          type="button"
                          onClick={() => setMoreModelsOpen((v) => !v)}
                          className="ref-sheet-row"
                        >
                          <span className="ref-sheet-row-title">More models</span>
                          <ChevronRight
                            className={`w-4 h-4 text-[var(--ink-dim)] transition-transform ${
                              moreModelsOpen ? 'rotate-90' : ''
                            }`}
                          />
                        </button>

                        {moreModelsOpen && (
                          <div className="border-t border-[var(--border)] bg-[var(--surface)]/50">
                            <div className="px-4 pt-2.5 pb-1 text-[11px] font-medium text-[var(--ink-dim)]">
                              V1 – Natural
                            </div>
                            {BUILTIN_TIERS.map((tier) => {
                              const isSelectedTier =
                                activeIsBuiltin &&
                                !activeIsV2 &&
                                activeModelName === tier.model;
                              return (
                                <button
                                  key={tier.model}
                                  type="button"
                                  data-testid={`select-model-${tier.model}`}
                                  onClick={() => {
                                    if (!activeIsBuiltin) {
                                      const builtinProf =
                                        savedProfiles.find((p) =>
                                          isBuiltinProviderId(p.provider)
                                        ) || DEFAULT_BUILTIN_PROFILE;
                                      handleSelectProfile({
                                        ...builtinProf,
                                        externalModel: tier.model,
                                      });
                                    }
                                    handleSelectModel(tier.model);
                                    setBottomModelMenuOpen(false);
                                  }}
                                  className="ref-sheet-row"
                                >
                                  <div className="min-w-0 flex-1">
                                    <div className="ref-sheet-row-title truncate">
                                      {tier.label}
                                    </div>
                                    <div className="ref-sheet-row-desc truncate">
                                      {tier.desc}
                                    </div>
                                  </div>
                                  {isSelectedTier && (
                                    <Check className="w-5 h-5 text-[var(--accent-sky)] shrink-0" />
                                  )}
                                </button>
                              );
                            })}

                            {savedProfiles
                              .filter(
                                (p) =>
                                  !isBuiltinProviderId(p.provider) &&
                                  p.enabled !== false
                              )
                              .map((customProf) => {
                                const vModels = getModelsForProfile(customProf);
                                if (vModels.length === 0) return null;
                                return (
                                  <div key={customProf.id} className="border-t border-[var(--border)]">
                                    <div className="px-4 pt-2.5 pb-1 text-[11px] font-medium text-[var(--ink-dim)] flex items-center justify-between">
                                      <span className="truncate">{customProf.name}</span>
                                      <span>
                                        {customProf.verified || customProf.verificationStatus === 'verified'
                                          ? 'Verified'
                                          : 'Custom'}
                                      </span>
                                    </div>
                                    {vModels.map((mId) => {
                                      const isSelectedCustom =
                                        !activeIsBuiltin &&
                                        activeProfile?.id === customProf.id &&
                                        activeModelName === mId;
                                      return (
                                        <button
                                          key={`${customProf.id}-${mId}`}
                                          type="button"
                                          onClick={() => {
                                            handleSelectProfile({
                                              ...customProf,
                                              externalModel: mId,
                                            });
                                            setBottomModelMenuOpen(false);
                                          }}
                                          className="ref-sheet-row"
                                        >
                                          <span className="text-[14px] font-mono truncate">
                                            {mId}
                                          </span>
                                          {isSelectedCustom && (
                                            <Check className="w-5 h-5 text-[var(--accent-sky)] shrink-0" />
                                          )}
                                        </button>
                                      );
                                    })}
                                  </div>
                                );
                              })}

                            <div className="px-4 py-3 border-t border-[var(--border)] flex items-center justify-between gap-2 text-xs">
                              <span className="text-[var(--ink-dim)] truncate">
                                {firebaseUser
                                  ? `Synced: ${firebaseUser.email || firebaseUser.displayName || 'Account'}`
                                  : 'Firestore Sync: Sign in to sync'}
                              </span>
                              {firebaseUser ? (
                                <button
                                  type="button"
                                  data-testid="firebase-signout-btn"
                                  onClick={() => void signOutFromFirebase()}
                                  className="px-2.5 py-1 rounded-full bg-[var(--surface-3)] text-[var(--ink)] cursor-pointer shrink-0"
                                >
                                  Sign out
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  data-testid="firebase-signin-btn"
                                  onClick={() =>
                                    void signInWithFirebaseGoogle().catch((e) =>
                                      showToast(
                                        e instanceof Error
                                          ? e.message
                                          : 'Sign-in cancelled'
                                      )
                                    )
                                  }
                                  className="px-3 py-1 rounded-full bg-[var(--primary)] text-white font-medium cursor-pointer shrink-0"
                                >
                                  Sync
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

              </section>

              <input
                ref={fileInputRef}
                type="file"
                multiple
                onChange={handlePickFiles}
                className="hidden"
              />
            </div>
          </main>
        )}
      </div>

      {/* MODALS */}
      <ImageStudioModal
        isOpen={studioOpen}
        onClose={() => setStudioOpen(false)}
        onGenerate={(prompt, style, size) =>
          handleRunImageGen(prompt, style, size)
        }
      />

      <CodeLabModal
        isOpen={codeLabOpen}
        initialCode={codeLabInit}
        onClose={() => setCodeLabOpen(false)}
      />

      <BattleArenaModal
        isOpen={battleOpen}
        onClose={() => setBattleOpen(false)}
        onToast={showToast}
      />

      <StatsAndWhatsNewModal
        mode={infoModal}
        onClose={() => setInfoModal(null)}
        chats={chats}
        usageToday={usageToday}
      />

      <VoiceCallOverlay
        isOpen={voiceCallOpen}
        isListening={isListening}
        isGenerating={isGenerating}
        lastUserText={lastUserMessage}
        lastAiText={lastAiMessage}
        onToggleMic={toggleMic}
        onEndCall={() => {
          setVoiceCallOpen(false);
          window.speechSynthesis?.cancel();
        }}
      />

      {/* Settings Hub Modal (Opened cleanly from Header Three-Dot Menu) */}
      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        initialTab={settingsTab}
        profile={profile}
        settings={settings}
        memory={memory}
        savedProfiles={savedProfiles}
        onUpdateProfiles={handleUpdateProfiles}
        onSelectProfile={handleSelectProfile}
        onSave={(newProfile, newSettings) => {
          setProfile(newProfile);
          setSettings(sanitizeSettings(newSettings));
          showToast('Settings saved');
        }}
        onResetSettings={() => {
          setSettings({ ...DEFAULT_SETTINGS });
          showToast('Settings reset to defaults');
        }}
        onUpdateMemory={(next) => {
          const migrated = factsToText(migrateMemory(next).facts, MEMORY_MAX);
          memoryRef.current = migrated;
          setMemory(migrated);
        }}
        onClearMemory={() => {
          forgetAllMemory();
          if (firebaseUser && firebaseUser.emailVerified) {
            void clearAllFirestoreMemories(firebaseUser).catch(() => {});
          }
        }}
        onExportBackup={handleExportBackup}
        onImportBackup={handleImportBackup}
        onSaveRollbackPoint={handleSaveRollbackPoint}
        onRollback={handleRollback}
        hasRollbackPoint={Boolean(
          typeof window !== 'undefined' && localStorage.getItem(LS_KEYS.rollback)
        )}
        onClearAllData={handleFullClearAllData}
        onOpenWhatsNew={() => setInfoModal('whatsnew')}
        connections={connections}
        onUpdateConnections={handleUpdateConnections}
        notes={notes}
        onOpenNotebook={() => setNotebookOpen(true)}
        selfWidgets={selfWidgets}
        onUpdateWidgets={setSelfWidgets}
        onOpenWidget={(w) => setActiveWidgetModal(w)}
        notify={showToast}
        onBackupToGithub={handleBackupToGithub}
        skills={skills}
        onUpdateSkills={setSkills}
        autonomy={autonomy}
        onAutonomyChange={setAutonomy}
        onSelfRepair={handleSelfRepair}
        onProviderTestResult={setProviderTestStatus}
        keystoreEphemeral={keystoreEphemeral}
        usageToday={usageToday}
      />

      {/* Image Lightbox */}
      {lightboxImg && (
        <div
          onClick={() => setLightboxImg(null)}
          className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-6 cursor-zoom-out"
        >
          <img
            src={lightboxImg}
            alt="Zoomed preview"
            className="max-w-full max-h-full rounded-2xl shadow-2xl"
          />
        </div>
      )}
    </div>
  );
}
