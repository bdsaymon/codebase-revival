import { describe, expect, it } from 'vitest';
import { buildSystemInstruction } from '../smfta/server/systemPrompt';
import { DEFAULT_SETTINGS, sanitizeSettings } from '../smfta/src/utils/settings';

describe('settings self-update contract', () => {
  it('retains the self-update envelope and safe supported setting keys', () => {
    const prompt = buildSystemInstruction({ mode: 'balanced', replyLang: 'bn' });
    expect(prompt).toContain('⟦SELF_UPDATE⟧');
    expect(prompt).toContain('⟦/SELF_UPDATE⟧');
    expect(prompt).toContain('responseTone');
    expect(prompt).toContain('provider');
    expect(prompt).toContain('enabledTools');
    expect(prompt).toContain('Never emit provider keys');
  });

  it('keeps application defaults and schema validation as the settings authority', () => {
    expect(sanitizeSettings({}).mode).toBe(DEFAULT_SETTINGS.mode);
    const safe = sanitizeSettings({ mode: 'balanced', theme: 'dark', weightTemp: 99, provider: 'not-a-provider' });
    expect(safe.mode).toBe('balanced');
    expect(safe.theme).toBe('dark');
    expect(safe.weightTemp).toBe(1.2);
    expect(safe.provider).toBe(DEFAULT_SETTINGS.provider);
  });

  it('does not allow prompt-generated secret or privilege fields into sanitized settings', () => {
    const safe = sanitizeSettings({
      provider: 'openai',
      externalKeys: 'should-not-be-in-AI-output',
      isAdmin: true,
      testingBypass: true,
      dailyMessageLimit: 50_000,
    });
    expect(safe.provider).toBe('openai');
    expect(safe.externalKeys).toBe('should-not-be-in-AI-output'.slice(0, 4000));
    expect('isAdmin' in safe).toBe(false);
    expect('testingBypass' in safe).toBe(false);
    expect(safe.dailyMessageLimit).toBe(10_000);
  });
});
