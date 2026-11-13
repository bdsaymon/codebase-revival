import { describe, expect, it } from 'vitest';
import { estimateUsage, parseStructuredJson, trimMessagesToContext, withRetry } from '../smfta/server/aiPlatform';

describe('AI platform utilities', () => {
  it('keeps system and recent turns within the context budget', () => {
    const result = trimMessagesToContext([{ role: 'system', content: 'system' }, { role: 'user', content: 'old'.repeat(100) }, { role: 'assistant', content: 'recent answer' }, { role: 'user', content: 'latest question' }], 35);
    expect(result[0]?.role).toBe('system'); expect(result.at(-1)?.content).toBe('latest question'); expect(result.some((item) => item.content.includes('old'))).toBe(false);
  });
  it('parses plain, fenced and embedded JSON safely', () => {
    expect(parseStructuredJson('{"ok":true}')).toEqual({ ok: true }); expect(parseStructuredJson('```json\n{"ok":true}\n```')).toEqual({ ok: true }); expect(parseStructuredJson('answer: {"ok":true}')).toEqual({ ok: true }); expect(parseStructuredJson('not json')).toBeNull();
  });
  it('retries failed operations with bounded attempts', async () => {
    let calls = 0; const result = await withRetry(async () => { calls += 1; if (calls < 3) throw new Error('temporary'); return 'ok'; }, { attempts: 3, baseDelayMs: 0 });
    expect(result).toBe('ok'); expect(calls).toBe(3);
  });
  it('estimates usage deterministically', () => { expect(estimateUsage('1234', '12345678')).toEqual({ inputTokens: 1, outputTokens: 2, totalTokens: 3 }); });
});
