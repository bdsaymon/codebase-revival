import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractReadySpeechChunks,
  formatTextForNaturalSpeech,
  requestGeminiFemaleSpeech,
  softLimitPcmSamples,
  splitTextForSpeech,
  streamGeminiPcmSpeech,
} from './voiceEngine';

test('formatTextForNaturalSpeech strips markdown, code blocks, and file tags cleanly', () => {
  const input =
    '<think>internal reasoning</think> **Hello**! Check [my site](https://example.com) and ```js\nconsole.log(1)\n``` <file path="app.tsx" type="tsx">const x = 1;</file>';
  const out = formatTextForNaturalSpeech(input);
  assert.equal(out.includes('internal reasoning'), false);
  assert.equal(out.includes('console.log'), false);
  assert.equal(out.includes('**'), false);
  assert.ok(out.includes('Hello! Check my site'));
  assert.ok(out.includes('I have created that file for you.'));
});

test('formatTextForNaturalSpeech preserves long text up to 8000 chars by default', () => {
  const longText = 'বাংলাদেশ একটি সুন্দর দেশ। '.repeat(200);
  const out = formatTextForNaturalSpeech(longText);
  assert.ok(out.length > 3000);
  assert.ok(out.length <= 8000);
});

test('splitTextForSpeech splits Bengali and English text along sentence boundaries within maxLen including 900', () => {
  const mixed =
    'প্রথম বাক্যটি এখানে শেষ হচ্ছে। দ্বিতীয় বাক্যটি আরেকটু বড়, যাতে দুটি বাক্য মিলে একশো বিশ অক্ষরের বেশি হয় এবং পরের অংশ আলাদা টুকরো হয়। ' +
    'This is the third sentence in English, which also carries plenty of words! And here is a fourth question? Final short line.';
  const chunks = splitTextForSpeech(mixed, 120);
  assert.ok(chunks.length >= 3);
  for (const chunk of chunks) {
    assert.ok(chunk.length <= 120, `chunk exceeded 120 chars: ${chunk.length}`);
  }
  assert.equal(chunks.join(' ').replace(/\s+/g, ' ').trim(), mixed.replace(/\s+/g, ' ').trim());

  const longParagraph = 'This is a long natural paragraph sentence that repeats smoothly. '.repeat(25);
  const largeChunks = splitTextForSpeech(longParagraph, 900);
  assert.equal(largeChunks.length, 2);
  for (const chunk of largeChunks) {
    assert.ok(chunk.length <= 900, `chunk exceeded 900 chars: ${chunk.length}`);
  }

  const noPunct = 'word '.repeat(80).trim();
  const wrapped = splitTextForSpeech(noPunct, 100);
  assert.ok(wrapped.length >= 4);
  for (const piece of wrapped) {
    assert.ok(piece.length <= 100);
  }
});

test('extractReadySpeechChunks emits short first sentence immediately while still streaming', () => {
  const partial1 = 'এই তো, বেশ ভালো আছি! তোমার';
  const step1 = extractReadySpeechChunks(partial1, 0, false);
  assert.deepEqual(step1.chunks, ['এই তো, বেশ ভালো আছি!']);
  assert.ok(step1.nextCursor > 0 && step1.nextCursor < partial1.length);

  const partial2 = 'এই তো, বেশ ভালো আছি! তোমার দিনকাল কেমন যাচ্ছে? আজ কী নিয়ে কথা';
  const step2 = extractReadySpeechChunks(partial2, step1.nextCursor, false);
  assert.deepEqual(step2.chunks, ['তোমার দিনকাল কেমন যাচ্ছে?']);

  const finalFull = 'এই তো, বেশ ভালো আছি! তোমার দিনকাল কেমন যাচ্ছে? আজ কী নিয়ে কথা বলব?';
  const step3 = extractReadySpeechChunks(finalFull, step2.nextCursor, true);
  assert.deepEqual(step3.chunks, ['আজ কী নিয়ে কথা বলব?']);
  assert.equal(step3.nextCursor, formatTextForNaturalSpeech(finalFull, 12000).length);

  // Never split decimal numbers mid-stream
  const decimalStream = 'The value is 3.14 right now and growing steadily.';
  const decOut = extractReadySpeechChunks(decimalStream, 0, false);
  assert.deepEqual(decOut.chunks, ['The value is 3.14 right now and growing steadily.']);

  // Emit long unpunctuated first clause quickly instead of stalling until 240 chars
  const longClause =
    'আজকের আবহাওয়া বেশ চমৎকার, আর বিকেলের বাতাসে নদীর পাড়ে হাঁটতে হাঁটতে গল্প করতে বেশ ভালো লাগবে বলে মনে হচ্ছে';
  const clauseStep = extractReadySpeechChunks(longClause, 0, false);
  assert.equal(clauseStep.chunks[0], 'আজকের আবহাওয়া বেশ চমৎকার,');
});

test('requestGeminiFemaleSpeech surfaces integrationRequired when server key missing (503)', async () => {
  const mockFetch = (async () =>
    new Response(
      JSON.stringify({
        ok: false,
        modelUsed: 'none',
        integrationRequired: true,
        error: 'Integration required: Server GEMINI_API_KEY needed.',
      }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    )) as unknown as typeof fetch;

  const res = await requestGeminiFemaleSpeech({
    text: 'Hello there!',
    voiceName: 'Kore',
    fetchImpl: mockFetch,
  });

  assert.equal(res.ok, false);
  assert.equal(res.modelUsed, 'none');
  assert.equal(res.integrationRequired, true);
  assert.match(res.error || '', /Integration required/);
});

test('requestGeminiFemaleSpeech returns WAV base64 and modelUsed when server succeeds', async () => {
  const mockFetch = (async () =>
    new Response(
      JSON.stringify({
        ok: true,
        audioBase64: 'UklGRg==',
        mimeType: 'audio/wav',
        voiceName: 'Zephyr',
        modelUsed: 'gemini-3.8-flash-lite-tts',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )) as unknown as typeof fetch;

  const res = await requestGeminiFemaleSpeech({
    text: 'Good afternoon!',
    voiceName: 'Zephyr',
    fetchImpl: mockFetch,
  });

  assert.equal(res.ok, true);
  assert.equal(res.audioBase64, 'UklGRg==');
  assert.equal(res.voiceName, 'Zephyr');
  assert.equal(res.modelUsed, 'gemini-3.8-flash-lite-tts');
});

test('streamGeminiPcmSpeech returns X-Voice-Model-Used header and fallback JSON modelUsed', async () => {
  const pcmBytes = new Uint8Array(4800);
  const mockStreamFetch = (async () =>
    new Response(pcmBytes, {
      status: 200,
      headers: {
        'Content-Type': 'audio/pcm; rate=24000; channels=1; encoding=signed-int',
        'X-Voice-Sample-Rate': '24000',
        'X-Voice-Model-Used': 'gemini-3.8-live',
      },
    })) as unknown as typeof fetch;

  let receivedChunks = 0;
  const okRes = await streamGeminiPcmSpeech({
    text: 'Testing streaming PCM.',
    voiceName: 'Kore',
    fetchImpl: mockStreamFetch,
    onPcmChunk: () => {
      receivedChunks += 1;
    },
  });
  assert.equal(okRes.ok, true);
  assert.equal(okRes.receivedAudio, true);
  assert.equal(okRes.modelUsed, 'gemini-3.8-live');
  assert.ok(receivedChunks >= 1);

  const mockJsonFallbackFetch = (async () =>
    new Response(
      JSON.stringify({
        ok: false,
        retryUnaryTts: true,
        modelUsed: 'none',
        error: 'Model unavailable',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )) as unknown as typeof fetch;

  const failRes = await streamGeminiPcmSpeech({
    text: 'Testing fallback.',
    voiceName: 'Kore',
    fetchImpl: mockJsonFallbackFetch,
    onPcmChunk: () => {},
  });
  assert.equal(failRes.ok, false);
  assert.equal(failRes.modelUsed, 'none');
});

test('softLimitPcmSamples applies turn-start fade-in and analog soft peak limiting', () => {
  const raw = new Float32Array(120);
  raw.fill(0.99);
  const smoothed = softLimitPcmSamples(raw, 2.5, 24000);
  assert.equal(smoothed.length, raw.length);
  // First sample starts cleanly at 0 (no onset click)
  assert.equal(smoothed[0], 0);
  // Subsequent peak values are softly limited below clipping (<= 0.98)
  assert.ok(smoothed[119]! > 0.85 && smoothed[119]! <= 0.98);

  // Without fade-in (streaming continuation chunks), early sample is preserved with peak limiting
  const cont = softLimitPcmSamples(raw, 0, 24000);
  assert.ok(cont[0]! > 0.85 && cont[0]! <= 0.98);
});
