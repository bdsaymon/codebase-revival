import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { bilingualSpeechPlayer } from '../smfta/src/utils/voiceEngine';

class MockUtterance {
  text: string;
  lang = '';
  voice: unknown = null;
  rate = 1;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(text?: string) {
    this.text = text || '';
  }
}

interface MockSynthState {
  utterances: MockUtterance[];
  cancelCalls: number;
  speakCalls: number;
}

function installMockSpeechSynthesis(state: MockSynthState) {
  const synth = {
    getVoices: () => [],
    speak(utterance: MockUtterance) {
      state.speakCalls += 1;
      state.utterances.push(utterance);
    },
    cancel() {
      state.cancelCalls += 1;
    },
    pause() {},
    resume() {},
    pending: false,
    speaking: false,
    paused: false,
  };
  Object.defineProperties(window, {
    speechSynthesis: {
      configurable: true,
      writable: true,
      value: synth,
    },
    SpeechSynthesisUtterance: {
      configurable: true,
      writable: true,
      value: MockUtterance,
    },
  });
}

describe('BilingualSpeechPlayer completion safety (Live Voice hang fix)', () => {
  const state: MockSynthState = {
    utterances: [],
    cancelCalls: 0,
    speakCalls: 0,
  };

  beforeEach(() => {
    state.utterances = [];
    state.cancelCalls = 0;
    state.speakCalls = 0;
    installMockSpeechSynthesis(state);
  });

  afterEach(() => {
    bilingualSpeechPlayer.stop();
    delete (window as unknown as Record<string, unknown>).speechSynthesis;
    delete (window as unknown as Record<string, unknown>).SpeechSynthesisUtterance;
  });

  it('resolves onDone when speech is cancelled mid-fallback (barge-in / stop)', async () => {
    // Promise wrapper so no callback-hang can stall the test
    let resolved = false;
    const done = new Promise<void>((resolve) => {
      bilingualSpeechPlayer.speak({
        text: 'হ্যালো কীভাবে সাহায্য করতে পারি?',
        msgId: `live-hang-test-${Date.now()}`,
        skipServerTts: true,
        onDone: () => {
          resolved = true;
          resolve();
        },
      });
    });

    // Wait one tick so the browser fallback actually starts speaking utterances
    await new Promise((r) => setTimeout(r, 30));
    expect(state.speakCalls).toBeGreaterThan(0);

    // Simulate barge-in: the overlay stops the player mid-speech
    bilingualSpeechPlayer.stop();

    const outcome = await Promise.race([
      done.then(() => 'resolved'),
      new Promise((r) => setTimeout(() => r('timeout'), 400)),
    ]);
    expect(outcome).toBe('resolved');
    expect(resolved).toBe(true);
  });

  it('fires onDone exactly once for a completed browser fallback chain', async () => {
    let calls = 0;
    const done = new Promise<void>((resolve) => {
      bilingualSpeechPlayer.speak({
        text: 'Hello there! How are you doing today?',
        msgId: `live-chain-test-${Date.now()}`,
        skipServerTts: true,
        onDone: () => {
          calls += 1;
          resolve();
        },
      });
    });
    await new Promise((r) => setTimeout(r, 30));
    // Simulate the last utterance ending naturally
    const utter = state.utterances[state.utterances.length - 1];
    expect(utter).toBeTruthy();
    utter.onend?.();

    const outcome = await Promise.race([
      done.then(() => 'resolved'),
      new Promise((r) => setTimeout(() => r('timeout'), 400)),
    ]);
    expect(outcome).toBe('resolved');
    expect(calls).toBe(1);
  });

  it('resolves immediately for empty text and never hangs', async () => {
    const done = new Promise<void>((resolve) => {
      bilingualSpeechPlayer.speak({
        text: '',
        msgId: `live-empty-test-${Date.now()}`,
        onDone: () => resolve(),
      });
    });
    const outcome = await Promise.race([
      done.then(() => 'resolved'),
      new Promise((r) => setTimeout(() => r('timeout'), 300)),
    ]);
    expect(outcome).toBe('resolved');
  });
});
