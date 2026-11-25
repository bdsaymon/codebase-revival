import { describe, expect, it } from 'vitest';
import { sanitizeSettings } from '../smfta/src/utils/settings';
import { resolveEffectiveProvider, inferModelForCustomBaseUrl } from '../smfta/server/providers';
import { buildAdHocProviderConfig } from '../smfta/server/aiClient';
import {
  adaptRequestBodyForUnsupportedParam,
  buildProtocolRequest,
  parseProtocolResponse,
} from '../smfta/server/engine/adapters';
import { classifyPromptComplexity, isLongCodeOrWritingRequest } from '../smfta/server/intentRules';
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

  it('never emits unsupported top_k for Groq/OpenAI-compatible models and auto-adapts HTTP 400 parameter rejections', () => {
    const req = buildProtocolRequest({
      protocol: 'openai_compatible',
      baseUrl: 'https://api.groq.com/openai/v1/chat/completions',
      apiKey: 'gsk_test_fixture',
      modelId: 'openai/gpt-oss-120b',
      messages: [{ role: 'user', content: 'Hi' }],
      maxOutput: 16384,
      temperature: 0.7,
      topP: 0.9,
      topK: 40,
      stream: true,
    });
    expect('top_k' in req.body).toBe(false);

    const adaptedTopK = adaptRequestBodyForUnsupportedParam(
      'openai_compatible',
      { model: 'openai/gpt-oss-120b', top_k: 40, max_tokens: 16384, stream: true },
      'invalid_request_error property \'top_k\' is unsupported'
    );
    expect(adaptedTopK.adapted).toBe(true);
    expect('top_k' in adaptedTopK.body).toBe(false);

    const adaptedMaxTokens = adaptRequestBodyForUnsupportedParam(
      'openai_compatible',
      { model: 'gpt-5', max_tokens: 16384, stream: false },
      "Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead."
    );
    expect(adaptedMaxTokens.adapted).toBe(true);
    expect('max_tokens' in adaptedMaxTokens.body).toBe(false);
    expect(adaptedMaxTokens.body.max_completion_tokens).toBe(16384);

    const clampedLimit = adaptRequestBodyForUnsupportedParam(
      'openai_compatible',
      { model: 'custom-model', max_tokens: 32768, stream: true },
      'invalid_request_error: max_tokens must be less than or equal to 8192'
    );
    expect(clampedLimit.adapted).toBe(true);
    expect(clampedLimit.body.max_tokens).toBe(8192);
  });

  it('allocates large token budgets and removes strict no-code blocks for design, update, and detailed info requests', () => {
    expect(isLongCodeOrWritingRequest('আমাকে একটি সুন্দর ই-কমার্স ওয়েবসাইটের বড় ডিজাইন তৈরি করে দাও')).toBe(true);
    expect(isLongCodeOrWritingRequest('আমার বর্তমান কোডটি আপডেট করে ডার্ক থিম যোগ করো')).toBe(true);
    expect(isLongCodeOrWritingRequest('বাংলাদেশের ইতিহাস সম্পর্কে বড় ও বিস্তারিত তথ্য দাও')).toBe(true);

    const designDecision = classifyPromptComplexity({
      text: 'একটি আধুনিক পোর্টফোলিও ডিজাইন তৈরি করে দাও',
      mode: 'fast',
    });
    expect(designDecision.complexity).toBe('deep');
    expect(designDecision.maxOutputTokens).toBeGreaterThanOrEqual(16384);

    const sys = buildSystemInstruction({ mode: 'balanced' });
    expect(sys).not.toContain('STRICT NO-UNREQUESTED-CODE RULE');
    expect(sys).toContain('DESIGN, CODE & LONG-FORM OUTPUT RULE');
  });
});

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, vi } from 'vitest';
import { validateCustomHeaders } from '../smfta/server/engine/config';
import { sanitizeErrorMsg } from '../smfta/server/aiClient';
import {
  detectProviderFromKey,
  extractCustomEndpointFromParams,
  providerReadiness,
  validateCustomJsonInputs,
  validateGeminiApiKeyFormat,
} from '../smfta/src/utils/providers';
import { DEFAULT_SETTINGS } from '../smfta/src/utils/settings';
import {
  runStandaloneClientSideAI,
  testProviderClientSide,
} from '../smfta/src/utils/apkClientFallback';
import { SettingsModal } from '../smfta/src/components/SettingsHub';

describe('custom provider & JSON gateway error fixes', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('preserves explicit custom proxy URL even when key has a gsk_ prefix, and redacts AQ. keys', () => {
    expect(
      resolveEffectiveProvider('custom', ['gsk_proxy_fixture_123456'], 'https://proxy.example.com/v1')
    ).toBe('custom');
    expect(resolveEffectiveProvider('custom', ['gsk_proxy_fixture_123456'], '')).toBe('groq');

    expect(detectProviderFromKey('AQ.Ab8RN6L_testFixtureKey123456')).toBe('gemini_custom');
    expect(validateGeminiApiKeyFormat('AQ.Ab8RN6L_testFixtureKey123456').valid).toBe(true);
    expect(
      sanitizeErrorMsg('Failed for key AQ.Ab8RN6L_secretValue1234567890')
    ).not.toContain('AQ.Ab8RN6L_secretValue1234567890');
  });

  it('forwards safe client customHeaders into HardenedAIEngine while blocking hop-by-hop/cookie headers', () => {
    const built = buildAdHocProviderConfig({
      provider: 'custom',
      externalBaseUrl: 'https://custom.gateway.example.com/v1',
      externalModel: 'custom-model-v1',
      externalKeys: ['custom-key-1'],
      customHeaders: JSON.stringify({ 'X-Custom-Tenant': 'acme', 'x-api-key': 'secret-hdr' }),
      exactModelOnly: true,
    });
    expect(built.adHocProviders[0]?.provider.custom_headers).toMatchObject({
      'X-Custom-Tenant': 'acme',
      'x-api-key': 'secret-hdr',
    });

    const validatedSafe = validateCustomHeaders(
      { 'x-api-key': 'secret', 'X-Tenant': 'acme', Cookie: 'bad=1', Host: 'evil.com' },
      undefined,
      { allowAnySafe: true }
    );
    expect(validatedSafe.valid).toBe(false);
    expect(validatedSafe.sanitized).toEqual({ 'x-api-key': 'secret', 'X-Tenant': 'acme' });
    expect(validatedSafe.errors).toHaveLength(2);

    expect(() =>
      validateCustomJsonInputs('{"X-Bad":"line1\\nline2"}', '')
    ).not.toThrow();
    expect(validateCustomJsonInputs('{"X-Bad":"line1\\nline2"}', '').valid).toBe(false);
    expect(
      extractCustomEndpointFromParams('{"endpoint":"https://gw.example.com/chat"}')
    ).toBe('https://gw.example.com/chat');
    expect(
      providerReadiness({
        ...DEFAULT_SETTINGS,
        provider: 'custom',
        externalBaseUrl: '',
        customParams: '{"endpoint":"https://gw.example.com/chat"}',
      }).ready
    ).toBe(true);
  });

  it('executes V1 JSON Gateway specs with customHeaders, bodyTemplate, and responsePath directly in browser fallback', async () => {
    let capturedUrl = '';
    let capturedHeaders: Record<string, string> = {};
    let capturedBody: Record<string, unknown> = {};

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      capturedUrl = String(url);
      capturedHeaders = (init?.headers || {}) as Record<string, string>;
      capturedBody = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>;
      return new Response(
        JSON.stringify({ data: { answer: 'JSON Gateway Answer OK' } }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    });

    const reply = await runStandaloneClientSideAI({
      provider: 'custom',
      externalKeys: 'custom-secret-key',
      externalModel: 'my-model-1',
      externalBaseUrl: '',
      customHeaders: '{"X-Tenant-Id":"tenant-99"}',
      customParams: JSON.stringify({
        endpoint: 'https://gateway.example.com/generate',
        requestFormat: 'custom_template',
        apiKeyHeader: 'X-Api-Key',
        apiKeyPrefix: '',
        bodyTemplate: {
          modelName: '{{model}}',
          query: '{{prompt}}',
        },
        responsePath: 'data.answer',
        stream: false,
      }),
      messages: [{ role: 'user', text: 'Hello Gateway' }],
    });

    expect(capturedUrl).toBe('https://gateway.example.com/generate');
    expect(capturedHeaders['X-Tenant-Id']).toBe('tenant-99');
    expect(capturedHeaders['X-Api-Key']).toBe('custom-secret-key');
    expect(capturedBody).toEqual({
      modelName: 'my-model-1',
      query: 'Hello Gateway',
    });
    expect(reply).toBe('JSON Gateway Answer OK');

    const testRes = await testProviderClientSide({
      provider: 'custom',
      externalKeys: 'custom-secret-key',
      externalModel: 'my-model-1',
      customHeaders: '{"X-Tenant-Id":"tenant-99"}',
      customParams: JSON.stringify({
        endpoint: 'https://gateway.example.com/generate',
        responsePath: 'data.answer',
        models: ['my-model-1', 'my-model-2'],
        stream: false,
      }),
    });
    expect(testRes.ok).toBe(true);
    expect(testRes.normalizedEndpoint).toBe('https://gateway.example.com/generate');
    expect(testRes.discoveredModels).toEqual(['my-model-1', 'my-model-2']);
  });

  it('loads JSON Gateway preset cleanly in SettingsModal without leaking mercury-3 and saves custom provider with endpoint in customParams', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const onSave = vi.fn();
    const onUpdateProfiles = vi.fn();
    (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

    try {
      await act(async () => {
        root.render(
          React.createElement(SettingsModal, {
            isOpen: true,
            onClose: vi.fn(),
            initialTab: 'providers',
            profile: { name: 'Tester' },
            settings: { ...DEFAULT_SETTINGS, provider: 'mercury', externalModel: 'mercury-3' },
            memory: [],
            onSave,
            onUpdateProfiles,
            onClearMemory: vi.fn(),
            onExportBackup: vi.fn(),
            onImportBackup: vi.fn(),
            onClearAllData: vi.fn(),
            onOpenWhatsNew: vi.fn(),
          })
        );
      });

      const advToggle = container.querySelector(
        '[data-testid="provider-advanced-toggle"]'
      ) as HTMLButtonElement;
      expect(advToggle).not.toBeNull();
      await act(async () => {
        advToggle.click();
      });

      const presetBtn = container.querySelector(
        '[data-testid="provider-json-preset-btn"]'
      ) as HTMLButtonElement;
      expect(presetBtn).not.toBeNull();
      await act(async () => {
        presetBtn.click();
      });

      const modelInput = container.querySelector(
        '[data-testid="provider-model-input"]'
      ) as HTMLInputElement;
      const baseUrlInput = container.querySelector(
        '[data-testid="provider-base-url-input"]'
      ) as HTMLInputElement;
      const paramsTextarea = container.querySelector(
        '[data-testid="provider-custom-params-input"]'
      ) as HTMLTextAreaElement;

      expect(modelInput.value).toBe('gpt-4o-mini');
      expect(baseUrlInput.value).toBe('https://api.openai.com/v1/chat/completions');
      expect(paramsTextarea.value).toContain('"gpt-4o-mini"');
      expect(paramsTextarea.value).not.toContain('mercury-3');

      const saveButtons = Array.from(container.querySelectorAll('button')).filter(
        (b) => b.textContent?.trim() === 'Save'
      );
      const saveBtn = saveButtons[saveButtons.length - 1] as HTMLButtonElement;
      expect(saveBtn).toBeDefined();
      await act(async () => {
        saveBtn.click();
      });

      expect(onUpdateProfiles).toHaveBeenCalled();
      const savedProfiles = onUpdateProfiles.mock.calls[onUpdateProfiles.mock.calls.length - 1]?.[0];
      const latest = savedProfiles[savedProfiles.length - 1];
      expect(latest.provider).toBe('custom');
      expect(latest.externalModel).toBe('gpt-4o-mini');
      expect(latest.customParams).toContain('"endpoint"');
    } finally {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    }
  });
});