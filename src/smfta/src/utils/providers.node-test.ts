import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatProviderErrorBn,
  validateGeminiApiKeyFormat,
} from './providers';

describe('providers validation & Bengali error formatting', () => {
  it('validates custom Gemini API key AIza prefix while allowing empty server-key mode', () => {
    assert.equal(validateGeminiApiKeyFormat('').valid, true);
    assert.equal(validateGeminiApiKeyFormat('   ').valid, true);
    assert.equal(
      validateGeminiApiKeyFormat('AIzaSyD-ExampleValidKey1234567890').valid,
      true
    );

    const wrongPrefix = validateGeminiApiKeyFormat('sk-or-v1-not-gemini-key-12345678');
    assert.equal(wrongPrefix.valid, false);
    assert.match(wrongPrefix.error || '', /AIza/);

    const withWhitespace = validateGeminiApiKeyFormat('AIzaSyD bad whitespace key 12345');
    assert.equal(withWhitespace.valid, false);
  });

  it('formats 401/403/404/429/402/400/timeout/network errors clearly in Bengali', () => {
    assert.match(
      formatProviderErrorBn({
        code: 'AUTH_INVALID',
        httpStatus: 401,
        providerLabel: 'Gemini Custom',
        rawMessage: '401 Unauthorized',
      }),
      /সঠিক নয় বা অনুমতি নেই/
    );
    assert.match(
      formatProviderErrorBn({
        code: 'MODEL_NOT_FOUND',
        httpStatus: 404,
        providerLabel: 'Gemini Custom',
        modelName: 'gemini-bad',
        rawMessage: '404 Not Found',
      }),
      /gemini-bad/
    );
    assert.match(
      formatProviderErrorBn({
        code: 'QUOTA_EXHAUSTED',
        httpStatus: 402,
        providerLabel: 'OpenRouter',
        rawMessage: '402 billing',
      }),
      /কোটা বা ক্রেডিট শেষ/
    );
    assert.match(
      formatProviderErrorBn({
        code: 'RATE_LIMITED',
        httpStatus: 429,
        providerLabel: 'Gemini Custom',
        rawMessage: '429 rate limit',
      }),
      /সীমা \(429\) শেষ/
    );
    assert.match(
      formatProviderErrorBn({
        code: 'TIMEOUT',
        providerLabel: 'OpenAI',
        rawMessage: 'request aborted timeout',
      }),
      /দেরি হয়েছে/
    );
    assert.match(
      formatProviderErrorBn({
        code: 'UPSTREAM_NETWORK',
        providerLabel: 'OpenAI',
        rawMessage: 'Failed to fetch',
      }),
      /সংযোগ করা যায়নি/
    );
    assert.match(
      formatProviderErrorBn({
        code: 'BAD_REQUEST',
        httpStatus: 400,
        providerLabel: 'Gemini Custom',
        rawMessage: 'unknown field',
      }),
      /গ্রহণ করেনি \(400/
    );
  });
});
