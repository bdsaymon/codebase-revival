import type { AppSettings } from '../types';
import { DEFAULT_SETTINGS, sanitizeSettings } from './settings';

const SECRET_OR_IDENTITY_KEYS = new Set([
  'externalKeys',
  'customHeaders',
  'accountEmail',
  'avatarDataUrl',
  'toolPermissions',
  'conversationPrivacyMode',
  'telemetryOptOut',
  'retentionDays',
  'memoryRetentionDays',
]);

const SUPPORTED_SETTING_KEYS = new Set(
  Object.keys(DEFAULT_SETTINGS).filter((key) => !SECRET_OR_IDENTITY_KEYS.has(key))
);

export interface ParsedSettingsUpdate {
  /** Assistant text with the machine-only block removed. */
  responseText: string;
  /** Validated, allowlisted settings only; null if no valid block was emitted. */
  settingsPatch: Partial<AppSettings> | null;
  error?: 'multiple_blocks' | 'invalid_json' | 'invalid_payload' | 'empty_patch';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Parse the app's ⟦SELF_UPDATE⟧ JSON envelope without applying it.
 * The caller must apply the returned patch through the normal settings state
 * and persistence pipeline; model output is never an authorization boundary.
 */
export function parseSettingsUpdateResponse(
  response: string,
  current: AppSettings
): ParsedSettingsUpdate {
  const source = String(response || '');
  const blockPattern = /⟦SELF_UPDATE⟧([\s\S]*?)⟦\/SELF_UPDATE⟧/g;
  const matches = [...source.matchAll(blockPattern)];
  const responseText = source.replace(blockPattern, '').trim();

  if (matches.length === 0) return { responseText, settingsPatch: null };
  if (matches.length !== 1) return { responseText, settingsPatch: null, error: 'multiple_blocks' };

  const rawBlock = matches[0]?.[1]?.trim() || '';
  if (!rawBlock || rawBlock.length > 16_000) {
    return { responseText, settingsPatch: null, error: 'invalid_payload' };
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(rawBlock);
  } catch {
    return { responseText, settingsPatch: null, error: 'invalid_json' };
  }
  if (!isRecord(decoded)) return { responseText, settingsPatch: null, error: 'invalid_payload' };

  const requested: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(decoded)) {
    if (SUPPORTED_SETTING_KEYS.has(key)) requested[key] = value;
  }
  if (Object.keys(requested).length === 0) {
    return { responseText, settingsPatch: null, error: 'empty_patch' };
  }

  // Sanitize against the application's canonical schema, then return only keys
  // explicitly requested. Unknown keys, credentials, and privilege flags drop.
  const sanitized = sanitizeSettings({ ...current, ...requested });
  const patch = Object.fromEntries(
    Object.keys(requested).map((key) => [key, sanitized[key as keyof AppSettings]])
  ) as Partial<AppSettings>;

  return { responseText, settingsPatch: patch };
}

export function applySettingsUpdate(
  current: AppSettings,
  patch: Partial<AppSettings>
): AppSettings {
  return sanitizeSettings({ ...current, ...patch });
}
