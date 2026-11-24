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
  ThumbsUp,
  ThumbsDown,
  Eye,
  EyeOff,
  Brain,
  KeyRound,
  AudioLines,
  GitBranch,
  NotebookPen,
  Swords,
  BarChart3,
  Plug,
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
  DataBridgeConfig,
  DbConnectionConfig,
  ImageAttachment,
  InlineRevision,
  KnowledgeDocument,
  McpServerConfig,
  NotebookNote,
  ProviderTestStatus,
  SavedProviderProfile,
  SelfUpdatePayload,
  SelfUpdateWidget,
  TelemetryRequestLog,
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
import { stripContactTokensForText } from './utils/creatorIdentity';
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
  resolveModelForSlot,
  SAVED_PROFILES_KEY,
  formatProviderErrorBn,
  validateGeminiApiKeyFormat,
} from './utils/providers';
import {
  decryptSecret,
  encryptSecret,
  ensureKeystore,
  isEncrypted,
  rotateKeystoreMasterKey,
} from './utils/secureKeystore';
import {
  buildExportEnvelope,
  parseImportPayload,
  sanitizeSettingsForExport,
} from './utils/exportData';
import {
  InteractiveMessageContent,
  extractThinkingAndResponse,
} from './components/InteractiveMessageContent';
import {
  ClaudeArtifactPanel,
  ArtifactPayload,
} from './components/ClaudeArtifactPanel';
import {
  extractFileArtifacts,
  FileArtifactItem,
} from './utils/fileArtifacts';
import { SimpleEntryModal } from './components/SimpleEntryModal';
import {
  loadSimpleEntryCredentials,
  SIMPLE_ENTRY_UNLOCKED_SESSION_KEY,
  SimpleEntryCredentials,
} from './utils/simpleEntryAuth';
import { VoiceWaveformBar } from './components/VoiceWaveformBar';
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
} from './components/ToolModals';
import {
  LiveVoiceOverlay,
  LiveVoiceMessageSnapshot,
  unlockSharedLiveAudioContext,
} from './components/LiveVoiceOverlay';
import { DiagramStudioModal } from './components/DiagramStudioModal';
import { CoWriterDrawer } from './components/CoWriterDrawer';
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
  mergeExtractedMemories,
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
  applySkillDirectiveToMessages,
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
  clearCloudChatSessions,
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
  stripWorkspaceSecrets,
  upsertCloudSession,
  wipeCloudWorkspace,
  loadDeletedChatIds,
  markChatDeleted,
} from './utils/cloudSync';
import {
  MCP_STORAGE_KEY,
  buildMcpPromptContext,
  loadMcpServers,
  saveMcpServers,
} from './utils/mcpClient';
import {
  DB_BRIDGE_CONFIG_STORAGE_KEY,
  DB_CONNECTIONS_STORAGE_KEY,
  loadDataBridgeConfig,
  loadDbConnections,
  saveDataBridgeConfig,
  saveDbConnections,
} from './utils/dbBridge';
import {
  buildKnowledgePromptContext,
  loadKnowledgeDocuments,
  saveKnowledgeDocuments,
} from './utils/knowledgeBase';
import {
  TELEMETRY_LOG_KEY,
  appendTelemetryLog,
  clearTelemetryLogs,
  loadTelemetryLogs,
} from './utils/telemetryLog';
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
  ensureFirestoreUserProfile,
  syncConversationToFirestore,
  subscribeToFirestoreConversations,
  saveMemoryFactToFirestore,
  subscribeToFirestoreMemories,
  clearAllFirestoreMemories,
  subscribeToFirestoreV2Usage,
  saveSessionMessageToFirestore,
  selectRelevantFirestoreMemories,
  isAuthorizedTestingUser,
  FirestoreUsageSnapshot,
  deleteConversationFromFirestore,
  clearAllFirestoreConversations,
} from './utils/firebaseV2Client';
import { sortV2ModelsFlashFirst } from './utils/v2UsageLimits';
import { buildFirestoreChatSyncSignature } from './utils/firestorePayloadHelpers';
import {
  accumulateSpeechResults,
  bilingualSpeechPlayer,
  blobToBase64Data,
  isMediaRecorderSupported,
  isSpeechRecognitionSupported,
  isVoiceInputSupported,
  mergeVoiceLiveTranscript,
  pickSupportedAudioMimeType,
  requestServerVoiceTranscription,
  resolveRecognitionLanguage,
  resolveTtsVoicePersona,
  shouldPollRollingVoiceTranscript,
  VoiceLangMode,
} from './utils/voiceEngine';
import { deriveInitialThinkingTopic } from './utils/thinking';
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
    const hydrated = sanitizeSettings({
      theme: 'dark',
      accent: 'indigo',
      ...saved,
      webSearchDefault: false,
    });
    if (hydrated.thinkingMode === 'off' || hydrated.thinkingEnabled === false) {
      hydrated.thinkingEnabled = true;
      hydrated.thinkingMode = 'medium';
    }
    return hydrated;
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
        if (sealedSettingsKey && isEncrypted(sealedSettingsKey)) {
          try {
            const plain = await decryptSecret(sealedSettingsKey);
            if (!cancelled && plain) {
              setSettings((s) =>
                s.externalKeys === sealedSettingsKey
                  ? { ...s, externalKeys: plain }
                  : s
              );
            }
          } catch {
            if (!cancelled) {
              const targetLabel =
                settings.displayName || settings.provider || 'Saved Key';
              setDecryptionAlertProfileName(targetLabel);
              setProviderTestStatus({
                ok: false,
                message: 'সেভ করা কী পড়া যাচ্ছে না, আবার কী দিন',
                testedAt: Date.now(),
                provider: settings.provider,
              });
              showToast('সেভ করা কী পড়া যাচ্ছে না, আবার কী দিন', 5500);
            }
          }
        }
        const profiles = await hydrateSavedProfiles();
        if (!cancelled && profiles.length > 0) {
          setSavedProfiles(profiles);
          const failedProf = profiles.find((p) => p.decryptionFailed);
          if (failedProf) {
            setDecryptionAlertProfileName(failedProf.name || failedProf.provider);
            showToast('সেভ করা কী পড়া যাচ্ছে না, আবার কী দিন', 5500);
          }
        }
        const [loadedMcp, loadedDb, loadedKb] = await Promise.all([
          loadMcpServers().catch(() => []),
          loadDbConnections().catch(() => []),
          loadKnowledgeDocuments().catch(() => []),
        ]);
        if (!cancelled) {
          setMcpServers(loadedMcp);
          setDbConnections(loadedDb);
          setKnowledgeDocs(loadedKb);
        }
      } catch {
        if (!cancelled) {
          setKeystoreEphemeral(true);
          showToast('সিকিউর কী-স্টোর খুলতে সমস্যা হয়েছে, প্রয়োজনে কী আবার দিন', 5000);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [chats, setChats] = useState<ChatSession[]>(() => {
    const saved = loadJSON<ChatSession[]>(LS_KEYS.chats, []);
    const deletedIds = new Set(loadDeletedChatIds());
    const freshSession: ChatSession = {
      id: Date.now(),
      title: 'New Chat',
      msgs: [],
    };
    const historySessions = Array.isArray(saved)
      ? saved.filter(
          (c) =>
            c &&
            !c.incognito &&
            !deletedIds.has(c.id) &&
            Array.isArray(c.msgs) &&
            c.msgs.length > 0
        )
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
  const [activeArtifact, setActiveArtifact] = useState<ArtifactPayload | null>(
    null
  );
  const [simpleEntryCreds, setSimpleEntryCreds] =
    useState<SimpleEntryCredentials | null>(() => loadSimpleEntryCredentials());
  const [simpleEntryModalOpen, setSimpleEntryModalOpen] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const params = new URLSearchParams(window.location.search);
    if (params.get('autostart') === '1') return false;
    if (params.get('entry') === '1') return true;
    try {
      const unlocked =
        sessionStorage.getItem(SIMPLE_ENTRY_UNLOCKED_SESSION_KEY) === '1';
      if (unlocked) return false;
      const rawSettings = localStorage.getItem(LS_KEYS.settings);
      if (rawSettings) {
        const parsed = JSON.parse(rawSettings);
        if (parsed?.simpleEntryRequireOnLoad === true) return true;
      }
    } catch {
      // ignore
    }
    return false;
  });
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

  const [mcpServers, setMcpServers] = useState<McpServerConfig[]>([]);
  const [dbConnections, setDbConnections] = useState<DbConnectionConfig[]>([]);
  const [dataBridgeConfig, setDataBridgeConfig] = useState<DataBridgeConfig>(() =>
    loadDataBridgeConfig()
  );
  const [knowledgeDocs, setKnowledgeDocs] = useState<KnowledgeDocument[]>([]);
  const [telemetryLogs, setTelemetryLogs] = useState<TelemetryRequestLog[]>(() =>
    loadTelemetryLogs()
  );
  const activeStreamCountRef = useRef(0);

  const handleUpdateMcpServers = (next: McpServerConfig[]) => {
    setMcpServers(next);
    void saveMcpServers(next).catch(() => {});
  };

  const handleUpdateDbConnections = (next: DbConnectionConfig[]) => {
    setDbConnections(next);
    void saveDbConnections(next).catch(() => {});
  };

  const handleUpdateDataBridgeConfig = (next: DataBridgeConfig) => {
    setDataBridgeConfig(next);
    saveDataBridgeConfig(next);
  };

  const handleUpdateKnowledgeDocs = (next: KnowledgeDocument[]) => {
    setKnowledgeDocs(next);
    void saveKnowledgeDocuments(next).catch(() => {});
  };

  const handleClearTelemetryLogs = () => {
    clearTelemetryLogs();
    setTelemetryLogs([]);
  };

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
      return null;
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
  const prevActiveIdRef = useRef<number>(activeId);
  useEffect(() => {
    if (prevActiveIdRef.current !== activeId) {
      prevActiveIdRef.current = activeId;
      setPendingImgs([]);
      setPendingFiles([]);
    }
  }, [activeId]);
  // v18.6.0 — a loaded .zip project: the assistant can edit exact paths and
  // hand back a repacked archive.
  const [project, setProject] = useState<Project | null>(null);
  const [webSearch, setWebSearch] = useState(false);
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
  const [diagramOpen, setDiagramOpen] = useState(false);
  const [coWriterOpen, setCoWriterOpen] = useState(false);
  const [coWriterTitle, setCoWriterTitle] = useState('Untitled Document');
  const [coWriterContent, setCoWriterContent] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTabId>('general');
  const [infoModal, setInfoModal] = useState<'stats' | 'whatsnew' | null>(null);
  const [cmdkOpen, setCmdkOpen] = useState(false);
  const [cmdkQuery, setCmdkQuery] = useState('');
  const [lightboxImg, setLightboxImg] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [speakingMsgId, setSpeakingMsgId] = useState<string | null>(null);
  const [speechState, setSpeechState] = useState<'idle' | 'speaking' | 'paused'>('idle');
  const [speechBackupActive, setSpeechBackupActive] = useState(false);
  const [decryptionAlertProfileName, setDecryptionAlertProfileName] = useState<string | null>(null);
  const backupNoticeMsgRef = useRef<string | null>(null);
  const [voiceLangMode, setVoiceLangMode] = useState<VoiceLangMode>('auto');
  const [voiceLiveText, setVoiceLiveText] = useState('');
  const [voiceActivityAt, setVoiceActivityAt] = useState(0);
  const [isTranscribingVoice, setIsTranscribingVoice] = useState(false);
  const [voiceAudioStream, setVoiceAudioStream] = useState<MediaStream | null>(null);

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
  const [feedbackReasonMsgId, setFeedbackReasonMsgId] = useState<string | null>(null);
  const [feedbackReasonInput, setFeedbackReasonInput] = useState('');

  const abortRef = useRef<AbortController | null>(null);
  const voiceCallOpenRef = useRef<boolean>(false);
  voiceCallOpenRef.current = voiceCallOpen;
  const voiceSilenceTimerRef = useRef<number | null>(null);
  const voiceDraftRef = useRef<string>('');
  const voiceFinalPrefixRef = useRef<string>('');
  const voiceSessionFinalRef = useRef<string>('');
  const voiceCancelledRef = useRef<boolean>(false);
  const voiceCommittedRef = useRef<boolean>(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaChunksRef = useRef<Blob[]>([]);
  const voiceStreamRef = useRef<MediaStream | null>(null);
  const voiceMimeRef = useRef<string>('audio/webm');
  const voiceRollingTimerRef = useRef<number | null>(null);
  const voiceRollingInFlightRef = useRef<boolean>(false);
  const voiceListeningRef = useRef<boolean>(false);
  const voiceWebSpeechTextRef = useRef<string>('');
  const voiceRollingTextRef = useRef<string>('');
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
      const backupOn = Boolean(st.isBackupVoice && st.status === 'speaking');
      setSpeechBackupActive(backupOn);
      if (backupOn && st.msgId && backupNoticeMsgRef.current !== st.msgId) {
        backupNoticeMsgRef.current = st.msgId;
        showToast('ব্যাকআপ ভয়েস চলছে', 3000);
      } else if (st.status === 'idle') {
        backupNoticeMsgRef.current = null;
      }
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
        void ensureFirestoreUserProfile(
          user,
          user.displayName || 'SMFTA User'
        ).catch(() => {});
        unsubConvs = subscribeToFirestoreConversations(user, (remoteSessions) => {
          setChats((prev) => {
            const deletedIds = new Set(loadDeletedChatIds());
            const byId = new Map(
              prev.filter((c) => !deletedIds.has(c.id)).map((c) => [c.id, c])
            );
            let changed = false;
            for (const rs of remoteSessions) {
              if (deletedIds.has(rs.id)) continue;
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

        unsubMems = subscribeToFirestoreMemories(user, (remoteFacts, meta) => {
          setMemory((prev) => {
            const merged = ensureMasterProfileMemory([...prev, ...remoteFacts]);
            memoryRef.current = merged;
            return merged;
          });
          if (!meta?.fromCache && masterSeededUidRef.current !== user.uid) {
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
      const deletedIds = new Set(loadDeletedChatIds());
      for (const session of chats) {
        if (!session.msgs || session.msgs.length === 0) continue;
        if (session.incognito || deletedIds.has(session.id)) continue;
        const sig = buildFirestoreChatSyncSignature(session);
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
        const uid =
          firebaseUser?.uid || simpleEntryCreds?.userId || 'default-user';
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
  }, [firebaseUser, simpleEntryCreds?.userId]);

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
          ? {
              ...prev,
              provider: isBuiltinProviderId(prev.provider)
                ? 'smfta_cloud'
                : prev.provider,
              externalModel: trimmed,
              mode: tier.id,
            }
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
              provider:
                (isV2 || Boolean(tier)) && isBuiltinProviderId(p.provider)
                  ? 'smfta_cloud'
                  : p.provider,
              externalModel: trimmed,
            }
          : p
      );
      handleUpdateProfiles(updated);
    }
    setBottomModelMenuOpen(false);
    showToast(
      tier
        ? `Model: ${tier.label} (চ্যাট মেমোরি অক্ষুণ্ণ আছে)`
        : isV2
          ? `V2 – Special: ${getV2ModelSpec(trimmed).label} (চ্যাট মেমোরি অক্ষুণ্ণ আছে)`
          : `Model: ${trimmed}`
    );
  };

  // Extract a previewable side-by-side ArtifactPayload from any AI message text
  const extractPreviewableArtifactFromMessage = React.useCallback(
    (rawMsgText: string): ArtifactPayload | null => {
      if (!rawMsgText || !rawMsgText.trim()) return null;
      const { cleanResponse } = extractThinkingAndResponse(rawMsgText);
      const textToScan = cleanResponse || rawMsgText;
      const { artifacts: fileArts } = extractFileArtifacts(textToScan, {
        isStreaming: false,
      });
      const codeBlocks = extractCodeBlocks(textToScan);

      const extMap: Record<string, string> = {
        html: 'index.html',
        htm: 'index.html',
        svg: 'graphic.svg',
        css: 'styles.css',
        scss: 'styles.css',
        javascript: 'script.js',
        js: 'script.js',
        typescript: 'script.ts',
        ts: 'script.ts',
        jsx: 'App.jsx',
        tsx: 'App.tsx',
        react: 'App.tsx',
      };

      const bundleFiles: FileArtifactItem[] = [...fileArts];
      codeBlocks.forEach((b, idx) => {
        if (!b.content.trim()) return;
        const lang = (b.lang || 'code').trim().toLowerCase();
        const baseExt = extMap[lang] || `snippet-${idx + 1}.txt`;
        const filename = bundleFiles.some((x) => x.filename === baseExt)
          ? `${idx + 1}-${baseExt}`
          : baseExt;
        bundleFiles.push({
          id: `auto-block-${idx}`,
          filename,
          lang,
          title: `${lang.toUpperCase()} Block ${idx + 1}`,
          content: b.content,
          isStreaming: false,
        });
      });

      const isUiPreviewable = (lang: string, code: string, fname?: string) => {
        const l = (lang || '').toLowerCase();
        const fn = (fname || '').toLowerCase();
        if (
          l === 'html' ||
          l === 'htm' ||
          l === 'svg' ||
          l === 'jsx' ||
          l === 'tsx' ||
          l === 'react' ||
          fn.endsWith('.html') ||
          fn.endsWith('.htm') ||
          fn.endsWith('.svg') ||
          fn.endsWith('.jsx') ||
          fn.endsWith('.tsx')
        ) {
          return true;
        }
        if (
          /<!doctype\s+html|<html[\s>]|<body[\s>]|<svg[\s>]|<div[\s>]/i.test(
            code
          )
        ) {
          return true;
        }
        if (
          /(?:export\s+default\s+function|function\s+[A-Z]\w*\s*\(|const\s+[A-Z]\w*\s*=\s*\([^)]*\)\s*=>)/.test(
            code
          ) &&
          /<[A-Za-z][\w.-]*[\s/>]/.test(code)
        ) {
          return true;
        }
        return false;
      };

      const primaryArt = fileArts.find((a) =>
        isUiPreviewable(a.lang, a.content, a.filename)
      );
      if (primaryArt) {
        return {
          title: primaryArt.title || primaryArt.filename,
          filename: primaryArt.filename,
          lang: primaryArt.lang,
          code: primaryArt.content,
          bundleFiles,
        };
      }

      const primaryBlock = codeBlocks.find((b) =>
        isUiPreviewable(b.lang, b.content)
      );
      if (primaryBlock) {
        const cleanLang = (primaryBlock.lang || 'html').toLowerCase();
        return {
          title: `Interactive ${cleanLang.toUpperCase()} Live Preview`,
          filename: extMap[cleanLang] || 'index.html',
          lang: cleanLang,
          code: primaryBlock.content,
          bundleFiles,
        };
      }

      return null;
    },
    []
  );

  const latestChatArtifact = React.useMemo(() => {
    for (let i = activeChat.msgs.length - 1; i >= 0; i--) {
      const m = activeChat.msgs[i];
      if (m.role !== 'ai') continue;
      const found = extractPreviewableArtifactFromMessage(m.text || '');
      if (found) return found;
    }
    return null;
  }, [activeChat.msgs, extractPreviewableArtifactFromMessage]);

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
    const resolvedDir =
      settings.dir === 'rtl' || settings.dir === 'ltr' ? settings.dir : 'ltr';
    document.documentElement.dir = resolvedDir;
    document.documentElement.setAttribute('data-dir', settings.dir || 'auto');
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
    // v18.11 + v19.0 — Auto-Save Conversations & Privacy Mode stop disk persistence.
    if (settings.autoSaveChat === false || settings.conversationPrivacyMode) return;
    try {
      const deletedIds = new Set(loadDeletedChatIds());
      const persistable = chats.filter(
        (c) => !c.incognito && !deletedIds.has(c.id)
      );
      localStorage.setItem(LS_KEYS.chats, JSON.stringify(persistable));
    } catch {
      showToast(
        '⚠️ স্টোরেজ কোটা পূর্ণ — চ্যাট সংরক্ষণে সমস্যা হচ্ছে। অনুগ্রহ করে Backup এক্সপোর্ট করুন।',
        4500
      );
    }
  }, [chats, streamingMsgId, settings.autoSaveChat, settings.conversationPrivacyMode]);

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
    workspace: stripWorkspaceSecrets({
      mcpServers,
      dbConnections,
      dataBridgeConfig,
      knowledgeDocsSummary: knowledgeDocs.map((d) => ({
        id: d.id,
        title: d.title,
        chunkCount: d.chunkCount,
      })),
    }),
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
      setSettings((prev) => {
        const cloudParsed = parseCloudSettings(state.settings);
        const hydrated = sanitizeSettings({
          ...cloudParsed,
          webSearchDefault: false,
          externalKeys: ignoreLocalChats ? '' : prev.externalKeys,
        });
        if (hydrated.thinkingMode === 'off' || hydrated.thinkingEnabled === false) {
          hydrated.thinkingEnabled = true;
          hydrated.thinkingMode = 'medium';
        }
        return hydrated;
      });
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
    if (state.workspace && typeof state.workspace === 'object') {
      const ws = state.workspace as Record<string, unknown>;
      if (Array.isArray(ws.mcpServers)) {
        setMcpServers((prev) => {
          const prevById = new Map(prev.map((m) => [m.id, m]));
          const next = (ws.mcpServers as McpServerConfig[]).map((m) => ({
            ...m,
            authSecret: ignoreLocalChats ? '' : prevById.get(m.id)?.authSecret || '',
          }));
          void saveMcpServers(next).catch(() => {});
          return next;
        });
      }
      if (Array.isArray(ws.dbConnections)) {
        setDbConnections((prev) => {
          const prevById = new Map(prev.map((d) => [d.id, d]));
          const next = (ws.dbConnections as DbConnectionConfig[]).map((d) => ({
            ...d,
            secret: ignoreLocalChats ? '' : prevById.get(d.id)?.secret || '',
          }));
          void saveDbConnections(next).catch(() => {});
          return next;
        });
      }
      if (ws.dataBridgeConfig && typeof ws.dataBridgeConfig === 'object') {
        const nextBridge = ws.dataBridgeConfig as DataBridgeConfig;
        setDataBridgeConfig(nextBridge);
        saveDataBridgeConfig(nextBridge);
      }
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
    if (!cloudReady || !cloudClient || !userId || settings.conversationPrivacyMode) return;
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
    mcpServers,
    dbConnections,
    dataBridgeConfig,
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
      localStorage.removeItem(MCP_STORAGE_KEY);
      localStorage.removeItem(DB_CONNECTIONS_STORAGE_KEY);
      localStorage.removeItem(DB_BRIDGE_CONFIG_STORAGE_KEY);
      localStorage.removeItem(TELEMETRY_LOG_KEY);
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
    setMcpServers([]);
    setDbConnections([]);
    setDataBridgeConfig({
      sourceConnectionId: '',
      destinationConnectionId: '',
      sourceTable: '',
      destinationTable: '',
      syncMode: 'upsert',
      fieldMappings: [],
    });
    setKnowledgeDocs([]);
    setTelemetryLogs([]);
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
          setSettingsTab('general');
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
    // Record persistent tombstone so cloud/Firestore sync never resurrects this chat
    markChatDeleted(id);
    firestoreSyncedChatSigsRef.current.delete(id);
    // Delete from Supabase cloud session table
    if (cloudClient && userId && cloudReady) {
      deleteCloudSession(cloudClient, userId, id)
        .then(() => setCloudStatus('saved'))
        .catch((delErr) => {
          setCloudStatus('offline');
          console.warn('[cloudSync.deleteSession]', delErr);
        });
    }
    // Delete from Firebase Firestore conversations + sessions
    if (firebaseUser && firebaseUser.emailVerified) {
      void deleteConversationFromFirestore(firebaseUser, id).catch(() => {});
    }
    syncedSessionVersions.current.delete(id);
    const remaining = chats.filter((c) => c.id !== id);
    const nextChats: ChatSession[] =
      remaining.length === 0
        ? [
            {
              id: Date.now(),
              title: 'New Conversation',
              msgs: [],
            },
          ]
        : remaining;
    try {
      localStorage.setItem(
        LS_KEYS.chats,
        JSON.stringify(nextChats.filter((c) => !c.incognito))
      );
    } catch {
      // ignore storage errors
    }
    setChats(nextChats);
    if (remaining.length === 0 || activeId === id) {
      setActiveId(nextChats[0].id);
    }
    showToast('চ্যাট স্থায়ীভাবে মুছে ফেলা হয়েছে');
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

  // Image Generation (Nano Banana 2.1 backend with Pollinations fallback)
  const handleRunImageGen = (
    prompt: string,
    style = settings.imageGenPrefs?.defaultStyle || 'high quality, detailed',
    size = settings.imageGenPrefs?.defaultSize || 768,
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

    const aiMsgId = createUniqueId('ai');
    const seed = Math.floor(Math.random() * 100000);
    const fallbackUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(
      `${prompt}, ${style}`.slice(0, 240)
    )}?width=${size}&height=${size}&nologo=true&seed=${seed}`;

    const aiMsg: ChatMessage = {
      id: aiMsgId,
      role: 'ai',
      text: `**${prompt}**\n\n_ছবি তৈরি হচ্ছে…_`,
      ts: nowTs,
      status: 'streaming',
      timing: {
        createdAt: nowIso,
        startedAt: nowIso,
      },
    };
    appendMessageToChat(targetChatId, aiMsg);
    scrollToBottom(true);

    void (async () => {
      let resolvedUrl = fallbackUrl;
      let resolvedModel: string | undefined;
      try {
        const res = await fetch('/api/generate-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt,
            style,
            size,
            enabledTools: settings.enabledTools,
          }),
        });
        if (res.ok) {
          const data = (await res.json()) as {
            url?: string;
            modelUsed?: string;
          };
          if (typeof data?.url === 'string' && data.url.trim()) {
            resolvedUrl = data.url;
          }
          if (typeof data?.modelUsed === 'string' && data.modelUsed.trim()) {
            resolvedModel = data.modelUsed;
          }
        }
      } catch {
        // Fallback URL already prepared
      }
      const doneIso = new Date().toISOString();
      updateMessageInChat(targetChatId, aiMsgId, (m) => ({
        ...m,
        text: `**${prompt}**`,
        status: 'complete',
        ...(resolvedModel ? { modelUsed: resolvedModel } : {}),
        timing: {
          ...(m.timing || { createdAt: nowIso }),
          completedAt: doneIso,
        },
        imgGen: { url: resolvedUrl, prompt },
      }));
      scrollToBottom(true);
    })();
  };

  // Bilingual Speech synthesis (Bengali + English mixed segmentation)
  const speakText = (text: string, msgId?: string, onDone?: () => void) => {
    // Never trigger main-chat TTS while Live Voice overlay is active
    if (voiceCallOpenRef.current || voiceCallOpen) {
      onDone?.();
      return;
    }
    const { cleanResponse } = extractThinkingAndResponse(text || '');
    const spokenText = stripContactTokensForText(cleanResponse || text || '').trim();
    if (!spokenText) {
      onDone?.();
      return;
    }
    bilingualSpeechPlayer.speak({
      text: spokenText,
      msgId,
      preferredLang: voiceLangMode,
      voiceProfile: settings.ttsVoice,
      geminiVoice: resolveTtsVoicePersona(settings.ttsVoice),
      rate: settings.voiceSpeed || 1.0,
      onDone,
    });
  };

  const clearVoiceRollingTimer = () => {
    if (voiceRollingTimerRef.current !== null) {
      window.clearInterval(voiceRollingTimerRef.current);
      voiceRollingTimerRef.current = null;
    }
    voiceRollingInFlightRef.current = false;
  };

  useEffect(() => {
    return () => {
      clearVoiceRollingTimer();
      voiceListeningRef.current = false;
      try {
        recogRef.current?.abort?.();
      } catch {
        // Ignore cleanup abort errors
      }
      if (voiceStreamRef.current) {
        voiceStreamRef.current.getTracks().forEach((t) => {
          try {
            t.stop();
          } catch {
            // Ignore cleanup track stop errors
          }
        });
      }
    };
  }, []);

  const releaseVoiceMedia = () => {
    const stream = voiceStreamRef.current;
    voiceStreamRef.current = null;
    setVoiceAudioStream(null);
    if (stream) {
      stream.getTracks().forEach((t) => {
        try {
          t.stop();
        } catch {
          // Ignore track stop failure
        }
      });
    }
  };

  const stopActiveMediaRecorder = (): Promise<Blob | null> => {
    const rec = mediaRecorderRef.current;
    mediaRecorderRef.current = null;
    if (!rec) {
      releaseVoiceMedia();
      return Promise.resolve(null);
    }
    if (rec.state === 'inactive') {
      const existing =
        mediaChunksRef.current.length > 0
          ? new Blob(mediaChunksRef.current, { type: voiceMimeRef.current })
          : null;
      mediaChunksRef.current = [];
      releaseVoiceMedia();
      return Promise.resolve(existing);
    }
    return new Promise<Blob | null>((resolve) => {
      let settled = false;
      const finalize = () => {
        if (settled) return;
        settled = true;
        const blob =
          mediaChunksRef.current.length > 0
            ? new Blob(mediaChunksRef.current, { type: voiceMimeRef.current })
            : null;
        mediaChunksRef.current = [];
        releaseVoiceMedia();
        resolve(blob);
      };
      const safetyTimer = window.setTimeout(finalize, 700);
      rec.onstop = () => {
        window.clearTimeout(safetyTimer);
        finalize();
      };
      try {
        rec.stop();
      } catch {
        window.clearTimeout(safetyTimer);
        finalize();
      }
    });
  };

  const deliverCapturedVoiceText = (captured: string) => {
    const clean = captured.trim();
    if (!clean) return;
    if (talkMode || voiceCallOpenRef.current || voiceCallOpen) {
      handleSend(clean);
    } else {
      setInputText((prev) => {
        const cleanPrev = prev.trim();
        return cleanPrev ? `${cleanPrev} ${clean}` : clean;
      });
      setTimeout(() => composerRef.current?.focus(), 40);
    }
  };

  const clearVoiceSilenceTimer = () => {
    if (voiceSilenceTimerRef.current !== null) {
      window.clearTimeout(voiceSilenceTimerRef.current);
      voiceSilenceTimerRef.current = null;
    }
  };

  const scheduleVoiceSilenceAutoCommit = () => {
    clearVoiceSilenceTimer();
    if (!voiceCallOpenRef.current) return;
    voiceSilenceTimerRef.current = window.setTimeout(() => {
      voiceSilenceTimerRef.current = null;
      if (
        !voiceCallOpenRef.current ||
        !voiceListeningRef.current ||
        voiceCancelledRef.current ||
        voiceCommittedRef.current
      ) {
        return;
      }
      const hasSpeech = Boolean(
        (voiceWebSpeechTextRef.current || voiceDraftRef.current || voiceRollingTextRef.current).trim()
      );
      if (hasSpeech) {
        void confirmVoiceDictation();
      }
    }, 1050);
  };

  // Bilingual Voice Recognition (Hybrid Web Speech + Rolling Live Cloud STT)
  const cancelVoiceDictation = () => {
    voiceCancelledRef.current = true;
    voiceCommittedRef.current = false;
    voiceListeningRef.current = false;
    clearVoiceRollingTimer();
    clearVoiceSilenceTimer();
    voiceDraftRef.current = '';
    voiceFinalPrefixRef.current = '';
    voiceSessionFinalRef.current = '';
    voiceWebSpeechTextRef.current = '';
    voiceRollingTextRef.current = '';
    setVoiceLiveText('');
    setIsListening(false);
    setIsTranscribingVoice(false);
    try {
      recogRef.current?.abort?.();
      recogRef.current?.stop?.();
    } catch {
      // Ignore abort errors
    }
    void stopActiveMediaRecorder();
  };

  const confirmVoiceDictation = async () => {
    if (isTranscribingVoice) return;
    voiceCancelledRef.current = false;
    voiceCommittedRef.current = true;
    voiceListeningRef.current = false;
    clearVoiceRollingTimer();
    clearVoiceSilenceTimer();
    const captured = mergeVoiceLiveTranscript(
      voiceWebSpeechTextRef.current || voiceDraftRef.current,
      voiceRollingTextRef.current
    );
    voiceDraftRef.current = '';
    voiceFinalPrefixRef.current = '';
    voiceSessionFinalRef.current = '';
    voiceWebSpeechTextRef.current = '';
    voiceRollingTextRef.current = '';
    setVoiceLiveText('');
    setIsListening(false);
    try {
      recogRef.current?.stop?.();
    } catch {
      // Ignore stop errors
    }

    const effectiveLang = resolveRecognitionLanguage(
      settings.vlang === 'bn-BD' || settings.vlang === 'en-US'
        ? (settings.vlang as VoiceLangMode)
        : voiceLangMode,
      settings.appLanguage
    );

    const recordedBlob = await stopActiveMediaRecorder();

    if (captured) {
      deliverCapturedVoiceText(captured);
      return;
    }

    if (recordedBlob && recordedBlob.size >= 400) {
      setIsTranscribingVoice(true);
      try {
        const audioBase64 = await blobToBase64Data(recordedBlob);
        const stt = await requestServerVoiceTranscription({
          audioBase64,
          mimeType: recordedBlob.type || voiceMimeRef.current || 'audio/webm',
          language: effectiveLang,
        });
        if (stt.ok && stt.text) {
          deliverCapturedVoiceText(stt.text);
        } else if (!stt.ok) {
          showToast(stt.error || 'ভয়েস টেক্সটে রূপান্তর করা যায়নি');
        } else {
          showToast('কোনো কথা শোনা যায়নি — মাইক্রোফোনের কাছে পরিষ্কার বলুন');
        }
      } catch {
        showToast('ভয়েস ট্রান্সক্রিপশন ব্যর্থ হয়েছে — আবার চেষ্টা করুন');
      } finally {
        setIsTranscribingVoice(false);
      }
      return;
    }

    showToast('কোনো কথা শোনা যায়নি — মাইক্রোফোনের কাছে পরিষ্কার বলুন');
  };

  const toggleMic = () => {
    if (isTranscribingVoice) return;
    if (isListening || voiceListeningRef.current) {
      void confirmVoiceDictation();
      return;
    }
    if (!isVoiceInputSupported()) {
      showToast('এই ব্রাউজারে ভয়েস ইনপুট সমর্থিত নয়');
      return;
    }

    clearVoiceRollingTimer();
    voiceDraftRef.current = '';
    voiceFinalPrefixRef.current = '';
    voiceSessionFinalRef.current = '';
    voiceWebSpeechTextRef.current = '';
    voiceRollingTextRef.current = '';
    voiceCancelledRef.current = false;
    voiceCommittedRef.current = false;
    voiceListeningRef.current = true;
    mediaChunksRef.current = [];
    setVoiceLiveText('');
    setVoiceActivityAt(Date.now());

    const effectiveLang = resolveRecognitionLanguage(
      settings.vlang === 'bn-BD' || settings.vlang === 'en-US'
        ? (settings.vlang as VoiceLangMode)
        : voiceLangMode,
      settings.appLanguage
    );

    // 1. Start Web SpeechRecognition SYNCHRONOUSLY inside user click (before any await/getUserMedia)
    let recognitionStarted = false;
    if (isSpeechRecognitionSupported()) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      const r = new SR();
      r.lang = effectiveLang;
      r.interimResults = true;
      r.continuous = true;

      const bumpActivity = () => setVoiceActivityAt(Date.now());
      r.onaudiostart = bumpActivity;
      r.onsoundstart = bumpActivity;
      r.onspeechstart = bumpActivity;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      r.onresult = (e: any) => {
        const { finalPrefix, liveTranscript } = accumulateSpeechResults(
          e?.results,
          voiceFinalPrefixRef.current
        );
        voiceSessionFinalRef.current = finalPrefix;
        if (liveTranscript) {
          voiceWebSpeechTextRef.current = liveTranscript;
          const merged = mergeVoiceLiveTranscript(
            liveTranscript,
            voiceRollingTextRef.current
          );
          voiceDraftRef.current = merged;
          if (settings.voiceLiveCaptions !== false) {
            setVoiceLiveText(merged);
          }
          if (merged.trim().length >= 2) {
            scheduleVoiceSilenceAutoCommit();
          }
        }
        setVoiceActivityAt(Date.now());
      };

      r.onend = () => {
        if (voiceCancelledRef.current || voiceCommittedRef.current || !voiceListeningRef.current) {
          return;
        }
        if (voiceSessionFinalRef.current) {
          voiceFinalPrefixRef.current = voiceSessionFinalRef.current;
        }
        // Keep Web Speech active seamlessly across natural pauses while listening
        window.setTimeout(() => {
          if (!voiceListeningRef.current || voiceCancelledRef.current || voiceCommittedRef.current) {
            return;
          }
          try {
            r.start();
          } catch {
            // MediaRecorder + rolling transcription continues uninterrupted
          }
        }, 120);
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      r.onerror = (ev: any) => {
        const code = String(ev?.error || '');
        if (code === 'aborted' || code === 'no-speech') {
          return;
        }
        // If MediaRecorder fallback is capturing audio cleanly, don't kill the session
        if (isMediaRecorderSupported()) {
          return;
        }
        if (voiceCancelledRef.current || voiceCommittedRef.current) return;
        voiceListeningRef.current = false;
        clearVoiceRollingTimer();
        setIsListening(false);
        if (code === 'not-allowed' || code === 'service-not-allowed') {
          showToast('মাইক্রোফোন পারমিশন ব্লক করা আছে — ব্রাউজার সেটিংসে অনুমতি দিন');
        } else if (code === 'audio-capture') {
          showToast('কোনো মাইক্রোফোন পাওয়া যায়নি');
        } else if (code) {
          showToast(`ভয়েস ত্রুটি: ${code}`);
        }
      };

      recogRef.current = r;
      try {
        r.start();
        recognitionStarted = true;
      } catch {
        recognitionStarted = false;
      }
    }

    // 2. Acquire MediaRecorder non-blockingly so waveform + server STT work across all browsers/iframes
    const hasRecorder = isMediaRecorderSupported();
    if (hasRecorder || recognitionStarted) {
      setIsListening(true);
    } else {
      voiceListeningRef.current = false;
      showToast('ভয়েস চালু করা যায়নি — মাইক্রোফোন পারমিশন পরীক্ষা করুন');
      return;
    }

    if (hasRecorder) {
      navigator.mediaDevices
        .getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        })
        .then((stream) => {
          if (!voiceListeningRef.current || voiceCancelledRef.current || voiceCommittedRef.current) {
            stream.getTracks().forEach((t) => {
              try {
                t.stop();
              } catch {
                // Ignore track stop failure
              }
            });
            return;
          }
          voiceStreamRef.current = stream;
          setVoiceAudioStream(stream);
          const preferredMime = pickSupportedAudioMimeType();
          const recorder = preferredMime
            ? new MediaRecorder(stream, { mimeType: preferredMime })
            : new MediaRecorder(stream);
          voiceMimeRef.current = recorder.mimeType || preferredMime || 'audio/webm';
          recorder.ondataavailable = (ev: BlobEvent) => {
            if (ev.data && ev.data.size > 0) {
              mediaChunksRef.current.push(ev.data);
              setVoiceActivityAt(Date.now());
            }
          };
          mediaRecorderRef.current = recorder;
          recorder.start(300);

          // Rolling server live-caption poller when SpeechRecognition yields no live text
          voiceRollingTimerRef.current = window.setInterval(() => {
            const totalBytes = mediaChunksRef.current.reduce(
              (acc, b) => acc + b.size,
              0
            );
            if (
              !shouldPollRollingVoiceTranscript({
                isListening: voiceListeningRef.current,
                hasWebSpeechText: Boolean(voiceWebSpeechTextRef.current.trim()),
                totalChunkBytes: totalBytes,
                inFlight: voiceRollingInFlightRef.current,
                liveCaptionsEnabled: settings.voiceLiveCaptions,
              })
            ) {
              return;
            }
            const snapBlob = new Blob(mediaChunksRef.current, {
              type: voiceMimeRef.current || 'audio/webm',
            });
            voiceRollingInFlightRef.current = true;
            void blobToBase64Data(snapBlob)
              .then((audioBase64) =>
                requestServerVoiceTranscription({
                  audioBase64,
                  mimeType: snapBlob.type || voiceMimeRef.current || 'audio/webm',
                  language: effectiveLang,
                })
              )
              .then((stt) => {
                if (
                  !voiceListeningRef.current ||
                  voiceCancelledRef.current ||
                  voiceCommittedRef.current
                ) {
                  return;
                }
                if (stt.ok && stt.text) {
                  voiceRollingTextRef.current = stt.text;
                  const merged = mergeVoiceLiveTranscript(
                    voiceWebSpeechTextRef.current,
                    stt.text
                  );
                  voiceDraftRef.current = merged;
                  setVoiceLiveText(merged);
                  if (merged.trim().length >= 2) {
                    scheduleVoiceSilenceAutoCommit();
                  }
                }
              })
              .catch(() => {
                // Non-fatal; final confirm pass will still transcribe complete audio
              })
              .finally(() => {
                voiceRollingInFlightRef.current = false;
              });
          }, 2100);
        })
        .catch((micErr: unknown) => {
          releaseVoiceMedia();
          if (!recognitionStarted) {
            voiceListeningRef.current = false;
            clearVoiceRollingTimer();
            setIsListening(false);
            const name = micErr instanceof Error ? micErr.name : '';
            if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
              showToast('মাইক্রোফোন পারমিশন ব্লক করা আছে — ব্রাউজার সেটিংসে অনুমতি দিন');
            } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
              showToast('কোনো মাইক্রোফোন পাওয়া যায়নি');
            } else {
              showToast('ভয়েস চালু করা যায়নি — মাইক্রোফোন পারমিশন পরীক্ষা করুন');
            }
          }
        });
    }
  };

  // Main Send handler
  const handleSend = async (
    overrideText?: string,
    extraAttachments?: {
      imgs?: ImageAttachment[];
      files?: Array<{ name: string; content: string; summary?: string }>;
    }
  ) => {
    if (isGenerating || inFlightSendRef.current) return;
    const rawTxt = (overrideText ?? inputText).trim();
    const imgs = [
      ...pendingImgs,
      ...(Array.isArray(extraAttachments?.imgs) ? extraAttachments.imgs : []),
    ];
    const files: Array<{
      name: string;
      content: string;
      summary?: string;
      doc?: ReadDocumentResult;
    }> = [
      ...pendingFiles,
      ...(Array.isArray(extraAttachments?.files)
        ? extraAttachments.files.map((f) => ({
            name: f.name,
            content: f.content,
            summary: f.summary || `${f.content.length} chars`,
          }))
        : []),
    ];

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
      const localMsgId = 'ai-' + Date.now();
      const shouldAnimate =
        !voiceCallOpenRef.current &&
        !voiceCallOpen &&
        settings.streamingReveal !== false &&
        replyText.length > 24;
      const isThinkingOn =
        settings.thinkingEnabled !== false && settings.thinkingMode !== 'off';
      const localTopic = deriveInitialThinkingTopic(rawTxt);
      const localThinkingText = isThinkingOn
        ? `বিষয় বিশ্লেষণ: ${localTopic}\n• প্রশ্নের মূল বিষয়বস্তু ও প্রাসঙ্গিক তথ্য বিশ্লেষণ করা হচ্ছে…\n• নির্ভুল ও সুশৃঙ্খল উত্তর প্রস্তুত করা হচ্ছে…`
        : undefined;

      if (!shouldAnimate) {
        appendMessageToChat(targetChatId, {
          id: localMsgId,
          role: 'ai',
          text: replyText,
          thinking: localThinkingText,
          thinkingDurationSec: isThinkingOn ? 1 : undefined,
          ts: Date.now(),
          ...extraFields,
        });
        scrollToBottom(false);
        return;
      }

      appendMessageToChat(targetChatId, {
        id: localMsgId,
        role: 'ai',
        text: ' ',
        thinking: localThinkingText,
        thinkingDurationSec: isThinkingOn ? 1 : undefined,
        status: 'streaming',
        ts: Date.now(),
        ...extraFields,
      });
      setStreamingMsgId(localMsgId);

      await new Promise<void>((resolve) => {
        let shown = 0;
        let lastTs = 0;
        const step = (now: number) => {
          const dt = lastTs ? now - lastTs : 16;
          lastTs = now;
          const remaining = replyText.length - shown;
          if (remaining > 0) {
            shown += revealChars(remaining, dt, true);
            const slice = safeSlice(replyText, shown);
            updateMessageInChat(targetChatId, localMsgId, (m) => ({
              ...m,
              text: slice || ' ',
            }));
            scrollToBottom(false);
          }
          if (shown < replyText.length) {
            if (typeof window.requestAnimationFrame === 'function') {
              window.requestAnimationFrame(step);
            } else {
              window.setTimeout(() => step(Date.now()), 16);
            }
          } else {
            updateMessageInChat(targetChatId, localMsgId, (m) => ({
              ...m,
              text: replyText,
              status: 'complete',
            }));
            setStreamingMsgId((cur) => (cur === localMsgId ? null : cur));
            resolve();
          }
        };
        if (typeof window.requestAnimationFrame === 'function') {
          window.requestAnimationFrame(step);
        } else {
          window.setTimeout(() => step(Date.now()), 16);
        }
      });
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

    // 4. Auto-extract implicit user memory only for concise personal messages (never block/pollute on large notes, paused memory, or incognito)
    const isIncognitoTurn = Boolean(
      activeChat.incognito || settings.conversationPrivacyMode
    );
    let currentMemory = [...memory];
    if (
      settings.autoMemory !== false &&
      !settings.memoryPaused &&
      !isIncognitoTurn &&
      rawTxt.length <= 450
    ) {
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
        !settings.memoryPaused &&
        !isIncognitoTurn &&
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
    const isLiveVoiceTurn = Boolean(voiceCallOpenRef.current || voiceCallOpen);
    const isThinkingEnabledAtStart =
      !isLiveVoiceTurn &&
      settings.thinkingEnabled !== false &&
      settings.thinkingMode !== 'off';
    setIsGenerating(true);
    setIsWaitingFirstToken(!appendToMsg && !isThinkingEnabledAtStart);
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

    // P1-20 + v19.0 Model Role Slots: resolve configured role slot when present
    const slotKeyToCheck: 'defaultModel' | 'fastModel' | 'reasoningModel' | 'visionModel' =
      historyMsgs.some((m) => m.role === 'user' && Array.isArray(m.imgs) && m.imgs.length > 0)
        ? 'visionModel'
        : settings.mode === 'fast'
        ? 'fastModel'
        : settings.mode === 'power' || settings.thinkingMode === 'high'
        ? 'reasoningModel'
        : 'defaultModel';
    const slotOverride = !overrideProvider
      ? resolveModelForSlot(slotKeyToCheck, settings, savedProfiles)
      : null;

    const baseProfileSnapshot = resolveActiveProfile(settings, savedProfiles);
    const profileSnapshot = slotOverride?.profile || baseProfileSnapshot;
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
    let effectiveExternalKeys = rawEffectiveKeys;
    if (!isDefaultUnlimitedProfile && profileSnapshot?.decryptionFailed) {
      window.clearTimeout(phaseFallback);
      window.clearTimeout(timeoutId);
      setDecryptionAlertProfileName(profileSnapshot.name || activeProvider);
      setProviderLimitBanner({
        profileName: profileSnapshot.name || activeProvider,
        profileId: profileSnapshot.id,
        message: 'এই ঠিকানায় আগের সেভ করা কী পড়া যায় না, আবার দিন।',
      });
      showToast('এই ঠিকানায় আগের সেভ করা কী পড়া যায় না, আবার দিন।', 5500);
      setIsGenerating(false);
      setIsWaitingFirstToken(false);
      setGenPhase(null);
      return;
    }
    if (isEncrypted(rawEffectiveKeys)) {
      try {
        effectiveExternalKeys = await decryptSecret(rawEffectiveKeys);
      } catch {
        window.clearTimeout(phaseFallback);
        window.clearTimeout(timeoutId);
        const failName = profileSnapshot?.name || activeProvider;
        setDecryptionAlertProfileName(failName);
        if (profileSnapshot?.id) {
          setSavedProfiles((prev) =>
            prev.map((p) =>
              p.id === profileSnapshot.id
                ? {
                    ...p,
                    decryptionFailed: true,
                    verificationStatus: 'failed' as const,
                    statusMessage: 'এই ঠিকানায় আগের সেভ করা কী পড়া যায় না, আবার দিন।',
                  }
                : p
            )
          );
        }
        setProviderLimitBanner({
          profileName: failName,
          profileId: profileSnapshot?.id,
          message: 'এই ঠিকানায় আগের সেভ করা কী পড়া যায় না, আবার দিন।',
        });
        showToast('এই ঠিকানায় আগের সেভ করা কী পড়া যায় না, আবার দিন।', 5500);
        setIsGenerating(false);
        setIsWaitingFirstToken(false);
        setGenPhase(null);
        return;
      }
    }
    if (
      (activeProvider === 'gemini_openai' || activeProvider === 'gemini_custom') &&
      effectiveExternalKeys
    ) {
      const keyFmt = validateGeminiApiKeyFormat(effectiveExternalKeys);
      if (!keyFmt.valid) {
        window.clearTimeout(phaseFallback);
        window.clearTimeout(timeoutId);
        const errMsg = keyFmt.error || 'Gemini API Key সাধারণত AIza দিয়ে শুরু হয়।';
        setProviderLimitBanner({
          profileName: profileSnapshot?.name || activeProvider,
          profileId: profileSnapshot?.id,
          message: errMsg,
        });
        showToast(errMsg, 5500);
        setIsGenerating(false);
        setIsWaitingFirstToken(false);
        setGenPhase(null);
        return;
      }
    }
    const effectiveExternalBaseUrl = isDefaultUnlimitedProfile
      ? ''
      : profileSnapshot.externalBaseUrl?.trim() ||
        settings.externalBaseUrl?.trim() ||
        '';
    const effectiveExternalModel =
      activeProvider === 'smfta_cloud' && overrideProvider === 'smfta_cloud'
        ? ''
        : slotOverride?.modelId ||
          profileSnapshot.externalModel?.trim() ||
          settings.externalModel?.trim() ||
          '';

    const maxConcurrent = Math.max(1, Math.min(4, settings.concurrentRequests ?? 1));
    if (activeStreamCountRef.current >= maxConcurrent) {
      showToast(`Concurrency limit (${maxConcurrent}) active — wait for current request.`);
      setIsGenerating(false);
      setIsWaitingFirstToken(false);
      return;
    }
    activeStreamCountRef.current += 1;

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
    const isThinkingEnabledForTurn =
      !isLiveVoiceTurn &&
      settings.thinkingEnabled !== false &&
      settings.thinkingMode !== 'off';
    const rawLastUserMsg =
      [...historyMsgs].reverse().find((m) => m.role === 'user')?.text || '';
    const initialTurnTopic = deriveInitialThinkingTopic(rawLastUserMsg);
    let thinkingStartMs: number | null = isThinkingEnabledForTurn
      ? Date.now()
      : null;
    let computedThinkingSec: number | undefined;

    if (appendToMsg) {
      setStreamingMsgId(aiMsgId);
    } else if (isThinkingEnabledForTurn) {
      bubbleCreated = true;
      setIsWaitingFirstToken(false);
      setStreamingMsgId(aiMsgId);
      appendMessageToChat(chatId, {
        id: aiMsgId,
        role: 'ai',
        text: ' ',
        thinking: `বিষয় বিশ্লেষণ: ${initialTurnTopic}\n• প্রশ্নের মূল বিষয়বস্তু ও প্রাসঙ্গিক তথ্য বিশ্লেষণ করা হচ্ছে…\n• নির্ভুল ও সুশৃঙ্খল উত্তর প্রস্তুত করা হচ্ছে…`,
        v2ModelId: isV2Request ? effectiveExternalModel : undefined,
        ts: reqStart,
        turnId,
        status: 'streaming',
        requestedProvider: activeProvider,
        requestedModel: effectiveExternalModel || activeModelName,
        timing: {
          createdAt: reqStartIso,
          startedAt: reqStartIso,
        },
      });
      scrollToBottom(false);
    }

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
      const samePagePriorLines: string[] = [];
      if (
        settings.crossModelMemoryCarryover !== false &&
        cleanHistoryMsgs.length > 1
      ) {
        const recentSamePage = cleanHistoryMsgs.slice(0, -1).slice(-8);
        for (const pm of recentSamePage) {
          const roleTag = pm.role === 'user' ? 'User' : 'Assistant';
          const cleanTxt = String(pm.text || '')
            .replace(/⟦FILE:[^\n⟦]+⟧[\s\S]*?⟦\/FILE⟧/g, '[Attached File]')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 320);
          if (cleanTxt) {
            samePagePriorLines.push(`${roleTag}: ${cleanTxt}`);
          }
        }
      }

      const chatHistorySummary = [
        samePagePriorLines.length > 0
          ? `[ACTIVE PAGE CONVERSATION CONTINUITY — RETAIN ACROSS MODEL SWITCHES]:\n${samePagePriorLines.join('\n')}`
          : '',
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

      const rawTargetMsgs: StreamMsg[] = applySkillDirectiveToMessages(
        contextSlice,
        activeSkillPrompt
      );

      const safeTargetMsgs: StreamMsg[] = rawTargetMsgs.map((m, idx) => ({
        ...m,
        text: clampMsgText(m.text, `message[${idx}]`),
      }));

      const isVoiceWorkspaceQuery =
        !isLiveVoiceTurn ||
        /\b(github|repo|drive|google|supabase|vercel|deploy|database|file|code|project|workspace|app|bug|error|doc|knowledge)\b|ফাইল|কোড|প্রজেক্ট|ডাটাবেস/i.test(
          lastUserPrompt
        );
      const shouldFetchLiveIntegrations =
        !isLiveVoiceTurn ||
        /\b(github|repo|drive|google|supabase|vercel|deploy|database|file)\b/i.test(
          lastUserPrompt
        );
      const liveIntegrationContext = shouldFetchLiveIntegrations
        ? await buildLiveIntegrationContextForPrompt(
            lastUserPrompt,
            connections,
            resolvedServiceContext
          ).catch(() => '')
        : '';

      const combinedProjectContext = isVoiceWorkspaceQuery
        ? [
            smartCtx?.envelopeBlock || '',
            projectPromptBlock(project, 80, 18000, lastUserPrompt),
            liveIntegrationContext,
            ...overflowChunks,
          ]
            .filter(Boolean)
            .join('\n\n')
            .slice(0, 110_000)
        : liveIntegrationContext;

      const kbResult = isVoiceWorkspaceQuery
        ? buildKnowledgePromptContext(
            lastUserPrompt,
            knowledgeDocs,
            settings.knowledgeSettings
          )
        : { promptContext: '' };
      const mcpToolsContext = isVoiceWorkspaceQuery
        ? buildMcpPromptContext(mcpServers)
        : '';

      const activeChatProject = (settings.projects || []).find(
        (p) => p.id === targetSession?.projectId
      );
      const isIncognitoChat = Boolean(
        targetSession?.incognito || settings.conversationPrivacyMode
      );

      const wantsDetailedVoiceReply =
        isLiveVoiceTurn &&
        /\b(detail|detailed|details|elaborate|explain|full|complete|step\s*by\s*step)\b|(?:বিস্তারিত|ডিটেইল|পুরো|সম্পূর্ণ|ব্যাখ্যা)/i.test(
          lastUserPrompt
        );
      const liveVoiceDirective = wantsDetailedVoiceReply
        ? 'LIVE VOICE MODE (DETAILED): Speak clearly in natural warm Bengali or English, covering every key point in clear spoken paragraphs without markdown tables or raw code fences unless requested.'
        : 'LIVE VOICE MODE: Respond immediately in natural, warm, spoken conversational language (2 to 4 concise sentences, plain spoken text with no markdown bullets or headings unless explicitly requested) so your answer sounds instant and human when spoken aloud.';
      const effectiveGlobalInstructions = isLiveVoiceTurn
        ? [liveVoiceDirective, settings.globalInstructions || settings.customInst || '']
            .filter(Boolean)
            .join('\n\n')
        : settings.globalInstructions || settings.customInst || '';

      const buildRequestBody = (msgs: StreamMsg[]) =>
        JSON.stringify({
        messages: msgs,
        liveVoiceMode: isLiveVoiceTurn,
        mode: isLiveVoiceTurn ? 'fast' : settings.mode,
        style: isLiveVoiceTurn ? 'concise' : settings.style,
        replyLang: settings.replyLang || 'auto',
        workPersona: settings.workPersona || 'allrounder',
        creativity: settings.creativity,
        customInst: settings.customInst,
        nickname: settings.nickname || profile.name || '',
        globalInstructions: effectiveGlobalInstructions,
        projectInstructions: activeChatProject?.instructions || '',
        projectName: activeChatProject?.name || '',
        responseStyle: isLiveVoiceTurn ? 'concise' : settings.responseStyle || 'normal',
        customStyleSample: settings.customStyleSample || '',
        responseLength: isLiveVoiceTurn ? 'concise' : settings.responseLength || 'normal',
        memoryPaused: Boolean(settings.memoryPaused),
        incognito: isIncognitoChat,
        thinkingEnabled: isLiveVoiceTurn ? false : settings.thinkingEnabled !== false,
        liveThinkingSummary: isLiveVoiceTurn ? false : settings.liveThinkingSummary !== false,
        outputFormat: isLiveVoiceTurn ? 'plain' : settings.outputFormat || 'auto',
        userProfileContext: settings.userProfileContext || '',
        knowledgeContext: kbResult.promptContext || '',
        mcpToolsContext: mcpToolsContext || '',
        // v18.11 personalization signals for the server-side system prompt.
        responseTone: settings.responseTone || 'friendly',
        codingPrefs: settings.codingPrefs || '',
        memory:
          settings.autoMemory !== false &&
          !settings.memoryPaused &&
          !isIncognitoChat
            ? contextRelevantMemory
            : [],
        autoMemory:
          settings.autoMemory !== false &&
          !settings.memoryPaused &&
          !isIncognitoChat,
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
        customHeaders: profileSnapshot.customHeaders || settings.customHeaders || '',
        customParams: profileSnapshot.customParams || settings.customParams || '',
        discoveredModels: profileSnapshot.availableModels || [],
        supportsStreaming: profileSnapshot.supportsStreaming !== false,
        allowKeylessFallback: Boolean(settings.allowKeylessFallback),
        maxOutputTokens: isLiveVoiceTurn
          ? wantsDetailedVoiceReply
            ? Math.min(profileSnapshot.maxOutputTokens ?? settings.maxOutputTokens ?? 1400, 1400)
            : Math.min(profileSnapshot.maxOutputTokens ?? settings.maxOutputTokens ?? 1024, 380)
          : profileSnapshot.maxOutputTokens ?? settings.maxOutputTokens,
        contextWindow: profileSnapshot.contextWindow,
        weightTemp: settings.weightTemp ?? 0.7,
        topP: settings.topP ?? 0.9,
        topK: settings.topK,
        stopSequences: settings.stopSequences,
        thinkingMode:
          isLiveVoiceTurn || settings.thinkingEnabled === false
            ? 'off'
            : settings.thinkingMode || 'medium',
        requestTimeoutSec: settings.requestTimeoutSec ?? 120,
        trainingData: settings.trainingData || '',
        fastDecision: isLiveVoiceTurn ? true : settings.fastDecision !== false,
        memoryCache: isDefaultUnlimitedProfile && settings.memoryCache !== false,
        userName: settings.nickname || profile.name || MASTER_PROFILE_NAME,
        chatHistorySummary:
          settings.crossChatReference !== false && !isIncognitoChat
            ? chatHistorySummary
            : '',
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
        firebaseUid: firebaseUser?.uid || simpleEntryCreds?.userId || '',
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
      let liveStatusSteps: string[] = [];

      const buildEffectiveLiveThinking = (): string | undefined => {
        if (liveThinking.trim()) return liveThinking;
        if (!isThinkingEnabledForTurn) return undefined;
        return `বিষয় বিশ্লেষণ: ${initialTurnTopic}\n• প্রশ্নের মূল বিষয়বস্তু ও প্রাসঙ্গিক তথ্য বিশ্লেষণ করা হচ্ছে…\n• নির্ভুল ও সুশৃঙ্খল উত্তর প্রস্তুত করা হচ্ছে…`;
      };

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
        const effectiveThinking = buildEffectiveLiveThinking();
        if (!bubbleCreated) {
          if (
            !visible.trim() &&
            !liveThinking.trim() &&
            liveStatusSteps.length === 0 &&
            !effectiveThinking
          ) {
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
            thinking: effectiveThinking,
            thinkingDurationSec: computedThinkingSec,
            statusSteps: liveStatusSteps.length > 0 ? [...liveStatusSteps] : undefined,
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
            thinking: effectiveThinking || m.thinking,
            thinkingDurationSec: computedThinkingSec ?? m.thinkingDurationSec,
            statusSteps:
              liveStatusSteps.length > 0 ? [...liveStatusSteps] : m.statusSteps,
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

      const drainReveal = (timeoutMs?: number) =>
        new Promise<void>((resolve) => {
          if (revealShown >= revealTarget.length) return resolve();
          const remaining = Math.max(0, revealTarget.length - revealShown);
          const budgetMs =
            typeof timeoutMs === 'number'
              ? timeoutMs
              : Math.min(12_000, Math.max(2000, Math.ceil((remaining / 130) * 1000) + 600));
          revealFinishing = true;
          revealDoneCb = resolve;
          kickReveal();
          window.setTimeout(() => {
            if (revealDoneCb === resolve) revealDoneCb = null;
            resolve();
          }, budgetMs);
        });

      const flushStreamText = (flushNow = false) => {
        frameTimer = null;
        const liveAnswer = accumulated.includes('⟦FILE:')
          ? parseFileEdits(accumulated).cleanText
          : accumulated;
        const parsedTags = parseAIControlTags(liveAnswer || accumulated);
        if (parsedTags.thinking) {
          if (thinkingStartMs === null) {
            thinkingStartMs = Date.now();
          }
          liveThinking = parsedTags.thinking;
        }
        const displayTxt = parsedTags.cleanText;
        if (displayTxt !== revealTarget) {
          revealTarget = displayTxt;
          if (revealShown > revealTarget.length) revealShown = revealTarget.length;
        }
        // v18.11 — Streaming Reveal off or Live Voice active: render every chunk instantly so TTS starts immediately
        if (
          flushNow ||
          isLiveVoiceTurn ||
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
        if (isLiveVoiceTurn) {
          frameTimer = window.setTimeout(() => flushStreamText(true), 0);
        } else if (useGpuRaf) {
          frameTimer = window.requestAnimationFrame(() => flushStreamText(false));
        } else {
          flushStreamText(false);
        }
      };

      let serverReportedTruncated = false;

      const pipeSSE = async (
        res: Response,
        opts?: { bufferToStringOnly?: boolean }
      ): Promise<{ stalled: boolean; bufferedText: string }> => {
        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let stalled = false;
        let bufferedText = '';
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
                  | 'status'
                  | 'thinking'
                  | 'text'
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
                truncated?: boolean;
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

              if (parsed.type === 'status') {
                // Do not show intermediate Processing / Confirming memory status badges; start directly with Groq Thinking
                continue;
              }

              if (parsed.type === 'progress') {
                continue;
              }

              if (typeof parsed.thinking === 'string' && parsed.thinking) {
                if (thinkingStartMs === null) {
                  thinkingStartMs = Date.now();
                }
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
                if (typeof parsed.truncated === 'boolean') {
                  serverReportedTruncated = parsed.truncated;
                }
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
                  if (opts?.bufferToStringOnly) {
                    bufferedText += deltaTxt;
                    continue;
                  }
                  if (thinkingStartMs !== null && computedThinkingSec === undefined) {
                    computedThinkingSec = Math.max(
                      1,
                      Math.round((Date.now() - thinkingStartMs) / 1000)
                    );
                  }
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
          return { stalled, bufferedText };
        };

      // Architecture decision: V2 – Special uses ONLY the server /api/chat/stream route
      // (streamV2FirebaseModel); client-side tryStreamViaFirebaseAiLogic chat is disabled
      // so presets, models, thinking, RAG, and quota rules are always identical.
      if (response && response.ok && response.body) {
        setGenPhase((cur) => nextGenPhase(cur, { type: 'response' }));
        await pipeSSE(response);
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
        const v2Spec = getV2ModelSpec(effectiveExternalModel);
        throw new Error(
          `${v2Spec.label} requires the server /api/chat/stream route, which could not be reached.`
        );
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
          (serverReportedTruncated || looksTruncated(accumulated))
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
            serverReportedTruncated = false;
            const contSse = await pipeSSE(contRes, { bufferToStringOnly: true });
            const mergedCont = mergeContinuationText(
              baseBeforeCont,
              contSse.bufferedText
            );
            if (!mergedCont.deltaToAppend.trim()) {
              break;
            }
            accumulated = mergedCont.merged;
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
      flushStreamText(isLiveVoiceTurn);
      revealFinishing = true;
      if (!isLiveVoiceTurn) {
        await drainReveal();
      }
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
        !serverReportedTruncated &&
        !looksTruncated(finalText) &&
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
        settings.autoMemory !== false &&
        !settings.memoryPaused &&
        !isIncognitoChat &&
        memories.length > 0
          ? rememberFacts(memories, 'ai')
          : [];

      // Periodic / post-turn lightweight AI memory extraction (JSON key-value with duplicate update & sensitive filter)
      if (
        settings.autoMemory !== false &&
        !settings.memoryPaused &&
        !isIncognitoChat &&
        lastUserPrompt.length >= 6 &&
        lastUserPrompt.length <= 2000
      ) {
        void (async () => {
          try {
            const extRes = await fetch('/api/memory/extract', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                messages: [
                  ...contextSlice.slice(-4),
                  { role: 'ai', text: (finalText || cleanText).slice(0, 800) },
                ],
                existingMemories: memoryRef.current.slice(0, 40),
                provider: activeProvider,
                externalKeys: effectiveExternalKeys,
                externalModel: effectiveExternalModel,
                externalBaseUrl: effectiveExternalBaseUrl,
                memoryPaused: Boolean(settings.memoryPaused),
                incognito: isIncognitoChat,
                autoMemory: settings.autoMemory !== false,
              }),
            });
            if (!extRes.ok) return;
            const extData = await extRes.json();
            if (Array.isArray(extData?.memories) && extData.memories.length > 0) {
              const mergedRes = mergeExtractedMemories(
                memoryRef.current,
                extData.memories
              );
              if (mergedRes.added.length > 0) {
                memoryRef.current = mergedRes.updated;
                setMemory(mergedRes.updated);
              }
            }
          } catch {
            // Non-blocking background extraction
          }
        })();
      }

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

      const finalThinkingSec =
        computedThinkingSec ??
        (thinkingStartMs !== null
          ? Math.max(1, Math.round((Date.now() - thinkingStartMs) / 1000))
          : undefined);

      const finalEffectiveThinking =
        extractedThinking || liveThinking || buildEffectiveLiveThinking();

      const finalCompletedMsg: ChatMessage = {
        id: aiMsgId,
        role: 'ai',
        text: finalText || cleanText || accumulated,
        thinking: finalEffectiveThinking,
        thinkingDurationSec: finalEffectiveThinking ? finalThinkingSec : undefined,
        statusSteps:
          liveStatusSteps.length > 0 ? [...liveStatusSteps] : undefined,
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
        thinkingDurationSec:
          finalCompletedMsg.thinkingDurationSec ?? m.thinkingDurationSec,
        statusSteps: finalCompletedMsg.statusSteps ?? m.statusSteps,
      }));

      // Automatically open side-by-side Live Preview when previewable HTML/CSS/JS/React/SVG is generated
      // Never trigger automatic workspace/preview navigation during Live Voice Mode
      if (
        !isLiveVoiceTurn &&
        !voiceCallOpenRef.current &&
        settings.autoOpenLivePreview !== false &&
        finalCompletedMsg.text
      ) {
        const autoPreviewPayload = extractPreviewableArtifactFromMessage(
          finalCompletedMsg.text
        );
        if (autoPreviewPayload) {
          setActiveArtifact(autoPreviewPayload);
        }
      }

      setTelemetryLogs(
        appendTelemetryLog(
          {
            provider: actualProvider,
            model: actualModel,
            latencyMs: computedLatencyMs,
            status: 'success',
            inputTokens: Math.ceil(lastUserPrompt.length / 4),
            outputTokens: Math.ceil((finalCompletedMsg.text || '').length / 4),
          },
          settings.telemetryOptOut === true
        )
      );

      // Synchronize ALL persistent sessions (V1 & V2) & memory to Cloud Firestore when authenticated
      if (
        firebaseUser &&
        firebaseUser.emailVerified &&
        !settings.conversationPrivacyMode &&
        !isIncognitoChat
      ) {
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
            const syncedSessionSnapshot = {
              ...(targetSession || { id: chatId, title: 'SMFTA Chat' }),
              id: targetSession?.id ?? chatId,
              title: targetSession?.title || 'SMFTA Chat',
              msgs: [...historyMsgs, finalCompletedMsg],
            };
            firestoreSyncedChatSigsRef.current.set(
              syncedSessionSnapshot.id,
              buildFirestoreChatSyncSignature(syncedSessionSnapshot)
            );
            await syncConversationToFirestore(
              firebaseUser,
              syncedSessionSnapshot,
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

      // v18.11 — task-completion notification, suppressed during Live Voice Mode to prevent unwanted chimes.
      if (!voiceCallOpenRef.current && !isLiveVoiceTurn) {
        notifyUser(
          settings,
          'taskDone',
          'Response ready',
          'Your AI reply has finished generating.'
        );
      }

      if (
        finalText.trim() &&
        (settings.autoVoice || talkMode) &&
        !voiceCallOpenRef.current &&
        !voiceCallOpen
      ) {
        speakText(finalText, aiMsgId, () => {
          if (talkMode && !voiceCallOpenRef.current) {
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
        } else if (bubbleCreated && !appendToMsg) {
          setChats((prev) =>
            prev.map((c) =>
              c.id === chatId
                ? { ...c, msgs: c.msgs.filter((m) => m.id !== aiMsgId) }
                : c
            )
          );
        }
        if (!voiceCallOpenRef.current) {
          showToast('Generation stopped');
        }
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

        // v18.11 — real browser notification for request failures (suppressed in Live Voice Mode).
        if (!voiceCallOpenRef.current) {
          notifyUser(
            settings,
            'errors',
            'Reply failed',
            rawMsg.slice(0, 140)
          );
        }

        const isNetworkFetchErr = errCode === 'NETWORK_ERROR';
        // P1-08: Fix `isQuotaOrRateLimit || true` bug! Only set quotaExhausted on true QUOTA_EXHAUSTED / 402 billing evidence
        const isTrueQuotaExhausted = errCode === 'QUOTA_EXHAUSTED';
        const isRateLimited = errCode === 'RATE_LIMITED';

        const cleanErr = !isV2Request && !isDefaultUnlimitedProfile
          ? formatProviderErrorBn({
              code:
                errCode === 'MODEL_UNAVAILABLE'
                  ? 'MODEL_NOT_FOUND'
                  : errCode === 'NETWORK_ERROR'
                    ? 'UPSTREAM_NETWORK'
                    : errCode,
              httpStatus: null,
              providerLabel: activeDisplayName || activeProvider,
              modelName: effectiveExternalModel || activeModelName,
              rawMessage: rawMsg,
            })
          : isNetworkFetchErr
            ? 'সার্ভারের সাথে সংযোগ বিচ্ছিন্ন হয়েছে। অনুগ্রহ করে Retry বাটনে ট্যাপ করুন অথবা অন্য প্রোভাইডার সিলেক্ট করুন।'
            : rawMsg;
        const finalErrText = cleanErr.startsWith('⚠️')
          ? cleanErr
          : `⚠️ ${cleanErr}`;

        showToast(finalErrText.slice(0, 160), 5000);

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
            message: !isDefaultUnlimitedProfile
              ? cleanErr
              : isTrueQuotaExhausted
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
        setTelemetryLogs(
          appendTelemetryLog(
            {
              provider: activeProvider,
              model: effectiveExternalModel || activeModelName,
              latencyMs: elapsedMs,
              status: 'error',
              errorMessage: rawMsg,
            },
            settings.telemetryOptOut === true
          )
        );
      }
    } finally {
      activeStreamCountRef.current = Math.max(0, activeStreamCountRef.current - 1);
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
      mcpServers,
      dbConnections,
      dataBridgeConfig,
      knowledgeDocs,
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
        mcpServers,
        dbConnections,
        dataBridgeConfig,
        knowledgeDocs,
        includeKeys: false,
      });
      localStorage.setItem(LS_KEYS.rollback, JSON.stringify(snap));
      localStorage.setItem('smfta_last_autobackup_ts', String(Date.now()));
    } catch {
      showToast('⚠️ স্টোরেজ সীমার কারণে রোলব্যাক স্ন্যাপশট সংরক্ষণ করা যায়নি');
    }
  };

  // Automatic local rollback snapshot when Auto Backup is enabled
  useEffect(() => {
    if (!settings.autoBackupEnabled) return;
    const intervalMs = Math.max(1, settings.autoBackupIntervalHours || 24) * 3600 * 1000;
    const checkAndSave = () => {
      try {
        const lastTs = Number(localStorage.getItem('smfta_last_autobackup_ts') || '0');
        if (!Number.isFinite(lastTs) || Date.now() - lastTs >= intervalMs) {
          handleSaveRollbackPoint();
        }
      } catch {
        // ignore storage restrictions
      }
    };
    checkAndSave();
    const timer = window.setInterval(checkAndSave, 15 * 60 * 1000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.autoBackupEnabled, settings.autoBackupIntervalHours]);

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
        if (parsed.mcpServers && parsed.mcpServers.length > 0) {
          handleUpdateMcpServers(parsed.mcpServers);
        }
        if (parsed.dbConnections && parsed.dbConnections.length > 0) {
          handleUpdateDbConnections(parsed.dbConnections);
        }
        if (parsed.dataBridgeConfig) {
          handleUpdateDataBridgeConfig(parsed.dataBridgeConfig);
        }
        if (parsed.knowledgeDocs && parsed.knowledgeDocs.length > 0) {
          handleUpdateKnowledgeDocs(parsed.knowledgeDocs);
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

  // P1-26: Full wipe of all local storage keys, Supabase sessions, and Firestore conversations
  const handleClearChatHistory = () => {
    for (const c of chats) {
      markChatDeleted(c.id);
    }
    firestoreSyncedChatSigsRef.current.clear();
    try {
      localStorage.removeItem(LS_KEYS.chats);
    } catch {
      // ignore storage access errors
    }
    if (cloudClient && userId && cloudReady) {
      clearCloudChatSessions(cloudClient, userId)
        .then(() => syncedSessionVersions.current.clear())
        .catch(() => {});
    }
    if (firebaseUser && firebaseUser.emailVerified) {
      void clearAllFirestoreConversations(firebaseUser).catch(() => {});
    }
    const fresh: ChatSession = {
      id: Date.now(),
      title: 'New Chat',
      titleSource: 'auto',
      msgs: [],
    };
    setChats([fresh]);
    setActiveId(fresh.id);
    showToast('সব চ্যাট হিস্ট্রি স্থায়ীভাবে মুছে ফেলা হয়েছে');
  };

  const handleDeleteCloudData = async () => {
    if (!cloudClient || !userId) {
      showToast('Sign in to a cloud account first to wipe cloud data.');
      return;
    }
    await wipeCloudWorkspace(cloudClient, userId);
    syncedSessionVersions.current.clear();
    setCloudStatus('saved');
    showToast('Cloud account data deleted');
  };

  const handleRotateKeystoreKey = async () => {
    await rotateKeystoreMasterKey(async ({ decryptOld, encryptNew }) => {
      let reencrypted = 0;
      if (settings.externalKeys) {
        const plainSettingsKey = isEncrypted(settings.externalKeys)
          ? await decryptOld(settings.externalKeys)
          : settings.externalKeys;
        if (plainSettingsKey) {
          const sealed = await encryptNew(plainSettingsKey);
          localStorage.setItem(
            LS_KEYS.settings,
            JSON.stringify({ ...settings, externalKeys: sealed })
          );
          reencrypted += 1;
        }
      }
      if (savedProfiles.length > 0) {
        const resealedProfiles = await Promise.all(
          savedProfiles.map(async (p) => {
            if (!p.externalKeys) return p;
            const plain = isEncrypted(p.externalKeys)
              ? await decryptOld(p.externalKeys)
              : p.externalKeys;
            if (plain) reencrypted += 1;
            return { ...p, externalKeys: plain || '' };
          })
        );
        persistSavedProfiles(resealedProfiles);
      }
      if (mcpServers.length > 0) {
        reencrypted += mcpServers.filter((s) => Boolean(s.authSecret)).length;
        await saveMcpServers(mcpServers);
      }
      if (dbConnections.length > 0) {
        reencrypted += dbConnections.filter((d) => Boolean(d.secret)).length;
        await saveDbConnections(dbConnections);
      }
      return reencrypted;
    });
    showToast('Master AES-256-GCM encryption key rotated');
  };

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
      localStorage.removeItem(MCP_STORAGE_KEY);
      localStorage.removeItem(DB_CONNECTIONS_STORAGE_KEY);
      localStorage.removeItem(DB_BRIDGE_CONFIG_STORAGE_KEY);
      localStorage.removeItem(TELEMETRY_LOG_KEY);
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
    setMcpServers([]);
    setDbConnections([]);
    setDataBridgeConfig({
      sourceConnectionId: '',
      destinationConnectionId: '',
      sourceTable: '',
      destinationTable: '',
      syncMode: 'upsert',
      fieldMappings: [],
    });
    setKnowledgeDocs([]);
    setTelemetryLogs([]);
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
  const latestAiMessageObj =
    [...activeChat.msgs].reverse().find((m) => m.role === 'ai') || null;
  const lastAiMessage = latestAiMessageObj?.text || '';
  const lastAiVoiceSnapshot: LiveVoiceMessageSnapshot | null = latestAiMessageObj
    ? {
        id: latestAiMessageObj.id,
        text: latestAiMessageObj.text,
        isError: Boolean(latestAiMessageObj.isError),
      }
    : null;

  const openLiveVoiceSession = () => {
    // Blur any focused composer input so mobile virtual keyboards never pop or click when entering Voice Mode
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    cancelVoiceDictation();
    unlockSharedLiveAudioContext();
    bilingualSpeechPlayer.stop();
    window.speechSynthesis?.cancel();
    setVoiceCallOpen(true);
  };

  const openCoWriterStudio = () => {
    if (!coWriterContent.trim() && lastAiMessage.trim()) {
      setCoWriterTitle(activeChat.title || 'AI Draft');
      setCoWriterContent(lastAiMessage);
    }
    setCoWriterOpen(true);
  };

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

            <div className="pt-2 border-t border-[var(--border)] space-y-2 shrink-0">
              <div className="px-1 flex items-center justify-between">
                <span className="text-[10.5px] font-semibold uppercase tracking-wider text-[var(--ink-dim)]">
                  Studios &amp; Tools
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  data-testid="sidebar-live-voice-btn"
                  onClick={() => {
                    setSidebarOpen(false);
                    openLiveVoiceSession();
                  }}
                  className="col-span-2 px-3 py-2 rounded-xl text-[12.5px] font-semibold bg-sky-500/12 border border-sky-400/25 text-sky-300 hover:bg-sky-500/20 flex items-center justify-between gap-2 cursor-pointer transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <AudioLines className="w-4 h-4 text-sky-400" />
                    <span>Live Voice</span>
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-200">
                    Live
                  </span>
                </button>
                <button
                  type="button"
                  data-testid="sidebar-image-studio-btn"
                  onClick={() => {
                    setSidebarOpen(false);
                    setStudioOpen(true);
                  }}
                  className="px-2.5 py-2 rounded-xl text-[12px] text-[var(--ink-muted)] hover:bg-[var(--surface)] hover:text-[var(--ink)] flex items-center gap-2 cursor-pointer transition-colors border border-transparent hover:border-[var(--border)]"
                >
                  <ImageIcon className="w-3.5 h-3.5 text-[var(--primary)] shrink-0" />
                  <span className="truncate">Image Studio</span>
                </button>
                <button
                  type="button"
                  data-testid="sidebar-diagram-studio-btn"
                  onClick={() => {
                    setSidebarOpen(false);
                    setDiagramOpen(true);
                  }}
                  className="px-2.5 py-2 rounded-xl text-[12px] text-[var(--ink-muted)] hover:bg-[var(--surface)] hover:text-[var(--ink)] flex items-center gap-2 cursor-pointer transition-colors border border-transparent hover:border-[var(--border)]"
                >
                  <GitBranch className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span className="truncate">Diagrams</span>
                </button>
                <button
                  type="button"
                  data-testid="sidebar-cowriter-btn"
                  onClick={() => {
                    setSidebarOpen(false);
                    openCoWriterStudio();
                  }}
                  className="px-2.5 py-2 rounded-xl text-[12px] text-[var(--ink-muted)] hover:bg-[var(--surface)] hover:text-[var(--ink)] flex items-center gap-2 cursor-pointer transition-colors border border-transparent hover:border-[var(--border)]"
                >
                  <FileText className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span className="truncate">Co-Writer</span>
                </button>
                <button
                  type="button"
                  data-testid="sidebar-codelab-btn"
                  onClick={() => {
                    setSidebarOpen(false);
                    setCodeLabOpen(true);
                  }}
                  className="px-2.5 py-2 rounded-xl text-[12px] text-[var(--ink-muted)] hover:bg-[var(--surface)] hover:text-[var(--ink)] flex items-center gap-2 cursor-pointer transition-colors border border-transparent hover:border-[var(--border)]"
                >
                  <Code2 className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                  <span className="truncate">Code Lab</span>
                </button>
                <button
                  type="button"
                  data-testid="sidebar-notebook-btn"
                  onClick={() => {
                    setSidebarOpen(false);
                    setNotebookOpen(true);
                  }}
                  className="px-2.5 py-2 rounded-xl text-[12px] text-[var(--ink-muted)] hover:bg-[var(--surface)] hover:text-[var(--ink)] flex items-center gap-2 cursor-pointer transition-colors border border-transparent hover:border-[var(--border)]"
                >
                  <NotebookPen className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                  <span className="truncate">Notebook</span>
                </button>
                <button
                  type="button"
                  data-testid="sidebar-battle-btn"
                  onClick={() => {
                    setSidebarOpen(false);
                    setBattleOpen(true);
                  }}
                  className="px-2.5 py-2 rounded-xl text-[12px] text-[var(--ink-muted)] hover:bg-[var(--surface)] hover:text-[var(--ink)] flex items-center gap-2 cursor-pointer transition-colors border border-transparent hover:border-[var(--border)]"
                >
                  <Swords className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                  <span className="truncate">AI Battle</span>
                </button>
                <button
                  type="button"
                  data-testid="sidebar-connections-btn"
                  onClick={() => {
                    setSidebarOpen(false);
                    setConnectionsOpen(true);
                  }}
                  className="px-2.5 py-2 rounded-xl text-[12px] text-[var(--ink-muted)] hover:bg-[var(--surface)] hover:text-[var(--ink)] flex items-center gap-2 cursor-pointer transition-colors border border-transparent hover:border-[var(--border)]"
                >
                  <Plug className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                  <span className="truncate">Connections</span>
                </button>
                <button
                  type="button"
                  data-testid="sidebar-stats-btn"
                  onClick={() => {
                    setSidebarOpen(false);
                    setInfoModal('stats');
                  }}
                  className="px-2.5 py-2 rounded-xl text-[12px] text-[var(--ink-muted)] hover:bg-[var(--surface)] hover:text-[var(--ink)] flex items-center gap-2 cursor-pointer transition-colors border border-transparent hover:border-[var(--border)]"
                >
                  <BarChart3 className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                  <span className="truncate">Stats</span>
                </button>
              </div>
            </div>

            <div className="pt-2 border-t border-[var(--border)] space-y-1 shrink-0">
              <button
                type="button"
                data-testid="sidebar-simple-entry-btn"
                onClick={() => {
                  setSimpleEntryModalOpen(true);
                  setSidebarOpen(false);
                }}
                className="w-full px-3 py-2 rounded-xl text-[13px] text-[var(--ink-muted)] hover:bg-[var(--surface)] hover:text-[var(--ink)] flex items-center justify-between gap-2 cursor-pointer"
              >
                <span className="flex items-center gap-2.5 min-w-0 truncate">
                  <KeyRound className="w-4 h-4 text-[var(--primary)] shrink-0" />
                  <span className="truncate">
                    {profile?.name?.trim() || simpleEntryCreds?.name || 'নাম ও পাসওয়ার্ড'}
                  </span>
                </span>
                <span className="text-[10.5px] px-1.5 py-0.5 rounded bg-[var(--surface-2)] border border-[var(--border)] text-[var(--ink-dim)] shrink-0">
                  {simpleEntryCreds ? 'Active' : 'Setup'}
                </span>
              </button>
              <button
                type="button"
                data-testid="sidebar-settings-btn"
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
        <div
          data-testid="app-toast"
          className="fixed top-14 left-1/2 -translate-x-1/2 z-50 max-w-[90vw] truncate bg-[var(--surface-2)] text-[var(--ink)] px-4 py-2 rounded-xl text-xs font-medium shadow-lg border border-[var(--border)] pointer-events-none"
        >
          {toastMsg}
        </div>
      )}

      {/* MAIN WORKSPACE COLUMN + SIDE-BY-SIDE ARTIFACT PREVIEW */}
      <div className="flex-1 flex flex-row min-w-0 h-full overflow-hidden">
        {currentView === 'workspace' ? (
          <div className="flex-1 flex flex-col min-w-0 h-full">
            <CodeWorkspacePage
              initialPayload={workspacePayload}
              onBackToChat={handleBackFromWorkspace}
              codeFontSize={settings.codeFontSize}
            />
          </div>
        ) : (
          <>
          <main className={`v2-main flex-1 min-w-0${activeChat.msgs.length === 0 && !isWaitingFirstToken ? ' is-empty' : ''}`}>
            {/* HEADER — Screenshot 1 & 4: Staggered Menu Left, Quiet Brand, Pill Group [New Chat | •••] Right */}
            <header className="app-header">
              <div className="flex items-center gap-2 min-w-0">
                <button
                  type="button"
                  data-testid="drawer-menu-btn"
                  onClick={() => setSidebarOpen(true)}
                  className="ref-circle-btn shrink-0"
                  aria-label="Open menu"
                  title="Conversations & Navigation"
                >
                  <StaggeredMenuIcon className="w-4 h-4" />
                </button>
                <div
                  data-testid="app-header-brand"
                  className="inline-flex items-center gap-2 min-w-0"
                >
                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-lg bg-[var(--primary)]/15 border border-[var(--primary)]/30 text-[var(--primary)] shrink-0">
                    <Sparkles className="w-3.5 h-3.5" />
                  </span>
                  <span className="text-[15px] font-bold tracking-tight text-[var(--ink)] truncate">
                    SMFTA AI Pro
                  </span>
                  {activeModelLabel && (
                    <span className="hidden xs:inline-flex items-center px-2 py-0.5 rounded-md bg-[var(--surface-2)] border border-[var(--border)] text-[11px] font-medium text-[var(--ink-dim)] truncate max-w-[140px]">
                      {activeModelLabel}
                    </span>
                  )}
                </div>

                {/* Active Project Selector Pill (Section ঘ: Projects) */}
                {(settings.projects || []).length > 0 && (
                  <select
                    data-testid="active-project-selector"
                    value={activeChat.projectId || ''}
                    onChange={(e) => {
                      const nextProjId = e.target.value || undefined;
                      setChats((prev) =>
                        prev.map((c) =>
                          c.id === activeChat.id
                            ? { ...c, projectId: nextProjId }
                            : c
                        )
                      );
                    }}
                    className="max-w-[130px] sm:max-w-[180px] px-2.5 py-1 rounded-full bg-[var(--surface-2)] border border-[var(--border)] text-[11px] font-medium text-[var(--ink)] outline-none cursor-pointer truncate"
                    title="এই চ্যাটের প্রজেক্ট নির্বাচন করুন"
                  >
                    <option value="">প্রজেক্ট ছাড়া চ্যাট</option>
                    {(settings.projects || []).map((proj) => (
                      <option key={proj.id} value={proj.id}>
                        📁 {proj.name}
                      </option>
                    ))}
                  </select>
                )}

                {activeChat.incognito && (
                  <span
                    data-testid="incognito-active-badge"
                    className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[11px] font-semibold shrink-0"
                    title="Incognito চ্যাট চালু আছে — কোনো মেমোরি বা হিস্ট্রি সেভ হবে না"
                  >
                    <EyeOff className="w-3 h-3" />
                    <span className="hidden xs:inline">Incognito</span>
                  </span>
                )}
              </div>

              <div className="relative flex items-center gap-1.5">
                <div className="ref-pill-group">
                  {(latestChatArtifact || activeArtifact) && (
                    <button
                      type="button"
                      data-testid="header-live-preview-toggle"
                      onClick={() => {
                        if (activeArtifact) {
                          setActiveArtifact(null);
                        } else if (latestChatArtifact) {
                          setActiveArtifact(latestChatArtifact);
                        }
                      }}
                      className={`ref-pill-icon-btn ${
                        activeArtifact ? 'text-[var(--primary)]' : ''
                      }`}
                      aria-label="Toggle side-by-side live preview"
                      title={
                        activeArtifact
                          ? 'পাশাপাশি লাইভ প্রিভিউ বন্ধ করুন'
                          : 'পাশাপাশি লাইভ প্রিভিউ খুলুন (Live Preview)'
                      }
                    >
                      <Eye className="w-[16px] h-[16px]" />
                    </button>
                  )}
                  <button
                    type="button"
                    data-testid="header-simple-entry-btn"
                    onClick={() => setSimpleEntryModalOpen(true)}
                    className="ref-pill-icon-btn"
                    aria-label="নাম ও পাসওয়ার্ড প্রোফাইল"
                    title={
                      profile?.name?.trim()
                        ? `প্রোফাইল: ${profile.name.trim()} (নাম ও পাসওয়ার্ড)`
                        : 'নাম ও পাসওয়ার্ড দিয়ে প্রবেশ করুন'
                    }
                  >
                    <User className="w-[16px] h-[16px]" />
                  </button>
                  <button
                    type="button"
                    data-testid="incognito-chat-toggle"
                    onClick={() => {
                      const nextIncog = !activeChat.incognito;
                      setChats((prev) =>
                        prev.map((c) =>
                          c.id === activeChat.id
                            ? { ...c, incognito: nextIncog }
                            : c
                        )
                      );
                      showToast(
                        nextIncog
                          ? '🕶️ Incognito চ্যাট চালু — মেমোরি ও হিস্ট্রি সেভ হবে না'
                          : 'Incognito চ্যাট বন্ধ করা হয়েছে'
                      );
                    }}
                    className={`ref-pill-icon-btn ${
                      activeChat.incognito ? 'text-amber-400' : ''
                    }`}
                    aria-label="Incognito chat toggle"
                    aria-pressed={Boolean(activeChat.incognito)}
                    title={
                      activeChat.incognito
                        ? 'Incognito চ্যাট বন্ধ করুন'
                        : 'Incognito চ্যাট (মেমোরি ও হিস্ট্রি ছাড়া চ্যাট)'
                    }
                  >
                    <EyeOff className="w-[16px] h-[16px]" />
                  </button>
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
                      className="absolute right-0 top-full mt-2 w-52 bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-2xl p-1.5 z-40 space-y-0.5 text-xs"
                    >
                      <button
                        type="button"
                        data-testid="header-menu-simple-entry"
                        onClick={() => {
                          setSimpleEntryModalOpen(true);
                          setHeaderMenuOpen(false);
                        }}
                        className="w-full text-left px-3 py-2 rounded-xl flex items-center gap-2 text-[var(--ink)] hover:bg-[var(--surface-2)] cursor-pointer transition-colors font-medium"
                      >
                        <KeyRound className="w-3.5 h-3.5 text-[var(--primary)]" />
                        <span className="truncate">
                          {profile?.name?.trim()
                            ? `${profile.name.trim()} (নাম ও পাসওয়ার্ড)`
                            : 'নাম ও পাসওয়ার্ড সেটআপ'}
                        </span>
                      </button>

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

                      <div className="my-1 border-t border-[var(--border)]" />

                      <button
                        type="button"
                        data-testid="header-menu-live-voice"
                        onClick={() => {
                          setHeaderMenuOpen(false);
                          openLiveVoiceSession();
                        }}
                        className="w-full text-left px-3 py-2 rounded-xl flex items-center gap-2 text-sky-300 hover:bg-sky-500/15 cursor-pointer transition-colors font-semibold"
                      >
                        <AudioLines className="w-3.5 h-3.5 text-sky-400" />
                        <span>Live Voice</span>
                      </button>

                      <button
                        type="button"
                        data-testid="header-menu-image-studio"
                        onClick={() => {
                          setHeaderMenuOpen(false);
                          setStudioOpen(true);
                        }}
                        className="w-full text-left px-3 py-2 rounded-xl flex items-center gap-2 text-[var(--ink)] hover:bg-[var(--surface-2)] cursor-pointer transition-colors font-medium"
                      >
                        <ImageIcon className="w-3.5 h-3.5 text-[var(--primary)]" />
                        <span>Image Studio</span>
                      </button>

                      <button
                        type="button"
                        data-testid="header-menu-diagram-studio"
                        onClick={() => {
                          setHeaderMenuOpen(false);
                          setDiagramOpen(true);
                        }}
                        className="w-full text-left px-3 py-2 rounded-xl flex items-center gap-2 text-[var(--ink)] hover:bg-[var(--surface-2)] cursor-pointer transition-colors font-medium"
                      >
                        <GitBranch className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Diagram Studio</span>
                      </button>

                      <button
                        type="button"
                        data-testid="header-menu-cowriter"
                        onClick={() => {
                          setHeaderMenuOpen(false);
                          openCoWriterStudio();
                        }}
                        className="w-full text-left px-3 py-2 rounded-xl flex items-center gap-2 text-[var(--ink)] hover:bg-[var(--surface-2)] cursor-pointer transition-colors font-medium"
                      >
                        <FileText className="w-3.5 h-3.5 text-amber-400" />
                        <span>Co-Writer</span>
                      </button>

                      <button
                        type="button"
                        data-testid="header-menu-notebook"
                        onClick={() => {
                          setHeaderMenuOpen(false);
                          setNotebookOpen(true);
                        }}
                        className="w-full text-left px-3 py-2 rounded-xl flex items-center gap-2 text-[var(--ink)] hover:bg-[var(--surface-2)] cursor-pointer transition-colors font-medium"
                      >
                        <NotebookPen className="w-3.5 h-3.5 text-violet-400" />
                        <span>Notebook</span>
                      </button>

                      <button
                        type="button"
                        data-testid="header-menu-connections"
                        onClick={() => {
                          setHeaderMenuOpen(false);
                          setConnectionsOpen(true);
                        }}
                        className="w-full text-left px-3 py-2 rounded-xl flex items-center gap-2 text-[var(--ink)] hover:bg-[var(--surface-2)] cursor-pointer transition-colors font-medium"
                      >
                        <Plug className="w-3.5 h-3.5 text-cyan-400" />
                        <span>Connections</span>
                      </button>

                      <div className="my-1 border-t border-[var(--border)]" />

                      <button
                        type="button"
                        data-testid="header-menu-incognito"
                        onClick={() => {
                          const nextIncog = !activeChat.incognito;
                          setChats((prev) =>
                            prev.map((c) =>
                              c.id === activeChat.id
                                ? { ...c, incognito: nextIncog }
                                : c
                            )
                          );
                          setHeaderMenuOpen(false);
                          showToast(
                            nextIncog
                              ? '🕶️ Incognito চ্যাট চালু — মেমোরি ও হিস্ট্রি সেভ হবে না'
                              : 'Incognito চ্যাট বন্ধ করা হয়েছে'
                          );
                        }}
                        className="w-full text-left px-3 py-2 rounded-xl flex items-center gap-2 text-[var(--ink)] hover:bg-[var(--surface-2)] cursor-pointer transition-colors font-medium"
                      >
                        <EyeOff className="w-3.5 h-3.5 text-amber-400" />
                        <span>
                          {activeChat.incognito
                            ? 'Incognito বন্ধ করুন'
                            : 'Incognito চ্যাট'}
                        </span>
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
                  <div className="empty-state" data-testid="ultra-empty-home">
                    <SunburstMarkIcon className="ref-sunburst" />
                    <h1 className="empty-title">What can I help with?</h1>
                  </div>
                ) : (
              <div className="w-full max-w-[780px] mx-auto">
                {activeChat.msgs.map((m, msgIdx) => {
                  const prevUserMsg =
                    m.role === 'ai'
                      ? activeChat.msgs
                          .slice(0, msgIdx)
                          .reverse()
                          .find((x) => x.role === 'user')
                      : undefined;
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
                          <InteractiveMessageContent
                            messageId={m.id}
                            text={m.text}
                            thinking={m.thinking}
                            thinkingDurationSec={m.thinkingDurationSec}
                            statusSteps={m.statusSteps}
                            thinkingEnabled={
                              settings.thinkingEnabled !== false &&
                              settings.thinkingMode !== 'off'
                            }
                            liveThinkingSummary={
                              settings.liveThinkingSummary !== false
                            }
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
                            onOpenCodeLab={(code, lang, filename, title, bundleFiles) => {
                              const cleanLang = (lang || 'html').trim().toLowerCase();
                              setActiveArtifact({
                                title: title || filename || `${cleanLang.toUpperCase()} Artifact`,
                                filename,
                                lang: cleanLang,
                                code,
                                bundleFiles,
                              });
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
                            userPromptPreview={prevUserMsg?.text || ''}
                            showThinkingTopic={settings.showThinkingTopic !== false}
                            autoCollapseThinking={Boolean(settings.autoCollapseThinking)}
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
                        </div>
                      )}

                      {/* Message Bottom Action Row (Outside message text, hidden while streaming) */}
                      {streamingMsgId !== m.id && (() => {
                        const latestAiMsg = [...activeChat.msgs]
                          .reverse()
                          .find((x) => x.role === 'ai');
                        const isLatestAiMsg =
                          m.role === 'ai' && latestAiMsg?.id === m.id;
                        const submitFeedback = async (
                          rating: 'up' | 'down',
                          reasonText?: string
                        ) => {
                          const fb = {
                            rating,
                            reason: reasonText?.trim() || undefined,
                            createdAt: Date.now(),
                          };
                          updateMessageInChat(activeChat.id, m.id, (old) => ({
                            ...old,
                            feedback: fb,
                          }));
                          setFeedbackReasonMsgId(null);
                          setFeedbackReasonInput('');
                          showToast(
                            rating === 'up'
                              ? 'ধন্যবাদ! আপনার মতামত সংরক্ষিত হয়েছে'
                              : 'মতামত সংরক্ষিত হয়েছে'
                          );
                          try {
                            await fetch('/api/feedback', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                messageId: m.id,
                                sessionId: String(activeChat.id),
                                rating,
                                reason: fb.reason || '',
                                model: m.modelUsed || m.requestedModel || activeModelName,
                                provider: m.providerUsed || m.requestedProvider || '',
                              }),
                            });
                          } catch {
                            // Offline feedback stays saved on message in local/cloud session
                          }
                        };

                        return (
                          <div className="flex flex-col gap-1.5 mt-1">
                            <div
                              data-testid={`msg-actions-${m.role}`}
                              className={`msg-actions flex items-center gap-0.5 ${
                                m.role === 'ai'
                                  ? isLatestAiMsg
                                    ? 'opacity-100 -ml-1.5'
                                    : 'opacity-85 sm:opacity-0 sm:group-hover:opacity-100 focus-within:opacity-100 hover:opacity-100 transition-opacity -ml-1.5'
                                  : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100 hover:opacity-100 transition-opacity'
                              }`}
                            >
                              {m.role === 'ai' ? (
                                <>
                                  <button
                                    type="button"
                                    data-testid="msg-copy-btn"
                                    onClick={() => {
                                      const { cleanResponse } =
                                        extractThinkingAndResponse(
                                          m.text,
                                          m.thinking
                                        );
                                      navigator.clipboard?.writeText(
                                        stripContactTokensForText(
                                          cleanResponse || m.text
                                        )
                                      );
                                      showToast('কপি করা হয়েছে');
                                    }}
                                    className="w-7 h-7 rounded-lg inline-flex items-center justify-center text-[var(--ink-dim)] hover:text-[var(--ink)] hover:bg-[var(--surface-2)] transition-colors cursor-pointer"
                                    title="Copy"
                                    aria-label="Copy response"
                                  >
                                    <Copy className="w-4 h-4" />
                                  </button>

                                  <button
                                    type="button"
                                    data-testid="msg-feedback-up-btn"
                                    onClick={() => void submitFeedback('up')}
                                    className={`w-7 h-7 rounded-lg inline-flex items-center justify-center hover:bg-[var(--surface-2)] transition-colors cursor-pointer ${
                                      m.feedback?.rating === 'up'
                                        ? 'text-[var(--ink)] bg-[var(--surface-2)]'
                                        : 'text-[var(--ink-dim)] hover:text-[var(--ink)]'
                                    }`}
                                    title="Like"
                                    aria-label="Good response"
                                  >
                                    <ThumbsUp className="w-4 h-4" />
                                  </button>

                                  <button
                                    type="button"
                                    data-testid="msg-feedback-down-btn"
                                    onClick={() => {
                                      void submitFeedback('down');
                                      if (feedbackReasonMsgId === m.id) {
                                        setFeedbackReasonMsgId(null);
                                      } else {
                                        setFeedbackReasonMsgId(m.id);
                                        setFeedbackReasonInput(
                                          m.feedback?.reason || ''
                                        );
                                      }
                                    }}
                                    className={`w-7 h-7 rounded-lg inline-flex items-center justify-center hover:bg-[var(--surface-2)] transition-colors cursor-pointer ${
                                      m.feedback?.rating === 'down'
                                        ? 'text-[var(--ink)] bg-[var(--surface-2)]'
                                        : 'text-[var(--ink-dim)] hover:text-[var(--ink)]'
                                    }`}
                                    title="Dislike"
                                    aria-label="Bad response"
                                  >
                                    <ThumbsDown className="w-4 h-4" />
                                  </button>

                                  <button
                                    type="button"
                                    data-testid="msg-retry-btn"
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
                                    className="w-7 h-7 rounded-lg inline-flex items-center justify-center text-[var(--ink-dim)] hover:text-[var(--ink)] hover:bg-[var(--surface-2)] transition-colors cursor-pointer"
                                    title="Retry"
                                    aria-label="Retry response"
                                  >
                                    <RotateCcw className="w-4 h-4" />
                                  </button>

                                  <button
                                    type="button"
                                    data-testid="msg-speak-btn"
                                    onClick={() => {
                                      if (speakingMsgId === m.id) {
                                        bilingualSpeechPlayer.stop();
                                      } else {
                                        speakText(m.text, m.id);
                                      }
                                    }}
                                    className={`h-7 px-2 rounded-lg inline-flex items-center gap-1.5 text-[11.5px] font-medium transition-colors cursor-pointer ${
                                      speakingMsgId === m.id
                                        ? 'bg-[var(--primary-soft)] text-[var(--primary)] border border-[var(--primary-border)]'
                                        : 'text-[var(--ink-dim)] hover:text-[var(--ink)] hover:bg-[var(--surface-2)]'
                                    }`}
                                    title={speakingMsgId === m.id ? 'থামান' : 'পড়ে শোনাও'}
                                    aria-label={speakingMsgId === m.id ? 'পড়া থামান' : 'পড়ে শোনাও'}
                                  >
                                    {speakingMsgId === m.id ? (
                                      <>
                                        <Square className="w-3 h-3 fill-current" />
                                        <span>থামান</span>
                                      </>
                                    ) : (
                                      <>
                                        <Volume2 className="w-3.5 h-3.5" />
                                        <span className="hidden sm:inline">পড়ে শোনাও</span>
                                      </>
                                    )}
                                  </button>

                                  {speakingMsgId === m.id && speechBackupActive && (
                                    <span
                                      data-testid="msg-backup-voice-notice"
                                      className="text-[11px] text-amber-400/90 px-1"
                                    >
                                      ব্যাকআপ ভয়েস চলছে
                                    </span>
                                  )}
                                </>
                              ) : (
                                <button
                                  type="button"
                                  data-testid="user-msg-copy-btn"
                                  onClick={() => {
                                    navigator.clipboard?.writeText(
                                      cleanUserText || m.text
                                    );
                                    showToast('কপি করা হয়েছে');
                                  }}
                                  className="w-7 h-7 rounded-lg inline-flex items-center justify-center text-[var(--ink-dim)] hover:text-[var(--ink)] hover:bg-[var(--surface-2)] transition-colors cursor-pointer"
                                  title="Copy"
                                  aria-label="Copy message"
                                >
                                  <Copy className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>

                            {/* Optional Short Reason Box when "খারাপ উত্তর" is clicked */}
                            {m.role === 'ai' && feedbackReasonMsgId === m.id && (
                              <div
                                data-testid="feedback-reason-box"
                                className="flex flex-wrap items-center gap-2 p-2.5 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] max-w-md"
                              >
                                <input
                                  type="text"
                                  data-testid="feedback-reason-input"
                                  value={feedbackReasonInput}
                                  onChange={(e) =>
                                    setFeedbackReasonInput(e.target.value)
                                  }
                                  placeholder="কেন উত্তরটি ভালো লাগেনি? (ঐচ্ছিক)"
                                  className="flex-1 min-w-[180px] px-2.5 py-1.5 rounded-lg bg-[var(--bg)] border border-[var(--border)] text-xs text-[var(--text)] outline-none"
                                />
                                <button
                                  type="button"
                                  data-testid="feedback-reason-submit"
                                  onClick={() =>
                                    void submitFeedback(
                                      'down',
                                      feedbackReasonInput
                                    )
                                  }
                                  className="px-3 py-1.5 rounded-lg bg-[var(--primary)] text-white text-xs font-semibold cursor-pointer"
                                >
                                  জমা দিন
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setFeedbackReasonMsgId(null)}
                                  className="px-2 py-1.5 rounded-lg text-xs text-[var(--text-2)] hover:text-[var(--text)] cursor-pointer"
                                >
                                  বাতিল
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                  );
                })}

                {/* Direct Groq-style Thinking indicator before first token (zero Processing/Confirming intermediate screens) */}
                {isWaitingFirstToken && (() => {
                  const lastUser = [...activeChat.msgs]
                    .reverse()
                    .find((x) => x.role === 'user');
                  const waitingSubject = deriveInitialThinkingTopic(
                    lastUser?.text || ''
                  );
                  return (
                    <div className="msg-row is-ai">
                      <div
                        data-testid="thinking-accordion"
                        className="mt-0 mb-2.5 select-none"
                      >
                        <div
                          data-testid="thinking-accordion-headline"
                          className="inline-flex items-center gap-2 py-1 px-2.5 -ml-1.5 rounded-lg text-[13px] font-medium text-[var(--primary)]"
                        >
                          <Brain className="w-3.5 h-3.5 animate-pulse shrink-0" />
                          <span className="font-semibold animate-pulse">
                            Thinking... 0.1s
                          </span>
                          <span
                            data-testid="thinking-subject-label"
                            className="text-[12.5px] font-medium text-[var(--ink-dim)] truncate max-w-[240px]"
                          >
                            · {waitingSubject}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })()}
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

                {decryptionAlertProfileName && (
                  <div
                    data-testid="decryption-alert-banner"
                    className="w-full max-w-[780px] mb-3 px-3.5 py-2.5 rounded-xl border border-rose-500/35 bg-rose-500/10 flex flex-wrap items-center justify-between gap-2 text-xs text-rose-200"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                      <span className="truncate">
                        {decryptionAlertProfileName}: এই ঠিকানায় আগের সেভ করা কী পড়া যায় না, আবার দিন।
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        data-testid="decryption-reenter-btn"
                        onClick={() => {
                          setDecryptionAlertProfileName(null);
                          setSettingsTab('providers');
                          setSettingsOpen(true);
                        }}
                        className="px-2.5 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 border border-rose-400/30 text-rose-100 font-medium cursor-pointer transition-colors"
                      >
                        আবার কী দিন
                      </button>
                      <button
                        type="button"
                        onClick={() => setDecryptionAlertProfileName(null)}
                        className="p-1 text-rose-300 hover:text-white cursor-pointer"
                        aria-label="Dismiss"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
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

                  {(isListening || isTranscribingVoice) && !voiceCallOpen ? (
                    <VoiceWaveformBar
                      isListening={isListening}
                      isTranscribing={isTranscribingVoice}
                      speechActivityAt={voiceActivityAt}
                      liveText={voiceLiveText}
                      audioStream={voiceAudioStream}
                      onCancel={cancelVoiceDictation}
                      onConfirm={() => {
                        void confirmVoiceDictation();
                      }}
                    />
                  ) : (
                    <>
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

                      {/* Unified Composer Toolbar */}
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
                            data-testid="voice-mic-btn"
                            onClick={toggleMic}
                            className="composer-icon"
                            title="Voice Input"
                            aria-label="Voice Input"
                          >
                            <Mic className="w-4 h-4" />
                          </button>

                          <button
                            type="button"
                            data-testid="live-voice-launch-btn"
                            onClick={openLiveVoiceSession}
                            className="composer-icon text-sky-400 hover:bg-sky-500/15 hover:text-sky-300"
                            title="Live Voice Conversation"
                            aria-label="Live Voice Conversation"
                          >
                            <AudioLines className="w-4 h-4" />
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
                    </>
                  )}
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

                      {/* Primary Model Group (Flash / V5 at Top, Pro & Max at Bottom) */}
                      <div className="ref-sheet-group" data-testid="v2-model-options-list">
                        {sortV2ModelsFlashFirst(V2_SPECIAL_MODELS).map((spec) => {
                          const isSelectedV2 =
                            activeIsBuiltin && activeModelName === spec.id;
                          const tierChip =
                            spec.id === 'smfta-v5'
                              ? 'Flash'
                              : spec.id === 'smfta-v2-pro'
                                ? 'Pro'
                                : 'Max';
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
                              <div className="flex flex-col items-start flex-1 min-w-0 text-left">
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <span className="ref-sheet-row-title truncate">
                                    {spec.label}
                                  </span>
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[var(--surface)] border border-[var(--border)] text-[var(--ink-muted)] shrink-0">
                                    {tierChip}
                                  </span>
                                </div>
                                <span className="text-[11px] text-[var(--ink-dim)] truncate w-full">
                                  {spec.desc}
                                </span>
                              </div>
                              {isSelectedV2 && (
                                <Check className="w-4 h-4 text-[var(--accent-sky)] shrink-0" />
                              )}
                            </button>
                          );
                        })}
                      </div>

                      {/* More Models (Built-in Tiers + Custom Providers) */}
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
                                  <span className="ref-sheet-row-title truncate">
                                    {tier.label}
                                  </span>
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
                                    <div className="px-4 pt-2 pb-1 text-[11px] font-medium text-[var(--ink-dim)] truncate">
                                      {customProf.name}
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

                            <button
                              type="button"
                              data-testid="sheet-manage-providers-btn"
                              onClick={() => {
                                setBottomModelMenuOpen(false);
                                setSettingsTab('providers');
                                setSettingsOpen(true);
                              }}
                              className="ref-sheet-row border-t border-[var(--border)] text-[var(--primary)] font-medium"
                            >
                              <span className="text-[13.5px]">
                                + Add or Manage Custom Providers
                              </span>
                              <Settings className="w-4 h-4 shrink-0" />
                            </button>
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

          {/* Claude.ai-Style Right-Side Live Code & Artifact Preview Panel */}
          <ClaudeArtifactPanel
            artifact={activeArtifact}
            onClose={() => setActiveArtifact(null)}
            onSelectBundleFile={(bf) =>
              setActiveArtifact((prev) =>
                prev
                  ? {
                      ...prev,
                      title: bf.title || bf.filename,
                      filename: bf.filename,
                      lang: bf.lang,
                      code: bf.content,
                    }
                  : null
              )
            }
            onToast={showToast}
          />
          </>
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

      <LiveVoiceOverlay
        isOpen={voiceCallOpen}
        chatId={activeChat.id}
        userName={profile?.name || settings.displayName}
        preferredLang={settings.vlang || settings.appLanguage || 'auto'}
        preferredVoice={settings.ttsVoice}
        realtimeMode={Boolean(settings.liveVoiceRealtimeMode)}
        onChangePreferredVoice={(nextVoice) => {
          setSettings((prev) =>
            sanitizeSettings({ ...prev, ttsVoice: nextVoice })
          );
        }}
        onToggleRealtimeMode={(enabled) => {
          setSettings((prev) =>
            sanitizeSettings({ ...prev, liveVoiceRealtimeMode: enabled })
          );
        }}
        isListening={isListening}
        isGenerating={isGenerating}
        isTranscribing={isTranscribingVoice}
        liveTranscript={voiceLiveText}
        micStream={voiceAudioStream}
        messages={activeChat.msgs}
        lastUserText={lastUserMessage}
        lastAiMessage={lastAiVoiceSnapshot}
        onToggleMic={toggleMic}
        onCancelMic={cancelVoiceDictation}
        onAbortGeneration={() => {
          abortRef.current?.abort();
        }}
        onSendText={(text, attachments) => {
          void handleSend(text, attachments);
        }}
        onEndCall={() => {
          abortRef.current?.abort();
          cancelVoiceDictation();
          bilingualSpeechPlayer.stop();
          setVoiceCallOpen(false);
          window.speechSynthesis?.cancel();
        }}
      />

      <DiagramStudioModal
        isOpen={diagramOpen}
        onClose={() => setDiagramOpen(false)}
        projectId={activeChat.projectId || `chat-${activeChat.id}`}
        onToast={showToast}
      />

      <CoWriterDrawer
        isOpen={coWriterOpen}
        onClose={() => setCoWriterOpen(false)}
        title={coWriterTitle}
        onChangeTitle={setCoWriterTitle}
        content={coWriterContent}
        onChangeContent={setCoWriterContent}
        onOpenCodeLab={(code) => {
          setCodeLabInit(code);
          setCodeLabOpen(true);
        }}
        onToast={showToast}
      />

      <NotebookModal
        isOpen={notebookOpen}
        onClose={() => setNotebookOpen(false)}
        notes={notes}
        onChange={setNotes}
        connections={connections}
        onUpdateConnections={handleUpdateConnections}
        notify={showToast}
        onAskAI={(promptText) => {
          setNotebookOpen(false);
          void handleSend(promptText);
        }}
      />

      <ConnectionsModal
        isOpen={connectionsOpen}
        onClose={() => setConnectionsOpen(false)}
        connections={connections}
        onChange={handleUpdateConnections}
        notes={notes}
        notify={showToast}
        onOpenNotebook={() => {
          setConnectionsOpen(false);
          setNotebookOpen(true);
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
        mcpServers={mcpServers}
        onUpdateMcpServers={handleUpdateMcpServers}
        dbConnections={dbConnections}
        onUpdateDbConnections={handleUpdateDbConnections}
        dataBridgeConfig={dataBridgeConfig}
        onUpdateDataBridgeConfig={handleUpdateDataBridgeConfig}
        knowledgeDocs={knowledgeDocs}
        onUpdateKnowledgeDocs={handleUpdateKnowledgeDocs}
        telemetryLogs={telemetryLogs}
        onClearTelemetryLogs={handleClearTelemetryLogs}
        onRotateKeystoreKey={handleRotateKeystoreKey}
        onClearChatHistory={handleClearChatHistory}
        onDeleteCloudData={handleDeleteCloudData}
        cloudConnected={Boolean(cloudClient && userId)}
        cloudUserEmail={auth.user?.email || undefined}
        activeProjectId={activeChat.projectId || undefined}
        onSelectActiveProject={(projId) => {
          setChats((prev) =>
            prev.map((c) =>
              c.id === activeChat.id
                ? { ...c, projectId: projId || undefined }
                : c
            )
          );
          showToast(
            projId
              ? 'প্রজেক্ট এই চ্যাটে যুক্ত করা হয়েছে'
              : 'প্রজেক্ট এই চ্যাট থেকে সরানো হয়েছে'
          );
        }}
        onOpenSimpleEntryModal={() => {
          setSettingsOpen(false);
          setSimpleEntryModalOpen(true);
        }}
      />

      {/* Simple Name + Password Entry Modal (No Login/Registration Required) */}
      <SimpleEntryModal
        isOpen={simpleEntryModalOpen}
        storedCredentials={simpleEntryCreds}
        defaultName={profile?.name || settings.displayName || ''}
        isLockedGate={Boolean(settings.simpleEntryRequireOnLoad && !simpleEntryCreds)}
        onClose={() => setSimpleEntryModalOpen(false)}
        onSuccess={(creds) => {
          setSimpleEntryCreds(creds);
          setProfile((prev) => ({ ...prev, name: creds.name }));
          setSettings((prev) =>
            sanitizeSettings({
              ...prev,
              displayName: creds.name,
              nickname: creds.name,
              simpleEntryPasscode: creds.passwordHash,
            })
          );
          setSimpleEntryModalOpen(false);
          showToast(`স্বাগতম, ${creds.name}! সব ফিচার সক্রিয় আছে।`);
        }}
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
