import { describe, expect, it } from 'vitest';
import { sanitizeSettings } from '../smfta/src/utils/settings';
import { resolveEffectiveProvider } from '../smfta/server/providers';
import { buildAdHocProviderConfig } from '../smfta/server/aiClient';
import { buildProtocolRequest, parseProtocolResponse } from '../smfta/server/engine/adapters';
import { flushProfileWrites, hydrateSavedProfiles, persistSavedProfiles } from '../smfta/src/utils/providers';

describe('custom provider routing', () => {
  it('preserves Mercury when saving settings', () => {
    expect(sanitizeSettings({ provider: 'inceptionlabs', externalModel: 'mercury-2' }).provider).toBe('inceptionlabs');
  });
  it('keeps the selected vendor rather than guessing from the key', () => {
    expect(resolveEffectiveProvider('inceptionlabs', ['sk-proj-test-fixture'], 'https://api.inceptionlabs.ai/v1')).toBe('inceptionlabs');
    expect(sanitizeSettings({ provider: 'groq', externalKeys: 'sk-proj-test-fixture' }).provider).toBe('groq');
  });
  it('uses the custom context window in the actual engine configuration', () => {
    const built = buildAdHocProviderConfig({ provider: 'custom', externalBaseUrl: 'https://api.inceptionlabs.ai/v1', externalModel: 'mercury-2', externalKeys: ['test-fixture'], contextWindow: 32768, exactModelOnly: true });
    expect(built.adHocProviders[0]?.provider.models[0]?.context_window).toBe(32768);
    expect(built.adHocProviders[0]?.provider.models.map(m => m.model_id)).toEqual(['mercury-2']);
  });
  it('keeps provider settings after an encrypted save and reload', async () => {
    const profile = { id: 'test-mercury', name: 'Mercury test', provider: 'inceptionlabs' as const, externalKeys: '', externalBaseUrl: 'https://api.inceptionlabs.ai/v1', externalModel: 'mercury-2', contextWindow: 32768, maxOutputTokens: 16384, supportsStreaming: false };
    persistSavedProfiles([profile]);
    expect(await flushProfileWrites()).toBe('saved');
    expect((await hydrateSavedProfiles())[0]).toMatchObject(profile);
    localStorage.removeItem('smfta_provider_profiles');
  });
  it('sends the selected custom model and output budget in both request modes', () => {
    for (const stream of [true, false]) {
      const request = buildProtocolRequest({ protocol: 'openai_compatible', baseUrl: 'https://api.inceptionlabs.ai/v1/chat/completions', apiKey: 'test-fixture', modelId: 'mercury-2', messages: [{ role: 'user', content: 'Write complete code' }], maxOutput: 16384, stream });
      expect(request.url).toBe('https://api.inceptionlabs.ai/v1/chat/completions');
      expect(request.body).toMatchObject({ model: 'mercury-2', stream, max_completion_tokens: 16384 });
      expect(request.headers.Authorization).toBe('Bearer test-fixture');
    }
  });
  it('does not shorten long code returned by a custom provider', () => {
    const code = '```js\n' + Array.from({ length: 500 }, (_, i) => `export const item${i} = ${i};`).join('\n') + '\n```';
    const result = parseProtocolResponse('openai_compatible', { choices: [{ message: { content: code }, finish_reason: 'stop' }] });
    expect(result.text).toBe(code);
  });
});