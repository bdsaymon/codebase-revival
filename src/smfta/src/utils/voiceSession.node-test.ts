import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildVoiceGreeting,
  computeRmsEnergy,
  createBargeInState,
  createVadTracker,
  DEFAULT_VAD_CONFIG,
  deriveVoiceSessionState,
  sanitizeVoiceUtterance,
  shouldSubmitVoiceUtterance,
  stepBargeInDetector,
  stepVadTracker,
} from './voiceSession';

describe('voiceSession pure state & VAD logic', () => {
  it('computes 0 RMS for flat silence and higher RMS for vocal waveform', () => {
    const silence = new Uint8Array(256).fill(128);
    assert.equal(computeRmsEnergy(silence), 0);

    const tone = new Uint8Array(256);
    for (let i = 0; i < tone.length; i += 1) {
      tone[i] = Math.round(128 + Math.sin(i * 0.4) * 50);
    }
    const energy = computeRmsEnergy(tone);
    assert.ok(energy > 0.25 && energy < 0.35, `unexpected energy ${energy}`);
  });

  it('never commits on continuous silence or brief keyboard clicks', () => {
    let vad = createVadTracker(0.005);
    let t = 0;
    // 3 seconds of quiet ambient room floor
    for (let i = 0; i < 60; i += 1) {
      t += 50;
      const res = stepVadTracker(vad, 0.004, t);
      vad = res.nextState;
      assert.notEqual(res.action, 'commit');
    }

    // Brief 100ms loud click/tap (below minSpeechDurationMs = 170ms)
    for (let i = 0; i < 2; i += 1) {
      t += 50;
      const res = stepVadTracker(vad, 0.18, t);
      vad = res.nextState;
      assert.notEqual(res.action, 'commit');
    }

    // Followed by 2 seconds of silence — must STILL never commit!
    for (let i = 0; i < 40; i += 1) {
      t += 50;
      const res = stepVadTracker(vad, 0.004, t);
      vad = res.nextState;
      assert.notEqual(res.action, 'commit');
    }
    assert.equal(vad.speechConfirmed, false);
  });

  it('reliably detects soft mobile microphone speech (RMS 0.018) and commits swiftly', () => {
    let vad = createVadTracker(0.005);
    let t = 0;
    let sawSpeechStart = false;
    let committedAt = -1;

    // 400ms of soft conversational phone-mic speech (RMS 0.018)
    for (let i = 0; i < 8; i += 1) {
      t += 50;
      const res = stepVadTracker(vad, 0.018, t, DEFAULT_VAD_CONFIG);
      vad = res.nextState;
      if (res.action === 'speech_start') sawSpeechStart = true;
    }
    assert.equal(sawSpeechStart, true);
    assert.equal(vad.speechConfirmed, true);

    // 800ms trailing silence -> should auto-commit swiftly (~720ms)
    const speechEnd = t;
    for (let i = 0; i < 20; i += 1) {
      t += 50;
      const res = stepVadTracker(vad, 0.004, t, DEFAULT_VAD_CONFIG);
      vad = res.nextState;
      if (res.action === 'commit') {
        committedAt = t - speechEnd;
        break;
      }
    }
    assert.ok(committedAt >= 700 && committedAt <= 850, `expected crisp commit ~720ms, got ${committedAt}ms`);
  });

  it('detects real speech and auto-commits cleanly after end-of-speech silence', () => {
    let vad = createVadTracker(0.01);
    let t = 0;
    let sawSpeechStart = false;
    let committed = false;

    // 600ms of real speech (RMS 0.14)
    for (let i = 0; i < 12; i += 1) {
      t += 50;
      const res = stepVadTracker(vad, 0.14, t, DEFAULT_VAD_CONFIG);
      vad = res.nextState;
      if (res.action === 'speech_start') sawSpeechStart = true;
    }
    assert.equal(sawSpeechStart, true);
    assert.equal(vad.speechConfirmed, true);

    // 1.3s of trailing silence -> should commit once
    for (let i = 0; i < 26; i += 1) {
      t += 50;
      const res = stepVadTracker(vad, 0.008, t, DEFAULT_VAD_CONFIG);
      vad = res.nextState;
      if (res.action === 'commit') {
        committed = true;
        break;
      }
    }
    assert.equal(committed, true);
    // Tracker resets cleanly after commit
    assert.equal(vad.speechConfirmed, false);
  });

  it('guards barge-in during echo window and triggers on sustained user speech', () => {
    let state = createBargeInState();
    const aiStart = 1000;

    // Loud burst during echo-guard window (1000..1450ms) must NOT trigger
    for (let t = 1050; t <= 1450; t += 50) {
      const res = stepBargeInDetector(state, {
        rms: 0.25,
        nowMs: t,
        aiSpeakingStartedAt: aiStart,
      });
      state = res.nextState;
      assert.equal(res.shouldInterrupt, false);
    }

    // Sustained user speech after echo guard (1550..1850ms) MUST trigger
    let triggered = false;
    for (let t = 1550; t <= 1900; t += 50) {
      const res = stepBargeInDetector(state, {
        rms: 0.15,
        nowMs: t,
        aiSpeakingStartedAt: aiStart,
      });
      state = res.nextState;
      if (res.shouldInterrupt) {
        triggered = true;
        break;
      }
    }
    assert.equal(triggered, true);
  });

  it('rejects empty, punctuation-only, silence-hallucination, and duplicate utterances', () => {
    assert.equal(
      shouldSubmitVoiceUtterance({
        rawText: '   ',
        hadRealSpeechEnergy: true,
        lastSubmitted: null,
        nowMs: 1000,
      }).accept,
      false
    );

    assert.equal(
      shouldSubmitVoiceUtterance({
        rawText: '... !? ।',
        hadRealSpeechEnergy: true,
        lastSubmitted: null,
        nowMs: 1000,
      }).accept,
      false
    );

    assert.equal(
      shouldSubmitVoiceUtterance({
        rawText: 'Thank you.',
        hadRealSpeechEnergy: false,
        lastSubmitted: null,
        nowMs: 1000,
      }).accept,
      false
    );

    const validBn = shouldSubmitVoiceUtterance({
      rawText: '<think>secret</think> আজকের আবহাওয়া কেমন?',
      hadRealSpeechEnergy: true,
      lastSubmitted: null,
      nowMs: 2000,
    });
    assert.equal(validBn.accept, true);
    assert.equal(validBn.cleanText, 'আজকের আবহাওয়া কেমন?');

    // Duplicate within 2.5s rejected
    const dup = shouldSubmitVoiceUtterance({
      rawText: 'আজকের আবহাওয়া কেমন?',
      hadRealSpeechEnergy: true,
      lastSubmitted: { text: validBn.cleanText, at: 2000 },
      nowMs: 3200,
    });
    assert.equal(dup.accept, false);
    assert.equal(dup.reason, 'duplicate');
  });

  it('derives all 6 real connection states accurately', () => {
    const base = {
      isOffline: false,
      isDisconnected: false,
      isReconnecting: false,
      isConnecting: false,
      isAiSpeaking: false,
      isGenerating: false,
      isTranscribing: false,
      isSynthesizing: false,
      isListening: true,
    };
    assert.equal(deriveVoiceSessionState({ ...base, isConnecting: true }), 'connecting');
    assert.equal(deriveVoiceSessionState({ ...base }), 'listening');
    assert.equal(deriveVoiceSessionState({ ...base, isGenerating: true }), 'thinking');
    assert.equal(deriveVoiceSessionState({ ...base, isAiSpeaking: true }), 'speaking');
    assert.equal(deriveVoiceSessionState({ ...base, isOffline: true }), 'reconnecting');
    assert.equal(deriveVoiceSessionState({ ...base, isDisconnected: true }), 'disconnected');
  });

  it('formats concise bilingual one-time greetings and strips think tags', () => {
    assert.equal(sanitizeVoiceUtterance('<think>abc</think> Hello!'), 'Hello!');
    const en = buildVoiceGreeting('Saymon Hasan', 'en-US');
    assert.ok(en.includes('Saymon') && en.includes('SMFTA AI'));
    const bn = buildVoiceGreeting('', 'bn-BD');
    assert.ok(bn.includes('হ্যালো') && bn.includes('SMFTA AI'));
  });
});
