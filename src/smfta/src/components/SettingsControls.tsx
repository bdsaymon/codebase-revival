import React, { type ReactNode } from 'react';

export function SettingSelect({
  label,
  value,
  options,
  testId,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly { value: string; label: string }[];
  description?: string;
  testId?: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5 border-b border-[var(--border)] last:border-b-0">
      <span className="text-[13.5px] font-medium text-[var(--ink)]">{label}</span>
      <select
        className="cs-input max-w-[220px] text-xs sm:text-[13px] py-1.5 px-2.5"
        aria-label={label}
        data-testid={testId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function SettingNumber({
  label,
  value,
  min,
  max,
  step = 1,
  testId,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  description?: string;
  testId?: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2 border-b border-[var(--border)] last:border-b-0">
      <span className="text-[13px] font-medium text-[var(--ink)]">{label}</span>
      <input
        className="cs-input tabular-nums w-28 text-right text-xs py-1.5 px-2.5"
        aria-label={label}
        data-testid={testId}
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => {
          if (e.target.value === '') return;
          const next = Number(e.target.value);
          if (Number.isFinite(next)) onChange(Math.min(max, Math.max(min, next)));
        }}
      />
    </div>
  );
}

export function SettingText({
  label,
  value,
  placeholder,
  maxLength,
  mono,
  type = 'text',
  testId,
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  maxLength?: number;
  description?: string;
  mono?: boolean;
  type?: 'text' | 'password' | 'email' | 'url';
  testId?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="settings-control">
      <span className="text-[13px] font-medium text-[var(--ink)]">{label}</span>
      <input
        className={`cs-input ${mono ? 'font-mono text-xs' : 'text-[13px]'}`}
        aria-label={label}
        data-testid={testId}
        type={type}
        value={value}
        placeholder={placeholder}
        maxLength={maxLength}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

export function SettingTextarea({
  label,
  value,
  placeholder,
  rows = 3,
  maxLength,
  mono,
  testId,
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  rows?: number;
  maxLength?: number;
  description?: string;
  mono?: boolean;
  testId?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="settings-control">
      <span className="text-[13px] font-medium text-[var(--ink)]">{label}</span>
      <textarea
        className={`cs-textarea w-full text-xs ${mono ? 'font-mono' : ''}`}
        aria-label={label}
        data-testid={testId}
        rows={rows}
        value={value}
        placeholder={placeholder}
        maxLength={maxLength}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

export function SettingToggle({
  label,
  checked,
  disabled,
  testId,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  disabled?: boolean;
  testId?: string;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5 border-b border-[var(--border)] last:border-b-0">
      <span className="text-[13.5px] font-medium text-[var(--ink)]">{label}</span>
      <button
        type="button"
        role="switch"
        disabled={disabled}
        data-testid={testId}
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 p-0 shrink-0 cursor-pointer items-center rounded-full border transition-colors ${
          checked
            ? 'bg-[var(--primary)] border-[var(--primary)]'
            : 'bg-[var(--surface-2)] border-[var(--border)]'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-[var(--settings-on-accent)] shadow-xs transition-transform ${
            checked
              ? 'translate-x-5 rtl:-translate-x-5'
              : 'translate-x-1 rtl:-translate-x-1'
          }`}
        />
      </button>
    </div>
  );
}

export function SettingSegmented({
  label,
  value,
  options,
  testId,
  onChange,
}: {
  label: string;
  value: string;
  options: ReadonlyArray<{ value: string; label: string; icon?: ReactNode; testId?: string }>;
  testId?: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-2.5 border-b border-[var(--border)] last:border-b-0">
      <span className="text-[13.5px] font-medium text-[var(--ink)]">{label}</span>
      <div className="cs-seg" data-testid={testId}>
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            data-testid={opt.testId}
            onClick={() => onChange(opt.value)}
            className={`cs-seg-btn ${value === opt.value ? 'is-active' : ''}`}
          >
            {opt.icon ? <span className="inline-flex mr-1">{opt.icon}</span> : null}
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function SettingsCard({
  title,
  rightSlot,
  testId,
  children,
}: {
  title?: string;
  description?: string;
  icon?: ReactNode;
  rightSlot?: ReactNode;
  testId?: string;
  children: ReactNode;
}) {
  return (
    <section
      data-testid={testId}
      className="fs-settings-card rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3"
    >
      {(title || rightSlot) && (
        <header className="flex items-center justify-between gap-3 pb-2 mb-2 border-b border-[var(--border)]">
          {title ? (
            <h3 className="text-[13px] font-semibold text-[var(--ink-muted)]">
              {title}
            </h3>
          ) : <span />}
          {rightSlot ? <div className="shrink-0">{rightSlot}</div> : null}
        </header>
      )}
      <div>{children}</div>
    </section>
  );
}

export function SettingsGrid({ children }: { children: ReactNode }) {
  return <div className="settings-control-grid">{children}</div>;
}