import { describe, expect, it } from 'vitest';
import {
  cleanupStaleLocalStorage,
  isTemporaryStaleKey,
  runSystemDiagnostics,
  StorageLike,
} from '../smfta/src/utils/systemDiagnostics';
import {
  ensureMasterProfileMemory,
  extractMemoryCandidates,
  MASTER_PROFILE_FACTS,
  MASTER_PROFILE_NAME,
} from '../smfta/src/utils/memoryBank';
import {
  buildNaturalHumanLanguageRules,
  buildSystemInstruction,
} from '../smfta/server/systemPrompt';
import { dispatchToLegacyApp } from '../smfta/server/runtime/dispatch';

function makeMockStorage(initial: Record<string, string>): StorageLike & {
  dump: () => Record<string, string>;
} {
  const store = new Map<string, string>(Object.entries(initial));
  return {
    get length() {
      return store.size;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    dump() {
      return Object.fromEntries(store.entries());
    },
  };
}

describe('SMFTA System Health & Memory Diagnostics', () => {
  it('removes only temporary/debug/cache keys and strictly preserves smfta_* user state', () => {
    expect(isTemporaryStaleKey('temp_session_draft')).toBe(true);
    expect(isTemporaryStaleKey('debug_trace_1')).toBe(true);
    expect(isTemporaryStaleKey('cache_models_v1')).toBe(true);
    expect(isTemporaryStaleKey('smfta_cache_notes')).toBe(false);
    expect(isTemporaryStaleKey('smfta_settings')).toBe(false);

    const storage = makeMockStorage({
      smfta_settings: '{"mode":"fast"}',
      smfta_chats_v2: '[{"id":1}]',
      smfta_memory: '["fact"]',
      temp_scratch_1: 'abc',
      debug_log_2: 'xyz',
      cache_stale_3: '123',
    });

    const stats = cleanupStaleLocalStorage(storage);
    expect(stats.removedKeys.sort()).toEqual([
      'cache_stale_3',
      'debug_log_2',
      'temp_scratch_1',
    ]);
    expect(stats.remainingKeysCount).toBe(3);
    expect(stats.cacheBytes).toBeGreaterThan(0);
    expect(storage.dump()).toEqual({
      smfta_settings: '{"mode":"fast"}',
      smfta_chats_v2: '[{"id":1}]',
      smfta_memory: '["fact"]',
    });
  });

  it('produces a clean diagnostics report using injected Firestore health probe', async () => {
    const storage = makeMockStorage({
      smfta_settings: '{}',
      temp_orphan: 'old',
    });

    const res = await runSystemDiagnostics({
      storage,
      skipNetworkCheck: true,
      checkFirestore: async () => true,
    });

    expect(res.success).toBe(true);
    expect(res.report?.localStorageStatus).toBe('Cleaned and Synchronized');
    expect(res.report?.firestoreMemory).toContain('Connected & Active');
    expect(res.report?.issuesFound).toEqual([
      'Removed temporary local key: temp_orphan',
    ]);
    expect(res.report?.status).toBe('Optimal');
    expect(res.report?.localKeysCount).toBe(1);
  });

  it('cleans stale task-plan keys, embeds SAYMON HASAN master profile, allows full design/code/long-form output, and skips auto-memory on large notes', () => {
    expect(isTemporaryStaleKey('smfta_active_task_plan')).toBe(true);

    const seeded = ensureMasterProfileMemory([]);
    expect(MASTER_PROFILE_NAME).toBe('SAYMON HASAN');
    for (const fact of MASTER_PROFILE_FACTS) {
      expect(seeded.some((s) => s.includes(fact))).toBe(true);
    }

    const largeNote = Array.from(
      { length: 12 },
      (_, i) => `${i + 1}. My name is Note${i} and I work as Engineer ${i} in detail with long project specifications.`
    ).join('\n');
    expect(extractMemoryCandidates(largeNote)).toEqual([]);

    const prompt = buildSystemInstruction({ mode: 'balanced' });
    expect(prompt).toContain('SAYMON HASAN');
    expect(prompt).toContain('MSFTASHOP');
    expect(prompt).toContain('Saudi Arabia');
    expect(prompt).toContain('DESIGN, CODE & LONG-FORM OUTPUT RULE');
    expect(prompt).not.toContain('LIVE PREVIEW RULE');
  });

  it('enforces shared natural human language rules in both buildSystemInstruction and liveVoiceMode (R3)', () => {
    const chatRules = buildNaturalHumanLanguageRules({
      replyLang: 'bn',
      liveVoiceMode: false,
    });
    const voiceRules = buildNaturalHumanLanguageRules({
      replyLang: 'bn',
      liveVoiceMode: true,
      userName: 'Saymon',
    });
    const sysPrompt = buildSystemInstruction({ mode: 'fast', replyLang: 'bn' });

    for (const text of [chatRules, voiceRules, sysPrompt]) {
      expect(text).toContain('আমি একটি এআই ভাষা মডেল');
      expect(text).toContain('অবশ্যই!');
      expect(text).toContain('নিশ্চিতভাবে');
      expect(text).toContain('আপনাকে কীভাবে সাহায্য করতে পারি?');
      expect(text).toContain('As an AI language model');
      expect(text).toContain('Certainly!');
      expect(text).toContain('How may I assist you today?');
      expect(text).toContain('স্বাভাবিক চলিত বাংলা');
    }
  });

  it('returns boolean-only envStatus flags from GET /api/health and accepts POST /api/feedback without triggering 401/503 auth prompts (R1 & R4)', async () => {
    const healthRes = await dispatchToLegacyApp(
      new Request('http://localhost/api/health', { method: 'GET' })
    );
    expect(healthRes.status).toBe(200);
    const healthJson = await healthRes.json();
    expect(typeof healthJson.geminiServerKeyConfigured).toBe('boolean');
    expect(typeof healthJson.adminTokenConfigured).toBe('boolean');
    expect(typeof healthJson.appUrlConfigured).toBe('boolean');
    expect(typeof healthJson.envStatus?.geminiApiKey).toBe('boolean');
    expect(typeof healthJson.envStatus?.supabaseServiceRoleKey).toBe('boolean');

    // Even if REQUIRE_API_AUTH is temporarily enabled, /api/feedback must succeed without 401/503
    const prevReqAuth = process.env.REQUIRE_API_AUTH;
    process.env.REQUIRE_API_AUTH = 'true';
    try {
      const fbRes = await dispatchToLegacyApp(
        new Request('http://localhost/api/feedback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: 'sess_test_1',
            messageId: 'msg_test_1',
            rating: 'up',
            model: 'gemini-3.1-flash-lite',
          }),
        })
      );
      expect(fbRes.status).toBe(200);
      const fbJson = await fbRes.json();
      expect(fbJson.ok).toBe(true);
      expect(fbJson.feedback?.rating).toBe('up');
    } finally {
      if (prevReqAuth === undefined) {
        delete process.env.REQUIRE_API_AUTH;
      } else {
        process.env.REQUIRE_API_AUTH = prevReqAuth;
      }
    }
  });
});

