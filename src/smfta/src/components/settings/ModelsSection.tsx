import React from 'react';
import { Brain, Cpu, Sparkles } from 'lucide-react';
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
    <div className="space-y-4" data-testid="settings-section-models">
      {/* ১. বর্তমান মডেল সিলেক্টর */}
      <SettingsCard
        title="বর্তমান মডেল সিলেক্টর"
        description="চ্যাটের জন্য আপনার পছন্দের সক্রিয় AI মডেল নির্বাচন করুন।"
        icon={<Cpu className="w-4 h-4" />}
      >
        <label className="settings-control">
          <span>সক্রিয় মডেল (Current Model)</span>
          <select
            data-testid="current-model-selector"
            aria-label="বর্তমান মডেল সিলেক্টর"
            value={currentSelectValue}
            onChange={(e) => handleModelSelectionChange(e.target.value)}
            className="cs-input font-mono text-xs sm:text-sm"
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
        </label>
      </SettingsCard>

      {/* ২. থিংকিং ও উত্তরের দৈর্ঘ্য */}
      <SettingsCard
        title="থিংকিং ও উত্তরের সেটিংস"
        description="Claude-স্টাইল লাইভ থিংকিং, থিংকিংয়ের পরিমাণ এবং উত্তরের দৈর্ঘ্য নিয়ন্ত্রণ করুন।"
        icon={<Brain className="w-4 h-4" />}
      >
        <div className="space-y-3">
          {/* টগল: Thinking চালু */}
          <SettingToggle
            label="Thinking চালু"
            description="যেসব মডেলে নিজস্ব থিংকিং বা রিজনিং সুবিধা আছে সেগুলোতে উত্তর দেওয়ার আগে গভীরভাবে চিন্তা করবে।"
            checked={thinkingEnabled}
            testId="thinking-enabled-toggle"
            onChange={(enabled) =>
              patch({
                thinkingEnabled: enabled,
                thinkingMode: enabled ? currentEffort : 'off',
              })
            }
          />

          {/* Thinking পরিমাণ: Low / Medium / High */}
          <div className="flex flex-wrap items-center justify-between gap-3 py-2 border-t border-[var(--border)]">
            <div>
              <div className="text-xs sm:text-sm font-semibold text-[var(--text)]">
                Thinking পরিমাণ
              </div>
              <div className="text-[11px] text-[var(--text-3)]">
                মডেল কতটা গভীরভাবে চিন্তা করবে (Low / Medium / High)
              </div>
            </div>
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

          {/* টগল: থিংকিং লাইভ দেখাও */}
          <div className="pt-1 border-t border-[var(--border)]">
            <SettingToggle
              label="থিংকিং লাইভ দেখাও"
              description="চালু থাকলে ভাবনার সারাংশ লাইভ স্ট্রিম হবে; বন্ধ থাকলে শুধু অ্যানিমেশন ও সময় দেখাবে।"
              checked={draft.liveThinkingSummary !== false}
              testId="live-thinking-toggle"
              onChange={(v) => patch({ liveThinkingSummary: v })}
            />
          </div>

          {/* উত্তরের দৈর্ঘ্য: ছোট / মাঝারি / বিস্তারিত */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[var(--border)]">
            <div className="flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-[var(--primary)]" />
              <div>
                <div className="text-xs sm:text-sm font-semibold text-[var(--text)]">
                  উত্তরের দৈর্ঘ্য
                </div>
                <div className="text-[11px] text-[var(--text-3)]">
                  উত্তর কতটা সংক্ষিপ্ত বা বিস্তারিত হবে (ছোট / মাঝারি / বিস্তারিত)
                </div>
              </div>
            </div>
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
        </div>
      </SettingsCard>
    </div>
  );
};
