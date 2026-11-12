/**
 * SettingsHub — Claude-style professional settings surface (v18.12).
 *
 * Eight focused sections with a quiet left navigation and a single content
 * panel: General · Appearance · AI Providers · Chat · Privacy & Data ·
 * Cloud Connectors · AI Permissions · Account.
 *
 * Design rules:
 * - small heading + one-line description per card, controls on the right
 * - no duplicated options, no giant paragraphs, no dead toggles
 * - every control writes through `onSave` immediately, so a refresh keeps it
 * - Cancel restores the opening snapshot; Save closes; Reset restores defaults
 * - legacy deep-link ids (engine/tune/data/self/…) still resolve via normalizeTab
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Bell,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Cloud,
  Download,
  Edit3,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Lock,
  LogOut,
  Moon,
  Sun,
  Languages,
  MessageSquare,
  Palette,
  Pin,
  PinOff,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Server,
  Settings as SettingsIcon,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Upload,
  User,
  Wrench,
  X,
  Zap,
} from 'lucide-react';
import {
  addManualMemoryFact,
  updateMemoryFact,
  deleteMemoryFact,
  toggleMemoryPin,
  searchMemoryFacts,
} from '../utils/memoryBank';
import {
  AppSettings,
  ExternalProviderId,
  NotebookNote,
  ProviderTestStatus,
  SavedProviderProfile,
  SelfUpdateWidget,
  UserProfile,
} from '../types';
import { VaultConnections } from '../utils/cloudVault';
import {
  AutonomyLevel,
  SelfSkill,
  runSelfCheck,
} from '../utils/selfEngine';
import { VaultConnectionsPanel } from './VaultConnectionsPanel';
import { sanitizeSettings } from '../utils/settings';
import {
  BUILTIN_TIERS,
  DEFAULT_BUILTIN_PROFILE,
  DEFAULT_PROVIDER_BASE_URLS,
  DEFAULT_PROVIDER_MODELS,
  PROVIDER_CATALOG,
  PROVIDER_GROUP_LABELS,
  ProviderGroup,
  builtinTierLabel,
  detectProviderFromKey,
  getInitialProviderProfiles,
  getModelsForProfile,
  isBuiltinProviderId,
  isKeylessProviderId,
  maskKey,
  persistSavedProfiles,
  providerEntry,
} from '../utils/providers';
import {
  PRIMARY_PROVIDER_OPTIONS,
  QUICK_PROVIDER_CHIPS,
} from '../data/providerCatalog';
import {
  fetchProviderModelsClientSide,
  isStandaloneApkEnv,
  testProviderClientSide,
} from '../utils/apkClientFallback';
import { playNotifChime } from '../utils/notify';
import { useAuth } from '../context/AuthContext';
import { APP_VERSION } from '../version';
import {
  TOOL_CAPABILITY_REGISTRY,
  WORKSPACE_RUNTIME_CAPABILITIES,
  isToolEnabled,
} from '../utils/capabilityRegistry';
import { SETTINGS_SCHEMA_VERSION } from '../utils/settings';

/** Legacy deep-link ids accepted by callers (App.tsx, command palette). */
export type SettingsTabId =
  | 'general'
  | 'appearance'
  | 'engine'
  | 'tune'
  | 'performance'
  | 'data'
  | 'account'
  | 'connections'
  | 'self'
  | 'voice'
  | 'accessibility'
  | 'advanced'
  | 'about';

/** Settings sections (v19.0.0 complete system settings). */
export type SectionId =
  | 'general'
  | 'appearance'
  | 'providers'
  | 'performance'
  | 'chat'
  | 'privacy'
  | 'connectors'
  | 'permissions'
  | 'accessibility'
  | 'advanced'
  | 'account';

function normalizeTab(tabId?: SettingsTabId | SectionId | string): SectionId {
  const map: Record<string, SectionId> = {
    general: 'general',
    appearance: 'appearance',
    engine: 'providers',
    tune: 'providers',
    providers: 'providers',
    models: 'providers',
    performance: 'performance',
    chat: 'chat',
    data: 'privacy',
    privacy: 'privacy',
    security: 'privacy',
    memory: 'privacy',
    connections: 'connectors',
    integrations: 'connectors',
    self: 'permissions',
    automation: 'permissions',
    permissions: 'permissions',
    accessibility: 'accessibility',
    advanced: 'advanced',
    account: 'account',
    about: 'account',
    usage: 'account',
    notifications: 'chat',
    personalization: 'general',
    voice: 'general',
  };
  return (tabId && map[tabId]) || 'general';
}


export interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: UserProfile;
  settings: AppSettings;
  memory: string[];
  savedProfiles?: SavedProviderProfile[];
  onUpdateProfiles?: (profiles: SavedProviderProfile[]) => void;
  onSelectProfile?: (profile: SavedProviderProfile) => void;
  onSave: (newProfile: UserProfile, newSettings: AppSettings) => void;
  onProviderTestResult?: (status: ProviderTestStatus) => void;
  onResetSettings?: () => void;
  onClearMemory: () => void;
  onUpdateMemory?: (next: string[]) => void;
  onExportBackup: () => void;
  onImportBackup: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSaveRollbackPoint?: () => void;
  onRollback?: () => void;
  hasRollbackPoint?: boolean;
  onClearAllData: () => void;
  onOpenWhatsNew: () => void;
  initialTab?: SettingsTabId;
  isInline?: boolean;
  connections?: VaultConnections;
  onUpdateConnections?: (next: VaultConnections) => void;
  notes?: NotebookNote[];
  onOpenNotebook?: () => void;
  selfWidgets?: SelfUpdateWidget[];
  onUpdateWidgets?: (next: SelfUpdateWidget[]) => void;
  onOpenWidget?: (widget: SelfUpdateWidget) => void;
  notify?: (msg: string) => void;
  onBackupToGithub?: () => void | Promise<void>;
  skills?: SelfSkill[];
  onUpdateSkills?: (next: SelfSkill[]) => void;
  autonomy?: AutonomyLevel;
  onAutonomyChange?: (level: AutonomyLevel) => void;
  onSelfRepair?: () => void;
  onOpenSkill?: (skill: SelfSkill) => void;
  keystoreEphemeral?: boolean;
  usageToday?: number;
}

// ── Compact, reusable Claude-style primitives ──────────────────────────────

const ToggleRow: React.FC<{
  label: string;
  description?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}> = ({ label, description, checked, onChange, disabled }) => (
  <div className="cs-row">
    <div className="cs-row-info">
      <span className={`cs-label ${disabled ? 'opacity-50' : ''}`}>{label}</span>
      {description && <span className="cs-desc">{description}</span>}
    </div>
    <label className={`toggle-switch ${disabled ? 'opacity-50' : ''}`}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="slider" />
    </label>
  </div>
);

const SelectRow: React.FC<{
  label: string;
  description?: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}> = ({ label, description, value, options, onChange }) => (
  <div className="cs-row">
    <div className="cs-row-info">
      <span className="cs-label">{label}</span>
      {description && <span className="cs-desc">{description}</span>}
    </div>
    <select
      className="cs-select"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  </div>
);

const TextRow: React.FC<{
  label: string;
  description?: string;
  value: string;
  placeholder?: string;
  type?: string;
  maxLength?: number;
  mono?: boolean;
  onChange: (value: string) => void;
}> = ({ label, description, value, placeholder, type = 'text', maxLength, mono, onChange }) => (
  <div className="cs-row cs-row-column">
    <div className="cs-row-info">
      <span className="cs-label">{label}</span>
      {description && <span className="cs-desc">{description}</span>}
    </div>
    <input
      type={type}
      className={`cs-input ${mono ? 'font-mono' : ''}`}
      value={value}
      placeholder={placeholder}
      maxLength={maxLength}
      onChange={(e) => onChange(e.target.value)}
    />
  </div>
);

const SliderRow: React.FC<{
  label: string;
  description?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format?: (v: number) => string;
  onChange: (value: number) => void;
}> = ({ label, description, value, min, max, step, format, onChange }) => (
  <div className="cs-row">
    <div className="cs-row-info">
      <span className="cs-label">{label}</span>
      {description && <span className="cs-desc">{description}</span>}
    </div>
    <div className="cs-slider-wrap">
      <input
        type="range"
        className="cs-slider"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="cs-slider-value">
        {format ? format(value) : value}
      </span>
    </div>
  </div>
);

const SegmentedRow: React.FC<{
  label: string;
  description?: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}> = ({ label, description, value, options, onChange }) => (
  <div className="cs-row cs-row-column">
    <div className="cs-row-info">
      <span className="cs-label">{label}</span>
      {description && <span className="cs-desc">{description}</span>}
    </div>
    <div className="cs-segmented">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={value === o.value ? 'active' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  </div>
);

const Card: React.FC<{
  title: string;
  description?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}> = ({ title, description, icon, children }) => (
  <section className="cs-card">
    <header className="cs-card-head">
      {icon && <span className="cs-card-icon">{icon}</span>}
      <div>
        <h3>{title}</h3>
        {description && <p>{description}</p>}
      </div>
    </header>
    <div className="cs-card-body">{children}</div>
  </section>
);

type ProviderUiStatus = 'Connected' | 'Failed' | 'Disabled' | 'Not Tested';

function describeProviderStatus(prof: SavedProviderProfile): ProviderUiStatus {
  if (prof.enabled === false) return 'Disabled';
  if (prof.verificationStatus === 'verified' || prof.verified === true) {
    return 'Connected';
  }
  if (
    prof.verificationStatus === 'failed' ||
    prof.verificationStatus === 'degraded' ||
    (prof.verified === false && prof.lastTestedAt)
  ) {
    return 'Failed';
  }
  if (
    prof.verificationStatus === 'untested' ||
    prof.verificationStatus === 'stale' ||
    !prof.lastTestedAt
  ) {
    return 'Not Tested';
  }
  if (isBuiltinProviderId(prof.provider)) return 'Connected';
  if (!prof.externalKeys && !isKeylessProviderId(prof.provider)) return 'Disabled';
  return 'Not Tested';
}

const SECTION_META: Record<
  SectionId,
  { label: string; hint: string; keywords: string; icon: React.ReactNode }
> = {
  general: {
    label: 'General',
    hint: 'Language, profile and response defaults',
    keywords: 'general সাধারণ ভাষা language profile name persona voice speech send enter conversation',
    icon: <SettingsIcon className="w-4 h-4" />,
  },
  appearance: {
    label: 'Appearance',
    hint: 'Theme, color, typography and layout',
    keywords: 'appearance থিম theme dark light accent font radius density motion css spacing code',
    icon: <Palette className="w-4 h-4" />,
  },
  providers: {
    label: 'AI Providers',
    hint: 'Providers, keys, models and testing',
    keywords: 'provider এপিআই api key secret model মডেল groq gemini openai test temperature token context',
    icon: <Server className="w-4 h-4" />,
  },
  performance: {
    label: 'Responses',
    hint: 'Speed modes, streaming, tokens, retries and fallback',
    keywords: 'performance response fast balanced quality streaming token timeout retry fallback latency',
    icon: <Zap className="w-4 h-4" />,
  },
  chat: {
    label: 'Chat',
    hint: 'History, streaming, composer and alerts',
    keywords: 'chat চ্যাট history streaming markdown scroll timestamp notification upload search',
    icon: <MessageSquare className="w-4 h-4" />,
  },
  privacy: {
    label: 'Privacy & Data',
    hint: 'Memory, retention, backups and reset',
    keywords: 'privacy প্রাইভেসি data memory retention backup export import reset delete encryption keystore',
    icon: <Lock className="w-4 h-4" />,
  },
  connectors: {
    label: 'Connections',
    hint: 'Google Drive, GitHub and cloud sync',
    keywords: 'cloud connector drive github sync কানেক্ট integration vault',
    icon: <Cloud className="w-4 h-4" />,
  },
  permissions: {
    label: 'Tools & Permissions',
    hint: 'Autonomy, tool permissions and self-control',
    keywords: 'permission autonomy authority retry timeout skill widget self repair capability gpu tools',
    icon: <ShieldCheck className="w-4 h-4" />,
  },
  accessibility: {
    label: 'Accessibility',
    hint: 'Contrast, focus rings, touch targets and readability',
    keywords: 'accessibility contrast focus ring keyboard touch target screen reader unicode',
    icon: <Eye className="w-4 h-4" />,
  },
  advanced: {
    label: 'Advanced',
    hint: 'Streaming diagnostics, capability registry and schema',
    keywords: 'advanced diagnostics debug capability registry runtime sandbox schema',
    icon: <SlidersHorizontal className="w-4 h-4" />,
  },
  account: {
    label: 'Profile & About',
    hint: 'Profile, usage and app version',
    keywords: 'profile avatar usage about version',
    icon: <User className="w-4 h-4" />,
  },
};

const SECTION_ORDER: SectionId[] = [
  'general',
  'appearance',
  'providers',
  'performance',
  'chat',
  'privacy',
  'connectors',
  'permissions',
  'accessibility',
  'advanced',
  'account',
];


export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  profile,
  settings,
  memory,
  savedProfiles: externalProfiles,
  onUpdateProfiles,
  onSelectProfile,
  onSave,
  onProviderTestResult,
  onResetSettings,
  onClearMemory,
  onUpdateMemory,
  onExportBackup,
  onImportBackup,
  onSaveRollbackPoint,
  onRollback,
  hasRollbackPoint,
  onClearAllData,
  onOpenWhatsNew,
  initialTab = 'general',
  isInline = false,
  connections,
  onUpdateConnections,
  notes = [],
  onOpenNotebook,
  selfWidgets = [],
  onUpdateWidgets,
  onOpenWidget,
  notify,
  onBackupToGithub,
  skills = [],
  onUpdateSkills,
  autonomy = 'full',
  onAutonomyChange,
  onSelfRepair,
  onOpenSkill,
  keystoreEphemeral = false,
  usageToday = 0,
}) => {
  const auth = useAuth();
  const [tab, setTab] = useState<SectionId>(() => normalizeTab(initialTab));
  const [navQuery, setNavQuery] = useState('');
  const [mobileNavOpen, setMobileNavOpen] = useState(true);

  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [confirmClearMemory, setConfirmClearMemory] = useState(false);
  const [memorySearchQuery, setMemorySearchQuery] = useState('');
  const [newMemoryFact, setNewMemoryFact] = useState('');
  const [editingFactIndex, setEditingFactIndex] = useState<number | null>(null);
  const [editingFactText, setEditingFactText] = useState('');
  const [memoryError, setMemoryError] = useState<string | null>(null);
  useEffect(() => {
    if (!confirmClearAll) return;
    const t = window.setTimeout(() => setConfirmClearAll(false), 4000);
    return () => window.clearTimeout(t);
  }, [confirmClearAll]);
  useEffect(() => {
    if (!confirmClearMemory) return;
    const t = window.setTimeout(() => setConfirmClearMemory(false), 4000);
    return () => window.clearTimeout(t);
  }, [confirmClearMemory]);

  // ── Notification capability (honest browser probing) ─────────────────────
  const ttsSupported =
    typeof window !== 'undefined' && 'speechSynthesis' in window;
  const notifSupport =
    typeof window !== 'undefined' && 'Notification' in window;
  const [notifPermission, setNotifPermission] = useState<NotificationPermission>(
    () =>
      typeof window !== 'undefined' && 'Notification' in window
        ? Notification.permission
        : 'denied'
  );
  useEffect(() => {
    if (!isOpen && !isInline) return;
    if (notifSupport) setNotifPermission(Notification.permission);
    setMobileNavOpen(true);
    setTab(normalizeTab(initialTab));
    setNavQuery('');
  }, [isOpen, isInline, initialTab, notifSupport]);

  const requestNotifPermission = async () => {
    if (!notifSupport) return;
    try {
      if (Notification.permission === 'denied') {
        notify?.('Notifications blocked — enable them in browser site settings.');
        return;
      }
      const result = await Notification.requestPermission();
      setNotifPermission(result);
      if (result === 'granted') {
        patch({ notifEnabled: true });
        notify?.('Browser notifications enabled.');
      }
    } catch {
      notify?.('Could not request notification permission.');
    }
  };

  const sendTestNotification = () => {
    if (!notifSupport || Notification.permission !== 'granted') {
      notify?.('Allow notification permission first.');
      return;
    }
    try {
      new Notification('SMFTA AI', { body: 'Notifications are working.' });
      if (draft.notifSound) playNotifChime();
    } catch {
      notify?.('Test notification failed.');
    }
  };

  const [draft, setDraft] = useState<AppSettings>(() => sanitizeSettings(settings));
  const [profileName, setProfileName] = useState(profile.name || '');
  const [localProfiles, setLocalProfiles] = useState<SavedProviderProfile[]>(
    () =>
      externalProfiles && externalProfiles.length > 0
        ? externalProfiles
        : getInitialProviderProfiles(settings)
  );

  // New-provider form state (Default Mercury -> mercury-3)
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

  // Account password change

  const initialSnapshotRef = React.useRef<{
    settings: AppSettings;
    profileName: string;
    profiles: SavedProviderProfile[];
  } | null>(null);

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
    initialSnapshotRef.current = {
      settings: cleanSettings,
      profileName: profile.name || 'Boss',
      profiles: initialProfiles.map((p) => ({ ...p })),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, isInline]);

  const filteredSections = useMemo(() => {
    const q = navQuery.trim().toLowerCase();
    if (!q) return SECTION_ORDER;
    return SECTION_ORDER.filter((id) => {
      const meta = SECTION_META[id];
      return (
        meta.label.toLowerCase().includes(q) ||
        meta.keywords.toLowerCase().includes(q) ||
        meta.hint.toLowerCase().includes(q)
      );
    });
  }, [navQuery]);

  if (!isOpen && !isInline) return null;

  const syncProfiles = (nextList: SavedProviderProfile[]) => {
    setLocalProfiles(nextList);
    persistSavedProfiles(nextList);
    onUpdateProfiles?.(nextList);
    if (initialSnapshotRef.current) {
      initialSnapshotRef.current.profiles = nextList.map((p) => ({ ...p }));
    }
  };

  const commit = (nextSettings: AppSettings, nextName: string = profileName) => {
    const clean = sanitizeSettings(nextSettings);
    setDraft(clean);
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
    });
    commit(nextSettings);
    if (initialSnapshotRef.current) {
      initialSnapshotRef.current.settings = nextSettings;
    }
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
        'contextWindow' in changes ||
        'maxOutputTokens' in changes ||
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
      return QUICK_PROVIDER_CHIPS[providerId] || [DEFAULT_PROVIDER_MODELS[providerId]].filter(Boolean);
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
      'gpt-4o-mini'
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
    if (initialSnapshotRef.current) {
      initialSnapshotRef.current.settings = nextSettings;
    }
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
    setNewModel(DEFAULT_PROVIDER_MODELS[newProviderId] || '');
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
          testData?.message || testData?.error ||
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
        ''
      ).trim();
      if (!workingModel) {
        // Never invent a model id: require a discovered or explicitly typed one.
        setNewVerifyResult({
          ok: false,
          message:
            'Model ID required — fetch the model list or type a valid model ID. Provider was NOT added.',
        });
        onProviderTestResult?.({
          ok: false,
          message: 'Model ID required before adding provider',
          testedAt: Date.now(),
          provider: newProviderId,
        });
        return;
      }
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
      if (initialSnapshotRef.current) {
        initialSnapshotRef.current.settings = nextSettings;
      }
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
      setNewModel(DEFAULT_PROVIDER_MODELS[newProviderId] || '');
      setDiscoveredModels([]);
      setDiscoveryWarning(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Network error verifying provider';
      setNewVerifyResult({ ok: false, message: `Verification failed: ${msg}.` });
    } finally {
      setIsVerifyingNew(false);
    }
  };

  const handleAvatarPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!/^image\/(png|jpe?g|webp|gif)$/.test(file.type)) {
      notify?.('Avatar must be a PNG, JPEG, WebP or GIF image.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      notify?.('Avatar image is too large (max 2MB).');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      if (dataUrl.length > 115_000) {
        notify?.('Image is too detailed — pick a smaller one.');
        return;
      }
      patch({ avatarDataUrl: dataUrl });
      notify?.('Avatar updated.');
    };
    reader.readAsDataURL(file);
  };

  const handleDiscardAndClose = () => {
    const snap = initialSnapshotRef.current;
    if (snap) {
      setDraft(snap.settings);
      setProfileName(snap.profileName);
      syncProfiles(snap.profiles);
      onSave({ name: snap.profileName }, snap.settings);
    }
    onClose();
  };

  const handleSaveAndClose = () => {
    commit(draft, profileName);
    initialSnapshotRef.current = {
      settings: sanitizeSettings(draft),
      profileName: profileName.trim() || 'Boss',
      profiles: localProfiles.map((p) => ({ ...p })),
    };
    onClose();
  };

  const handleResetDefaults = () => {
    onResetSettings?.();
    setDraft(sanitizeSettings({}));
    notify?.('Default settings restored.');
  };

  // Offer discovered models or standard popular starter models for Custom API
  const popularStarterModels = getPopularStarterModels(
    newProviderId,
    newBaseUrl,
    newApiKey
  );
  const candidateModelsForNew = Array.from(
    new Set([...discoveredModels, newModel.trim(), ...popularStarterModels].filter(Boolean))
  );
  const detectedProviderFromNewKey = detectProviderFromKey(newApiKey);

  const storedKeyCount =
    (draft.externalKeys ? 1 : 0) +
    localProfiles.filter((p) => Boolean(p.externalKeys)).length;

  const openSection = (id: SectionId) => {
    setTab(id);
    setMobileNavOpen(false);
  };

  const selfCheck = () => {
    const report = runSelfCheck({
      settings: draft,
      memory,
      notes: notes.length,
      widgets: selfWidgets,
      skills,
      driveConnected: Boolean(connections?.drive.connected),
      githubConnected: Boolean(connections?.github.connected),
      autonomy,
    });
    onSelfRepair?.();
    notify?.(`Self-check ${report.score}% complete.`);
  };

  // ── Panel renderers ──────────────────────────────────────────────────────

  const renderGeneral = () => (
    <>
      <Card title="Profile" description="How the workspace addresses you." icon={<User className="w-4 h-4" />}>
        <TextRow
          label="Your name"
          value={profileName}
          placeholder="e.g. Saymon"
          maxLength={80}
          onChange={handleNameChange}
        />
        <TextRow
          label="AI display name"
          description="Name the assistant introduces itself with."
          value={draft.displayName || ''}
          maxLength={80}
          onChange={(v) => patch({ displayName: v })}
        />
        <SelectRow
          label="App language"
          value={draft.appLanguage || 'bn'}
          options={[
            { value: 'bn', label: 'বাংলা' },
            { value: 'en', label: 'English' },
            { value: 'hi', label: 'हिन्दी' },
          ]}
          onChange={(v) => patch({ appLanguage: v as AppSettings['appLanguage'] })}
        />
        <SelectRow
          label="Reply language"
          value={draft.replyLang}
          options={[
            { value: 'auto', label: 'Auto (match my language)' },
            { value: 'bn', label: 'বাংলা' },
            { value: 'en', label: 'English' },
          ]}
          onChange={(v) => patch({ replyLang: v as AppSettings['replyLang'] })}
        />
        <ToggleRow
          label="Enter to send"
          description="Enter sends, Shift+Enter adds a new line."
          checked={Boolean(draft.sendOnEnter)}
          onChange={(v) => patch({ sendOnEnter: v })}
        />
        <ToggleRow
          label="Auto-scroll conversation"
          description="Automatically follow new messages and streaming tokens."
          checked={draft.autoScroll !== false}
          onChange={(v) => patch({ autoScroll: v })}
        />
      </Card>

      <Card title="Response defaults" description="Default reasoning style and conversation behavior." icon={<Sparkles className="w-4 h-4" />}>
        <SegmentedRow
          label="Reasoning depth"
          value={draft.mode}
          options={[
            { value: 'fast', label: 'Fast' },
            { value: 'balanced', label: 'Balanced' },
            { value: 'power', label: 'Power' },
          ]}
          onChange={(v) => patch({ mode: v as AppSettings['mode'] })}
        />
        <SelectRow
          label="Default new chat mode"
          description="Which reasoning mode to use when starting a new conversation."
          value={draft.newChatDefaultMode || 'last'}
          options={[
            { value: 'last', label: 'Keep last selected mode' },
            { value: 'fast', label: 'Always start in Fast mode' },
            { value: 'balanced', label: 'Always start in Balanced mode' },
            { value: 'power', label: 'Always start in High-Quality mode' },
          ]}
          onChange={(v) => patch({ newChatDefaultMode: v as AppSettings['newChatDefaultMode'] })}
        />
        <SegmentedRow
          label="Response detail"
          value={draft.style}
          options={[
            { value: 'concise', label: 'Concise' },
            { value: 'detailed', label: 'Detailed' },
          ]}
          onChange={(v) => patch({ style: v as AppSettings['style'] })}
        />
        <SegmentedRow
          label="Chat density"
          description="Compact or comfortable spacing across conversations."
          value={draft.density || 'cozy'}
          options={[
            { value: 'compact', label: 'Compact' },
            { value: 'cozy', label: 'Comfortable' },
            { value: 'spacious', label: 'Spacious' },
          ]}
          onChange={(v) => patch({ density: v as AppSettings['density'] })}
        />
        <SelectRow
          label="Work persona"
          value={draft.workPersona || 'allrounder'}
          options={[
            { value: 'allrounder', label: 'All-rounder' },
            { value: 'office', label: 'Office' },
            { value: 'developer', label: 'Developer' },
            { value: 'content', label: 'Content creator' },
            { value: 'academic', label: 'Academic' },
          ]}
          onChange={(v) => patch({ workPersona: v as AppSettings['workPersona'] })}
        />
      </Card>

      <Card title="Voice" description="Spoken replies and read-aloud behavior." icon={<Bell className="w-4 h-4" />}>
        {!ttsSupported && (
          <p className="cs-callout warn">Speech synthesis is not available in this browser.</p>
        )}
        <ToggleRow
          label="Auto-read replies aloud"
          checked={Boolean(draft.autoVoice)}
          disabled={!ttsSupported}
          onChange={(v) => patch({ autoVoice: v })}
        />
        <SelectRow
          label="Voice language"
          value={draft.vlang}
          options={[
            { value: 'bn-BD', label: 'বাংলা (Bangladesh)' },
            { value: 'en-US', label: 'English (US)' },
            { value: 'hi-IN', label: 'हिन्दी (India)' },
          ]}
          onChange={(v) => patch({ vlang: v as AppSettings['vlang'] })}
        />
        <SliderRow
          label="Speech speed"
          value={draft.voiceSpeed ?? 1}
          min={0.5}
          max={2}
          step={0.1}
          format={(v) => `${v.toFixed(1)}×`}
          onChange={(v) => patch({ voiceSpeed: v })}
        />
      </Card>
    </>
  );

  const renderAppearance = () => (
    <>
      <Card title="Theme" description="Light, dark or follow the system preference." icon={<Palette className="w-4 h-4" />}>
        <SegmentedRow
          label="Theme mode"
          value={draft.themeMode || 'system'}
          options={[
            { value: 'system', label: 'System' },
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
          ]}
          onChange={(v) => {
            const mode = v as 'system' | 'light' | 'dark';
            patch({
              themeMode: mode,
              theme: mode === 'system' ? draft.theme : mode,
            });
          }}
        />
      </Card>

      <Card title="Accent color" description="Used across buttons, links and highlights.">
        <div className="cs-accent-grid">
          {[
            { id: 'indigo', color: '#6366f1' },
            { id: 'emerald', color: '#10b981' },
            { id: 'sky', color: '#0ea5e9' },
            { id: 'rose', color: '#f43f5e' },
            { id: 'amber', color: '#f59e0b' },
            { id: 'teal', color: '#14b8a6' },
          ].map((a) => (
            <button
              key={a.id}
              type="button"
              className={`cs-accent-dot ${draft.accent === a.id ? 'active' : ''}`}
              style={{ background: a.color }}
              title={a.id}
              onClick={() => patch({ accent: a.id as AppSettings['accent'] })}
            >
              {draft.accent === a.id && <CheckCircle2 className="w-3.5 h-3.5" />}
            </button>
          ))}
        </div>
        <TextRow
          label="Custom accent hex"
          description="Used when accent is set to custom."
          value={draft.accent === 'custom' ? draft.accentCustom || '' : ''}
          placeholder="#6366f1"
          mono
          maxLength={7}
          onChange={(v) => patch({ accent: 'custom', accentCustom: v })}
        />
        <ToggleRow
          label="Monochrome accent"
          description="Use a neutral grayscale accent."
          checked={Boolean(draft.mono)}
          onChange={(v) => patch({ mono: v })}
        />
      </Card>

      <Card title="Typography & layout" description="Text size, code formatting, message spacing and layout width.">
        <SelectRow
          label="Font family"
          value={draft.fontFamily || 'geist'}
          options={[
            { value: 'geist', label: 'Geist (default)' },
            { value: 'inter', label: 'Inter' },
            { value: 'system', label: 'System UI' },
            { value: 'mono', label: 'Monospace' },
          ]}
          onChange={(v) => patch({ fontFamily: v as AppSettings['fontFamily'] })}
        />
        <SegmentedRow
          label="Font size"
          value={draft.fontsize}
          options={[
            { value: 'small', label: 'Small' },
            { value: 'normal', label: 'Normal' },
            { value: 'large', label: 'Large' },
          ]}
          onChange={(v) => patch({ fontsize: v as AppSettings['fontsize'] })}
        />
        <SegmentedRow
          label="Code font size"
          description="Font size inside chat code blocks and the Code Workspace."
          value={draft.codeFontSize || 'normal'}
          options={[
            { value: 'small', label: 'Small' },
            { value: 'normal', label: 'Normal' },
            { value: 'large', label: 'Large' },
          ]}
          onChange={(v) => patch({ codeFontSize: v as AppSettings['codeFontSize'] })}
        />
        <SelectRow
          label="Code block appearance"
          value={draft.codeBlockTheme || 'dark'}
          options={[
            { value: 'dark', label: 'Dark studio (default)' },
            { value: 'high-contrast', label: 'High contrast terminal' },
            { value: 'minimal', label: 'Minimal bordered' },
          ]}
          onChange={(v) => patch({ codeBlockTheme: v as AppSettings['codeBlockTheme'] })}
        />
        <SegmentedRow
          label="Chat message spacing"
          value={draft.messageSpacing || 'normal'}
          options={[
            { value: 'compact', label: 'Compact' },
            { value: 'normal', label: 'Normal' },
            { value: 'relaxed', label: 'Relaxed' },
          ]}
          onChange={(v) => patch({ messageSpacing: v as AppSettings['messageSpacing'] })}
        />
        <SegmentedRow
          label="Desktop & mobile layout width"
          value={draft.layoutWidth || 'standard'}
          options={[
            { value: 'standard', label: 'Standard' },
            { value: 'wide', label: 'Wide' },
            { value: 'full', label: 'Full width' },
          ]}
          onChange={(v) => patch({ layoutWidth: v as AppSettings['layoutWidth'] })}
        />
        <SelectRow
          label="Chat bubble style"
          value={draft.bubbleStyle || 'rounded'}
          options={[
            { value: 'rounded', label: 'Rounded' },
            { value: 'sharp', label: 'Sharp' },
            { value: 'minimal', label: 'Minimal' },
          ]}
          onChange={(v) => patch({ bubbleStyle: v as AppSettings['bubbleStyle'] })}
        />
        <SegmentedRow
          label="Corner radius"
          value={draft.radius || 'soft'}
          options={[
            { value: 'sharp', label: 'Sharp' },
            { value: 'soft', label: 'Soft' },
            { value: 'round', label: 'Round' },
          ]}
          onChange={(v) => patch({ radius: v as AppSettings['radius'] })}
        />
        <SegmentedRow
          label="Density"
          value={draft.density || 'cozy'}
          options={[
            { value: 'compact', label: 'Compact' },
            { value: 'cozy', label: 'Cozy' },
            { value: 'spacious', label: 'Spacious' },
          ]}
          onChange={(v) => patch({ density: v as AppSettings['density'] })}
        />
        <ToggleRow
          label="Reduce motion"
          description="Minimize animations and transitions."
          checked={Boolean(draft.reducedMotion)}
          onChange={(v) => patch({ reducedMotion: v })}
        />
      </Card>

      <Card title="Advanced styling" description="Custom CSS is applied to the whole workspace.">
        <div className="cs-row cs-row-column">
          <div className="cs-row-info">
            <span className="cs-label">Custom CSS</span>
            <span className="cs-desc">Leave empty unless you know CSS.</span>
          </div>
          <textarea
            className="cs-input cs-textarea font-mono"
            rows={4}
            value={draft.customCss || ''}
            maxLength={20000}
            placeholder=":root { --accent: #10a37f; }"
            onChange={(e) => patch({ customCss: e.target.value })}
          />
        </div>
      </Card>
    </>
  );

  const selectProviderOption = (pid: ExternalProviderId) => {
    setNewProviderId(pid);
    setNewBaseUrl(DEFAULT_PROVIDER_BASE_URLS[pid] || '');
    setNewModel(
      pid === 'mercury' || pid === 'inceptionlabs'
        ? 'mercury-3'
        : DEFAULT_PROVIDER_MODELS[pid] || ''
    );
    setDiscoveredModels([]);
    setNewVerifyResult(null);
    setDiscoveryWarning(null);
  };

  const renderProviders = () => (
    <>
      <Card
        title="AI Provider Configuration"
        description="Select a provider, model, and API key."
        icon={<Zap className="w-4 h-4" />}
      >
        <div className="cs-callout">
          <strong>{activeProfile?.name || 'Default'}</strong>
          <span>
            {providerEntry(activeProfile?.provider || 'xrahat')?.label || activeProfile?.provider} ·{' '}
            {isBuiltinProviderId(activeProfile?.provider)
              ? builtinTierLabel(activeProfile?.externalModel, draft.mode)
              : activeProfile?.externalModel || activeProfileModels[0] || DEFAULT_PROVIDER_MODELS[activeProfile?.provider || ''] || 'Auto'}
          </span>
        </div>

        <div className="cs-form-grid !mt-3">
          {/* 1. Provider Selector (Mercury, Gemini, OpenAI, Anthropic, Custom) */}
          <div className="cs-row cs-row-column">
            <div className="cs-row-info">
              <span className="cs-label">Provider</span>
            </div>
            <div className="flex flex-wrap gap-1.5 mb-2" data-testid="provider-quick-selector">
              {PRIMARY_PROVIDER_OPTIONS.map((opt) => {
                const isSelected =
                  newProviderId === opt.id ||
                  (opt.id === 'mercury' && newProviderId === 'inceptionlabs');
                return (
                  <button
                    key={opt.id}
                    type="button"
                    data-testid={`provider-pill-${opt.id}`}
                    onClick={() => selectProviderOption(opt.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                      isSelected
                        ? 'bg-indigo-600 text-white border-indigo-500 shadow-sm'
                        : 'bg-[var(--bg-2)] text-[var(--text-2)] border-[var(--border)] hover:border-indigo-500/40'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
            <select
              className="cs-select"
              data-testid="provider-gateway-select"
              value={newProviderId}
              onChange={(e) => selectProviderOption(e.target.value as ExternalProviderId)}
            >
              {(['popular', 'builtin', 'custom', 'local'] as ProviderGroup[]).map((g) => (
                <optgroup key={g} label={PROVIDER_GROUP_LABELS[g]}>
                  {PROVIDER_CATALOG.filter((c) => c.group === g).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          {/* 2. Model Name Input / Dropdown (Default Mercury to "mercury-3") */}
          <div className="cs-row cs-row-column">
            <div className="cs-row-info">
              <span className="cs-label">Model</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2 w-full">
              <select
                className="cs-select !w-full"
                data-testid="new-provider-model-select"
                value={candidateModelsForNew.includes(newModel) ? newModel : candidateModelsForNew[0] || ''}
                onChange={(e) => setNewModel(e.target.value)}
              >
                {candidateModelsForNew.length === 0 && (
                  <option value="" disabled>
                    Select or enter model
                  </option>
                )}
                {Array.from(new Set([newModel, ...candidateModelsForNew].filter(Boolean))).map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              <input
                type="text"
                data-testid="new-provider-model-input"
                className="cs-input font-mono !w-full"
                value={newModel}
                placeholder={
                  newProviderId === 'mercury' || newProviderId === 'inceptionlabs'
                    ? 'mercury-3'
                    : 'Model ID'
                }
                onChange={(e) => setNewModel(e.target.value)}
              />
              <button
                type="button"
                className="btn btn-secondary !px-2.5"
                title="Fetch models"
                disabled={isLoadingModels}
                onClick={() => handleFetchNewModels()}
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingModels ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* 3. API Key field (with Show/Hide toggle) */}
          {!isBuiltinProviderId(newProviderId) && (
            <div className="cs-row cs-row-column">
              <div className="cs-row-info">
                <span className="cs-label">API Key</span>
              </div>
              <div className="cs-key-input">
                <input
                  type={showNewKey ? 'text' : 'password'}
                  data-testid="new-provider-api-key-input"
                  className="cs-input font-mono"
                  value={newApiKey}
                  placeholder={providerEntry(newProviderId)?.keyHint || 'sk-...'}
                  onChange={(e) => {
                    const val = e.target.value;
                    setNewApiKey(val);
                    setNewVerifyResult(null);
                    const detected = detectProviderFromKey(val);
                    if (newProviderId === 'custom') {
                      if (!newBaseUrl.trim()) {
                        if (detected && DEFAULT_PROVIDER_BASE_URLS[detected]) {
                          setNewBaseUrl(DEFAULT_PROVIDER_BASE_URLS[detected]);
                          if (!newModel || newModel === 'gpt-4o-mini') {
                            setNewModel(DEFAULT_PROVIDER_MODELS[detected] || 'gpt-4o-mini');
                          }
                        } else if (val.trim().startsWith('sk-')) {
                          setNewBaseUrl(DEFAULT_PROVIDER_BASE_URLS.openai || 'https://api.openai.com/v1');
                        }
                      }
                    } else if (
                      detected &&
                      detected !== newProviderId &&
                      newProviderId !== 'mercury' &&
                      newProviderId !== 'inceptionlabs' &&
                      newProviderId !== 'ollama' &&
                      newProviderId !== 'lmstudio'
                    ) {
                      setNewProviderId(detected);
                      setNewBaseUrl(DEFAULT_PROVIDER_BASE_URLS[detected] || '');
                      setNewModel(DEFAULT_PROVIDER_MODELS[detected] || '');
                    }
                  }}
                />
                <button
                  type="button"
                  data-testid="toggle-new-api-key-visibility"
                  className="btn btn-secondary !px-2.5 flex items-center gap-1"
                  aria-label={showNewKey ? 'Hide API key' : 'Show API key'}
                  onClick={() => setShowNewKey((v) => !v)}
                >
                  {showNewKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  <span className="text-[11px]">{showNewKey ? 'Hide' : 'Show'}</span>
                </button>
              </div>
            </div>
          )}

          {/* 4. Optional "Advanced Options" Accordion (closed by default) */}
          <div className="border border-[var(--border)] rounded-xl overflow-hidden bg-[var(--bg-2)]/40">
            <button
              type="button"
              data-testid="advanced-options-toggle"
              aria-expanded={showAdvancedOptions}
              onClick={() => setShowAdvancedOptions((prev) => !prev)}
              className="w-full flex items-center justify-between px-3.5 py-2.5 text-xs font-medium text-[var(--text-2)] hover:text-[var(--text-1)] transition-colors"
            >
              <span className="flex items-center gap-2">
                <SlidersHorizontal className="w-3.5 h-3.5 opacity-75" />
                <span>Advanced Options</span>
              </span>
              {showAdvancedOptions ? (
                <ChevronDown className="w-4 h-4 opacity-70" />
              ) : (
                <ChevronRight className="w-4 h-4 opacity-70" />
              )}
            </button>

            {showAdvancedOptions && (
              <div
                data-testid="advanced-options-content"
                className="px-3.5 pb-3.5 pt-2 border-t border-[var(--border)] space-y-3"
              >
                <TextRow
                  label="Base URL"
                  mono
                  value={newBaseUrl}
                  placeholder={
                    DEFAULT_PROVIDER_BASE_URLS[newProviderId] ||
                    'https://api.inceptionlabs.ai/v1/chat/completions'
                  }
                  onChange={(v) => {
                    setNewBaseUrl(v);
                    setNewVerifyResult(null);
                    if (newProviderId === 'custom' && (!newModel || newModel === 'gpt-4o-mini')) {
                      const u = v.toLowerCase();
                      if (u.includes('codecraft')) setNewModel('gemini-3.7-flash');
                      else if (u.includes('inceptionlabs') || u.includes('mercury')) setNewModel('mercury-3');
                      else if (u.includes('generativelanguage.googleapis.com')) setNewModel('gemini-2.5-flash');
                      else if (u.includes('groq.com')) setNewModel('llama-3.3-70b-versatile');
                      else if (u.includes('deepseek.com')) setNewModel('deepseek-chat');
                      else if (u.includes('anthropic.com')) setNewModel('claude-sonnet-4-20250514');
                      else if (u.includes('openrouter.ai')) setNewModel('google/gemini-2.5-flash');
                    }
                  }}
                />
                <div className="cs-row cs-row-column">
                  <div className="cs-row-info">
                    <span className="cs-label">Extra Headers (Optional)</span>
                  </div>
                  <textarea
                    rows={2}
                    data-testid="new-provider-extra-headers"
                    className="cs-textarea font-mono text-xs"
                    value={newCustomHeaders}
                    placeholder={'{"X-Custom-Header": "value"}'}
                    onChange={(e) => setNewCustomHeaders(e.target.value)}
                  />
                </div>
                <TextRow
                  label="Profile Name (Optional)"
                  value={newPropName}
                  placeholder={`e.g. ${providerEntry(newProviderId)?.short || 'Mercury'}`}
                  onChange={setNewPropName}
                />
                <ToggleRow
                  label="Keyless fallback"
                  description="Fallback to built-in engine if custom provider is unreachable."
                  checked={Boolean(draft.allowKeylessFallback)}
                  onChange={(v) => patch({ allowKeylessFallback: v })}
                />
              </div>
            )}
          </div>

          {discoveryWarning && <p className="cs-callout warn !text-xs">{discoveryWarning}</p>}
          {newVerifyResult && (
            <div className={`cs-callout ${newVerifyResult.ok ? 'success' : 'warn'}`}>
              <div className="flex items-start gap-2 w-full">
                {newVerifyResult.ok ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-xs">{newVerifyResult.message}</p>
                </div>
              </div>
            </div>
          )}

          <div className="cs-form-actions">
            <button
              type="button"
              className="btn btn-secondary flex items-center gap-1.5"
              disabled={isVerifyingNew}
              onClick={handleSaveWithoutVerification}
            >
              <Save className="w-4 h-4 text-emerald-500" /> Save &amp; Activate
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={isVerifyingNew}
              onClick={handleVerifyAndAddProvider}
            >
              {isVerifyingNew ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Verifying…
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4" /> Verify &amp; Connect
                </>
              )}
            </button>
          </div>
        </div>
      </Card>

      <Card
        title={`Saved Profiles (${localProfiles.length})`}
        description="Switch or manage saved provider configurations."
        icon={<Server className="w-4 h-4" />}
      >
        <div className="cs-provider-list">
          {localProfiles.map((prof) => {
            const isCurrent = activeProfile?.id === prof.id;
            const pModels = getModelsForProfile(prof);
            const uiStatus = describeProviderStatus(prof);
            const isEnabled = prof.enabled !== false;
            const isAdvOpen = Boolean(profileAdvancedOpen[prof.id]);
            return (
              <div key={prof.id} className={`cs-provider ${isCurrent ? 'active' : ''} ${!isEnabled ? 'opacity-65' : ''}`}>
                <div className="cs-provider-head">
                  <div className="cs-provider-title">
                    <span
                      className={`cs-status-dot ${uiStatus.toLowerCase().replace(/\s+/g, '-')}`}
                    />
                    <span className="truncate">{prof.name}</span>
                    <span className="cs-provider-tag">
                      {providerEntry(prof.provider)?.short || prof.provider}
                    </span>
                    <span className={`cs-pill ${uiStatus.toLowerCase().replace(/\s+/g, '-')}`}>
                      {uiStatus}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <label
                      className="toggle-switch"
                      title={isEnabled ? 'Disable profile' : 'Enable profile'}
                    >
                      <input
                        type="checkbox"
                        aria-label={`Enable ${prof.name}`}
                        checked={isEnabled}
                        onChange={(e) =>
                          updateSavedProfileField(prof.id, { enabled: e.target.checked })
                        }
                      />
                      <span className="slider" />
                    </label>
                    {isCurrent ? (
                      <span className="cs-active-badge">Active</span>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-primary !py-1 !px-2.5 !text-[11px]"
                        disabled={!isEnabled}
                        onClick={() => activateSavedProfile(prof)}
                      >
                        Connect
                      </button>
                    )}
                  </div>
                </div>

                {prof.externalKeys && (
                  <div className="cs-provider-meta">
                    <span className="cs-key-chip">
                      {revealedKeyIds[prof.id] ? prof.externalKeys : maskKey(prof.externalKeys)}
                    </span>
                  </div>
                )}

                {(uiStatus === 'Failed' ||
                  prof.verificationStatus === 'failed' ||
                  prof.verificationStatus === 'degraded') &&
                  prof.statusMessage && (
                    <div
                      data-testid="provider-error-banner"
                      className="cs-callout warn !mt-2 !py-2 !px-3 text-xs leading-relaxed whitespace-pre-wrap break-words"
                    >
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-500" />
                        <div className="flex-1 min-w-0">
                          <div>{prof.statusMessage}</div>
                        </div>
                      </div>
                    </div>
                  )}

                {editingProfileId === prof.id && (
                  <div className="cs-edit-drawer">
                    <TextRow
                      label="Display name"
                      value={prof.name}
                      onChange={(v) => updateSavedProfileField(prof.id, { name: v })}
                    />
                    <div className="cs-row cs-row-column">
                      <div className="cs-row-info">
                        <span className="cs-label">API Key</span>
                      </div>
                      <div className="cs-key-input">
                        <input
                          type={revealedKeyIds[prof.id] ? 'text' : 'password'}
                          value={prof.externalKeys || ''}
                          placeholder="Paste API key…"
                          className="cs-input font-mono"
                          onChange={(e) =>
                            updateSavedProfileField(prof.id, { externalKeys: e.target.value })
                          }
                        />
                        <button
                          type="button"
                          className="btn btn-secondary !px-2"
                          onClick={() =>
                            setRevealedKeyIds((prev) => ({ ...prev, [prof.id]: !prev[prof.id] }))
                          }
                        >
                          {revealedKeyIds[prof.id] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>

                    <div className="border border-[var(--border)] rounded-lg overflow-hidden mt-2">
                      <button
                        type="button"
                        onClick={() =>
                          setProfileAdvancedOpen((prev) => ({ ...prev, [prof.id]: !prev[prof.id] }))
                        }
                        className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-[var(--text-2)]"
                      >
                        <span>Advanced Options</span>
                        {isAdvOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                      </button>
                      {isAdvOpen && (
                        <div className="p-3 border-t border-[var(--border)] space-y-2.5">
                          <TextRow
                            label="Base URL"
                            value={prof.externalBaseUrl || ''}
                            mono
                            placeholder={DEFAULT_PROVIDER_BASE_URLS[prof.provider] || 'https://api.inceptionlabs.ai/v1'}
                            onChange={(v) => updateSavedProfileField(prof.id, { externalBaseUrl: v })}
                          />
                          <TextRow
                            label="Extra Headers"
                            value={prof.customHeaders || ''}
                            mono
                            placeholder={'{"X-Header": "value"}'}
                            onChange={(v) => updateSavedProfileField(prof.id, { customHeaders: v })}
                          />
                          <SliderRow
                            label="Context window (tokens)"
                            value={prof.contextWindow ?? 32768}
                            min={2048}
                            max={128000}
                            step={2048}
                            onChange={(v) => updateSavedProfileField(prof.id, { contextWindow: v })}
                          />
                          <SliderRow
                            label="Maximum response tokens"
                            value={prof.maxOutputTokens ?? 4096}
                            min={64}
                            max={32768}
                            step={64}
                            onChange={(v) => updateSavedProfileField(prof.id, { maxOutputTokens: v })}
                          />
                          <ToggleRow
                            label="SSE streaming support"
                            checked={prof.supportsStreaming !== false}
                            onChange={(v) => updateSavedProfileField(prof.id, { supportsStreaming: v })}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div className="cs-provider-controls">
                  <select
                    className="cs-select !py-1 !text-[11px]"
                    value={pModels.includes(prof.externalModel || '') ? prof.externalModel : pModels[0] || ''}
                    onChange={(e) =>
                      updateSavedProfileField(prof.id, { externalModel: e.target.value })
                    }
                  >
                    {pModels.length === 0 && (
                      <option value="" disabled>
                        Select model
                      </option>
                    )}
                    {Array.from(new Set([prof.externalModel, ...pModels].filter(Boolean) as string[])).map(
                      (m) => (
                        <option key={m} value={m}>
                          {isBuiltinProviderId(prof.provider)
                            ? BUILTIN_TIERS.find((t) => t.model === m)?.label || m
                            : m}
                        </option>
                      )
                    )}
                  </select>
                  <input
                    type="text"
                    className="cs-input !py-1 !text-[11px] w-28 sm:w-36"
                    value={prof.externalModel || ''}
                    placeholder="Model ID"
                    onChange={(e) =>
                      updateSavedProfileField(prof.id, { externalModel: e.target.value })
                    }
                  />
                  <button
                    type="button"
                    className="btn btn-secondary !py-1 !px-2 !text-[11px]"
                    title="Refresh models"
                    disabled={loadingModelsForId === prof.id}
                    onClick={() => handleRefreshProfileModels(prof)}
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loadingModelsForId === prof.id ? 'animate-spin' : ''}`} />
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary !py-1 !px-2 !text-[11px]"
                    title="Test connection"
                    disabled={testingProfileId === prof.id}
                    onClick={() => handleTestExistingProfile(prof)}
                  >
                    {testingProfileId === prof.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Zap className="w-3.5 h-3.5" />
                    )}
                    <span>Test</span>
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary !py-1 !px-2 !text-[11px]"
                    onClick={() =>
                      setEditingProfileId((cur) => (cur === prof.id ? null : prof.id))
                    }
                  >
                    {editingProfileId === prof.id ? 'Done' : 'Edit'}
                  </button>
                  {localProfiles.length > 1 && (
                    <button
                      type="button"
                      className="btn btn-secondary !py-1 !px-2 !text-[11px] !text-rose-500"
                      title="Delete provider"
                      onClick={() => deleteSavedProfile(prof.id)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card
        title="Model parameters"
        description="Sampling controls sent with every request to the selected model."
        icon={<SlidersHorizontal className="w-4 h-4" />}
      >
        <SegmentedRow
          label="Creativity"
          value={draft.creativity}
          options={[
            { value: 'precise', label: 'Precise' },
            { value: 'balanced', label: 'Balanced' },
            { value: 'creative', label: 'Creative' },
          ]}
          onChange={(v) => patch({ creativity: v as AppSettings['creativity'] })}
        />
        <SegmentedRow
          label="Thinking Mode & Reasoning Effort"
          description="Controls how deeply the model analyzes and plans before answering."
          value={draft.thinkingMode || 'medium'}
          options={[
            { value: 'off', label: 'Off' },
            { value: 'low', label: 'Low' },
            { value: 'medium', label: 'Medium' },
            { value: 'high', label: 'High' },
          ]}
          onChange={(v) => patch({ thinkingMode: v as AppSettings['thinkingMode'] })}
        />
        <SliderRow
          label="Temperature"
          value={draft.weightTemp ?? 0.7}
          min={0.1}
          max={1.2}
          step={0.05}
          format={(v) => v.toFixed(2)}
          onChange={(v) => patch({ weightTemp: v })}
        />
        <SliderRow
          label="Top P"
          value={draft.topP ?? 0.9}
          min={0.1}
          max={1}
          step={0.05}
          format={(v) => v.toFixed(2)}
          onChange={(v) => patch({ topP: v })}
        />
        <SliderRow
          label="Max output tokens"
          value={draft.maxOutputTokens ?? 1024}
          min={256}
          max={32768}
          step={256}
          onChange={(v) => patch({ maxOutputTokens: v })}
        />
        <div className="cs-row cs-row-column">
          <div className="cs-row-info">
            <span className="cs-label">Training / context notes</span>
            <span className="cs-desc">Extra guidance the model should always consider.</span>
          </div>
          <textarea
            className="cs-input cs-textarea"
            rows={3}
            value={draft.trainingData || ''}
            maxLength={4000}
            onChange={(e) => patch({ trainingData: e.target.value })}
          />
        </div>
      </Card>
    </>
  );

  const renderChat = () => (
    <>
      <Card title="History & saving" description="How conversations are stored and recalled." icon={<MessageSquare className="w-4 h-4" />}>
        <ToggleRow
          label="Auto-save conversations"
          description="Persist chats locally and to your cloud account."
          checked={draft.autoSaveChat !== false}
          onChange={(v) => patch({ autoSaveChat: v })}
        />
        <ToggleRow
          label="Include chat history"
          description="Send recent messages as context with each request."
          checked={draft.includeHistory !== false}
          onChange={(v) => patch({ includeHistory: v })}
        />
        <SliderRow
          label="History messages"
          value={draft.maxHistoryMessages ?? 18}
          min={1}
          max={40}
          step={1}
          onChange={(v) => patch({ maxHistoryMessages: v })}
        />
      </Card>

      <Card title="Streaming & rendering" description="How replies appear and are formatted.">
        <ToggleRow
          label="Typewriter streaming"
          description="Reveal tokens smoothly instead of instant render."
          checked={draft.streamingReveal !== false}
          onChange={(v) => patch({ streamingReveal: v })}
        />
        <ToggleRow
          label="Markdown rendering"
          checked={draft.markdownRender !== false}
          onChange={(v) => patch({ markdownRender: v })}
        />
        <ToggleRow
          label="Code highlighting"
          checked={draft.codeHighlight !== false}
          onChange={(v) => patch({ codeHighlight: v })}
        />
        <ToggleRow
          label="Auto-scroll"
          description="Follow the stream as new tokens arrive."
          checked={draft.autoScroll !== false}
          onChange={(v) => patch({ autoScroll: v })}
        />
        <ToggleRow
          label="Show timestamps"
          checked={draft.showTimestamps !== false}
          onChange={(v) => patch({ showTimestamps: v })}
        />
        <ToggleRow
          label="Show token usage & latency"
          checked={Boolean(draft.showTokenUsage)}
          onChange={(v) => patch({ showTokenUsage: v })}
        />
      </Card>

      <Card title="Input & uploads" description="Composer defaults and attachment limits.">
        <ToggleRow
          label="Web search by default"
          description="Ground answers with live web results when the engine supports it."
          checked={Boolean(draft.webSearchDefault)}
          onChange={(v) => patch({ webSearchDefault: v })}
        />
        <SliderRow
          label="Max upload size"
          description="Per-file ceiling for attachments."
          value={draft.maxUploadMb ?? 10}
          min={1}
          max={25}
          step={1}
          format={(v) => `${v} MB`}
          onChange={(v) => patch({ maxUploadMb: v })}
        />
        <ToggleRow
          label="Smart formatting"
          description="Automatic cleanup and formatting of replies."
          checked={draft.smartFormatting !== false}
          onChange={(v) => patch({ smartFormatting: v })}
        />
      </Card>

      <Card title="Notifications" description="Browser alerts when tasks finish or fail." icon={<Bell className="w-4 h-4" />}>
        {!notifSupport && (
          <p className="cs-callout warn">This browser does not support notifications.</p>
        )}
        <div className="cs-row">
          <div className="cs-row-info">
            <span className="cs-label">Permission</span>
            <span className="cs-desc">Status: {notifSupport ? notifPermission : 'unsupported'}</span>
          </div>
          <button
            type="button"
            className="btn btn-secondary !py-1.5 !px-3 !text-[12px]"
            disabled={!notifSupport}
            onClick={requestNotifPermission}
          >
            Enable
          </button>
        </div>
        <ToggleRow
          label="Enable notifications"
          checked={Boolean(draft.notifEnabled)}
          disabled={!notifSupport}
          onChange={(v) => patch({ notifEnabled: v })}
        />
        <ToggleRow label="Task completed" checked={draft.notifTaskDone !== false} onChange={(v) => patch({ notifTaskDone: v })} />
        <ToggleRow label="Errors & failures" checked={draft.notifErrors !== false} onChange={(v) => patch({ notifErrors: v })} />
        <ToggleRow label="Usage limit reached" checked={draft.notifUsageLimit !== false} onChange={(v) => patch({ notifUsageLimit: v })} />
        <ToggleRow label="Play sound" checked={Boolean(draft.notifSound)} onChange={(v) => patch({ notifSound: v })} />
        <div className="cs-form-actions">
          <button type="button" className="btn btn-secondary" onClick={sendTestNotification}>
            Send test notification
          </button>
        </div>
      </Card>
    </>
  );

  const renderPrivacy = () => (
    <>
      <Card title="Memory bank" description="Facts the assistant remembers across conversations." icon={<Sparkles className="w-4 h-4" />}>
        <ToggleRow
          label="Auto-learn memory"
          description="Save useful facts from conversations automatically."
          checked={draft.autoMemory !== false}
          onChange={(v) => patch({ autoMemory: v })}
        />

        <div className="flex flex-col gap-2 pt-2 border-t border-slate-200/60 dark:border-slate-700/60">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Saved Facts ({memory.length})
            </span>
            <span className="text-[11px] text-slate-400">
              Synced privately to your account
            </span>
          </div>

          {/* Add Manual Fact Input */}
          <div className="flex items-center gap-1.5 mt-1">
            <input
              type="text"
              placeholder="Add a new memory fact (e.g., 'পেশা: ওয়েব ডেভেলপার')..."
              className="cs-input !text-xs !py-1.5 flex-1"
              value={newMemoryFact}
              onChange={(e) => {
                setNewMemoryFact(e.target.value);
                setMemoryError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (!onUpdateMemory) return;
                  const res = addManualMemoryFact(memory, newMemoryFact);
                  if (res.error) {
                    setMemoryError(res.error);
                  } else {
                    onUpdateMemory(res.updated);
                    setNewMemoryFact('');
                    notify?.('Memory fact added.');
                  }
                }
              }}
            />
            <button
              type="button"
              className="btn btn-primary !py-1.5 !px-3 !text-xs shrink-0 flex items-center gap-1"
              disabled={!newMemoryFact.trim()}
              onClick={() => {
                if (!onUpdateMemory) return;
                const res = addManualMemoryFact(memory, newMemoryFact);
                if (res.error) {
                  setMemoryError(res.error);
                } else {
                  onUpdateMemory(res.updated);
                  setNewMemoryFact('');
                  notify?.('Memory fact added.');
                }
              }}
            >
              <Plus className="w-3.5 h-3.5" /> Add
            </button>
          </div>
          {memoryError && (
            <p className="text-[11px] text-rose-500 font-medium">{memoryError}</p>
          )}

          {/* Search memory input */}
          {memory.length > 3 && (
            <div className="relative mt-1">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder="Search saved facts..."
                value={memorySearchQuery}
                onChange={(e) => setMemorySearchQuery(e.target.value)}
                className="cs-input !text-xs !py-1 !pl-8"
              />
            </div>
          )}

          {/* Memory List with Edit, Pin, Delete */}
          {memory.length === 0 ? (
            <p className="text-xs text-slate-400 py-2">
              Memory is currently empty. Facts learned during chats or added above will appear here.
            </p>
          ) : (
            <div className="flex flex-col gap-1.5 max-h-60 overflow-y-auto pr-1 mt-1">
              {searchMemoryFacts(memory, memorySearchQuery).map((fact, index) => {
                const isPinned = fact.startsWith('📌 ');
                const isEditing = editingFactIndex === index;
                const displayText = isPinned ? fact.slice(3) : fact;

                return (
                  <div
                    key={`${fact}-${index}`}
                    className={`flex items-center justify-between gap-2 p-2 rounded-lg border text-xs transition-colors ${
                      isPinned
                        ? 'bg-amber-50/60 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800/40 text-slate-800 dark:text-slate-200'
                        : 'bg-slate-50/80 dark:bg-slate-800/40 border-slate-200/80 dark:border-slate-700/60 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {isEditing ? (
                      <div className="flex items-center gap-1.5 flex-1">
                        <input
                          type="text"
                          value={editingFactText}
                          onChange={(e) => setEditingFactText(e.target.value)}
                          className="cs-input !text-xs !py-1 flex-1 font-sans"
                          autoFocus
                        />
                        <button
                          type="button"
                          className="p-1 text-emerald-600 hover:text-emerald-700"
                          title="Save"
                          onClick={() => {
                            if (!onUpdateMemory) return;
                            const res = updateMemoryFact(
                              memory,
                              fact,
                              isPinned ? `📌 ${editingFactText.trim()}` : editingFactText.trim()
                            );
                            if (res.error) {
                              setMemoryError(res.error);
                            } else {
                              onUpdateMemory(res.updated);
                              setEditingFactIndex(null);
                              setEditingFactText('');
                            }
                          }}
                        >
                          <Save className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          className="p-1 text-slate-400 hover:text-slate-600"
                          title="Cancel"
                          onClick={() => {
                            setEditingFactIndex(null);
                            setEditingFactText('');
                          }}
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-1.5 min-w-0 flex-1">
                          {isPinned && (
                            <span className="text-amber-500 font-bold shrink-0 text-[11px]" title="Pinned">
                              📌
                            </span>
                          )}
                          <span className="truncate">{displayText}</span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            className="p-1 text-slate-400 hover:text-amber-500 rounded"
                            title={isPinned ? 'Unpin fact' : 'Pin fact to top'}
                            onClick={() => {
                              if (!onUpdateMemory) return;
                              const updated = toggleMemoryPin(memory, fact);
                              onUpdateMemory(updated);
                            }}
                          >
                            {isPinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
                          </button>
                          <button
                            type="button"
                            className="p-1 text-slate-400 hover:text-blue-500 rounded"
                            title="Edit fact"
                            onClick={() => {
                              setEditingFactIndex(index);
                              setEditingFactText(displayText);
                            }}
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            className="p-1 text-slate-400 hover:text-rose-500 rounded"
                            title="Delete fact"
                            onClick={() => {
                              if (!onUpdateMemory) return;
                              const updated = deleteMemoryFact(memory, fact);
                              onUpdateMemory(updated);
                            }}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="cs-form-actions mt-3">
          {confirmClearMemory ? (
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => {
                onClearMemory();
                setConfirmClearMemory(false);
                notify?.('Memory cleared.');
              }}
            >
              <AlertTriangle className="w-4 h-4" /> Confirm clear memory
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-secondary !text-rose-500"
              disabled={memory.length === 0}
              onClick={() => setConfirmClearMemory(true)}
            >
              <Trash2 className="w-4 h-4" /> Clear memory
            </button>
          )}
        </div>
      </Card>

      <Card title="Chat retention" description="Automatically remove old conversations.">
        <SliderRow
          label="Retention period"
          value={draft.retentionDays ?? 0}
          min={0}
          max={365}
          step={1}
          format={(v) => (v === 0 ? 'Keep forever' : `${v} days`)}
          onChange={(v) => patch({ retentionDays: v })}
        />
      </Card>

      <Card title="Encryption & secrets" description="How API keys are protected at rest." icon={<ShieldCheck className="w-4 h-4" />}>
        <p className={`cs-callout ${keystoreEphemeral ? 'warn' : 'success'}`}>
          <ShieldCheck className="w-4 h-4 shrink-0" />
          <span>
            {keystoreEphemeral
              ? 'IndexedDB unavailable — keys live only in page memory and will not persist after reload.'
              : 'AES-256-GCM keystore active — encrypted keys are stored in IndexedDB; only ciphertext touches localStorage.'}
          </span>
        </p>
        <p className="cs-callout info">
          <KeyRound className="w-3.5 h-3.5 shrink-0" />
          {storedKeyCount} key-bearing config{storedKeyCount === 1 ? '' : 's'} on this device.
          Keys are excluded from exports and cloud sync by design.
        </p>
      </Card>

      <Card title="Backup & restore" description="Secret-free JSON snapshots of your workspace." icon={<Download className="w-4 h-4" />}>
        <div className="cs-form-actions">
          <button type="button" className="btn btn-secondary" onClick={onExportBackup}>
            <Download className="w-4 h-4" /> Export backup
          </button>
          <label className="btn btn-secondary cursor-pointer">
            <Upload className="w-4 h-4" /> Import backup
            <input
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                onImportBackup(e);
              }}
            />
          </label>
        </div>
        <div className="cs-form-actions">
          <button type="button" className="btn btn-secondary" onClick={onSaveRollbackPoint}>
            Save rollback point
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={!hasRollbackPoint}
            onClick={onRollback}
          >
            <RotateCcw className="w-4 h-4" /> Restore rollback
          </button>
        </div>
      </Card>

      <Card title="Danger zone" description="Permanently erase workspace data." icon={<AlertTriangle className="w-4 h-4" />}>
        {confirmClearAll ? (
          <button
            type="button"
            className="btn btn-danger w-full"
            onClick={() => {
              onClearAllData();
              setConfirmClearAll(false);
            }}
          >
            <AlertTriangle className="w-4 h-4" /> Click again to erase everything
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-secondary !text-rose-500 w-full"
            onClick={() => setConfirmClearAll(true)}
          >
            <Trash2 className="w-4 h-4" /> Clear all data
            {auth.configured ? ' (device + cloud)' : ''}
          </button>
        )}
      </Card>
    </>
  );

  const renderConnectors = () => (
    <>
      <Card
        title="Integrations Hub — GitHub, Vercel, Supabase & Google"
        description="Real OAuth & API connections with granular permission verification, live service workbenches, and confirmation-gated operations."
        icon={<Wrench className="w-4 h-4" />}
      >
        {connections && onUpdateConnections ? (
          <VaultConnectionsPanel
            connections={connections}
            onChange={onUpdateConnections}
            notes={notes}
            notify={notify || (() => {})}
            compact
          />
        ) : (
          <p className="cs-callout warn">Connector services are unavailable.</p>
        )}
        <div className="cs-form-actions">
          {onBackupToGithub && (
            <button type="button" className="btn btn-secondary" onClick={() => onBackupToGithub()}>
              <Cloud className="w-4 h-4" /> Backup workspace to GitHub
            </button>
          )}
          {onOpenNotebook && (
            <button type="button" className="btn btn-secondary" onClick={onOpenNotebook}>
              Open notebook ({notes.length})
            </button>
          )}
        </div>
      </Card>
    </>
  );

  const renderPermissions = () => (
    <>
      <Card title="Autonomy" description="How much authority the assistant has over itself." icon={<Bot className="w-4 h-4" />}>
        <SegmentedRow
          label="Self-control authority"
          value={autonomy}
          options={[
            { value: 'safe', label: 'Safe (confirm changes)' },
            { value: 'full', label: 'Full (act directly)' },
          ]}
          onChange={(v) => onAutonomyChange?.(v as AutonomyLevel)}
        />
        <div className="cs-form-actions">
          <button type="button" className="btn btn-secondary" onClick={selfCheck}>
            <RefreshCw className="w-4 h-4" /> Run self-health check &amp; repair
          </button>
        </div>
      </Card>

      <Card title="Capabilities" description="Engine features the assistant is allowed to use.">
        <ToggleRow
          label="Proactive suggestions"
          description="Offer wording and clarity improvements automatically."
          checked={Boolean(draft.proactiveAuto)}
          onChange={(v) => patch({ proactiveAuto: v })}
        />
        <ToggleRow
          label="Fast decision logic"
          description="Short-circuit simple questions without a model round-trip."
          checked={draft.fastDecision !== false}
          onChange={(v) => patch({ fastDecision: v })}
        />
        <ToggleRow
          label="GPU acceleration"
          description="Use smoother GPU-driven animations where available."
          checked={draft.gpuAccel !== false}
          onChange={(v) => patch({ gpuAccel: v })}
        />
        <ToggleRow
          label="Memory cache"
          description="Cache deterministic answers on the default engine."
          checked={draft.memoryCache !== false}
          onChange={(v) => patch({ memoryCache: v })}
        />
      </Card>

      <Card
        title="AI tool permissions"
        description="Enable or disable individual operational tools. Disabled tools are rejected on both client and server."
        icon={<Wrench className="w-4 h-4" />}
      >
        {TOOL_CAPABILITY_REGISTRY.map((tool) => {
          const enabled = isToolEnabled(tool.id, draft.enabledTools);
          return (
            <ToggleRow
              key={tool.id}
              label={`${tool.name}${tool.requiresConfirmation ? ' (Confirm required)' : ''}`}
              description={`${tool.description} · ${tool.statusNote}`}
              checked={enabled}
              onChange={(next) =>
                patch({
                  enabledTools: {
                    ...(draft.enabledTools || {}),
                    [tool.id]: next,
                  },
                })
              }
            />
          );
        })}
      </Card>


      <Card title="Reliability" description="Retries and request timeouts on failure.">
        <SliderRow
          label="Fallback retries"
          value={draft.maxRetries ?? 2}
          min={0}
          max={4}
          step={1}
          onChange={(v) => patch({ maxRetries: v })}
        />
        <SliderRow
          label="Request timeout"
          value={draft.requestTimeoutSec ?? 120}
          min={30}
          max={240}
          step={10}
          format={(v) => `${v}s`}
          onChange={(v) => patch({ requestTimeoutSec: v })}
        />
      </Card>

      <Card title="Behavior guidance" description="Standing instructions applied to every reply.">
        <div className="cs-row cs-row-column">
          <div className="cs-row-info">
            <span className="cs-label">Custom instructions</span>
          </div>
          <textarea
            className="cs-input cs-textarea"
            rows={3}
            value={draft.customInst || ''}
            maxLength={500}
            placeholder="e.g. Always answer in Bengali with short examples."
            onChange={(e) => patch({ customInst: e.target.value })}
          />
        </div>
      </Card>

      <Card title="AI-built skills & widgets" description="Capabilities the assistant installed for itself." icon={<Sparkles className="w-4 h-4" />}>
        {skills.length === 0 && selfWidgets.length === 0 && (
          <p className="cs-callout info">No self-built skills yet — ask the assistant to create one.</p>
        )}
        {skills.map((sk) => (
          <div key={sk.id} className="cs-skill-row">
            <div className="cs-row-info">
              <span className="cs-label">{sk.name}</span>
              <span className="cs-desc">{sk.description}</span>
            </div>
            <div className="cs-skill-actions">
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={sk.enabled}
                  onChange={(e) =>
                    onUpdateSkills?.(
                      skills.map((s) => (s.id === sk.id ? { ...s, enabled: e.target.checked } : s))
                    )
                  }
                />
                <span className="slider" />
              </label>
              {onOpenSkill && (
                <button type="button" className="btn btn-secondary !py-1 !px-2 !text-[11px]" onClick={() => onOpenSkill(sk)}>
                  Open
                </button>
              )}
              <button
                type="button"
                className="btn btn-secondary !py-1 !px-2 !text-[11px] !text-rose-500"
                onClick={() => onUpdateSkills?.(skills.filter((s) => s.id !== sk.id))}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}
        {selfWidgets.map((w) => (
          <div key={w.id} className="cs-skill-row">
            <div className="cs-row-info">
              <span className="cs-label">{w.title}</span>
              {w.description && <span className="cs-desc">{w.description}</span>}
            </div>
            <div className="cs-skill-actions">
              {onOpenWidget && (
                <button type="button" className="btn btn-secondary !py-1 !px-2 !text-[11px]" onClick={() => onOpenWidget(w)}>
                  Open
                </button>
              )}
              <button
                type="button"
                className="btn btn-secondary !py-1 !px-2 !text-[11px] !text-rose-500"
                onClick={() => onUpdateWidgets?.(selfWidgets.filter((x) => x.id !== w.id))}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}
      </Card>
    </>
  );

  const renderAccount = () => (
    <>
      <Card title="Local profile" description="Identity used inside conversations on this device.">
        <div className="cs-account-row">
          <div className="cs-avatar">
            {draft.avatarDataUrl ? (
              <img src={draft.avatarDataUrl} alt="" />
            ) : (
              (profileName || 'S').charAt(0).toUpperCase()
            )}
          </div>
          <label className="btn btn-secondary cursor-pointer">
            <Upload className="w-4 h-4" /> Change avatar
            <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={handleAvatarPick} />
          </label>
        </div>
        <TextRow
          label="Profile name"
          value={profileName}
          maxLength={80}
          onChange={handleNameChange}
        />
        <TextRow
          label="Contact email (local)"
          type="email"
          value={draft.accountEmail || ''}
          maxLength={120}
          onChange={(v) => patch({ accountEmail: v })}
        />
      </Card>

      <Card title="Usage & limits" description="Today's activity and optional message cap.">
        <div className="cs-usage">
          <span className="cs-usage-num">{usageToday}</span>
          <span className="cs-desc">messages today</span>
        </div>
        <SliderRow
          label="Daily message cap"
          description="0 means no cap."
          value={draft.dailyMessageLimit ?? 0}
          min={0}
          max={500}
          step={10}
          onChange={(v) => patch({ dailyMessageLimit: v })}
        />
      </Card>

      <Card title="About" description={`SMFTA AI Pro v${APP_VERSION}`}>
        <div className="cs-form-actions">
          <button type="button" className="btn btn-secondary" onClick={onOpenWhatsNew}>
            What&apos;s new
          </button>
          <button type="button" className="btn btn-secondary" onClick={handleResetDefaults}>
            <RotateCcw className="w-4 h-4" /> Restore default settings
          </button>
        </div>
      </Card>
    </>
  );

  const renderPerformance = () => (
    <>
      <Card
        title="Response mode & streaming"
        description="Control response tier, token streaming, and output length. Actual network latency depends on the connected provider."
        icon={<Zap className="w-4 h-4" />}
      >
        <SegmentedRow
          label="Response mode"
          description="Fast prioritizes concise speed; Balanced is everyday default; High-Quality enables deeper analysis."
          value={draft.mode}
          options={[
            { value: 'fast', label: 'Fast' },
            { value: 'balanced', label: 'Balanced' },
            { value: 'power', label: 'High-Quality' },
          ]}
          onChange={(v) => patch({ mode: v as AppSettings['mode'] })}
        />
        <ToggleRow
          label="Stream responses incrementally"
          description="Enabled by default when supported by the provider. Press Stop in chat at any time to abort an in-flight request."
          checked={draft.streamingReveal !== false}
          onChange={(v) => patch({ streamingReveal: v })}
        />
        <SliderRow
          label="Maximum output tokens"
          value={draft.maxOutputTokens ?? 1024}
          min={256}
          max={32768}
          step={256}
          onChange={(v) => patch({ maxOutputTokens: v })}
        />
        <SliderRow
          label="Temperature"
          description="Applied when supported by the selected model."
          value={draft.weightTemp ?? 0.7}
          min={0.1}
          max={1.2}
          step={0.05}
          format={(v) => v.toFixed(2)}
          onChange={(v) => patch({ weightTemp: v })}
        />
        <SliderRow
          label="Top-P sampling"
          description="Applied when supported by the selected model."
          value={draft.topP ?? 0.9}
          min={0.1}
          max={1}
          step={0.05}
          format={(v) => v.toFixed(2)}
          onChange={(v) => patch({ topP: v })}
        />
      </Card>

      <Card
        title="Timeouts, retries & honest fallback policy"
        description="Safe retry behavior and transparent provider status reporting."
        icon={<Server className="w-4 h-4" />}
      >
        <SliderRow
          label="Request timeout"
          value={draft.requestTimeoutSec ?? 120}
          min={30}
          max={240}
          step={10}
          format={(v) => `${v}s`}
          onChange={(v) => patch({ requestTimeoutSec: v })}
        />
        <SliderRow
          label="Safe retry attempts"
          value={draft.maxRetries ?? 2}
          min={0}
          max={4}
          step={1}
          onChange={(v) => patch({ maxRetries: v })}
        />
        <ToggleRow
          label="Allow keyless fallback engine"
          description="When enabled, falls back to the built-in engine if your custom provider is unreachable, and clearly labels the actual provider used."
          checked={Boolean(draft.allowKeylessFallback)}
          onChange={(v) => patch({ allowKeylessFallback: v })}
        />
        <ToggleRow
          label="Show actual provider, model & latency on messages"
          checked={Boolean(draft.showTokenUsage)}
          onChange={(v) => patch({ showTokenUsage: v })}
        />
      </Card>
    </>
  );

  const renderAccessibility = () => (
    <>
      <Card
        title="Visual & keyboard accessibility"
        description="High contrast, visible keyboard focus rings, touch target sizing, and motion controls."
        icon={<Eye className="w-4 h-4" />}
      >
        <ToggleRow
          label="High contrast mode"
          description="Increase text and border contrast across chat and settings."
          checked={Boolean(draft.highContrast)}
          onChange={(v) => patch({ highContrast: v })}
        />
        <ToggleRow
          label="Visible keyboard focus rings"
          description="Highlight focused buttons, inputs, and links during Tab navigation."
          checked={draft.focusRingVisible !== false}
          onChange={(v) => patch({ focusRingVisible: v })}
        />
        <ToggleRow
          label="Large mobile touch targets"
          description="Enforce generous touch target sizing for mobile and tablet ergonomics."
          checked={Boolean(draft.largeTouchTargets)}
          onChange={(v) => patch({ largeTouchTargets: v })}
        />
        <ToggleRow
          label="Reduced motion"
          description="Disable decorative transitions and animations."
          checked={Boolean(draft.reducedMotion)}
          onChange={(v) => patch({ reducedMotion: v })}
        />
        <SegmentedRow
          label="Interface font size"
          value={draft.fontsize}
          options={[
            { value: 'small', label: 'Small' },
            { value: 'normal', label: 'Normal' },
            { value: 'large', label: 'Large' },
          ]}
          onChange={(v) => patch({ fontsize: v as AppSettings['fontsize'] })}
        />
        <SegmentedRow
          label="Code font size"
          value={draft.codeFontSize || 'normal'}
          options={[
            { value: 'small', label: 'Small' },
            { value: 'normal', label: 'Normal' },
            { value: 'large', label: 'Large' },
          ]}
          onChange={(v) => patch({ codeFontSize: v as AppSettings['codeFontSize'] })}
        />
      </Card>
    </>
  );

  const renderAdvanced = () => (
    <>
      <Card
        title="Streaming & provider diagnostics"
        description="Inspect real-time provider state, settings schema version, and capability registry."
        icon={<SlidersHorizontal className="w-4 h-4" />}
      >
        <ToggleRow
          label="Enable live diagnostics overlay"
          description="Display streaming TTFT, latency, and provider verification details on responses."
          checked={Boolean(draft.diagnosticsEnabled)}
          onChange={(v) => patch({ diagnosticsEnabled: v, showTokenUsage: v ? true : draft.showTokenUsage })}
        />
        <div className="cs-callout info">
          <div>
            <strong>System Schema:</strong> v{draft.settingsVersion ?? SETTINGS_SCHEMA_VERSION} ·{' '}
            <strong>App Version:</strong> v{APP_VERSION} ·{' '}
            <strong>Active Profile:</strong> {activeProfile?.name} ({activeProfile?.provider}) ·{' '}
            <strong>Status:</strong> {describeProviderStatus(activeProfile)}
          </div>
        </div>
      </Card>

      <Card
        title="Code Workspace runtime capabilities"
        description="Honest execution matrix for /workspace/code."
        icon={<Wrench className="w-4 h-4" />}
      >
        {WORKSPACE_RUNTIME_CAPABILITIES.map((cap) => (
          <div key={cap.language} className="cs-row">
            <div className="cs-row-info">
              <span className="cs-label uppercase">{cap.language}</span>
              <span className="cs-desc">{cap.description}</span>
            </div>
            <span className={`cs-pill ${cap.executableInBrowser ? 'connected' : 'not-tested'}`}>
              {cap.executableInBrowser ? 'Sandboxed Run' : 'Editor Only'}
            </span>
          </div>
        ))}
      </Card>
    </>
  );

  const panels: Record<SectionId, () => React.ReactNode> = {
    general: renderGeneral,
    appearance: renderAppearance,
    providers: renderProviders,
    performance: renderPerformance,
    chat: renderChat,
    privacy: renderPrivacy,
    connectors: renderConnectors,
    permissions: renderPermissions,
    accessibility: renderAccessibility,
    advanced: renderAdvanced,
    account: renderAccount,
  };


  const shell = (
    <div className={`cs-shell ${isInline ? 'is-inline' : ''}`}>
      {/* Left navigation */}
      <nav className={`cs-nav ${mobileNavOpen ? 'is-open' : 'is-hidden-mobile'}`} aria-label="Settings sections">
        <div className="cs-nav-head">
          <div className="cs-nav-title-row">
            <h2 className="cs-nav-title">Settings</h2>
            <button
              type="button"
              className="cs-nav-close"
              onClick={handleSaveAndClose}
              aria-label="Close settings"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="cs-nav-search">
          <Search className="w-4 h-4" />
          <input
            className="cs-search-input"
            placeholder="Search settings"
            value={navQuery}
            onChange={(e) => setNavQuery(e.target.value)}
            aria-label="Search settings"
          />
          <kbd className="cs-kbd">⌘F</kbd>
        </div>
        <div className="cs-nav-list no-scrollbar">
          {filteredSections.length === 0 && (
            <p className="cs-empty">No settings found for “{navQuery}”.</p>
          )}
          {filteredSections.map((id) => {
            const meta = SECTION_META[id];
            return (
              <button
                key={id}
                type="button"
                className={`cs-nav-item ${tab === id ? 'active' : ''}`}
                data-section={id}
                aria-current={tab === id ? 'page' : undefined}
                onClick={() => openSection(id)}
              >
                <span className="cs-nav-icon">{meta.icon}</span>
                <span className="cs-nav-meta">
                  <span className="cs-nav-label">{meta.label}</span>
                  <span className="cs-nav-hint">{meta.hint}</span>
                </span>
                <ChevronRight className="w-4 h-4 cs-nav-arrow" />
              </button>
            );
          })}
        </div>
      </nav>

      {/* Content panel */}
      <div className={`cs-panel ${mobileNavOpen ? 'is-hidden-mobile' : 'is-open'}`}>
        <header className="cs-panel-head">
          <button
            type="button"
            className="cs-back-btn lg:hidden"
            onClick={() => setMobileNavOpen(true)}
            aria-label="Back to sections"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h2>{SECTION_META[tab].label}</h2>
            <p>{SECTION_META[tab].hint}</p>
          </div>
          <button type="button" className="cs-close" onClick={handleSaveAndClose} aria-label="Close settings">
            ×
          </button>
        </header>
        <div className="cs-panel-body no-scrollbar">{panels[tab]()}</div>
        <footer className="cs-panel-footer">
          <button type="button" className="btn btn-secondary" onClick={handleResetDefaults}>
            <RotateCcw className="w-4 h-4" /> Reset
          </button>
          <div className="cs-footer-right">
            <button type="button" className="btn btn-secondary" onClick={handleDiscardAndClose}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" onClick={handleSaveAndClose}>
              Save changes
            </button>
          </div>
        </footer>
      </div>
    </div>
  );

  if (isInline) {
    return <div className="cs-inline-wrap">{shell}</div>;
  }
  return (
    <div className="settings-overlay" role="dialog" aria-modal="true" aria-label="Settings">
      <div className="cs-modal">{shell}</div>
    </div>
  );
};

export default SettingsModal;
