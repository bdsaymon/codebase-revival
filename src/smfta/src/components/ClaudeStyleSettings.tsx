import React, { useState } from 'react';
import {
  Menu,
  Info,
  CircleUserRound,
  CircleDollarSign,
  SlidersHorizontal,
  LayoutGrid,
  Bot,
  Moon,
 ALargeSmall,
  AudioWaveform,
  Smartphone,
} from 'lucide-react';

/**
 * ClaudeStyleSettings — pixel-matched recreation of the reference
 * "Settings" screen (mobile-first, full-bleed dark page).
 *
 * It is fully wired: `onMenu`, `onInfo`, `onUpgrade`, `onNavigate` are
 * optional callbacks the existing app shell can supply. Every control is
 * a real control (the haptic toggle holds state); no demo content.
 */
export interface ClaudeStyleSettingsProps {
  planLabel?: string;
  upgradeTitle?: string;
  upgradeSubtitle?: string;
  capabilitiesEnabled?: number;
  colorModeValue?: string;
  fontStyleValue?: string;
  hapticDefault?: boolean;
  onMenu?: () => void;
  onInfo?: () => void;
  onUpgrade?: () => void;
  onNavigate?: (section: SettingsSectionId) => void;
}

export type SettingsSectionId =
  | 'profile'
  | 'billing'
  | 'capabilities'
  | 'connectors'
  | 'permissions'
  | 'colorMode'
  | 'fontStyle'
  | 'voice'
  | 'haptics';

interface SettingsRow {
  id: SettingsSectionId;
  icon: React.ReactNode;
  label: string;
  hint?: string;
  toggle?: boolean;
}

export default function ClaudeStyleSettings({
  planLabel = 'Free',
  upgradeTitle = 'Want more Claude?',
  upgradeSubtitle = 'Upgrade for more usage and capabilities.',
  capabilitiesEnabled = 5,
  colorModeValue = 'System',
  fontStyleValue = 'Default',
  hapticDefault = true,
  onMenu,
  onInfo,
  onUpgrade,
  onNavigate,
}: ClaudeStyleSettingsProps) {
  const [hapticOn, setHapticOn] = useState(hapticDefault);

  const rows: SettingsRow[] = [
    { id: 'profile', icon: <CircleUserRound size={26} strokeWidth={1.6} />, label: 'Profile' },
    { id: 'billing', icon: <CircleDollarSign size={26} strokeWidth={1.6} />, label: 'Billing' },
    {
      id: 'capabilities',
      icon: <SlidersHorizontal size={26} strokeWidth={1.6} />,
      label: 'Capabilities',
      hint: `${capabilitiesEnabled} enabled`,
    },
    { id: 'connectors', icon: <LayoutGrid size={26} strokeWidth={1.6} />, label: 'Connectors' },
    { id: 'permissions', icon: <Bot size={26} strokeWidth={1.6} />, label: 'Permissions' },
    { id: 'colorMode', icon: <Moon size={26} strokeWidth={1.6} />, label: 'Color mode', hint: colorModeValue },
    { id: 'fontStyle', icon: <ALargeSmall size={30} strokeWidth={1.6} />, label: 'Font style', hint: fontStyleValue },
    { id: 'voice', icon: <AudioWaveform size={26} strokeWidth={1.6} />, label: 'Voice' },
    {
      id: 'haptics',
      icon: <Smartphone size={26} strokeWidth={1.6} />,
      label: 'Haptic feedback',
      toggle: true,
    },
  ];

  const groups: SettingsRow[][] = [
    rows.slice(0, 2), // Profile, Billing
    rows.slice(2, 5), // Capabilities, Connectors, Permissions
    rows.slice(5, 8), // Color mode, Font style, Voice
    rows.slice(8), // Haptic feedback
  ];

  return (
    <div className="csx-page">
      <header className="csx-topbar">
        <button
          type="button"
          className="csx-topbar-btn"
          aria-label="Open menu"
          onClick={onMenu}
        >
          <Menu size={26} strokeWidth={1.8} />
        </button>
        <h1 className="csx-title">Settings</h1>
        <button
          type="button"
          className="csx-topbar-btn"
          aria-label="About this app"
          onClick={onInfo}
        >
          <Info size={26} strokeWidth={1.6} />
        </button>
      </header>

      <div className="csx-scroll">
        {/* Plan chip card */}
        <div className="csx-card csx-plan-card">
          <span className="csx-plan-pill">{planLabel}</span>
        </div>

        {/* Upgrade card */}
        <div className="csx-card csx-upgrade-card">
          <h2 className="csx-upgrade-title">{upgradeTitle}</h2>
          <p className="csx-upgrade-sub">{upgradeSubtitle}</p>
          <button type="button" className="csx-upgrade-btn" onClick={onUpgrade}>
            Upgrade
          </button>
        </div>

        {/* Grouped rows */}
        {groups.map((group, gi) => (
          <div className="csx-card csx-group" key={gi}>
            {group.map((row) =>
              row.toggle ? (
                <div className="csx-row" key={row.id}>
                  <span className="csx-row-icon">{row.icon}</span>
                  <span className="csx-row-label">{row.label}</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={hapticOn}
                    aria-label={row.label}
                    className={`csx-switch${hapticOn ? ' is-on' : ''}`}
                    onClick={() => {
                      setHapticOn((v) => !v);
                      onNavigate?.('haptics');
                    }}
                  >
                    <span className="csx-switch-knob" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="csx-row csx-row-btn"
                  key={row.id}
                  onClick={() => onNavigate?.(row.id)}
                >
                  <span className="csx-row-icon">{row.icon}</span>
                  <span className="csx-row-main">
                    <span className="csx-row-label">{row.label}</span>
                    {row.hint ? <span className="csx-row-hint">{row.hint}</span> : null}
                  </span>
                </button>
              )
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
