import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeProjectWorkspaceKey,
  loadProjectWorkspaceSnapshot,
  saveProjectWorkspaceSnapshot,
} from './indexedDbStore';

test('normalizeProjectWorkspaceKey provides stable key isolation', () => {
  assert.equal(normalizeProjectWorkspaceKey(undefined), '__default_workspace__');
  assert.equal(normalizeProjectWorkspaceKey('  '), '__default_workspace__');
  assert.equal(normalizeProjectWorkspaceKey('proj-alpha'), 'proj-alpha');
});

test('IndexedDB helpers fail gracefully in Node SSR without throwing', async () => {
  const loaded = await loadProjectWorkspaceSnapshot('proj-alpha');
  assert.equal(loaded, null);
  const saved = await saveProjectWorkspaceSnapshot({
    projectId: 'proj-alpha',
    files: {},
    history: {},
    chats: [],
    activeChatId: null,
    updatedAt: Date.now(),
  });
  assert.equal(saved, false);
});
