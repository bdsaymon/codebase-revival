import { describe, expect, it } from 'vitest';
import { sanitizeSettings } from '../smfta/src/utils/settings';

describe('rebuilt settings persistence', () => {
  it('preserves the full 4000-character instruction budget', () => {
    const instruction = 'a'.repeat(4000);
    expect(sanitizeSettings({ customInst: instruction }).customInst).toBe(instruction);
    expect(sanitizeSettings({ customInst: instruction + 'b' }).customInst.length).toBe(4000);
  });
  it('retains response controls through a storage round trip', () => {
    const settings = sanitizeSettings({ mode: 'power', maxOutputTokens: 16384, weightTemp: 0.4, topP: 0.8, includeHistory: true, maxHistoryMessages: 30, requestTimeoutSec: 180 });
    expect(sanitizeSettings(JSON.parse(JSON.stringify(settings)))).toMatchObject({ mode: 'power', maxOutputTokens: 16384, weightTemp: 0.4, topP: 0.8, includeHistory: true, maxHistoryMessages: 30, requestTimeoutSec: 180 });
  });
});