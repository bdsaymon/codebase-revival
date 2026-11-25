import React from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  Loader2,
  RefreshCw,
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
import {
  SettingNumber,
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
  telemetryLogs: TelemetryRequestLog[];
  usageToday: number;
}

export const ProvidersApiSection: React.FC<ProvidersApiSectionProps> = ({
  draft,
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
}) => {
  const orderedProfiles = sortProvidersByPriority(localProfiles);

  return (
    <div className="space-y-3" data-testid="settings-section-providers">
      {/* Explicit Browser-Storage Security Warning for 3P Keys */}
      <div
        data-testid="providers-browser-key-warning"
        className="px-3.5 py-2.5 rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-300 text-xs flex items-start gap-2.5"
      >
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <div className="font-semibold">
            Security Notice: Browser-Stored API Keys
          </div>
          <p className="opacity-90 leading-relaxed">
            Google Gemini uses server-side <code>GEMINI_API_KEY</code> (never entered or stored in the browser). External keys for OpenAI, Anthropic Claude, or compatible endpoints are stored only in your browser and are not as secure as server secrets—use restricted keys only.
          </p>
        </div>
      </div>

      {/* 1. Saved Providers List (Click to Activate) */}
      <SettingsCard title={`Providers (${orderedProfiles.length})`}>
        <div className="space-y-2 pt-1">
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
                className={`rounded-xl border p-2.5 transition-colors ${
                  !isEnabled
                    ? 'border-[var(--border)] bg-[var(--bg)] opacity-60'
                    : isSelected
                    ? 'border-[var(--primary)] bg-[var(--primary-soft)]'
                    : 'border-[var(--border)] bg-[var(--bg)]'
                }`}
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
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
                      <div className="flex items-center gap-1.5 flex-wrap text-xs sm:text-[13px] font-semibold text-[var(--ink)]">
                        <span className="truncate">{prof.name}</span>
                        <span className="font-mono text-[11px] font-normal text-[var(--ink-dim)]">
                          · {prof.externalModel || DEFAULT_PROVIDER_MODELS[prof.provider] || 'Auto'}
                        </span>
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
                      </div>
                      {!isBuiltin && prof.externalKeys && (
                        <div className="text-[11px] text-[var(--text-3)] font-mono mt-0.5">
                          {maskApiKey(prof.externalKeys)}
                        </div>
                      )}
                    </div>
                  </button>

                  <div className="flex items-center gap-1 shrink-0">
                    {orderedProfiles.length > 1 && (
                      <>
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => onMovePriority(prof.id, 'up')}
                          className="p-1.5 rounded border border-[var(--border)] bg-[var(--surface)] text-[var(--text-2)] disabled:opacity-30 cursor-pointer"
                        >
                          <ArrowUp className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          disabled={idx === orderedProfiles.length - 1}
                          onClick={() => onMovePriority(prof.id, 'down')}
                          className="p-1.5 rounded border border-[var(--border)] bg-[var(--surface)] text-[var(--text-2)] disabled:opacity-30 cursor-pointer"
                        >
                          <ArrowDown className="w-3 h-3" />
                        </button>
                      </>
                    )}
                    {!isBuiltin && (
                      <button
                        type="button"
                        onClick={() => onTestProfile(prof)}
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
                      onClick={() => setEditingProfileId(isEditing ? null : prof.id)}
                      className="px-2.5 py-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-xs font-semibold text-[var(--text-2)] hover:text-[var(--text)] inline-flex items-center gap-1 cursor-pointer"
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
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {prof.decryptionFailed && (
                  <div
                    data-testid={`provider-decrypt-alert-${prof.id}`}
                    className="mt-2 px-2.5 py-1.5 rounded-lg border border-rose-500/40 bg-rose-500/10 text-[11.5px] text-rose-500 dark:text-rose-300 flex items-center justify-between gap-2"
                  >
                    <span>সেভ করা কী পড়া যাচ্ছে না, আবার কী দিন</span>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingProfileId(prof.id);
                        setRevealedKeyIds((prev) => ({ ...prev, [prof.id]: true }));
                      }}
                      className="px-2 py-0.5 rounded bg-rose-500/20 hover:bg-rose-500/30 font-semibold text-rose-600 dark:text-rose-200 cursor-pointer shrink-0"
                    >
                      আবার কী দিন
                    </button>
                  </div>
                )}

                {isEditing && (
                  <div className="mt-2.5 pt-2.5 border-t border-[var(--border)] space-y-2.5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input
                        type="text"
                        value={prof.name}
                        onChange={(e) =>
                          onUpdateProfileField(prof.id, { name: e.target.value })
                        }
                        placeholder="Profile Name"
                        className="cs-input w-full text-xs py-1.5"
                      />
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
                        className="cs-input w-full text-xs py-1.5"
                      >
                        {PROVIDER_CATALOG.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.label}
                          </option>
                        ))}
                      </select>
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
                          className="cs-input font-mono text-xs py-1.5"
                        >
                          {modelsForProf.map((m) => (
                            <option key={m} value={m}>
                              {m}
                            </option>
                          ))}
                          <option value="__custom__">Custom model ID…</option>
                        </select>
                      )}
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          value={prof.externalModel}
                          onChange={(e) =>
                            onUpdateProfileField(prof.id, { externalModel: e.target.value })
                          }
                          placeholder={DEFAULT_PROVIDER_MODELS[prof.provider] || 'mercury-3'}
                          className="cs-input font-mono text-xs flex-1 py-1.5"
                        />
                        {!isBuiltin && (
                          <button
                            type="button"
                            onClick={() => onRefreshProfileModels(prof)}
                            disabled={isRefreshing}
                            className="p-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] text-[var(--primary)] cursor-pointer"
                            title="Fetch Models"
                          >
                            {isRefreshing ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <RefreshCw className="w-3.5 h-3.5" />
                            )}
                          </button>
                        )}
                      </div>
                    </div>

                    {!isBuiltinProviderId(prof.provider) && (
                      <>
                        <div className="flex items-center gap-2">
                          <input
                            type={isKeyRevealed ? 'text' : 'password'}
                            value={prof.externalKeys}
                            onChange={(e) => {
                              const nextKey = e.target.value;
                              const trimmed = nextKey.trim();
                              if (
                                trimmed.startsWith('gsk_') &&
                                prof.provider !== 'groq' &&
                                prof.provider !== 'ollama' &&
                                prof.provider !== 'lmstudio'
                              ) {
                                onUpdateProfileField(prof.id, {
                                  provider: 'groq',
                                  externalKeys: nextKey,
                                  externalBaseUrl:
                                    DEFAULT_PROVIDER_BASE_URLS.groq ||
                                    'https://api.groq.com/openai/v1',
                                  externalModel:
                                    prof.externalModel &&
                                    /^(llama-|mixtral-|gemma|qwen|deepseek-r1-distill|openai\/gpt-oss-)/i.test(
                                      prof.externalModel
                                    )
                                      ? prof.externalModel
                                      : DEFAULT_PROVIDER_MODELS.groq ||
                                        'llama-3.3-70b-versatile',
                                });
                              } else {
                                onUpdateProfileField(prof.id, {
                                  externalKeys: nextKey,
                                });
                              }
                            }}
                            placeholder="API Key (sk-... / gsk_... / AIza...)"
                            className="cs-input font-mono flex-1 text-xs py-1.5"
                          />
                          <button
                            type="button"
                            aria-label={isKeyRevealed ? 'Hide API key' : 'Show API key'}
                            onClick={() =>
                              setRevealedKeyIds((prev) => ({
                                ...prev,
                                [prof.id]: !prev[prof.id],
                              }))
                            }
                            className="p-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-2)] cursor-pointer"
                          >
                            {isKeyRevealed ? (
                              <EyeOff className="w-3.5 h-3.5" />
                            ) : (
                              <Eye className="w-3.5 h-3.5" />
                            )}
                          </button>
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
                            className="w-full px-3 py-1.5 flex items-center justify-between text-xs font-medium text-[var(--text-2)] cursor-pointer"
                          >
                            <span>Base URL & Advanced</span>
                            <ChevronDown
                              className={`w-3.5 h-3.5 transition-transform ${
                                profileAdvancedOpen[prof.id] ? 'rotate-180' : ''
                              }`}
                            />
                          </button>
                          {profileAdvancedOpen[prof.id] && (
                            <div className="p-2.5 border-t border-[var(--border)] space-y-2">
                              <input
                                type="text"
                                value={prof.externalBaseUrl}
                                onChange={(e) =>
                                  onUpdateProfileField(prof.id, {
                                    externalBaseUrl: e.target.value,
                                  })
                                }
                                placeholder="Base URL"
                                className="cs-input w-full font-mono text-xs py-1.5"
                              />
                              <SettingsGrid>
                                <SettingNumber
                                  label="Context tokens"
                                  value={prof.contextWindow ?? 32768}
                                  min={1024}
                                  max={1000000}
                                  step={1024}
                                  onChange={(v) =>
                                    onUpdateProfileField(prof.id, { contextWindow: v })
                                  }
                                />
                                <SettingNumber
                                  label="Max output"
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
                                label="Stream (SSE)"
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

      {/* 2. Add Custom Provider */}
      <SettingsCard title="Add Custom Provider">
        <div className="space-y-2.5 pt-1">
          <div
            className="grid grid-cols-2 sm:grid-cols-5 gap-1.5"
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
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                    isSelected
                      ? 'border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]'
                      : 'border-[var(--border)] bg-[var(--bg)] text-[var(--text-2)] hover:text-[var(--text)]'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <select
              aria-label="Provider selector"
              data-testid="provider-select-dropdown"
              value={newProviderId}
              onChange={(e) => onChangeNewProviderId(e.target.value as ExternalProviderId)}
              className="cs-input w-full text-xs py-1.5"
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

            <div className="flex items-center gap-1.5">
              <input
                type="text"
                data-testid="provider-model-input"
                value={newModel}
                onChange={(e) => setNewModel(e.target.value)}
                placeholder={
                  newProviderId === 'mercury'
                    ? 'mercury-3'
                    : DEFAULT_PROVIDER_MODELS[newProviderId] || 'Model ID'
                }
                className="cs-input font-mono text-xs flex-1 py-1.5"
              />
              <button
                type="button"
                onClick={onFetchNewModels}
                disabled={isLoadingModels}
                title="Fetch Models"
                className="px-2.5 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] text-xs font-semibold text-[var(--primary)] inline-flex items-center gap-1 cursor-pointer shrink-0"
              >
                {isLoadingModels ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          </div>

          {candidateModelsForNew.length > 0 && (
            <select
              aria-label="Quick select model"
              data-testid="provider-model-dropdown"
              value={candidateModelsForNew.includes(newModel) ? newModel : ''}
              onChange={(e) => {
                if (e.target.value) setNewModel(e.target.value);
              }}
              className="cs-input w-full font-mono text-xs py-1.5"
            >
              <option value="" disabled>
                Select model…
              </option>
              {candidateModelsForNew.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          )}

          {discoveryWarning && (
            <div className="text-[11px] text-[var(--accent-amber)]">{discoveryWarning}</div>
          )}

          {newProviderId === 'gemini_custom' && (
            <div className="px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] text-xs text-[var(--ink-dim)]">
              Uses server <code>GEMINI_API_KEY</code> automatically when blank, or paste a personal <code>AIza...</code> key below for direct browser fallback.
            </div>
          )}
          {(!isKeylessProviderId(newProviderId) ||
            newProviderId === 'custom' ||
            newProviderId === 'gemini_custom') && (
            <div className="flex items-center gap-2">
              <input
                type={showNewKey ? 'text' : 'password'}
                data-testid="provider-api-key-input"
                value={newApiKey}
                onChange={(e) => onChangeNewApiKey(e.target.value)}
                placeholder={
                  newProviderId === 'gemini_custom'
                    ? 'Optional AIza... key (blank = server secret)'
                    : providerEntry(newProviderId)?.keyHint || 'API Key'
                }
                className="cs-input flex-1 font-mono text-xs py-1.5"
              />
              <button
                type="button"
                data-testid="provider-api-key-toggle"
                aria-label={showNewKey ? 'Hide API key' : 'Show API key'}
                onClick={() => setShowNewKey((v) => !v)}
                className="px-2.5 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] text-xs font-semibold text-[var(--text-2)] inline-flex items-center gap-1 cursor-pointer shrink-0"
              >
                {showNewKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          )}

          {detectedProviderFromNewKey &&
            detectedProviderFromNewKey !== newProviderId &&
            !(
              newProviderId === 'gemini_openai' &&
              detectedProviderFromNewKey === 'gemini_custom'
            ) && (
            <div className="flex items-center justify-between gap-2 text-[11px] text-[var(--text-2)]">
              <span>
                Detected:{' '}
                <strong>
                  {providerEntry(detectedProviderFromNewKey)?.label || detectedProviderFromNewKey}
                </strong>
              </span>
              <button
                type="button"
                onClick={() => onChangeNewProviderId(detectedProviderFromNewKey)}
                className="text-[var(--primary)] font-semibold hover:underline cursor-pointer"
              >
                Switch
              </button>
            </div>
          )}

          {newProviderId === 'custom' && (
            <input
              type="text"
              data-testid="provider-base-url-input"
              value={newBaseUrl}
              onChange={(e) => setNewBaseUrl(e.target.value)}
              placeholder="Base URL (e.g. https://api.openai.com/v1)"
              className="cs-input w-full font-mono text-xs py-1.5"
            />
          )}

          {/* Optional Advanced Collapsible */}
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)] overflow-hidden">
            <button
              type="button"
              data-testid="provider-advanced-toggle"
              aria-expanded={showAdvancedOptions}
              onClick={() => setShowAdvancedOptions((prev) => !prev)}
              className="w-full px-3 py-1.5 flex items-center justify-between text-xs font-medium text-[var(--text-2)] hover:text-[var(--text)] cursor-pointer"
            >
              <span>More Options (Name, Base URL, Headers)</span>
              <ChevronDown
                className={`w-3.5 h-3.5 transition-transform ${showAdvancedOptions ? 'rotate-180' : ''}`}
              />
            </button>
            {showAdvancedOptions && (
              <div
                data-testid="provider-advanced-panel"
                className="p-2.5 border-t border-[var(--border)] space-y-2"
              >
                <input
                  type="text"
                  value={newPropName}
                  onChange={(e) => setNewPropName(e.target.value)}
                  placeholder={`Name (e.g. My ${providerEntry(newProviderId)?.short || 'Custom'})`}
                  className="cs-input w-full text-xs py-1.5"
                />
                {!isBuiltinProviderId(newProviderId) && newProviderId !== 'custom' && (
                  <input
                    type="text"
                    data-testid="provider-base-url-input"
                    value={newBaseUrl}
                    onChange={(e) => setNewBaseUrl(e.target.value)}
                    placeholder={
                      DEFAULT_PROVIDER_BASE_URLS[newProviderId] || 'https://api.openai.com/v1'
                    }
                    className="cs-input w-full font-mono text-xs py-1.5"
                  />
                )}
                <input
                  type="text"
                  data-testid="provider-extra-headers-input"
                  value={newCustomHeaders}
                  onChange={(e) => setNewCustomHeaders(e.target.value)}
                  placeholder='Custom Headers JSON: {"HTTP-Referer": "..."}'
                  className="cs-input w-full font-mono text-xs py-1.5"
                />
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-medium text-[var(--text-2)]">
                      JSON Provider Gateway / Custom Params
                    </span>
                    <button
                      type="button"
                      data-testid="provider-json-preset-btn"
                      onClick={() => {
                        onChangeNewProviderId('custom');
                        setNewCustomParams(
                          JSON.stringify(
                            {
                              endpoint: 'https://api.openai.com/v1/chat/completions',
                              requestFormat: 'openai',
                              responsePath: 'choices[0].message.content',
                              stream: true,
                              models: [newModel || 'gpt-4o-mini'],
                            },
                            null,
                            2
                          )
                        );
                      }}
                      className="text-[11px] font-semibold text-[var(--primary)] hover:underline cursor-pointer"
                    >
                      Load JSON Gateway Preset
                    </button>
                  </div>
                  <textarea
                    rows={3}
                    data-testid="provider-custom-params-input"
                    value={newCustomParams}
                    onChange={(e) => setNewCustomParams(e.target.value)}
                    placeholder='Custom Params or JSON Provider Spec: {"endpoint": "...", "requestFormat": "openai", "responsePath": "choices[0].message.content"}'
                    className="cs-input w-full font-mono text-xs py-1.5 min-h-[68px]"
                  />
                </div>
                {(() => {
                  const errors: string[] = [];
                  const checkJsonObj = (raw: string, label: string) => {
                    const trimmed = raw.trim();
                    if (!trimmed) return;
                    try {
                      const parsed = JSON.parse(trimmed);
                      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
                        errors.push(`${label} অবশ্যই একটি বৈধ JSON অবজেক্ট ({...}) হতে হবে।`);
                      }
                    } catch (e) {
                      errors.push(
                        `${label} JSON ফরম্যাট সঠিক নয়: ${e instanceof Error ? e.message : 'Syntax error'}`
                      );
                    }
                  };
                  checkJsonObj(newCustomHeaders, 'Headers');
                  checkJsonObj(newCustomParams, 'JSON Provider / Params');
                  if (errors.length === 0) return null;
                  return (
                    <div
                      data-testid="provider-json-validation-error"
                      role="alert"
                      className="px-2.5 py-2 rounded-lg border border-rose-500/40 bg-rose-500/10 text-[11.5px] text-rose-500 dark:text-rose-300 space-y-0.5"
                    >
                      {errors.map((errMsg, idx) => (
                        <div key={idx}>{errMsg}</div>
                      ))}
                    </div>
                  );
                })()}
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

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onSaveWithoutVerification}
              disabled={isVerifyingNew}
              className="px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] text-xs font-semibold text-[var(--text)] cursor-pointer"
            >
              Save
            </button>
            <button
              type="button"
              onClick={onVerifyAndAddProvider}
              disabled={isVerifyingNew}
              className="px-3.5 py-1.5 rounded-lg bg-[var(--primary)] text-[var(--settings-on-accent)] text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
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
    </div>
  );
};
