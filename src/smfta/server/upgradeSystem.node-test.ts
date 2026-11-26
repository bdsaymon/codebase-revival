import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  resolveGeminiApiKey,
  decryptKeyPayloadIfSupported,
} from './keyResolver';
import {
  parseJsonProviderSpec,
  extractValueByPath,
  formatJsonGatewayErrorBn,
  executeJsonProviderChat,
} from './jsonProviderGateway';
import { getV2ModelSpec } from '../src/utils/v2UsageLimits';

function withCleanEnv<T>(fn: () => T): T {
  const keys = [
    'GEMINI_API_KEY',
    'AI_MASTER_KEY',
    'VITE_GEMINI_API_KEY',
    'GOOGLE_API_KEY',
    'API_KEY',
    'SMFTA_KEYSTORE_SECRET',
    'KEY_ENCRYPTION_SECRET',
  ];
  const saved: Record<string, string | undefined> = {};
  for (const k of keys) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  try {
    return fn();
  } finally {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
}

test('resolveGeminiApiKey follows strict header -> body -> env precedence chain', () => {
  withCleanEnv(() => {
    process.env.VITE_GEMINI_API_KEY = 'AIza_env_vite';
    process.env.AI_MASTER_KEY = 'AIza_env_master';
    process.env.GEMINI_API_KEY = 'AIza_env_primary';

    // 1. x-gemini-key wins over everything else
    const fromXGemini = resolveGeminiApiKey({
      headers: {
        'x-gemini-key': 'AIza_hdr_gemini',
        'x-api-key': 'AIza_hdr_api',
        authorization: 'Bearer AIza_hdr_bearer',
      },
      body: { geminiApiKey: 'AIza_body_gem' },
    });
    assert.equal(fromXGemini.apiKey, 'AIza_hdr_gemini');
    assert.equal(fromXGemini.source, 'header:x-gemini-key');

    // 2. x-api-key -> Authorization Bearer -> body.geminiApiKey -> body.apiKey -> externalKeys.gemini -> env
    const fromBearer = resolveGeminiApiKey({
      headers: { authorization: 'Bearer AIza_hdr_bearer' },
      body: { geminiApiKey: 'AIza_body_gem' },
    });
    assert.equal(fromBearer.apiKey, 'AIza_hdr_bearer');
    assert.equal(fromBearer.source, 'header:authorization');

    const fromNestedExt = resolveGeminiApiKey({
      headers: {},
      body: { externalKeys: { gemini: 'AIza_ext_nested' } },
    });
    assert.equal(fromNestedExt.apiKey, 'AIza_ext_nested');
    assert.equal(fromNestedExt.source, 'body:externalKeys.gemini');

    // 3. Fallback chain AI_MASTER_KEY & VITE_GEMINI_API_KEY
    delete process.env.GEMINI_API_KEY;
    const fromMaster = resolveGeminiApiKey({ headers: {}, body: {} });
    assert.equal(fromMaster.apiKey, 'AIza_env_master');
    assert.equal(fromMaster.source, 'env:AI_MASTER_KEY');

    delete process.env.AI_MASTER_KEY;
    const fromVite = resolveGeminiApiKey({ headers: {}, body: {} });
    assert.equal(fromVite.apiKey, 'AIza_env_vite');
    assert.equal(fromVite.source, 'env:VITE_GEMINI_API_KEY');
  });
});

test('decryptKeyPayloadIfSupported decrypts valid enc:v1 keys and returns KEY_DECRYPT_FAILED otherwise', () => {
  withCleanEnv(() => {
    const secret = 'test-master-secret-key';
    const iv = crypto.randomBytes(12);
    const derived = crypto.pbkdf2Sync(secret, 'smfta-keystore-v1', 100_000, 32, 'sha256');
    const cipher = crypto.createCipheriv('aes-256-gcm', derived, iv);
    const enc = Buffer.concat([cipher.update('AIza_decrypted_real', 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    const token = `enc:v1:${iv.toString('base64')}:${Buffer.concat([enc, tag]).toString('base64')}`;

    // Without secret -> graceful KEY_DECRYPT_FAILED Bengali notice
    const failRes = resolveGeminiApiKey({
      headers: { 'x-gemini-key': token },
      body: {},
    });
    assert.equal(failRes.apiKey, '');
    assert.equal(failRes.sealedDetected, true);
    assert.equal(failRes.errorCode, 'KEY_DECRYPT_FAILED');
    assert.ok(failRes.errorBn && failRes.errorBn.length > 10);

    // With secret -> cleanly decrypted
    process.env.SMFTA_KEYSTORE_SECRET = secret;
    const okRes = decryptKeyPayloadIfSupported(token);
    assert.equal(okRes.ok, true);
    assert.equal(okRes.key, 'AIza_decrypted_real');
  });
});

test('V1 JSON Provider Gateway parses specs, extracts nested paths, streams chunks, and formats Bengali HTTP errors', async () => {
  const badJson = parseJsonProviderSpec({
    customParams: '{broken json',
  });
  assert.equal(badJson.isJsonGateway, false);
  assert.ok(badJson.parseError && badJson.parseError.includes('পার্স'));

  const specRes = parseJsonProviderSpec({
    customParams: JSON.stringify({
      endpoint: 'https://example.org/v1/chat/completions',
      requestFormat: 'openai',
      responsePath: 'data.reply.text',
      stream: true,
      models: ['custom-model-1'],
    }),
  });
  assert.equal(specRes.isJsonGateway, true);
  assert.ok(specRes.spec);

  const extracted = extractValueByPath(
    { choices: [{ message: { content: 'Hello from path' } }] },
    'choices[0].message.content'
  );
  assert.equal(extracted, 'Hello from path');

  const err401 = formatJsonGatewayErrorBn(401, 'https://api.example.com/v1');
  assert.ok(err401.includes('401') && err401.includes('API কী'));

  let streamed = '';
  const sseBody = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      controller.enqueue(
        encoder.encode('data: {"choices":[{"delta":{"content":"Hi "}}]}\n\n')
      );
      controller.enqueue(
        encoder.encode('data: {"choices":[{"delta":{"content":"there!"}}]}\n\n')
      );
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    },
  });

  const okChat = await executeJsonProviderChat({
    spec: specRes.spec!,
    messages: [{ role: 'user', content: 'Ping' }],
    modelId: 'custom-model-1',
    apiKey: 'sk-test-token',
    stream: true,
    onDelta: (d) => {
      streamed += d;
    },
    fetchImpl: async () =>
      new Response(sseBody, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      }),
  });
  assert.equal(okChat.ok, true);
  assert.equal(streamed, 'Hi there!');
  assert.equal(okChat.text, 'Hi there!');

  const failChat = await executeJsonProviderChat({
    spec: specRes.spec!,
    messages: [{ role: 'user', content: 'Ping' }],
    modelId: 'custom-model-1',
    apiKey: 'sk-bad',
    fetchImpl: async () =>
      new Response(JSON.stringify({ error: { message: 'Invalid token' } }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }),
  });
  assert.equal(failChat.ok, false);
  assert.equal(failChat.httpStatus, 401);
  assert.ok(failChat.errorBn?.includes('HTTP 401'));
});

test('V2 model specs map to verified responsive Gemini models without stalled defaults', () => {
  assert.equal(getV2ModelSpec('smfta-v5').serverGeminiModel, 'gemini-3.5-flash-lite');
  assert.equal(getV2ModelSpec('smfta-v2-pro').serverGeminiModel, 'gemini-3-flash-preview');
  assert.equal(getV2ModelSpec('smfta-max').serverGeminiModel, 'gemini-3-flash-preview');
});
