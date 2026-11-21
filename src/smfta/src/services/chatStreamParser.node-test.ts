import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyChatError, parseSseChunkBuffer } from './chatStreamParser';

test('parseSseChunkBuffer handles split chunks and [DONE] sentinel', () => {
  const part1 = 'data: {"type":"thinking","thinking":"Checking"}\n\ndata: {"type":"text","del';
  const r1 = parseSseChunkBuffer('', part1);
  assert.equal(r1.events.length, 1);
  assert.equal(r1.events[0].thinking, 'Checking');

  const part2 = 'ta":"Hello"}\n\ndata: [DONE]\n\n';
  const r2 = parseSseChunkBuffer(r1.remainingBuffer, part2);
  assert.equal(r2.events.length, 1);
  assert.equal(r2.events[0].delta, 'Hello');
  assert.equal(r2.remainingBuffer, '');
});

test('classifyChatError detects Integration required, rate limits, empty response, network, and aborts', () => {
  const aborted = classifyChatError(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
  assert.equal(aborted.category, 'ABORTED');
  assert.equal(aborted.retryable, false);

  const integration = classifyChatError(
    Object.assign(new Error('Integration required: missing GEMINI_API_KEY'), {
      code: 'INTEGRATION_REQUIRED',
    })
  );
  assert.equal(integration.category, 'INTEGRATION_REQUIRED');
  assert.equal(integration.retryable, false);

  const rateLimit = classifyChatError(new Error('Upstream returned HTTP 429 quota exceeded'));
  assert.equal(rateLimit.category, 'RATE_LIMITED');
  assert.equal(rateLimit.retryable, true);

  const netErr = classifyChatError(new Error('TypeError: Failed to fetch'));
  assert.equal(netErr.category, 'NETWORK_ERROR');
  assert.equal(netErr.retryable, true);
});
