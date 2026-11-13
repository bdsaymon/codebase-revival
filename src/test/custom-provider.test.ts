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
import {
  PRIMARY_PROVIDER_OPTIONS,
  getProviderCatalogItem,
} from '../smfta/src/data/providerCatalog';
import {
  extractThinkingAndResponse,
  extractThinkingTopic,
  formatThinkingHeadline,
} from '../smfta/src/components/InteractiveMessageContent';
import { deriveThinkingSteps } from '../smfta/src/utils/genPhase';
import { deriveLiveOperationProgressSteps } from '../smfta/src/utils/conversationContextEngine';
import { buildSystemInstruction } from '../smfta/server/systemPrompt';
import { buildSelfAnswer, isSelfQuestion } from '../smfta/src/utils/selfAnswer';
import {
  clearEntireMemoryBank,
  retrieveRelevantMemories,
} from '../smfta/src/utils/memoryBank';

describe('custom provider routing', () => {
  it('strictly sets DEFAULT_PROVIDER_MODELS["mercury"] to "mercury-3"', () => {
    expect(DEFAULT_PROVIDER_MODELS['mercury']).toBe('mercury-3');
    expect(DEFAULT_PROVIDER_MODELS['inceptionlabs']).toBe('mercury-3');
    expect(getProviderCatalogItem('mercury')?.defaultModel).toBe('mercury-3');
    expect(inferModelForCustomBaseUrl('https://api.inceptionlabs.ai/v1')).toBe('mercury-3');
    expect(PRIMARY_PROVIDER_OPTIONS.map((p) => p.label)).toEqual([
      'Mercury',
      'Gemini',
      'OpenAI',
      'Anthropic',
      'DeepSeek',
      'Groq',
      'OpenRouter',
      'Mistral',
      'xAI Grok',
      'Custom / OpenRouter',
    ]);
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
  it('bypasses simulated thinking steps for xrahat and keyless/custom responses without <think> tags', () => {
    expect(deriveThinkingSteps('Build a fullstack website')).toEqual([]);
    expect(deriveLiveOperationProgressSteps('Explain how React hooks work')).toEqual([]);
    const plain = extractThinkingAndResponse('Plain response without any reasoning tags.');
    expect(plain.thinkingText).toBe('');
    expect(plain.isThinkingActive).toBe(false);
  });
  it('extracts dynamic thinking topic and formats active and completed thinking headlines', () => {
    const thinkBody = '1. Analyzing project requirements and database schema.\n2. Designing API routes.';
    expect(extractThinkingTopic(thinkBody)).toBe('Analyzing project requirements and database schema');
    expect(formatThinkingHeadline(thinkBody, true)).toBe(
      'Thinking: Analyzing project requirements and database schema...'
    );
    expect(formatThinkingHeadline(thinkBody, false, 4)).toBe(
      'Thought on Analyzing project requirements and database schema (4 seconds)'
    );
  });
  it('includes explicit web browsing and live link visitation boundary in system prompt', () => {
    const sys = buildSystemInstruction({ mode: 'balanced' });
    expect(sys).toContain('WEB BROWSING & LIVE LINK VISITATION BOUNDARY');
    expect(sys).toContain('do NOT have live web browsing, real-time URL inspection, or live internet scraping abilities');
  });
  it('disables local answer interception so conversational queries route to the AI model stream', () => {
    expect(isSelfQuestion('তোমাকে কখন update করা হয়েছে?')).toBe(false);
    expect(isSelfQuestion('what is your version?')).toBe(false);
    expect(isSelfQuestion('who made you?')).toBe(false);
    expect(buildSelfAnswer({ query: 'তোমাকে কখন update করা হয়েছে?' })).toBeNull();
    expect(buildSelfAnswer({ query: 'what is your version?' })).toBeNull();
    expect(buildSelfAnswer({ query: 'who made you?' })).toBeNull();
  });
  it('filters memory facts by active topic and prevents conflicting or unrelated facts from polluting prompts', () => {
    const facts = [
      'নাম: সায়মন',
      'নাম: পুরোনো নাম', // Conflicting duplicate key
      'পছন্দ: React এবং TypeScript প্রজেক্ট',
      'অপ্রাসঙ্গিক তথ্য: ২০২২ সালে একটি পুরোনো সাইকেল কিনেছিলাম',
    ];
    const filtered = retrieveRelevantMemories('React দিয়ে কম্পোনেন্ট তৈরি করো', facts, 8);
    expect(filtered).toContain('নাম: সায়মন');
    expect(filtered).not.toContain('নাম: পুরোনো নাম');
    expect(filtered).toContain('পছন্দ: React এবং TypeScript প্রজেক্ট');
    expect(filtered).not.toContain('অপ্রাসঙ্গিক তথ্য: ২০২২ সালে একটি পুরোনো সাইকেল কিনেছিলাম');

    const sys = buildSystemInstruction({
      mode: 'balanced',
      memory: facts,
      recentTranscript: [{ role: 'user', content: 'React দিয়ে কম্পোনেন্ট তৈরি করো' }],
    });
    expect(sys).not.toContain('USER MEMORY — FULL BANK');
    expect(sys).not.toContain('২০২২ সালে একটি পুরোনো সাইকেল কিনেছিলাম');
  });
  it('wipes both smfta_memory and smfta_memory_backup in clearEntireMemoryBank()', () => {
    localStorage.setItem('smfta_memory', JSON.stringify(['নাম: সায়মন']));
    localStorage.setItem(
      'smfta_memory_backup',
      JSON.stringify({ facts: ['নাম: সায়মন'], savedAt: Date.now() })
    );
    clearEntireMemoryBank();
    expect(localStorage.getItem('smfta_memory')).toBeNull();
    expect(localStorage.getItem('smfta_memory_backup')).toBeNull();
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