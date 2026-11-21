import React, { useState } from 'react';
import { KeyRound, Lock, Monitor, Moon, Sun, UserCheck } from 'lucide-react';
import type { AppSettings } from '../../types';
import {
  loadSimpleEntryCredentials,
  saveSimpleEntryCredentials,
} from '../../utils/simpleEntryAuth';
import {
  SettingNumber,
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
  onOpenSimpleEntryModal?: () => void;
}

export const GeneralSection: React.FC<GeneralSectionProps> = ({
  draft,
  profileName,
  onNameChange,
  patch,
  notify,
  onOpenSimpleEntryModal,
}) => {
  const existingSimpleCreds = loadSimpleEntryCredentials();
  const [simplePassInput, setSimplePassInput] = useState('');

  const currentLang =
    draft.replyLang === 'auto' && draft.appLanguage !== 'bn' && draft.appLanguage !== 'en'
      ? 'auto'
      : draft.replyLang === 'auto'
      ? 'auto'
      : draft.appLanguage === 'en' || draft.replyLang === 'en'
      ? 'en'
      : 'bn';

  const handleSaveSimpleCredentials = () => {
    const cleanName = (profileName || draft.displayName || '').trim();
    if (!cleanName) {
      notify?.('অনুগ্রহ করে আগে আপনার নাম লিখুন');
      return;
    }
    if (!simplePassInput.trim()) {
      notify?.('পাসওয়ার্ড সেট বা আপডেট করতে পাসওয়ার্ড লিখুন');
      return;
    }
    const saved = saveSimpleEntryCredentials(cleanName, simplePassInput);
    patch({
      displayName: saved.name,
      nickname: saved.name,
      simpleEntryPasscode: saved.passwordHash,
    });
    setSimplePassInput('');
    notify?.(`✅ নাম (${saved.name}) ও পাসওয়ার্ড সফলভাবে সংরক্ষিত হয়েছে`);
  };

  return (
    <div className="space-y-3" data-testid="settings-section-general">
      <SettingsCard>
        {/* Profile / Display Name */}
        <div className="flex flex-wrap items-center justify-between gap-3 py-2.5 border-b border-[var(--border)]">
          <div>
            <span className="text-[13.5px] font-medium text-[var(--ink)] block">
              Display Name (আপনার নাম)
            </span>
            <span className="text-[11.5px] text-[var(--ink-dim)]">
              লগইন বা রেজিস্ট্রেশন ছাড়াই শুধু আপনার নাম ও পাসওয়ার্ড দিয়ে সব ফিচার ব্যবহার করুন
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

        {/* Simple Name + Password Quick Access */}
        <div
          className="py-3 border-b border-[var(--border)] space-y-2.5"
          data-testid="general-simple-entry-card"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="text-[13.5px] font-medium text-[var(--ink)] flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 text-[var(--primary)]" />
                <span>সহজ নাম ও পাসওয়ার্ড অ্যাক্সেস (No Registration Required)</span>
              </span>
              <span className="text-[11.5px] text-[var(--ink-dim)] block">
                ইমেইল বা ভেরিফিকেশন ছাড়াই আপনার নাম ও পাসওয়ার্ড দিয়ে প্রোফাইল সুরক্ষিত রাখুন
              </span>
            </div>
            {onOpenSimpleEntryModal && (
              <button
                type="button"
                data-testid="open-simple-entry-modal-btn"
                onClick={onOpenSimpleEntryModal}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-xs font-medium text-[var(--ink)] cursor-pointer transition-colors"
              >
                <UserCheck className="w-3.5 h-3.5 text-[var(--primary)]" />
                <span>নাম ও পাসওয়ার্ড প্যানেল</span>
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              type="password"
              data-testid="general-simple-password-input"
              value={simplePassInput}
              onChange={(e) => setSimplePassInput(e.target.value)}
              placeholder={
                existingSimpleCreds
                  ? 'নতুন পাসওয়ার্ড দিন (আপডেট করতে)...'
                  : 'একটি পাসওয়ার্ড সেট করুন...'
              }
              className="cs-input text-xs sm:text-[13px] py-1.5 px-2.5 flex-1 min-w-[180px] max-w-[260px]"
            />
            <button
              type="button"
              data-testid="general-simple-password-save-btn"
              onClick={handleSaveSimpleCredentials}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--primary)] text-white text-xs font-semibold hover:opacity-95 transition-opacity cursor-pointer"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>{existingSimpleCreds ? 'পাসওয়ার্ড আপডেট' : 'সেভ করুন'}</span>
            </button>
          </div>
        </div>

        {/* Require Name & Password on Startup Toggle */}
        <SettingToggle
          label="অ্যাপ চালুর শুরুতে নাম ও পাসওয়ার্ড চাইবে (Startup Lock)"
          description="চালু থাকলে অ্যাপ ওপেন করার সময় আপনার নাম ও পাসওয়ার্ড দিয়ে প্রবেশ করতে হবে"
          checked={Boolean(draft.simpleEntryRequireOnLoad)}
          testId="simple-entry-startup-toggle"
          onChange={(v) => patch({ simpleEntryRequireOnLoad: v })}
        />

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

        {/* Message Spacing / Density */}
        <SettingSegmented
          label="Chat Message Density"
          testId="message-spacing-selector"
          value={draft.messageSpacing ?? 'normal'}
          options={[
            { value: 'compact', label: 'Compact', testId: 'spacing-compact-btn' },
            { value: 'normal', label: 'Normal', testId: 'spacing-normal-btn' },
            { value: 'relaxed', label: 'Relaxed', testId: 'spacing-relaxed-btn' },
          ]}
          onChange={(v) =>
            patch({ messageSpacing: v as AppSettings['messageSpacing'] })
          }
        />

        {/* Auto-Open Side-by-Side Live Preview */}
        <SettingToggle
          label="Auto-Open Side-by-Side Live Preview (পাশাপাশি লাইভ প্রিভিউ)"
          description="HTML, CSS, JS বা React কোড তৈরি হলে স্বয়ংক্রিয়ভাবে ডানপাশে লাইভ প্রিভিউ প্যানেল খুলে দেখাবে"
          checked={draft.autoOpenLivePreview !== false}
          testId="auto-open-live-preview-toggle"
          onChange={(v) => patch({ autoOpenLivePreview: v })}
        />

        {/* Enter to Send */}
        <SettingToggle
          label="Enter চাপলে মেসেজ যাবে"
          checked={draft.sendOnEnter}
          testId="enter-to-send-toggle"
          onChange={(v) => patch({ sendOnEnter: v })}
        />

        <SettingToggle
          label="Allow web search"
          checked={draft.enabledTools?.web_search !== false && draft.enabledTools?.web_browse !== false}
          onChange={(allowed) => patch({
            enabledTools: { ...draft.enabledTools, web_search: allowed, web_browse: allowed },
          })}
        />
        <SettingNumber
          label="Daily message limit (0 = no limit)"
          value={draft.dailyMessageLimit ?? 0}
          min={0}
          max={10000}
          onChange={(dailyMessageLimit) => patch({ dailyMessageLimit })}
        />

        {/* Code Highlight & Artifact Preview */}
        <SettingToggle
          label="Code Syntax Highlight & Artifact Preview"
          description="কোড ব্লকে সিনট্যাক্স হাইলাইটিং এবং লাইভ প্রিভিউ ও .zip ডাউনলোড সক্রিয় রাখবে"
          checked={draft.codeHighlight !== false}
          testId="highlight-code-toggle"
          onChange={(v) => patch({ codeHighlight: v })}
        />
      </SettingsCard>
    </div>
  );
};

