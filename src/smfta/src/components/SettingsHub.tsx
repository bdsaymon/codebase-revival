import React, { useEffect, useMemo, useState } from 'react';
import {
  Brain,
  ChevronLeft,
  ChevronRight,
  Cpu,
  FileText,
  FolderKanban,
  Gauge,
  Mic,
  Plug,
  Shield,
  Sliders,
  Sparkles,
  Wrench,
  X,
} from 'lucide-react';
import {
  AppSettings,
  DataBridgeConfig,
  DbConnectionConfig,
  ExternalProviderId,
  KnowledgeDocument,
  McpServerConfig,
  NotebookNote,
  ProviderTestStatus,
  SavedProviderProfile,
  SelfUpdateWidget,
  TelemetryRequestLog,
  UserProfile,
} from '../types';
import type { AutonomyLevel, SelfSkill } from '../utils/selfEngine';
import type { VaultConnections } from '../utils/cloudVault';
import { sanitizeSettings } from '../utils/settings';
import {
  DEFAULT_BUILTIN_PROFILE,
  DEFAULT_PROVIDER_BASE_URLS,
  DEFAULT_PROVIDER_MODELS,
  QUICK_PROVIDER_CHIPS,
  detectProviderFromKey,
  getInitialProviderProfiles,
  isKeylessProviderId,
  persistSavedProfiles,
  providerEntry,
  sortProvidersByPriority,
} from '../utils/providers';
import {
  fetchProviderModelsClientSide,
  isStandaloneApkEnv,
  testProviderClientSide,
} from '../utils/apkClientFallback';
import { loadMcpServers, saveMcpServers } from '../utils/mcpClient';
import {
  loadDataBridgeConfig,
  loadDbConnections,
  saveDataBridgeConfig,
  saveDbConnections,
} from '../utils/dbBridge';
import {
  loadKnowledgeDocuments,
  saveKnowledgeDocuments,
} from '../utils/knowledgeBase';
import { clearTelemetryLogs, loadTelemetryLogs } from '../utils/telemetryLog';
import { rotateKeystoreMasterKey } from '../utils/secureKeystore';
import { APP_VERSION } from '../version';
import { GeneralSection } from './settings/GeneralSection';
import { InstructionsSection } from './settings/InstructionsSection';
import { MemoryKnowledgeSection } from './settings/MemoryKnowledgeSection';
import { ProjectsSection } from './settings/ProjectsSection';
import { ModelsSection } from './settings/ModelsSection';
import { SecurityPrivacySection } from './settings/SecurityPrivacySection';
import { ConnectionsSection } from './settings/ConnectionsSection';
import { ProvidersApiSection } from './settings/ProvidersApiSection';
import { VoiceAudioSection } from './settings/VoiceAudioSection';
import { PerformanceAdvancedSection } from './settings/PerformanceAdvancedSection';
import { ToolsCapabilitiesSection } from './settings/ToolsCapabilitiesSection';

export type SettingsTabId =
  | 'general'
  | 'providers'
  | 'instructions'
  | 'memory'
  | 'projects'
  | 'models'
  | 'data'
  | 'connections'
  | 'voice'
  // Legacy aliases preserved for backward compatibility
  | 'mcp'
  | 'database'
  | 'tools'
  | 'performance'
  | 'security'
  | 'about'
  | 'responses'
  | 'privacy'
  | 'account'
  | 'appearance'
  | 'ai'
  | 'personalization'
  | 'shortcuts'
  | 'notifications'
  | 'accessibility'
  | 'integrations'
  | 'profile'
  | 'engine'
  | 'weights'
  | 'connectors'
  | 'self'
  | 'upgrade';

export type SectionId =
  | 'general'
  | 'providers'
  | 'models'
  | 'tools'
  | 'performance'
  | 'instructions'
  | 'memory'
  | 'projects'
  | 'connections'
  | 'data'
  | 'voice';

interface CategoryDescriptor {
  id: SectionId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const SETTINGS_CATEGORIES: CategoryDescriptor[] = [
  {
    id: 'general',
    label: 'General',
    icon: Sliders,
  },
  {
    id: 'models',
    label: 'AI & Thinking',
    icon: Sparkles,
  },
  {
    id: 'voice',
    label: 'Voice & Audio',
    icon: Mic,
  },
  {
    id: 'providers',
    label: 'Custom Providers',
    icon: Cpu,
  },
  {
    id: 'instructions',
    label: 'Instructions',
    icon: FileText,
  },
  {
    id: 'memory',
    label: 'Memory',
    icon: Brain,
  },
  {
    id: 'projects',
    label: 'Projects',
    icon: FolderKanban,
  },
  {
    id: 'connections',
    label: 'Connections',
    icon: Plug,
  },
  {
    id: 'data',
    label: 'Data',
    icon: Shield,
  },
];

function normalizeTab(t?: SettingsTabId): SectionId {
  switch (t) {
    case 'providers':
    case 'engine':
    case 'weights':
    case 'upgrade':
      return 'providers';
    case 'instructions':
    case 'personalization':
    case 'profile':
      return 'instructions';
    case 'memory':
      return 'memory';
    case 'projects':
      return 'projects';
    case 'tools':
    case 'performance':
    case 'models':
    case 'ai':
    case 'responses':
      return 'models';
    case 'data':
    case 'security':
    case 'privacy':
    case 'database':
      return 'data';
    case 'connections':
    case 'mcp':
    case 'connectors':
    case 'integrations':
    case 'self':
      return 'connections';
    case 'voice':
      return 'voice';
    case 'general':
    case 'appearance':
    case 'account':
    case 'notifications':
    case 'accessibility':
    case 'shortcuts':
    case 'about':
    default:
      return 'general';
  }
}

export interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: SettingsTabId;
  variant?: 'modal' | 'inline';
  profile: UserProfile;
  settings: AppSettings;
  memory: string[];
  savedProfiles?: SavedProviderProfile[];
  onUpdateProfiles?: (profiles: SavedProviderProfile[]) => void;
  onSelectProfile?: (profile: SavedProviderProfile) => void;
  onSave: (newProfile: UserProfile, newSettings: AppSettings) => void;
  onResetSettings?: () => void;
  onUpdateMemory?: (next: string[]) => void;
  onClearMemory: () => void;
  onExportBackup: () => void;
  onImportBackup: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSaveRollbackPoint?: () => void;
  onRollback?: () => void;
  hasRollbackPoint?: boolean;
  onClearAllData: () => void;
  onOpenWhatsNew: () => void;
  connections?: VaultConnections;
  onUpdateConnections?: (next: VaultConnections) => void;
  notes?: NotebookNote[];
  onOpenNotebook?: () => void;
  selfWidgets?: SelfUpdateWidget[];
  onUpdateWidgets?: (next: SelfUpdateWidget[]) => void;
  onOpenWidget?: (w: SelfUpdateWidget) => void;
  notify?: (msg: string) => void;
  onBackupToGithub?: () => void;
  skills?: SelfSkill[];
  onUpdateSkills?: (next: SelfSkill[]) => void;
  autonomy?: AutonomyLevel;
  onAutonomyChange?: (next: AutonomyLevel) => void;
  onSelfRepair?: () => void;
  onProviderTestResult?: (status: ProviderTestStatus) => void;
  keystoreEphemeral?: boolean;
  usageToday?: number;
  onOpenSkill?: (skill: SelfSkill) => void;
  // Expanded 10-category state hooks (with built-in local fallbacks if omitted)
  mcpServers?: McpServerConfig[];
  onUpdateMcpServers?: (next: McpServerConfig[]) => void;
  dbConnections?: DbConnectionConfig[];
  onUpdateDbConnections?: (next: DbConnectionConfig[]) => void;
  dataBridgeConfig?: DataBridgeConfig;
  onUpdateDataBridgeConfig?: (next: DataBridgeConfig) => void;
  knowledgeDocs?: KnowledgeDocument[];
  onUpdateKnowledgeDocs?: (next: KnowledgeDocument[]) => void;
  telemetryLogs?: TelemetryRequestLog[];
  onClearTelemetryLogs?: () => void;
  onRotateKeystoreKey?: () => Promise<void>;
  onClearChatHistory?: () => void;
  onDeleteCloudData?: () => Promise<void>;
  cloudConnected?: boolean;
  cloudUserEmail?: string;
  activeProjectId?: string;
  onSelectActiveProject?: (projectId: string | undefined) => void;
  onOpenSimpleEntryModal?: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  initialTab,
  variant = 'modal',
  profile,
  settings,
  memory,
  savedProfiles: externalProfiles,
  onUpdateProfiles,
  onSelectProfile,
  onSave,
  onResetSettings,
  onUpdateMemory,
  onClearMemory,
  onExportBackup,
  onImportBackup,
  onSaveRollbackPoint,
  onRollback,
  hasRollbackPoint,
  onClearAllData,
  onOpenWhatsNew,
  connections,
  onUpdateConnections,
  notes = [],
  notify,
  onBackupToGithub,
  onProviderTestResult,
  keystoreEphemeral,
  usageToday = 0,
  mcpServers: externalMcpServers,
  onUpdateMcpServers,
  dbConnections: externalDbConnections,
  onUpdateDbConnections,
  dataBridgeConfig: externalBridgeConfig,
  onUpdateDataBridgeConfig,
  knowledgeDocs: externalKnowledgeDocs,
  onUpdateKnowledgeDocs,
  telemetryLogs: externalTelemetryLogs,
  onClearTelemetryLogs,
  onRotateKeystoreKey,
  onClearChatHistory,
  onDeleteCloudData,
  cloudConnected,
  cloudUserEmail,
  activeProjectId,
  onSelectActiveProject,
  onOpenSimpleEntryModal,
}) => {
  const isInline = variant === 'inline';
  const [tab, setTab] = useState<SectionId>(() => normalizeTab(initialTab));
  const [mobileDetailOpen, setMobileDetailOpen] = useState<boolean>(() =>
    Boolean(initialTab && initialTab !== 'general')
  );
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (isOpen) {
      setSearchQuery('');
      if (initialTab) {
        setTab(normalizeTab(initialTab));
        setMobileDetailOpen(initialTab !== 'general');
      }
    }
  }, [isOpen, initialTab]);

  // Close cleanly on Escape key (desktop & mobile)
  useEffect(() => {
    if (!isOpen || isInline) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, isInline, onClose]);

  const [draft, setDraft] = useState<AppSettings>(() => sanitizeSettings(settings));
  const [profileName, setProfileName] = useState(profile.name || '');
  const [localProfiles, setLocalProfiles] = useState<SavedProviderProfile[]>(() =>
    externalProfiles && externalProfiles.length > 0
      ? externalProfiles
      : getInitialProviderProfiles(settings)
  );

  // Expanded workspace local fallbacks when standalone
  const [localMcpServers, setLocalMcpServers] = useState<McpServerConfig[]>([]);
  const [localDbConnections, setLocalDbConnections] = useState<DbConnectionConfig[]>([]);
  const [localBridgeConfig, setLocalBridgeConfig] = useState<DataBridgeConfig>(() =>
    loadDataBridgeConfig()
  );
  const [localKnowledgeDocs, setLocalKnowledgeDocs] = useState<KnowledgeDocument[]>([]);
  const [localTelemetryLogs, setLocalTelemetryLogs] = useState<TelemetryRequestLog[]>(() =>
    loadTelemetryLogs()
  );

  // Provider configuration form state
  const [newPropName, setNewPropName] = useState('');
  const [newProviderId, setNewProviderId] = useState<ExternalProviderId>('mercury');
  const [newApiKey, setNewApiKey] = useState('');
  const [showNewKey, setShowNewKey] = useState(false);
  const [newBaseUrl, setNewBaseUrl] = useState(DEFAULT_PROVIDER_BASE_URLS.mercury || '');
  const [newModel, setNewModel] = useState(DEFAULT_PROVIDER_MODELS.mercury || 'mercury-3');
  const [newCustomHeaders, setNewCustomHeaders] = useState('');
  const [newCustomParams, setNewCustomParams] = useState('');
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  const [profileAdvancedOpen, setProfileAdvancedOpen] = useState<Record<string, boolean>>({});
  const [discoveredModels, setDiscoveredModels] = useState<string[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [isVerifyingNew, setIsVerifyingNew] = useState(false);
  const [newVerifyResult, setNewVerifyResult] = useState<{
    ok: boolean;
    message: string;
    workingModel?: string;
  } | null>(null);
  const [discoveryWarning, setDiscoveryWarning] = useState<string | null>(null);
  const [testingProfileId, setTestingProfileId] = useState<string | null>(null);
  const [loadingModelsForId, setLoadingModelsForId] = useState<string | null>(null);
  const [revealedKeyIds, setRevealedKeyIds] = useState<Record<string, boolean>>({});
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);

  // Hydrate draft & fallback stores whenever Settings opens
  useEffect(() => {
    if (!isOpen && !isInline) return;
    const cleanSettings = sanitizeSettings(settings);
    const initialProfiles =
      externalProfiles && externalProfiles.length > 0
        ? externalProfiles
        : getInitialProviderProfiles(settings);
    setDraft(cleanSettings);
    setProfileName(profile.name || '');
    setLocalProfiles(initialProfiles);

    if (!externalMcpServers) {
      void loadMcpServers().then(setLocalMcpServers).catch(() => {});
    }
    if (!externalDbConnections) {
      void loadDbConnections().then(setLocalDbConnections).catch(() => {});
    }
    if (!externalBridgeConfig) {
      setLocalBridgeConfig(loadDataBridgeConfig());
    }
    if (!externalKnowledgeDocs) {
      void loadKnowledgeDocuments().then(setLocalKnowledgeDocs).catch(() => {});
    }
    if (!externalTelemetryLogs) {
      setLocalTelemetryLogs(loadTelemetryLogs());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, isInline]);

  const effectiveMcpServers = externalMcpServers ?? localMcpServers;
  const effectiveDbConnections = externalDbConnections ?? localDbConnections;
  const effectiveBridgeConfig = externalBridgeConfig ?? localBridgeConfig;
  const effectiveKnowledgeDocs = externalKnowledgeDocs ?? localKnowledgeDocs;
  const effectiveTelemetryLogs = externalTelemetryLogs ?? localTelemetryLogs;

  const handleUpdateMcpServers = (next: McpServerConfig[]) => {
    setLocalMcpServers(next);
    void saveMcpServers(next).catch(() => {});
    onUpdateMcpServers?.(next);
  };

  const handleUpdateDbConnections = (next: DbConnectionConfig[]) => {
    setLocalDbConnections(next);
    void saveDbConnections(next).catch(() => {});
    onUpdateDbConnections?.(next);
  };

  const handleUpdateBridgeConfig = (next: DataBridgeConfig) => {
    setLocalBridgeConfig(next);
    saveDataBridgeConfig(next);
    onUpdateDataBridgeConfig?.(next);
  };

  const handleUpdateKnowledgeDocs = (next: KnowledgeDocument[]) => {
    setLocalKnowledgeDocs(next);
    void saveKnowledgeDocuments(next).catch(() => {});
    onUpdateKnowledgeDocs?.(next);
  };

  const handleClearLogs = () => {
    clearTelemetryLogs();
    setLocalTelemetryLogs([]);
    onClearTelemetryLogs?.();
    notify?.('Request telemetry history cleared.');
  };

  const handleRotateKeystore = async () => {
    if (onRotateKeystoreKey) {
      await onRotateKeystoreKey();
      return;
    }
    await rotateKeystoreMasterKey(async ({ decryptOld, encryptNew }) => {
      let count = 0;
      const nextProfiles = await Promise.all(
        localProfiles.map(async (p) => {
          if (!p.externalKeys) return p;
          const plain = await decryptOld(p.externalKeys);
          const sealed = plain ? await encryptNew(plain) : '';
          if (plain) count += 1;
          return { ...p, externalKeys: plain || sealed };
        })
      );
      setLocalProfiles(nextProfiles);
      persistSavedProfiles(nextProfiles);
      return count;
    });
    notify?.('Master AES-256-GCM encryption key rotated and local secrets re-sealed.');
  };

  const filteredCategories = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return SETTINGS_CATEGORIES;
    return SETTINGS_CATEGORIES.filter((cat) =>
      cat.label.toLowerCase().includes(q)
    );
  }, [searchQuery]);

  if (!isOpen && !isInline) return null;

  const syncProfiles = (nextList: SavedProviderProfile[]) => {
    setLocalProfiles(nextList);
    persistSavedProfiles(nextList);
    onUpdateProfiles?.(nextList);
  };

  const commit = (nextSettings: AppSettings, nextName: string = profileName) => {
    const clean = sanitizeSettings(nextSettings);
    setDraft(clean);
    try {
      localStorage.setItem('smfta_settings', JSON.stringify(clean));
    } catch {
      // ignore storage errors
    }
    onSave({ name: nextName.trim() || 'Boss' }, clean);
  };

  const patch = (partial: Partial<AppSettings>) => {
    commit({ ...draft, ...partial });
  };

  const handleNameChange = (value: string) => {
    setProfileName(value);
    commit(draft, value);
  };

  const activeProfile =
    localProfiles.find((p) => p.id === draft.activeProfileId) ||
    localProfiles[0] ||
    DEFAULT_BUILTIN_PROFILE;

  const activateSavedProfile = (prof: SavedProviderProfile) => {
    const cleared: SavedProviderProfile = { ...prof, quotaExhausted: false };
    syncProfiles(localProfiles.map((p) => (p.id === prof.id ? cleared : p)));
    onSelectProfile?.(cleared);
    const nextSettings = sanitizeSettings({
      ...draft,
      activeProfileId: prof.id,
      displayName: prof.name,
      provider: prof.provider,
      externalKeys: prof.externalKeys,
      externalModel: prof.externalModel,
      externalBaseUrl: prof.externalBaseUrl,
      customHeaders: prof.customHeaders,
      customParams: prof.customParams,
    });
    commit(nextSettings);
  };

  const updateSavedProfileField = (
    id: string,
    changes: Partial<SavedProviderProfile>
  ) => {
    const connectionChanged =
      ('provider' in changes ||
        'externalKeys' in changes ||
        'externalModel' in changes ||
        'externalBaseUrl' in changes ||
        'customHeaders' in changes ||
        'customParams' in changes ||
        'contextWindow' in changes ||
        'supportsStreaming' in changes) &&
      !('verified' in changes);
    const nextList = localProfiles.map((p) =>
      p.id === id
        ? {
            ...p,
            ...changes,
            ...(connectionChanged
              ? {
                  verified: false,
                  verificationStatus: 'stale' as const,
                  statusMessage: 'Configuration modified — re-verify connection',
                }
              : {}),
          }
        : p
    );
    syncProfiles(nextList);
    const updated = nextList.find((p) => p.id === id);
    if (updated && activeProfile?.id === id) {
      commit({
        ...draft,
        activeProfileId: updated.id,
        displayName: updated.name,
        provider: updated.provider,
        externalKeys: updated.externalKeys,
        externalModel: updated.externalModel,
        externalBaseUrl: updated.externalBaseUrl,
        customHeaders: updated.customHeaders,
        customParams: updated.customParams,
      });
    }
  };

  const deleteSavedProfile = (id: string) => {
    if (localProfiles.length <= 1) return;
    const nextList = localProfiles.filter((p) => p.id !== id);
    syncProfiles(nextList);
    if (activeProfile?.id === id && nextList[0]) activateSavedProfile(nextList[0]);
  };

  const handleMovePriority = (id: string, direction: 'up' | 'down') => {
    const ordered = sortProvidersByPriority(localProfiles);
    const idx = ordered.findIndex((p) => p.id === id);
    if (idx < 0) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= ordered.length) return;
    const copy = [...ordered];
    const [moved] = copy.splice(idx, 1);
    copy.splice(swapIdx, 0, moved);
    const reindexed = copy.map((p, index) => ({ ...p, priority: index + 1 }));
    syncProfiles(reindexed);
  };

  const resolveInferredBaseUrl = (
    provId: ExternalProviderId,
    rawBase: string,
    rawKey: string
  ): string => {
    const cleanBase = rawBase.trim();
    if (cleanBase) return cleanBase;
    if (DEFAULT_PROVIDER_BASE_URLS[provId]) {
      return DEFAULT_PROVIDER_BASE_URLS[provId];
    }
    const firstKey = rawKey.split(/[\n,;]+/)[0]?.trim() || '';
    const detected = detectProviderFromKey(firstKey);
    if (detected && DEFAULT_PROVIDER_BASE_URLS[detected]) {
      return DEFAULT_PROVIDER_BASE_URLS[detected];
    }
    if (firstKey.startsWith('sk-')) {
      return DEFAULT_PROVIDER_BASE_URLS.openai || 'https://api.openai.com/v1';
    }
    return '';
  };

  const getPopularStarterModels = (
    providerId: string,
    baseUrl: string,
    apiKey: string
  ): string[] => {
    if (providerId === 'mercury' || providerId === 'inceptionlabs') {
      return ['mercury-3', 'mercury', 'mercury-coder'];
    }
    if (providerId !== 'custom') {
      return (
        QUICK_PROVIDER_CHIPS[providerId] ||
        [DEFAULT_PROVIDER_MODELS[providerId]].filter(Boolean)
      );
    }
    const u = (baseUrl || '').toLowerCase();
    const k = (apiKey || '').toLowerCase();
    if (u.includes('codecraft') || k.startsWith('cc_')) {
      return [
        'gemini-3.8-flash',
        'deepseek-v4-flash-0731',
        'claude-sonnet-5',
        'claude-opus-4.8',
      ];
    }
    if (u.includes('inceptionlabs') || u.includes('mercury')) {
      return ['mercury-3', 'mercury', 'mercury-coder'];
    }
    if (u.includes('groq')) {
      return ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768'];
    }
    if (u.includes('openrouter')) {
      return [
        'google/gemini-3.8-flash',
        'meta-llama/llama-3.3-70b-instruct',
        'deepseek/deepseek-chat',
      ];
    }
    return ['mercury-3', 'gpt-4o-mini', 'gpt-4o', 'deepseek-chat', 'gemini-3.8-flash'];
  };

  const handleFetchNewModels = async (
    prov: ExternalProviderId = newProviderId,
    keys: string = newApiKey,
    base: string = newBaseUrl
  ) => {
    setIsLoadingModels(true);
    setDiscoveryWarning(null);
    try {
      let models: string[] = [];
      let warningMsg: string | null = null;
      if (!isStandaloneApkEnv()) {
        const resp = await fetch('/api/provider-models', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            provider: prov,
            externalKeys: keys,
            externalBaseUrl: base,
          }),
        }).catch(() => null);
        const data = resp ? await resp.json().catch(() => null) : null;
        if (data?.ok && Array.isArray(data.models) && data.models.length > 0) {
          models = data.models;
          if (data.source === 'fallback' && data.warning) {
            warningMsg = `Live model list unavailable (${data.warning}); manual model entry is enabled.`;
          }
        }
      } else {
        models = await fetchProviderModelsClientSide({
          provider: prov,
          externalKeys: keys,
          externalBaseUrl: base,
        });
      }
      if (models.length > 0) {
        setDiscoveredModels(models);
        if (!newModel) setNewModel(models[0]);
        if (warningMsg) setDiscoveryWarning(warningMsg);
      } else {
        setDiscoveryWarning('Could not fetch remote model list; manual model ID entry is active.');
      }
    } catch {
      setDiscoveryWarning('Could not fetch remote model list; manual model ID entry is active.');
    } finally {
      setIsLoadingModels(false);
    }
  };

  const handleRefreshProfileModels = async (prof: SavedProviderProfile) => {
    setLoadingModelsForId(prof.id);
    try {
      let models: string[] = [];
      if (!isStandaloneApkEnv()) {
        const resp = await fetch('/api/provider-models', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            provider: prof.provider,
            externalKeys: prof.externalKeys,
            externalBaseUrl: prof.externalBaseUrl,
            forceRefresh: true,
          }),
        }).catch(() => null);
        const data = resp ? await resp.json().catch(() => null) : null;
        if (data?.ok && Array.isArray(data.models) && data.models.length > 0) {
          models = data.models;
        }
      } else {
        models = await fetchProviderModelsClientSide({
          provider: prof.provider,
          externalKeys: prof.externalKeys,
          externalBaseUrl: prof.externalBaseUrl,
        });
      }
      if (models.length > 0) {
        updateSavedProfileField(prof.id, {
          availableModels: models,
          externalModel: prof.externalModel || models[0],
        });
      } else {
        notify?.('Model list unavailable; you can enter a custom model ID manually.');
      }
    } catch {
      notify?.('Could not reach provider model endpoint; check network settings.');
    } finally {
      setLoadingModelsForId(null);
    }
  };

  const handleTestExistingProfile = async (prof: SavedProviderProfile) => {
    setTestingProfileId(prof.id);
    try {
      const startMs = Date.now();
      let data: {
        ok?: boolean;
        workingModel?: string;
        message?: string;
        errorCode?: string;
        httpStatus?: number;
        upstreamError?: string;
        discoveredModels?: string[];
        suggestedModels?: string[];
        supportsStreaming?: boolean;
        normalizedEndpoint?: string;
        configFingerprint?: string;
      } | null = null;
      if (!isStandaloneApkEnv()) {
        const resp = await fetch('/api/test-provider', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            provider: prof.provider,
            externalKeys: prof.externalKeys,
            externalModel: prof.externalModel,
            externalBaseUrl: prof.externalBaseUrl,
            customHeaders: prof.customHeaders,
            customParams: prof.customParams,
            testStreaming: prof.supportsStreaming !== false,
            contextWindow: prof.contextWindow,
          }),
        }).catch(() => null);
        if (resp && resp.status !== 404) {
          data = await resp.json().catch(() => null);
        }
      }
      if (!data) {
        data = await testProviderClientSide({
          provider: prof.provider,
          externalKeys: prof.externalKeys,
          externalModel: prof.externalModel,
          externalBaseUrl: prof.externalBaseUrl,
        });
      }
      const elapsedMs = Date.now() - startMs;
      const ok = Boolean(data?.ok);
      const workingModel = ok
        ? data?.workingModel || prof.externalModel
        : prof.externalModel;
      const msg = ok
        ? data?.message || `Connected (${elapsedMs}ms) · ${workingModel || 'Auto'}`
        : String(data?.message || 'Connection failed');
      const isTrueQuota =
        !ok &&
        (data?.errorCode === 'QUOTA_EXHAUSTED' ||
          /402|insufficient_quota|credit|billing/i.test(msg));
      const discovered = Array.isArray(data?.discoveredModels)
        ? data.discoveredModels
        : Array.isArray(data?.suggestedModels)
        ? data.suggestedModels
        : [];
      const mergedAvailableModels = Array.from(
        new Set(
          [
            ...(ok && workingModel ? [workingModel] : []),
            ...discovered,
            ...(prof.availableModels || []),
          ]
            .map((m) => String(m || '').trim())
            .filter(Boolean)
        )
      );
      updateSavedProfileField(prof.id, {
        verified: ok,
        verificationStatus: ok ? 'verified' : 'failed',
        verifiedModel: ok ? workingModel : undefined,
        verifiedEndpoint: data?.normalizedEndpoint,
        configFingerprint: data?.configFingerprint,
        quotaExhausted: isTrueQuota,
        lastTestedAt: Date.now(),
        statusMessage: msg,
        externalModel: workingModel || prof.externalModel,
        availableModels:
          mergedAvailableModels.length > 0
            ? mergedAvailableModels
            : prof.availableModels,
        supportsStreaming:
          typeof data?.supportsStreaming === 'boolean'
            ? data.supportsStreaming
            : prof.supportsStreaming,
      });
      onProviderTestResult?.({
        ok,
        message: msg,
        testedAt: Date.now(),
        provider: prof.provider,
        model: workingModel,
      });
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Network error during test';
      updateSavedProfileField(prof.id, {
        verified: false,
        verificationStatus: 'failed',
        quotaExhausted: false,
        lastTestedAt: Date.now(),
        statusMessage: `Failed: ${errMsg}`,
      });
    } finally {
      setTestingProfileId(null);
    }
  };

  const handleSaveWithoutVerification = () => {
    const effectiveBaseUrl = resolveInferredBaseUrl(
      newProviderId,
      newBaseUrl,
      newApiKey
    );
    const isKeyRequired =
      !isKeylessProviderId(newProviderId) && newProviderId !== 'custom';
    if (isKeyRequired && !newApiKey.trim()) {
      setNewVerifyResult({
        ok: false,
        message: `API Key is required for ${
          providerEntry(newProviderId)?.label || newProviderId
        }.`,
      });
      return;
    }
    if (newProviderId === 'custom' && !effectiveBaseUrl && !newApiKey.trim()) {
      setNewVerifyResult({
        ok: false,
        message:
          'Custom API requires a valid Base URL (e.g. https://api.openai.com/v1) or API Key.',
      });
      return;
    }

    const cleanName =
      newPropName.trim() ||
      `${providerEntry(newProviderId)?.short || newProviderId} AI`;
    const starterModels = getPopularStarterModels(
      newProviderId,
      effectiveBaseUrl,
      newApiKey
    );
    const workingModel = (
      newModel.trim() ||
      discoveredModels[0] ||
      starterModels[0] ||
      DEFAULT_PROVIDER_MODELS[newProviderId] ||
      'mercury-3'
    ).trim();

    const mergedModels = Array.from(
      new Set(
        [workingModel, ...discoveredModels, ...starterModels]
          .map((m) => m.trim())
          .filter(Boolean)
      )
    );

    const nextPriority = localProfiles.length + 1;
    const newProfile: SavedProviderProfile = {
      id:
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? `prop-${crypto.randomUUID()}`
          : `prop-${Date.now()}`,
      name: cleanName,
      provider: newProviderId,
      externalKeys: newApiKey.trim(),
      externalModel: workingModel,
      externalBaseUrl: effectiveBaseUrl,
      ...(newCustomHeaders.trim() ? { customHeaders: newCustomHeaders.trim() } : {}),
      ...(newCustomParams.trim() ? { customParams: newCustomParams.trim() } : {}),
      availableModels: mergedModels,
      verified: false,
      verificationStatus: 'untested',
      enabled: true,
      priority: nextPriority,
      quotaExhausted: false,
      statusMessage: `Untested · ${workingModel}`,
    };

    const nextList = [...localProfiles, newProfile];
    syncProfiles(nextList);
    onSelectProfile?.(newProfile);
    const nextSettings = sanitizeSettings({
      ...draft,
      activeProfileId: newProfile.id,
      displayName: newProfile.name,
      provider: newProfile.provider,
      externalKeys: newProfile.externalKeys,
      externalModel: newProfile.externalModel,
      externalBaseUrl: newProfile.externalBaseUrl,
      customHeaders: newProfile.customHeaders,
      customParams: newProfile.customParams,
    });
    commit(nextSettings);
    setNewVerifyResult({
      ok: true,
      workingModel,
      message: `Saved & activated "${cleanName}" (${workingModel}) — untested`,
    });
    setNewPropName('');
    setNewApiKey('');
    setNewCustomHeaders('');
    setNewCustomParams('');
    setShowNewKey(false);
    setNewBaseUrl(DEFAULT_PROVIDER_BASE_URLS[newProviderId] || '');
    setNewModel(DEFAULT_PROVIDER_MODELS[newProviderId] || 'mercury-3');
    notify?.(`Saved "${cleanName}" (${workingModel})`);
  };

  const handleVerifyAndAddProvider = async () => {
    const cleanName =
      newPropName.trim() ||
      `${providerEntry(newProviderId)?.short || newProviderId} AI`;
    const effectiveBaseUrl = resolveInferredBaseUrl(
      newProviderId,
      newBaseUrl,
      newApiKey
    );
    const isKeyRequired =
      !isKeylessProviderId(newProviderId) && newProviderId !== 'custom';
    if (isKeyRequired && !newApiKey.trim()) {
      setNewVerifyResult({
        ok: false,
        message: `API Key is required for ${
          providerEntry(newProviderId)?.label || newProviderId
        }.`,
      });
      return;
    }
    if (newProviderId === 'custom' && !effectiveBaseUrl) {
      setNewVerifyResult({
        ok: false,
        message:
          'Base URL is required for Custom API (e.g. https://api.openai.com/v1 or https://openrouter.ai/api/v1).',
      });
      return;
    }
    setIsVerifyingNew(true);
    setNewVerifyResult(null);
    try {
      const startMs = Date.now();
      let testData: {
        ok?: boolean;
        workingModel?: string;
        message?: string;
        error?: string;
        discoveredModels?: string[];
        suggestedModels?: string[];
        supportsStreaming?: boolean;
        normalizedEndpoint?: string;
        configFingerprint?: string;
      } | null = null;
      let fetchedModels: string[] = [];
      if (!isStandaloneApkEnv()) {
        const testResp = await fetch('/api/test-provider', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            provider: newProviderId,
            externalKeys: newApiKey.trim(),
            externalModel: newModel.trim(),
            externalBaseUrl: effectiveBaseUrl,
            customHeaders: newCustomHeaders,
            customParams: newCustomParams,
            testStreaming: true,
          }),
        }).catch(() => null);
        if (testResp && testResp.status !== 404) {
          testData = await testResp.json().catch(() => null);
          if (Array.isArray(testData?.discoveredModels)) {
            fetchedModels = testData.discoveredModels;
          } else if (Array.isArray(testData?.suggestedModels)) {
            fetchedModels = testData.suggestedModels;
          }
        }
      }
      if (!testData) {
        const [clientTest, clientModels] = await Promise.all([
          testProviderClientSide({
            provider: newProviderId,
            externalKeys: newApiKey.trim(),
            externalModel: newModel.trim(),
            externalBaseUrl: effectiveBaseUrl,
          }),
          fetchProviderModelsClientSide({
            provider: newProviderId,
            externalKeys: newApiKey.trim(),
            externalBaseUrl: effectiveBaseUrl,
          }),
        ]);
        testData = clientTest;
        if (fetchedModels.length === 0) fetchedModels = clientModels;
      }
      const elapsedMs = Date.now() - startMs;
      if (!testData?.ok) {
        if (fetchedModels.length > 0) {
          setDiscoveredModels(fetchedModels);
        }
        const msgText =
          testData?.message ||
          testData?.error ||
          'Verification failed. Check API Key, Base URL, or quota. Provider was NOT added.';
        const suggestionSuffix =
          Array.isArray(testData?.suggestedModels) &&
          testData.suggestedModels.length > 0 &&
          !msgText.includes(testData.suggestedModels[0])
            ? ` (Available: ${testData.suggestedModels.slice(0, 4).join(', ')})`
            : '';
        setNewVerifyResult({
          ok: false,
          message: msgText + suggestionSuffix,
        });
        onProviderTestResult?.({
          ok: false,
          message: testData?.message || 'Verification failed',
          testedAt: Date.now(),
          provider: newProviderId,
        });
        return;
      }
      const workingModel = (
        testData.workingModel ||
        newModel.trim() ||
        fetchedModels[0] ||
        DEFAULT_PROVIDER_MODELS[newProviderId] ||
        'mercury-3'
      ).trim();
      const mergedModels = Array.from(
        new Set(
          [workingModel, newModel.trim(), ...fetchedModels, ...discoveredModels]
            .map((m) => m.trim())
            .filter(Boolean)
        )
      );
      const nextPriority = localProfiles.length + 1;
      const newProfile: SavedProviderProfile = {
        id:
          typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
            ? `prop-${crypto.randomUUID()}`
            : `prop-${Date.now()}`,
        name: cleanName,
        provider: newProviderId,
        externalKeys: newApiKey.trim(),
        externalModel: workingModel,
        externalBaseUrl: effectiveBaseUrl,
        ...(newCustomHeaders.trim() ? { customHeaders: newCustomHeaders.trim() } : {}),
        ...(newCustomParams.trim() ? { customParams: newCustomParams.trim() } : {}),
        availableModels: mergedModels,
        verified: true,
        verificationStatus: 'verified',
        verifiedModel: workingModel,
        verifiedEndpoint: testData.normalizedEndpoint,
        configFingerprint: testData.configFingerprint,
        supportsStreaming:
          typeof testData.supportsStreaming === 'boolean'
            ? testData.supportsStreaming
            : true,
        enabled: true,
        priority: nextPriority,
        quotaExhausted: false,
        lastTestedAt: Date.now(),
        statusMessage:
          testData.message || `Connected (${elapsedMs}ms) · ${workingModel}`,
      };
      const nextList = [...localProfiles, newProfile];
      syncProfiles(nextList);
      onSelectProfile?.(newProfile);
      const nextSettings = sanitizeSettings({
        ...draft,
        activeProfileId: newProfile.id,
        displayName: newProfile.name,
        provider: newProfile.provider,
        externalKeys: newProfile.externalKeys,
        externalModel: newProfile.externalModel,
        externalBaseUrl: newProfile.externalBaseUrl,
        customHeaders: newProfile.customHeaders,
        customParams: newProfile.customParams,
      });
      commit(nextSettings);
      setNewVerifyResult({
        ok: true,
        workingModel,
        message: `Verified & connected "${cleanName}" (${elapsedMs}ms) — model: ${workingModel}`,
      });
      onProviderTestResult?.({
        ok: true,
        message: `Connected: ${cleanName} (${workingModel})`,
        testedAt: Date.now(),
        provider: newProviderId,
        model: workingModel,
      });
      setNewPropName('');
      setNewApiKey('');
      setNewCustomHeaders('');
      setNewCustomParams('');
      setShowNewKey(false);
      setNewBaseUrl(DEFAULT_PROVIDER_BASE_URLS[newProviderId] || '');
      setNewModel(DEFAULT_PROVIDER_MODELS[newProviderId] || 'mercury-3');
      setDiscoveredModels([]);
      setDiscoveryWarning(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Network error verifying provider';
      setNewVerifyResult({ ok: false, message: `Verification failed: ${msg}.` });
    } finally {
      setIsVerifyingNew(false);
    }
  };

  const popularStarterModels = getPopularStarterModels(
    newProviderId,
    newBaseUrl,
    newApiKey
  );
  const candidateModelsForNew = Array.from(
    new Set([...discoveredModels, newModel.trim(), ...popularStarterModels].filter(Boolean))
  );
  const detectedProviderFromNewKey = detectProviderFromKey(newApiKey);

  const currentMeta =
    SETTINGS_CATEGORIES.find((c) => c.id === tab) || SETTINGS_CATEGORIES[0];

  const openSection = (id: SectionId) => {
    setTab(id);
    setMobileDetailOpen(true);
  };

  const renderActiveSection = () => {
    switch (tab) {
      case 'general':
        return (
          <GeneralSection
            draft={draft}
            profileName={profileName}
            onNameChange={handleNameChange}
            patch={patch}
            notify={notify}
            onOpenSimpleEntryModal={onOpenSimpleEntryModal}
          />
        );
      case 'instructions':
        return (
          <InstructionsSection
            draft={draft}
            profileName={profileName}
            onNameChange={handleNameChange}
            patch={patch}
          />
        );
      case 'memory':
        return (
          <MemoryKnowledgeSection
            draft={draft}
            patch={patch}
            memory={memory}
            onUpdateMemory={onUpdateMemory}
            onClearMemory={onClearMemory}
            knowledgeDocs={effectiveKnowledgeDocs}
            onUpdateKnowledgeDocs={handleUpdateKnowledgeDocs}
            notify={notify}
          />
        );
      case 'projects':
        return (
          <ProjectsSection
            draft={draft}
            patch={patch}
            activeProjectId={activeProjectId}
            onSelectActiveProject={onSelectActiveProject}
            notify={notify}
          />
        );
      case 'models':
        return (
          <ModelsSection
            draft={draft}
            savedProfiles={localProfiles}
            activeProfile={activeProfile}
            onActivateProfile={activateSavedProfile}
            onUpdateProfileModel={(profId, modId) =>
              updateSavedProfileField(profId, { externalModel: modId })
            }
            patch={patch}
          />
        );
      case 'data':
        return (
          <SecurityPrivacySection
            draft={draft}
            patch={patch}
            savedProfiles={localProfiles}
            mcpServers={effectiveMcpServers}
            dbConnections={effectiveDbConnections}
            keystoreEphemeral={keystoreEphemeral}
            onRotateKeystoreKey={handleRotateKeystore}
            onExportBackup={onExportBackup}
            onClearChatHistory={() => {
              if (onClearChatHistory) {
                onClearChatHistory();
              } else {
                try {
                  localStorage.removeItem('smfta_chats');
                } catch {
                  // ignore
                }
                notify?.('চ্যাট হিস্ট্রি মুছে ফেলা হয়েছে।');
              }
            }}
            onDeleteCloudData={onDeleteCloudData}
            onResetSettings={onResetSettings}
            onClearAllData={onClearAllData}
            cloudConnected={cloudConnected}
            cloudUserEmail={cloudUserEmail}
          />
        );
      case 'providers':
        return (
          <ProvidersApiSection
            draft={draft}
            patch={patch}
            localProfiles={localProfiles}
            activeProfile={activeProfile}
            onActivateProfile={activateSavedProfile}
            onUpdateProfileField={updateSavedProfileField}
            onDeleteProfile={deleteSavedProfile}
            onMovePriority={handleMovePriority}
            onTestProfile={handleTestExistingProfile}
            onRefreshProfileModels={handleRefreshProfileModels}
            newPropName={newPropName}
            setNewPropName={setNewPropName}
            newProviderId={newProviderId}
            onChangeNewProviderId={(nextId) => {
              const defModel =
                nextId === 'mercury' || nextId === 'inceptionlabs'
                  ? 'mercury-3'
                  : DEFAULT_PROVIDER_MODELS[nextId] || '';
              setNewProviderId(nextId);
              setNewBaseUrl(DEFAULT_PROVIDER_BASE_URLS[nextId] || '');
              setNewModel(defModel);
              setDiscoveredModels([]);
              setDiscoveryWarning(null);
              setNewVerifyResult(null);
            }}
            newApiKey={newApiKey}
            onChangeNewApiKey={(val) => {
              setNewApiKey(val);
              const detected = detectProviderFromKey(val);
              if (
                detected &&
                detected !== newProviderId &&
                (newProviderId === 'xrahat' || newProviderId === 'smfta_cloud')
              ) {
                setNewProviderId(detected);
                setNewBaseUrl(DEFAULT_PROVIDER_BASE_URLS[detected] || '');
                setNewModel(DEFAULT_PROVIDER_MODELS[detected] || '');
              }
            }}
            showNewKey={showNewKey}
            setShowNewKey={setShowNewKey}
            newBaseUrl={newBaseUrl}
            setNewBaseUrl={setNewBaseUrl}
            newModel={newModel}
            setNewModel={setNewModel}
            newCustomHeaders={newCustomHeaders}
            setNewCustomHeaders={setNewCustomHeaders}
            newCustomParams={newCustomParams}
            setNewCustomParams={setNewCustomParams}
            showAdvancedOptions={showAdvancedOptions}
            setShowAdvancedOptions={setShowAdvancedOptions}
            profileAdvancedOpen={profileAdvancedOpen}
            setProfileAdvancedOpen={setProfileAdvancedOpen}
            candidateModelsForNew={candidateModelsForNew}
            detectedProviderFromNewKey={detectedProviderFromNewKey}
            isLoadingModels={isLoadingModels}
            discoveryWarning={discoveryWarning}
            onFetchNewModels={() => handleFetchNewModels()}
            isVerifyingNew={isVerifyingNew}
            newVerifyResult={newVerifyResult}
            onSaveWithoutVerification={handleSaveWithoutVerification}
            onVerifyAndAddProvider={handleVerifyAndAddProvider}
            testingProfileId={testingProfileId}
            loadingModelsForId={loadingModelsForId}
            revealedKeyIds={revealedKeyIds}
            setRevealedKeyIds={setRevealedKeyIds}
            editingProfileId={editingProfileId}
            setEditingProfileId={setEditingProfileId}
            telemetryLogs={effectiveTelemetryLogs}
            usageToday={usageToday}
          />
        );
      case 'connections':
        return (
          <ConnectionsSection
            connections={connections}
            onUpdateConnections={onUpdateConnections}
            notify={notify}
          />
        );
      case 'voice':
        return (
          <VoiceAudioSection
            settings={draft}
            onUpdate={patch}
            notify={notify}
          />
        );
      case 'tools':
        return (
          <ToolsCapabilitiesSection
            draft={draft}
            patch={patch}
          />
        );
      case 'performance':
        return (
          <PerformanceAdvancedSection
            draft={draft}
            patch={patch}
            telemetryLogs={effectiveTelemetryLogs}
            onClearTelemetryLogs={handleClearLogs}
            notify={notify}
          />
        );
    }
  };

  const renderNavContent = (isMobileList: boolean) => {
    return (
      <div className={isMobileList ? 'ref-settings-group' : 'space-y-1'}>
        {filteredCategories.map((cat) => {
          const Icon = cat.icon;
          const isActive = tab === cat.id;
          if (isMobileList) {
            return (
              <button
                key={cat.id}
                type="button"
                data-testid={`settings-mobile-tab-${cat.id}`}
                onClick={() => openSection(cat.id)}
                className="ref-settings-row"
              >
                <span className="flex items-center gap-3 min-w-0">
                  <span className="ref-settings-row-icon">
                    <Icon className="w-4 h-4" />
                  </span>
                  <span className="text-[14.5px] font-medium text-[var(--ink)] truncate">
                    {cat.label}
                  </span>
                </span>
                <ChevronRight className="w-4 h-4 text-[var(--ink-dim)] shrink-0" />
              </button>
            );
          }
          return (
            <button
              key={cat.id}
              type="button"
              data-testid={`settings-tab-${cat.id}`}
              onClick={() => openSection(cat.id)}
              className={`fs-settings-nav-item ${isActive ? 'is-active' : ''}`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="truncate flex-1 text-left">{cat.label}</span>
            </button>
          );
        })}
      </div>
    );
  };

  const shellContent = (
    <div
      className={`fs-settings-shell settings-redesign ${isInline ? 'is-inline' : ''}`}
      data-testid="settings-workspace-shell"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Top Workspace Header */}
      <header className="fs-settings-header">
        <div className="flex items-center gap-2 min-w-0">
          {mobileDetailOpen ? (
            <button
              type="button"
              data-testid="settings-mobile-back"
              onClick={() => setMobileDetailOpen(false)}
              className="fs-settings-back-btn md:hidden"
              aria-label="Back to Settings"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Back</span>
            </button>
          ) : null}

          <h1 className="text-sm sm:text-[15px] font-semibold text-[var(--ink)] truncate">
            {mobileDetailOpen ? currentMeta.label : 'Settings'}
          </h1>
        </div>

        <button
          type="button"
          onClick={onClose}
          data-testid="settings-close-btn"
          className="w-8 h-8 rounded-lg border border-[var(--border)] bg-[var(--surface)] inline-flex items-center justify-center text-[var(--ink-muted)] hover:text-[var(--ink)] hover:border-[var(--primary-border)] cursor-pointer"
          aria-label="Close settings"
          title="Close (Esc)"
        >
          <X className="w-4 h-4" />
        </button>
      </header>

      {/* Main Split Workspace */}
      <div className="fs-settings-body">
        {/* Desktop Left Rail */}
        <aside
          aria-label="Settings categories"
          className="fs-settings-rail hidden md:flex"
        >
          <div className="flex-1 overflow-y-auto px-3 py-3">
            {renderNavContent(false)}
          </div>
          <div className="px-3 py-2 border-t border-[var(--border)] flex items-center justify-between text-[11px] text-[var(--ink-dim)]">
            <span className="truncate font-medium">{activeProfile.name}</span>
            <span className="font-mono">v{APP_VERSION}</span>
          </div>
        </aside>

        {/* Mobile Overview List */}
        {!mobileDetailOpen && (
          <div className="flex-1 overflow-y-auto px-4 py-4 md:hidden">
            {renderNavContent(true)}
          </div>
        )}

        {/* Section Content Panel */}
        <main
          className={`fs-settings-main ${
            mobileDetailOpen ? 'flex' : 'hidden md:flex'
          }`}
        >
          <div className="fs-settings-content">
            <div className="hidden md:flex items-center justify-between mb-3 pb-2 border-b border-[var(--border)]">
              <h2 className="text-[15px] font-semibold text-[var(--ink)]">
                {currentMeta.label}
              </h2>
            </div>

            {renderActiveSection()}
          </div>
        </main>
      </div>
    </div>
  );

  if (isInline) {
    return <div className="cs-inline-wrap">{shellContent}</div>;
  }

  return (
    <div
      className="fs-settings-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="SMFTA AI Settings Workspace"
      onClick={onClose}
    >
      {shellContent}
    </div>
  );
};
