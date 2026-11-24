import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildUnifiedVoiceTimeline,
  buildVoiceGreeting,
  collectLiveConversationImages,
  computeRmsEnergy,
  computeVocalEnergy,
  createBargeInState,
  createVadTracker,
  DEFAULT_VAD_CONFIG,
  deriveVoiceSessionState,
  formatVoiceTimelineTimestamp,
  sanitizeVoiceUtterance,
  shouldActivateMicForTurn,
  shouldAllowBargeIn,
  shouldSubmitVoiceUtterance,
  stepBargeInDetector,
  stepVadTracker,
  stripInlineFileBlocksForVoiceTimeline,
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

    // Vocal frequency bins boost compressed time-domain mobile mic input
    const freq = new Uint8Array(64).fill(0);
    for (let b = 4; b <= 18; b += 1) freq[b] = 95;
    const boosted = computeVocalEnergy(silence, freq);
    assert.ok(boosted >= 0.02, `expected vocal frequency boost >= 0.02, got ${boosted}`);
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

    // Brief 100ms loud click/tap (below minSpeechDurationMs = 150ms)
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

  it('reliably detects soft mobile microphone speech (RMS 0.011) and commits swiftly', () => {
    let vad = createVadTracker(0.004);
    let t = 0;
    let sawSpeechStart = false;
    let committedAt = -1;

    // 400ms of soft conversational phone-mic speech (RMS 0.011)
    for (let i = 0; i < 8; i += 1) {
      t += 50;
      const res = stepVadTracker(vad, 0.011, t, DEFAULT_VAD_CONFIG);
      vad = res.nextState;
      if (res.action === 'speech_start') sawSpeechStart = true;
    }
    assert.equal(sawSpeechStart, true);
    assert.equal(vad.speechConfirmed, true);

    // 1550ms trailing silence -> should auto-commit cleanly (~1500ms)
    const speechEnd = t;
    for (let i = 0; i < 40; i += 1) {
      t += 50;
      const res = stepVadTracker(vad, 0.003, t, DEFAULT_VAD_CONFIG);
      vad = res.nextState;
      if (res.action === 'commit') {
        committedAt = t - speechEnd;
        break;
      }
    }
    assert.ok(committedAt >= 1450 && committedAt <= 1600, `expected crisp commit ~1500ms, got ${committedAt}ms`);
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

    // 1.7s of trailing silence -> should commit once after 1500ms
    for (let i = 0; i < 34; i += 1) {
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

  it('supports tightened Live Voice barge-in config (echoGuardMs: 340, requiredDurationMs: 180)', () => {
    let state = createBargeInState();
    const aiStart = 2000;

    for (let t = 2050; t <= 2300; t += 50) {
      const res = stepBargeInDetector(state, {
        rms: 0.2,
        nowMs: t,
        aiSpeakingStartedAt: aiStart,
        echoGuardMs: 340,
        requiredDurationMs: 180,
        threshold: 0.055,
      });
      state = res.nextState;
      assert.equal(res.shouldInterrupt, false);
    }

    let interrupted = false;
    for (let t = 2360; t <= 2650; t += 50) {
      const res = stepBargeInDetector(state, {
        rms: 0.14,
        nowMs: t,
        aiSpeakingStartedAt: aiStart,
        echoGuardMs: 340,
        requiredDurationMs: 180,
        threshold: 0.055,
      });
      state = res.nextState;
      if (res.shouldInterrupt) {
        interrupted = true;
        break;
      }
    }
    assert.equal(interrupted, true);
  });

  it('collects staged and conversation images in clean preview order without duplicates', () => {
    const sampleImg1 = {
      mime: 'image/png',
      data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      name: 'diagram.png',
    };
    const sampleImg2 = {
      mime: 'image/jpeg',
      data: '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAEBAQEBAQEBAQE=',
      url: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAEBAQEBAQEBAQE=',
      name: 'circuit.jpg',
    };

    const collected = collectLiveConversationImages({
      stagedImgs: [sampleImg1],
      messages: [
        {
          id: 'm1',
          role: 'user',
          text: 'Check this circuit',
          ts: 1700000000000,
          imgs: [sampleImg2, sampleImg1], // sampleImg1 is already staged, should dedup
        },
      ],
      nowMs: 1700000050000,
    });

    assert.equal(collected.length, 2);
    assert.equal(collected[0]!.isStaged, true);
    assert.equal(collected[0]!.name, 'diagram.png');
    assert.equal(collected[1]!.isStaged, false);
    assert.equal(collected[1]!.name, 'circuit.jpg');
  });

  it('builds a unified chronological timeline with mixed images, partial transcripts, and streaming AI responses', () => {
    const sampleImg = {
      mime: 'image/png',
      data: 'abc123base64',
      url: 'data:image/png;base64,abc123base64',
      name: 'ui-mockup.png',
    };

    const timeline = buildUnifiedVoiceTimeline({
      messages: [
        {
          id: 'u-1',
          role: 'user',
          text: 'What do you see in this UI screenshot?\n\n⟦FILE:notes.md⟧# Some notes⟦/FILE⟧',
          ts: 1700000001000,
          imgs: [sampleImg],
        },
        {
          id: 'a-1',
          role: 'ai',
          text: 'I see a dark glassmorphic dashboard with a cyan waveform.',
          ts: 1700000002000,
          status: 'streaming',
          thinking: 'Analyzing image regions',
        },
      ],
      liveFinalText: 'Can you also check',
      liveInterimText: 'the contrast ratio',
      isGenerating: true,
      userName: 'Saymon',
      voiceName: 'Kore',
      voiceLang: 'en-US',
      nowMs: 1700000003000,
    });

    assert.equal(timeline.length, 3);

    // 1. Finalized user message with mixed image, text, and extracted file badge
    const userMsg = timeline[0]!;
    assert.equal(userMsg.role, 'user');
    assert.equal(userMsg.ownerLabel, 'Saymon');
    assert.equal(userMsg.transcriptState, 'finalized');
    assert.equal(userMsg.text, 'What do you see in this UI screenshot?');
    assert.equal(userMsg.imgs.length, 1);
    assert.equal(userMsg.imgs[0]!.name, 'ui-mockup.png');
    assert.deepEqual(userMsg.attachedFileNames, ['notes.md']);
    assert.ok(userMsg.formattedTime.length > 0);

    // 2. Streaming AI message
    const aiMsg = timeline[1]!;
    assert.equal(aiMsg.role, 'ai');
    assert.equal(aiMsg.ownerLabel, 'Kore · AI');
    assert.equal(aiMsg.streamState, 'streaming');
    assert.equal(aiMsg.thinkingText, 'Analyzing image regions');
    assert.ok(aiMsg.text.includes('dark glassmorphic dashboard'));

    // 3. Real-time partial user speech transcription
    const partialMsg = timeline[2]!;
    assert.equal(partialMsg.role, 'user');
    assert.equal(partialMsg.transcriptState, 'partial');
    assert.equal(partialMsg.confirmedPrefix, 'Can you also check');
    assert.equal(partialMsg.partialInterimText, 'the contrast ratio');
    assert.equal(partialMsg.text, 'Can you also check the contrast ratio');
  });

  it('strips inline file blocks and formats timestamps cleanly', () => {
    const stripped = stripInlineFileBlocksForVoiceTimeline(
      'Review this file\n\n⟦FILE:app.tsx⟧const x = 1;⟦/FILE⟧'
    );
    assert.equal(stripped.cleanText, 'Review this file');
    assert.deepEqual(stripped.attachedFileNames, ['app.tsx']);
    assert.ok(formatVoiceTimelineTimestamp(1700000000000).includes(':'));
  });

  it('blocks microphone activation and barge-in during initial greeting synthesis', () => {
    const idleGate = {
      isOpen: true,
      isDisconnected: false,
      isOffline: false,
      isConnecting: false,
      isGenerating: false,
      isTranscribingTurn: false,
      isSynthesizingVoice: false,
      isAiSpeaking: false,
      isInitialGreetingPending: false,
      pipelineBusy: false,
      pendingChunkCount: 0,
      activeSourceCount: 0,
      hasPendingAudioBuffer: false,
    };
    assert.equal(shouldActivateMicForTurn(idleGate), true);
    assert.equal(
      shouldActivateMicForTurn({ ...idleGate, isInitialGreetingPending: true }),
      false
    );
    assert.equal(
      shouldActivateMicForTurn({ ...idleGate, isConnecting: true }),
      false
    );
    assert.equal(
      shouldActivateMicForTurn({ ...idleGate, hasPendingAudioBuffer: true }),
      false
    );

    // Barge-in must never fire while initial greeting is synthesizing before playback
    assert.equal(
      shouldAllowBargeIn({
        voiceState: 'thinking',
        isAiSpeaking: false,
        isMuted: false,
        isInitialGreetingPending: true,
        aiSpeakingStartedAt: 0,
      }),
      false
    );
    assert.equal(
      shouldAllowBargeIn({
        voiceState: 'speaking',
        isAiSpeaking: true,
        isMuted: false,
        isInitialGreetingPending: false,
        aiSpeakingStartedAt: 12345,
      }),
      true
    );
  });

  it('deduplicates staged images and omits staged images from live partial speech bubbles', () => {
    const dupImg = {
      mime: 'image/png',
      data: 'sameBase64Payload==',
      url: 'data:image/png;base64,sameBase64Payload==',
      name: 'photo.png',
    };
    const collected = collectLiveConversationImages({
      stagedImgs: [dupImg, { ...dupImg }],
      messages: [],
      nowMs: 1700000000000,
    });
    assert.equal(collected.length, 1);

    const timeline = buildUnifiedVoiceTimeline({
      messages: [],
      liveFinalText: 'Look at',
      liveInterimText: 'this picture',
      stagedImgs: [dupImg],
      isGenerating: false,
      voiceLang: 'en-US',
      nowMs: 1700000005000,
    });
    const partialEntry = timeline.find((e) => e.id === 'live-partial-speech');
    assert.ok(partialEntry);
    assert.deepEqual(partialEntry.imgs, []);
  });
});



