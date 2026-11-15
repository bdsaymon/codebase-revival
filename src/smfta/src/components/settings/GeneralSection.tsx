import React from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import type { AppSettings } from '../../types';
import {
  SettingSegmented,
  SettingToggle,
  SettingsCard,
} from '../SettingsControls';

export interface GeneralSectionProps {
  draft: AppSettings;
  profileName: string;
  onNameChange: (name: string) => void;
  patch: (partial: Partial<AppSettings>) => void;
  notify?: (msg: string) => void;
}

export const GeneralSection: React.FC<GeneralSectionProps> = ({
  draft,
  profileName,
  onNameChange,
  patch,
}) => {
  const currentLang =
    draft.replyLang === 'auto' && draft.appLanguage !== 'bn' && draft.appLanguage !== 'en'
      ? 'auto'
      : draft.replyLang === 'auto'
      ? 'auto'
      : draft.appLanguage === 'en' || draft.replyLang === 'en'
      ? 'en'
      : 'bn';

  return (
    <div className="space-y-3" data-testid="settings-section-general">
      <SettingsCard>
        {/* Profile / Display Name */}
        <div className="flex flex-wrap items-center justify-between gap-3 py-2.5 border-b border-[var(--border)]">
          <div>
            <span className="text-[13.5px] font-medium text-[var(--ink)] block">
              Display Name
            </span>
            <span className="text-[11.5px] text-[var(--ink-dim)]">
              AI আপনাকে যে নামে সম্বোধন করবে (Claude Profile Name)
            </span>
          </div>
          <input
            type="text"
            data-testid="general-profile-name-input"
            value={profileName || draft.displayName || ''}
            onChange={(e) => {
              const val = e.target.value;
              onNameChange(val);
              patch({ displayName: val, nickname: val });
            }}
            placeholder="আপনার নাম লিখুন..."
            className="cs-input text-xs sm:text-[13px] py-1.5 px-2.5 max-w-[220px]"
          />
        </div>

        {/* Theme */}
        <div className="flex flex-wrap items-center justify-between gap-3 py-2.5 border-b border-[var(--border)]">
          <span className="text-[13.5px] font-medium text-[var(--ink)]">
            Theme
          </span>
          <div className="cs-seg" data-testid="theme-selector">
            <button
              type="button"
              data-testid="theme-light-btn"
              onClick={() => patch({ themeMode: 'light', theme: 'light' })}
              className={`cs-seg-btn ${
                draft.themeMode !== 'system' && draft.theme === 'light'
                  ? 'is-active'
                  : ''
              }`}
            >
              <Sun className="w-3.5 h-3.5 inline mr-1" />
              Light
            </button>
            <button
              type="button"
              data-testid="theme-dark-btn"
              onClick={() => patch({ themeMode: 'dark', theme: 'dark' })}
              className={`cs-seg-btn ${
                draft.themeMode !== 'system' && draft.theme === 'dark'
                  ? 'is-active'
                  : ''
              }`}
            >
              <Moon className="w-3.5 h-3.5 inline mr-1" />
              Dark
            </button>
            <button
              type="button"
              data-testid="theme-system-btn"
              onClick={() => {
                const prefersDark =
                  typeof window !== 'undefined' &&
                  window.matchMedia?.('(prefers-color-scheme: dark)').matches;
                patch({
                  themeMode: 'system',
                  theme: prefersDark ? 'dark' : 'light',
                });
              }}
              className={`cs-seg-btn ${
                draft.themeMode === 'system' ? 'is-active' : ''
              }`}
            >
              <Monitor className="w-3.5 h-3.5 inline mr-1" />
              System
            </button>
          </div>
        </div>

        {/* Font Size */}
        <div className="flex flex-wrap items-center justify-between gap-3 py-2.5 border-b border-[var(--border)]">
          <span className="text-[13.5px] font-medium text-[var(--ink)]">
            Font Size
          </span>
          <div className="cs-seg" data-testid="fontsize-selector">
            <button
              type="button"
              data-testid="fontsize-small-btn"
              onClick={() => patch({ fontsize: 'small' })}
              className={`cs-seg-btn ${
                draft.fontsize === 'small' ? 'is-active' : ''
              }`}
            >
              ছোট
            </button>
            <button
              type="button"
              data-testid="fontsize-normal-btn"
              onClick={() => patch({ fontsize: 'normal' })}
              className={`cs-seg-btn ${
                draft.fontsize === 'normal' ? 'is-active' : ''
              }`}
            >
              মাঝারি
            </button>
            <button
              type="button"
              data-testid="fontsize-large-btn"
              onClick={() => patch({ fontsize: 'large' })}
              className={`cs-seg-btn ${
                draft.fontsize === 'large' ? 'is-active' : ''
              }`}
            >
              বড়
            </button>
          </div>
        </div>

        {/* Language */}
        <div className="flex flex-wrap items-center justify-between gap-3 py-2.5 border-b border-[var(--border)]">
          <span className="text-[13.5px] font-medium text-[var(--ink)]">
            Language
          </span>
          <div className="cs-seg" data-testid="language-selector">
            <button
              type="button"
              data-testid="lang-auto-btn"
              onClick={() => patch({ replyLang: 'auto' })}
              className={`cs-seg-btn ${
                currentLang === 'auto' ? 'is-active' : ''
              }`}
            >
              Auto
            </button>
            <button
              type="button"
              data-testid="lang-bn-btn"
              onClick={() => patch({ appLanguage: 'bn', replyLang: 'bn' })}
              className={`cs-seg-btn ${
                currentLang === 'bn' ? 'is-active' : ''
              }`}
            >
              বাংলা
            </button>
            <button
              type="button"
              data-testid="lang-en-btn"
              onClick={() => patch({ appLanguage: 'en', replyLang: 'en' })}
              className={`cs-seg-btn ${
                currentLang === 'en' ? 'is-active' : ''
              }`}
            >
              English
            </button>
          </div>
        </div>

        {/* Text Direction */}
        <SettingSegmented
          label="Direction"
          testId="direction-selector"
          value={draft.dir ?? 'auto'}
          options={[
            { value: 'auto', label: 'Auto', testId: 'dir-auto-btn' },
            { value: 'ltr', label: 'LTR', testId: 'dir-ltr-btn' },
            { value: 'rtl', label: 'RTL', testId: 'dir-rtl-btn' },
          ]}
          onChange={(v) => patch({ dir: v as AppSettings['dir'] })}
        />

        {/* Enter to Send */}
        <SettingToggle
          label="Enter চাপলে মেসেজ যাবে"
          checked={draft.sendOnEnter}
          testId="enter-to-send-toggle"
          onChange={(v) => patch({ sendOnEnter: v })}
        />

        {/* Code Highlight & Artifact Preview */}
        <SettingToggle
          label="Code Syntax Highlight & Artifact Preview"
          description="কোড ব্লকে সিনট্যাক্স হাইলাইটিং এবং লাইভ প্রিভিউ ও .zip ডাউনলোড সক্রিয় রাখবে"
          checked={draft.highlightCode !== false}
          testId="highlight-code-toggle"
          onChange={(v) => patch({ highlightCode: v })}
        />
      </SettingsCard>
    </div>
  );
};

