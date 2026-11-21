import test from 'node:test';
import assert from 'node:assert/strict';
import { applyTextPatch, extractAgentOperations } from './patchEngine';

test('applyTextPatch applies SEARCH/REPLACE blocks accurately', () => {
  const original = `export function greet(name: string) {\n  return 'Hi ' + name;\n}\n`;
  const patch = `<<<<<<< SEARCH\n  return 'Hi ' + name;\n=======\n  return \`Hello, \${name}!\`;\n>>>>>>> REPLACE`;
  const res = applyTextPatch(original, patch);
  assert.equal(res.ok, true);
  assert.ok(res.content.includes('Hello, ${name}!'));
});

test('applyTextPatch applies unified diffs accurately', () => {
  const original = 'line1\nline2\nline3\n';
  const unified = [
    '--- a/file.txt',
    '+++ b/file.txt',
    '@@ -1,3 +1,3 @@',
    ' line1',
    '-line2',
    '+line2-updated',
    ' line3',
  ].join('\n');
  const res = applyTextPatch(original, unified);
  assert.equal(res.ok, true);
  assert.equal(res.content, 'line1\nline2-updated\nline3\n');
});

test('extractAgentOperations parses <plan>, <file_patch>, and <file_delete>', () => {
  const raw = `<plan>
- [ ] Create app shell
- [ ] Update styles
</plan>
<file_patch path="src/App.tsx">
<<<<<<< SEARCH
old
=======
new
>>>>>>> REPLACE
</file_patch>
<file_delete path="src/unused.ts" />
Done.`;
  const ops = extractAgentOperations(raw, { isStreaming: false });
  assert.equal(ops.planSteps.length, 2);
  assert.equal(ops.planSteps[0].status, 'done');
  assert.equal(ops.patches.length, 1);
  assert.equal(ops.patches[0].path, 'src/App.tsx');
  assert.deepEqual(ops.deletes, ['src/unused.ts']);
  assert.ok(!ops.cleanedDisplayText.includes('<plan>'));
});

test('applyTextPatch and extractAgentOperations support <patch><find><replace> format', () => {
  const original = '<h1>Hello</h1>\n<p>Old text</p>\n';
  const raw = `Updating copy...\n<patch path="index.html">\n<find><p>Old text</p></find>\n<replace><p>Updated text</p></replace>\n</patch>\nDone.`;
  const ops = extractAgentOperations(raw, { isStreaming: false });
  assert.equal(ops.patches.length, 1);
  assert.equal(ops.patches[0].path, 'index.html');
  assert.ok(ops.cleanedDisplayText.includes('index.html, updated'));
  assert.ok(!ops.cleanedDisplayText.includes('<patch'));

  const applied = applyTextPatch(original, ops.patches[0].patchBody);
  assert.equal(applied.ok, true);
  assert.equal(applied.content, '<h1>Hello</h1>\n<p>Updated text</p>\n');

  const partial = extractAgentOperations('Working...\n<patch path="index.html"><find><h1>Hello</h1>', {
    isStreaming: true,
  });
  assert.ok(!partial.cleanedDisplayText.includes('<patch'));
});

test('applyTextPatch handles indentation drift in <find>/<replace> hunks cleanly', () => {
  const original = [
    '<script>',
    '  function run() {',
    '    const total = brokenVar + 1;',
    '    return total;',
    '  }',
    '</script>',
  ].join('\n');

  const patch = `<find>
function run() {
  const total = brokenVar + 1;
</find>
<replace>
function run() {
  const total = 10 + 1;
</replace>`;

  const res = applyTextPatch(original, patch);
  assert.equal(res.ok, true);
  assert.ok(res.content.includes('  const total = 10 + 1;'));
  assert.ok(!res.content.includes('brokenVar'));
});
