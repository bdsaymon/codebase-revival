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
import { buildSystemInstruction } from '../smfta/server/systemPrompt';

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
});
