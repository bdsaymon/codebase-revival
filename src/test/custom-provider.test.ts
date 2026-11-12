import { describe, expect, it } from 'vitest';
import { sanitizeSettings } from '../smfta/src/utils/settings';
import { resolveEffectiveProvider, inferModelForCustomBaseUrl } from '../smfta/server/providers';
import { buildAdHocProviderConfig } from '../smfta/server/aiClient';
import { buildProtocolRequest, parseProtocolResponse } from '../smfta/server/engine/adapters';
import { classifyProviderError } from '../smfta/server/engine/errorClassifier';
import {
  DEFAULT_PROVIDER_MODELS,
  flushProfileWrites,
  hydrateSavedProfiles,
  persistSavedProfiles,
} from '../smfta/src/utils/providers';
import { getProviderCatalogItem } from '../smfta/src/data/providerCatalog';
import { extractThinkingAndResponse } from '../smfta/src/components/InteractiveMessageContent';

describe('custom provider routing', () => {
  it('strictly sets DEFAULT_PROVIDER_MODELS["mercury"] to "mercury-3"', () => {
    expect(DEFAULT_PROVIDER_MODELS['mercury']).toBe('mercury-3');
    expect(DEFAULT_PROVIDER_MODELS['inceptionlabs']).toBe('mercury-3');
    expect(getProviderCatalogItem('mercury')?.defaultModel).toBe('mercury-3');
    expect(inferModelForCustomBaseUrl('https://api.inceptionlabs.ai/v1')).toBe('mercury-3');
  });
  it('preserves Mercury when saving settings', () => {
    expect(sanitizeSettings({ provider: 'mercury', externalModel: 'mercury-3' }).provider).toBe('mercury');
    expect(sanitizeSettings({ provider: 'inceptionlabs', externalModel: 'mercury-2' }).provider).toBe('inceptionlabs');
  });
  it('keeps the selected vendor rather than guessing from the key', () => {
    expect(resolveEffectiveProvider('inceptionlabs', ['sk-proj-test-fixture'], 'https://api.inceptionlabs.ai/v1')).toBe('inceptionlabs');
    expect(sanitizeSettings({ provider: 'groq', externalKeys: 'sk-proj-test-fixture' }).provider).toBe('groq');
  });
  it('uses the custom context window in the actual engine configuration', () => {
    const built = buildAdHocProviderConfig({ provider: 'custom', externalBaseUrl: 'https://api.inceptionlabs.ai/v1', externalModel: 'mercury-3', externalKeys: ['test-fixture'], contextWindow: 32768, exactModelOnly: true });
    expect(built.adHocProviders[0]?.provider.models[0]?.context_window).toBe(32768);
    expect(built.adHocProviders[0]?.provider.models.map(m => m.model_id)).toEqual(['mercury-3']);
  });
  it('keeps provider settings after an encrypted save and reload', async () => {
    const profile = { id: 'test-mercury', name: 'Mercury test', provider: 'inceptionlabs' as const, externalKeys: '', externalBaseUrl: 'https://api.inceptionlabs.ai/v1', externalModel: 'mercury-3', contextWindow: 32768, maxOutputTokens: 16384, supportsStreaming: false };
    persistSavedProfiles([profile]);
    expect(await flushProfileWrites()).toBe('saved');
    expect((await hydrateSavedProfiles())[0]).toMatchObject(profile);
    localStorage.removeItem('smfta_provider_profiles');
  });
  it('sends the selected custom model and output budget in both request modes', () => {
    for (const stream of [true, false]) {
      const request = buildProtocolRequest({ protocol: 'openai_compatible', baseUrl: 'https://api.inceptionlabs.ai/v1/chat/completions', apiKey: 'test-fixture', modelId: 'mercury-3', messages: [{ role: 'user', content: 'Write complete code' }], maxOutput: 16384, stream });
      expect(request.url).toBe('https://api.inceptionlabs.ai/v1/chat/completions');
      expect(request.body).toMatchObject({ model: 'mercury-3', stream, max_completion_tokens: 16384 });
      expect(request.headers.Authorization).toBe('Bearer test-fixture');
    }
  });
  it('does not shorten long code returned by a custom provider', () => {
    const code = '```js\n' + Array.from({ length: 500 }, (_, i) => `export const item${i} = ${i};`).join('\n') + '\n```';
    const result = parseProtocolResponse('openai_compatible', { choices: [{ message: { content: code }, finish_reason: 'stop' }] });
    expect(result.text).toBe(code);
  });
  it('extracts <think> blocks cleanly without bleeding raw tags into final response', () => {
    const raw = '<think>Analyzing step 1 and step 2...</think>\n\nHere is the final answer.';
    const parsed = extractThinkingAndResponse(raw);
    expect(parsed.thinkingText).toBe('Analyzing step 1 and step 2...');
    expect(parsed.cleanResponse).toBe('Here is the final answer.');
    expect(parsed.cleanResponse).not.toContain('<think>');
    expect(parsed.cleanResponse).not.toContain('</think>');
  });
  it('classifies HTTP 401 and 404 from custom providers as non-retryable terminal errors', () => {
    const err401 = classifyProviderError({
      protocol: 'openai_compatible',
      httpStatus: 401,
      rawBody: 'Invalid API key',
    });
    expect(err401.errorClass).toBe('AUTH_INVALID');
    expect(err401.transient).toBe(false);
    expect(err401.retrySameCandidateAllowed).toBe(false);

    const err404 = classifyProviderError({
      protocol: 'openai_compatible',
      httpStatus: 404,
      rawBody: 'Model mercury-2 not found',
    });
    expect(err404.errorClass).toBe('MODEL_UNAVAILABLE');
    expect(err404.transient).toBe(false);
    expect(err404.retrySameCandidateAllowed).toBe(false);
  });
});