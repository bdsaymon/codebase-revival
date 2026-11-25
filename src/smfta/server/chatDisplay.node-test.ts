import test from 'node:test';
import assert from 'node:assert/strict';
import {
  shouldCollapseUserPrompt,
  getCodeBlockDisplayMeta,
} from '../src/utils/chatDisplay';
import {
  WAVEFORM_BAR_COUNT,
  WAVEFORM_IDLE_LEVEL,
  computeVoiceEnergy,
  shiftWaveformHistory,
} from '../src/utils/voiceWaveform';

test('user prompt collapse gates multi-line or >180 char prompts cleanly', () => {
  assert.equal(shouldCollapseUserPrompt('Short prompt'), false);
  assert.equal(shouldCollapseUserPrompt('a\nb\nc\nd'), true);
  assert.equal(shouldCollapseUserPrompt('x'.repeat(185)), true);
});

test('code block meta infers clean titles and collapses large snippets', () => {
  const html = '<!doctype html><html><head><title>Pricing Grid</title></head><body>' +
    '\n<section>Card</section>'.repeat(10) +
    '</body></html>';
  const meta = getCodeBlockDisplayMeta(html, 'html');
  assert.equal(meta.collapseByDefault, true);
  assert.equal(meta.inferredTitle, 'Pricing Grid');
  assert.equal(meta.canLivePreview, true);

  const tiny = getCodeBlockDisplayMeta('const x = 1;', 'ts');
  assert.equal(tiny.collapseByDefault, false);
});

test('voice waveform gates room noise and shifts latest amplitude on the right', () => {
  const quiet = new Uint8Array(64).fill(128);
  assert.equal(computeVoiceEnergy(quiet, new Uint8Array(32)), WAVEFORM_IDLE_LEVEL);

  const loud = new Uint8Array(64).map((_, i) => (i % 2 === 0 ? 200 : 56));
  const energy = computeVoiceEnergy(loud, new Uint8Array(32).fill(140));
  assert.ok(energy > 0.5);

  const arr = shiftWaveformHistory([], energy, WAVEFORM_BAR_COUNT);
  assert.equal(arr.length, WAVEFORM_BAR_COUNT);
  assert.ok(arr[WAVEFORM_BAR_COUNT - 1] > 0.4);
});
