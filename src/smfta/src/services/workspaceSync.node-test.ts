import test from 'node:test';
import assert from 'node:assert/strict';
import {
  agentPlanToTaskExecutionPlan,
  applyFixFallbackFromReply,
  applyModelWorkspaceTurn,
  shouldSummarizeConversation,
} from './workspaceSync';
import { upsertWorkspaceFile } from './artifactManager';
import type { ChatMessage } from '../types';

test('applyModelWorkspaceTurn creates, patches, and deletes multiple files in one turn', () => {
  const seed = upsertWorkspaceFile(
    {},
    {},
    'src/old.ts',
    'export const oldVal = 1;\n',
    'ai',
    'seed'
  );
  const seed2 = upsertWorkspaceFile(
    seed.files,
    seed.history,
    'src/app.ts',
    'const count = 1;\nconsole.log(count);\n',
    'ai',
    'seed'
  );

  const modelOutput = `
<plan>
- [x] Create styles.css
- [x] Update src/app.ts
- [x] Delete src/old.ts
</plan>

<file path="styles.css" type="css">
body { background: #111; color: #fff; }
</file>

<file_patch path="src/app.ts">
<<<<<<< SEARCH
const count = 1;
=======
const count = 42;
>>>>>>> REPLACE
</file_patch>

<file_delete path="src/old.ts" />
`;

  const res = applyModelWorkspaceTurn(seed2.files, seed2.history, modelOutput, {
    isStreaming: false,
  });

  assert.equal(res.patchErrors.length, 0);
  assert.ok(res.files['styles.css']);
  assert.equal(res.files['src/app.ts'].content, 'const count = 42;\nconsole.log(count);\n');
  assert.equal(res.files['src/old.ts'], undefined);
  assert.deepEqual(res.deletedPaths, ['src/old.ts']);
  assert.equal(res.planSteps.length, 3);
  assert.equal(res.history['src/app.ts'].length, 2);

  const taskPlan = agentPlanToTaskExecutionPlan(res.planSteps, 'Build Site');
  assert.ok(taskPlan);
  assert.equal(taskPlan.status, 'completed');
  assert.equal(taskPlan.tasks.length, 3);
});

test('applyFixFallbackFromReply applies fenced code block when model omits <file>/<patch> tags', () => {
  const seed = upsertWorkspaceFile(
    {},
    {},
    'index.html',
    '<script>brokenCall();</script>',
    'ai',
    'seed'
  );

  const replyWithFence = `Here is the fixed code:\n\`\`\`html\n<script>console.log('fixed');</script>\n\`\`\``;
  const res = applyFixFallbackFromReply(
    seed.files,
    seed.history,
    'index.html',
    replyWithFence,
    'Fix runtime error'
  );

  assert.deepEqual(res.changedPaths, ['index.html']);
  assert.equal(res.files['index.html'].content, `<script>console.log('fixed');</script>`);
  assert.equal(res.history['index.html'].length, 2);
});

test('shouldSummarizeConversation triggers only on large un-summarized or periodic long chats', () => {
  const shortMsgs: ChatMessage[] = Array.from({ length: 6 }, (_, i) => ({
    id: `m-${i}`,
    role: i % 2 === 0 ? 'user' : 'ai',
    text: 'Short hello',
    ts: Date.now(),
  }));
  assert.equal(shouldSummarizeConversation(shortMsgs, ''), false);

  const longMsgs: ChatMessage[] = Array.from({ length: 20 }, (_, i) => ({
    id: `m-${i}`,
    role: i % 2 === 0 ? 'user' : 'ai',
    text: 'Detailed architectural message '.repeat(25),
    ts: Date.now(),
  }));
  assert.equal(shouldSummarizeConversation(longMsgs, ''), true);
  assert.equal(
    shouldSummarizeConversation(
      longMsgs.slice(0, 19),
      'Comprehensive architectural summary already exists covering decisions and files.'
    ),
    false
  );
});
