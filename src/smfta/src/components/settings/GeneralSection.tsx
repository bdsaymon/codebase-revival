import React, { useState } from 'react';
import {
  Bell,
  Globe,
  MessageSquare,
  Monitor,
  Moon,
  Palette,
  Sun,
  Volume2,
} from 'lucide-react';
import type { AppSettings } from '../../types';
import {
  SettingSelect,
  SettingSegmented,
  SettingToggle,
  SettingsCard,
  SettingsGrid,
} from '../SettingsControls';

export interface GeneralSectionProps {
  draft: AppSettings;
  profileName: string;
  onNameChange: (name: string) => void;
  patch: (partial: Partial<AppSettings>) => void;
  notify?: (msg: string) => void;
}

const ACCENT_OPTIONS: Array<{ id: NonNullable<AppSettings['accent']>; label: string; color: string }> = [
  { id: 'indigo', label: 'Indigo', color: '#4f46e5' },
  { id: 'emerald', label: 'Emerald', color: '#10a37f' },
  { id: 'sky', label: 'Sky', color: '#0284c7' },
  { id: 'amber', label: 'Amber', color: '#d97706' },
  { id: 'rose', label: 'Rose', color: '#e11d48' },
  { id: 'teal', label: 'Teal', color: '#0d9488' },
  { id: 'custom', label: 'Custom', color: 'var(--accent)' },
];

function playTestNotificationChime(): void {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(660, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.14);
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.26);
  } catch {
    // ignore WebAudio restrictions
  }
}

export const GeneralSection: React.FC<GeneralSectionProps> = ({
  draft,
  profileName,
  onNameChange,
  patch,
  notify,
}) => {
  const [notifPerm, setNotifPerm] = useState<string>(() =>
    typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'
  );

  const handleRequestDesktopNotifications = async () => {
    if (typeof Notification === 'undefined') {
      setNotifPerm('unsupported');
      notify?.('Browser Notification API is not supported on this device.');
      return;
    }
    const perm = await Notification.requestPermission();
    setNotifPerm(perm);
    if (perm === 'granted') {
      patch({ notifEnabled: true });
      notify?.('Desktop/Mobile notifications enabled.');
    } else {
      patch({ notifEnabled: false });
      notify?.(`Notification permission: ${perm}`);
    }
  };

  return (
    <div className="space-y-4">
      {/* 1. Appearance */}
      <SettingsCard
        title="Appearance"
        description="Theme mode, accent color, chat density, typography, and accessibility."
        icon={<Palette className="w-4 h-4" />}
      >
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3 py-1">
            <div className="text-xs sm:text-sm font-semibold text-[var(--text)]">
              Theme Mode
            </div>
            <div className="cs-seg" data-testid="theme-selector">
              <button
                type="button"
                data-testid="theme-dark-btn"
                onClick={() => patch({ themeMode: 'dark', theme: 'dark' })}
                className={`cs-seg-btn ${
                  draft.themeMode !== 'system' && draft.theme === 'dark' ? 'is-active' : ''
                }`}
              >
                <Moon className="w-3.5 h-3.5 inline mr-1" />
                Dark
              </button>
              <button
                type="button"
                data-testid="theme-light-btn"
                onClick={() => patch({ themeMode: 'light', theme: 'light' })}
                className={`cs-seg-btn ${
                  draft.themeMode !== 'system' && draft.theme === 'light' ? 'is-active' : ''
                }`}
              >
                <Sun className="w-3.5 h-3.5 inline mr-1" />
                Light
              </button>
              <button
                type="button"
                data-testid="theme-system-btn"
                onClick={() => {
                  const prefersDark =
                    typeof window !== 'undefined' &&
                    window.matchMedia?.('(prefers-color-scheme: dark)').matches;
                  patch({ themeMode: 'system', theme: prefersDark ? 'dark' : 'light' });
                }}
                className={`cs-seg-btn ${draft.themeMode === 'system' ? 'is-active' : ''}`}
              >
                <Monitor className="w-3.5 h-3.5 inline mr-1" />
                System
              </button>
            </div>
          </div>

          <div className="pt-2 border-t border-[var(--border)]">
            <div className="flex items-center justify-between gap-3 mb-2">
              <span className="text-xs font-semibold text-[var(--text)]">Accent Color</span>
              {draft.accent === 'custom' && (
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    aria-label="Custom accent color picker"
                    value={draft.accentCustom || '#6366f1'}
                    onChange={(e) => patch({ accent: 'custom', accentCustom: e.target.value })}
                    className="w-7 h-7 rounded border border-[var(--border)] cursor-pointer bg-transparent"
                  />
                  <span className="font-mono text-xs text-[var(--text-3)]">
                    {draft.accentCustom || '#6366f1'}
                  </span>
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {ACCENT_OPTIONS.map((opt) => {
                const active = draft.accent === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => patch({ accent: opt.id })}
                    className={`px-2.5 py-1.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
                      active
                        ? 'border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--text)]'
                        : 'border-[var(--border)] bg-[var(--bg)] text-[var(--text-2)] hover:text-[var(--text)]'
                    }`}
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{
                        backgroundColor:
                          opt.id === 'custom' ? draft.accentCustom || '#6366f1' : opt.color,
                      }}
                    />
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          <SettingsGrid>
            <SettingSelect
              label="Chat Layout Width"
              value={draft.layoutWidth ?? 'standard'}
              options={[
                { value: 'standard', label: 'Standard (768px)' },
                { value: 'wide', label: 'Wide (1024px)' },
                { value: 'full', label: 'Full Workspace' },
              ]}
              onChange={(v) => patch({ layoutWidth: v as AppSettings['layoutWidth'] })}
            />
            <SettingSelect
              label="Interface Density"
              value={draft.density ?? 'cozy'}
              options={[
                { value: 'compact', label: 'Compact' },
                { value: 'cozy', label: 'Cozy' },
                { value: 'spacious', label: 'Spacious' },
              ]}
              onChange={(v) => patch({ density: v as AppSettings['density'] })}
            />
            <SettingSelect
              label="Bubble Style"
              value={draft.bubbleStyle ?? 'rounded'}
              options={[
                { value: 'rounded', label: 'Rounded Cards' },
                { value: 'sharp', label: 'Sharp Linear' },
                { value: 'minimal', label: 'Minimal Flat' },
              ]}
              onChange={(v) => patch({ bubbleStyle: v as AppSettings['bubbleStyle'] })}
            />
            <SettingSelect
              label="Message Spacing"
              value={draft.messageSpacing ?? 'normal'}
              options={[
                { value: 'compact', label: 'Compact' },
                { value: 'normal', label: 'Normal' },
                { value: 'relaxed', label: 'Relaxed' },
              ]}
              onChange={(v) => patch({ messageSpacing: v as AppSettings['messageSpacing'] })}
            />
            <SettingSelect
              label="Body Font Size"
              value={draft.fontsize}
              options={[
                { value: 'small', label: 'Small' },
                { value: 'normal', label: 'Normal' },
                { value: 'large', label: 'Large' },
              ]}
              onChange={(v) => patch({ fontsize: v as AppSettings['fontsize'] })}
            />
            <SettingSelect
              label="Font Family"
              value={draft.fontFamily ?? 'geist'}
              options={[
                { value: 'geist', label: 'Geist Sans' },
                { value: 'inter', label: 'Inter' },
                { value: 'system', label: 'System UI' },
                { value: 'mono', label: 'Monospace' },
              ]}
              onChange={(v) => patch({ fontFamily: v as AppSettings['fontFamily'] })}
            />
            <SettingSelect
              label="Code Font Size"
              value={draft.codeFontSize ?? 'normal'}
              options={[
                { value: 'small', label: 'Small' },
                { value: 'normal', label: 'Normal' },
                { value: 'large', label: 'Large' },
              ]}
              onChange={(v) => patch({ codeFontSize: v as AppSettings['codeFontSize'] })}
            />
            <SettingSelect
              label="Code Block Theme"
              value={draft.codeBlockTheme ?? 'dark'}
              options={[
                { value: 'dark', label: 'Midnight Dark' },
                { value: 'high-contrast', label: 'High Contrast' },
                { value: 'minimal', label: 'Minimal Surface' },
              ]}
              onChange={(v) => patch({ codeBlockTheme: v as AppSettings['codeBlockTheme'] })}
            />
          </SettingsGrid>

          <div className="pt-2 border-t border-[var(--border)]">
            <SettingToggle
              label="High Contrast Borders"
              description="Strengthen text and surface border contrast across the workspace."
              checked={draft.highContrast === true}
              onChange={(v) => patch({ highContrast: v })}
            />
            <SettingToggle
              label="Strong Focus Rings"
              description="Highlight focused buttons and inputs for keyboard navigation."
              checked={draft.focusRingVisible !== false}
              onChange={(v) => patch({ focusRingVisible: v })}
            />
            <SettingToggle
              label="Large Touch Targets"
              description="Increase minimum interactive control sizes for touch devices."
              checked={draft.largeTouchTargets === true}
              onChange={(v) => patch({ largeTouchTargets: v })}
            />
            <SettingToggle
              label="Reduce Motion"
              description="Disable decorative transitions and animations."
              checked={draft.reducedMotion === true}
              onChange={(v) => patch({ reducedMotion: v })}
            />
          </div>
        </div>
      </SettingsCard>

      {/* 2. Language */}
      <SettingsCard
        title="Language & Direction"
        description="Configure application UI language, AI response language, and RTL / LTR layout direction."
        icon={<Globe className="w-4 h-4" />}
      >
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3 py-1">
            <div className="text-xs sm:text-sm font-semibold text-[var(--text)]">
              App Language
            </div>
            <div className="cs-seg" data-testid="language-selector">
              <button
                type="button"
                data-testid="lang-bn-btn"
                onClick={() => patch({ appLanguage: 'bn', replyLang: 'bn' })}
                className={`cs-seg-btn ${(draft.appLanguage || 'bn') === 'bn' ? 'is-active' : ''}`}
              >
                বাংলা
              </button>
              <button
                type="button"
                data-testid="lang-en-btn"
                onClick={() => patch({ appLanguage: 'en', replyLang: 'en' })}
                className={`cs-seg-btn ${draft.appLanguage === 'en' ? 'is-active' : ''}`}
              >
                English
              </button>
              <button
                type="button"
                data-testid="lang-hi-btn"
                onClick={() => patch({ appLanguage: 'hi' })}
                className={`cs-seg-btn ${draft.appLanguage === 'hi' ? 'is-active' : ''}`}
              >
                हिन्दी
              </button>
            </div>
          </div>

          <SettingSegmented
            label="Layout Reading Direction (RTL / LTR)"
            testId="direction-selector"
            value={draft.dir ?? 'auto'}
            options={[
              { value: 'auto', label: 'Auto', testId: 'dir-auto-btn' },
              { value: 'ltr', label: 'LTR (Left-to-Right)', testId: 'dir-ltr-btn' },
              { value: 'rtl', label: 'RTL (Right-to-Left)', testId: 'dir-rtl-btn' },
            ]}
            onChange={(v) => patch({ dir: v as AppSettings['dir'] })}
          />

          <SettingsGrid>
            <SettingSelect
              label="Default AI Response Language"
              value={draft.replyLang}
              options={[
                { value: 'auto', label: 'Auto (Mirror Prompt)' },
                { value: 'bn', label: 'বাংলা (Bengali)' },
                { value: 'en', label: 'English' },
              ]}
              onChange={(v) => patch({ replyLang: v as AppSettings['replyLang'] })}
            />
            <label className="settings-control">
              <span>Your Display Name</span>
              <input
                type="text"
                value={profileName}
                maxLength={80}
                placeholder="e.g. SAYMON HASAN"
                onChange={(e) => onNameChange(e.target.value)}
                className="cs-input text-xs"
              />
            </label>
          </SettingsGrid>
        </div>
      </SettingsCard>

      {/* 3. Chat Preferences */}
      <SettingsCard
        title="Chat Preferences"
        description="Composer submission behavior, auto-scroll, streaming reveal, and new chat mode."
        icon={<MessageSquare className="w-4 h-4" />}
      >
        <SettingsGrid>
          <SettingSelect
            label="Default New Chat Behavior"
            value={draft.newChatDefaultMode ?? 'last'}
            options={[
              { value: 'last', label: 'Remember Last Used Mode' },
              { value: 'fast', label: 'Always Start in Fast' },
              { value: 'balanced', label: 'Always Start in Balanced' },
              { value: 'power', label: 'Always Start in Power' },
            ]}
            onChange={(v) =>
              patch({ newChatDefaultMode: v as AppSettings['newChatDefaultMode'] })
            }
          />
          <SettingSelect
            label="Display Formatting"
            value={draft.smartFormatting !== false ? 'smart' : 'plain'}
            options={[
              { value: 'smart', label: 'Smart Markdown + Tables' },
              { value: 'plain', label: 'Minimal Formatting' },
            ]}
            onChange={(v) => patch({ smartFormatting: v === 'smart' })}
          />
        </SettingsGrid>

        <SettingToggle
          label="Enter to Send"
          description="Press Enter to send message (Shift+Enter inserts a newline)."
          checked={draft.sendOnEnter}
          onChange={(v) => patch({ sendOnEnter: v })}
        />
        <SettingToggle
          label="Auto Scroll"
          description="Automatically keep latest streamed tokens visible."
          checked={draft.autoScroll !== false}
          onChange={(v) => patch({ autoScroll: v })}
        />
        <SettingToggle
          label="Streaming Response Reveal"
          description="Render tokens progressively in real time as chunks arrive."
          checked={draft.streamingReveal !== false}
          onChange={(v) => patch({ streamingReveal: v })}
        />
        <SettingToggle
          label="Auto Save Chats"
          description="Persist conversations on this device (disabled automatically during Privacy Mode)."
          checked={draft.autoSaveChat !== false}
          onChange={(v) => patch({ autoSaveChat: v })}
        />
        <SettingToggle
          label="Show Timestamps & Token Metrics"
          checked={draft.showTimestamps !== false || draft.showTokenUsage === true}
          onChange={(v) => patch({ showTimestamps: v, showTokenUsage: v })}
        />
      </SettingsCard>

      {/* 4. Notifications */}
      <SettingsCard
        title="Notifications"
        description="Browser alerts and subtle WebAudio feedback when tasks finish or fail."
        icon={<Bell className="w-4 h-4" />}
        rightSlot={
          <button
            type="button"
            onClick={handleRequestDesktopNotifications}
            className="px-2.5 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] text-xs font-semibold text-[var(--text)] hover:border-[var(--primary-border)] cursor-pointer"
          >
            {notifPerm === 'granted' ? 'Permission Granted' : 'Enable Browser Alerts'}
          </button>
        }
      >
        <SettingToggle
          label="Desktop & Mobile Notifications"
          description={`Browser permission status: ${notifPerm}`}
          checked={draft.notifEnabled === true}
          onChange={(v) => patch({ notifEnabled: v })}
        />
        <div className="flex items-center justify-between gap-3 py-2 border-b border-[var(--border)]">
          <div className="min-w-0">
            <div className="text-xs sm:text-sm font-semibold text-[var(--text)]">
              Notification Sound
            </div>
            <div className="text-[11px] text-[var(--text-3)]">
              Play a subtle chime on task completion.
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={playTestNotificationChime}
              className="px-2.5 py-1 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-xs font-medium text-[var(--text-2)] hover:text-[var(--text)] inline-flex items-center gap-1 cursor-pointer"
            >
              <Volume2 className="w-3.5 h-3.5" />
              Test Chime
            </button>
            <button
              type="button"
              role="switch"
              aria-checked={draft.notifSound === true}
              aria-label="Notification Sound"
              onClick={() => patch({ notifSound: !draft.notifSound })}
              className={`relative inline-flex h-6 w-11 p-0 shrink-0 cursor-pointer items-center rounded-full border transition-colors ${
                draft.notifSound
                  ? 'bg-[var(--primary)] border-[var(--primary)]'
                  : 'bg-[var(--surface-2)] border-[var(--border)]'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-[var(--settings-on-accent)] shadow-xs transition-transform ${
                  draft.notifSound ? 'translate-x-5' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>
        <SettingToggle
          label="Notify on Long Task Completion"
          checked={draft.notifTaskDone !== false}
          onChange={(v) => patch({ notifTaskDone: v })}
        />
        <SettingToggle
          label="Notify on Provider / Network Errors"
          checked={draft.notifErrors !== false}
          onChange={(v) => patch({ notifErrors: v })}
        />
        <SettingToggle
          label="Notify on Daily Usage Cap"
          checked={draft.notifUsageLimit !== false}
          onChange={(v) => patch({ notifUsageLimit: v })}
        />
      </SettingsCard>
    </div>
  );
};
