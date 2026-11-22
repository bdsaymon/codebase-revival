/**
 * Pure real-time Voice Mode session logic:
 *  - Deterministic connection & conversation state machine
 *  - Adaptive RMS Voice Activity Detection (VAD) with noise-floor tracking
 *  - Echo-guarded Barge-In (interruption) detector
 *  - Empty/silence/duplicate utterance guards
 *  - One-time bilingual greeting formatter
 */

export type VoiceConnectionState =
  | 'connecting'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'reconnecting'
  | 'disconnected';

export interface VoiceStateInputs {
  isOffline: boolean;
  isDisconnected: boolean;
  isReconnecting: boolean;
  isConnecting: boolean;
  isAiSpeaking: boolean;
  isGenerating: boolean;
  isTranscribing: boolean;
  isSynthesizing: boolean;
  isListening: boolean;
}

export function deriveVoiceSessionState(
  inputs: VoiceStateInputs
): VoiceConnectionState {
  if (inputs.isDisconnected) return 'disconnected';
  if (inputs.isOffline || inputs.isReconnecting) return 'reconnecting';
  if (inputs.isConnecting) return 'connecting';
  if (inputs.isAiSpeaking) return 'speaking';
  if (inputs.isGenerating || inputs.isTranscribing || inputs.isSynthesizing) {
    return 'thinking';
  }
  if (inputs.isListening) return 'listening';
  return 'listening';
}

export interface VadConfig {
  minSpeechThreshold: number;
  releaseRatio: number;
  minSpeechDurationMs: number;
  endOfSpeechSilenceMs: number;
  maxUtteranceMs: number;
}

export const DEFAULT_VAD_CONFIG: VadConfig = {
  minSpeechThreshold: 0.011,
  releaseRatio: 0.62,
  minSpeechDurationMs: 170,
  endOfSpeechSilenceMs: 720,
  maxUtteranceMs: 20000,
};

export interface VadTrackerState {
  noiseFloor: number;
  isVoiceActive: boolean;
  speechStartedAt: number | null;
  speechConfirmed: boolean;
  lastVoiceAt: number | null;
  peakRms: number;
  activeMs: number;
  lastStepAt: number | null;
}

export interface VadStepResult {
  nextState: VadTrackerState;
  action: 'idle' | 'speech_start' | 'speaking' | 'commit';
  speechThreshold: number;
  normalizedLevel: number;
}

export function createVadTracker(initialNoiseFloor = 0.005): VadTrackerState {
  return {
    noiseFloor: initialNoiseFloor,
    isVoiceActive: false,
    speechStartedAt: null,
    speechConfirmed: false,
    lastVoiceAt: null,
    peakRms: 0,
    activeMs: 0,
    lastStepAt: null,
  };
}

/**
 * Computes normalized 0..1 RMS energy from AnalyserNode getByteTimeDomainData().
 */
export function computeRmsEnergy(samples: Uint8Array): number {
  if (!samples || samples.length === 0) return 0;
  let sumSq = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const centered = (samples[i]! - 128) / 128;
    sumSq += centered * centered;
  }
  const rms = Math.sqrt(sumSq / samples.length);
  return Math.min(1, Math.max(0, rms));
}

export function stepVadTracker(
  prev: VadTrackerState,
  rms: number,
  nowMs: number,
  config: VadConfig = DEFAULT_VAD_CONFIG
): VadStepResult {
  const safeRms = Number.isFinite(rms) ? Math.max(0, Math.min(1, rms)) : 0;
  const dt =
    prev.lastStepAt !== null && nowMs >= prev.lastStepAt
      ? Math.min(250, nowMs - prev.lastStepAt)
      : 16;

  // Adapt ambient noise floor gently only when NOT confirmed speaking
  let noiseFloor = prev.noiseFloor;
  if (!prev.isVoiceActive) {
    const targetFloor = Math.min(0.035, Math.max(0.003, safeRms));
    const alpha = targetFloor < noiseFloor ? 0.1 : 0.02;
    noiseFloor = noiseFloor + (targetFloor - noiseFloor) * alpha;
  }

  const speechThreshold = Math.max(
    config.minSpeechThreshold,
    noiseFloor * 1.85 + 0.006
  );
  const releaseThreshold = speechThreshold * config.releaseRatio;

  const isAboveOnset = safeRms >= speechThreshold;
  const isAboveRelease = safeRms >= releaseThreshold;
  const normalizedLevel = Math.min(
    1,
    Math.max(0, (safeRms - noiseFloor) / Math.max(0.05, speechThreshold * 2.4))
  );

  let isVoiceActive = prev.isVoiceActive;
  let speechStartedAt = prev.speechStartedAt;
  let speechConfirmed = prev.speechConfirmed;
  let lastVoiceAt = prev.lastVoiceAt;
  let peakRms = prev.peakRms;
  let activeMs = prev.activeMs;
  let action: VadStepResult['action'] = 'idle';

  if (isAboveOnset || (isVoiceActive && isAboveRelease)) {
    if (!isVoiceActive) {
      isVoiceActive = true;
      speechStartedAt = speechStartedAt ?? nowMs;
    }
    lastVoiceAt = nowMs;
    peakRms = Math.max(peakRms, safeRms);
    activeMs += dt;

    if (!speechConfirmed && activeMs >= config.minSpeechDurationMs) {
      speechConfirmed = true;
      action = 'speech_start';
    } else if (speechConfirmed) {
      action = 'speaking';
    }

    if (
      speechConfirmed &&
      speechStartedAt !== null &&
      nowMs - speechStartedAt >= config.maxUtteranceMs
    ) {
      return {
        nextState: createVadTracker(noiseFloor),
        action: 'commit',
        speechThreshold,
        normalizedLevel,
      };
    }
  } else {
    isVoiceActive = false;

    if (speechConfirmed && lastVoiceAt !== null) {
      const silenceElapsed = nowMs - lastVoiceAt;
      if (silenceElapsed >= config.endOfSpeechSilenceMs) {
        return {
          nextState: createVadTracker(noiseFloor),
          action: 'commit',
          speechThreshold,
          normalizedLevel,
        };
      }
      action = 'speaking';
    } else if (!speechConfirmed && lastVoiceAt !== null && nowMs - lastVoiceAt > 360) {
      // Short transient click/pop never reached minSpeechDurationMs — reset cleanly!
      speechStartedAt = null;
      lastVoiceAt = null;
      peakRms = 0;
      activeMs = 0;
    }
  }

  return {
    nextState: {
      noiseFloor,
      isVoiceActive,
      speechStartedAt,
      speechConfirmed,
      lastVoiceAt,
      peakRms,
      activeMs,
      lastStepAt: nowMs,
    },
    action,
    speechThreshold,
    normalizedLevel,
  };
}

export interface BargeInState {
  sustainedMs: number;
  lastStepAt: number | null;
}

export interface BargeInOptions {
  rms: number;
  nowMs: number;
  aiSpeakingStartedAt: number;
  echoGuardMs?: number;
  threshold?: number;
  requiredDurationMs?: number;
}

export function createBargeInState(): BargeInState {
  return { sustainedMs: 0, lastStepAt: null };
}

/**
 * Echo-guarded barge-in detector: triggers interruption only when sustained
 * vocal energy exceeds threshold after the speaker onset guard window.
 */
export function stepBargeInDetector(
  prev: BargeInState,
  opts: BargeInOptions
): { nextState: BargeInState; shouldInterrupt: boolean } {
  const echoGuardMs = opts.echoGuardMs ?? 480;
  const threshold = opts.threshold ?? 0.088;
  const requiredDurationMs = opts.requiredDurationMs ?? 240;

  if (opts.nowMs - opts.aiSpeakingStartedAt < echoGuardMs) {
    return {
      nextState: { sustainedMs: 0, lastStepAt: opts.nowMs },
      shouldInterrupt: false,
    };
  }

  const dt =
    prev.lastStepAt !== null && opts.nowMs >= prev.lastStepAt
      ? Math.min(180, opts.nowMs - prev.lastStepAt)
      : 16;

  if (opts.rms >= threshold) {
    const sustainedMs = prev.sustainedMs + dt;
    if (sustainedMs >= requiredDurationMs) {
      return {
        nextState: { sustainedMs: 0, lastStepAt: opts.nowMs },
        shouldInterrupt: true,
      };
    }
    return {
      nextState: { sustainedMs, lastStepAt: opts.nowMs },
      shouldInterrupt: false,
    };
  }

  // Decay swiftly on quiet frames so isolated pops cannot accumulate
  return {
    nextState: {
      sustainedMs: Math.max(0, prev.sustainedMs - dt * 2),
      lastStepAt: opts.nowMs,
    },
    shouldInterrupt: false,
  };
}

// Common silent-audio STT hallucinations that must never be submitted as commands
const SILENCE_HALLUCINATION_RE =
  /^(?:\.+|,+|\?+|!+|-+|—+|uh+|um+|hmm+|hm+|ah+|oh+|thank you\.?|thanks for watching\.?|bye\.?|subtitle[s]? by.*|\[.*\]|\(.*\))$/i;

export function sanitizeVoiceUtterance(rawText: string): string {
  if (!rawText) return '';
  return rawText
    .replace(/<think>[\s\S]*?<\/think>/gi, ' ')
    .replace(/<\/?think>/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface UtteranceGuardInput {
  rawText: string;
  hadRealSpeechEnergy: boolean;
  lastSubmitted: { text: string; at: number } | null;
  nowMs: number;
  dedupWindowMs?: number;
}

export function shouldSubmitVoiceUtterance(
  input: UtteranceGuardInput
): { accept: boolean; cleanText: string; reason?: string } {
  const cleanText = sanitizeVoiceUtterance(input.rawText);
  if (!cleanText) {
    return { accept: false, cleanText: '', reason: 'empty' };
  }

  // Reject punctuation-only or single meaningless symbol
  const meaningfulChars = cleanText.replace(/[\s.,!?;:'"`~@#$%^&*()\-_=+\[\]{}|\\/<>।]+/g, '');
  if (meaningfulChars.length === 0) {
    return { accept: false, cleanText: '', reason: 'punctuation_only' };
  }

  // Reject well-known silent-audio STT hallucinations if no strong vocal energy occurred
  if (!input.hadRealSpeechEnergy && SILENCE_HALLUCINATION_RE.test(cleanText)) {
    return { accept: false, cleanText: '', reason: 'silence_hallucination' };
  }

  // Deduplicate identical utterance submitted within short window
  const dedupWindowMs = input.dedupWindowMs ?? 2500;
  if (
    input.lastSubmitted &&
    input.lastSubmitted.text.toLowerCase() === cleanText.toLowerCase() &&
    input.nowMs - input.lastSubmitted.at < dedupWindowMs
  ) {
    return { accept: false, cleanText: '', reason: 'duplicate' };
  }

  return { accept: true, cleanText };
}

/**
 * Generates a concise, natural one-time voice greeting in Bengali or English.
 */
export function buildVoiceGreeting(
  userName?: string,
  preferredLang?: string
): string {
  const firstName = (userName || '')
    .trim()
    .split(/\s+/)[0]
    ?.replace(/[^\p{L}\p{N}'-]/gu, '') || '';

  const isBengali = /^bn\b/i.test((preferredLang || '').trim());
  if (isBengali) {
    return firstName
      ? `হ্যালো ${firstName}, আমি স্মার্ট ভয়েস অ্যাসিস্ট্যান্ট। বলুন, কীভাবে সাহায্য করতে পারি?`
      : 'হ্যালো, আমি SMFTA AI। বলুন, কীভাবে সাহায্য করতে পারি?';
  }
  return firstName
    ? `Hello ${firstName}, I'm SMFTA AI. How can I help you today?`
    : "Hello, I'm SMFTA AI. How can I help you today?";
}
