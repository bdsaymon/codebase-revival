import type { ReactNode } from 'react';

export function SettingSelect({ label, value, options, onChange }: {
  label: string; value: string;
  options: readonly { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return <label className="settings-control">
    <span>{label}</span>
    <select className="cs-input" aria-label={label} value={value} onChange={e => onChange(e.target.value)}>
      {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  </label>;
}

export function SettingNumber({ label, value, min, max, step = 1, onChange }: {
  label: string; value: number; min: number; max: number; step?: number;
  onChange: (value: number) => void;
}) {
  return <label className="settings-control">
    <span>{label}</span>
    <input className="cs-input" aria-label={label} type="number" min={min} max={max} step={step}
      value={value} onChange={e => {
        if (e.target.value === '') return;
        const next = Number(e.target.value);
        if (Number.isFinite(next)) onChange(Math.min(max, Math.max(min, next)));
      }} />
  </label>;
}

export function SettingsGrid({ children }: { children: ReactNode }) {
  return <div className="settings-control-grid">{children}</div>;
}