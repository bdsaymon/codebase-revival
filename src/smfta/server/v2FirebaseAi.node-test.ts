import test from 'node:test';
import assert from 'node:assert/strict';
import {
  V2_SPECIAL_MODELS,
  isV2ModelId,
  getV2ModelSpec,
  getRiyadhDateKey,
  getNextRiyadhResetInfo,
  evaluateV2ModelQuota,
} from '../src/utils/v2UsageLimits';
import {
  buildV2GenAiRequestConfig,
  checkAndConsumeServerV2Quota,
  extractCleanV2ErrorMessage,
  formatGeminiContents,
  getV2ServerFallbackModels,
  isServerAuthorizedTester,
  isTransientV2UpstreamError,
  setServerV2UsageCountForTesting,
  streamV2FirebaseModel,
  stripPrivateChainOfThought,
  updateServerV2QuotaConfig,
} from './v2FirebaseAi';
import { sanitizeChatBody } from './engine/requestGuard';
import {
  detectLanguageSegments,
  resolveRecognitionLanguage,
} from '../src/utils/voiceEngine';

test('V1 models remain strictly isolated from V2 routing', () => {
  assert.equal(isV2ModelId('smfta-flash'), false);
  assert.equal(isV2ModelId('smfta-pro'), false);
  assert.equal(isV2ModelId('smfta-ultra'), false);
  assert.equal(isV2ModelId('mercury-3'), false);
  assert.equal(isV2ModelId(''), false);

  assert.equal(isV2ModelId('smfta-v5'), true);
  assert.equal(isV2ModelId('smfta-v2-pro'), true);
  assert.equal(isV2ModelId('smfta-max'), true);
});

test('V2 models have exact distinct configurations, capabilities, and daily limits', () => {
  const v5 = getV2ModelSpec('smfta-v5');
  const pro = getV2ModelSpec('smfta-v2-pro');
  const max = getV2ModelSpec('smfta-max');

  assert.equal(V2_SPECIAL_MODELS.length, 3);

  assert.equal(v5.label, 'SMFTA V5');
  assert.equal(v5.serverGeminiModel, 'gemini-3.5-flash-lite');
  assert.equal(v5.temperature, 0.7);
  assert.equal(v5.maxOutputTokens, 8192);
  assert.equal(v5.defaultDailyLimit, 100);
  assert.equal(v5.thinkingLevel, 'MINIMAL');
  assert.equal(v5.useSearchGrounding, false);

  assert.equal(pro.label, 'SMFTA Pro');
  assert.equal(pro.serverGeminiModel, 'gemini-3-flash-preview');
  assert.equal(pro.temperature, 0.4);
  assert.equal(pro.maxOutputTokens, 16384);
  assert.equal(pro.defaultDailyLimit, 40);
  assert.equal(pro.thinkingLevel, 'LOW');
  assert.equal(pro.useSearchGrounding, false);

  assert.equal(max.label, 'SMFTA Max');
  assert.equal(max.serverGeminiModel, 'gemini-3.8-flash');
  assert.equal(max.maxOutputTokens, 32768);
  assert.equal(max.defaultDailyLimit, 15);
  assert.equal(max.thinkingLevel, 'HIGH');
  assert.equal(max.useSearchGrounding, true);
});

test('gemini-2.5 config sets thinkingBudget and preserves parameter safety', () => {
  const maxSpec = getV2ModelSpec('smfta-max');
  const hydrogenCfg = buildV2GenAiRequestConfig({
    modelName: 'gemini-4-hydrogen',
    spec: maxSpec,
    fullSystemInstruction: 'System prompt',
  });
  assert.equal('temperature' in hydrogenCfg, false);
  assert.equal('topP' in hydrogenCfg, false);
  assert.equal('topK' in hydrogenCfg, false);
  assert.ok(Array.isArray(hydrogenCfg.tools));

  const max25Cfg = buildV2GenAiRequestConfig({
    modelName: 'gemini-2.5-pro',
    spec: maxSpec,
    fullSystemInstruction: 'System prompt',
  });
  assert.deepEqual(max25Cfg.thinkingConfig, {
    includeThoughts: true,
    thinkingBudget: 12288,
  });
  assert.ok(Array.isArray(max25Cfg.tools));

  const v5Spec = getV2ModelSpec('smfta-v5');
  const liteCfg = buildV2GenAiRequestConfig({
    modelName: 'gemini-2.5-flash-lite',
    spec: v5Spec,
    fullSystemInstruction: 'System prompt',
  });
  assert.equal(liteCfg.temperature, 0.7);
  assert.equal(liteCfg.maxOutputTokens, 8192);
  assert.deepEqual(liteCfg.thinkingConfig, {
    includeThoughts: true,
    thinkingBudget: 1024,
  });
  assert.equal('tools' in liteCfg, false);
});

test('formatGeminiContents strips empty turns, drops leading model turns, and merges adjacent same-role turns', () => {
  const formatted = formatGeminiContents([
    { role: 'ai', content: 'Leading model greeting that must be dropped' },
    { role: 'user', content: '   ' },
    { role: 'user', content: 'First real prompt' },
    { role: 'assistant', content: ' ' },
    { role: 'ai', content: 'First answer' },
    { role: 'user', content: 'Part A' },
    { role: 'user', content: 'Part B' },
  ]);

  assert.equal(formatted.length, 3);
  assert.equal(formatted[0]?.role, 'user');
  assert.deepEqual(formatted[0]?.parts, [{ text: 'First real prompt' }]);
  assert.equal(formatted[1]?.role, 'model');
  assert.deepEqual(formatted[1]?.parts, [{ text: 'First answer' }]);
  assert.equal(formatted[2]?.role, 'user');
  assert.deepEqual(formatted[2]?.parts, [{ text: 'Part A' }, { text: 'Part B' }]);
});

test('sanitizeChatBody skips blank intermediate non-user messages[1] while rejecting empty user prompts', () => {
  const multiTurnWithBlankAi = sanitizeChatBody({
    messages: [
      { role: 'user', text: 'Hi' },
      { role: 'ai', text: '   ' },
      { role: 'user', text: 'Follow-up question' },
    ],
  });
  assert.equal(multiTurnWithBlankAi.ok, true);
  assert.equal(multiTurnWithBlankAi.messages?.length, 2);
  assert.equal(multiTurnWithBlankAi.messages?.[0]?.text, 'Hi');
  assert.equal(multiTurnWithBlankAi.messages?.[1]?.text, 'Follow-up question');

  const emptyUserTurn = sanitizeChatBody({
    messages: [
      { role: 'user', text: 'Hi' },
      { role: 'ai', text: 'Hello!' },
      { role: 'user', text: '   ' },
    ],
  });
  assert.equal(emptyUserTurn.ok, false);
  assert.equal(emptyUserTurn.statusCode, 422);
});

test('streamV2FirebaseModel fails cleanly without retry loops when key is absent', async () => {
  const prevGemini = process.env.GEMINI_API_KEY;
  const prevGoogle = process.env.GOOGLE_API_KEY;
  const prevApi = process.env.API_KEY;
  delete process.env.GEMINI_API_KEY;
  delete process.env.GOOGLE_API_KEY;
  delete process.env.API_KEY;

  try {
    const res = await streamV2FirebaseModel({
      modelId: 'smfta-v5',
      systemInstruction: 'Be helpful',
      history: [{ role: 'user', content: 'Hello' }],
      signal: new AbortController().signal,
      emitDelta: () => undefined,
    });
    assert.equal(res.ok, false);
    assert.equal(res.errorCode, 'V2_AI_UNAVAILABLE');
    assert.equal(res.modelLabel, 'SMFTA V5');
  } finally {
    if (prevGemini !== undefined) process.env.GEMINI_API_KEY = prevGemini;
    if (prevGoogle !== undefined) process.env.GOOGLE_API_KEY = prevGoogle;
    if (prevApi !== undefined) process.env.API_KEY = prevApi;
  }
});

test('Asia/Riyadh (UTC+3) daily reset rollover & 80%/100% quota checks work accurately', () => {
  const beforeRiyadhMidnight = Date.parse('2026-05-10T20:59:59Z');
  const atRiyadhMidnight = Date.parse('2026-05-10T21:00:00Z');

  assert.equal(getRiyadhDateKey(beforeRiyadhMidnight), '2026-05-10');
  assert.equal(getRiyadhDateKey(atRiyadhMidnight), '2026-05-11');

  const resetInfo = getNextRiyadhResetInfo(beforeRiyadhMidnight);
  assert.equal(resetInfo.dateRiyadh, '2026-05-10');
  assert.equal(resetInfo.nextResetIso, '2026-05-10T21:00:00.000Z');

  const warnStatus = evaluateV2ModelQuota({
    modelId: 'smfta-v5',
    usedCount: 80,
    nowMs: beforeRiyadhMidnight,
  });
  assert.equal(warnStatus.isWarning, true);
  assert.equal(warnStatus.isBlocked, false);
  assert.equal(warnStatus.remaining, 20);

  const blockedStatus = evaluateV2ModelQuota({
    modelId: 'smfta-max',
    usedCount: 15,
    nowMs: beforeRiyadhMidnight,
  });
  assert.equal(blockedStatus.isBlocked, true);
  assert.equal(blockedStatus.remaining, 0);
});

test('server quota enforcement & verified admin testing bypass cannot be spoofed', () => {
  assert.equal(isServerAuthorizedTester('msftashop@gmail.com', 'uid_admin', true), true);
  assert.equal(isServerAuthorizedTester('msftashop@gmail.com', 'uid_admin', false), false);
  assert.equal(isServerAuthorizedTester('other@example.com', 'uid_other', true), false);

  const userUid = `test_user_${Date.now()}`;
  updateServerV2QuotaConfig(userUid, { testingBypassEnabled: true, maxLimit: 15 });
  setServerV2UsageCountForTesting({
    userId: userUid,
    userEmail: 'normal@example.com',
    modelId: 'smfta-max',
    usedCount: 15,
  });

  const denied = checkAndConsumeServerV2Quota({
    userId: userUid,
    userEmail: 'normal@example.com',
    emailVerified: true,
    modelId: 'smfta-max',
  });
  assert.equal(denied.allowed, false);
  assert.equal(denied.status.isTestingBypass, false);

  const adminUid = `admin_user_${Date.now()}`;
  updateServerV2QuotaConfig(adminUid, {
    testingBypassEnabled: true,
    testingAllowance: 5,
  });
  const allowedAdmin = checkAndConsumeServerV2Quota({
    userId: adminUid,
    userEmail: 'msftashop@gmail.com',
    emailVerified: true,
    modelId: 'smfta-max',
  });
  assert.equal(allowedAdmin.allowed, true);
  assert.equal(allowedAdmin.status.isTestingBypass, true);
  assert.equal(allowedAdmin.status.used, 0);
  assert.equal(allowedAdmin.status.testingUsed, 1);
});

test('stripPrivateChainOfThought & bilingual voice segment detection handle mixed Bengali and English cleanly', () => {
  const cleaned = stripPrivateChainOfThought(
    '<think>hidden internal reasoning</think>Final clean answer.'
  );
  assert.equal(cleaned, 'Final clean answer.');

  const segments = detectLanguageSegments('আমি এখন Firebase integration টেস্ট করছি।');
  assert.deepEqual(segments, [
    { lang: 'bn-BD', text: 'আমি এখন' },
    { lang: 'en-US', text: 'Firebase integration' },
    { lang: 'bn-BD', text: 'টেস্ট করছি।' },
  ]);

  assert.equal(resolveRecognitionLanguage('bn-BD', 'en'), 'bn-BD');
  assert.equal(resolveRecognitionLanguage('en-US', 'bn'), 'en-US');
  assert.equal(resolveRecognitionLanguage('auto', 'en'), 'en-US');
  assert.equal(resolveRecognitionLanguage('auto', 'bn'), 'bn-BD');
});

test('extractCleanV2ErrorMessage unwraps nested 503 JSON and V2 fallback stays bounded to V2 models', () => {
  const nested503 = new Error(
    JSON.stringify({
      error: {
        message: JSON.stringify({
          error: {
            code: 503,
            message:
              'This model is currently experiencing high demand. Spikes in demand are usually temporary.',
            status: 'UNAVAILABLE',
          },
        }),
      },
    })
  );

  const parsed = extractCleanV2ErrorMessage(nested503);
  assert.equal(parsed.httpStatus, 503);
  assert.equal(parsed.isTransient503, true);
  assert.equal(parsed.isRateLimit, false);
  assert.equal(parsed.message.includes('{"error"'), false);
  assert.match(parsed.message, /high demand/i);

  assert.equal(isTransientV2UpstreamError(nested503), true);
  assert.equal(
    isTransientV2UpstreamError(new Error('429 RESOURCE_EXHAUSTED')),
    false
  );
  assert.equal(
    isTransientV2UpstreamError(Object.assign(new Error('Unauthorized'), { status: 401 })),
    false
  );

  assert.deepEqual(getV2ServerFallbackModels('smfta-v5'), [
    'gemini-3.5-flash-lite',
    'gemini-3-flash-preview',
    'gemini-3.8-flash',
  ]);
  assert.deepEqual(getV2ServerFallbackModels('smfta-v2-pro'), [
    'gemini-3-flash-preview',
    'gemini-3.8-flash',
    'gemini-3.5-flash-lite',
  ]);
  assert.deepEqual(getV2ServerFallbackModels('smfta-max'), [
    'gemini-3.8-flash',
    'gemini-3-flash-preview',
    'gemini-3.5-flash-lite',
  ]);
});
