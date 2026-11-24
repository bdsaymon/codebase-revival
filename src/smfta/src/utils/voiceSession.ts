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
  if (inputs.isOffline || inputs.isReconnecting) return 'reconnecting';
  if (inputs.isAiSpeaking) return 'speaking';
  if (inputs.isGenerating || inputs.isTranscribing || inputs.isSynthesizing) {
    return 'thinking';
  }
  if (inputs.isDisconnected) return 'disconnected';
  if (inputs.isConnecting) return 'connecting';
  if (inputs.isListening) return 'listening';
  return 'listening';
}

export interface MicActivationGateInputs {
  isOpen: boolean;
  isDisconnected: boolean;
  isOffline: boolean;
  isConnecting: boolean;
  isGenerating: boolean;
  isTranscribingTurn: boolean;
  isSynthesizingVoice: boolean;
  isAiSpeaking: boolean;
  isInitialGreetingPending: boolean;
  pipelineBusy: boolean;
  pendingChunkCount: number;
  activeSourceCount: number;
  hasPendingAudioBuffer?: boolean;
}

/**
 * Prevents microphone turn activation while initial greeting synthesis or
 * active AI speech/TTS pipelines are still pending or playing.
 */
export function shouldActivateMicForTurn(inputs: MicActivationGateInputs): boolean {
  if (!inputs.isOpen) return false;
  if (inputs.isDisconnected || inputs.isOffline || inputs.isConnecting) return false;
  if (inputs.isGenerating || inputs.isTranscribingTurn) return false;
  if (inputs.isInitialGreetingPending) return false;
  if (inputs.isSynthesizingVoice || inputs.isAiSpeaking) return false;
  if (inputs.hasPendingAudioBuffer) return false;
  if (inputs.pipelineBusy || inputs.pendingChunkCount > 0 || inputs.activeSourceCount > 0) {
    return false;
  }
  return true;
}

export interface BargeInGateInputs {
  voiceState: VoiceConnectionState;
  isAiSpeaking: boolean;
  isMuted: boolean;
  isInitialGreetingPending: boolean;
  aiSpeakingStartedAt: number;
}

/**
 * Only allows acoustic barge-in after AI playback has actually started,
 * never during initial greeting synthesis before audio playback begins.
 */
export function shouldAllowBargeIn(inputs: BargeInGateInputs): boolean {
  if (inputs.isMuted || inputs.isInitialGreetingPending) return false;
  if (inputs.voiceState !== 'speaking' || !inputs.isAiSpeaking) return false;
  return inputs.aiSpeakingStartedAt > 0;
}

export interface VadConfig {
  minSpeechThreshold: number;
  releaseRatio: number;
  minSpeechDurationMs: number;
  endOfSpeechSilenceMs: number;
  maxUtteranceMs: number;
}

export const DEFAULT_VAD_CONFIG: VadConfig = {
  minSpeechThreshold: 0.0075,
  releaseRatio: 0.58,
  minSpeechDurationMs: 150,
  endOfSpeechSilenceMs: 1500,
  maxUtteranceMs: 180000,
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

export function createVadTracker(initialNoiseFloor = 0.004): VadTrackerState {
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

/**
 * Combines time-domain RMS with human vocal-band frequency energy (bins 2..32)
 * so quiet mobile microphones with aggressive hardware echo cancellation still
 * register clear vocal energy when the user speaks.
 */
export function computeVocalEnergy(
  timeDomainSamples: Uint8Array,
  freqSamples?: Uint8Array
): number {
  const timeRms = computeRmsEnergy(timeDomainSamples);
  if (!freqSamples || freqSamples.length < 8) return timeRms;
  const startBin = 2;
  const endBin = Math.min(32, freqSamples.length - 1);
  if (endBin <= startBin) return timeRms;
  let sum = 0;
  let peakBin = 0;
  for (let i = startBin; i <= endBin; i += 1) {
    const val = freqSamples[i] || 0;
    sum += val;
    if (val > peakBin) peakBin = val;
  }
  const count = endBin - startBin + 1;
  const avgNorm = sum / (count * 255);
  const peakNorm = peakBin / 255;
  // Require both vocal-band harmonic presence and a distinct formant peak above flat hiss
  const freqEnergy =
    peakNorm > 0.14 ? Math.min(1, avgNorm * 0.22 + Math.max(0, peakNorm - 0.14) * 0.08) : 0;
  return Math.min(1, Math.max(timeRms, freqEnergy));
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
    const targetFloor = Math.min(0.014, Math.max(0.0025, safeRms));
    const alpha = targetFloor < noiseFloor ? 0.12 : 0.018;
    noiseFloor = noiseFloor + (targetFloor - noiseFloor) * alpha;
  }

  const speechThreshold = Math.max(
    config.minSpeechThreshold,
    noiseFloor * 1.6 + 0.004
  );
  const releaseThreshold = speechThreshold * config.releaseRatio;

  const isAboveOnset = safeRms >= speechThreshold;
  const isAboveRelease = safeRms >= releaseThreshold;
  const normalizedLevel = Math.min(
    1,
    Math.max(0, (safeRms - noiseFloor) / Math.max(0.04, speechThreshold * 2.4))
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

// ============================================================================
// Unified Live Visual Conversation Timeline & Live Image Preview Helpers
// ============================================================================

export interface VoiceTimelineAttachment {
  mime: string;
  data: string;
  url: string;
  name?: string;
}

export interface VoiceTimelineSourceMessage {
  id: string;
  role: 'user' | 'ai';
  text: string;
  ts: number;
  status?: 'idle' | 'queued' | 'running' | 'streaming' | 'complete' | 'failed' | string;
  imgs?: VoiceTimelineAttachment[];
  thinking?: string;
  statusSteps?: string[];
  isError?: boolean;
}

export interface VoiceTimelineImageItem {
  id: string;
  url: string;
  mime: string;
  data: string;
  name: string;
  ts: number;
  formattedTime: string;
  isStaged: boolean;
  stagedIndex?: number;
  messageId?: string;
}

export interface VoiceTimelineEntry {
  id: string;
  role: 'user' | 'ai';
  ownerLabel: string;
  text: string;
  confirmedPrefix?: string;
  partialInterimText?: string;
  ts: number;
  formattedTime: string;
  transcriptState: 'partial' | 'finalized';
  streamState: 'thinking' | 'streaming' | 'complete';
  imgs: VoiceTimelineAttachment[];
  attachedFileNames: string[];
  thinkingText?: string;
  isError?: boolean;
  isGreeting?: boolean;
}

/**
 * Formats an epoch timestamp (ms) into a concise HH:MM string for the live timeline.
 */
export function formatVoiceTimelineTimestamp(ts: number): string {
  if (!Number.isFinite(ts) || ts <= 0) return '';
  try {
    const d = new Date(ts);
    const hours = d.getHours();
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const period = hours >= 12 ? 'PM' : 'AM';
    const hour12 = hours % 12 || 12;
    return `${hour12}:${minutes} ${period}`;
  } catch {
    return '';
  }
}

/**
 * Strips inline ⟦FILE:name⟧...⟦/FILE⟧ blocks from voice timeline message text
 * so attached code/text files show up as clean filename chips rather than raw dumps.
 */
export function stripInlineFileBlocksForVoiceTimeline(rawText: string): {
  cleanText: string;
  attachedFileNames: string[];
} {
  if (!rawText) return { cleanText: '', attachedFileNames: [] };
  const attachedFileNames: string[] = [];
  const withoutFiles = rawText.replace(
    /⟦FILE:([^\n⟧]+)⟧[\s\S]*?⟦\/FILE⟧/g,
    (_match, fileName: string) => {
      const trimmed = (fileName || '').trim();
      if (trimmed) attachedFileNames.push(trimmed);
      return '';
    }
  );
  return {
    cleanText: sanitizeVoiceUtterance(withoutFiles),
    attachedFileNames,
  };
}

export interface CollectLiveImagesInput {
  stagedImgs?: VoiceTimelineAttachment[];
  sessionSharedImgs?: Array<VoiceTimelineAttachment & { id?: string; ts?: number }>;
  messages?: VoiceTimelineSourceMessage[];
  nowMs?: number;
}

/**
 * Collects user-shared images for the top Live Image Preview bar:
 *  - Staged images ready to send or currently being discussed (`isStaged: true`)
 *  - Images shared in the active live conversation (`isStaged: false`), newest first
 */
export function collectLiveConversationImages(
  input: CollectLiveImagesInput
): VoiceTimelineImageItem[] {
  const nowMs = input.nowMs ?? Date.now();
  const items: VoiceTimelineImageItem[] = [];
  const seenKeys = new Set<string>();

  const makeKey = (img: VoiceTimelineAttachment) =>
    `${img.mime || 'image'}::${(img.data || img.url || '').slice(0, 96)}`;

  // 1. Staged images at the front so user sees instant preview at top (deduplicated)
  const staged = input.stagedImgs || [];
  staged.forEach((img, idx) => {
    if (!img || (!img.url && !img.data)) return;
    const key = makeKey(img);
    if (seenKeys.has(key)) return;
    seenKeys.add(key);
    const url =
      img.url || (img.data.startsWith('data:') ? img.data : `data:${img.mime || 'image/png'};base64,${img.data}`);
    items.push({
      id: `staged-${idx}-${img.name || 'img'}`,
      url,
      mime: img.mime || 'image/png',
      data: img.data || url,
      name: img.name || `Image ${idx + 1}`,
      ts: nowMs,
      formattedTime: formatVoiceTimelineTimestamp(nowMs),
      isStaged: true,
      stagedIndex: idx,
    });
  });

  // 2. Images from conversation messages & session-shared image buffer
  const historyCandidates: Array<{
    img: VoiceTimelineAttachment;
    ts: number;
    messageId?: string;
    idx: number;
  }> = [];

  (input.messages || []).forEach((msg) => {
    if (!msg.imgs || msg.imgs.length === 0) return;
    msg.imgs.forEach((img, idx) => {
      if (!img || (!img.url && !img.data)) return;
      historyCandidates.push({
        img,
        ts: msg.ts || nowMs,
        messageId: msg.id,
        idx,
      });
    });
  });

  (input.sessionSharedImgs || []).forEach((img, idx) => {
    if (!img || (!img.url && !img.data)) return;
    historyCandidates.push({
      img,
      ts: img.ts || nowMs,
      messageId: img.id,
      idx,
    });
  });

  // Sort shared images chronologically (newest shared images easily accessible)
  historyCandidates
    .sort((a, b) => b.ts - a.ts)
    .forEach(({ img, ts, messageId, idx }) => {
      const key = makeKey(img);
      if (seenKeys.has(key)) return;
      seenKeys.add(key);
      const url =
        img.url ||
        (img.data.startsWith('data:')
          ? img.data
          : `data:${img.mime || 'image/png'};base64,${img.data}`);
      items.push({
        id: `shared-${messageId || ts}-${idx}`,
        url,
        mime: img.mime || 'image/png',
        data: img.data || url,
        name: img.name || 'Shared image',
        ts,
        formattedTime: formatVoiceTimelineTimestamp(ts),
        isStaged: false,
        messageId,
      });
    });

  return items;
}

export interface BuildUnifiedVoiceTimelineInput {
  messages?: VoiceTimelineSourceMessage[];
  lastUserText?: string;
  lastAiMessage?: string;
  greetingText?: string | null;
  liveCaption?: string;
  liveFinalText?: string;
  liveInterimText?: string;
  isTranscribingTurn?: boolean;
  isGenerating?: boolean;
  stagedImgs?: VoiceTimelineAttachment[];
  pendingSharedTurn?: {
    id: string;
    text: string;
    ts: number;
    imgs: VoiceTimelineAttachment[];
  } | null;
  userName?: string;
  voiceName?: string;
  voiceLang?: 'bn-BD' | 'en-US';
  nowMs?: number;
}

/**
 * Builds the chronological Unified Live Conversation Timeline combining:
 *  - Shared images, finalized user transcripts, and AI responses from `messages`
 *  - Fallback to `lastUserText` / `lastAiMessage` when full `messages` array isn't provided
 *  - Real-time partial speech transcription bubble (`transcriptState: 'partial'`)
 *  - Streaming AI response with thinking indicator (`streamState: 'thinking' | 'streaming' | 'complete'`)
 */
export function buildUnifiedVoiceTimeline(
  input: BuildUnifiedVoiceTimelineInput
): VoiceTimelineEntry[] {
  const nowMs = input.nowMs ?? Date.now();
  const isBn = input.voiceLang === 'bn-BD';
  const userOwnerLabel =
    (input.userName || '').trim().split(/\s+/)[0] || (isBn ? 'আপনি' : 'You');
  const aiOwnerLabel = input.voiceName ? `${input.voiceName} · AI` : 'SMFTA AI';

  const entries: VoiceTimelineEntry[] = [];
  const rawMessages = input.messages || [];

  // 1. Optional initial greeting if conversation has no messages yet
  if (input.greetingText && rawMessages.length === 0 && !input.lastAiMessage) {
    const cleanGreeting = sanitizeVoiceUtterance(input.greetingText);
    if (cleanGreeting) {
      entries.push({
        id: 'voice-greeting',
        role: 'ai',
        ownerLabel: aiOwnerLabel,
        text: cleanGreeting,
        ts: nowMs - 1000,
        formattedTime: formatVoiceTimelineTimestamp(nowMs - 1000),
        transcriptState: 'finalized',
        streamState: 'complete',
        imgs: [],
        attachedFileNames: [],
        isGreeting: true,
      });
    }
  }

  // 2. Map chronological conversation messages
  if (rawMessages.length > 0) {
    rawMessages.forEach((msg, index) => {
      const isLastMsg = index === rawMessages.length - 1;
      const { cleanText, attachedFileNames } = stripInlineFileBlocksForVoiceTimeline(
        msg.text || ''
      );
      const imgs = (msg.imgs || []).map((img) => ({
        mime: img.mime || 'image/png',
        data: img.data || img.url || '',
        url:
          img.url ||
          (img.data?.startsWith('data:')
            ? img.data
            : `data:${img.mime || 'image/png'};base64,${img.data || ''}`),
        name: img.name,
      }));

      if (msg.role === 'user') {
        if (!cleanText && imgs.length === 0 && attachedFileNames.length === 0) {
          return;
        }
        entries.push({
          id: msg.id || `user-${index}`,
          role: 'user',
          ownerLabel: userOwnerLabel,
          text: cleanText,
          ts: msg.ts || nowMs,
          formattedTime: formatVoiceTimelineTimestamp(msg.ts || nowMs),
          transcriptState: 'finalized',
          streamState: 'complete',
          imgs,
          attachedFileNames,
        });
      } else {
        const isActivelyGenerating =
          msg.status === 'queued' ||
          msg.status === 'running' ||
          msg.status === 'streaming' ||
          (isLastMsg && Boolean(input.isGenerating) && msg.status !== 'complete' && msg.status !== 'failed');

        let streamState: VoiceTimelineEntry['streamState'] = 'complete';
        if (isActivelyGenerating) {
          streamState = cleanText.length > 0 ? 'streaming' : 'thinking';
        }

        const thinkingStep =
          msg.thinking ||
          (msg.statusSteps && msg.statusSteps.length > 0
            ? msg.statusSteps[msg.statusSteps.length - 1]
            : undefined);

        if (!cleanText && streamState === 'complete' && !msg.isError && imgs.length === 0) {
          return;
        }

        entries.push({
          id: msg.id || `ai-${index}`,
          role: 'ai',
          ownerLabel: aiOwnerLabel,
          text: cleanText,
          ts: msg.ts || nowMs,
          formattedTime: formatVoiceTimelineTimestamp(msg.ts || nowMs),
          transcriptState: 'finalized',
          streamState,
          imgs,
          attachedFileNames: [],
          thinkingText: thinkingStep ? sanitizeVoiceUtterance(thinkingStep) : undefined,
          isError: msg.isError,
        });
      }
    });
  } else {
    // Fallback when `messages` prop is not passed or empty: use `lastUserText` / `lastAiMessage`
    if (input.lastUserText) {
      const { cleanText, attachedFileNames } = stripInlineFileBlocksForVoiceTimeline(
        input.lastUserText
      );
      if (cleanText || attachedFileNames.length > 0) {
        entries.push({
          id: 'fallback-last-user',
          role: 'user',
          ownerLabel: userOwnerLabel,
          text: cleanText,
          ts: nowMs - 2000,
          formattedTime: formatVoiceTimelineTimestamp(nowMs - 2000),
          transcriptState: 'finalized',
          streamState: 'complete',
          imgs: [],
          attachedFileNames,
        });
      }
    }

    if (input.lastAiMessage || input.isGenerating) {
      const cleanAi = sanitizeVoiceUtterance(input.lastAiMessage || '');
      const streamState: VoiceTimelineEntry['streamState'] = input.isGenerating
        ? cleanAi.length > 0
          ? 'streaming'
          : 'thinking'
        : 'complete';

      if (cleanAi || streamState !== 'complete') {
        entries.push({
          id: 'fallback-last-ai',
          role: 'ai',
          ownerLabel: aiOwnerLabel,
          text: cleanAi,
          ts: nowMs - 500,
          formattedTime: formatVoiceTimelineTimestamp(nowMs - 500),
          transcriptState: 'finalized',
          streamState,
          imgs: [],
          attachedFileNames: [],
        });
      }
    }
  }

  // 3. Optimistic pending user turn (e.g., just-sent image+text before parent messages state flushes)
  if (input.pendingSharedTurn) {
    const pt = input.pendingSharedTurn;
    const { cleanText, attachedFileNames } = stripInlineFileBlocksForVoiceTimeline(pt.text);
    const alreadyInMessages = entries.some(
      (e) =>
        e.role === 'user' &&
        ((cleanText && e.text === cleanText) ||
          (pt.imgs.length > 0 && e.imgs.length === pt.imgs.length && Math.abs(e.ts - pt.ts) < 5000))
    );
    if (!alreadyInMessages && (cleanText || pt.imgs.length > 0)) {
      entries.push({
        id: pt.id,
        role: 'user',
        ownerLabel: userOwnerLabel,
        text: cleanText,
        ts: pt.ts,
        formattedTime: formatVoiceTimelineTimestamp(pt.ts),
        transcriptState: 'finalized',
        streamState: 'complete',
        imgs: pt.imgs,
        attachedFileNames,
      });
    }
  }

  // 4. Real-time partial speech transcription bubble (`transcriptState: 'partial'`)
  const confirmedPrefix = sanitizeVoiceUtterance(input.liveFinalText || '');
  const partialInterim = sanitizeVoiceUtterance(input.liveInterimText || '');
  const combinedLive = sanitizeVoiceUtterance(
    input.liveCaption || [confirmedPrefix, partialInterim].filter(Boolean).join(' ')
  );

  if (combinedLive || input.isTranscribingTurn) {
    entries.push({
      id: 'live-partial-speech',
      role: 'user',
      ownerLabel: userOwnerLabel,
      text:
        combinedLive ||
        (isBn ? 'কথা টেক্সটে রূপান্তর করা হচ্ছে…' : 'Transcribing speech…'),
      confirmedPrefix: confirmedPrefix || undefined,
      partialInterimText:
        partialInterim || (!confirmedPrefix && combinedLive ? combinedLive : undefined),
      ts: nowMs,
      formattedTime: formatVoiceTimelineTimestamp(nowMs),
      transcriptState: 'partial',
      streamState: 'streaming',
      imgs: [],
      attachedFileNames: [],
    });
  }

  // 5. If `isGenerating` is true and no AI entry at the tail is already thinking/streaming, append a thinking entry
  const lastEntry = entries[entries.length - 1];
  const hasActiveAiStream = entries.some(
    (e) => e.role === 'ai' && (e.streamState === 'thinking' || e.streamState === 'streaming')
  );
  if (input.isGenerating && !hasActiveAiStream && (!lastEntry || lastEntry.role === 'user')) {
    entries.push({
      id: 'live-ai-thinking',
      role: 'ai',
      ownerLabel: aiOwnerLabel,
      text: '',
      ts: nowMs,
      formattedTime: formatVoiceTimelineTimestamp(nowMs),
      transcriptState: 'finalized',
      streamState: 'thinking',
      imgs: [],
      attachedFileNames: [],
    });
  }

  return entries;
}

