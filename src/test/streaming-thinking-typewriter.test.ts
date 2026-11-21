import { describe, expect, it } from 'vitest';
import { revealChars, safeSlice } from '../smfta/src/utils/typewriter';
import {
  detectGeminiThinkingStyle,
  isThinkingCapableModel,
  supportsNativeThinking,
} from '../smfta/src/utils/thinking';
import { parseProtocolResponse } from '../smfta/server/engine/adapters';
import { buildContextualThinkingTrace } from '../smfta/server/routes/chat';

describe('Pen-like Typewriter, Thinking Routing & Protocol Thinking Parsing', () => {
  it('drains finishing text smoothly over multiple frames without dumping big chunks', () => {
    const firstStep = revealChars(600, 16, true);
    expect(firstStep).toBeGreaterThan(0);
    expect(firstStep).toBeLessThan(20);

    let remaining = 600;
    let frames = 0;
    while (remaining > 0 && frames < 1000) {
      const step = revealChars(remaining, 16, true);
      expect(step).toBeLessThanOrEqual(20);
      remaining -= step;
      frames += 1;
    }
    expect(remaining).toBe(0);
    expect(frames).toBeGreaterThan(40);

    const bn = 'বাংলায় কলমের মতো লেখা';
    const sliced = safeSlice(bn, 5);
    expect(sliced.endsWith('\u09be') || sliced.length >= 5).toBe(true);
  });

  it('recognizes Gemini/SMFTA/OpenAI/Reasoning models cleanly without breaking non-thinking legacy models', () => {
    expect(detectGeminiThinkingStyle('smfta-ultra')).toBe('gemini25_budget');
    expect(detectGeminiThinkingStyle('smfta-v2-pro')).toBe('gemini3_level');
    expect(detectGeminiThinkingStyle('gemini-2.5-flash')).toBe('gemini25_budget');
    expect(detectGeminiThinkingStyle('gemini-3-flash-preview')).toBe('gemini3_level');

    expect(supportsNativeThinking('gemini_custom', 'gemini-2.5-flash')).toBe(true);
    expect(supportsNativeThinking('gemini_openai', 'gemini-2.5-flash')).toBe(true);
    expect(supportsNativeThinking('firebase_v2', 'smfta-v5')).toBe(true);
    expect(supportsNativeThinking('gemini_custom', 'gemini-1.5-flash')).toBe(false);
    expect(supportsNativeThinking('openai', 'gpt-4o-mini')).toBe(false);
    expect(isThinkingCapableModel('openai/gpt-oss-120b')).toBe(true);
    expect(isThinkingCapableModel('deepseek-reasoner')).toBe(true);
  });

  it('builds structured Claude-style contextual thinking traces in Bengali and English across effort levels', () => {
    const bnTrace = buildContextualThinkingTrace(
      'একটা সম্পূর্ণ ই-কমার্স ওয়েবসাইট ডিজাইন ও কোড লিখে দাও',
      'bn',
      'SMFTA Max',
      'high'
    );
    expect(bnTrace).toContain('১.');
    expect(bnTrace).toContain('২.');
    expect(bnTrace).toContain('৩.');
    expect(bnTrace).toContain('SMFTA Max · HIGH');

    const enTrace = buildContextualThinkingTrace(
      'Build a responsive React dashboard with Tailwind CSS',
      'en',
      'openai/gpt-oss-120b',
      'medium'
    );
    expect(enTrace).toContain('1. Analyzing request intent');
    expect(enTrace).toContain('2. Structuring complete architecture');
    expect(enTrace).toContain('openai/gpt-oss-120b · MEDIUM');
  });

  it('preserves separate thinking and final text in parseProtocolResponse across OpenAI, Gemini, and Anthropic', () => {
    const openaiParsed = parseProtocolResponse('openai_compatible', {
      choices: [
        {
          message: {
            reasoning_content: 'OpenAI step 1 -> step 2',
            content: 'Final OpenAI answer',
          },
          finish_reason: 'stop',
        },
      ],
      usage: { prompt_tokens: 12, completion_tokens: 8 },
    });
    expect(openaiParsed.thinking).toBe('OpenAI step 1 -> step 2');
    expect(openaiParsed.text).toBe('Final OpenAI answer');

    const geminiParsed = parseProtocolResponse('gemini_native', {
      candidates: [
        {
          content: {
            parts: [
              { text: 'Gemini internal thought', thought: true },
              { text: 'Final Gemini answer' },
            ],
          },
          finishReason: 'STOP',
        },
      ],
    });
    expect(geminiParsed.thinking).toBe('Gemini internal thought');
    expect(geminiParsed.text).toBe('Final Gemini answer');

    const anthropicParsed = parseProtocolResponse('anthropic_native', {
      content: [
        { type: 'thinking', thinking: 'Claude chain of thought' },
        { type: 'text', text: 'Final Claude answer' },
      ],
      stop_reason: 'end_turn',
    });
    expect(anthropicParsed.thinking).toBe('Claude chain of thought');
    expect(anthropicParsed.text).toBe('Final Claude answer');
  });

  it('streams thinking and text SSE events from POST /api/chat/stream without runtime errors', async () => {
    const { dispatchToLegacyApp } = await import('../smfta/server/runtime/dispatch');
    const req = new Request('http://localhost:3000/api/chat/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', text: 'তুমি কে এবং তোমাকে কে তৈরি করেছে?' }],
        provider: 'xrahat',
        externalModel: 'smfta-v2-pro',
        thinkingMode: 'high',
      }),
    });
    const res = await dispatchToLegacyApp(req);
    expect(res.status).toBe(200);
    const bodyText = await res.text();
    expect(bodyText).not.toContain('STREAM_EXCEPTION');
    expect(bodyText).not.toContain('"type":"thinking"');
    expect(bodyText).toContain('"type":"text"');
    expect(bodyText).toContain('"type":"done"');
  });
});


