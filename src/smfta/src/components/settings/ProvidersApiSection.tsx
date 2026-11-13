import React from 'react';
import {
  Activity,
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  Key,
  Layers,
  Loader2,
  Plus,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Trash2,
} from 'lucide-react';
import type {
  AppSettings,
  ExternalProviderId,
  SavedProviderProfile,
  TelemetryRequestLog,
} from '../../types';
import {
  DEFAULT_PROVIDER_BASE_URLS,
  DEFAULT_PROVIDER_MODELS,
  PROVIDER_CATALOG,
  PROVIDER_GROUP_LABELS,
  ProviderGroup,
  getModelsForProfile,
  isBuiltinProviderId,
  isKeylessProviderId,
  providerEntry,
  sortProvidersByPriority,
} from '../../utils/providers';
import { PRIMARY_PROVIDER_OPTIONS } from '../../data/providerCatalog';
import { aggregateTelemetryStats } from '../../utils/telemetryLog';
import {
  SettingNumber,
  SettingSelect,
  SettingToggle,
  SettingsCard,
  SettingsGrid,
} from '../SettingsControls';

function maskApiKey(key?: string): string {
  const k = (key || '').trim();
  if (!k) return 'None';
  if (k.length <= 8) return '••••••••';
  return `${k.slice(0, 4)}••••${k.slice(-4)}`;
}

export interface ProvidersApiSectionProps {
  draft: AppSettings;
  patch: (partial: Partial<AppSettings>) => void;
  localProfiles: SavedProviderProfile[];
  activeProfile: SavedProviderProfile;
  onActivateProfile: (prof: SavedProviderProfile) => void;
  onUpdateProfileField: (id: string, changes: Partial<SavedProviderProfile>) => void;
  onDeleteProfile: (id: string) => void;
  onMovePriority: (id: string, direction: 'up' | 'down') => void;
  onTestProfile: (prof: SavedProviderProfile) => void;
  onRefreshProfileModels: (prof: SavedProviderProfile) => void;
  // Add form state
  newPropName: string;
  setNewPropName: (v: string) => void;
  newProviderId: ExternalProviderId;
  onChangeNewProviderId: (v: ExternalProviderId) => void;
  newApiKey: string;
  onChangeNewApiKey: (v: string) => void;
  showNewKey: boolean;
  setShowNewKey: React.Dispatch<React.SetStateAction<boolean>>;
  newBaseUrl: string;
  setNewBaseUrl: (v: string) => void;
  newModel: string;
  setNewModel: (v: string) => void;
  newCustomHeaders: string;
  setNewCustomHeaders: (v: string) => void;
  newCustomParams: string;
  setNewCustomParams: (v: string) => void;
  showAdvancedOptions: boolean;
  setShowAdvancedOptions: React.Dispatch<React.SetStateAction<boolean>>;
  profileAdvancedOpen: Record<string, boolean>;
  setProfileAdvancedOpen: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  candidateModelsForNew: string[];
  detectedProviderFromNewKey: ExternalProviderId | null;
  isLoadingModels: boolean;
  discoveryWarning: string | null;
  onFetchNewModels: () => void;
  isVerifyingNew: boolean;
  newVerifyResult: { ok: boolean; message: string; workingModel?: string } | null;
  onSaveWithoutVerification: () => void;
  onVerifyAndAddProvider: () => void;
  testingProfileId: string | null;
  loadingModelsForId: string | null;
  revealedKeyIds: Record<string, boolean>;
  setRevealedKeyIds: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  editingProfileId: string | null;
  setEditingProfileId: React.Dispatch<React.SetStateAction<string | null>>;
  // API stats & history
  telemetryLogs: TelemetryRequestLog[];
  usageToday: number;
}

export const ProvidersApiSection: React.FC<ProvidersApiSectionProps> = ({
  draft,
  patch,
  localProfiles,
  activeProfile,
  onActivateProfile,
  onUpdateProfileField,
  onDeleteProfile,
  onMovePriority,
  onTestProfile,
  onRefreshProfileModels,
  newPropName,
  setNewPropName,
  newProviderId,
  onChangeNewProviderId,
  newApiKey,
  onChangeNewApiKey,
  showNewKey,
  setShowNewKey,
  newBaseUrl,
  setNewBaseUrl,
  newModel,
  setNewModel,
  newCustomHeaders,
  setNewCustomHeaders,
  newCustomParams,
  setNewCustomParams,
  showAdvancedOptions,
  setShowAdvancedOptions,
  profileAdvancedOpen,
  setProfileAdvancedOpen,
  candidateModelsForNew,
  detectedProviderFromNewKey,
  isLoadingModels,
  discoveryWarning,
  onFetchNewModels,
  isVerifyingNew,
  newVerifyResult,
  onSaveWithoutVerification,
  onVerifyAndAddProvider,
  testingProfileId,
  loadingModelsForId,
  revealedKeyIds,
  setRevealedKeyIds,
  editingProfileId,
  setEditingProfileId,
  telemetryLogs,
  usageToday,
}) => {
  const orderedProfiles = sortProvidersByPriority(localProfiles);
  const activeProfileModels = getModelsForProfile(activeProfile);
  const stats = aggregateTelemetryStats(telemetryLogs);
  const customApiProfiles = orderedProfiles.filter((p) => !isBuiltinProviderId(p.provider));

  return (
    <div className="space-y-4">
      {/* 1. Configure / Add Custom Provider */}
      <SettingsCard
        title="Configure & Add Provider"
        description="Connect OpenAI, Gemini, Anthropic, Mercury, OpenRouter, or any custom REST endpoint."
        icon={<Plus className="w-4 h-4" />}
      >
        <div className="space-y-3.5">
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
                    onClick={() => onChangeNewProviderId(opt.id)}
                    className={`px-3 py-2 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                      isSelected
                        ? 'border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]'
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
                onChange={(e) => onChangeNewProviderId(e.target.value as ExternalProviderId)}
                className="cs-input w-full text-xs"
              >
                {(['popular', 'custom', 'local', 'builtin'] as ProviderGroup[]).map((grp) => (
                  <optgroup key={grp} label={PROVIDER_GROUP_LABELS[grp]}>
                    {PROVIDER_CATALOG.filter((p) => p.group === grp).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
          </div>

          {/* Model ID + Fetch Models */}
          <div>
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-2)]">
                Model ID
              </label>
              <button
                type="button"
                onClick={onFetchNewModels}
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
                    Select discovered / preset model…
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
              <div className="text-[11px] text-[var(--accent-amber)] mt-1">{discoveryWarning}</div>
            )}
          </div>

          {/* API Key Input */}
          {(!isKeylessProviderId(newProviderId) || newProviderId === 'custom') && (
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--text-2)] mb-1.5">
                API Key (Encrypted locally with AES-256-GCM)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type={showNewKey ? 'text' : 'password'}
                  data-testid="provider-api-key-input"
                  value={newApiKey}
                  onChange={(e) => onChangeNewApiKey(e.target.value)}
                  placeholder={providerEntry(newProviderId)?.keyHint || 'Paste your API key'}
                  className="cs-input flex-1 font-mono text-xs"
                />
                <button
                  type="button"
                  data-testid="provider-api-key-toggle"
                  onClick={() => setShowNewKey((v) => !v)}
                  className="px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] text-xs font-semibold text-[var(--text-2)] hover:text-[var(--text)] inline-flex items-center gap-1.5 cursor-pointer shrink-0"
                >
                  {showNewKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  <span>{showNewKey ? 'Hide' : 'Show'}</span>
                </button>
              </div>
              {detectedProviderFromNewKey && detectedProviderFromNewKey !== newProviderId && (
                <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] text-[var(--text-2)]">
                  <span>
                    Key prefix resembles{' '}
                    <strong>
                      {providerEntry(detectedProviderFromNewKey)?.label || detectedProviderFromNewKey}
                    </strong>
                  </span>
                  <button
                    type="button"
                    onClick={() => onChangeNewProviderId(detectedProviderFromNewKey)}
                    className="text-[var(--primary)] font-semibold hover:underline cursor-pointer"
                  >
                    Switch Provider
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Connection Details & Custom Parameters */}
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)] overflow-hidden">
            <button
              type="button"
              data-testid="provider-advanced-toggle"
              aria-expanded={showAdvancedOptions}
              onClick={() => setShowAdvancedOptions((prev) => !prev)}
              className="w-full px-3.5 py-2.5 flex items-center justify-between text-xs font-semibold text-[var(--text-2)] hover:text-[var(--text)] cursor-pointer"
            >
              <span>Connection details, Custom Headers & Custom Parameters</span>
              <ChevronDown
                className={`w-4 h-4 transition-transform ${showAdvancedOptions ? 'rotate-180' : ''}`}
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
                    placeholder={`e.g. My ${providerEntry(newProviderId)?.short || 'Custom'} Profile`}
                    className="cs-input w-full text-xs"
                  />
                </div>
                {!isBuiltinProviderId(newProviderId) && (
                  <div>
                    <label className="block text-[11px] font-medium text-[var(--text-2)] mb-1">
                      API Base URL
                    </label>
                    <input
                      type="text"
                      data-testid="provider-base-url-input"
                      value={newBaseUrl}
                      onChange={(e) => setNewBaseUrl(e.target.value)}
                      placeholder={
                        DEFAULT_PROVIDER_BASE_URLS[newProviderId] || 'https://api.openai.com/v1'
                      }
                      className="cs-input w-full font-mono text-xs"
                    />
                  </div>
                )}
                <div>
                  <label className="block text-[11px] font-medium text-[var(--text-2)] mb-1">
                    Custom Headers (JSON, Optional)
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
                <div>
                  <label className="block text-[11px] font-medium text-[var(--text-2)] mb-1">
                    Custom Parameters (JSON, Optional — e.g. frequency_penalty, seed)
                  </label>
                  <input
                    type="text"
                    data-testid="provider-custom-params-input"
                    value={newCustomParams}
                    onChange={(e) => setNewCustomParams(e.target.value)}
                    placeholder='{"frequency_penalty": 0.2, "seed": 42}'
                    className="cs-input w-full font-mono text-xs"
                  />
                </div>
              </div>
            )}
          </div>

          {newVerifyResult && (
            <div
              className={`px-3 py-2 rounded-lg text-xs font-medium border ${
                newVerifyResult.ok
                  ? 'border-emerald-500/35 bg-emerald-500/10 text-[var(--accent-emerald)]'
                  : 'border-rose-500/35 bg-rose-500/10 text-[var(--settings-danger)]'
              }`}
            >
              {newVerifyResult.message}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onSaveWithoutVerification}
              disabled={isVerifyingNew}
              className="px-3.5 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] text-xs font-semibold text-[var(--text)] hover:border-[var(--primary-border)] cursor-pointer"
            >
              Save Profile
            </button>
            <button
              type="button"
              onClick={onVerifyAndAddProvider}
              disabled={isVerifyingNew}
              className="px-4 py-2 rounded-lg bg-[var(--primary)] text-[var(--settings-on-accent)] text-xs font-semibold inline-flex items-center gap-1.5 hover:opacity-95 cursor-pointer"
            >
              {isVerifyingNew ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Check className="w-3.5 h-3.5" />
              )}
              {isVerifyingNew ? 'Testing…' : 'Test & Connect'}
            </button>
          </div>
        </div>
      </SettingsCard>

      {/* 2. Provider Management (Priority Order, Enable/Disable, Edit/Delete) */}
      <SettingsCard
        title={`Provider Management & Priority (${orderedProfiles.length})`}
        description="Set active default provider, toggle enable/disable, reorder fallback priority, and test live endpoints."
        icon={<Layers className="w-4 h-4" />}
      >
        <div className="space-y-2.5">
          {orderedProfiles.map((prof, idx) => {
            const isSelected = activeProfile?.id === prof.id;
            const isEditing = editingProfileId === prof.id;
            const isBuiltin = isBuiltinProviderId(prof.provider);
            const isKeyRevealed = Boolean(revealedKeyIds[prof.id]);
            const isTesting = testingProfileId === prof.id;
            const isRefreshing = loadingModelsForId === prof.id;
            const modelsForProf = getModelsForProfile(prof);
            const isEnabled = prof.enabled !== false;
            const vStatus =
              prof.verificationStatus || (prof.verified ? 'verified' : 'untested');

            return (
              <div
                key={prof.id}
                className={`rounded-lg border p-3 transition-colors ${
                  !isEnabled
                    ? 'border-[var(--border)] bg-[var(--bg)] opacity-60'
                    : isSelected
                    ? 'border-[var(--primary)] bg-[var(--primary-soft)]'
                    : 'border-[var(--border)] bg-[var(--bg)]'
                }`}
              >
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <button
                    type="button"
                    onClick={() => onActivateProfile(prof)}
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
                        <span className="w-1.5 h-1.5 rounded-full bg-[var(--settings-on-accent)]" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap text-xs font-semibold text-[var(--text)]">
                        <span className="font-mono text-[10px] text-[var(--text-3)]">
                          #{idx + 1}
                        </span>
                        <span className="truncate">{prof.name}</span>
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-[var(--surface-2)] text-[var(--text-2)] border border-[var(--border)]">
                          {providerEntry(prof.provider)?.short || prof.provider}
                        </span>
                        {isBuiltin && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-[var(--primary-soft)] text-[var(--primary)]">
                            Built-in
                          </span>
                        )}
                        {!isBuiltin && vStatus === 'verified' && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/10 text-[var(--accent-emerald)] border border-emerald-500/30">
                            Verified
                          </span>
                        )}
                        {!isBuiltin && vStatus === 'failed' && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-rose-500/10 text-[var(--settings-danger)] border border-rose-500/30">
                            Failed
                          </span>
                        )}
                        {!isBuiltin && vStatus === 'stale' && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-500/10 text-[var(--accent-amber)] border border-amber-500/30">
                            Stale
                          </span>
                        )}
                        {!isBuiltin && vStatus === 'untested' && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-[var(--surface-2)] text-[var(--text-3)] border border-[var(--border)]">
                            Untested
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-[var(--text-3)] mt-0.5">
                        <span className="font-mono">
                          {prof.externalModel || DEFAULT_PROVIDER_MODELS[prof.provider] || 'Auto'}
                        </span>
                        {!isBuiltin && prof.externalKeys && (
                          <span> · Key: {maskApiKey(prof.externalKeys)}</span>
                        )}
                      </div>
                    </div>
                  </button>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() => onMovePriority(prof.id, 'up')}
                      title="Move higher priority"
                      className="p-1.5 rounded border border-[var(--border)] bg-[var(--surface)] text-[var(--text-2)] disabled:opacity-30 cursor-pointer"
                    >
                      <ArrowUp className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      disabled={idx === orderedProfiles.length - 1}
                      onClick={() => onMovePriority(prof.id, 'down')}
                      title="Move lower priority"
                      className="p-1.5 rounded border border-[var(--border)] bg-[var(--surface)] text-[var(--text-2)] disabled:opacity-30 cursor-pointer"
                    >
                      <ArrowDown className="w-3 h-3" />
                    </button>
                    {!isBuiltin && (
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateProfileField(prof.id, { enabled: !isEnabled })
                        }
                        className={`px-2 py-1 rounded border text-[11px] font-medium cursor-pointer ${
                          isEnabled
                            ? 'border-[var(--primary-border)] bg-[var(--primary-soft)] text-[var(--primary)]'
                            : 'border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-3)]'
                        }`}
                      >
                        {isEnabled ? 'Enabled' : 'Disabled'}
                      </button>
                    )}
                    {!isBuiltin && (
                      <button
                        type="button"
                        onClick={() => onTestProfile(prof)}
                        disabled={isTesting}
                        className="px-2.5 py-1 rounded border border-[var(--border)] bg-[var(--surface)] text-xs font-semibold text-[var(--text-2)] hover:text-[var(--text)] inline-flex items-center gap-1 cursor-pointer"
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
                      onClick={() => setEditingProfileId(isEditing ? null : prof.id)}
                      className="px-2.5 py-1 rounded border border-[var(--border)] bg-[var(--surface)] text-xs font-semibold text-[var(--text-2)] hover:text-[var(--text)] inline-flex items-center gap-1 cursor-pointer"
                    >
                      {isEditing ? 'Close' : 'Edit'}
                      <ChevronRight
                        className={`w-3 h-3 transition-transform ${isEditing ? 'rotate-90' : ''}`}
                      />
                    </button>
                    {!isBuiltin && localProfiles.length > 1 && (
                      <button
                        type="button"
                        onClick={() => onDeleteProfile(prof.id)}
                        className="p-1.5 rounded text-[var(--text-3)] hover:text-[var(--settings-danger)] cursor-pointer"
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
                        ? 'text-[var(--settings-danger)]'
                        : vStatus === 'verified'
                        ? 'text-[var(--accent-emerald)]'
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
                            onUpdateProfileField(prof.id, { name: e.target.value })
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
                            const nextProv = e.target.value as ExternalProviderId;
                            onUpdateProfileField(prof.id, {
                              provider: nextProv,
                              externalBaseUrl: DEFAULT_PROVIDER_BASE_URLS[nextProv] || '',
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
                          Model ID
                        </span>
                        {!isBuiltin && (
                          <button
                            type="button"
                            onClick={() => onRefreshProfileModels(prof)}
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
                                onUpdateProfileField(prof.id, {
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
                            onUpdateProfileField(prof.id, { externalModel: e.target.value })
                          }
                          placeholder={DEFAULT_PROVIDER_MODELS[prof.provider] || 'mercury-3'}
                          className="cs-input font-mono text-xs"
                        />
                      </div>
                    </div>

                    {!isBuiltinProviderId(prof.provider) && (
                      <>
                        <div>
                          <span className="block text-[11px] font-semibold text-[var(--text-2)] mb-1">
                            API Key
                          </span>
                          <div className="flex items-center gap-2">
                            <input
                              type={isKeyRevealed ? 'text' : 'password'}
                              value={prof.externalKeys}
                              onChange={(e) =>
                                onUpdateProfileField(prof.id, {
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
                              className="p-2 rounded border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-2)] hover:text-[var(--text)] cursor-pointer"
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
                            <span>Base URL, Headers, Custom Params & Limits</span>
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
                                  API Base URL
                                </span>
                                <input
                                  type="text"
                                  value={prof.externalBaseUrl}
                                  onChange={(e) =>
                                    onUpdateProfileField(prof.id, {
                                      externalBaseUrl: e.target.value,
                                    })
                                  }
                                  className="cs-input w-full font-mono text-xs"
                                />
                              </div>
                              <div>
                                <span className="block text-[11px] font-medium text-[var(--text-2)] mb-1">
                                  Custom Headers (JSON)
                                </span>
                                <input
                                  type="text"
                                  value={prof.customHeaders || ''}
                                  onChange={(e) =>
                                    onUpdateProfileField(prof.id, {
                                      customHeaders: e.target.value,
                                    })
                                  }
                                  className="cs-input w-full font-mono text-xs"
                                />
                              </div>
                              <div>
                                <span className="block text-[11px] font-medium text-[var(--text-2)] mb-1">
                                  Custom Parameters (JSON)
                                </span>
                                <input
                                  type="text"
                                  value={prof.customParams || ''}
                                  onChange={(e) =>
                                    onUpdateProfileField(prof.id, {
                                      customParams: e.target.value,
                                    })
                                  }
                                  placeholder='{"seed": 42}'
                                  className="cs-input w-full font-mono text-xs"
                                />
                              </div>
                              <SettingsGrid>
                                <SettingNumber
                                  label="Context window (tokens)"
                                  value={prof.contextWindow ?? 32768}
                                  min={1024}
                                  max={1000000}
                                  step={1024}
                                  onChange={(v) =>
                                    onUpdateProfileField(prof.id, { contextWindow: v })
                                  }
                                />
                                <SettingNumber
                                  label="Profile max output tokens"
                                  value={prof.maxOutputTokens ?? draft.maxOutputTokens ?? 4096}
                                  min={256}
                                  max={32768}
                                  step={256}
                                  onChange={(v) =>
                                    onUpdateProfileField(prof.id, { maxOutputTokens: v })
                                  }
                                />
                              </SettingsGrid>
                              <SettingToggle
                                label="Stream responses (SSE)"
                                checked={prof.supportsStreaming !== false}
                                onChange={(v) =>
                                  onUpdateProfileField(prof.id, { supportsStreaming: v })
                                }
                              />
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
      </SettingsCard>

      {/* Quick Model Switch on Active Profile */}
      {activeProfileModels.length > 0 && (
        <SettingsCard
          title="Quick Model Switch"
          description={`Switch model ID on active profile "${activeProfile.name}".`}
          icon={<Key className="w-4 h-4" />}
        >
          <div className="flex flex-wrap gap-1.5">
            {activeProfileModels.slice(0, 14).map((m) => {
              const active = (activeProfile.externalModel || draft.externalModel) === m;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => onUpdateProfileField(activeProfile.id, { externalModel: m })}
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
        </SettingsCard>
      )}

      {/* 3. API Management, Limits & Live Request History */}
      <SettingsCard
        title="API Management & Token Usage"
        description="Real on-device API key inventory, usage limits, token counters, and request history."
        icon={<Activity className="w-4 h-4" />}
      >
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3 rounded-lg border border-[var(--border)] bg-[var(--bg)]">
            <div className="text-[11px] text-[var(--text-3)]">Messages Today</div>
            <div className="text-sm font-semibold text-[var(--text)] tabular-nums mt-0.5">
              {usageToday}
              {draft.dailyMessageLimit ? ` / ${draft.dailyMessageLimit}` : ''}
            </div>
          </div>
          <div className="p-3 rounded-lg border border-[var(--border)] bg-[var(--bg)]">
            <div className="text-[11px] text-[var(--text-3)]">Logged Requests</div>
            <div className="text-sm font-semibold text-[var(--text)] tabular-nums mt-0.5">
              {stats.totalRequests} ({stats.successCount} ok · {stats.errorCount} err)
            </div>
          </div>
          <div className="p-3 rounded-lg border border-[var(--border)] bg-[var(--bg)]">
            <div className="text-[11px] text-[var(--text-3)]">Total Tokens</div>
            <div className="text-sm font-semibold text-[var(--text)] tabular-nums mt-0.5">
              {(stats.totalInputTokens + stats.totalOutputTokens).toLocaleString()}
            </div>
          </div>
          <div className="p-3 rounded-lg border border-[var(--border)] bg-[var(--bg)]">
            <div className="text-[11px] text-[var(--text-3)]">Avg Latency</div>
            <div className="text-sm font-semibold text-[var(--text)] tabular-nums mt-0.5">
              {stats.avgLatencyMs !== null ? `${stats.avgLatencyMs} ms` : 'No requests yet'}
            </div>
          </div>
        </div>

        <SettingsGrid>
          <SettingNumber
            label="Daily Message Limit (0 = Unlimited)"
            value={draft.dailyMessageLimit ?? 0}
            min={0}
            max={10000}
            step={10}
            onChange={(v) => patch({ dailyMessageLimit: v })}
          />
          <div className="settings-control">
            <span>Configured API Keys (Masked)</span>
            <div className="p-2.5 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-xs font-mono text-[var(--text-2)] space-y-1 max-h-24 overflow-y-auto">
              {customApiProfiles.length === 0 ? (
                <span className="text-[var(--text-3)]">No external API keys saved.</span>
              ) : (
                customApiProfiles.map((p) => (
                  <div key={p.id} className="flex justify-between gap-2">
                    <span className="truncate">{p.name}</span>
                    <span className="shrink-0">{maskApiKey(p.externalKeys)}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </SettingsGrid>

        <div className="pt-2 border-t border-[var(--border)]">
          <div className="text-xs font-semibold text-[var(--text)] mb-2">
            Recent API Request History ({telemetryLogs.length})
          </div>
          {telemetryLogs.length === 0 ? (
            <div className="text-xs text-[var(--text-3)] py-3 px-3 rounded-lg border border-dashed border-[var(--border)]">
              No live requests recorded in this session yet. Send a chat message or test a provider to see real request telemetry.
            </div>
          ) : (
            <div className="max-h-40 overflow-y-auto divide-y divide-[var(--border)] rounded-lg border border-[var(--border)]">
              {telemetryLogs.slice(0, 12).map((log) => (
                <div
                  key={log.id}
                  className="px-3 py-2 flex items-center justify-between gap-2 text-[11px] bg-[var(--bg)]"
                >
                  <div className="min-w-0 flex items-center gap-2">
                    <span
                      className={`font-semibold uppercase ${
                        log.status === 'success'
                          ? 'text-[var(--accent-emerald)]'
                          : 'text-[var(--settings-danger)]'
                      }`}
                    >
                      {log.status}
                    </span>
                    <span className="font-mono text-[var(--text)] truncate">
                      {log.provider} / {log.model}
                    </span>
                  </div>
                  <div className="shrink-0 font-mono text-[var(--text-3)] tabular-nums">
                    {log.latencyMs ? `${log.latencyMs}ms · ` : ''}
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </SettingsCard>

      {/* 4. Reliability */}
      <SettingsCard
        title="Reliability & Failover"
        description="Automatic fallback chain, retry budget, request timeouts, and failure policy."
        icon={<ShieldAlert className="w-4 h-4" />}
      >
        <SettingsGrid>
          <SettingNumber
            label="Retry Attempts"
            value={draft.maxRetries ?? 2}
            min={0}
            max={4}
            onChange={(v) => patch({ maxRetries: v })}
          />
          <SettingNumber
            label="Request Timeout (seconds)"
            value={draft.requestTimeoutSec ?? 120}
            min={30}
            max={240}
            step={10}
            onChange={(v) => patch({ requestTimeoutSec: v })}
          />
          <SettingSelect
            label="Error Handling Policy"
            value={draft.errorHandlingPolicy ?? 'retry_fallback'}
            options={[
              { value: 'retry_fallback', label: 'Retry then Fallback Chain' },
              { value: 'fail_fast', label: 'Fail Fast (Show Upstream Error)' },
              { value: 'notify_only', label: 'Notify & Keep Draft Intact' },
            ]}
            onChange={(v) =>
              patch({ errorHandlingPolicy: v as AppSettings['errorHandlingPolicy'] })
            }
          />
        </SettingsGrid>
        <SettingToggle
          label="Automatic Keyless Fallback"
          description="Fall back to next enabled priority profile or built-in keyless engine if the primary provider fails."
          checked={draft.allowKeylessFallback === true}
          onChange={(v) => patch({ allowKeylessFallback: v })}
        />
      </SettingsCard>
    </div>
  );
};
