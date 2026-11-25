import { describe, expect, it } from 'vitest';
import { HardenedAIEngine } from '../smfta/server/engine/router';
import { buildAdHocProviderConfig, normalizeGeminiModelName } from '../smfta/server/aiClient';
import { initSqlite } from '../smfta/server/runtime/sqlite';
import type { EngineRegistryConfig } from '../smfta/server/engine/config';

describe('AI Engine Per-Model 503 Isolation & Fallback Chain Resilience', () => {
  it('isolates overloaded 503 models without poisoning shared key circuit breaker for healthy sibling models', async () => {
    await initSqlite();
    const prevKey = process.env.TEST_SHARED_GEMINI_KEY;
    process.env.TEST_SHARED_GEMINI_KEY = 'AIzaSyTestSharedKey1234567890';

    const config: EngineRegistryConfig = {
      global: {
        user_messages_per_minute: 50,
        user_daily_message_cap: 500,
        daily_spend_cap_usd: 50,
        currency: 'USD',
        overall_deadline_ms: 15_000,
        per_attempt_timeout_ms: 5_000,
      },
      providers: [
        {
          provider_id: 'gemini',
          protocol: 'gemini_native',
          base_url: 'https://generativelanguage.googleapis.com/v1beta',
          key_env_var_name: 'TEST_SHARED_GEMINI_KEY',
          models: [
            {
              model_id: 'gemini-4-hydrogen',
              context_window: 1_000_000,
              max_output: 16_384,
              tools: true,
              json: true,
              stream: true,
              input_price_per_1k: 0.0001,
              output_price_per_1k: 0.0004,
            },
            {
              model_id: 'gemini-3.1-flash-lite',
              context_window: 1_000_000,
              max_output: 16_384,
              tools: true,
              json: true,
              stream: true,
              input_price_per_1k: 0.0001,
              output_price_per_1k: 0.0004,
            },
            {
              model_id: 'gemini-3-flash-preview',
              context_window: 1_000_000,
              max_output: 16_384,
              tools: true,
              json: true,
              stream: true,
              input_price_per_1k: 0.0001,
              output_price_per_1k: 0.0004,
            },
          ],
          rpm: 60,
          rpd: 1_500,
          tpm: 1_000_000,
          tpd: 10_000_000,
          reset_timezone: 'UTC',
          reset_time: '00:00',
          priority: 1,
          custom: false,
          enabled: true,
        },
      ],
    };

    const modelsCalled: string[] = [];
    const engine = new HardenedAIEngine({
      dbPath: ':memory:',
      config,
      sleepFn: async () => undefined,
      httpTransport: async (req) => {
        const urlModelMatch = req.url.match(/\/models\/([^:?/]+)/);
        const modelId = urlModelMatch?.[1] || 'unknown';
        modelsCalled.push(modelId);
        if (modelId === 'gemini-4-hydrogen' || modelId === 'gemini-3.1-flash-lite') {
          return {
            status: 503,
            headers: {},
            bodyText: JSON.stringify({
              error: {
                code: 503,
                message: 'This model is currently experiencing high demand.',
                status: 'UNAVAILABLE',
              },
            }),
          };
        }
        return {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
          bodyText: '',
          streamChunks: (async function* () {
            yield { text: 'Healthy model response!' };
          })(),
        };
      },
    });

    try {
      // Repeat 4 requests hitting overloaded 503 models first: must NEVER trip CIRCUIT_OPEN on the shared key
      for (let i = 0; i < 4; i += 1) {
        let out = '';
        const res = await engine.stream(
          {
            userId: 'u_test',
            conversationId: `c_${i}`,
            messages: [{ role: 'user', content: `hello ${i}` }],
            preferredProviderId: 'gemini',
            preferredModelId: 'gemini-4-hydrogen',
          },
          {
            onToken: (t) => {
              out += t;
            },
          }
        );
        expect(res.ok).toBe(true);
        expect(res.modelUsed).toBe('gemini-3-flash-preview');
        expect(out).toBe('Healthy model response!');
      }

      const keyState = engine.keyPool.getKeyState('gemini', 'gemini_key_1');
      expect(keyState.state).toBe('ACTIVE');
      expect(
        engine.keyPool.isModelAvailableForKey('gemini', 'gemini_key_1', 'gemini-3-flash-preview', '')
      ).toBe(true);
      expect(
        engine.keyPool.isModelAvailableForKey('gemini', 'gemini_key_1', 'gemini-4-hydrogen', '')
      ).toBe(false);
      expect(modelsCalled.filter((m) => m === 'gemini-4-hydrogen')).toHaveLength(1);
      expect(modelsCalled.filter((m) => m === 'gemini-3-flash-preview')).toHaveLength(4);
    } finally {
      engine.close();
      if (prevKey === undefined) delete process.env.TEST_SHARED_GEMINI_KEY;
      else process.env.TEST_SHARED_GEMINI_KEY = prevKey;
    }
  });

  it('equips gemini_server with active fallback models while preserving P1-05 BYOK boundary', () => {
    const prevGemini = process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = 'AIzaSyServerDummyKeyForUnitTest';
    try {
      const builtBuiltin = buildAdHocProviderConfig({
        provider: 'gemini_custom',
        externalModel: 'gemini-4-hydrogen',
        exactModelOnly: true,
      });
      const gemServer = builtBuiltin.adHocProviders.find(
        (p) => p.provider.provider_id === 'gemini_server'
      );
      expect(gemServer).toBeTruthy();
      const modelIds = gemServer!.provider.models.map((m) => m.model_id);
      expect(modelIds).toContain('gemini-3-flash-preview');
      expect(modelIds).toContain('gemini-flash-lite-latest');
      expect(builtBuiltin.allowKeylessFallback).toBe(true);

      const byokCustom = buildAdHocProviderConfig({
        provider: 'openai',
        externalKeys: ['sk-test-user-byok'],
        externalModel: 'gpt-4o',
        exactModelOnly: true,
      });
      expect(byokCustom.hasUserKeys).toBe(true);
      expect(byokCustom.allowKeylessFallback).toBe(false);

      expect(normalizeGeminiModelName('gemini-3-flash-preview')).toBe('gemini-3-flash-preview');
      expect(normalizeGeminiModelName('gemini-flash-lite-latest')).toBe('gemini-flash-lite-latest');
      expect(normalizeGeminiModelName('gemini-2.5-flash')).toBe('gemini-2.5-flash');
    } finally {
      if (prevGemini === undefined) delete process.env.GEMINI_API_KEY;
      else process.env.GEMINI_API_KEY = prevGemini;
    }
  });
});
