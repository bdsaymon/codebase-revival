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
  Cpu,
  AlertTriangle,
  Zap,
  User,
  MessageSquare,
  Send,
  Moon,
  Sun,
  Sparkles,
  Code2,
  FileArchive,
  Play,
  LayoutTemplate,
  PenLine,
  Brain,
  Image as ImageIcon,
  LayoutGrid,
  FolderOpen,
  ArrowUpRight,
  Wand2,
  LayoutDashboard,
  CircleHelp,
  Server,
  Loader2,
  LogOut,
} from 'lucide-react';
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
  PromptBankModal,
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
import { CodeBlockInfo } from './utils/livePreview';
import {
  buildStarterDemoPage,
  extractCodeBlocks,
  hasPreviewableCode,
  isWebsiteBuildRequest,
} from './utils/livePreview';
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
  extractMemoryCandidates,
  factsToText,
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
  const [profile, setProfile] = useState<UserProfile>(() =>
    loadJSON<UserProfile>(LS_KEYS.profile, { name: 'Bossবোদা' })
  );
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
  // v18.2.0 memory bank: migrate the old flat list, then restore from the
  // backup key if the primary copy was ever wiped by a storage error.
  const [memory, setMemory] = useState<string[]>(() => {
    const primary = loadJSON<unknown>(LS_KEYS.memory, []);
    const primaryFacts = migrateMemory(primary).facts;
    if (primaryFacts.length > 0) return factsToText(primaryFacts);
    const backup = loadJSON<unknown>(LS_KEYS.memoryBackup, []);
    return factsToText(migrateMemory(backup).facts);
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
  const [promptBankOpen, setPromptBankOpen] = useState(false);
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

  const activeAvailableModels = getModelsForProfile(activeProfile);

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
    // Picking a built-in tier also switches the reasoning mode so request and
    // label stay consistent; external models only change the model id.
    const tier = BUILTIN_TIERS.find((t) => t.model === trimmed);
    setSettings((prev) =>
      sanitizeSettings(
        tier
          ? { ...prev, externalModel: trimmed, mode: tier.id }
          : { ...prev, externalModel: trimmed }
      )
    );
    if (activeProfile) {
      const updated = savedProfiles.map((p) =>
        p.id === activeProfile.id ? { ...p, externalModel: trimmed } : p
      );
      handleUpdateProfiles(updated);
    }
    setBottomModelMenuOpen(false);
    showToast(tier ? `Model: ${tier.label}` : `Model: ${trimmed}`);
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

  // Speech synthesis
  const speakText = (text: string, msgId?: string, onDone?: () => void) => {
    if (!('speechSynthesis' in window) || !text) {
      onDone?.();
      return;
    }
    window.speechSynthesis.cancel();
    if (msgId && speakingMsgId === msgId) {
      setSpeakingMsgId(null);
      return;
    }
    const clean = text
      .replace(/```[\s\S]*?```/g, ' code block ')
      .replace(/[#*_>`~]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 1400);

    const utter = new SpeechSynthesisUtterance(clean);
    const isBn = /[\u0980-\u09FF]/.test(clean);
    const pref = (settings.vlang || 'bn-BD').slice(0, 2);
    const voices = window.speechSynthesis.getVoices() || [];
    const voice =
      voices.find((v) => v.lang?.startsWith(pref)) ||
      voices.find((v) => v.lang?.startsWith(isBn ? 'bn' : 'en'));
    if (voice) {
      utter.voice = voice;
      utter.lang = voice.lang;
    } else {
      utter.lang = isBn ? 'bn-BD' : settings.vlang;
    }
    utter.onend = () => {
      setSpeakingMsgId(null);
      onDone?.();
    };
    utter.onerror = () => {
      setSpeakingMsgId(null);
      onDone?.();
    };
    if (msgId) setSpeakingMsgId(msgId);
    utter.rate = Math.min(2.0, Math.max(0.5, settings.voiceSpeed || 1.0));
    window.speechSynthesis.speak(utter);
  };

  // Voice Recognition (Mic)
  const toggleMic = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      showToast('Voice input works in Chrome / Edge');
      return;
    }
    if (isListening && recogRef.current) {
      recogRef.current.stop();
      setIsListening(false);
      return;
    }
    const r = new SR();
    r.lang = settings.vlang || 'bn-BD';
    r.interimResults = true;
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
      if ((talkMode || voiceCallOpen) && finalTranscript.trim()) {
        handleSend(finalTranscript.trim());
      }
    };
    r.onerror = () => setIsListening(false);
    recogRef.current = r;
    try {
      r.start();
      setIsListening(true);
      showToast('Listening — speak now');
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

    // 4. Auto-extract implicit user memory when autoMemory is enabled
    let currentMemory = [...memory];
    if (settings.autoMemory !== false) {
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

      // Initialize Multi-Step Task Plan if request describes a workflow or multiple steps
      if (isMultiStepRequest(rawTxt)) {
        setActiveTaskPlan(
          parseTaskPlanFromText(rawTxt) ||
            createTaskPlan('Multi-step Task Execution', [{ title: rawTxt.slice(0, 80) }])
        );
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

    try {
      // v18.11 + v19.0 — history is user-controlled: off sends only the current
      // prompt; on, the count follows maxHistoryMessages (1..40, default 24).
      const historyLimit =
        settings.includeHistory === false
          ? 1
          : Math.min(40, Math.max(1, settings.maxHistoryMessages ?? 24));
      const contextSlice = historyMsgs
        .slice(-historyLimit)
        .map((m) => ({
          role: m.role,
          text: m.text,
          imgs: m.imgs?.map((im) => ({ mime: im.mime, data: im.data })),
        }));

      const lastUserPrompt =
        contextSlice[contextSlice.length - 1]?.text?.trim() || '';
      const hasAttachedImgs = Boolean(
        contextSlice[contextSlice.length - 1]?.imgs?.length
      );

      const targetSession = chats.find((c) => c.id === chatId) || activeChat;
      const contextRelevantMemory = retrieveRelevantMemories(
        lastUserPrompt,
        latestMemory || memory,
        12
      );

      // Build 7-Layer Smart Conversation Context (Parts 7–10)
      const smartCtx =
        settings.includeHistory === false
          ? null
          : buildSmartConversationContext({
              messages: historyMsgs,
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
        userName: profile.name || 'Boss',
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
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
          if (abortCtrl.signal.aborted) break;
          try {
            const res = await fetch('/api/chat/stream', {
              method: 'POST',
              headers: streamReqHeaders,
              body: requestBody,
              signal: abortCtrl.signal,
            });
            if (
              (res.status === 502 || res.status === 503 || res.status === 504) &&
              attempt < maxRetries
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
            if (attempt < maxRetries && !abortCtrl.signal.aborted) {
              await new Promise((r) => setTimeout(r, 120));
              continue;
            }
          }
        }
      }

      let bubbleCreated = Boolean(appendToMsg);
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
          bubbleCreated = true;
          setIsWaitingFirstToken(false);
          setStreamingMsgId(aiMsgId);
          // P1-12: Preserve request start timestamp (reqStart), never reveal animation paint timestamp
          appendMessageToChat(chatId, {
            id: aiMsgId,
            role: 'ai',
            text: visible || ' ',
            thinking: liveThinking || undefined,
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
            text: visible || ' ',
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
                  | 'progress';
                ok?: boolean;
                code?: string;
                step?: string;
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
        await pipeSSE(response);
      } else if (response && !response.ok) {
        const errPayload = await response.json().catch(() => null);
        const httpErr = new Error(
          errPayload?.error || errPayload?.message || `HTTP ${response.status}`
        ) as Error & { code?: string };
        httpErr.code = errPayload?.errorCode;
        throw httpErr;
      } else {
        // Standalone APK or direct client-side fallback
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

      if (
        isWebsiteBuildRequest(lastUserPrompt) &&
        !hasPreviewableCode(extractCodeBlocks(finalText))
      ) {
        finalText +=
          '\n\nনিচে একটি চলমান ডেমো — চ্যাটের Live Preview বাটনে ক্লিক করে দেখুন।' +
          '\n\n```html\n' +
          buildStarterDemoPage(lastUserPrompt, 'SMFTA Live Demo') +
          '\n```';
      }

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

      updateMessageInChat(chatId, aiMsgId, (m) => ({
        ...m,
        text: finalText || cleanText || accumulated,
        thinking: extractedThinking || liveThinking || m.thinking || undefined,
        status: 'complete',
        turnId,
        requestId: responderMeta.requestId,
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
      }));

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

        // P1-05: Only fallback to built-in keyless engine if user explicitly enabled allowKeylessFallback AND no partial tokens were painted yet
        if (
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
      setActiveTaskPlan((prev) => {
        if (!prev || prev.status === 'completed' || prev.status === 'cancelled') return prev;
        return advanceTaskPlan(prev, { success: true });
      });
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
      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white px-5 py-2.5 rounded-xl text-xs font-medium shadow-lg border border-slate-700">
          {toastMsg}
        </div>
      )}

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/45 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* SIDEBAR: VARIATION 2 (SMFTA AI PRO | HIGH DENSITY) */}
      <aside
        className={`v2-sidebar fixed lg:static inset-y-0 left-0 z-40 transition-transform duration-200 ${
          currentView === 'workspace'
            ? 'hidden'
            : sidebarOpen
              ? 'translate-x-0'
              : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="sb-brand">
          <div className="sb-mark" aria-hidden="true">S</div>
          <div className="sb-brand-text">
            <div className="sb-brand-title">SMFTA AI</div>
            <div className="sb-brand-sub">Assistant</div>
          </div>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="icon-btn lg:hidden"
            title="Close sidebar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <button
          type="button"
          onClick={() => {
            handleNewChat();
            setCurrentView('chat');
            setSidebarOpen(false);
          }}
          className="sb-new"
        >
          <Plus className="w-4 h-4" />
          <span>New chat</span>
        </button>

        <nav className="sb-nav">
          <button
            type="button"
            onClick={() => {
              setCurrentView('chat');
              setSidebarOpen(false);
            }}
            className={`sb-nav-item ${currentView === 'chat' ? 'active' : ''}`}
          >
            <MessageSquare className="w-4 h-4" />
            <span>Chats</span>
            <span className="sb-nav-count">{chats.filter((c) => c.msgs.length > 0).length}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setNotebookOpen(true);
              setSidebarOpen(false);
            }}
            className="sb-nav-item"
          >
            <FileText className="w-4 h-4" />
            <span>Notebook</span>
            {notes.length > 0 && <span className="sb-nav-count">{notes.length}</span>}
          </button>
          <button
            type="button"
            onClick={() => {
              setConnectionsOpen(true);
              setSidebarOpen(false);
            }}
            className="sb-nav-item"
          >
            <Cloud className="w-4 h-4" />
            <span>Connectors</span>
            {connections.drive.connected || connections.github.connected ? (
              <span className="sb-nav-count" style={{ color: '#10b981' }}>Linked</span>
            ) : (
              <span className="sb-nav-count">Connect</span>
            )}
          </button>
          <button
            type="button"
            onClick={() => {
              setCurrentView('settings');
              setSettingsTab('general');
              setSidebarOpen(false);
            }}
            className={`sb-nav-item ${currentView === 'settings' ? 'active' : ''}`}
          >
            <Settings className="w-4 h-4" />
            <span>Settings</span>
          </button>
        </nav>

        {/* v18.9 redesign — Syntrix-style feature launcher */}
        <div className="sb-feature-label">Tools</div>
        <nav className="sb-features" aria-label="Feature shortcuts">
          <button
            type="button"
            className="sb-feature"
            onClick={() => {
              setStudioOpen(true);
              setSidebarOpen(false);
            }}
          >
            <ImageIcon className="w-4 h-4" />
            <span>Images</span>
          </button>
          <button
            type="button"
            className="sb-feature"
            onClick={() => {
              handleOpenCodeWorkspace([], 0);
              setSidebarOpen(false);
            }}
          >
            <Code2 className="w-4 h-4" />
            <span>Codex</span>
          </button>
          <button
            type="button"
            className="sb-feature"
            onClick={() => {
              setPromptBankOpen(true);
              setSidebarOpen(false);
            }}
          >
            <LayoutGrid className="w-4 h-4" />
            <span>Apps</span>
          </button>
          <button
            type="button"
            className="sb-feature"
            onClick={() => {
              fileInputRef.current?.click();
              setSidebarOpen(false);
            }}
          >
            <FolderOpen className="w-4 h-4" />
            <span>Projects</span>
          </button>
        </nav>

        <div className="sb-search">
          <Search className="w-3.5 h-3.5" style={{ color: 'var(--ink-dim)', flexShrink: 0 }} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search chats"
            aria-label="Search chats"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="text-[var(--ink-dim)] hover:text-[var(--ink)] cursor-pointer"
              title="Clear"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        <div className="sb-section">
          <span>{searchQuery ? 'Results' : 'Your chats'}</span>
          <span style={{ textTransform: 'none', letterSpacing: 0 }}>{filteredChats.length}</span>
        </div>

        <div className="sb-history">
          {filteredChats.length === 0 && (
            <div className="px-2 py-3 text-[var(--ink-dim)]" style={{ fontSize: 12 }}>
              {searchQuery ? 'No chats match your search.' : 'No conversations yet.'}
            </div>
          )}
          {filteredChats.map((c) => {
            const isAct = c.id === activeChat.id && currentView === 'chat';
            return (
              <div
                key={c.id}
                onClick={() => {
                  setActiveId(c.id);
                  setCurrentView('chat');
                  setSidebarOpen(false);
                }}
                className={`sb-chat ${isAct ? 'active' : ''}`}
              >
                {renamingChatId === c.id ? (
                  <input
                    type="text"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const nextTitle = renameValue.trim();
                        setChats((prev) =>
                          prev.map((ch) =>
                            ch.id === c.id && nextTitle
                              ? {
                                  ...ch,
                                  title: nextTitle,
                                  titleSource: 'user' as const,
                                }
                              : ch
                          )
                        );
                        setRenamingChatId(null);
                      } else if (e.key === 'Escape') {
                        setRenamingChatId(null);
                      }
                    }}
                    onBlur={() => setRenamingChatId(null)}
                    autoFocus
                    className="flex-1 min-w-0 bg-[var(--bg)] border border-[var(--primary)] px-1.5 py-0.5 text-xs text-[var(--ink)] outline-none rounded"
                  />
                ) : (
                  <span className="sb-chat-title" title={c.title}>
                    {c.pinned ? '' : ''}
                    {c.title}
                  </span>
                )}

                <button
                  type="button"
                  aria-expanded={chatRowMenuId === c.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    setChatRowMenuId((prev) => (prev === c.id ? null : c.id));
                  }}
                  className="sb-chat-more"
                  title="Chat options"
                >
                  <MoreVertical className="w-3.5 h-3.5" />
                </button>

                {chatRowMenuId === c.id && (
                  <>
                    <div
                      className="fixed inset-0 z-[55]"
                      onClick={(e) => {
                        e.stopPropagation();
                        setChatRowMenuId(null);
                      }}
                    />
                    <div className="sb-menu" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={(e) => {
                          handleTogglePin(e, c.id);
                          setChatRowMenuId(null);
                        }}
                      >
                        <Pin className="w-3.5 h-3.5" />
                        {c.pinned ? 'Unpin chat' : 'Pin chat'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setRenamingChatId(c.id);
                          setRenameValue(c.title);
                          setChatRowMenuId(null);
                        }}
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                        Rename
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          handleExportChatMarkdown();
                          setChatRowMenuId(null);
                        }}
                      >
                        <Download className="w-3.5 h-3.5" />
                        Export
                      </button>
                      <div className="sb-menu-sep" />
                      <button
                        type="button"
                        className="danger"
                        onClick={(e) => {
                          handleDeleteChat(e, c.id);
                          setChatRowMenuId(null);
                        }}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Delete
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>

        {/* Provider setup shortcut — functional, no promotional copy */}
        <div className="sb-upgrade">
          <div className="sb-upgrade-icon">
            <Zap className="w-3.5 h-3.5" />
          </div>
          <div className="sb-upgrade-title">AI providers</div>
          <p className="sb-upgrade-text">
            নিজের AI key যোগ করে আরও মডেল ব্যবহার করুন।
          </p>
          <button
            type="button"
            className="sb-upgrade-btn"
            onClick={() => {
              setSettingsTab('engine');
              setCurrentView('settings');
              setSidebarOpen(false);
            }}
          >
            <Server className="w-3.5 h-3.5" />
            Open providers
          </button>
        </div>

        <div className="sb-footer">
          <div
            onClick={() => {
              setSettingsTab('account');
              setCurrentView('settings');
              setSidebarOpen(false);
            }}
            className="flex items-center gap-2.5 min-w-0 flex-1 cursor-pointer"
            title="Profile & settings"
          >
            <div className="sb-avatar">
              {settings.avatarDataUrl ? (
                <img
                  src={settings.avatarDataUrl}
                  alt=""
                  className="sb-avatar-img"
                />
              ) : profile.name ? (
                profile.name.trim().charAt(0).toUpperCase()
              ) : (
                'S'
              )}
            </div>
            <div className="sb-user">
              <div className="sb-user-name">{profile.name || 'Your profile'}</div>
              <div className="sb-user-meta" title={auth.user?.email || ''}>
                {auth.configured
                  ? auth.user?.email || 'Local workspace'
                  : 'Local workspace'}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="icon-btn"
            title="Settings"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>

      </aside>

      {/* MAIN WORKSPACE COLUMN */}
      <div className="flex-1 flex flex-col min-w-0 h-full">
        {currentView === 'workspace' ? (
          <CodeWorkspacePage
            initialPayload={workspacePayload}
            onBackToChat={handleBackFromWorkspace}
            codeFontSize={settings.codeFontSize}
          />
        ) : currentView === 'settings' ? (
          <SettingsModal
            isOpen={true}
            variant="inline"
            initialTab={settingsTab}
            onClose={() => setCurrentView('chat')}
            profile={profile}
            settings={settings}
            memory={memory}
            savedProfiles={savedProfiles}
            onUpdateProfiles={handleUpdateProfiles}
            onSelectProfile={handleSelectProfile}
            onSave={(newProf, newSet) => {
              setProfile(newProf);
              setSettings(sanitizeSettings(newSet));
            }}
            onProviderTestResult={(status) => setProviderTestStatus(status)}
            onResetSettings={() => {
              setSettings({ ...DEFAULT_SETTINGS });
              showToast('Default settings restored ↺');
            }}
            onUpdateMemory={(next) => {
              memoryRef.current = next;
              setMemory(next);
            }}
            onClearMemory={() => {
              forgetAllMemory();
              showToast('Memory cleared');
            }}
            onExportBackup={handleExportBackup}
            onImportBackup={(e) => {
              handleSaveRollbackPoint();
              handleImportBackup(e);
            }}
            onSaveRollbackPoint={handleSaveRollbackPoint}
            onRollback={handleRollback}
            hasRollbackPoint={true}
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
            keystoreEphemeral={keystoreEphemeral}
            usageToday={usageToday}
            onOpenSkill={(sk) => {
              const widget =
                selfWidgets.find((w) => w.id === `w-${sk.id}`) ||
                ({
                  id: `w-${sk.id}`,
                  title: sk.name,
                  description: sk.description,
                  code: sk.code || '',
                  enabled: true,
                  createdAt: sk.createdAt,
                } as SelfUpdateWidget);
              setActiveWidgetModal(widget);
            }}
          />
        ) : (
          <main className={`v2-main${activeChat.msgs.length === 0 && !isWaitingFirstToken ? ' is-empty' : ''}`}>
            {/* HEADER — quiet, product-grade chrome */}
            <header className="app-header">
              <button
                type="button"
                onClick={() => setSidebarOpen((v) => !v)}
                className="icon-btn lg:hidden"
                title="Toggle sidebar"
              >
                <Menu className="w-5 h-5" />
              </button>

              <div className="app-header-title">
                <strong>{activeChat.msgs.length > 0 ? activeChat.title : 'New chat'}</strong>
              </div>

              <div className="app-header-actions">
                {/* v20 clean header — two clear actions */}
                <div className="app-header-nav" aria-label="Chat actions">
                  <button
                    type="button"
                    className="hdr-btn"
                    onClick={() => {
                      handleNewChat();
                      setCurrentView('chat');
                    }}
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span className="hdr-label">New Chat</span>
                  </button>
                  <button
                    type="button"
                    className="hdr-btn"
                    onClick={handleExportChatMarkdown}
                    disabled={activeChat.msgs.length === 0}
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span className="hdr-label">Export</span>
                  </button>
                </div>
                <button
                  type="button"
                  className="icon-btn hdr-theme"
                  onClick={() =>
                    setSettings((prev) => sanitizeSettings({
                      ...prev,
                      theme: prev.theme === 'dark' ? 'light' : 'dark',
                    }))
                  }
                  title={settings.theme === 'dark' ? 'Light theme' : 'Dark theme'}
                >
                  {settings.theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                </button>


                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setHeaderMenuOpen((v) => !v)}
                    className="icon-btn"
                    aria-expanded={headerMenuOpen}
                    title="More options"
                  >
                    <MoreVertical className="w-4.5 h-4.5" />
                  </button>

                  {headerMenuOpen && (
                    <>
                      <div className="fixed inset-0 z-[60]" onClick={() => setHeaderMenuOpen(false)} />
                      <div className="menu z-[70]">
                        <div className="menu-label">Workspace</div>
                        <button
                          type="button"
                          onClick={() => {
                            setHeaderMenuOpen(false);
                            handleNewChat();
                          }}
                        >
                          <Plus className="w-4 h-4" />
                          <span>New chat</span>
                        </button>
                        {activeChat.msgs.length > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              setHeaderMenuOpen(false);
                              setInChatSearchOpen(true);
                            }}
                          >
                            <Search className="w-4 h-4" />
                            <span>Search in chat</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setHeaderMenuOpen(false);
                            handleExportChatMarkdown();
                          }}
                          disabled={activeChat.msgs.length === 0}
                        >
                          <Download className="w-4 h-4" />
                          <span>Export chat</span>
                        </button>

                        <div className="menu-sep" />
                        <div className="menu-label">Preferences</div>
                        <button
                          type="button"
                          onClick={() =>
                            setSettings((prev) => sanitizeSettings({
                              ...prev,
                              theme: prev.theme === 'dark' ? 'light' : 'dark',
                            }))
                          }
                        >
                          {settings.theme === 'dark' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
                          <span>{settings.theme === 'dark' ? 'Light theme' : 'Dark theme'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setHeaderMenuOpen(false);
                            setSettingsTab('general');
                            setCurrentView('settings');
                          }}
                        >
                          <Settings className="w-4 h-4" />
                          <span>Settings</span>
                        </button>

                        {activeChat.msgs.length > 0 && (
                          <>
                            <div className="menu-sep" />
                            <button
                              type="button"
                              onClick={() => {
                                setHeaderMenuOpen(false);
                                handleClearActiveChat();
                              }}
                            >
                              <RotateCcw className="w-4 h-4" />
                              <span>Clear messages</span>
                            </button>
                            <button
                              type="button"
                              className="danger"
                              onClick={(e) => {
                                setHeaderMenuOpen(false);
                                handleDeleteChat(e, activeChat.id);
                              }}
                            >
                              <Trash2 className="w-4 h-4" />
                              <span>Delete this chat</span>
                            </button>
                          </>
                        )}
                      </div>
                    </>
                  )}
                </div>

                {/* v18.9 redesign — account avatar (desktop) */}
                <button
                  type="button"
                  className="app-header-avatar"
                  onClick={() => {
                    setSettingsTab('account');
                    setCurrentView('settings');
                  }}
                  title="Profile & settings"
                >
                  {settings.avatarDataUrl ? (
                    <img
                      src={settings.avatarDataUrl}
                      alt=""
                      className="sb-avatar-img"
                    />
                  ) : profile.name ? (
                    profile.name.trim().charAt(0).toUpperCase()
                  ) : (
                    'S'
                  )}
                </button>
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
                    <h1 className="empty-title">SMFTA AI</h1>
                    <p className="empty-sub">What can I help with?</p>
                  </div>
                ) : (
              <div className="w-full max-w-[900px] mx-auto">
                {activeChat.msgs.map((m) => (
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
                        <div className="msg-user-bubble">
                          {m.text.replace(
                            /⟦FILE:([^\n⟦]+)⟧[\s\S]*?⟦\/FILE⟧/g,
                            (_match, fname) => `[Attached File: ${fname}]`
                          )}
                          {m.imgs && m.imgs.length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-2">
                              {m.imgs.map((im, idx) => (
                                <img
                                  key={idx}
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
                                  className="w-20 h-20 object-cover rounded-lg border border-white/25 cursor-zoom-in"
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="w-full min-w-0">
                          <div className="msg-ai-head">
                            <div className="msg-ai-avatar">
                              <Sparkles className="w-3.5 h-3.5" />
                            </div>
                            <span className="msg-ai-name">
                              {activeDisplayName === 'Msfta shop ai'
                                ? 'SMFTA Pro'
                                : activeDisplayName}
                            </span>
                            <span className="msg-ai-model">{activeModelLabel}</span>
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
                            onOpenCodeWorkspace={(blocks, selectedIdx, msgId) =>
                              handleOpenCodeWorkspace(
                                blocks,
                                selectedIdx ?? 0,
                                msgId || m.id
                              )
                            }
                            onToast={showToast}
                            renderMarkdown={settings.markdownRender !== false}
                            highlightCode={settings.codeHighlight !== false}
                          />

                          {/* Self-Update & Memory Confirmation Banner */}
                          {(m.selfUpdateSummary ||
                            m.selfUpdateWidgetId ||
                            (m.memoryAdded && m.memoryAdded.length > 0)) && (
                            <div className="mt-3 flex flex-wrap items-center gap-2">
                              {m.selfUpdateSummary && (
                                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs font-medium text-emerald-500">
                                  <Zap className="w-3.5 h-3.5 shrink-0" />
                                  <span>
                                    Self-updated: {m.selfUpdateSummary}
                                  </span>
                                </div>
                              )}
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
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--primary)] text-white text-xs font-semibold shadow-xs hover:opacity-90 cursor-pointer"
                                >
                                  <Cpu className="w-3.5 h-3.5" />
                                  <span>Open Live Widget</span>
                                </button>
                              )}
                              {m.memoryAdded && m.memoryAdded.length > 0 && (
                                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-[var(--primary-soft)] border border-[var(--primary-border)] text-[11px] text-[var(--primary)]">
                                  <span>Memory saved</span>
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
                ))}

                {/* Live, honest pipeline status before the first answer token.
                    Only connection/processing/streaming phases are shown —
                    never fabricated model reasoning. */}
                {isWaitingFirstToken && (
                  <div className="msg-row is-ai">
                    <div className="msg-ai-head">
                      <div className="msg-ai-avatar">
                        <Sparkles className="w-3.5 h-3.5" />
                      </div>
                      <span className="msg-ai-name">SMFTA Pro</span>
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
                      <button
                        type="button"
                        onClick={() => {
                          setSettingsTab('engine');
                          setSettingsOpen(true);
                        }}
                        className="hdr-btn limit-banner-chip"
                      >
                        Providers ঠিক করুন
                      </button>
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
                      activeDisplayName === 'Msfta shop ai'
                        ? 'SMFTA Pro'
                        : activeDisplayName
                    } anything…`}
                    className="w-full bg-transparent border-none outline-none resize-none text-[15px] text-[var(--ink)] placeholder:text-[var(--ink-dim)] min-h-[48px] max-h-[160px] leading-relaxed pl-7 pr-3 pt-3.5"
                  />
                  <Sparkles className="composer-input-spark" aria-hidden="true" />
                  </div>

                  {/* Unified Bottom Bar Inside Chat Box (+ | Mic | Web  ...  Model Pill | Paper-Plane Send) */}
                  <div className="composer-bar">
                    <div className="flex items-center gap-1.5">
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
                        onClick={toggleMic}
                        className={`composer-icon ${isListening ? 'is-on' : ''}`}
                        title={isListening ? 'Stop Listening' : 'Voice Input'}
                      >
                        <Mic className="w-4 h-4" />
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

                      {/* v18.9 redesign — Syntrix-style tool pills */}
                      <button
                        type="button"
                        className="composer-pill"
                        onClick={() => setPromptBankOpen(true)}
                        title="Open the tool and prompt library"
                      >
                        <Wand2 className="w-3.5 h-3.5" />
                        <span className="composer-pill-label">Tools</span>
                        <ChevronDown className="w-3 h-3 opacity-60" />
                      </button>
                      <button
                        type="button"
                        className={`composer-pill ${settings.mode === 'power' ? 'is-on' : ''}`}
                        onClick={() => {
                          const nextPower = settings.mode !== 'power';
                          const nextMode = nextPower ? 'power' : 'balanced';
                          setSettings((prev) => {
                            const next = sanitizeSettings({ ...prev, mode: nextMode });
                            // Keep the built-in tier model id aligned with the
                            // mode so selector label and request never diverge.
                            if (activeIsBuiltin) {
                              next.externalModel = builtinTierForModel(
                                null,
                                nextMode
                              ).model;
                            }
                            return next;
                          });
                          if (activeIsBuiltin && activeProfile) {
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
                          showToast(nextPower ? 'Deep Think on — power mode' : 'Deep Think off — balanced mode');
                        }}
                        title="Deep Think: slower, deeper reasoning"
                      >
                        <Brain className="w-3.5 h-3.5" />
                        <span className="composer-pill-label">Deep Think</span>
                        <ChevronDown className="w-3 h-3 opacity-60" />
                      </button>
                    </div>

                    <div className="flex items-center gap-2 min-w-0">
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setBottomModelMenuOpen((v) => !v)}
                          className="chip-btn composer-model"
                          title="Switch Active AI Model"
                        >
                          <span className="truncate max-w-[125px] sm:max-w-[180px]">
                            {activeModelLabel}
                          </span>
                          <ChevronDown className="w-3.5 h-3.5 opacity-70 shrink-0" />
                        </button>

                        {bottomModelMenuOpen && (
                          <>
                            <div
                              className="fixed inset-0 z-30"
                              onClick={() => setBottomModelMenuOpen(false)}
                            />
                            <div className="absolute right-0 bottom-full mb-2 w-80 bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-2xl p-2 z-40 space-y-2 max-h-[70vh] overflow-y-auto">
                              {!activeIsBuiltin && (
                                <div>
                                  <div className="pt-1 px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)] flex items-center justify-between">
                                    <span>Active provider models</span>
                                    <span className="text-[var(--primary)] truncate max-w-[58%]">
                                      {activeDisplayName}
                                    </span>
                                  </div>
                                  <div className="max-h-40 overflow-y-auto space-y-0.5">
                                    {activeAvailableModels.length === 0 ? (
                                      <p className="px-3 py-2.5 text-[11px] leading-relaxed text-[var(--ink-dim)]">
                                        No verified model yet. Add or test this
                                        provider in Settings — only models that
                                        actually respond are listed here.
                                      </p>
                                    ) : (
                                      activeAvailableModels.map((mId) => {
                                        const isCurrentModel =
                                          mId === activeModelName;
                                        return (
                                          <button
                                            key={mId}
                                            type="button"
                                            onClick={() => {
                                              handleSelectModel(mId);
                                              setBottomModelMenuOpen(false);
                                            }}
                                            className={`w-full text-left px-3 py-2 text-xs font-mono rounded-xl flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                                              isCurrentModel
                                                ? 'bg-[var(--primary-soft)] text-[var(--primary)] font-semibold'
                                                : 'text-[var(--ink)] hover:bg-[var(--surface-2)]'
                                            }`}
                                          >
                                            <span className="truncate">{mId}</span>
                                            {isCurrentModel && (
                                              <Check className="w-3.5 h-3.5 shrink-0" />
                                            )}
                                          </button>
                                        );
                                      })
                                    )}
                                  </div>
                                </div>
                              )}

                              {savedProfiles
                                .filter(
                                  (p) =>
                                    !isBuiltinProviderId(p.provider) &&
                                    p.enabled !== false &&
                                    (activeIsBuiltin || p.id !== activeProfile?.id)
                                )
                                .map((customProf) => {
                                  const vModels = getModelsForProfile(customProf);
                                  if (vModels.length === 0) return null;
                                  const isProfVerified =
                                    customProf.verified === true ||
                                    customProf.verificationStatus === 'verified';
                                  return (
                                    <div
                                      key={customProf.id}
                                      className="pt-1.5 border-t border-[var(--border)]"
                                    >
                                      <div className="px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)] flex items-center justify-between">
                                        <span className="truncate max-w-[65%]">
                                          {customProf.name}
                                        </span>
                                        <span
                                          className={`font-semibold ${
                                            isProfVerified
                                              ? 'text-emerald-500'
                                              : 'text-amber-500'
                                          }`}
                                        >
                                          {isProfVerified ? 'Verified' : 'Custom'}
                                        </span>
                                      </div>
                                      <div className="space-y-0.5 max-h-32 overflow-y-auto">
                                        {vModels.map((mId) => (
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
                                            className="w-full text-left px-3 py-1.5 text-xs font-mono rounded-xl flex items-center justify-between gap-2 cursor-pointer transition-colors text-[var(--ink)] hover:bg-[var(--surface-2)]"
                                          >
                                            <span className="truncate">{mId}</span>
                                            <span className="text-[10px] text-[var(--ink-dim)]">
                                              Switch
                                            </span>
                                          </button>
                                        ))}
                                      </div>
                                    </div>
                                  );
                                })}

                              <div
                                className={
                                  !activeIsBuiltin
                                    ? 'pt-1.5 border-t border-[var(--border)]'
                                    : ''
                                }
                              >
                                <div className="px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)] flex items-center justify-between">
                                  <span>SMFTA built-in engine</span>
                                  <span className="text-[var(--primary)] font-semibold">
                                    Keyless
                                  </span>
                                </div>
                                <div className="space-y-0.5">
                                  {BUILTIN_TIERS.map((tier) => {
                                    const isSelectedTier =
                                      activeIsBuiltin &&
                                      activeModelName === tier.model;
                                    return (
                                      <button
                                        key={tier.model}
                                        type="button"
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
                                        className={`w-full text-left px-3 py-2 text-xs rounded-xl flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                                          isSelectedTier
                                            ? 'bg-[var(--primary)] text-white font-semibold'
                                            : 'text-[var(--ink)] hover:bg-[var(--surface-2)]'
                                        }`}
                                      >
                                        <div className="min-w-0">
                                          <div className="font-semibold">
                                            {tier.label}
                                          </div>
                                          <div
                                            className={`text-[10px] truncate ${
                                              isSelectedTier
                                                ? 'text-white/80'
                                                : 'text-[var(--ink-dim)]'
                                            }`}
                                          >
                                            {tier.desc}
                                          </div>
                                        </div>
                                        {isSelectedTier && (
                                          <Check className="w-3.5 h-3.5 shrink-0" />
                                        )}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>

                              <div className="pt-1.5 border-t border-[var(--border)]">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setBottomModelMenuOpen(false);
                                    setSettingsTab('engine');
                                    setSettingsOpen(true);
                                  }}
                                  className="w-full px-2 py-2 text-xs text-[var(--primary)] hover:bg-[var(--surface-2)] rounded-xl text-center cursor-pointer font-semibold"
                                >
                                  Settings &amp; API providers
                                </button>
                              </div>
                            </div>
                          </>
                        )}
                      </div>

                      <button
                        type="button"
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
                      >
                        {isGenerating ? (
                          <Square className="w-4 h-4 fill-current" />
                        ) : (
                          <Send className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>

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

      <PromptBankModal
        isOpen={promptBankOpen}
        onClose={() => setPromptBankOpen(false)}
        onSelectPrompt={(p) => handleSend(p)}
        onUsePrompt={(p) => {
          setInputText(p);
          requestAnimationFrame(() => {
            composerRef.current?.focus();
            const len = p.length;
            composerRef.current?.setSelectionRange(len, len);
          });
          showToast('Prompt added to composer — edit or send');
        }}
        notify={showToast}
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

      <SettingsModal
        isOpen={settingsOpen}
        initialTab={settingsTab}
        onClose={() => setSettingsOpen(false)}
        profile={profile}
        settings={settings}
        memory={memory}
        savedProfiles={savedProfiles}
        onUpdateProfiles={handleUpdateProfiles}
        onSelectProfile={handleSelectProfile}
        onSave={(newProf, newSet) => {
          setProfile(newProf);
          setSettings(sanitizeSettings(newSet));
        }}
        onProviderTestResult={(status) => setProviderTestStatus(status)}
        onResetSettings={() => {
          setSettings({ ...DEFAULT_SETTINGS });
          showToast('Default settings restored ↺');
        }}
        onUpdateMemory={(next) => {
          memoryRef.current = next;
          setMemory(next);
        }}
        onClearMemory={() => {
          forgetAllMemory();
          showToast('Memory cleared');
        }}
        onExportBackup={handleExportBackup}
        onImportBackup={(e) => {
          handleSaveRollbackPoint();
          handleImportBackup(e);
        }}
        onSaveRollbackPoint={handleSaveRollbackPoint}
        onRollback={handleRollback}
        hasRollbackPoint={true}
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
        keystoreEphemeral={keystoreEphemeral}
        usageToday={usageToday}
        onOpenSkill={(sk) => {
          const widget =
            selfWidgets.find((w) => w.id === `w-${sk.id}`) ||
            ({
              id: `w-${sk.id}`,
              title: sk.name,
              description: sk.description,
              code: sk.code || '',
              enabled: true,
              createdAt: sk.createdAt,
            } as SelfUpdateWidget);
          setActiveWidgetModal(widget);
        }}
      />

      {/* CODE WORKSPACE — code, running site, .zip download */}
      <CodeWorkspaceModal
        isOpen={codeWorkspace !== null}
        onClose={() => setCodeWorkspace(null)}
        blocks={codeWorkspace?.blocks || []}
        title={codeWorkspace?.title}
        notify={showToast}
      />

      {/* CLOUD CONNECTORS (first-class, always reachable) */}
      <ConnectionsModal
        isOpen={connectionsOpen}
        onClose={() => setConnectionsOpen(false)}
        connections={connections}
        onChange={handleUpdateConnections}
        notes={notes}
        notify={showToast}
        onOpenNotebook={() => setNotebookOpen(true)}
      />

      {/* AI NOTEBOOK (Google-Notebook style workspace) */}
      <NotebookModal
        isOpen={notebookOpen}
        onClose={() => setNotebookOpen(false)}
        notes={notes}
        onChange={setNotes}
        connections={connections}
        onUpdateConnections={handleUpdateConnections}
        notify={showToast}
        onAskAI={(prompt) => {
          setNotebookOpen(false);
          setCurrentView('chat');
          handleSend(prompt);
        }}
      />

      {/* Command Palette (Ctrl+K) */}
      {cmdkOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/55 flex items-start justify-center pt-20 p-4"
          onClick={(e) => e.target === e.currentTarget && setCmdkOpen(false)}
        >
          <div className="w-full max-w-md rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-3.5 shadow-xl space-y-2">
            <input
              type="text"
              value={cmdkQuery}
              onChange={(e) => setCmdkQuery(e.target.value)}
              placeholder="Type a command (New Chat, Search, Settings)..."
              autoFocus
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3.5 py-2.5 text-sm text-[var(--text)] outline-none focus:border-[var(--primary)]"
            />
            <div className="max-h-64 overflow-y-auto space-y-1">
              {[
                {
                  label: 'Start a New Chat (নতুন চ্যাট)',
                  run: () => handleNewChat(),
                },
                {
                  label: 'Search in Conversation (কথোপকথন খুঁজুন)',
                  run: () => setInChatSearchOpen(true),
                },
                {
                  label: 'Open Control Center (সেটিংস)',
                  run: () => {
                    setSettingsTab('general');
                    setCurrentView('settings');
                  },
                },
                {
                  label: 'Open AI Notebook (নোট লিখুন)',
                  run: () => setNotebookOpen(true),
                },
                {
                  label: 'Cloud Connectors — Google Drive / GitHub',
                  run: () => setConnectionsOpen(true),
                },
                {
                  label: 'Connect Google Drive (গুগল ড্রাইভ কানেক্ট)',
                  run: () => setConnectionsOpen(true),
                },
                {
                  label: 'Connect GitHub (গিটহাব কানেক্ট)',
                  run: () => setConnectionsOpen(true),
                },
                {
                  label: 'Run Self-Check & Auto-Repair (নিজেকে সারাও)',
                  run: () => handleSelfRepair(),
                },
                {
                  label: 'Toggle Autonomy FULL / SAFE (সম্পূর্ণ নিয়ন্ত্রণ)',
                  run: () =>
                    setAutonomy((prev) => (prev === 'full' ? 'safe' : 'full')),
                },
                {
                  label: 'AI Self-Control (নিজেকে আপডেট করার কন্ট্রোল)',
                  run: () => {
                    setSettingsTab('self');
                    setCurrentView('settings');
                  },
                },
                {
                  label: 'Open Code Workspace (HTML/CSS/JS)',
                  run: () => handleOpenCodeWorkspace([], 0),
                },
                {
                  label: 'Code Workspace — AI-র শেষ কোড খোলো (Open in Workspace)',
                  run: () => {
                    const lastWithCode = [...(activeChat?.msgs || [])]
                      .reverse()
                      .find(
                        (m) =>
                          m.role === 'ai' &&
                          hasPreviewableCode(extractCodeBlocks(m.text))
                      );
                    const blocks = lastWithCode
                      ? extractCodeBlocks(lastWithCode.text)
                      : [];
                    handleOpenCodeWorkspace(
                      blocks.length > 0
                        ? blocks.filter((b) => b.lang !== 'code' || hasPreviewableCode([b]))
                        : [
                            {
                              lang: 'html',
                              content: buildStarterDemoPage('SMFTA লাইভ ডেমো'),
                              index: 0,
                            },
                          ],
                      0,
                      lastWithCode?.id
                    );
                  },
                },
                {
                  label: 'Design a Website Demo (লাইভ সাইট বানাও)',
                  run: () =>
                    handleSend(
                      'এই ওয়েবসাইটের ডিজাইনটা বানাও — আধুনিক, রেসপন্সিভ, এক ফাইলেই চলবে'
                    ),
                },
                {
                  label: 'Open Battle Arena (Flash vs Ultra)',
                  run: () => setBattleOpen(true),
                },
                {
                  label: 'Toggle Dark / Light Theme',
                  run: () =>
                    setSettings((s) => ({
                      ...s,
                      theme: s.theme === 'dark' ? 'light' : 'dark',
                    })),
                },
                {
                  label: 'Export Current Chat as Markdown',
                  run: () => handleExportChatMarkdown(),
                },
                {
                  label: "See What's New (v" + APP_VERSION + ')',
                  run: () => setInfoModal('whatsnew'),
                },
              ]
                .filter(
                  (c) =>
                    !cmdkQuery.trim() ||
                    c.label.toLowerCase().includes(cmdkQuery.toLowerCase())
                )
                .map((cmd, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setCmdkOpen(false);
                      setCmdkQuery('');
                      cmd.run();
                    }}
                    className="w-full text-left px-3 py-2 rounded-lg text-xs font-medium text-[var(--text)] hover:bg-[var(--surface-2)] cursor-pointer flex items-center justify-between"
                  >
                    <span>{cmd.label}</span>
                    <span className="text-[10px] text-[var(--text-3)]">
                      Command
                    </span>
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* Live Self-Coded Feature / Widget Runner Modal */}
      {activeWidgetModal && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
          onClick={(e) =>
            e.target === e.currentTarget && setActiveWidgetModal(null)
          }
        >
          <div className="w-full max-w-2xl rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-5 shadow-2xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-base font-bold text-[var(--text)] flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-[var(--primary)]" />
                  <span>{activeWidgetModal.title}</span>
                </h3>
                {activeWidgetModal.description && (
                  <p className="text-xs text-[var(--text-2)]">
                    {activeWidgetModal.description}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setActiveWidgetModal(null)}
                className="text-[var(--text-2)] hover:text-[var(--text)] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <iframe
              title={activeWidgetModal.title}
              sandbox="allow-scripts allow-modals"
              srcDoc={activeWidgetModal.code}
              className="w-full h-96 rounded-xl border border-[var(--border)] bg-white"
            />
          </div>
        </div>
      )}

      {/* Self-Evolution & Auto-Memory Hub Modal */}
      {selfEvolutionOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
          onClick={(e) =>
            e.target === e.currentTarget && setSelfEvolutionOpen(false)
          }
        >
          <div className="w-full max-w-lg rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-6 shadow-2xl max-h-[88vh] overflow-y-auto space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-[var(--text)] flex items-center gap-2">
                <Cpu className="w-5 h-5 text-[var(--primary)]" />
                <span>Self-Evolution & Auto-Memory</span>
              </h3>
              <button
                type="button"
                onClick={() => setSelfEvolutionOpen(false)}
                className="text-[var(--text-2)] hover:text-[var(--text)] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3.5 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-xs text-[var(--text-2)] space-y-2">
              <div className="font-bold text-[var(--text)]">
                ⚡ স্বয়ংক্রিয় সেলফ-আপডেট (Ask AI in Chat):
              </div>
              <p>
                আপনি চ্যাটে যা বলবেন AI নিজেই নিজেকে কোড লিখে আপডেট করে নেবে! যেমন বলুন:
              </p>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {[
                  'তোমার থিম ডার্ক এবং কালার এমেরাল্ড করে নিজেকে আপডেট করো',
                  'নিজেকে কোড লিখে আপডেট করো এবং ভেতরে একটি ক্যালকুলেটর যোগ করো',
                  'নিজের ভেতরে একটি ডিজিটাল নোটপ্যাড উইজেট তৈরি করে আপডেট করো',
                ].map((ex, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => {
                      setSelfEvolutionOpen(false);
                      handleSend(ex);
                    }}
                    className="text-left px-2.5 py-1.5 rounded-lg bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--primary)] text-[var(--primary)] font-medium cursor-pointer"
                  >
                    “{ex}”
                  </button>
                ))}
              </div>
            </div>

            {/* Installed Self-Coded Widgets */}
            <div>
              <div className="text-xs font-bold uppercase text-[var(--text-2)] mb-2">
                Installed Self-Coded Features ({selfWidgets.length})
              </div>
              {selfWidgets.length === 0 ? (
                <div className="text-xs text-[var(--text-3)] py-3 text-center rounded-xl border border-dashed border-[var(--border)]">
                  No custom features installed yet. Ask AI in chat to code & add a feature to itself!
                </div>
              ) : (
                <div className="space-y-2">
                  {selfWidgets.map((w) => (
                    <div
                      key={w.id}
                      className="flex items-center justify-between p-3 rounded-xl bg-[var(--surface-2)] border border-[var(--border)]"
                    >
                      <div className="min-w-0 pr-2">
                        <div className="text-xs font-bold text-[var(--text)] truncate">
                          {w.title}
                        </div>
                        <div className="text-[11px] text-[var(--text-2)] truncate">
                          {w.description}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            setSelfEvolutionOpen(false);
                            setActiveWidgetModal(w);
                          }}
                          className="px-3 py-1.5 rounded-lg bg-[var(--primary)] text-white text-xs font-semibold cursor-pointer"
                        >
                          Open
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setSelfWidgets((prev) =>
                              prev.filter((x) => x.id !== w.id)
                            )
                          }
                          className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-500/10 cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Auto-Learned User Memory */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase text-[var(--text-2)]">
                  Auto-Learned User Memory ({memory.length})
                </span>
                {memory.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setMemory([])}
                    className="text-[11px] text-rose-500 font-semibold cursor-pointer hover:underline"
                  >
                    Clear All
                  </button>
                )}
              </div>
              {memory.length === 0 ? (
                <div className="text-xs text-[var(--text-3)] py-3 text-center rounded-xl border border-dashed border-[var(--border)]">
                  As you chat, AI will automatically learn & remember your name, preferences, and goals here.
                </div>
              ) : (
                <div className="max-h-40 overflow-y-auto space-y-1.5 rounded-xl bg-[var(--surface-2)] p-3 border border-[var(--border)]">
                  {memory.map((m, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between gap-2 text-xs text-[var(--text)]"
                    >
                      <span>
                        {idx + 1}. {m}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setMemory((prev) => prev.filter((_, i) => i !== idx))
                        }
                        className="text-[var(--text-3)] hover:text-rose-500 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

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
