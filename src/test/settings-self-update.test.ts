import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, sanitizeSettings } from '../smfta/src/utils/settings';
import { applySettingsUpdate, parseSettingsUpdateResponse } from '../smfta/src/utils/settingsUpdate';

describe('settings update envelope', () => {
  it('parses a valid update, strips control syntax, and returns only requested fields', () => {
    const result = parseSettingsUpdateResponse(
      'Done.\n⟦SELF_UPDATE⟧{"theme":"dark","mode":"balanced"}⟦/SELF_UPDATE⟧',
      sanitizeSettings({})
    );
    expect(result.responseText).toBe('Done.');
    expect(result.settingsPatch).toEqual({ theme: 'dark', mode: 'balanced' });
    expect(result.error).toBeUndefined();
  });

  it('rejects malformed JSON and multiple blocks', () => {
    expect(parseSettingsUpdateResponse('⟦SELF_UPDATE⟧{bad}⟦/SELF_UPDATE⟧', sanitizeSettings({})).error)
      .toBe('invalid_json');
    expect(parseSettingsUpdateResponse(
      '⟦SELF_UPDATE⟧{"theme":"dark"}⟦/SELF_UPDATE⟧⟦SELF_UPDATE⟧{"mode":"power"}⟦/SELF_UPDATE⟧',
      sanitizeSettings({})
    ).error).toBe('multiple_blocks');
  });

  it('drops unknown, secret, and privilege fields and clamps values through canonical schema', () => {
    const result = parseSettingsUpdateResponse(
      '⟦SELF_UPDATE⟧{"theme":"dark","externalKeys":"steal-me","isAdmin":true,"weightTemp":9,"dailyMessageLimit":99999}⟦/SELF_UPDATE⟧',
      sanitizeSettings({})
    );
    expect(result.settingsPatch).toEqual({ theme: 'dark', weightTemp: 1.2, dailyMessageLimit: 10_000 });
    expect('externalKeys' in (result.settingsPatch || {})).toBe(false);
    expect('isAdmin' in (result.settingsPatch || {})).toBe(false);
  });

  it('applies valid patches without resetting unrelated preferences', () => {
    const current = sanitizeSettings({ mode: 'power', density: 'spacious' });
    const updated = applySettingsUpdate(current, { theme: 'dark' });
    expect(updated.theme).toBe('dark');
    expect(updated.mode).toBe('power');
    expect(updated.density).toBe('spacious');
    expect(updated.mode).not.toBe(DEFAULT_SETTINGS.mode);
  });
});
