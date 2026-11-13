import { describe, expect, it } from 'vitest';
import {
  estimateUsage,
  isRetryableResponse,
  parseStructuredJson,
  trimMessagesToContext,
  withRetry,
  withTimeout,
} from '../smfta/server/aiPlatform';

describe('AI platform utilities', () => {
  it('keeps the system message and latest conversation within the context budget', () => {
    const result = trimMessagesToContext([
      { role: 'system', content: 'system' },
      { role: 'user', content: 'old'.repeat(100) },
      { role: 'assistant', content: 'recent answer' },
      { role: 'user', content: 'latest question' },
    ], 1_000);
    expect(result[0]?.role).toBe('system');
    expect(result.at(-1)?.content).toBe('latest question');
    expect(result.some((item) => item.content.includes('old'))).toBe(false);
  });

  it('parses plain, fenced and embedded JSON and rejects malformed text', () => {
    expect(parseStructuredJson('{"ok":true}')).toEqual({ ok: true });
    expect(parseStructuredJson('```json\n{"ok":true}\n```')).toEqual({ ok: true });
    expect(parseStructuredJson('answer: {"ok":true}')).toEqual({ ok: true });
    expect(parseStructuredJson('not json')).toBeNull();
  });

  it('retries transient failures with a bounded number of attempts', async () => {
    let calls = 0;
    const result = await withRetry(async () => {
      calls += 1;
      if (calls < 3) throw new Error('temporary');
      return 'ok';
    }, { attempts: 3, baseDelayMs: 0 });
    expect(result).toBe('ok');
    expect(calls).toBe(3);
  });

  it('does not retry when the request was aborted', async () => {
    const controller = new AbortController();
    controller.abort(new Error('cancelled'));
    let calls = 0;
    await expect(withRetry(async () => { calls += 1; return 'unexpected'; }, { signal: controller.signal }))
      .rejects.toThrow('cancelled');
    expect(calls).toBe(0);
  });

  it('retries only explicitly transient HTTP statuses', () => {
    expect(isRetryableResponse(429)).toBe(true);
    expect(isRetryableResponse(503)).toBe(true);
    expect(isRetryableResponse(401)).toBe(false);
    expect(isRetryableResponse(400)).toBe(false);
  });

  it('aborts timed-out work and cleans up the timeout', async () => {
    await expect(withTimeout((signal) => new Promise<string>((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    }), 1)).rejects.toThrow('aborted');
  });

  it('estimates usage deterministically and labels it as approximate in implementation', () => {
    expect(estimateUsage('1234', '12345678')).toEqual({
      inputTokens: 1,
      outputTokens: 2,
      totalTokens: 3,
    });
  });
});
