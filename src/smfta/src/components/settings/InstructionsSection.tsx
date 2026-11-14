import React from 'react';
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
}> = [
  { id: 'normal', label: 'Normal' },
  { id: 'concise', label: 'Concise' },
  { id: 'explanatory', label: 'Explanatory' },
  { id: 'formal', label: 'Formal' },
  { id: 'custom', label: 'Custom' },
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

  return (
    <div className="space-y-3" data-testid="settings-section-instructions">
      <SettingsCard>
        {/* Nickname */}
        <div className="flex flex-wrap items-center justify-between gap-3 py-2.5 border-b border-[var(--border)]">
          <span className="text-[13.5px] font-medium text-[var(--ink)]">
            ডাকনাম (Nickname)
          </span>
          <input
            type="text"
            data-testid="instructions-nickname-input"
            value={nicknameValue}
            maxLength={80}
            placeholder="Boss / রাহাত"
            onChange={(e) => {
              const val = e.target.value;
              onNameChange(val);
              patch({ nickname: val });
            }}
            className="cs-input max-w-[240px] text-[13px] py-1.5 px-3"
          />
        </div>

        {/* Style */}
        <div className="flex flex-wrap items-center justify-between gap-3 py-2.5 border-b border-[var(--border)]">
          <span className="text-[13.5px] font-medium text-[var(--ink)]">
            Response Style
          </span>
          <div
            className="cs-seg flex-wrap"
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
                  className={`cs-seg-btn ${active ? 'is-active' : ''}`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {currentStyle === 'custom' && (
          <div className="py-2.5 border-b border-[var(--border)]">
            <textarea
              id="custom-style-sample-box"
              data-testid="custom-style-sample-textarea"
              rows={2}
              maxLength={1500}
              value={draft.customStyleSample || ''}
              onChange={(e) =>
                patch({ customStyleSample: e.target.value.slice(0, 1500) })
              }
              placeholder="Custom style sample…"
              className="cs-textarea w-full text-xs sm:text-[13px]"
            />
          </div>
        )}

        {/* Global Instructions */}
        <div className="pt-2.5">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[13.5px] font-medium text-[var(--ink)]">
              Global Instructions
            </span>
            <span
              data-testid="global-instructions-counter"
              className="font-mono text-[11px] text-[var(--ink-dim)] tabular-nums"
            >
              {globalInstructionsValue.length}/3000
            </span>
          </div>
          <textarea
            rows={4}
            data-testid="global-instructions-textarea"
            value={globalInstructionsValue}
            maxLength={3000}
            placeholder="আমাকে বাংলায় উত্তর দাও…"
            onChange={(e) => {
              const val = e.target.value.slice(0, 3000);
              patch({
                globalInstructions: val,
                customInst: val,
              });
            }}
            className="cs-textarea w-full text-xs sm:text-[13px] leading-relaxed"
          />
        </div>
      </SettingsCard>
    </div>
  );
};
