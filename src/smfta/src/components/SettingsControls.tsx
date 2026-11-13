import React, { type ReactNode } from 'react';

export function SettingSelect({
  label,
  value,
  options,
  description,
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
    <label className="settings-control">
      <span>{label}</span>
      {description ? (
        <span className="text-[11px] font-normal text-[var(--text-3)] -mt-1">
          {description}
        </span>
      ) : null}
      <select
        className="cs-input"
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
    </label>
  );
}

export function SettingNumber({
  label,
  value,
  min,
  max,
  step = 1,
  description,
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
    <label className="settings-control">
      <span>{label}</span>
      {description ? (
        <span className="text-[11px] font-normal text-[var(--text-3)] -mt-1">
          {description}
        </span>
      ) : null}
      <input
        className="cs-input tabular-nums"
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
    </label>
  );
}

export function SettingText({
  label,
  value,
  placeholder,
  maxLength,
  description,
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
      <span>{label}</span>
      {description ? (
        <span className="text-[11px] font-normal text-[var(--text-3)] -mt-1">
          {description}
        </span>
      ) : null}
      <input
        className={`cs-input ${mono ? 'font-mono text-xs' : ''}`}
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
  description,
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
      <span>{label}</span>
      {description ? (
        <span className="text-[11px] font-normal text-[var(--text-3)] -mt-1">
          {description}
        </span>
      ) : null}
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
  description,
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
    <div className="flex items-center justify-between gap-4 py-2 border-b border-[var(--border)] last:border-b-0">
      <div className="min-w-0">
        <div className="text-xs sm:text-sm font-semibold text-[var(--text)]">
          {label}
        </div>
        {description ? (
          <div className="text-[11px] sm:text-xs text-[var(--text-3)] mt-0.5">
            {description}
          </div>
        ) : null}
      </div>
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
    <div className="flex flex-wrap items-center justify-between gap-3 py-1.5">
      <div className="text-xs sm:text-sm font-semibold text-[var(--text)]">{label}</div>
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
  description,
  icon,
  rightSlot,
  testId,
  children,
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
  rightSlot?: ReactNode;
  testId?: string;
  children: ReactNode;
}) {
  return (
    <section
      data-testid={testId}
      className="fs-settings-card rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5"
    >
      <header className="flex items-start justify-between gap-3 pb-3 mb-3 border-b border-[var(--border)]">
        <div className="flex items-start gap-2.5 min-w-0">
          {icon ? (
            <span className="mt-0.5 text-[var(--primary)] shrink-0">{icon}</span>
          ) : null}
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-[var(--text)] tracking-tight">
              {title}
            </h3>
            {description ? (
              <p className="text-xs text-[var(--text-3)] mt-0.5">{description}</p>
            ) : null}
          </div>
        </div>
        {rightSlot ? <div className="shrink-0">{rightSlot}</div> : null}
      </header>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

export function SettingsGrid({ children }: { children: ReactNode }) {
  return <div className="settings-control-grid">{children}</div>;
}