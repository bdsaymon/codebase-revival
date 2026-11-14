import React from 'react';
import type { AppSettings, SavedProviderProfile } from '../../types';
import { getAllVerifiedModelChoices } from '../../utils/providers';
import { SettingToggle, SettingsCard } from '../SettingsControls';

export interface ModelsSectionProps {
  draft: AppSettings;
  savedProfiles: SavedProviderProfile[];
  activeProfile: SavedProviderProfile;
  onActivateProfile?: (profile: SavedProviderProfile) => void;
  onUpdateProfileModel?: (profileId: string, modelId: string) => void;
  patch: (partial: Partial<AppSettings>) => void;
}

export const ModelsSection: React.FC<ModelsSectionProps> = ({
  draft,
  savedProfiles,
  activeProfile,
  onActivateProfile,
  onUpdateProfileModel,
  patch,
}) => {
  const verifiedModels = getAllVerifiedModelChoices(savedProfiles);
  const thinkingEnabled =
    draft.thinkingEnabled !== undefined
      ? draft.thinkingEnabled
      : draft.thinkingMode !== 'off';
  const currentEffort: 'low' | 'medium' | 'high' =
    draft.thinkingMode === 'low' ||
    draft.thinkingMode === 'medium' ||
    draft.thinkingMode === 'high'
      ? draft.thinkingMode
      : 'medium';
  const currentLength: 'short' | 'medium' | 'detailed' =
    draft.responseLength ??
    (draft.style === 'concise' ? 'short' : 'detailed');

  const currentSelectValue = `${activeProfile.id}::${
    activeProfile.externalModel || draft.externalModel || 'smfta-flash'
  }`;

  const handleModelSelectionChange = (encoded: string) => {
    const [profId, modId] = encoded.split('::');
    const targetProf = savedProfiles.find((p) => p.id === profId);
    if (targetProf && modId) {
      onUpdateProfileModel?.(targetProf.id, modId);
      onActivateProfile?.({ ...targetProf, externalModel: modId });
      patch({
        activeProfileId: targetProf.id,
        provider: targetProf.provider,
        externalModel: modId,
      });
    }
  };

  return (
    <div className="space-y-3" data-testid="settings-section-models">
      <SettingsCard>
        {/* Active Model */}
        <div className="flex flex-wrap items-center justify-between gap-3 py-2.5 border-b border-[var(--border)]">
          <span className="text-[13.5px] font-medium text-[var(--ink)]">
            Active Model
          </span>
          <select
            data-testid="current-model-selector"
            aria-label="বর্তমান মডেল সিলেক্টর"
            value={currentSelectValue}
            onChange={(e) => handleModelSelectionChange(e.target.value)}
            className="cs-input font-mono text-xs sm:text-[13px] py-1.5 px-2.5 max-w-[260px]"
          >
            {verifiedModels.map((opt) => {
              const val = `${opt.profileId}::${opt.modelId}`;
              return (
                <option key={val} value={val}>
                  {opt.profileName} · {opt.modelId}
                </option>
              );
            })}
          </select>
        </div>

        {/* Thinking Toggle */}
        <SettingToggle
          label="Thinking"
          checked={thinkingEnabled}
          testId="thinking-enabled-toggle"
          onChange={(enabled) =>
            patch({
              thinkingEnabled: enabled,
              thinkingMode: enabled ? currentEffort : 'off',
            })
          }
        />

        {/* Thinking Level */}
        <div className="flex flex-wrap items-center justify-between gap-3 py-2.5 border-b border-[var(--border)]">
          <span className="text-[13.5px] font-medium text-[var(--ink)]">
            Thinking Level
          </span>
          <div className="cs-seg" data-testid="thinking-effort-selector">
            {(['low', 'medium', 'high'] as const).map((level) => (
              <button
                key={level}
                type="button"
                disabled={!thinkingEnabled}
                data-testid={`thinking-effort-${level}`}
                onClick={() =>
                  patch({
                    thinkingEnabled: true,
                    thinkingMode: level,
                  })
                }
                className={`cs-seg-btn capitalize ${
                  thinkingEnabled && currentEffort === level
                    ? 'is-active'
                    : ''
                } disabled:opacity-40`}
              >
                {level === 'low'
                  ? 'Low'
                  : level === 'medium'
                  ? 'Medium'
                  : 'High'}
              </button>
            ))}
          </div>
        </div>

        {/* Live Thinking */}
        <SettingToggle
          label="Live Thinking"
          checked={draft.liveThinkingSummary !== false}
          testId="live-thinking-toggle"
          onChange={(v) => patch({ liveThinkingSummary: v })}
        />

        {/* Response Length */}
        <div className="flex flex-wrap items-center justify-between gap-3 py-2.5">
          <span className="text-[13.5px] font-medium text-[var(--ink)]">
            Response Length
          </span>
          <div className="cs-seg" data-testid="response-length-selector">
            <button
              type="button"
              data-testid="response-length-short"
              onClick={() =>
                patch({ responseLength: 'short', style: 'concise' })
              }
              className={`cs-seg-btn ${
                currentLength === 'short' ? 'is-active' : ''
              }`}
            >
              ছোট
            </button>
            <button
              type="button"
              data-testid="response-length-medium"
              onClick={() =>
                patch({ responseLength: 'medium', style: 'detailed' })
              }
              className={`cs-seg-btn ${
                currentLength === 'medium' ? 'is-active' : ''
              }`}
            >
              মাঝারি
            </button>
            <button
              type="button"
              data-testid="response-length-detailed"
              onClick={() =>
                patch({ responseLength: 'detailed', style: 'detailed' })
              }
              className={`cs-seg-btn ${
                currentLength === 'detailed' ? 'is-active' : ''
              }`}
            >
              বিস্তারিত
            </button>
          </div>
        </div>
      </SettingsCard>
    </div>
  );
};
