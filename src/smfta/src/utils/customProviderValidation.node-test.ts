import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectProviderFromKey,
  extractCustomEndpointFromParams,
  isGoogleGeminiApiKey,
  providerReadiness,
  validateCustomJsonInputs,
  validateGeminiApiKeyFormat,
} from './providers';
import { DEFAULT_SETTINGS } from './settings';

test('supports AIza and AQ. Google Gemini API keys cleanly', () => {
  assert.equal(isGoogleGeminiApiKey('AIzaSyTestKey1234567890'), true);
  assert.equal(isGoogleGeminiApiKey('AQ.Ab8RN6L_testFixtureKey123456'), true);
  assert.equal(isGoogleGeminiApiKey('sk-proj-12345'), false);

  assert.equal(detectProviderFromKey('AQ.Ab8RN6L_testFixtureKey123456'), 'gemini_custom');
  assert.equal(validateGeminiApiKeyFormat('AQ.Ab8RN6L_testFixtureKey123456').valid, true);
  assert.equal(validateGeminiApiKeyFormat('AQ.short').valid, false);
  assert.equal(validateGeminiApiKeyFormat('invalid-key-value-123456').valid, false);
});

test('extractCustomEndpointFromParams and providerReadiness handle JSON Gateway endpoints without Base URL', () => {
  const spec = JSON.stringify({
    endpoint: 'https://gateway.example.com/v1/chat/completions',
    requestFormat: 'openai',
    responsePath: 'choices[0].message.content',
  });
  assert.equal(extractCustomEndpointFromParams(spec), 'https://gateway.example.com/v1/chat/completions');
  assert.equal(extractCustomEndpointFromParams('{bad json'), '');

  const readiness = providerReadiness({
    ...DEFAULT_SETTINGS,
    provider: 'custom',
    externalBaseUrl: '',
    externalKeys: '',
    customParams: spec,
  });
  assert.equal(readiness.ready, true);
  assert.ok(readiness.detail.includes('https://gateway.example.com/v1/chat/completions'));

  const missingBase = providerReadiness({
    ...DEFAULT_SETTINGS,
    provider: 'custom',
    externalBaseUrl: '',
    externalKeys: '',
    customParams: '{}',
  });
  assert.equal(missingBase.ready, false);
});

test('validateCustomJsonInputs validates syntax, custom headers, and blocks unsafe headers', () => {
  const valid = validateCustomJsonInputs(
    '{"X-Custom-Auth":"token-1","HTTP-Referer":"https://example.com"}',
    '{"endpoint":"https://api.example.com/chat","temperature":0.2}'
  );
  assert.equal(valid.valid, true);
  assert.deepEqual(valid.parsedHeaders, {
    'X-Custom-Auth': 'token-1',
    'HTTP-Referer': 'https://example.com',
  });
  assert.equal(valid.parsedParams?.temperature, 0.2);

  const badJson = validateCustomJsonInputs('{"X-Test":', '');
  assert.equal(badJson.valid, false);
  assert.ok((badJson.error || '').includes('JSON ফরম্যাট সঠিক নয়'));

  const forbidden = validateCustomJsonInputs('{"Cookie":"session=abc"}', '');
  assert.equal(forbidden.valid, false);

  const crlf = validateCustomJsonInputs('{"X-Test":"ok\\r\\nInjected: 1"}', '');
  assert.equal(crlf.valid, false);

  const nonObjParams = validateCustomJsonInputs('', '["not","an","object"]');
  assert.equal(nonObjParams.valid, false);
});
