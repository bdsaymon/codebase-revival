import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatTextForNaturalSpeech,
  requestGeminiFemaleSpeech,
  splitTextForSpeech,
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

test('splitTextForSpeech splits Bengali and English text along sentence boundaries within maxLen', () => {
  const mixed =
    'প্রথম বাক্যটি এখানে শেষ হচ্ছে। দ্বিতীয় বাক্যটি আরেকটু বড়, যাতে দুটি বাক্য মিলে একশো বিশ অক্ষরের বেশি হয় এবং পরের অংশ আলাদা টুকরো হয়। ' +
    'This is the third sentence in English, which also carries plenty of words! And here is a fourth question? Final short line.';
  const chunks = splitTextForSpeech(mixed, 120);
  assert.ok(chunks.length >= 3);
  for (const chunk of chunks) {
    assert.ok(chunk.length <= 120, `chunk exceeded 120 chars: ${chunk.length}`);
  }
  assert.equal(chunks.join(' ').replace(/\s+/g, ' ').trim(), mixed.replace(/\s+/g, ' ').trim());

  const noPunct = 'word '.repeat(80).trim();
  const wrapped = splitTextForSpeech(noPunct, 100);
  assert.ok(wrapped.length >= 4);
  for (const piece of wrapped) {
    assert.ok(piece.length <= 100);
  }
});

test('requestGeminiFemaleSpeech surfaces integrationRequired when server key missing (503)', async () => {
  const mockFetch = (async () =>
    new Response(
      JSON.stringify({
        ok: false,
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
