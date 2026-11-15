import { describe, expect, it } from 'vitest';
import {
  V2_SPECIAL_MODELS,
  evaluateV2ModelQuota,
  getNextRiyadhResetInfo,
  getRiyadhDateKey,
  getV2ModelSpec,
  isV2ModelId,
  sanitizeV2QuotaConfig,
} from '../smfta/src/utils/v2UsageLimits';
import {
  buildV2GenAiRequestConfig,
  checkAndConsumeServerV2Quota,
  formatGeminiContents,
  isServerAuthorizedTester,
  setServerV2UsageCountForTesting,
  stripPrivateChainOfThought,
  updateServerV2QuotaConfig,
} from '../smfta/server/v2FirebaseAi';
import { sanitizeChatBody } from '../smfta/server/engine/requestGuard';
import {
  detectLanguageSegments,
  resolveRecognitionLanguage,
} from '../smfta/src/utils/voiceEngine';
import {
  formatFirebaseAiContents,
  isTransientOfflineError,
  selectRelevantFirestoreMemories,
} from '../smfta/src/utils/firebaseV2Client';
import {
  buildBoundedMessagesPayload,
  buildConversationDocPayloads,
  utf8ByteLength,
} from '../smfta/src/utils/firestorePayloadHelpers';
import rootFirebaseConfig from '../../firebase-applet-config.json';

describe('V2 Special Firebase AI System', () => {
  it('keeps V1 models completely isolated from V2 routing', () => {
    for (const v1 of ['smfta-flash', 'smfta-pro', 'smfta-ultra', 'mercury-3', 'gpt-5.4']) {
      expect(isV2ModelId(v1)).toBe(false);
    }
    for (const v2 of ['smfta-v5', 'smfta-v2-pro', 'smfta-max']) {
      expect(isV2ModelId(v2)).toBe(true);
    }
  });

  it('configures each V2 model with distinct parameters, limits, and capabilities', () => {
    expect(V2_SPECIAL_MODELS.map((m) => m.label)).toEqual([
      'SMFTA V5',
      'SMFTA Pro',
      'SMFTA Max',
    ]);

    const v5 = getV2ModelSpec('smfta-v5');
    expect(v5).toMatchObject({
      defaultDailyLimit: 100,
      temperature: 0.7,
      maxOutputTokens: 8192,
      thinkingLevel: 'MINIMAL',
      useSearchGrounding: false,
      serverGeminiModel: 'gemini-3.5-flash-lite',
      firebaseAiModel: 'gemini-2.5-flash-lite',
    });

    const pro = getV2ModelSpec('smfta-v2-pro');
    expect(pro).toMatchObject({
      defaultDailyLimit: 40,
      temperature: 0.4,
      maxOutputTokens: 16384,
      thinkingLevel: 'LOW',
      useSearchGrounding: false,
      serverGeminiModel: 'gemini-3-flash-preview',
      firebaseAiModel: 'gemini-2.5-flash',
    });

    const max = getV2ModelSpec('smfta-max');
    expect(max).toMatchObject({
      defaultDailyLimit: 15,
      maxOutputTokens: 32768,
      thinkingLevel: 'HIGH',
      useSearchGrounding: true,
      serverGeminiModel: 'gemini-3.8-flash',
      firebaseAiModel: 'gemini-2.5-flash',
    });
  });

  it('enforces model-specific Gemini SDK parameter safety for Gemini 2.5 thinkingBudget and search grounding', () => {
    const hydrogenCfg = buildV2GenAiRequestConfig({
      modelName: 'gemini-4-hydrogen',
      spec: getV2ModelSpec('smfta-max'),
      fullSystemInstruction: 'Analyze carefully',
    });
    expect('temperature' in hydrogenCfg).toBe(false);
    expect('topP' in hydrogenCfg).toBe(false);
    expect('topK' in hydrogenCfg).toBe(false);
    expect(Array.isArray(hydrogenCfg.tools)).toBe(true);

    const max25Cfg = buildV2GenAiRequestConfig({
      modelName: 'gemini-2.5-pro',
      spec: getV2ModelSpec('smfta-max'),
      fullSystemInstruction: 'Analyze carefully',
    });
    expect(max25Cfg.thinkingConfig).toEqual({
      includeThoughts: true,
      thinkingBudget: 12288,
    });
    expect(Array.isArray(max25Cfg.tools)).toBe(true);

    const flash25Cfg = buildV2GenAiRequestConfig({
      modelName: 'gemini-2.5-flash',
      spec: getV2ModelSpec('smfta-v2-pro'),
      fullSystemInstruction: 'Write clean TypeScript',
    });
    expect(flash25Cfg.temperature).toBe(0.4);
    expect(flash25Cfg.maxOutputTokens).toBe(16384);
    expect(flash25Cfg.thinkingConfig).toEqual({
      includeThoughts: true,
      thinkingBudget: 4096,
    });
    expect('tools' in flash25Cfg).toBe(false);
  });

  it('sanitizes server & Firebase AI contents without empty turns or messages[1] failures', () => {
    const serverTurns = formatGeminiContents([
      { role: 'ai', content: 'Leading model greeting' },
      { role: 'user', content: 'Hi' },
      { role: 'ai', content: '   ' },
      { role: 'user', content: 'How are you?' },
    ]);
    expect(serverTurns).toEqual([
      { role: 'user', parts: [{ text: 'Hi' }, { text: 'How are you?' }] },
    ]);

    const fbTurns = formatFirebaseAiContents([
      { role: 'assistant', content: 'Dropped' },
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: '   ' },
      { role: 'user', content: 'Second prompt' },
    ]);
    expect(fbTurns).toEqual([
      { role: 'user', parts: [{ text: 'Hello' }, { text: 'Second prompt' }] },
    ]);

    const guardRes = sanitizeChatBody({
      messages: [
        { role: 'user', text: 'First prompt' },
        { role: 'ai', text: '   ' },
        { role: 'user', text: 'Second prompt' },
      ],
    });
    expect(guardRes.ok).toBe(true);
    expect(guardRes.messages).toHaveLength(2);
    expect(guardRes.messages?.[1]?.text).toBe('Second prompt');
  });

  it('computes Saudi Arabia (Asia/Riyadh) daily rollovers, 80% warnings, and 100% hard blocks', () => {
    const beforeMidnightRiyadh = Date.parse('2026-07-15T20:59:59Z');
    const afterMidnightRiyadh = Date.parse('2026-07-15T21:00:00Z');
    expect(getRiyadhDateKey(beforeMidnightRiyadh)).toBe('2026-07-15');
    expect(getRiyadhDateKey(afterMidnightRiyadh)).toBe('2026-07-16');

    const reset = getNextRiyadhResetInfo(beforeMidnightRiyadh);
    expect(reset.nextResetIso).toBe('2026-07-15T21:00:00.000Z');

    const at80Pct = evaluateV2ModelQuota({
      modelId: 'smfta-v2-pro',
      usedCount: 32,
      nowMs: beforeMidnightRiyadh,
    });
    expect(at80Pct.isWarning).toBe(true);
    expect(at80Pct.isBlocked).toBe(false);
    expect(at80Pct.remaining).toBe(8);

    const cfg = sanitizeV2QuotaConfig({ v5Limit: 120, proLimit: 50, maxLimit: 20 });
    expect(cfg.v5Limit).toBe(120);
    expect(cfg.proLimit).toBe(50);
    expect(cfg.maxLimit).toBe(20);
  });

  it('enforces server-side daily quota limits per user & strictly verifies admin testing mode', () => {
    expect(isServerAuthorizedTester('msftashop@gmail.com', 'uid1', true)).toBe(true);
    expect(isServerAuthorizedTester('msftashop@gmail.com', 'uid1', false)).toBe(false);
    expect(isServerAuthorizedTester('guest@example.com', 'uid2', true)).toBe(false);

    const guestId = `vitest_guest_${Date.now()}`;
    updateServerV2QuotaConfig(guestId, { testingBypassEnabled: true });
    setServerV2UsageCountForTesting({
      userId: guestId,
      userEmail: 'guest@example.com',
      modelId: 'smfta-v5',
      usedCount: 100,
    });

    const guestBlocked = checkAndConsumeServerV2Quota({
      userId: guestId,
      userEmail: 'guest@example.com',
      emailVerified: true,
      modelId: 'smfta-v5',
    });
    expect(guestBlocked.allowed).toBe(false);
    expect(guestBlocked.status.isBlocked).toBe(true);

    const proStillAllowed = checkAndConsumeServerV2Quota({
      userId: guestId,
      userEmail: 'guest@example.com',
      emailVerified: true,
      modelId: 'smfta-v2-pro',
    });
    expect(proStillAllowed.allowed).toBe(true);
    expect(proStillAllowed.status.remaining).toBe(39);
  });

  it('segments mixed Bengali + English voice speech, selects topic memories, and strips private <think> blocks', () => {
    expect(
      stripPrivateChainOfThought('<think>secret step</think>Hello World')
    ).toBe('Hello World');

    expect(
      detectLanguageSegments('আমি TypeScript এবং React শিখছি।')
    ).toEqual([
      { lang: 'bn-BD', text: 'আমি' },
      { lang: 'en-US', text: 'TypeScript' },
      { lang: 'bn-BD', text: 'এবং' },
      { lang: 'en-US', text: 'React' },
      { lang: 'bn-BD', text: 'শিখছি।' },
    ]);

    expect(resolveRecognitionLanguage('auto', 'bn')).toBe('bn-BD');
    expect(resolveRecognitionLanguage('auto', 'en')).toBe('en-US');

    const memories = [
      'আমার নাম সায়মন এবং আমি ঢাকায় থাকি',
      'User prefers TypeScript for Next.js projects',
      'Favorite fruit is mango in summer',
    ];
    const picked = selectRelevantFirestoreMemories(
      'Help me debug my TypeScript app',
      memories,
      2
    );
    expect(picked[0]).toContain('TypeScript');
    expect(picked.some((m) => m.includes('mango'))).toBe(false);
  });

  it('grants unconditional unlimited access to verified admin msftashop@gmail.com', () => {
    const adminQuota = evaluateV2ModelQuota({
      modelId: 'smfta-max',
      usedCount: 999,
      testingUsedCount: 1500,
      config: { testingBypassEnabled: false, testingAllowance: 5 },
      isAuthorizedTester: true,
    });
    expect(adminQuota.isUnlimited).toBe(true);
    expect(adminQuota.isBlocked).toBe(false);
    expect(adminQuota.isWarning).toBe(false);
    expect(adminQuota.statusText).toContain('Unlimited');

    const adminUid = `admin_unlimited_${Date.now()}`;
    updateServerV2QuotaConfig(adminUid, { testingBypassEnabled: false, testingAllowance: 1 });
    for (let i = 0; i < 5; i += 1) {
      const check = checkAndConsumeServerV2Quota({
        userId: adminUid,
        userEmail: 'msftashop@gmail.com',
        emailVerified: true,
        modelId: 'smfta-max',
      });
      expect(check.allowed).toBe(true);
      expect(check.status.isBlocked).toBe(false);
      expect(check.status.isUnlimited).toBe(true);
    }
  });

  it('classifies transient Firestore offline errors without masking permission-denied errors and uses root config databaseId', () => {
    expect(isTransientOfflineError(new Error('Failed to get document because the client is offline.'))).toBe(true);
    expect(isTransientOfflineError({ code: 'unavailable', message: 'The operation could not be completed' })).toBe(true);
    expect(isTransientOfflineError(new Error('Could not reach Cloud Firestore backend.'))).toBe(true);

    expect(isTransientOfflineError({ code: 'permission-denied', message: 'Missing or insufficient permissions.' })).toBe(false);
    expect(isTransientOfflineError(new Error('7 PERMISSION_DENIED: Missing or insufficient permissions.'))).toBe(false);
    expect(rootFirebaseConfig.firestoreDatabaseId).toBeTruthy();
  });

  it('builds schema-compliant Firestore conversation create/update payloads without mutating createdAt', () => {
    const payloads = buildConversationDocPayloads(
      {
        userId: 'Zn1RcOWeOmc8tFeIvmsC39PLeIj1',
        sessionId: '1794690826846',
        title: 'বাংলা চ্যাট '.repeat(30),
        systemVersion: 'v2',
        modelId: 'smfta-v5',
        msgs: [
          { id: 'm1', role: 'user', text: 'হ্যালো', ts: 100 },
          { id: 'm2', role: 'ai', text: 'উত্তর', ts: 200 },
        ],
      },
      'SERVER_TS'
    );

    expect(payloads.path).toBe(
      'users/Zn1RcOWeOmc8tFeIvmsC39PLeIj1/conversations/conv_1794690826846'
    );
    expect(Object.keys(payloads.createData).sort()).toEqual([
      'conversationId',
      'createdAt',
      'messageCount',
      'messagesPayload',
      'modelId',
      'systemVersion',
      'title',
      'updatedAt',
      'userId',
    ]);
    expect(Object.keys(payloads.updateData).sort()).toEqual([
      'messageCount',
      'messagesPayload',
      'modelId',
      'systemVersion',
      'title',
      'updatedAt',
    ]);
    expect('createdAt' in payloads.updateData).toBe(false);
    expect(utf8ByteLength(payloads.updateData.title)).toBeLessThanOrEqual(200);

    const largeBn = buildBoundedMessagesPayload(
      Array.from({ length: 30 }, (_, idx) => ({
        id: `msg_${idx}`,
        role: idx % 2 === 0 ? 'user' : 'ai',
        text: 'বাংলা টেক্সট পরীক্ষা '.repeat(500),
        ts: idx,
      }))
    );
    expect(largeBn.messagesPayload.length).toBeGreaterThanOrEqual(2);
    expect(utf8ByteLength(largeBn.messagesPayload)).toBeLessThanOrEqual(250_000);
    expect(Array.isArray(JSON.parse(largeBn.messagesPayload))).toBe(true);
  });
});
