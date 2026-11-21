import test from 'node:test';
import assert from 'node:assert/strict';
import {
  type ArtifactVersion,
  type WorkspaceArtifactFile,
  buildWorkspaceContextPrompt,
  computeStructuredFileDiff,
  deleteWorkspaceFile,
  renameWorkspaceFile,
  upsertWorkspaceFile,
} from './artifactManager';

test('upsertWorkspaceFile tracks distinct versions without duplicating identical content', () => {
  let files: Record<string, WorkspaceArtifactFile> = {};
  let history: Record<string, ArtifactVersion[]> = {};

  const r1 = upsertWorkspaceFile(files, history, '/src/App.tsx', 'const a = 1;', 'ai', 'Initial');
  files = r1.files;
  history = r1.history;
  assert.equal(r1.normalizedPath, 'src/App.tsx');
  assert.equal(history['src/App.tsx'].length, 1);

  const r2 = upsertWorkspaceFile(files, history, 'src/App.tsx', 'const a = 1;', 'ai', 'Duplicate');
  assert.equal(r2.history['src/App.tsx'].length, 1);

  const r3 = upsertWorkspaceFile(r2.files, r2.history, 'src/App.tsx', 'const a = 2;', 'user', 'Edit');
  assert.equal(r3.history['src/App.tsx'].length, 2);

  const afterRename = renameWorkspaceFile(r3.files, r3.history, 'src/App.tsx', 'src/Main.tsx');
  assert.equal(afterRename.files['src/App.tsx'], undefined);
  assert.equal(afterRename.files['src/Main.tsx'].content, 'const a = 2;');
  assert.equal(afterRename.history['src/Main.tsx'].length, 2);

  const afterDelete = deleteWorkspaceFile(afterRename.files, '/src/Main.tsx');
  assert.equal(Object.keys(afterDelete).length, 0);
});

test('computeStructuredFileDiff accurately counts added and removed lines', () => {
  const diff = computeStructuredFileDiff('a\nb\nc\n', 'a\nb2\nc\nd\n', 'test.txt');
  assert.equal(diff.removedCount, 1);
  assert.equal(diff.addedCount, 2);
  assert.ok(diff.unifiedPatch.includes('-b'));
  assert.ok(diff.unifiedPatch.includes('+b2'));
});

test('buildWorkspaceContextPrompt emits manifest and bounded file snippets', () => {
  const { files } = upsertWorkspaceFile({}, {}, 'index.html', '<h1>Hello</h1>', 'ai', 'init');
  const prompt = buildWorkspaceContextPrompt(files, 4000);
  assert.ok(prompt.includes('[WORKSPACE FILES MANIFEST]'));
  assert.ok(prompt.includes('index.html'));
  assert.ok(prompt.includes('<h1>Hello</h1>'));
});
