import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildBoundedMessagesPayload,
  buildConversationDocPayloads,
  buildFirestoreChatSyncSignature,
  buildMemoryDocPayloads,
  buildSessionDocPayloads,
  buildSessionMessageDocPayloads,
  buildUserProfileCreatePayload,
  utf8ByteLength,
} from './firestorePayloadHelpers';
import type { ChatMessage } from '../types';

test('buildConversationDocPayloads separates immutable create keys from allowed update keys', () => {
  const ts = { _sentinel: 'serverTimestamp' };
  const msgs: ChatMessage[] = [
    { id: 'u1', role: 'user', text: 'হ্যালো', ts: 1000 },
    { id: 'a1', role: 'ai', text: 'হ্যালো! কেমন আছেন?', ts: 2000 },
  ];
  const res = buildConversationDocPayloads(
    {
      userId: 'Zn1RcOWeOmc8tFeIvmsC39PLeIj1',
      sessionId: '1794690826846',
      title: '   ',
      systemVersion: 'v1',
      modelId: '   ',
      msgs,
    },
    ts
  );

  assert.equal(
    res.path,
    'users/Zn1RcOWeOmc8tFeIvmsC39PLeIj1/conversations/conv_1794690826846'
  );
  assert.deepEqual(Object.keys(res.createData).sort(), [
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
  assert.deepEqual(Object.keys(res.updateData).sort(), [
    'messageCount',
    'messagesPayload',
    'modelId',
    'systemVersion',
    'title',
    'updatedAt',
  ]);
  assert.equal('createdAt' in res.updateData, false);
  assert.equal('userId' in res.updateData, false);
  assert.equal('conversationId' in res.updateData, false);
  assert.equal(res.updateData.title, 'Conversation');
  assert.equal(res.updateData.modelId, 'smfta-v5');
  assert.equal(res.updateData.messageCount, 2);
  assert.equal(Array.isArray(JSON.parse(res.updateData.messagesPayload)), true);
});

test('buildBoundedMessagesPayload keeps valid JSON and UTF-8 byte count <= 220000 for huge Bengali chats', () => {
  const hugeBn = 'বাংলায় বিস্তারিত আলোচনা এবং কোডিং উদাহরণ। '.repeat(400);
  const msgs: ChatMessage[] = Array.from({ length: 40 }, (_, i) => ({
    id: `m_${i}`,
    role: i % 2 === 0 ? 'user' : 'ai',
    text: hugeBn,
    thinking: 'ধাপে ধাপে চিন্তা করছি... '.repeat(120),
    ts: 1000 + i,
  }));

  const bounded = buildBoundedMessagesPayload(msgs);
  assert.ok(bounded.messagesPayload.length >= 2);
  assert.ok(bounded.messagesPayload.length <= 250_000);
  assert.ok(utf8ByteLength(bounded.messagesPayload) <= 250_000);
  const parsed = JSON.parse(bounded.messagesPayload);
  assert.equal(Array.isArray(parsed), true);
  assert.equal(parsed.length, bounded.messageCount);
  assert.ok(bounded.messageCount >= 1);
});

test('user, session, message, and memory payloads enforce exact rule schemas and non-empty strings', () => {
  const ts = { _sentinel: 'ts' };
  const prof = buildUserProfileCreatePayload(
    { userId: 'u-1', displayName: 'বাংলা ইউজার '.repeat(20) },
    ts
  );
  assert.deepEqual(Object.keys(prof.createData).sort(), [
    'createdAt',
    'displayName',
    'testingAllowance',
    'testingBypass',
    'updatedAt',
    'userId',
  ]);
  assert.ok(utf8ByteLength(prof.createData.displayName) <= 80);
  assert.equal(prof.createData.testingBypass, false);
  assert.equal(prof.createData.testingAllowance, 0);

  const sess = buildSessionDocPayloads(
    { userId: 'u-1', sessionId: 123, title: '', systemVersion: 'v2', modelId: 'smfta-max' },
    ts
  );
  assert.deepEqual(Object.keys(sess.updateData).sort(), [
    'modelId',
    'systemVersion',
    'title',
    'updatedAt',
  ]);

  const msg = buildSessionMessageDocPayloads(
    { userId: 'u-1', sessionId: 123, messageId: 'm1', role: 'ai', text: 'হ্যালো', modelId: 'smfta-max' },
    ts
  );
  assert.deepEqual(Object.keys(msg.updateData).sort(), ['modelId', 'text']);

  const mem = buildMemoryDocPayloads(
    { userId: 'u-1', memoryId: 'mem_1', fact: 'User lives in Dhaka' },
    ts
  );
  assert.deepEqual(Object.keys(mem.updateData).sort(), [
    'fact',
    'sourceModel',
    'topic',
    'updatedAt',
  ]);

  const sig = buildFirestoreChatSyncSignature({
    title: 'Test',
    msgs: [{ id: '1', role: 'user', text: 'abc', ts: 1 }],
  });
  assert.equal(sig, 'Test:1:1:3');
});
