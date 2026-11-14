import React from 'react';
import { FileText, Sparkles, User } from 'lucide-react';
import type { AppSettings, ResponseStylePreset } from '../../types';
import { SettingsCard } from '../SettingsControls';

export interface InstructionsSectionProps {
  draft: AppSettings;
  profileName: string;
  onNameChange: (name: string) => void;
  patch: (partial: Partial<AppSettings>) => void;
}

const STYLE_OPTIONS: Array<{
  id: ResponseStylePreset;
  label: string;
  desc: string;
}> = [
  {
    id: 'normal',
    label: 'Normal',
    desc: 'স্বাভাবিক, পরিষ্কার ও ভারসাম্যপূর্ণ উত্তর',
  },
  {
    id: 'concise',
    label: 'Concise (ছোট)',
    desc: 'সংক্ষিপ্ত এবং সরাসরি মূল কথায় উত্তর',
  },
  {
    id: 'explanatory',
    label: 'Explanatory (বিস্তারিত)',
    desc: 'ধাপে ধাপে উদাহরণসহ সহজ ব্যাখ্যা',
  },
  {
    id: 'formal',
    label: 'Formal (আনুষ্ঠানিক)',
    desc: 'পেশাদার, মার্জিত ও আনুষ্ঠানিক ভাষা',
  },
  {
    id: 'custom',
    label: 'Custom',
    desc: 'আপনার নিজস্ব লেখার নমুনা ও ধরণ অনুযায়ী উত্তর',
  },
];

export const InstructionsSection: React.FC<InstructionsSectionProps> = ({
  draft,
  profileName,
  onNameChange,
  patch,
}) => {
  const nicknameValue = draft.nickname ?? profileName ?? '';
  const globalInstructionsValue =
    draft.globalInstructions ?? draft.customInst ?? '';
  const currentStyle: ResponseStylePreset = draft.responseStyle ?? 'normal';
  const charCount = globalInstructionsValue.length;

  return (
    <div className="space-y-4" data-testid="settings-section-instructions">
      {/* ১. আপনাকে কী নামে ডাকব */}
      <SettingsCard
        title="আপনাকে কী নামে ডাকব"
        description="চ্যাটে AI আপনাকে এই নামে সম্বোধন করবে।"
        icon={<User className="w-4 h-4" />}
      >
        <label className="settings-control">
          <span>ডাকনাম (Nickname)</span>
          <input
            type="text"
            data-testid="instructions-nickname-input"
            value={nicknameValue}
            maxLength={80}
            placeholder="যেমন: রাহাত / Boss / Saymon"
            onChange={(e) => {
              const val = e.target.value;
              onNameChange(val);
              patch({ nickname: val });
            }}
            className="cs-input text-xs sm:text-sm"
          />
        </label>
      </SettingsCard>

      {/* ২. Global Instructions */}
      <SettingsCard
        title="Global instructions"
        description="প্রতিটি চ্যাটে AI কীভাবে কথা বলবে বা কী নিয়ম মেনে চলবে তা এখানে লিখে দিন (সর্বোচ্চ ৩০০০ অক্ষর)।"
        icon={<FileText className="w-4 h-4" />}
        rightSlot={
          <span
            data-testid="global-instructions-counter"
            className="font-mono text-[11px] text-[var(--text-3)] tabular-nums"
          >
            {charCount} / 3000
          </span>
        }
      >
        <div className="space-y-2">
          <textarea
            rows={5}
            data-testid="global-instructions-textarea"
            value={globalInstructionsValue}
            maxLength={3000}
            placeholder="আমাকে বাংলায় উত্তর দাও, ধাপে ধাপে বুঝিয়ে বলো।"
            onChange={(e) => {
              const val = e.target.value.slice(0, 3000);
              patch({
                globalInstructions: val,
                customInst: val,
              });
            }}
            className="cs-textarea w-full text-xs sm:text-sm leading-relaxed"
          />
        </div>
      </SettingsCard>

      {/* ৩. Style সিলেক্টর */}
      <SettingsCard
        title="Style"
        description="উত্তরের ধরন ও লেখার ভঙ্গি বেছে নিন।"
        icon={<Sparkles className="w-4 h-4" />}
      >
        <div className="space-y-3">
          <div
            className="grid grid-cols-1 sm:grid-cols-2 gap-2"
            data-testid="response-style-selector"
          >
            {STYLE_OPTIONS.map((opt) => {
              const active = currentStyle === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  data-testid={`style-option-${opt.id}`}
                  onClick={() =>
                    patch({
                      responseStyle: opt.id,
                      style: opt.id === 'concise' ? 'concise' : 'detailed',
                    })
                  }
                  className={`p-3 rounded-xl border text-left transition-colors cursor-pointer ${
                    active
                      ? 'border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--text)]'
                      : 'border-[var(--border)] bg-[var(--bg)] text-[var(--text-2)] hover:text-[var(--text)]'
                  }`}
                >
                  <div className="text-xs sm:text-sm font-semibold text-[var(--text)]">
                    {opt.label}
                  </div>
                  <div className="text-[11px] text-[var(--text-3)] mt-0.5">
                    {opt.desc}
                  </div>
                </button>
              );
            })}
          </div>

          {currentStyle === 'custom' && (
            <div className="pt-2 border-t border-[var(--border)] space-y-1.5">
              <label
                htmlFor="custom-style-sample-box"
                className="block text-xs font-semibold text-[var(--text)]"
              >
                নিজের লেখার নমুনা (Custom Style Sample)
              </label>
              <textarea
                id="custom-style-sample-box"
                data-testid="custom-style-sample-textarea"
                rows={3}
                maxLength={1500}
                value={draft.customStyleSample || ''}
                onChange={(e) =>
                  patch({ customStyleSample: e.target.value.slice(0, 1500) })
                }
                placeholder="আপনি যেভাবে লেখা পছন্দ করেন তার একটি ছোট নমুনা বা নির্দেশনা এখানে লিখুন…"
                className="cs-textarea w-full text-xs sm:text-sm"
              />
            </div>
          )}
        </div>
      </SettingsCard>
    </div>
  );
};
