import React, { useEffect, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronRight,
  Cpu,
  Eye,
  EyeOff,
  Globe,
  Key,
  Layers,
  Loader2,
  Moon,
  Plus,
  RefreshCw,
  Shield,
  Sliders,
  Sparkles,
  Sun,
  Trash2,
  X,
} from 'lucide-react';
import {
  AppSettings,
  AutonomyLevel,
  ConnectionsState,
  ExternalProviderId,
  NotebookEntry,
  ProviderTestStatus,
  SavedProviderProfile,
  SelfSkill,
  SelfUpdateWidget,
  UserProfile,
} from '../types';
import { sanitizeSettings } from '../utils/settings';
import {
  DEFAULT_BUILTIN_PROFILE,
  DEFAULT_PROVIDER_BASE_URLS,
  DEFAULT_PROVIDER_MODELS,
  PROVIDER_CATALOG,
  PROVIDER_GROUP_LABELS,
  ProviderGroup,
  QUICK_PROVIDER_CHIPS,
  detectProviderFromKey,
  getInitialProviderProfiles,
  getModelsForProfile,
  isBuiltinProviderId,
  isKeylessProviderId,
  persistSavedProfiles,
  providerEntry,
} from '../utils/providers';
import { PRIMARY_PROVIDER_OPTIONS } from '../data/providerCatalog';
import {
  fetchProviderModelsClientSide,
  isStandaloneApkEnv,
  testProviderClientSide,
} from '../utils/apkClientFallback';
import {
  addManualMemoryFact,
  clearEntireMemoryBank,
  deleteMemoryFact,
} from '../utils/memoryBank';

function maskApiKey(key?: string): string {
  const k = (key || '').trim();
  if (!k) return '';
  if (k.length <= 8) return '••••••••';
  return `${k.slice(0, 4)}••••${k.slice(-4)}`;
}

export type SettingsTabId =
  | 'providers'
  | 'general'
  | 'privacy'
  | 'memory'
  // Legacy aliases mapped cleanly into the 3 core tabs
  | 'account'
  | 'appearance'
  | 'ai'
  | 'personalization'
  | 'shortcuts'
  | 'notifications'
  | 'accessibility'
  | 'data'
  | 'integrations'
  | 'performance'
  | 'security'
  | 'about'
  | 'profile'
  | 'engine'
  | 'weights'
  | 'connectors'
  | 'self'
  | 'upgrade';

type SectionId = 'providers' | 'general' | 'privacy';

const SECTION_ORDER: SectionId[] = ['providers', 'general', 'privacy'];

const SECTION_META: Record<
  SectionId,
  {
    label: string;
    labelBn: string;
    icon: React.ComponentType<{ className?: string }>;
    hint: string;
  }
> = {
  providers: {
    label: 'AI Providers',
    labelBn: 'AI প্রোভাইডার ও মডেল',
    icon: Cpu,
    hint: 'Mercury, Gemini, OpenAI, Anthropic & Custom API',
  },
  general: {
    label: 'General & Appearance',
    labelBn: 'সাধারণ ও থিম',
    icon: Sliders,
    hint: 'Theme, language & AI system persona',
  },
  privacy: {
    label: 'Memory & Privacy',
    labelBn: 'মেমোরি ও প্রাইভেসি',
    icon: Shield,
    hint: 'Auto-memory toggle, saved facts & full reset',
  },
};

function normalizeTab(t?: SettingsTabId): SectionId {
  switch (t) {
    case 'providers':
    case 'engine':
    case 'ai':
    case 'weights':
    case 'performance':
      return 'providers';
    case 'privacy':
    case 'memory':
    case 'data':
    case 'security':
      return 'privacy';
    case 'general':
    case 'appearance':
    case 'personalization':
    case 'account':
    case 'profile':
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
  connections?: ConnectionsState;
  onUpdateConnections?: (next: ConnectionsState) => void;
  notes?: NotebookEntry[];
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
  usageToday?: { date: string; requests: number; chars: number };
  onOpenSkill?: (skill: SelfSkill) => void;
}

const Card: React.FC<{
  title: string;
  description?: string;
  icon?: React.ReactNode;
  rightSlot?: React.ReactNode;
  children: React.ReactNode;
}> = ({ title, description, icon, rightSlot, children }) => (
  <section className="cs-card rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5">
    <header className="flex items-start justify-between gap-3 pb-3 mb-3 border-b border-[var(--border)]">
      <div className="flex items-start gap-2.5 min-w-0">
        {icon ? (
          <span className="mt-0.5 text-[var(--primary)] shrink-0">{icon}</span>
        ) : null}
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-[var(--text)]">{title}</h3>
          {description ? (
            <p className="text-xs text-[var(--text-3)] mt-0.5">{description}</p>
          ) : null}
        </div>
      </div>
      {rightSlot ? <div className="shrink-0">{rightSlot}</div> : null}
    </header>
    <div>{children}</div>
  </section>
);

const ToggleRow: React.FC<{
  label: string;
  description?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  testId?: string;
}> = ({ label, description, checked, onChange, testId }) => (
  <div className="flex items-center justify-between gap-4 py-2">
    <div className="min-w-0">
      <div className="text-xs sm:text-sm font-semibold text-[var(--text)]">
        {label}
      </div>
      {description ? (
        <div className="text-[11px] sm:text-xs text-[var(--text-3)] mt-0.5">
          {description}
        </div>
      ) : null}
    </div>
    <button
      type="button"
      role="switch"
      data-testid={testId}
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border transition-colors ${
        checked
          ? 'bg-[var(--primary)] border-[var(--primary)]'
          : 'bg-[var(--surface-2)] border-[var(--border)]'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-xs transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-1'
        }`}
      />
    </button>
  </div>
);

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
  onUpdateMemory,
  onClearMemory,
  notify,
  onProviderTestResult,
}) => {
  const isInline = variant === 'inline';
  const [tab, setTab] = useState<SectionId>(() => normalizeTab(initialTab));

  useEffect(() => {
    if (initialTab) setTab(normalizeTab(initialTab));
  }, [initialTab]);

  const [draft, setDraft] = useState<AppSettings>(() => sanitizeSettings(settings));
  const [profileName, setProfileName] = useState(profile.name || '');
  const [localProfiles, setLocalProfiles] = useState<SavedProviderProfile[]>(
    () =>
      externalProfiles && externalProfiles.length > 0
        ? externalProfiles
        : getInitialProviderProfiles(settings)
  );

  // Provider configuration form state (Default Mercury -> mercury-3)
  const [newPropName, setNewPropName] = useState('');
  const [newProviderId, setNewProviderId] = useState<ExternalProviderId>('mercury');
  const [newApiKey, setNewApiKey] = useState('');
  const [showNewKey, setShowNewKey] = useState(false);
  const [newBaseUrl, setNewBaseUrl] = useState(DEFAULT_PROVIDER_BASE_URLS.mercury || '');
  const [newModel, setNewModel] = useState(DEFAULT_PROVIDER_MODELS.mercury || 'mercury-3');
  const [newCustomHeaders, setNewCustomHeaders] = useState('');
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

  // Memory & Privacy state
  const [newMemoryFact, setNewMemoryFact] = useState('');
  const [confirmingClearMemory, setConfirmingClearMemory] = useState(false);

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
    setConfirmingClearMemory(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, isInline]);

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
  const activeProfileModels = getModelsForProfile(activeProfile);

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
        'customHeaders' in changes) &&
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
      });
    }
  };

  const deleteSavedProfile = (id: string) => {
    if (localProfiles.length <= 1) return;
    const nextList = localProfiles.filter((p) => p.id !== id);
    syncProfiles(nextList);
    if (activeProfile?.id === id && nextList[0]) activateSavedProfile(nextList[0]);
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
        setDiscoveryWarning('Model list আনা যায়নি; manual model ID টাইপ করতে পারেন।');
      }
    } catch {
      setDiscoveryWarning('Model list আনা যায়নি; manual model ID টাইপ করতে পারেন।');
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
        notify?.('Model list আনা যায়নি; কাস্টম মডেল আইডি টাইপ করতে পারেন।');
      }
    } catch {
      notify?.('Model list আনা যায়নি; নেটওয়ার্ক যাচাই করুন।');
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
      return ['gemini-3.7-flash', 'deepseek-v4-flash-0731', 'claude-sonnet-5', 'claude-opus-4.8'];
    }
    if (u.includes('inceptionlabs') || u.includes('mercury')) {
      return ['mercury-3', 'mercury', 'mercury-coder'];
    }
    if (u.includes('groq')) {
      return ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768'];
    }
    if (u.includes('openrouter')) {
      return ['google/gemini-2.5-flash', 'meta-llama/llama-3.3-70b-instruct', 'deepseek/deepseek-chat'];
    }
    return ['mercury-3', 'gpt-4o-mini', 'gpt-4o', 'deepseek-chat', 'gemini-2.5-flash'];
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
          'Custom API কানেক্ট করতে Base URL (যেমন: https://api.openai.com/v1) অথবা বৈধ API Key দিন।',
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
      availableModels: mergedModels,
      verified: false,
      verificationStatus: 'untested',
      quotaExhausted: false,
      statusMessage: `Ready · ${workingModel}`,
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
    });
    commit(nextSettings);
    setNewVerifyResult({
      ok: true,
      workingModel,
      message: `Saved & activated "${cleanName}" (${workingModel})`,
    });
    setNewPropName('');
    setNewApiKey('');
    setNewCustomHeaders('');
    setShowNewKey(false);
    setNewBaseUrl(DEFAULT_PROVIDER_BASE_URLS[newProviderId] || '');
    setNewModel(DEFAULT_PROVIDER_MODELS[newProviderId] || 'mercury-3');
    notify?.(`Saved & activated "${cleanName}" (${workingModel})`);
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
          'Verification failed. Check API Key, Base URL or quota. Provider was NOT added.';
        const suggestionSuffix =
          Array.isArray(testData?.suggestedModels) &&
          testData.suggestedModels.length > 0 &&
          !msgText.includes(testData.suggestedModels[0])
            ? ` (উপলব্ধ মডেল: ${testData.suggestedModels.slice(0, 4).join(', ')})`
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
      });
      commit(nextSettings);
      setNewVerifyResult({
        ok: true,
        workingModel,
        message: `✓ Verified & connected "${cleanName}" (${elapsedMs}ms) — model: ${workingModel}`,
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

  // Offer discovered models or standard popular starter models
  const popularStarterModels = getPopularStarterModels(
    newProviderId,
    newBaseUrl,
    newApiKey
  );
  const candidateModelsForNew = Array.from(
    new Set([...discoveredModels, newModel.trim(), ...popularStarterModels].filter(Boolean))
  );
  const detectedProviderFromNewKey = detectProviderFromKey(newApiKey);

  // Memory handlers
  const handleAddMemoryItem = () => {
    const res = addManualMemoryFact(memory, newMemoryFact);
    if (res.error) {
      notify?.(res.error);
      return;
    }
    onUpdateMemory?.(res.updated);
    setNewMemoryFact('');
    notify?.('Memory saved');
  };

  const handleDeleteSingleMemory = (factText: string) => {
    const next = deleteMemoryFact(memory, factText);
    if (next.length === 0) {
      clearEntireMemoryBank();
    }
    onUpdateMemory?.(next);
  };

  const handleConfirmClearAllMemory = () => {
    clearEntireMemoryBank();
    onUpdateMemory?.([]);
    onClearMemory();
    setConfirmingClearMemory(false);
    notify?.('All memory wiped / সব মেমোরি মুছে ফেলা হয়েছে');
  };

  // ── TAB 1: AI Providers ──────────────────────────────────────────────────

  const renderProviders = () => (
    <>
      <Card
        title="Configure AI Provider"
        description="Select a provider, model (Mercury defaults to mercury-3), and API key."
        icon={<Plus className="w-4 h-4" />}
      >
        <div className="space-y-4">
          {/* Quick Provider Selector Pills */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--text-2)] mb-2">
              Provider
            </label>
            <div
              className="grid grid-cols-2 sm:grid-cols-5 gap-2"
              data-testid="provider-selector-pills"
            >
              {PRIMARY_PROVIDER_OPTIONS.map((opt) => {
                const isSelected = newProviderId === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    data-testid={`provider-pill-${opt.id}`}
                    onClick={() => {
                      const nextId = opt.id;
                      const defModel =
                        nextId === 'mercury'
                          ? 'mercury-3'
                          : DEFAULT_PROVIDER_MODELS[nextId] || opt.defaultModel;
                      setNewProviderId(nextId);
                      setNewBaseUrl(DEFAULT_PROVIDER_BASE_URLS[nextId] || '');
                      setNewModel(defModel);
                      setDiscoveredModels([]);
                      setDiscoveryWarning(null);
                      setNewVerifyResult(null);
                    }}
                    className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                      isSelected
                        ? 'border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)] shadow-xs'
                        : 'border-[var(--border)] bg-[var(--bg)] text-[var(--text-2)] hover:text-[var(--text)] hover:border-[var(--primary-border)]'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
            <div className="mt-2">
              <select
                aria-label="Provider selector"
                data-testid="provider-select-dropdown"
                value={newProviderId}
                onChange={(e) => {
                  const nextId = e.target.value as ExternalProviderId;
                  setNewProviderId(nextId);
                  setNewBaseUrl(DEFAULT_PROVIDER_BASE_URLS[nextId] || '');
                  setNewModel(
                    nextId === 'mercury' || nextId === 'inceptionlabs'
                      ? 'mercury-3'
                      : DEFAULT_PROVIDER_MODELS[nextId] || ''
                  );
                  setDiscoveredModels([]);
                  setDiscoveryWarning(null);
                  setNewVerifyResult(null);
                }}
                className="cs-input w-full text-xs"
              >
                {(['popular', 'custom', 'local', 'builtin'] as ProviderGroup[]).map(
                  (grp) => (
                    <optgroup key={grp} label={PROVIDER_GROUP_LABELS[grp]}>
                      {PROVIDER_CATALOG.filter((p) => p.group === grp).map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label}
                        </option>
                      ))}
                    </optgroup>
                  )
                )}
              </select>
            </div>
          </div>

          {/* Model Name Input + Quick Chips */}
          <div>
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-2)]">
                Model Name
              </label>
              <button
                type="button"
                onClick={() => handleFetchNewModels()}
                disabled={isLoadingModels}
                className="text-[11px] font-semibold text-[var(--primary)] hover:underline inline-flex items-center gap-1 cursor-pointer"
              >
                {isLoadingModels ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <RefreshCw className="w-3 h-3" />
                )}
                Fetch Models
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                type="text"
                data-testid="provider-model-input"
                value={newModel}
                onChange={(e) => setNewModel(e.target.value)}
                placeholder={
                  newProviderId === 'mercury'
                    ? 'mercury-3'
                    : DEFAULT_PROVIDER_MODELS[newProviderId] || 'Enter model ID'
                }
                className="cs-input font-mono text-xs"
              />
              {candidateModelsForNew.length > 0 && (
                <select
                  aria-label="Quick select model"
                  data-testid="provider-model-dropdown"
                  value={candidateModelsForNew.includes(newModel) ? newModel : ''}
                  onChange={(e) => {
                    if (e.target.value) setNewModel(e.target.value);
                  }}
                  className="cs-input font-mono text-xs"
                >
                  <option value="" disabled>
                    Select preset model...
                  </option>
                  {candidateModelsForNew.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              )}
            </div>
            {discoveryWarning && (
              <div className="text-[11px] text-amber-500 mt-1">{discoveryWarning}</div>
            )}
          </div>

          {/* API Key Input with Show/Hide Toggle */}
          {!isKeylessProviderId(newProviderId) && (
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--text-2)] mb-1.5">
                API Key
              </label>
              <div className="flex items-center gap-2">
                <input
                  type={showNewKey ? 'text' : 'password'}
                  data-testid="provider-api-key-input"
                  value={newApiKey}
                  onChange={(e) => {
                    const val = e.target.value;
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
                  placeholder={
                    providerEntry(newProviderId)?.keyHint || 'Paste your API key'
                  }
                  className="cs-input flex-1 font-mono text-xs"
                />
                <button
                  type="button"
                  data-testid="provider-api-key-toggle"
                  onClick={() => setShowNewKey((v) => !v)}
                  className="px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] text-xs font-semibold text-[var(--text-2)] hover:text-[var(--text)] inline-flex items-center gap-1.5 cursor-pointer shrink-0"
                  title={showNewKey ? 'Hide API Key' : 'Show API Key'}
                >
                  {showNewKey ? (
                    <EyeOff className="w-3.5 h-3.5" />
                  ) : (
                    <Eye className="w-3.5 h-3.5" />
                  )}
                  <span>{showNewKey ? 'Hide' : 'Show'}</span>
                </button>
              </div>
              {detectedProviderFromNewKey &&
                detectedProviderFromNewKey !== newProviderId && (
                  <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] text-[var(--text-2)]">
                    <span>
                      Key matches{' '}
                      <strong>
                        {providerEntry(detectedProviderFromNewKey)?.label ||
                          detectedProviderFromNewKey}
                      </strong>
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setNewProviderId(detectedProviderFromNewKey);
                        setNewBaseUrl(
                          DEFAULT_PROVIDER_BASE_URLS[detectedProviderFromNewKey] || ''
                        );
                        setNewModel(
                          DEFAULT_PROVIDER_MODELS[detectedProviderFromNewKey] || ''
                        );
                      }}
                      className="text-[var(--primary)] font-semibold hover:underline cursor-pointer"
                    >
                      Switch
                    </button>
                  </div>
                )}
            </div>
          )}

          {/* Optional Advanced Options Accordion (Closed by Default) */}
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] overflow-hidden">
            <button
              type="button"
              data-testid="provider-advanced-toggle"
              aria-expanded={showAdvancedOptions}
              onClick={() => setShowAdvancedOptions((prev) => !prev)}
              className="w-full px-3.5 py-2.5 flex items-center justify-between text-xs font-semibold text-[var(--text-2)] hover:text-[var(--text)] transition-colors cursor-pointer"
            >
              <span>Advanced Options (Base URL, Extra Headers & Profile Name)</span>
              <ChevronDown
                className={`w-4 h-4 transition-transform duration-200 ${
                  showAdvancedOptions ? 'rotate-180' : ''
                }`}
              />
            </button>
            {showAdvancedOptions && (
              <div
                data-testid="provider-advanced-panel"
                className="px-3.5 pb-3.5 pt-2 border-t border-[var(--border)] space-y-3"
              >
                <div>
                  <label className="block text-[11px] font-medium text-[var(--text-2)] mb-1">
                    Profile Label (Optional)
                  </label>
                  <input
                    type="text"
                    value={newPropName}
                    onChange={(e) => setNewPropName(e.target.value)}
                    placeholder={`e.g. My ${
                      providerEntry(newProviderId)?.short || 'Custom'
                    } Profile`}
                    className="cs-input w-full text-xs"
                  />
                </div>
                {!isKeylessProviderId(newProviderId) && (
                  <div>
                    <label className="block text-[11px] font-medium text-[var(--text-2)] mb-1">
                      Base URL
                    </label>
                    <input
                      type="text"
                      data-testid="provider-base-url-input"
                      value={newBaseUrl}
                      onChange={(e) => setNewBaseUrl(e.target.value)}
                      placeholder={
                        DEFAULT_PROVIDER_BASE_URLS[newProviderId] ||
                        'https://api.inceptionlabs.ai/v1'
                      }
                      className="cs-input w-full font-mono text-xs"
                    />
                  </div>
                )}
                <div>
                  <label className="block text-[11px] font-medium text-[var(--text-2)] mb-1">
                    Extra Headers (JSON, Optional)
                  </label>
                  <input
                    type="text"
                    data-testid="provider-extra-headers-input"
                    value={newCustomHeaders}
                    onChange={(e) => setNewCustomHeaders(e.target.value)}
                    placeholder='{"HTTP-Referer": "https://example.com"}'
                    className="cs-input w-full font-mono text-xs"
                  />
                </div>
              </div>
            )}
          </div>

          {newVerifyResult && (
            <div
              className={`px-3 py-2 rounded-xl text-xs font-medium border ${
                newVerifyResult.ok
                  ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-400'
                  : 'border-rose-500/35 bg-rose-500/10 text-rose-400'
              }`}
            >
              {newVerifyResult.message}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={handleSaveWithoutVerification}
              disabled={isVerifyingNew}
              className="px-3.5 py-2 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] text-xs font-semibold text-[var(--text)] hover:border-[var(--primary-border)] cursor-pointer"
            >
              Save Profile
            </button>
            <button
              type="button"
              onClick={handleVerifyAndAddProvider}
              disabled={isVerifyingNew}
              className="px-4 py-2 rounded-xl bg-[var(--primary)] text-white text-xs font-semibold inline-flex items-center gap-1.5 hover:opacity-95 cursor-pointer"
            >
              {isVerifyingNew ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Check className="w-3.5 h-3.5" />
              )}
              {isVerifyingNew ? 'Testing...' : 'Verify & Connect'}
            </button>
          </div>
        </div>
      </Card>

      {/* Active & Saved Profiles */}
      <Card
        title={`Saved Profiles (${localProfiles.length})`}
        description="Switch active profile, update model or API key, or test connection."
        icon={<Layers className="w-4 h-4" />}
      >
        <div className="space-y-2.5">
          {localProfiles.map((prof) => {
            const isSelected = activeProfile?.id === prof.id;
            const isEditing = editingProfileId === prof.id;
            const isBuiltin =
              prof.isBuiltin || isBuiltinProviderId(prof.provider);
            const isKeyRevealed = Boolean(revealedKeyIds[prof.id]);
            const isTesting = testingProfileId === prof.id;
            const isRefreshing = loadingModelsForId === prof.id;
            const modelsForProf = getModelsForProfile(prof);
            const vStatus =
              prof.verificationStatus ||
              (prof.verified ? 'verified' : 'untested');

            return (
              <div
                key={prof.id}
                className={`rounded-xl border p-3 transition-colors ${
                  isSelected
                    ? 'border-[var(--primary)] bg-[var(--primary-soft)]'
                    : 'border-[var(--border)] bg-[var(--bg)]'
                }`}
              >
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <button
                    type="button"
                    onClick={() => activateSavedProfile(prof)}
                    className="flex items-center gap-2.5 min-w-0 flex-1 text-left cursor-pointer"
                  >
                    <span
                      className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0 ${
                        isSelected
                          ? 'border-[var(--primary)] bg-[var(--primary)]'
                          : 'border-[var(--text-3)]'
                      }`}
                    >
                      {isSelected && (
                        <span className="w-1.5 h-1.5 rounded-full bg-white" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap text-xs font-bold text-[var(--text)]">
                        <span className="truncate">{prof.name}</span>
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-[var(--surface-2)] text-[var(--text-2)] border border-[var(--border)]">
                          {providerEntry(prof.provider)?.short || prof.provider}
                        </span>
                        {isBuiltin && (
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-[var(--primary-soft)] text-[var(--primary)]">
                            Built-in
                          </span>
                        )}
                        {!isBuiltin && vStatus === 'verified' && (
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-500/15 text-emerald-400">
                            Verified
                          </span>
                        )}
                        {!isBuiltin && vStatus === 'failed' && (
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-rose-500/15 text-rose-400">
                            Failed
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-[var(--text-3)] mt-0.5">
                        <span className="font-mono">
                          {prof.externalModel ||
                            DEFAULT_PROVIDER_MODELS[prof.provider] ||
                            'Auto'}
                        </span>
                        {!isBuiltin && prof.externalKeys && (
                          <span> · Key: {maskApiKey(prof.externalKeys)}</span>
                        )}
                      </div>
                    </div>
                  </button>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {!isBuiltin && (
                      <button
                        type="button"
                        onClick={() => handleTestExistingProfile(prof)}
                        disabled={isTesting}
                        className="px-2.5 py-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-xs font-semibold text-[var(--text-2)] hover:text-[var(--text)] inline-flex items-center gap-1 cursor-pointer"
                      >
                        {isTesting ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Sparkles className="w-3 h-3" />
                        )}
                        Test
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        setEditingProfileId(isEditing ? null : prof.id)
                      }
                      className="px-2.5 py-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-xs font-semibold text-[var(--text-2)] hover:text-[var(--text)] inline-flex items-center gap-1 cursor-pointer"
                    >
                      {isEditing ? 'Close' : 'Edit'}
                      <ChevronRight
                        className={`w-3 h-3 transition-transform ${
                          isEditing ? 'rotate-90' : ''
                        }`}
                      />
                    </button>
                    {!isBuiltin && localProfiles.length > 1 && (
                      <button
                        type="button"
                        onClick={() => deleteSavedProfile(prof.id)}
                        className="p-1.5 rounded-lg text-[var(--text-3)] hover:text-rose-400 hover:bg-rose-500/10 cursor-pointer"
                        title="Delete profile"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {prof.statusMessage && (
                  <div
                    className={`mt-2 text-[11px] ${
                      prof.quotaExhausted || vStatus === 'failed'
                        ? 'text-rose-400'
                        : vStatus === 'verified'
                        ? 'text-emerald-400'
                        : 'text-[var(--text-3)]'
                    }`}
                  >
                    {prof.statusMessage}
                  </div>
                )}

                {isEditing && (
                  <div className="mt-3 pt-3 border-t border-[var(--border)] space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div>
                        <span className="block text-[11px] font-semibold text-[var(--text-2)] mb-1">
                          Profile Name
                        </span>
                        <input
                          type="text"
                          value={prof.name}
                          onChange={(e) =>
                            updateSavedProfileField(prof.id, {
                              name: e.target.value,
                            })
                          }
                          className="cs-input w-full text-xs"
                        />
                      </div>
                      <div>
                        <span className="block text-[11px] font-semibold text-[var(--text-2)] mb-1">
                          Provider
                        </span>
                        <select
                          value={prof.provider}
                          onChange={(e) => {
                            const nextProv =
                              e.target.value as ExternalProviderId;
                            updateSavedProfileField(prof.id, {
                              provider: nextProv,
                              externalBaseUrl:
                                DEFAULT_PROVIDER_BASE_URLS[nextProv] || '',
                              externalModel:
                                nextProv === 'mercury'
                                  ? 'mercury-3'
                                  : DEFAULT_PROVIDER_MODELS[nextProv] || '',
                            });
                          }}
                          className="cs-input w-full text-xs"
                        >
                          {PROVIDER_CATALOG.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-[11px] font-semibold text-[var(--text-2)]">
                          Model
                        </span>
                        {!isBuiltin && (
                          <button
                            type="button"
                            onClick={() => handleRefreshProfileModels(prof)}
                            disabled={isRefreshing}
                            className="text-[11px] font-semibold text-[var(--primary)] hover:underline inline-flex items-center gap-1 cursor-pointer"
                          >
                            {isRefreshing ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <RefreshCw className="w-3 h-3" />
                            )}
                            Fetch models
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {modelsForProf.length > 0 && (
                          <select
                            value={
                              modelsForProf.includes(prof.externalModel)
                                ? prof.externalModel
                                : '__custom__'
                            }
                            onChange={(e) => {
                              if (e.target.value !== '__custom__') {
                                updateSavedProfileField(prof.id, {
                                  externalModel: e.target.value,
                                });
                              }
                            }}
                            className="cs-input font-mono text-xs"
                          >
                            {modelsForProf.map((m) => (
                              <option key={m} value={m}>
                                {m}
                              </option>
                            ))}
                            <option value="__custom__">Custom model ID…</option>
                          </select>
                        )}
                        <input
                          type="text"
                          value={prof.externalModel}
                          onChange={(e) =>
                            updateSavedProfileField(prof.id, {
                              externalModel: e.target.value,
                            })
                          }
                          placeholder={
                            DEFAULT_PROVIDER_MODELS[prof.provider] ||
                            'mercury-3'
                          }
                          className="cs-input font-mono text-xs"
                        />
                      </div>
                    </div>

                    {!isKeylessProviderId(prof.provider) && (
                      <>
                        <div>
                          <span className="block text-[11px] font-semibold text-[var(--text-2)] mb-1">
                            API Key (preserved safely unless edited)
                          </span>
                          <div className="flex items-center gap-2">
                            <input
                              type={isKeyRevealed ? 'text' : 'password'}
                              value={prof.externalKeys}
                              onChange={(e) =>
                                updateSavedProfileField(prof.id, {
                                  externalKeys: e.target.value,
                                })
                              }
                              placeholder="sk-... / AIza..."
                              className="cs-input font-mono flex-1 text-xs"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                setRevealedKeyIds((prev) => ({
                                  ...prev,
                                  [prof.id]: !prev[prof.id],
                                }))
                              }
                              className="p-2 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-2)] hover:text-[var(--text)] cursor-pointer"
                              title={isKeyRevealed ? 'Hide key' : 'Show key'}
                            >
                              {isKeyRevealed ? (
                                <EyeOff className="w-3.5 h-3.5" />
                              ) : (
                                <Eye className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        </div>

                        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
                          <button
                            type="button"
                            onClick={() =>
                              setProfileAdvancedOpen((prev) => ({
                                ...prev,
                                [prof.id]: !prev[prof.id],
                              }))
                            }
                            className="w-full px-3 py-2 flex items-center justify-between text-xs font-medium text-[var(--text-2)] hover:text-[var(--text)] cursor-pointer"
                          >
                            <span>Advanced Options (Base URL & Headers)</span>
                            <ChevronDown
                              className={`w-3.5 h-3.5 transition-transform ${
                                profileAdvancedOpen[prof.id] ? 'rotate-180' : ''
                              }`}
                            />
                          </button>
                          {profileAdvancedOpen[prof.id] && (
                            <div className="p-3 border-t border-[var(--border)] space-y-2.5">
                              <div>
                                <span className="block text-[11px] font-medium text-[var(--text-2)] mb-1">
                                  Base URL
                                </span>
                                <input
                                  type="text"
                                  value={prof.externalBaseUrl}
                                  onChange={(e) =>
                                    updateSavedProfileField(prof.id, {
                                      externalBaseUrl: e.target.value,
                                    })
                                  }
                                  placeholder={
                                    DEFAULT_PROVIDER_BASE_URLS[prof.provider] ||
                                    'https://api.openai.com/v1'
                                  }
                                  className="cs-input w-full font-mono text-xs"
                                />
                              </div>
                              <div>
                                <span className="block text-[11px] font-medium text-[var(--text-2)] mb-1">
                                  Extra Headers (JSON)
                                </span>
                                <input
                                  type="text"
                                  value={prof.customHeaders || ''}
                                  onChange={(e) =>
                                    updateSavedProfileField(prof.id, {
                                      customHeaders: e.target.value,
                                    })
                                  }
                                  placeholder='{"HTTP-Referer": "https://example.com"}'
                                  className="cs-input w-full font-mono text-xs"
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {activeProfileModels.length > 0 && (
        <Card
          title="Quick Model Switch"
          description={`Switch the model on "${activeProfile.name}".`}
          icon={<Key className="w-4 h-4" />}
        >
          <div className="flex flex-wrap gap-1.5">
            {activeProfileModels.slice(0, 12).map((m) => {
              const active =
                (activeProfile.externalModel || draft.externalModel) === m;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() =>
                    updateSavedProfileField(activeProfile.id, {
                      externalModel: m,
                    })
                  }
                  className={`px-2.5 py-1 rounded-lg text-xs font-mono border transition-colors cursor-pointer ${
                    active
                      ? 'border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)] font-semibold'
                      : 'border-[var(--border)] bg-[var(--bg)] text-[var(--text-2)] hover:text-[var(--text)]'
                  }`}
                >
                  {m}
                </button>
              );
            })}
          </div>
        </Card>
      )}
    </>
  );

  // ── TAB 2: General & Appearance ──────────────────────────────────────────

  const renderGeneral = () => (
    <>
      <Card
        title="Appearance & Theme"
        description="Switch between Dark and Light mode."
        icon={
          draft.theme === 'dark' ? (
            <Moon className="w-4 h-4" />
          ) : (
            <Sun className="w-4 h-4" />
          )
        }
      >
        <div className="flex items-center justify-between gap-4 py-1">
          <div className="min-w-0">
            <div className="text-xs sm:text-sm font-semibold text-[var(--text)]">
              Theme / থিম
            </div>
            <div className="text-[11px] sm:text-xs text-[var(--text-3)] mt-0.5">
              Choose Dark or Light interface theme. Changes persist immediately.
            </div>
          </div>
          <div className="cs-seg" data-testid="theme-selector">
            <button
              type="button"
              data-testid="theme-dark-btn"
              onClick={() => patch({ theme: 'dark' })}
              className={`cs-seg-btn ${draft.theme === 'dark' ? 'is-active' : ''}`}
            >
              <Moon className="w-3.5 h-3.5 inline mr-1" />
              Dark
            </button>
            <button
              type="button"
              data-testid="theme-light-btn"
              onClick={() => patch({ theme: 'light' })}
              className={`cs-seg-btn ${draft.theme === 'light' ? 'is-active' : ''}`}
            >
              <Sun className="w-3.5 h-3.5 inline mr-1" />
              Light
            </button>
          </div>
        </div>
      </Card>

      <Card
        title="Language & Profile"
        description="Configure your display language and profile name."
        icon={<Globe className="w-4 h-4" />}
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="text-xs sm:text-sm font-semibold text-[var(--text)]">
                App Language / অ্যাপের ভাষা
              </div>
              <div className="text-[11px] sm:text-xs text-[var(--text-3)] mt-0.5">
                Select Bengali (বাংলা) or English interface & reply preference.
              </div>
            </div>
            <div className="cs-seg" data-testid="language-selector">
              <button
                type="button"
                data-testid="lang-bn-btn"
                onClick={() => patch({ appLanguage: 'bn', replyLang: 'bn' })}
                className={`cs-seg-btn ${
                  (draft.appLanguage || 'bn') === 'bn' ? 'is-active' : ''
                }`}
              >
                বাংলা
              </button>
              <button
                type="button"
                data-testid="lang-en-btn"
                onClick={() => patch({ appLanguage: 'en', replyLang: 'en' })}
                className={`cs-seg-btn ${
                  draft.appLanguage === 'en' ? 'is-active' : ''
                }`}
              >
                English
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between gap-4 pt-3 border-t border-[var(--border)]">
            <div className="min-w-0">
              <div className="text-xs sm:text-sm font-semibold text-[var(--text)]">
                Your Name / আপনার নাম
              </div>
              <div className="text-[11px] sm:text-xs text-[var(--text-3)] mt-0.5">
                How the AI assistant addresses you.
              </div>
            </div>
            <input
              type="text"
              value={profileName}
              maxLength={80}
              placeholder="e.g. Saymon"
              onChange={(e) => handleNameChange(e.target.value)}
              className="cs-input text-xs w-44 sm:w-56"
            />
          </div>
        </div>
      </Card>

      <Card
        title="Custom System Instruction / AI Persona"
        description="Define custom instructions or persona rules that guide the AI across all conversations."
        icon={<Sparkles className="w-4 h-4" />}
      >
        <div className="space-y-2">
          <div className="text-xs font-semibold text-[var(--text)]">
            System Instruction (সিস্টেম নির্দেশনা)
          </div>
          <textarea
            rows={4}
            data-testid="custom-system-instruction-textarea"
            value={draft.customInst || ''}
            maxLength={4000}
            placeholder="e.g. Always answer concisely in fluent Bengali and provide complete TypeScript code examples..."
            onChange={(e) => patch({ customInst: e.target.value })}
            className="cs-textarea w-full text-xs"
          />
          <div className="text-[11px] text-[var(--text-3)]">
            Automatically saved to localStorage as you type.
          </div>
        </div>
      </Card>
    </>
  );

  // ── TAB 3: Memory & Privacy ──────────────────────────────────────────────

  const renderPrivacy = () => (
    <>
      <Card
        title="Memory Controls & Privacy"
        description="Manage how the AI remembers facts from your conversations."
        icon={<Shield className="w-4 h-4" />}
      >
        <ToggleRow
          label="Auto-Memory / অটো-মেমোরি"
          description="Automatically save important personal facts shared during conversation."
          checked={draft.autoMemory !== false}
          onChange={(v) => patch({ autoMemory: v })}
          testId="auto-memory-toggle"
        />

        <div className="pt-3 mt-3 border-t border-[var(--border)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold text-red-500">
              Complete Memory Wipe / সম্পূর্ণ মেমোরি রিসেট
            </div>
            <div className="text-[11px] text-[var(--text-3)] mt-0.5">
              Permanently deletes all saved facts (`smfta_memory` & `smfta_memory_backup`) and resets active memory immediately.
            </div>
          </div>

          {!confirmingClearMemory ? (
            <button
              type="button"
              data-testid="clear-all-memory-btn"
              onClick={() => setConfirmingClearMemory(true)}
              className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-red-500/15 text-red-500 border border-red-500/35 hover:bg-red-500/25 transition-colors inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear All Memory / সব মেমোরি মুছুন</span>
            </button>
          ) : (
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                data-testid="confirm-clear-all-memory-btn"
                onClick={handleConfirmClearAllMemory}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-red-600 text-white hover:bg-red-500 transition-colors cursor-pointer"
              >
                Confirm Wipe ({memory.length})
              </button>
              <button
                type="button"
                onClick={() => setConfirmingClearMemory(false)}
                className="px-3 py-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] text-xs font-semibold text-[var(--text)] cursor-pointer"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </Card>

      <Card
        title={`Saved Memory Facts (${memory.length})`}
        description="Context-relevant facts are selectively injected into prompts. Delete any item instantly with the trash icon."
      >
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <input
              type="text"
              data-testid="add-memory-fact-input"
              value={newMemoryFact}
              onChange={(e) => setNewMemoryFact(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddMemoryItem();
                }
              }}
              placeholder="Add a memory fact (e.g. নাম: সায়মন / Profession: Full-Stack Developer)"
              className="cs-input flex-1 text-xs"
            />
            <button
              type="button"
              data-testid="add-memory-fact-btn"
              onClick={handleAddMemoryItem}
              className="px-3.5 py-2 rounded-xl bg-[var(--primary)] text-white text-xs font-semibold inline-flex items-center gap-1.5 hover:opacity-95 cursor-pointer shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              Add
            </button>
          </div>

          {memory.length === 0 ? (
            <div
              data-testid="memory-empty-state"
              className="py-6 text-center text-xs text-[var(--text-3)] rounded-xl border border-dashed border-[var(--border)]"
            >
              No saved memory facts. Memory bank is completely clean.
            </div>
          ) : (
            <div
              data-testid="memory-facts-list"
              className="max-h-72 overflow-y-auto space-y-1.5 pr-1"
            >
              {memory.map((fact, idx) => (
                <div
                  key={`${idx}-${fact}`}
                  data-testid="memory-fact-row"
                  className="flex items-center justify-between gap-2.5 px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--bg)] text-xs text-[var(--text)]"
                >
                  <span className="break-words min-w-0 flex-1">{fact}</span>
                  <button
                    type="button"
                    data-testid={`delete-memory-item-${idx}`}
                    onClick={() => handleDeleteSingleMemory(fact)}
                    className="p-1.5 rounded-lg text-[var(--text-3)] hover:text-red-500 hover:bg-red-500/10 transition-colors shrink-0 cursor-pointer"
                    title="Delete memory item"
                    aria-label={`Delete memory fact ${fact}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>
    </>
  );

  const renderActiveSection = () => {
    switch (tab) {
      case 'providers':
        return renderProviders();
      case 'general':
        return renderGeneral();
      case 'privacy':
        return renderPrivacy();
    }
  };

  const currentMeta = SECTION_META[tab];

  const shellContent = (
    <div
      className={`cs-shell ${isInline ? 'is-inline' : ''}`}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Left Navigation: Strictly 3 Clean Tabs */}
      <aside className="cs-nav hidden sm:flex" aria-label="Settings sections">
        <div className="cs-nav-head px-4 pt-4 pb-2 flex items-center justify-between">
          <div className="cs-nav-title">Settings</div>
        </div>

        <nav className="cs-nav-list" data-testid="settings-nav-tabs">
          {SECTION_ORDER.map((id) => {
            const meta = SECTION_META[id];
            const Icon = meta.icon;
            const active = tab === id;
            return (
              <button
                key={id}
                type="button"
                data-section={id}
                data-testid={`settings-tab-${id}`}
                onClick={() => setTab(id)}
                className={`cs-nav-item ${active ? 'active' : ''}`}
              >
                <span className="cs-nav-icon">
                  <Icon className="w-4 h-4" />
                </span>
                <span className="cs-nav-meta">
                  <span className="cs-nav-label">{meta.label}</span>
                  <span className="cs-nav-hint">{meta.hint}</span>
                </span>
              </button>
            );
          })}
        </nav>
      </aside>

      {/* Main Content Area */}
      <div className="cs-panel">
        <header className="cs-panel-head justify-between">
          <div className="min-w-0">
            <h2>{currentMeta.label}</h2>
            <p>{currentMeta.hint}</p>
          </div>
          {!isInline && (
            <button
              type="button"
              onClick={onClose}
              className="cs-close"
              aria-label="Close settings"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </header>

        {/* Mobile 3-Tab Pill Switcher for compact viewports */}
        <div className="flex sm:hidden items-center gap-1.5 px-4 py-2.5 border-b border-[var(--border)] bg-[var(--surface)] overflow-x-auto">
          {SECTION_ORDER.map((id) => {
            const meta = SECTION_META[id];
            const active = tab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap border transition-colors ${
                  active
                    ? 'border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]'
                    : 'border-[var(--border)] bg-[var(--bg)] text-[var(--text-2)]'
                }`}
              >
                {meta.label}
              </button>
            );
          })}
        </div>

        <div className="cs-panel-body">{renderActiveSection()}</div>
      </div>
    </div>
  );

  if (isInline) {
    return <div className="cs-inline-wrap">{shellContent}</div>;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-xs p-2 sm:p-4"
      onClick={onClose}
    >
      <div className="cs-modal">{shellContent}</div>
    </div>
  );
};
