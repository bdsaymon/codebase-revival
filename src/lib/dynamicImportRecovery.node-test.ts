import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clearChunkReloadGuard,
  isDynamicImportError,
  loadWithRetry,
  shouldAttemptChunkReload,
} from '../lib/dynamicImportRecovery';

test('isDynamicImportError identifies browser and bundler module fetch failures', () => {
  assert.equal(
    isDynamicImportError(
      new TypeError(
        'Failed to fetch dynamically imported module: https://example.com/src/smfta/AppEntry.tsx'
      )
    ),
    true
  );
  assert.equal(
    isDynamicImportError(new Error('Importing a module script failed.')),
    true
  );
  assert.equal(
    isDynamicImportError(Object.assign(new Error('Loading chunk 42 failed.'), { name: 'ChunkLoadError' })),
    true
  );
  assert.equal(isDynamicImportError(new Error('Normal runtime bug')), false);
});

test('loadWithRetry retries transient dynamic import failures and resolves once healthy', async () => {
  let calls = 0;
  const mod = await loadWithRetry(
    async () => {
      calls += 1;
      if (calls < 3) {
        throw new TypeError(
          'Failed to fetch dynamically imported module: https://example.com/src/smfta/AppEntry.tsx'
        );
      }
      return { default: () => 'ok' };
    },
    { retries: 3, delayMs: 1 }
  );
  assert.equal(calls, 3);
  assert.equal(mod.default(), 'ok');
});

test('loadWithRetry does not retry non-module logic errors', async () => {
  let calls = 0;
  await assert.rejects(
    loadWithRetry(
      async () => {
        calls += 1;
        throw new ReferenceError('Some unrelated error');
      },
      { retries: 3, delayMs: 1 }
    ),
    /Some unrelated error/
  );
  assert.equal(calls, 1);
});

test('shouldAttemptChunkReload enforces cooldown to prevent infinite reload loops', () => {
  const map = new Map<string, string>();
  const mockStorage = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
  };

  assert.equal(shouldAttemptChunkReload(mockStorage, 100_000, 15_000), true);
  assert.equal(shouldAttemptChunkReload(mockStorage, 105_000, 15_000), false);
  assert.equal(shouldAttemptChunkReload(mockStorage, 120_000, 15_000), true);
  clearChunkReloadGuard(mockStorage);
  assert.equal(shouldAttemptChunkReload(mockStorage, 121_000, 15_000), true);
});
