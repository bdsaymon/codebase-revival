import { describe, expect, it } from 'vitest';
import {
  buildGeminiThinkingConfig,
  extractSseEventsFromLine,
  formatBengaliNumber,
  formatThinkingTimerLabel,
  supportsNativeThinking,
} from '../smfta/server/engine/thinking';
import { buildSystemInstruction } from '../smfta/server/systemPrompt';
import {
  isSensitiveFact,
  mergeExtractedMemories,
  parseExtractedMemoriesJson,
} from '../smfta/src/utils/memoryBank';
import { sanitizeSettings } from '../smfta/src/utils/settings';
import { mergeSessions } from '../smfta/src/utils/cloudSync';

describe('Simple 7-Section Settings, Ordered System Prompt & Live Thinking', () => {
  it('sanitizes legacy settings blobs without losing fields and sets safe defaults', () => {
    const migrated = sanitizeSettings({
      customInst: 'Legacy prompt instruction',
      displayName: 'Saymon',
      style: 'detailed',
      thinkingMode: 'off',
      projects: [
        { id: 'proj-1', name: 'SMFTA Web', instructions: 'Use TypeScript strictly.' },
        { id: '', name: 'Invalid Project', instructions: 'Skip me' },
      ],
    });

    expect(migrated.globalInstructions).toBe('Legacy prompt instruction');
    expect(migrated.nickname).toBe('Saymon');
    expect(migrated.responseStyle).toBe('explanatory');
    expect(migrated.thinkingEnabled).toBe(false);
    expect(migrated.responseLength).toBe('detailed');
    expect(migrated.memorySearchChats).toBe(true);
    expect(migrated.memoryPaused).toBe(false);
    expect(migrated.projects).toHaveLength(1);
    expect(migrated.projects?.[0]?.name).toBe('SMFTA Web');
  });

  it('assembles system prompt in strict 5-step order: Base -> Global+Nickname -> Project -> Style -> Memory', () => {
    const prompt = buildSystemInstruction({
      nickname: 'সায়মন',
      globalInstructions: 'সব সময় বাংলায় উত্তর দাও।',
      projectName: 'E-commerce App',
      projectInstructions: 'শুধু React ও Tailwind ব্যবহার করো।',
      responseStyle: 'formal',
      responseLength: 'short',
      memory: ['পেশা: ফুল-স্ট্যাক ডেভেলপার'],
      autoMemory: true,
      memoryPaused: false,
      incognito: false,
    });

    const baseIdx = prompt.indexOf('SMFTA AI Pro');
    const globalIdx = prompt.indexOf('GLOBAL USER INSTRUCTIONS & NICKNAME:');
    const projIdx = prompt.indexOf('ACTIVE PROJECT INSTRUCTIONS (E-commerce App):');
    const styleIdx = prompt.indexOf('RESPONSE STYLE & LENGTH:');
    const memIdx = prompt.indexOf('MEMORY (context-relevant user facts');

    expect(baseIdx).toBeGreaterThanOrEqual(0);
    expect(globalIdx).toBeGreaterThan(baseIdx);
    expect(projIdx).toBeGreaterThan(globalIdx);
    expect(styleIdx).toBeGreaterThan(projIdx);
    expect(memIdx).toBeGreaterThan(styleIdx);
    expect(prompt).toContain('সায়মন');
    expect(prompt).toContain('সব সময় বাংলায় উত্তর দাও।');
    expect(prompt).toContain('শুধু React ও Tailwind ব্যবহার করো।');
    expect(prompt).toContain('ফুল-স্ট্যাক ডেভেলপার');
  });

  it('excludes memory block completely when memoryPaused or incognito is true', () => {
    const pausedPrompt = buildSystemInstruction({
      nickname: 'Saymon',
      memory: ['পেশা: ফুল-স্ট্যাক ডেভেলপার'],
      autoMemory: true,
      memoryPaused: true,
      incognito: false,
    });
    expect(pausedPrompt).not.toContain('ফুল-স্ট্যাক ডেভেলপার');
    expect(pausedPrompt).not.toContain('MEMORY (context-relevant');

    const incognitoPrompt = buildSystemInstruction({
      nickname: 'Saymon',
      memory: ['পেশা: ফুল-স্ট্যাক ডেভেলপার'],
      autoMemory: true,
      memoryPaused: false,
      incognito: true,
    });
    expect(incognitoPrompt).not.toContain('ফুল-স্ট্যাক ডেভেলপার');
    expect(incognitoPrompt).not.toContain('MEMORY (context-relevant');
  });

  it('filters sensitive facts (cards, NID, passport, health, passwords, keys) from extracted memories and deduplicates updates', () => {
    expect(isSensitiveFact('আমার ক্রেডিট কার্ড নম্বর: 4532 1234 5678 9012')).toBe(true);
    expect(isSensitiveFact('NID: 19951234567890')).toBe(true);
    expect(isSensitiveFact('আমার ব্লাড গ্রুপ ও ডায়াবেটিস রিপোর্ট')).toBe(true);
    expect(isSensitiveFact('পেশা: React Developer')).toBe(false);

    const parsed = parseExtractedMemoriesJson(
      '```json\n["পেশা: React Developer", "API_KEY: sk-abcdefghijklmnop123456789", "ব্যাংক অ্যাকাউন্ট: 12345678901234", "পছন্দ: বাংলায় ধাপে ধাপে ব্যাখ্যা"]\n```'
    );
    expect(parsed).toEqual([
      'পেশা: React Developer',
      'পছন্দ: বাংলায় ধাপে ধাপে ব্যাখ্যা',
    ]);

    const merged = mergeExtractedMemories(
      ['পেশা: PHP Developer', 'শহর: রিয়াদ'],
      ['পেশা: Full-Stack TypeScript Developer', 'শহর: রিয়াদ']
    );
    expect(merged.updated.some((f) => f.includes('Full-Stack TypeScript'))).toBe(true);
    expect(merged.updated.some((f) => f.includes('PHP Developer'))).toBe(false);
    expect(merged.updated.filter((f) => f.includes('শহর: রিয়াদ'))).toHaveLength(1);
  });

  it('builds Gemini thinkingConfig correctly and extracts thought vs text SSE parts without leaking thoughts into text', () => {
    expect(supportsNativeThinking('gemini_custom', 'gemini-2.5-flash')).toBe(true);
    expect(supportsNativeThinking('gemini_custom', 'gemini-1.5-flash')).toBe(false);
    expect(supportsNativeThinking('openai', 'gpt-4o-mini')).toBe(false);

    const cfg25 = buildGeminiThinkingConfig('gemini-2.5-flash', 'high', true);
    expect(cfg25).toEqual({ includeThoughts: true, thinkingBudget: 12288 });

    const cfg3 = buildGeminiThinkingConfig('gemini-3-pro-preview', 'low', true);
    expect(cfg3).toEqual({ includeThoughts: true, thinkingLevel: 'LOW' });

    expect(buildGeminiThinkingConfig('gemini-2.5-flash', 'medium', false)).toBeUndefined();

    const geminiChunk = extractSseEventsFromLine(
      JSON.stringify({
        candidates: [
          {
            content: {
              parts: [
                { text: 'Analyzing user constraints...', thought: true },
                { text: 'Final answer in Bengali.' },
              ],
            },
          },
        ],
      })
    );
    expect(geminiChunk.thinking).toBe('Analyzing user constraints...');
    expect(geminiChunk.text).toBe('Final answer in Bengali.');

    const deepseekChunk = extractSseEventsFromLine(
      JSON.stringify({
        choices: [{ delta: { reasoning_content: 'Step 1', content: 'Hello' } }],
      })
    );
    expect(deepseekChunk.thinking).toBe('Step 1');
    expect(deepseekChunk.text).toBe('Hello');

    expect(formatBengaliNumber(5)).toBe('৫');
    expect(formatThinkingTimerLabel(0, false)).toBe('ভাবছি…');
    expect(formatThinkingTimerLabel(5, false)).toBe('৫ সেকেন্ড ভাবছি');
    expect(formatThinkingTimerLabel(8, true)).toBe('৮ সেকেন্ড ভেবেছি');
  });

  it('excludes tombstoned deleted chat IDs permanently during cloud sync merge', () => {
    const merged = mergeSessions(
      [
        { id: 101, title: 'Keep me', msgs: [{ id: 'm1', role: 'user', text: 'hi', ts: 100 }] },
        { id: 202, title: 'Locally still hanging around', msgs: [{ id: 'm2', role: 'user', text: 'bye', ts: 200 }] },
      ],
      [
        {
          session_id: 202,
          title: 'Deleted in cloud restore',
          title_source: 'auto',
          pinned: false,
          draft: null,
          data: { id: 202, title: 'Deleted in cloud restore', msgs: [{ id: 'm2', role: 'user', text: 'bye', ts: 200 }] },
        },
        {
          session_id: 303,
          title: 'Cloud chat',
          title_source: 'auto',
          pinned: false,
          draft: null,
          data: { id: 303, title: 'Cloud chat', msgs: [{ id: 'm3', role: 'user', text: 'yo', ts: 300 }] },
        },
      ],
      [202]
    );

    expect(merged.map((s) => s.id)).toEqual([303, 101]);
  });
});
