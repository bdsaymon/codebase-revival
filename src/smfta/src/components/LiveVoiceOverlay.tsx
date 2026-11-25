import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUp,
  ChevronDown,
  ImagePlus,
  Keyboard,
  PhoneOff,
  RefreshCw,
  Volume2,
  X,
  ZoomIn,
} from 'lucide-react';
import {
  accumulateSpeechResults,
  base64ToUint8Array,
  bilingualSpeechPlayer,
  blobToBase64Data,
  extractReadySpeechChunks,
  formatTextForNaturalSpeech,
  GeminiFemaleVoiceName,
  isMediaRecorderSupported,
  isSpeechRecognitionSupported,
  isSpeechSynthesisSupported,
  pickSupportedAudioMimeType,
  requestGeminiFemaleSpeech,
  requestServerVoiceTranscription,
  resolveRecognitionLanguage,
  resolveTtsVoicePersona,
  softLimitPcmSamples,
  streamGeminiPcmSpeech,
} from '../utils/voiceEngine';
import type { AppSettings, ChatMessage, ImageAttachment } from '../types';
import {
  BargeInState,
  buildUnifiedVoiceTimeline,
  buildVoiceGreeting,
  collectLiveConversationImages,
  computeVocalEnergy,
  createBargeInState,
  createVadTracker,
  deriveVoiceSessionState,
  sanitizeVoiceUtterance,
  shouldActivateMicForTurn,
  shouldAllowBargeIn,
  shouldSubmitVoiceUtterance,
  stepBargeInDetector,
  stepVadTracker,
  VadTrackerState,
  VoiceConnectionState,
  VoiceTimelineAttachment,
} from '../utils/voiceSession';

export interface LiveVoiceMessageSnapshot {
  id: string;
  text: string;
  isError?: boolean;
}

export interface LiveVoiceOverlayProps {
  isOpen: boolean;
  chatId?: number | string;
  userName?: string;
  preferredLang?: string;
  preferredVoice?: AppSettings['ttsVoice'];
  realtimeMode?: boolean;
  isListening?: boolean;
  isGenerating: boolean;
  isTranscribing?: boolean;
  liveTranscript?: string;
  micStream?: MediaStream | null;
  messages?: ChatMessage[];
  lastUserText: string;
  lastAiMessage: LiveVoiceMessageSnapshot | null;
  onChangePreferredVoice?: (voice: GeminiFemaleVoiceName) => void;
  onToggleRealtimeMode?: (enabled: boolean) => void;
  onToggleMic?: () => void;
  onCancelMic?: () => void;
  onAbortGeneration?: () => void;
  onSendText: (
    text: string,
    attachments?: {
      imgs?: ImageAttachment[];
      files?: Array<{ name: string; content: string; summary?: string }>;
    }
  ) => void;
  onEndCall: () => void;
}

const VOICE_OPTIONS: Array<{
  id: GeminiFemaleVoiceName;
  name: string;
  subtitle: string;
  tone: string;
}> = [
  { id: 'Kore', name: 'Kore', subtitle: 'Female', tone: 'Warm' },
  { id: 'Zephyr', name: 'Zephyr', subtitle: 'Female', tone: 'Bright' },
  { id: 'Puck', name: 'Puck', subtitle: 'Male', tone: 'Crisp' },
  { id: 'Charon', name: 'Charon', subtitle: 'Male', tone: 'Deep' },
  { id: 'Fenrir', name: 'Fenrir', subtitle: 'Male', tone: 'Bold' },
];

const VOICE_RATE_STEPS = [0.9, 1, 1.15, 1.3] as const;
type VoiceSpeechRate = (typeof VOICE_RATE_STEPS)[number];

const VOICE_PREF_KEY = 'smfta_live_voice_persona_v1';
const VOICE_LANG_PREF_KEY = 'smfta_live_voice_lang_v1';
const VOICE_RATE_PREF_KEY = 'smfta_live_voice_rate_v1';

let sharedLiveAudioCtx: AudioContext | null = null;

/**
 * Call synchronously inside user click/tap handlers so mobile Chrome & iOS Safari
 * unlock Web Audio silently before async Gemini TTS payloads arrive.
 */
export function unlockSharedLiveAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AudioCtx) return null;
  if (!sharedLiveAudioCtx || sharedLiveAudioCtx.state === 'closed') {
    sharedLiveAudioCtx = new AudioCtx();
  }
  if (sharedLiveAudioCtx.state === 'suspended') {
    void sharedLiveAudioCtx.resume().catch(() => {});
  }
  return sharedLiveAudioCtx;
}

function loadSavedVoice(): GeminiFemaleVoiceName {
  try {
    const saved = localStorage.getItem(VOICE_PREF_KEY);
    if (VOICE_OPTIONS.some((v) => v.id === saved)) {
      return saved as GeminiFemaleVoiceName;
    }
  } catch {
    // Ignore storage errors
  }
  return 'Kore';
}

function loadSavedVoiceLang(fallback?: string): 'bn-BD' | 'en-US' {
  try {
    const saved = localStorage.getItem(VOICE_LANG_PREF_KEY);
    if (saved === 'bn-BD' || saved === 'en-US') return saved;
  } catch {
    // Ignore storage errors
  }
  return resolveRecognitionLanguage(
    fallback === 'bn-BD' || fallback === 'en-US' ? fallback : 'auto',
    fallback
  );
}

function loadSavedVoiceRate(): VoiceSpeechRate {
  try {
    const raw = Number(localStorage.getItem(VOICE_RATE_PREF_KEY));
    if (VOICE_RATE_STEPS.includes(raw as VoiceSpeechRate)) {
      return raw as VoiceSpeechRate;
    }
  } catch {
    // Ignore storage errors
  }
  return 1;
}

function buildVoiceStylePrompt(voice: GeminiFemaleVoiceName): string {
  const styles: Record<GeminiFemaleVoiceName, string> = {
    Kore: 'Intimate studio-mic warmth, velvety natural human female voice with lyrical Bengali and English cadence and gentle conversational warmth',
    Zephyr: 'Crystal clear, silky, poised human female studio voice with natural rhythmic pauses and expressive Bengali and English articulation',
    Puck: 'Crisp, friendly, articulate human male studio voice with relaxed natural pacing and accurate Bengali and English pronunciation',
    Charon: 'Calm, rich, resonant deep male studio voice with soothing human warmth and natural conversational phrasing',
    Fenrir: 'Warm, grounded, charismatic human male studio voice with confident depth and smooth bilingual flow',
  };
  return styles[voice] || styles.Kore;
}

const STATE_COPY: Record<
  VoiceConnectionState,
  { label: string; headline: string; hint: string }
> = {
  connecting: {
    label: 'Connecting',
    headline: 'Connecting voice...',
    hint: 'Preparing live audio',
  },
  listening: {
    label: 'Listening',
    headline: 'Listening',
    hint: 'Speak naturally anytime',
  },
  thinking: {
    label: 'Thinking',
    headline: 'Thinking...',
    hint: 'Preparing reply',
  },
  speaking: {
    label: 'Speaking',
    headline: 'Speaking',
    hint: 'Speaking now',
  },
  reconnecting: {
    label: 'Reconnecting',
    headline: 'Reconnecting...',
    hint: 'Restoring voice connection',
  },
  disconnected: {
    label: 'Disconnected',
    headline: 'Voice paused',
    hint: 'Tap reconnect below to resume',
  },
};

export const LiveVoiceOverlay: React.FC<LiveVoiceOverlayProps> = ({
  isOpen,
  chatId,
  userName,
  preferredLang = 'auto',
  preferredVoice,
  realtimeMode = false,
  isGenerating,
  messages = [],
  lastUserText,
  lastAiMessage,
  onChangePreferredVoice,
  onToggleRealtimeMode,
  onCancelMic,
  onAbortGeneration,
  onSendText,
  onEndCall,
}) => {
  const [selectedVoice, setSelectedVoice] = useState<GeminiFemaleVoiceName>(() =>
    preferredVoice && preferredVoice !== 'default'
      ? resolveTtsVoicePersona(preferredVoice)
      : loadSavedVoice()
  );
  const [voiceLang, setVoiceLang] = useState<'bn-BD' | 'en-US'>(() =>
    loadSavedVoiceLang(preferredLang)
  );
  const [speechRate] = useState<VoiceSpeechRate>(loadSavedVoiceRate);
  const [activeVoiceModel, setActiveVoiceModel] = useState<string | null>(null);
  const [micStreamLive, setMicStreamLive] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [isDisconnected, setIsDisconnected] = useState(false);
  const [isOffline, setIsOffline] = useState(
    typeof navigator !== 'undefined' ? !navigator.onLine : false
  );
  const [isSessionListening, setIsSessionListening] = useState(false);
  const [isTranscribingTurn, setIsTranscribingTurn] = useState(false);
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const [isSynthesizingVoice, setIsSynthesizingVoice] = useState(false);
  const [isUserVoicing, setIsUserVoicing] = useState(false);
  const [, setHasRecordedAudio] = useState(false);
  const [liveCaption, setLiveCaption] = useState('');
  const [liveFinalText, setLiveFinalText] = useState('');
  const [liveInterimText, setLiveInterimText] = useState('');
  const [greetingText, setGreetingText] = useState('');
  const [sessionUserText, setSessionUserText] = useState('');
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const [needsTapToPlay, setNeedsTapToPlay] = useState(false);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [draftText, setDraftText] = useState('');
  const [attachedImgs, setAttachedImgs] = useState<
    Array<ImageAttachment & { name: string }>
  >([]);
  const [attachedFiles, setAttachedFiles] = useState<
    Array<{ name: string; content: string; summary: string }>
  >([]);
  const [sessionSharedImgs, setSessionSharedImgs] = useState<
    Array<VoiceTimelineAttachment & { id: string; ts: number }>
  >([]);
  const [pendingSharedTurn, setPendingSharedTurn] = useState<{
    id: string;
    text: string;
    ts: number;
    imgs: VoiceTimelineAttachment[];
  } | null>(null);
  const [fullscreenImage, setFullscreenImage] = useState<{
    url: string;
    name?: string;
  } | null>(null);
  const [, setSeconds] = useState(0);

  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const timelineScrollRef = useRef<HTMLDivElement | null>(null);
  const userScrolledUpRef = useRef<boolean>(false);
  const attachedImgsRef = useRef(attachedImgs);
  attachedImgsRef.current = attachedImgs;
  const attachedFilesRef = useRef(attachedFiles);
  attachedFilesRef.current = attachedFiles;

  // Visual canvas ref
  const orbCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Audio playback refs
  const audioCtxRef = useRef<AudioContext | null>(null);
  const playbackSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const playbackSafetyTimersRef = useRef<Set<number>>(new Set());
  const playbackAnalyserRef = useRef<AnalyserNode | null>(null);
  const nextPlayTimeRef = useRef<number>(0);
  const pendingAudioBufferRef = useRef<AudioBuffer | null>(null);
  const ttsAbortRef = useRef<AbortController | null>(null);
  const pendingChunksRef = useRef<string[]>([]);
  const pipelineBusyRef = useRef<boolean>(false);
  const pipelineRunIdRef = useRef<number>(0);
  const spokenCursorRef = useRef<number>(0);
  const activeTurnMsgIdRef = useRef<string | null>(null);
  const spokenMsgIdRef = useRef<string | null>(null);
  const useBrowserTtsForTurnRef = useRef<boolean>(false);
  const aiSpeakingStartedAtRef = useRef<number>(0);

  // Persistent single-session microphone, VAD, recorder & speech recognition refs
  const persistentStreamRef = useRef<MediaStream | null>(null);
  const micSourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const micAnalyserRef = useRef<AnalyserNode | null>(null);
  const micSilentGainRef = useRef<GainNode | null>(null);
  const turnRecorderRef = useRef<MediaRecorder | null>(null);
  const turnChunksRef = useRef<Blob[]>([]);
  const turnMimeRef = useRef<string>('audio/webm');
  const rollingSttTimerRef = useRef<number | null>(null);
  const rollingSttInFlightRef = useRef<boolean>(false);
  const rollingSttCheckedBytesRef = useRef<number>(0);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const recognitionFinalPrefixRef = useRef<string>('');
  const recognitionSessionFinalRef = useRef<string>('');
  const recognitionLiveTextRef = useRef<string>('');
  const speechRecCommitTimerRef = useRef<number | null>(null);
  const vadStateRef = useRef<VadTrackerState>(createVadTracker());
  const bargeInStateRef = useRef<BargeInState>(createBargeInState());
  const turnHadRealSpeechRef = useRef<boolean>(false);
  const turnCommitInFlightRef = useRef<boolean>(false);
  const lastSubmittedRef = useRef<{ text: string; at: number } | null>(null);
  const hasGreetedRef = useRef<boolean>(false);
  const isInitialGreetingPendingRef = useRef<boolean>(false);
  const ttsFailedTurnRef = useRef<string | null>(null);
  const prevChatIdRef = useRef<number | string | undefined>(chatId);
  const autoListenTimerRef = useRef<number | null>(null);
  const sessionTokenRef = useRef<number>(0);
  const textInputRef = useRef<HTMLInputElement | null>(null);

  // Smooth animation refs
  const energyRef = useRef(0);
  const micLevelRef = useRef(0);
  const visualStateRef = useRef<VoiceConnectionState>('connecting');

  const voiceState: VoiceConnectionState = deriveVoiceSessionState({
    isOffline,
    isDisconnected,
    isReconnecting,
    isConnecting,
    isAiSpeaking,
    isGenerating,
    isTranscribing: isTranscribingTurn,
    isSynthesizing: isSynthesizingVoice,
    isListening: isSessionListening,
  });

  visualStateRef.current = voiceState;

  const stateRef = useRef({
    isOpen,
    isMuted,
    isConnecting,
    isDisconnected,
    isOffline,
    isGenerating,
    isTranscribingTurn,
    isAiSpeaking,
    isSynthesizingVoice,
    isSessionListening,
    keyboardOpen,
    fullscreenImage,
    selectedVoice,
    voiceLang,
    speechRate,
    userName,
    onSendText,
    onAbortGeneration,
  });
  stateRef.current = {
    isOpen,
    isMuted,
    isConnecting,
    isDisconnected,
    isOffline,
    isGenerating,
    isTranscribingTurn,
    isAiSpeaking,
    isSynthesizingVoice,
    isSessionListening,
    keyboardOpen,
    fullscreenImage,
    selectedVoice,
    voiceLang,
    speechRate,
    userName,
    onSendText,
    onAbortGeneration,
  };

  useEffect(() => {
    if (preferredVoice && preferredVoice !== 'default') {
      const synced = resolveTtsVoicePersona(preferredVoice);
      setSelectedVoice(synced);
    }
  }, [preferredVoice]);

  useEffect(() => {
    try {
      localStorage.setItem(VOICE_PREF_KEY, selectedVoice);
    } catch {
      // Ignore storage errors
    }
  }, [selectedVoice]);

  useEffect(() => {
    try {
      localStorage.setItem(VOICE_LANG_PREF_KEY, voiceLang);
    } catch {
      // Ignore storage errors
    }
  }, [voiceLang]);

  useEffect(() => {
    try {
      localStorage.setItem(VOICE_RATE_PREF_KEY, String(speechRate));
    } catch {
      // Ignore storage errors
    }
  }, [speechRate]);

  const ensureAudioContext = useCallback((): AudioContext | null => {
    const ctx = unlockSharedLiveAudioContext();
    audioCtxRef.current = ctx;
    return ctx;
  }, []);

  const ensurePlaybackAnalyser = useCallback((ctx: AudioContext): AnalyserNode => {
    if (playbackAnalyserRef.current && playbackAnalyserRef.current.context === ctx) {
      return playbackAnalyserRef.current;
    }
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.72;

    // Studio vocal mastering chain: warm chest low-shelf, soft consonant clarity, silky de-ess & even leveling
    const lowShelf = ctx.createBiquadFilter();
    lowShelf.type = 'lowshelf';
    lowShelf.frequency.value = 155;
    lowShelf.gain.value = 1.6;

    const presence = ctx.createBiquadFilter();
    presence.type = 'peaking';
    presence.frequency.value = 2800;
    presence.Q.value = 0.85;
    presence.gain.value = 1.25;

    const highShelf = ctx.createBiquadFilter();
    highShelf.type = 'highshelf';
    highShelf.frequency.value = 7600;
    highShelf.gain.value = -1.5;

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.knee.value = 14;
    compressor.ratio.value = 2.8;
    compressor.attack.value = 0.006;
    compressor.release.value = 0.16;

    analyser.connect(lowShelf);
    lowShelf.connect(presence);
    presence.connect(highShelf);
    highShelf.connect(compressor);
    compressor.connect(ctx.destination);

    playbackAnalyserRef.current = analyser;
    return analyser;
  }, []);

  const clearSpeechRecCommitTimer = useCallback(() => {
    if (speechRecCommitTimerRef.current !== null) {
      window.clearTimeout(speechRecCommitTimerRef.current);
      speechRecCommitTimerRef.current = null;
    }
  }, []);

  const clearRollingSttTimer = useCallback(() => {
    if (rollingSttTimerRef.current !== null) {
      window.clearInterval(rollingSttTimerRef.current);
      rollingSttTimerRef.current = null;
    }
    rollingSttInFlightRef.current = false;
  }, []);

  const stopTurnRecognition = useCallback(() => {
    clearSpeechRecCommitTimer();
    const r = recognitionRef.current;
    recognitionRef.current = null;
    if (!r) return;
    try {
      r.onresult = null;
      r.onend = null;
      r.onerror = null;
      r.abort?.();
      r.stop?.();
    } catch {
      // Ignore cleanup errors
    }
  }, [clearSpeechRecCommitTimer]);

  const stopTurnRecorder = useCallback((): Promise<Blob | null> => {
    clearRollingSttTimer();
    const rec = turnRecorderRef.current;
    turnRecorderRef.current = null;
    if (!rec) {
      const existing =
        turnChunksRef.current.length > 0
          ? new Blob(turnChunksRef.current, { type: turnMimeRef.current })
          : null;
      turnChunksRef.current = [];
      setHasRecordedAudio(false);
      return Promise.resolve(existing);
    }
    if (rec.state === 'inactive') {
      const existing =
        turnChunksRef.current.length > 0
          ? new Blob(turnChunksRef.current, { type: turnMimeRef.current })
          : null;
      turnChunksRef.current = [];
      setHasRecordedAudio(false);
      return Promise.resolve(existing);
    }
    return new Promise<Blob | null>((resolve) => {
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        const blob =
          turnChunksRef.current.length > 0
            ? new Blob(turnChunksRef.current, { type: turnMimeRef.current })
            : null;
        turnChunksRef.current = [];
        setHasRecordedAudio(false);
        resolve(blob);
      };
      const safety = window.setTimeout(done, 420);
      rec.onstop = () => {
        window.clearTimeout(safety);
        done();
      };
      try {
        rec.stop();
      } catch {
        window.clearTimeout(safety);
        done();
      }
    });
  }, [clearRollingSttTimer]);

  const stopListeningTurnOnly = useCallback(() => {
    setIsSessionListening(false);
    stateRef.current.isSessionListening = false;
    setIsUserVoicing(false);
    setHasRecordedAudio(false);
    clearRollingSttTimer();
    stopTurnRecognition();
    void stopTurnRecorder();
    vadStateRef.current = createVadTracker(vadStateRef.current.noiseFloor);
    turnHadRealSpeechRef.current = false;
    recognitionFinalPrefixRef.current = '';
    recognitionSessionFinalRef.current = '';
    recognitionLiveTextRef.current = '';
    rollingSttCheckedBytesRef.current = 0;
  }, [clearRollingSttTimer, stopTurnRecorder, stopTurnRecognition]);

  const stopAiSpeechPlayback = useCallback(() => {
    // Bump pipeline run token so any suspended async TTS worker exits immediately without overlapping
    pipelineRunIdRef.current += 1;
    isInitialGreetingPendingRef.current = false;
    if (autoListenTimerRef.current !== null) {
      window.clearTimeout(autoListenTimerRef.current);
      autoListenTimerRef.current = null;
    }
    for (const timerId of playbackSafetyTimersRef.current) {
      window.clearTimeout(timerId);
    }
    playbackSafetyTimersRef.current.clear();

    if (ttsAbortRef.current) {
      ttsAbortRef.current.abort();
      ttsAbortRef.current = null;
    }
    pendingChunksRef.current = [];
    pipelineBusyRef.current = false;
    nextPlayTimeRef.current = 0;

    for (const src of activeSourcesRef.current) {
      try {
        src.onended = null;
        src.stop();
        src.disconnect();
      } catch {
        // Ignore already stopped audio node
      }
    }
    activeSourcesRef.current.clear();

    if (playbackSourceRef.current) {
      try {
        playbackSourceRef.current.onended = null;
        playbackSourceRef.current.stop();
        playbackSourceRef.current.disconnect();
      } catch {
        // Ignore already stopped audio node
      }
      playbackSourceRef.current = null;
    }
    bilingualSpeechPlayer.stop();
    try {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    } catch {
      // Ignore speechSynthesis cancel errors
    }
    pendingAudioBufferRef.current = null;
    setNeedsTapToPlay(false);
    setIsSynthesizingVoice(false);
    stateRef.current.isSynthesizingVoice = false;
    setIsAiSpeaking(false);
    stateRef.current.isAiSpeaking = false;
  }, []);

  const releaseAllMicResources = useCallback(() => {
    setMicStreamLive(false);
    stopListeningTurnOnly();
    micAnalyserRef.current = null;
    if (micSilentGainRef.current) {
      try {
        micSilentGainRef.current.disconnect();
      } catch {
        // Ignore disconnect error
      }
      micSilentGainRef.current = null;
    }
    if (micSourceNodeRef.current) {
      try {
        micSourceNodeRef.current.disconnect();
      } catch {
        // Ignore disconnect error
      }
      micSourceNodeRef.current = null;
    }
    if (persistentStreamRef.current) {
      const tracks = persistentStreamRef.current.getTracks();
      persistentStreamRef.current = null;
      tracks.forEach((t) => {
        try {
          t.onended = null;
          t.stop();
        } catch {
          // Ignore track stop error
        }
      });
    }
  }, [stopListeningTurnOnly]);

  // Forward ref so SpeechRecognition.onresult/onend and rolling STT can commit cleanly
  const commitActiveUtteranceRef = useRef<(forceManual?: boolean) => Promise<void>>(
    async () => {}
  );

  const startSingleTurnRecognition = useCallback(
    (langOverride?: 'bn-BD' | 'en-US') => {
      const cur = stateRef.current;
      if (
        !isSpeechRecognitionSupported() ||
        !cur.isOpen ||
        cur.isMuted ||
        !cur.isSessionListening ||
        cur.isGenerating ||
        cur.isTranscribingTurn
      ) {
        return;
      }
      if (recognitionRef.current) return;

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        const r = new SR();
        r.lang = langOverride || cur.voiceLang;
        r.interimResults = true;
        r.continuous = true;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        r.onresult = (e: any) => {
          if (!stateRef.current.isSessionListening || stateRef.current.isMuted) {
            return;
          }
          const { finalPrefix, interimText, liveTranscript } = accumulateSpeechResults(
            e?.results,
            recognitionFinalPrefixRef.current
          );
          // Do NOT feed finalPrefix back into recognitionFinalPrefixRef during an active
          // continuous session: e.results already accumulates all finals for the session,
          // so only promote on session restart (r.onend).
          recognitionSessionFinalRef.current = finalPrefix;
          setLiveFinalText(finalPrefix);
          setLiveInterimText(interimText);
          if (liveTranscript) {
            recognitionLiveTextRef.current = liveTranscript;
            turnHadRealSpeechRef.current = true;
            setIsUserVoicing(true);
            setLiveCaption(liveTranscript);

            // Auto-commit after speech pause so spoken words ALWAYS send even if phone RMS is soft
            clearSpeechRecCommitTimer();
            const resultsLen = e?.results?.length ?? 0;
            const latestIsFinal =
              resultsLen > 0 && Boolean(e?.results?.[resultsLen - 1]?.isFinal);
            const commitDelayMs = latestIsFinal ? 1300 : 2200;
            speechRecCommitTimerRef.current = window.setTimeout(() => {
              speechRecCommitTimerRef.current = null;
              if (
                stateRef.current.isOpen &&
                stateRef.current.isSessionListening &&
                !turnCommitInFlightRef.current &&
                recognitionLiveTextRef.current.trim()
              ) {
                void commitActiveUtteranceRef.current(false);
              }
            }, commitDelayMs);
          }
        };

        r.onerror = () => {
          // Persistent MediaRecorder + rolling server STT remains seamlessly active
        };

        r.onend = () => {
          if (recognitionRef.current === r) {
            recognitionRef.current = null;
          }
          if (recognitionSessionFinalRef.current) {
            recognitionFinalPrefixRef.current = recognitionSessionFinalRef.current;
          }
          // If SpeechRecognition ended after capturing speech, commit immediately so zero words are lost!
          if (
            stateRef.current.isOpen &&
            stateRef.current.isSessionListening &&
            !turnCommitInFlightRef.current &&
            recognitionLiveTextRef.current.trim()
          ) {
            clearSpeechRecCommitTimer();
            void commitActiveUtteranceRef.current(false);
            return;
          }
          // Keep Web Speech alive across natural pauses while listening
          if (
            stateRef.current.isOpen &&
            stateRef.current.isSessionListening &&
            !stateRef.current.isMuted &&
            !stateRef.current.isGenerating &&
            !stateRef.current.isTranscribingTurn &&
            !turnCommitInFlightRef.current
          ) {
            window.setTimeout(() => {
              if (
                stateRef.current.isOpen &&
                stateRef.current.isSessionListening &&
                !recognitionRef.current
              ) {
                startSingleTurnRecognition(langOverride);
              }
            }, 150);
          }
        };

        recognitionRef.current = r;
        r.start();
      } catch {
        recognitionRef.current = null;
      }
    },
    [clearSpeechRecCommitTimer]
  );

  const startListeningTurn = useCallback(
    (langOverride?: 'bn-BD' | 'en-US') => {
      const cur = stateRef.current;
      if (
        !cur.isOpen ||
        cur.isDisconnected ||
        cur.isOffline ||
        cur.isGenerating ||
        cur.isTranscribingTurn ||
        isInitialGreetingPendingRef.current
      ) {
        return;
      }

      const stream = persistentStreamRef.current;
      if (!stream || stream.getAudioTracks().every((t) => t.readyState !== 'live')) {
        return;
      }

      // Ensure AudioContext is awake so AnalyserNode always reads real mic RMS
      const ctx = ensureAudioContext();
      if (ctx && ctx.state === 'suspended') {
        void ctx.resume().catch(() => {});
      }

      // Reset turn buffers cleanly without touching the persistent MediaStream
      clearRollingSttTimer();
      stopTurnRecognition();
      if (turnRecorderRef.current && turnRecorderRef.current.state !== 'inactive') {
        try {
          turnRecorderRef.current.onstop = null;
          turnRecorderRef.current.stop();
        } catch {
          // Ignore
        }
        turnRecorderRef.current = null;
      }
      turnChunksRef.current = [];
      turnHadRealSpeechRef.current = false;
      turnCommitInFlightRef.current = false;
      recognitionFinalPrefixRef.current = '';
      recognitionSessionFinalRef.current = '';
      recognitionLiveTextRef.current = '';
      rollingSttCheckedBytesRef.current = 0;
      vadStateRef.current = createVadTracker(vadStateRef.current.noiseFloor);
      setLiveCaption('');
      setLiveFinalText('');
      setLiveInterimText('');
      setIsUserVoicing(false);
      setHasRecordedAudio(false);
      setIsSessionListening(true);
      stateRef.current.isSessionListening = true;

      // Start lightweight MediaRecorder on the ALREADY-ACTIVE persistent stream (no OS mic beep!)
      if (isMediaRecorderSupported()) {
        try {
          const mimeType = pickSupportedAudioMimeType();
          turnMimeRef.current = mimeType || 'audio/webm';
          const recorder = mimeType
            ? new MediaRecorder(stream, { mimeType })
            : new MediaRecorder(stream);
          recorder.ondataavailable = (ev) => {
            if (ev.data && ev.data.size > 0) {
              turnChunksRef.current.push(ev.data);
              if (turnChunksRef.current.length === 3) {
                setHasRecordedAudio(true);
              }
            }
          };
          recorder.start(200);
          turnRecorderRef.current = recorder;

          // Rolling hands-free server STT fallback for browsers/WebViews where Web SpeechRecognition
          // produces no output or hardware echo cancellation compresses time-domain RMS:
          rollingSttTimerRef.current = window.setInterval(() => {
            const st = stateRef.current;
            if (
              !st.isOpen ||
              !st.isSessionListening ||
              st.isMuted ||
              st.isGenerating ||
              st.isTranscribingTurn ||
              turnCommitInFlightRef.current ||
              rollingSttInFlightRef.current ||
              Boolean(recognitionLiveTextRef.current.trim())
            ) {
              return;
            }
            const chunkCount = turnChunksRef.current.length;
            if (chunkCount < 10) return; // Wait for at least ~2.0s of audio
            // Don't interrupt while user is actively mid-word unless >= 4.5s has accumulated
            if (vadStateRef.current.isVoiceActive && chunkCount < 22) {
              return;
            }
            const totalBytes = turnChunksRef.current.reduce((sum, b) => sum + b.size, 0);
            if (
              totalBytes < 1800 ||
              totalBytes - rollingSttCheckedBytesRef.current < 1600
            ) {
              return;
            }
            rollingSttCheckedBytesRef.current = totalBytes;
            rollingSttInFlightRef.current = true;
            const snapshotBlob = new Blob(turnChunksRef.current, {
              type: turnMimeRef.current || 'audio/webm',
            });
            void blobToBase64Data(snapshotBlob)
              .then((audioBase64) =>
                requestServerVoiceTranscription({
                  audioBase64,
                  mimeType: snapshotBlob.type || turnMimeRef.current || 'audio/webm',
                  language: stateRef.current.voiceLang,
                })
              )
              .then((stt) => {
                if (
                  !stateRef.current.isOpen ||
                  !stateRef.current.isSessionListening ||
                  turnCommitInFlightRef.current
                ) {
                  return;
                }
                const clean = sanitizeVoiceUtterance(stt.ok ? stt.text || '' : '');
                if (clean) {
                  recognitionLiveTextRef.current = clean;
                  turnHadRealSpeechRef.current = true;
                  setIsUserVoicing(true);
                  setLiveCaption(clean);
                  setLiveInterimText(clean);
                  clearSpeechRecCommitTimer();
                  speechRecCommitTimerRef.current = window.setTimeout(() => {
                    speechRecCommitTimerRef.current = null;
                    if (
                      stateRef.current.isOpen &&
                      stateRef.current.isSessionListening &&
                      !turnCommitInFlightRef.current &&
                      recognitionLiveTextRef.current.trim()
                    ) {
                      void commitActiveUtteranceRef.current(false);
                    }
                  }, 1200);
                } else if (chunkCount >= 28 && !vadStateRef.current.isVoiceActive) {
                  // Trim old silent buffer so subsequent speech is transcribed crisply
                  turnChunksRef.current = turnChunksRef.current.slice(-4);
                  rollingSttCheckedBytesRef.current = 0;
                }
              })
              .catch(() => {
                // Non-fatal; next interval or manual send will retry
              })
              .finally(() => {
                rollingSttInFlightRef.current = false;
              });
          }, 1850);
        } catch {
          turnRecorderRef.current = null;
        }
      }

      startSingleTurnRecognition(langOverride);
    },
    [
      clearRollingSttTimer,
      clearSpeechRecCommitTimer,
      ensureAudioContext,
      startSingleTurnRecognition,
      stopTurnRecognition,
    ]
  );

  const releaseInitialGreetingMicGate = useCallback(() => {
    if (isInitialGreetingPendingRef.current) {
      isInitialGreetingPendingRef.current = false;
      if (persistentStreamRef.current) {
        persistentStreamRef.current.getAudioTracks().forEach((track) => {
          track.enabled = !stateRef.current.isMuted;
        });
      }
    }
  }, []);

  const scheduleAutoListenAfterSpeech = useCallback(
    (ctrl?: AbortController | null) => {
      if (ctrl?.signal.aborted) return;
      if (!stateRef.current.isOpen) return;
      if (stateRef.current.isConnecting) return;
      if (pipelineBusyRef.current) return;
      if (pendingChunksRef.current.length > 0) return;
      if (activeSourcesRef.current.size > 0) return;
      if (pendingAudioBufferRef.current) return;
      if (stateRef.current.isGenerating) return;

      releaseInitialGreetingMicGate();
      setIsSynthesizingVoice(false);
      stateRef.current.isSynthesizingVoice = false;
      setIsAiSpeaking(false);
      stateRef.current.isAiSpeaking = false;

      if (autoListenTimerRef.current !== null) {
        window.clearTimeout(autoListenTimerRef.current);
      }
      autoListenTimerRef.current = window.setTimeout(() => {
        autoListenTimerRef.current = null;
        if (ctrl?.signal.aborted) return;
        const cur = stateRef.current;
        if (
          shouldActivateMicForTurn({
            isOpen: cur.isOpen,
            isConnecting: cur.isConnecting,
            isDisconnected: cur.isDisconnected,
            isOffline: cur.isOffline,
            isGenerating: cur.isGenerating,
            isTranscribingTurn: cur.isTranscribingTurn,
            isAiSpeaking: cur.isAiSpeaking,
            isSynthesizingVoice: cur.isSynthesizingVoice,
            isInitialGreetingPending: isInitialGreetingPendingRef.current,
            pipelineBusy: pipelineBusyRef.current,
            pendingChunkCount: pendingChunksRef.current.length,
            activeSourceCount: activeSourcesRef.current.size,
            hasPendingAudioBuffer: Boolean(pendingAudioBufferRef.current),
          })
        ) {
          startListeningTurn();
        }
      }, 200);
    },
    [releaseInitialGreetingMicGate, startListeningTurn]
  );

  const commitActiveUtterance = useCallback(
    async (forceManual = false) => {
      if (turnCommitInFlightRef.current) return;
      if (!stateRef.current.isOpen || stateRef.current.isGenerating) return;

      clearSpeechRecCommitTimer();
      clearRollingSttTimer();

      // If Web Speech hasn't delivered a transcript yet, ask it to flush its final result briefly before stopping
      if (!recognitionLiveTextRef.current.trim() && recognitionRef.current) {
        try {
          recognitionRef.current.stop?.();
        } catch {
          // Ignore
        }
        await new Promise<void>((r) => window.setTimeout(r, 150));
      }

      const hadSpeech = turnHadRealSpeechRef.current;
      const webSpeechText = sanitizeVoiceUtterance(recognitionLiveTextRef.current);
      const hasRecordedChunks = turnChunksRef.current.length >= 2;
      const hasStagedAttachments =
        attachedImgsRef.current.length > 0 || attachedFilesRef.current.length > 0;

      // Strict zero-empty guard: never submit pure silence unless user recorded audio / staged attachment and tapped Send
      if (!hadSpeech && !webSpeechText && !(forceManual && (hasRecordedChunks || hasStagedAttachments))) {
        if (forceManual) {
          startSingleTurnRecognition();
          setStatusNotice(
            stateRef.current.voiceLang === 'bn-BD'
              ? 'শুনছি — বাংলা বা ইংরেজিতে স্বাভাবিকভাবে কথা বলুন।'
              : 'Listening — speak naturally in Bangla or English.'
          );
        }
        return;
      }

      turnCommitInFlightRef.current = true;
      setIsSessionListening(false);
      stateRef.current.isSessionListening = false;
      setIsUserVoicing(false);
      stopTurnRecognition();
      const recordedBlob = await stopTurnRecorder();
      vadStateRef.current = createVadTracker(vadStateRef.current.noiseFloor);
      turnHadRealSpeechRef.current = false;
      recognitionFinalPrefixRef.current = '';
      recognitionSessionFinalRef.current = '';
      recognitionLiveTextRef.current = '';
      rollingSttCheckedBytesRef.current = 0;

      const submitCleanText = (candidate: string, realEnergy: boolean): boolean => {
        const pendingImgsNow = attachedImgsRef.current;
        const pendingFilesNow = attachedFilesRef.current;
        const hasPendingAttachments =
          pendingImgsNow.length > 0 || pendingFilesNow.length > 0;
        const effectiveCandidate =
          candidate.trim() ||
          (hasPendingAttachments
            ? stateRef.current.voiceLang === 'bn-BD'
              ? 'এই ফাইল বা ছবিটি দেখে বিস্তারিত বলো।'
              : 'Please analyze the attached image or file.'
            : '');
        const verdict = shouldSubmitVoiceUtterance({
          rawText: effectiveCandidate,
          hadRealSpeechEnergy: realEnergy || hasPendingAttachments,
          lastSubmitted: hasPendingAttachments ? null : lastSubmittedRef.current,
          nowMs: Date.now(),
        });
        if (!verdict.accept) return false;
        const nowTs = Date.now();
        lastSubmittedRef.current = { text: verdict.cleanText, at: nowTs };
        setSessionUserText(verdict.cleanText);
        setLiveCaption('');
        setLiveFinalText('');
        setLiveInterimText('');
        setStatusNotice(null);
        userScrolledUpRef.current = false;
        const attachmentPayload = hasPendingAttachments
          ? {
              imgs:
                pendingImgsNow.length > 0
                  ? pendingImgsNow.map(({ mime, data, url, name }) => ({
                      mime,
                      data,
                      url,
                      name,
                    }))
                  : undefined,
              files: pendingFilesNow.length > 0 ? pendingFilesNow : undefined,
            }
          : undefined;
        if (pendingImgsNow.length > 0) {
          setSessionSharedImgs((prev) => [
            ...pendingImgsNow.map((img, idx) => ({
              ...img,
              id: `shared-${nowTs}-${idx}`,
              ts: nowTs,
            })),
            ...prev,
          ]);
        }
        setPendingSharedTurn({
          id: `turn-${nowTs}`,
          text: verdict.cleanText,
          ts: nowTs,
          imgs: pendingImgsNow.map((img) => ({ ...img })),
        });
        if (hasPendingAttachments) {
          setAttachedImgs([]);
          setAttachedFiles([]);
        }
        stateRef.current.onSendText(verdict.cleanText, attachmentPayload);
        return true;
      };

      // 1. Ultra-fast path: crisp Web Speech / Rolling STT transcript already captured (0ms STT delay!)
      if ((webSpeechText || (forceManual && hasStagedAttachments && !hasRecordedChunks)) && submitCleanText(webSpeechText, true)) {
        turnCommitInFlightRef.current = false;
        return;
      }

      // 2. Fast server STT path powered by gemini-3.1-flash-lite whenever audio was recorded
      if (recordedBlob && recordedBlob.size >= 400) {
        setIsTranscribingTurn(true);
        try {
          const audioBase64 = await blobToBase64Data(recordedBlob);
          if (!stateRef.current.isOpen) return;
          const stt = await requestServerVoiceTranscription({
            audioBase64,
            mimeType: recordedBlob.type || turnMimeRef.current || 'audio/webm',
            language: stateRef.current.voiceLang,
          });
          if (!stateRef.current.isOpen) return;
          if (stt.ok && stt.text && submitCleanText(stt.text, true)) {
            return;
          }
          if (hasStagedAttachments && submitCleanText('', true)) {
            return;
          }
          if (!stt.ok && stt.error && /network|fetch|offline/i.test(stt.error)) {
            setStatusNotice('Network issue while transcribing — listening again.');
          } else if (forceManual) {
            setStatusNotice(
              stateRef.current.voiceLang === 'bn-BD'
                ? 'কথা স্পষ্ট বোঝা যায়নি — মাইক্রোফোনের কাছে আবার বলুন।'
                : 'Could not catch clearly — please speak again.'
            );
          }
        } catch {
          setStatusNotice('Could not reach voice transcription — try speaking again.');
        } finally {
          setIsTranscribingTurn(false);
          turnCommitInFlightRef.current = false;
        }
        if (stateRef.current.isOpen && !stateRef.current.isGenerating) {
          startListeningTurn();
        }
        return;
      }

      turnCommitInFlightRef.current = false;
      setLiveCaption('');
      setLiveFinalText('');
      setLiveInterimText('');
      if (stateRef.current.isOpen && !stateRef.current.isGenerating) {
        startListeningTurn();
      }
    },
    [
      clearRollingSttTimer,
      clearSpeechRecCommitTimer,
      startListeningTurn,
      startSingleTurnRecognition,
      stopTurnRecorder,
      stopTurnRecognition,
    ]
  );

  commitActiveUtteranceRef.current = commitActiveUtterance;

  const handleInterruptAndListen = useCallback(() => {
    ensureAudioContext();
    stopAiSpeechPlayback();
    stateRef.current.onAbortGeneration?.();
    bargeInStateRef.current = createBargeInState();
    setStatusNotice(null);
    if (!stateRef.current.isDisconnected && !stateRef.current.isOffline) {
      startListeningTurn();
    }
  }, [ensureAudioContext, startListeningTurn, stopAiSpeechPlayback]);

  const startDecodedBufferPlayback = useCallback(
    (
      ctx: AudioContext,
      audioBuffer: AudioBuffer,
      ctrl?: AbortController | null,
      detuneCents = 0
    ): Promise<void> =>
      new Promise<void>((resolve) => {
        if (ctrl?.signal.aborted) {
          resolve();
          return;
        }
        const analyser = ensurePlaybackAnalyser(ctx);
        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        const rate = stateRef.current.speechRate || 1;
        if (rate !== 1) {
          source.playbackRate.value = rate;
        }
        if (detuneCents !== 0 && source.detune) {
          try {
            source.detune.value = detuneCents;
          } catch {
            // Ignore if detune unsupported
          }
        }
        source.connect(analyser);

        const now = ctx.currentTime;
        const startAt = Math.max(now + 0.02, nextPlayTimeRef.current);
        const effectiveDuration = audioBuffer.duration / rate;
        nextPlayTimeRef.current = startAt + effectiveDuration;

        activeSourcesRef.current.add(source);
        playbackSourceRef.current = source;
        pendingAudioBufferRef.current = null;
        aiSpeakingStartedAtRef.current = Date.now();
        bargeInStateRef.current = createBargeInState();
        releaseInitialGreetingMicGate();
        setNeedsTapToPlay(false);
        setIsSynthesizingVoice(false);
        stateRef.current.isSynthesizingVoice = false;
        setIsAiSpeaking(true);
        stateRef.current.isAiSpeaking = true;

        let settled = false;
        const finishSource = () => {
          if (settled) return;
          settled = true;
          playbackSafetyTimersRef.current.delete(safetyTimerId);
          activeSourcesRef.current.delete(source);
          if (playbackSourceRef.current === source) {
            playbackSourceRef.current = null;
          }
          scheduleAutoListenAfterSpeech(ctrl);
          resolve();
        };

        const waitMs =
          Math.max(0, Math.ceil((startAt - now + effectiveDuration) * 1000)) + 450;
        const safetyTimerId = window.setTimeout(finishSource, waitMs);
        playbackSafetyTimersRef.current.add(safetyTimerId);

        source.onended = () => {
          window.clearTimeout(safetyTimerId);
          finishSource();
        };

        try {
          source.start(startAt);
        } catch {
          window.clearTimeout(safetyTimerId);
          finishSource();
        }
      }),
    [ensurePlaybackAnalyser, releaseInitialGreetingMicGate, scheduleAutoListenAfterSpeech]
  );

  const schedulePcmSamples = useCallback(
    (
      ctx: AudioContext,
      samples: Float32Array,
      sampleRate: number,
      ctrl: AbortController | null | undefined,
      runId: number
    ) => {
      if (
        ctrl?.signal.aborted ||
        runId !== pipelineRunIdRef.current ||
        samples.length === 0
      ) {
        return;
      }
      bilingualSpeechPlayer.stop();
      const analyser = ensurePlaybackAnalyser(ctx);
      const isTurnStart = activeSourcesRef.current.size === 0;
      const smoothed = softLimitPcmSamples(samples, isTurnStart ? 3.5 : 0, sampleRate);
      const audioBuffer = ctx.createBuffer(1, smoothed.length, sampleRate);
      audioBuffer.copyToChannel(new Float32Array(smoothed), 0);

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      const rate = stateRef.current.speechRate || 1;
      if (rate !== 1) {
        source.playbackRate.value = rate;
      }
      source.connect(analyser);

      const now = ctx.currentTime;
      const startAt = Math.max(now + 0.015, nextPlayTimeRef.current);
      const effectiveDuration = audioBuffer.duration / rate;
      nextPlayTimeRef.current = startAt + effectiveDuration;

      if (activeSourcesRef.current.size === 0) {
        aiSpeakingStartedAtRef.current = Date.now();
        bargeInStateRef.current = createBargeInState();
      }
      releaseInitialGreetingMicGate();
      activeSourcesRef.current.add(source);
      playbackSourceRef.current = source;
      pendingAudioBufferRef.current = null;
      setNeedsTapToPlay(false);
      setIsSynthesizingVoice(false);
      stateRef.current.isSynthesizingVoice = false;
      setIsAiSpeaking(true);
      stateRef.current.isAiSpeaking = true;

      let settled = false;
      const finishSource = () => {
        if (settled) return;
        settled = true;
        playbackSafetyTimersRef.current.delete(safetyTimerId);
        activeSourcesRef.current.delete(source);
        if (playbackSourceRef.current === source) {
          playbackSourceRef.current = null;
        }
        scheduleAutoListenAfterSpeech(ctrl);
      };

      const waitMs =
        Math.max(0, Math.ceil((startAt - now + effectiveDuration) * 1000)) + 450;
      const safetyTimerId = window.setTimeout(finishSource, waitMs);
      playbackSafetyTimersRef.current.add(safetyTimerId);

      source.onended = () => {
        window.clearTimeout(safetyTimerId);
        finishSource();
      };

      try {
        source.start(startAt);
      } catch {
        window.clearTimeout(safetyTimerId);
        finishSource();
      }
    },
    [ensurePlaybackAnalyser, releaseInitialGreetingMicGate, scheduleAutoListenAfterSpeech]
  );

  const speakSentenceViaBrowser = useCallback(
    (
      text: string,
      msgId: string,
      isMaleVoice: boolean,
      voice: GeminiFemaleVoiceName,
      ctrl: AbortController
    ): Promise<void> =>
      new Promise((resolve) => {
        if (!isSpeechSynthesisSupported() || ctrl.signal.aborted) {
          resolve();
          return;
        }
        aiSpeakingStartedAtRef.current = Date.now();
        bargeInStateRef.current = createBargeInState();
        releaseInitialGreetingMicGate();
        setActiveVoiceModel('browser');
        setIsSynthesizingVoice(false);
        stateRef.current.isSynthesizingVoice = false;
        setIsAiSpeaking(true);
        stateRef.current.isAiSpeaking = true;
        bilingualSpeechPlayer.speak({
          msgId: `live-voice-${msgId}-${Date.now()}`,
          text,
          voiceProfile: isMaleVoice ? 'bengali_male' : 'bengali_female',
          geminiVoice: voice,
          rate: stateRef.current.speechRate || 1,
          skipServerTts: true,
          onDone: () => resolve(),
        });
      }),
    [releaseInitialGreetingMicGate]
  );

  const drainSpeechPipeline = useCallback(
    async (msgId: string) => {
      if (pipelineBusyRef.current) return;
      const ctrl = ttsAbortRef.current;
      if (!ctrl || ctrl.signal.aborted) return;

      const runId = pipelineRunIdRef.current;
      pipelineBusyRef.current = true;
      let haltPipeline = false;
      try {
        while (
          pendingChunksRef.current.length > 0 &&
          !ctrl.signal.aborted &&
          runId === pipelineRunIdRef.current
        ) {
          // Coalesce queued chunks up to 560 chars so multi-sentence replies share one continuous vocal breath
          let sentence = (pendingChunksRef.current.shift() || '').trim();
          while (
            pendingChunksRef.current.length > 0 &&
            sentence.length + 1 + (pendingChunksRef.current[0]?.length || 0) <= 560
          ) {
            const nextPart = (pendingChunksRef.current.shift() || '').trim();
            if (nextPart) {
              sentence = sentence ? `${sentence} ${nextPart}` : nextPart;
            }
          }
          sentence = sentence.trim();
          if (!sentence) continue;

          const voice = stateRef.current.selectedVoice;
          const isMaleVoice =
            voice === 'Puck' || voice === 'Charon' || voice === 'Fenrir';
          const voiceStyle = buildVoiceStylePrompt(voice);

          if (activeSourcesRef.current.size === 0) {
            setIsSynthesizingVoice(true);
            stateRef.current.isSynthesizingVoice = true;
          }

          const ctx = ensureAudioContext();
          if (ctx && ctx.state === 'suspended') {
            try {
              await ctx.resume();
            } catch {
              // Handled below
            }
          }
          if (ctrl.signal.aborted || runId !== pipelineRunIdRef.current) {
            haltPipeline = true;
            break;
          }

          // 1. Primary ultra-low-latency 24kHz PCM stream from Gemini 3.8 Live Native Audio (~320ms first chunk)
          if (ctx && (ctx.state as string) !== 'suspended') {
            const streamRes = await streamGeminiPcmSpeech({
              text: sentence,
              voiceName: voice,
              style: voiceStyle,
              signal: ctrl.signal,
              onPcmChunk: (samples, sampleRate) => {
                schedulePcmSamples(ctx, samples, sampleRate, ctrl, runId);
              },
            });
            if (ctrl.signal.aborted || runId !== pipelineRunIdRef.current) {
              haltPipeline = true;
              break;
            }
            if (streamRes.ok && streamRes.receivedAudio) {
              if (streamRes.modelUsed) {
                setActiveVoiceModel(streamRes.modelUsed);
              }
              continue;
            }
          }

          // 2. Unary neural audio endpoint (/api/voice/tts: Gemini 3.8 Live WAV -> Gemini TTS)
          // Retry once in the EXACT same voice before notifying fallback/error so persona never shifts
          let res = await requestGeminiFemaleSpeech({
            text: sentence,
            voiceName: voice,
            style: voiceStyle,
            signal: ctrl.signal,
          });
          if (
            (!res.ok || !res.audioBase64) &&
            !ctrl.signal.aborted &&
            runId === pipelineRunIdRef.current
          ) {
            await new Promise((r) => setTimeout(r, 320));
            if (!ctrl.signal.aborted && runId === pipelineRunIdRef.current) {
              res = await requestGeminiFemaleSpeech({
                text: sentence,
                voiceName: voice,
                style: voiceStyle,
                signal: ctrl.signal,
              });
            }
          }
          if (ctrl.signal.aborted || runId !== pipelineRunIdRef.current) {
            haltPipeline = true;
            break;
          }

          if (!res.ok || !res.audioBase64) {
            // Only fall back to device synthesis if device is strictly offline
            if (
              stateRef.current.isOffline &&
              !/abort/i.test(res.error || '') &&
              activeSourcesRef.current.size === 0 &&
              isSpeechSynthesisSupported()
            ) {
              await speakSentenceViaBrowser(sentence, msgId, isMaleVoice, voice, ctrl);
              continue;
            }
            if (res.error && !/abort/i.test(res.error)) {
              setStatusNotice(res.error);
            }
            ttsFailedTurnRef.current = msgId;
            pendingChunksRef.current = [];
            haltPipeline = true;
            setIsSynthesizingVoice(false);
            stateRef.current.isSynthesizingVoice = false;
            setIsAiSpeaking(false);
            stateRef.current.isAiSpeaking = false;
            break;
          }

          if (res.modelUsed) {
            setActiveVoiceModel(res.modelUsed);
          } else if (res.isBackupVoice) {
            setActiveVoiceModel('neural-voice-hd');
          }

          try {
            const activeCtx = ensureAudioContext();
            const bytes = base64ToUint8Array(res.audioBase64);
            if (!activeCtx || bytes.byteLength === 0) continue;
            const audioBuffer = await activeCtx.decodeAudioData(bytes.slice().buffer);
            if (ctrl.signal.aborted || runId !== pipelineRunIdRef.current) {
              haltPipeline = true;
              break;
            }
            if ((activeCtx.state as string) === 'suspended') {
              pendingAudioBufferRef.current = audioBuffer;
              haltPipeline = true;
              setNeedsTapToPlay(true);
              setIsSynthesizingVoice(false);
              stateRef.current.isSynthesizingVoice = false;
              break;
            }
            const detuneCents =
              res.modelUsed === 'neural-voice-hd' && isMaleVoice
                ? voice === 'Puck'
                  ? -150
                  : -220
                : 0;
            // Ensure browser speechSynthesis is silent before playing WebAudio
            bilingualSpeechPlayer.stop();
            await startDecodedBufferPlayback(activeCtx, audioBuffer, ctrl, detuneCents);
          } catch {
            if (
              stateRef.current.isOffline &&
              !ctrl.signal.aborted &&
              runId === pipelineRunIdRef.current &&
              activeSourcesRef.current.size === 0 &&
              isSpeechSynthesisSupported()
            ) {
              await speakSentenceViaBrowser(sentence, msgId, isMaleVoice, voice, ctrl);
            } else {
              ttsFailedTurnRef.current = msgId;
              pendingChunksRef.current = [];
              haltPipeline = true;
              setIsSynthesizingVoice(false);
              stateRef.current.isSynthesizingVoice = false;
              setIsAiSpeaking(false);
              stateRef.current.isAiSpeaking = false;
              break;
            }
          }
        }
      } finally {
        if (runId === pipelineRunIdRef.current) {
          pipelineBusyRef.current = false;
          if (
            !haltPipeline &&
            pendingChunksRef.current.length > 0 &&
            ttsAbortRef.current &&
            !ttsAbortRef.current.signal.aborted
          ) {
            void drainSpeechPipeline(msgId);
          } else if (!pendingAudioBufferRef.current) {
            scheduleAutoListenAfterSpeech(ctrl);
          }
        }
      }
    },
    [
      ensureAudioContext,
      scheduleAutoListenAfterSpeech,
      schedulePcmSamples,
      speakSentenceViaBrowser,
      startDecodedBufferPlayback,
    ]
  );

  // Establish persistent real voice connection (mic + analyser + one-time AI greeting)
  const establishVoiceConnection = useCallback(
    async (allowGreeting: boolean) => {
      const token = ++sessionTokenRef.current;
      releaseAllMicResources();
      stopAiSpeechPlayback();
      const willGreet = Boolean(allowGreeting && !hasGreetedRef.current);
      isInitialGreetingPendingRef.current = willGreet;
      setStatusNotice(null);
      setIsDisconnected(false);
      stateRef.current.isDisconnected = false;
      setIsReconnecting(false);
      setIsConnecting(true);
      stateRef.current.isConnecting = true;

      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        isInitialGreetingPendingRef.current = false;
        setIsConnecting(false);
        stateRef.current.isConnecting = false;
        setIsOffline(true);
        setIsReconnecting(true);
        setStatusNotice('No internet connection — waiting to reconnect.');
        return;
      }

      const ctx = ensureAudioContext();
      if (ctx && ctx.state === 'suspended') {
        try {
          await ctx.resume();
        } catch {
          // Will gracefully recover on tap if browser enforces autoplay
        }
      }

      if (
        typeof navigator === 'undefined' ||
        !navigator.mediaDevices ||
        typeof navigator.mediaDevices.getUserMedia !== 'function'
      ) {
        isInitialGreetingPendingRef.current = false;
        setIsConnecting(false);
        stateRef.current.isConnecting = false;
        setIsDisconnected(false);
        stateRef.current.isDisconnected = false;
        setStatusNotice(
          stateRef.current.voiceLang === 'bn-BD'
            ? 'কীবোর্ড বা ছবি পাঠিয়ে কথা বলুন'
            : 'Type or send a photo below'
        );
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            channelCount: 1,
          },
        });

        if (token !== sessionTokenRef.current || !stateRef.current.isOpen) {
          stream.getTracks().forEach((t) => {
            try {
              t.stop();
            } catch {
              // Ignore
            }
          });
          return;
        }

        persistentStreamRef.current = stream;
        setMicStreamLive(true);
        stream.getAudioTracks().forEach((track) => {
          track.enabled =
            !stateRef.current.isMuted && !isInitialGreetingPendingRef.current;
          track.onended = () => {
            if (token !== sessionTokenRef.current || !stateRef.current.isOpen) return;
            setMicStreamLive(false);
            setIsSessionListening(false);
            setIsDisconnected(true);
            stateRef.current.isDisconnected = true;
            setStatusNotice('Microphone connection ended. Tap reconnect to continue.');
          };
        });

        const activeCtx = ensureAudioContext();
        if (activeCtx) {
          try {
            if (activeCtx.state === 'suspended') {
              await activeCtx.resume().catch(() => {});
            }
            const src = activeCtx.createMediaStreamSource(stream);
            const analyser = activeCtx.createAnalyser();
            analyser.fftSize = 256;
            analyser.smoothingTimeConstant = 0.65;
            // Connect analyser through a zero-gain node to destination so Chromium & Android WebView
            // always pull real-time microphone audio frames through the WebAudio graph!
            const silentGain = activeCtx.createGain();
            silentGain.gain.value = 0;
            src.connect(analyser);
            analyser.connect(silentGain);
            silentGain.connect(activeCtx.destination);
            micSourceNodeRef.current = src;
            micAnalyserRef.current = analyser;
            micSilentGainRef.current = silentGain;
          } catch {
            micAnalyserRef.current = null;
          }
        }

        setIsConnecting(false);
        stateRef.current.isConnecting = false;
        setIsDisconnected(false);
        stateRef.current.isDisconnected = false;
        setIsReconnecting(false);

        if (allowGreeting && !hasGreetedRef.current) {
          hasGreetedRef.current = true;
          isInitialGreetingPendingRef.current = true;
          const greeting = buildVoiceGreeting(
            stateRef.current.userName,
            stateRef.current.voiceLang
          );
          setGreetingText(greeting);
          ttsAbortRef.current = new AbortController();
          useBrowserTtsForTurnRef.current = false;
          pendingChunksRef.current = [greeting];
          aiSpeakingStartedAtRef.current = 0;
          void drainSpeechPipeline('greeting');
        } else {
          isInitialGreetingPendingRef.current = false;
          startListeningTurn();
        }
      } catch (err) {
        if (token !== sessionTokenRef.current || !stateRef.current.isOpen) return;
        setMicStreamLive(false);
        setIsConnecting(false);
        stateRef.current.isConnecting = false;
        const name = err instanceof Error ? err.name : '';
        if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
          setIsDisconnected(false);
          stateRef.current.isDisconnected = false;
          setStatusNotice(
            stateRef.current.voiceLang === 'bn-BD'
              ? 'কীবোর্ড বা ছবি পাঠিয়ে কথা বলুন'
              : 'Type or send a photo below'
          );
        } else {
          setIsDisconnected(true);
          stateRef.current.isDisconnected = true;
          if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
            setStatusNotice(
              'মাইক পারমিশন বন্ধ আছে — মাইক অনুমতি দিয়ে Reconnect চাপুন অথবা কীবোর্ডে লিখুন।'
            );
          } else {
            setStatusNotice('মাইক্রোফোন চালু করা যায়নি। আবার চেষ্টা করুন।');
          }
        }

        if (allowGreeting && !hasGreetedRef.current) {
          hasGreetedRef.current = true;
          isInitialGreetingPendingRef.current = true;
          const greeting = buildVoiceGreeting(
            stateRef.current.userName,
            stateRef.current.voiceLang
          );
          setGreetingText(greeting);
          ttsAbortRef.current = new AbortController();
          useBrowserTtsForTurnRef.current = false;
          pendingChunksRef.current = [greeting];
          aiSpeakingStartedAtRef.current = 0;
          void drainSpeechPipeline('greeting');
        } else {
          isInitialGreetingPendingRef.current = false;
        }
      }
    },
    [
      drainSpeechPipeline,
      ensureAudioContext,
      releaseAllMicResources,
      startListeningTurn,
      stopAiSpeechPlayback,
    ]
  );

  // Open / close lifecycle & online/offline real network monitoring
  useEffect(() => {
    if (!isOpen) {
      sessionTokenRef.current += 1;
      hasGreetedRef.current = false;
      isInitialGreetingPendingRef.current = false;
      ttsFailedTurnRef.current = null;
      setSeconds(0);
      setDraftText('');
      setKeyboardOpen(false);
      setIsMuted(false);
      setLiveCaption('');
      setLiveFinalText('');
      setLiveInterimText('');
      setIsUserVoicing(false);
      setHasRecordedAudio(false);
      setNeedsTapToPlay(false);
      setGreetingText('');
      setSessionUserText('');
      setAttachedImgs([]);
      setAttachedFiles([]);
      setSessionSharedImgs([]);
      setPendingSharedTurn(null);
      setFullscreenImage(null);
      setStatusNotice(null);
      setIsConnecting(false);
      setIsReconnecting(false);
      setIsDisconnected(false);
      setIsTranscribingTurn(false);
      activeTurnMsgIdRef.current = null;
      spokenCursorRef.current = 0;
      lastSubmittedRef.current = null;
      recognitionFinalPrefixRef.current = '';
      recognitionSessionFinalRef.current = '';
      recognitionLiveTextRef.current = '';
      stopAiSpeechPlayback();
      releaseAllMicResources();
      return;
    }

    spokenMsgIdRef.current = lastAiMessage?.id || null;
    activeTurnMsgIdRef.current = lastAiMessage?.id || null;
    spokenCursorRef.current = lastAiMessage?.text
      ? formatTextForNaturalSpeech(lastAiMessage.text, 12000).length
      : 0;
    ttsFailedTurnRef.current = null;
    setLiveCaption('');
    setLiveFinalText('');
    setLiveInterimText('');
    setIsUserVoicing(false);
    setHasRecordedAudio(false);
    setAttachedImgs([]);
    setAttachedFiles([]);
    setSessionSharedImgs([]);
    setPendingSharedTurn(null);
    setFullscreenImage(null);
    setSessionUserText('');
    setGreetingText('');
    recognitionFinalPrefixRef.current = '';
    recognitionSessionFinalRef.current = '';
    recognitionLiveTextRef.current = '';
    onCancelMic?.();

    const timer = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    void establishVoiceConnection(true);

    const handleOffline = () => {
      setIsOffline(true);
      setIsReconnecting(true);
      stopListeningTurnOnly();
      stopAiSpeechPlayback();
      setStatusNotice('Connection lost — attempting to reconnect.');
    };
    const handleOnline = () => {
      setIsOffline(false);
      setIsReconnecting(false);
      if (stateRef.current.isOpen) {
        setStatusNotice(null);
        if (
          persistentStreamRef.current &&
          persistentStreamRef.current
            .getAudioTracks()
            .some((t) => t.readyState === 'live')
        ) {
          startListeningTurn();
        } else {
          void establishVoiceConnection(false);
        }
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTypingTarget =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.tagName === 'SELECT';

      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (stateRef.current.fullscreenImage) {
          setFullscreenImage(null);
          return;
        }
        if (stateRef.current.keyboardOpen) {
          setKeyboardOpen(false);
          return;
        }
        return;
      }
      if (isTypingTarget) return;

      if (e.key.toLowerCase() === 'm') {
        e.preventDefault();
        setIsMuted((prev) => {
          const nextMuted = !prev;
          if (persistentStreamRef.current) {
            persistentStreamRef.current.getAudioTracks().forEach((track) => {
              track.enabled = !nextMuted && !isInitialGreetingPendingRef.current;
            });
          }
          if (nextMuted) {
            stopTurnRecognition();
            setIsUserVoicing(false);
          } else if (
            visualStateRef.current === 'listening' &&
            !stateRef.current.isGenerating &&
            !stateRef.current.isAiSpeaking &&
            !stateRef.current.isDisconnected &&
            !isInitialGreetingPendingRef.current
          ) {
            startListeningTurn();
          }
          return nextMuted;
        });
      } else if (e.code === 'Space') {
        e.preventDefault();
        if (
          visualStateRef.current === 'speaking' ||
          stateRef.current.isSynthesizingVoice
        ) {
          handleInterruptAndListen();
        } else if (
          visualStateRef.current === 'listening' &&
          !stateRef.current.isMuted &&
          (turnHadRealSpeechRef.current ||
            recognitionLiveTextRef.current.trim() ||
            turnChunksRef.current.length >= 2)
        ) {
          void commitActiveUtteranceRef.current(true);
        }
      }
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('keydown', handleKeyDown);
      sessionTokenRef.current += 1;
      isInitialGreetingPendingRef.current = false;
      stopAiSpeechPlayback();
      releaseAllMicResources();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Clear cross-chat image and transcript state whenever active chat switches
  useEffect(() => {
    if (prevChatIdRef.current === chatId) return;
    prevChatIdRef.current = chatId;
    ttsFailedTurnRef.current = null;
    setAttachedImgs([]);
    setAttachedFiles([]);
    setSessionSharedImgs([]);
    setPendingSharedTurn(null);
    setFullscreenImage(null);
    setLiveCaption('');
    setLiveFinalText('');
    setLiveInterimText('');
    setIsUserVoicing(false);
    setHasRecordedAudio(false);
    setSessionUserText('');
    setGreetingText('');
    setStatusNotice(null);
    recognitionFinalPrefixRef.current = '';
    recognitionSessionFinalRef.current = '';
    recognitionLiveTextRef.current = '';
    spokenMsgIdRef.current = lastAiMessage?.id || null;
    activeTurnMsgIdRef.current = lastAiMessage?.id || null;
    spokenCursorRef.current = lastAiMessage?.text
      ? formatTextForNaturalSpeech(lastAiMessage.text, 12000).length
      : 0;
  }, [chatId, lastAiMessage?.id, lastAiMessage?.text]);

  // Real-time streaming AI reply → Single-Voice TTS pipeline
  useEffect(() => {
    if (!isOpen) return;
    if (!lastAiMessage || !lastAiMessage.id) return;

    const cleanTextLen = formatTextForNaturalSpeech(lastAiMessage.text, 12000).length;

    if (
      spokenMsgIdRef.current === lastAiMessage.id &&
      activeTurnMsgIdRef.current === lastAiMessage.id &&
      spokenCursorRef.current >= cleanTextLen
    ) {
      if (
        !isGenerating &&
        !isInitialGreetingPendingRef.current &&
        !stateRef.current.isConnecting &&
        !pipelineBusyRef.current
      ) {
        scheduleAutoListenAfterSpeech(ttsAbortRef.current);
      }
      return;
    }

    if (activeTurnMsgIdRef.current !== lastAiMessage.id) {
      activeTurnMsgIdRef.current = lastAiMessage.id;
      spokenMsgIdRef.current = lastAiMessage.id;
      spokenCursorRef.current = 0;
      ttsFailedTurnRef.current = null;
      isInitialGreetingPendingRef.current = false;
      useBrowserTtsForTurnRef.current = false;
      stopListeningTurnOnly();
      stopAiSpeechPlayback();
      setStatusNotice(null);

      if (lastAiMessage.isError) {
        const errClean = formatTextForNaturalSpeech(lastAiMessage.text, 200);
        if (errClean) setStatusNotice(errClean);
        spokenCursorRef.current = cleanTextLen;
        scheduleAutoListenAfterSpeech(null);
        return;
      }

      ttsAbortRef.current = new AbortController();
    }

    if (lastAiMessage.isError || ttsFailedTurnRef.current === lastAiMessage.id) return;

    // Stream speech immediately as the first sentence/clause arrives without waiting for the full reply
    const { chunks, nextCursor } = extractReadySpeechChunks(
      lastAiMessage.text,
      spokenCursorRef.current,
      !isGenerating
    );

    if (chunks.length > 0) {
      spokenCursorRef.current = nextCursor;
      pendingChunksRef.current.push(...chunks);
      if (!ttsAbortRef.current || ttsAbortRef.current.signal.aborted) {
        ttsAbortRef.current = new AbortController();
      }
      void drainSpeechPipeline(lastAiMessage.id);
    } else if (
      !isGenerating &&
      !isInitialGreetingPendingRef.current &&
      !stateRef.current.isConnecting &&
      !pipelineBusyRef.current
    ) {
      scheduleAutoListenAfterSpeech(ttsAbortRef.current);
    }
  }, [
    drainSpeechPipeline,
    isGenerating,
    isOpen,
    lastAiMessage?.id,
    lastAiMessage?.isError,
    lastAiMessage?.text,
    scheduleAutoListenAfterSpeech,
    stopAiSpeechPlayback,
    stopListeningTurnOnly,
  ]);

  // Unified 60fps loop: Real VAD + Barge-In + Clean ChatGPT Luminous Fluid Orb
  useEffect(() => {
    if (!isOpen) return;
    const orbCanvas = orbCanvasRef.current;
    if (!orbCanvas) return;
    const orbCtx = orbCanvas.getContext('2d');
    if (!orbCtx) return;

    const reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    let rafId = 0;
    let t = 0;
    const timeBuf = new Uint8Array(256);
    const freqBuf = new Uint8Array(128);

    const tick = () => {
      const nowMs = Date.now();
      const state = visualStateRef.current;
      const cur = stateRef.current;

      // 1. Sample real microphone vocal energy (time-domain RMS + vocal frequency bins)
      let micRms = 0;
      if (micAnalyserRef.current && !cur.isMuted && !isInitialGreetingPendingRef.current) {
        micAnalyserRef.current.getByteTimeDomainData(timeBuf);
        micAnalyserRef.current.getByteFrequencyData(freqBuf);
        micRms = computeVocalEnergy(timeBuf, freqBuf);
      }
      micLevelRef.current += (Math.min(1, micRms * 8.5) - micLevelRef.current) * 0.26;

      // Real hands-free VAD during active Listening
      if (
        state === 'listening' &&
        cur.isSessionListening &&
        !cur.isMuted &&
        !cur.isGenerating &&
        !cur.isTranscribingTurn &&
        !isInitialGreetingPendingRef.current &&
        !turnCommitInFlightRef.current &&
        micAnalyserRef.current
      ) {
        const vadRes = stepVadTracker(vadStateRef.current, micRms, nowMs);
        vadStateRef.current = vadRes.nextState;

        if (vadRes.action === 'speech_start') {
          turnHadRealSpeechRef.current = true;
          setIsUserVoicing(true);
          if (!recognitionRef.current) {
            startSingleTurnRecognition();
          }
        } else if (vadRes.action === 'speaking') {
          if (!turnHadRealSpeechRef.current && vadRes.nextState.speechConfirmed) {
            turnHadRealSpeechRef.current = true;
          }
          setIsUserVoicing(vadRes.nextState.isVoiceActive);
        } else if (vadRes.action === 'commit') {
          setIsUserVoicing(false);
          void commitActiveUtteranceRef.current(false);
        } else if (!vadRes.nextState.isVoiceActive && !recognitionLiveTextRef.current) {
          setIsUserVoicing(false);
        }
      }

      // Real echo-guarded Barge-In while AI is actively speaking (blocked during initial greeting synthesis)
      if (
        micAnalyserRef.current &&
        shouldAllowBargeIn({
          voiceState: state,
          isAiSpeaking: cur.isAiSpeaking,
          isMuted: cur.isMuted,
          isInitialGreetingPending: isInitialGreetingPendingRef.current,
          aiSpeakingStartedAt: aiSpeakingStartedAtRef.current,
        })
      ) {
        const barge = stepBargeInDetector(bargeInStateRef.current, {
          rms: micRms,
          nowMs,
          aiSpeakingStartedAt: aiSpeakingStartedAtRef.current,
          echoGuardMs: 340,
          requiredDurationMs: 180,
        });
        bargeInStateRef.current = barge.nextState;
        if (barge.shouldInterrupt) {
          handleInterruptAndListen();
        }
      }

      // 2. Compute smooth vocal energy for ChatGPT luminous cloud orb
      let targetEnergy = 0.08;
      const activeAnalyser =
        state === 'speaking'
          ? playbackAnalyserRef.current
          : state === 'listening' && !cur.isMuted
            ? micAnalyserRef.current
            : null;

      if (activeAnalyser) {
        activeAnalyser.getByteFrequencyData(freqBuf);
        let sum = 0;
        const bins = Math.min(46, freqBuf.length);
        for (let i = 0; i < bins; i += 1) {
          sum += freqBuf[i]!;
        }
        targetEnergy = Math.min(1, (sum / (bins * 255)) * 2.7);
        if (state === 'listening') {
          targetEnergy = Math.max(targetEnergy, micLevelRef.current * 0.94);
        }
      } else if (state === 'thinking') {
        targetEnergy = 0.24 + 0.1 * Math.sin(t * 2.4);
      } else if (state === 'connecting' || state === 'reconnecting') {
        targetEnergy = 0.16 + 0.06 * Math.sin(t * 1.9);
      } else if (state === 'disconnected') {
        targetEnergy = 0.02;
      }

      if (state === 'speaking' && targetEnergy < 0.16) {
        targetEnergy = 0.28 + 0.18 * Math.abs(Math.sin(t * 3.6)) + 0.1 * Math.cos(t * 5.8);
      }

      energyRef.current += (targetEnergy - energyRef.current) * 0.18;
      const e = energyRef.current;

      // 3. Render smooth ChatGPT-style Sky & Pearl Fluid Sphere
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const orbSize = 260;
      if (orbCanvas.width !== orbSize * dpr || orbCanvas.height !== orbSize * dpr) {
        orbCanvas.width = orbSize * dpr;
        orbCanvas.height = orbSize * dpr;
      }

      orbCtx.save();
      orbCtx.scale(dpr, dpr);
      orbCtx.clearRect(0, 0, orbSize, orbSize);

      const cx = orbSize / 2;
      const cy = orbSize / 2;
      const breath = Math.sin(t * 1.35) * 2.2;
      const baseRadius =
        state === 'disconnected'
          ? 70
          : state === 'speaking'
            ? 84 + e * 14 + breath
            : state === 'listening'
              ? 82 + e * 12 + breath
              : 78 + e * 7 + breath;

      // Soft ambient outer bloom
      const outerHalo = orbCtx.createRadialGradient(
        cx,
        cy,
        baseRadius * 0.45,
        cx,
        cy,
        baseRadius * 1.48
      );
      outerHalo.addColorStop(
        0,
        state === 'disconnected'
          ? 'rgba(148, 163, 184, 0.12)'
          : `rgba(96, 165, 250, ${0.22 + e * 0.22})`
      );
      outerHalo.addColorStop(1, 'rgba(0, 0, 0, 0)');
      orbCtx.fillStyle = outerHalo;
      orbCtx.beginPath();
      orbCtx.arc(cx, cy, baseRadius * 1.48, 0, Math.PI * 2);
      orbCtx.fill();

      // Clipped fluid sky-pearl sphere
      orbCtx.save();
      orbCtx.beginPath();
      orbCtx.arc(cx, cy, baseRadius, 0, Math.PI * 2);
      orbCtx.clip();

      const sphereBase = orbCtx.createRadialGradient(
        cx - baseRadius * 0.25,
        cy - baseRadius * 0.3,
        baseRadius * 0.08,
        cx + baseRadius * 0.15,
        cy + baseRadius * 0.2,
        baseRadius * 1.15
      );
      if (state === 'disconnected') {
        sphereBase.addColorStop(0, 'rgba(203, 213, 225, 0.55)');
        sphereBase.addColorStop(0.65, 'rgba(71, 85, 105, 0.85)');
        sphereBase.addColorStop(1, 'rgba(30, 41, 59, 0.96)');
      } else {
        sphereBase.addColorStop(0, '#f8fafc');
        sphereBase.addColorStop(0.38, '#7dd3fc');
        sphereBase.addColorStop(0.76, '#3b82f6');
        sphereBase.addColorStop(1, '#1d4ed8');
      }
      orbCtx.fillStyle = sphereBase;
      orbCtx.fillRect(cx - baseRadius, cy - baseRadius, baseRadius * 2, baseRadius * 2);

      // Gentle internal fluid clouds (ChatGPT sky swirl)
      if (state !== 'disconnected') {
        orbCtx.globalCompositeOperation = 'screen';
        for (let i = 0; i < 3; i += 1) {
          const driftSpeed = state === 'speaking' ? 1.1 : state === 'thinking' ? 1.35 : 0.65;
          const a = t * driftSpeed * (0.7 + i * 0.22) + i * 2.1;
          const bx = cx + Math.cos(a) * baseRadius * (0.28 + e * 0.14);
          const by = cy + Math.sin(a * 0.88) * baseRadius * (0.26 + e * 0.14);
          const cloud = orbCtx.createRadialGradient(
            bx,
            by,
            baseRadius * 0.04,
            bx,
            by,
            baseRadius * 0.78
          );
          cloud.addColorStop(
            0,
            i === 0
              ? `rgba(255, 255, 255, ${0.52 + e * 0.28})`
              : `rgba(186, 230, 253, ${0.38 + e * 0.24})`
          );
          cloud.addColorStop(1, 'rgba(59, 130, 246, 0)');
          orbCtx.fillStyle = cloud;
          orbCtx.beginPath();
          orbCtx.arc(bx, by, baseRadius * 0.78, 0, Math.PI * 2);
          orbCtx.fill();
        }
      }

      // Soft bottom crescent shadow for natural sphere depth
      orbCtx.globalCompositeOperation = 'source-over';
      const rim = orbCtx.createRadialGradient(
        cx - baseRadius * 0.18,
        cy - baseRadius * 0.22,
        baseRadius * 0.55,
        cx,
        cy,
        baseRadius
      );
      rim.addColorStop(0, 'rgba(255, 255, 255, 0)');
      rim.addColorStop(1, 'rgba(255, 255, 255, 0.28)');
      orbCtx.fillStyle = rim;
      orbCtx.beginPath();
      orbCtx.arc(cx, cy, baseRadius, 0, Math.PI * 2);
      orbCtx.fill();

      orbCtx.restore();
      orbCtx.restore();

      if (!reducedMotion) {
        t +=
          state === 'speaking'
            ? 0.036
            : state === 'listening'
              ? 0.028
              : state === 'thinking'
                ? 0.032
                : 0.018;
        rafId = window.requestAnimationFrame(tick);
      }
    };

    tick();
    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, [handleInterruptAndListen, isOpen, startSingleTurnRecognition]);

  const fullAiSourceText =
    lastAiMessage?.text && activeTurnMsgIdRef.current === lastAiMessage.id
      ? lastAiMessage.text
      : lastAiMessage?.text || greetingText;

  const liveConversationImages = useMemo(
    () =>
      collectLiveConversationImages({
        stagedImgs: attachedImgs,
        sessionSharedImgs,
        messages,
      }),
    [attachedImgs, messages, sessionSharedImgs]
  );

  const unifiedTimeline = useMemo(
    () =>
      buildUnifiedVoiceTimeline({
        messages,
        lastUserText: sessionUserText || lastUserText,
        lastAiMessage: fullAiSourceText,
        greetingText,
        liveCaption,
        liveFinalText,
        liveInterimText,
        isTranscribingTurn,
        isGenerating,
        stagedImgs: attachedImgs,
        pendingSharedTurn,
        userName,
        voiceName: selectedVoice,
        voiceLang,
      }),
    [
      attachedImgs,
      fullAiSourceText,
      greetingText,
      isGenerating,
      isTranscribingTurn,
      lastUserText,
      liveCaption,
      liveFinalText,
      liveInterimText,
      messages,
      pendingSharedTurn,
      selectedVoice,
      sessionUserText,
      userName,
      voiceLang,
    ]
  );

  const lastTimelineEntry = unifiedTimeline[unifiedTimeline.length - 1];
  const timelineAutoScrollSignature = `${unifiedTimeline.length}::${lastTimelineEntry?.id || ''}::${lastTimelineEntry?.streamState || ''}::${lastTimelineEntry?.text?.length || 0}::${liveCaption.length}`;

  // Smooth auto-scrolling whenever partial transcripts, new messages, or streaming AI tokens arrive
  useEffect(() => {
    if (!isOpen) return;
    const el = timelineScrollRef.current;
    if (!el || userScrolledUpRef.current) return;
    const raf = window.requestAnimationFrame(() => {
      try {
        if (typeof el.scrollTo === 'function') {
          el.scrollTo({
            top: el.scrollHeight,
            behavior: 'smooth',
          });
        } else {
          el.scrollTop = el.scrollHeight;
        }
      } catch {
        el.scrollTop = el.scrollHeight;
      }
    });
    return () => window.cancelAnimationFrame(raf);
  }, [isOpen, timelineAutoScrollSignature]);

  if (!isOpen) return null;

  const micOffOrMissing = isMuted || isDisconnected || !micStreamLive;

  const activeCopy = STATE_COPY[voiceState];
  const effectiveHeadline =
    voiceState === 'thinking'
      ? voiceLang === 'bn-BD'
        ? 'ভাবছি…'
        : 'Thinking...'
      : voiceState === 'disconnected' || (voiceState === 'listening' && micOffOrMissing)
        ? voiceLang === 'bn-BD'
          ? 'মাইক বন্ধ'
          : isMuted
            ? 'Microphone muted'
            : 'Microphone off'
        : voiceState === 'listening' && (isUserVoicing || Boolean(liveCaption.trim()))
          ? voiceLang === 'bn-BD'
            ? 'শুনছি…'
            : 'Listening...'
          : voiceState === 'listening'
            ? voiceLang === 'bn-BD'
              ? 'শুনছি'
              : activeCopy.headline
            : voiceState === 'speaking'
              ? voiceLang === 'bn-BD'
                ? 'কথা বলছি'
                : activeCopy.headline
              : voiceState === 'connecting' && voiceLang === 'bn-BD'
                ? 'সংযোগ হচ্ছে…'
                : activeCopy.headline;

  const handleTimelineScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    userScrolledUpRef.current = distanceFromBottom > 56;
  };

  const handleSelectVoicePersona = (nextVoice: GeminiFemaleVoiceName) => {
    ensureAudioContext();
    setSelectedVoice(nextVoice);
    stateRef.current.selectedVoice = nextVoice;
    onChangePreferredVoice?.(nextVoice);
    if (
      !isGenerating &&
      !isTranscribingTurn &&
      !isOffline &&
      !isUserVoicing &&
      !liveCaption.trim()
    ) {
      stopListeningTurnOnly();
      stopAiSpeechPlayback();
      const sampleText =
        voiceLang === 'bn-BD'
          ? `হ্যালো, আমি ${nextVoice}। বলুন, কীভাবে সাহায্য করতে পারি?`
          : `Hello, I'm ${nextVoice}. Tell me how I can help you.`;
      setGreetingText(sampleText);
      ttsAbortRef.current = new AbortController();
      pendingChunksRef.current = [sampleText];
      void drainSpeechPipeline(`persona-${nextVoice}`);
    }
  };

  // Screen/orb taps must NEVER interrupt AI speech or force microphone listening.
  // Only restore connection if currently disconnected; otherwise passively keep AudioContext alive.
  const handlePassiveOrbTap = () => {
    ensureAudioContext();
    if (voiceState === 'disconnected') {
      void establishVoiceConnection(false);
    }
  };

  const handlePickVoiceImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0) return;

    for (const f of files.slice(0, 3)) {
      if (
        !/^image\/(png|jpe?g|webp|gif|bmp)$/i.test(f.type) &&
        !/\.(png|jpe?g|webp|gif|bmp)$/i.test(f.name)
      ) {
        setStatusNotice('শুধুমাত্র PNG, JPG, WebP বা GIF ছবি যুক্ত করা যাবে।');
        continue;
      }
      if (f.size > 15 * 1024 * 1024) {
        setStatusNotice('ছবির আকার ১৫ মেগাবাইটের বেশি হওয়া যাবে না।');
        continue;
      }
      try {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ''));
          reader.onerror = () => reject(new Error('Image read failed'));
          reader.readAsDataURL(f);
        });
        // Downscale oversized images (>600KB) on canvas so inlineData stays fast and within limits
        let finalUrl = dataUrl;
        let finalMime = f.type || 'image/jpeg';
        if (f.size > 600 * 1024 && typeof Image !== 'undefined') {
          try {
            const compressed = await new Promise<string>((resolve) => {
              const img = new Image();
              img.onload = () => {
                const maxDim = 1280;
                let w = img.width || 800;
                let h = img.height || 600;
                if (w > maxDim || h > maxDim) {
                  const ratio = Math.min(maxDim / w, maxDim / h);
                  w = Math.max(1, Math.round(w * ratio));
                  h = Math.max(1, Math.round(h * ratio));
                }
                const canvas = document.createElement('canvas');
                canvas.width = w;
                canvas.height = h;
                const ctx2d = canvas.getContext('2d');
                if (!ctx2d) {
                  resolve(dataUrl);
                  return;
                }
                ctx2d.drawImage(img, 0, 0, w, h);
                resolve(canvas.toDataURL('image/jpeg', 0.82));
              };
              img.onerror = () => resolve(dataUrl);
              img.src = dataUrl;
            });
            if (compressed.startsWith('data:image/')) {
              finalUrl = compressed;
              finalMime = 'image/jpeg';
            }
          } catch {
            // keep original dataUrl
          }
        }
        const base64Data = finalUrl.includes(',')
          ? finalUrl.split(',')[1] || ''
          : finalUrl;
        if (base64Data) {
          setAttachedImgs((prev) => {
            const exists = prev.some(
              (item) =>
                item.mime === finalMime &&
                (item.data === base64Data || (finalUrl && item.url === finalUrl))
            );
            if (exists) return prev;
            return [
              ...prev.slice(-2),
              {
                name: f.name,
                mime: finalMime,
                data: base64Data,
                url: finalUrl,
              },
            ];
          });
          setStatusNotice(null);
        }
      } catch {
        setStatusNotice('ছবিটি পড়া যায়নি, অন্য ছবি চেষ্টা করুন।');
      }
    }
  };

  const handleSubmitTyped = (e?: React.FormEvent) => {
    e?.preventDefault();
    const hasAttachments =
      attachedImgs.length > 0 || attachedFiles.length > 0;
    const spokenOrTyped =
      draftText.trim() ||
      liveCaption.trim() ||
      recognitionLiveTextRef.current.trim();
    const rawPrompt =
      spokenOrTyped ||
      (hasAttachments
        ? voiceLang === 'bn-BD'
          ? 'এই ছবিটি দেখে সংক্ষেপে বলো কী আছে।'
          : 'Briefly describe what is in this image.'
        : '');
    const verdict = shouldSubmitVoiceUtterance({
      rawText: rawPrompt,
      hadRealSpeechEnergy: true,
      lastSubmitted: hasAttachments ? null : lastSubmittedRef.current,
      nowMs: Date.now(),
    });
    if (!verdict.accept) return;
    const nowTs = Date.now();
    ensureAudioContext();
    stopListeningTurnOnly();
    stopAiSpeechPlayback();
    lastSubmittedRef.current = { text: verdict.cleanText, at: nowTs };
    setSessionUserText(verdict.cleanText);
    setLiveCaption('');
    setLiveFinalText('');
    setLiveInterimText('');
    userScrolledUpRef.current = false;

    const currentImgs = attachedImgs.map((img) => ({ ...img }));
    if (currentImgs.length > 0) {
      setSessionSharedImgs((prev) => [
        ...currentImgs.map((img, idx) => ({
          ...img,
          id: `shared-${nowTs}-${idx}`,
          ts: nowTs,
        })),
        ...prev,
      ]);
    }
    setPendingSharedTurn({
      id: `turn-${nowTs}`,
      text: verdict.cleanText,
      ts: nowTs,
      imgs: currentImgs,
    });

    const attachmentPayload = hasAttachments
      ? {
          imgs:
            attachedImgs.length > 0
              ? attachedImgs.map(({ mime, data, url, name }) => ({
                  mime,
                  data,
                  url,
                  name,
                }))
              : undefined,
          files: attachedFiles.length > 0 ? attachedFiles : undefined,
        }
      : undefined;
    setAttachedImgs([]);
    setAttachedFiles([]);
    setDraftText('');
    setKeyboardOpen(false);
    setStatusNotice(null);
    onSendText(verdict.cleanText, attachmentPayload);
  };

  const handleSafeExit = () => {
    stopAiSpeechPlayback();
    onAbortGeneration?.();
    releaseAllMicResources();
    onCancelMic?.();
    onEndCall();
  };

  const featuredImage = liveConversationImages[0] || null;
  const secondaryImages = liveConversationImages.slice(1, 3);

  return (
    <div
      data-testid="voice-call-overlay"
      data-voice-state={voiceState}
      data-voice-model={activeVoiceModel || ''}
      role="dialog"
      aria-modal="true"
      aria-label="SMFTA Live Voice Conversation"
      className={`live-voice-overlay live-voice-state-${voiceState} fixed inset-0 z-[70] h-[100dvh] w-full text-white flex flex-col justify-between select-none overflow-hidden`}
    >
      {/* Clean ChatGPT-style Top Header: Quiet State Label + Voice Picker + Close */}
      <header className="relative z-10 w-full max-w-2xl mx-auto flex items-center justify-between gap-3 px-4 sm:px-6 pt-[max(1rem,env(safe-area-inset-top))] pb-2 shrink-0">
        <span
          data-testid="live-voice-status-label"
          className="text-[13px] font-medium text-white/75 tracking-tight whitespace-nowrap"
        >
          {effectiveHeadline}
        </span>

        <div className="flex items-center gap-2 shrink-0">
          <label className="live-voice-select-wrap live-voice-ghost-btn relative inline-flex items-center h-9 px-3 rounded-full transition-colors cursor-pointer shrink-0">
            <span className="text-[12.5px] font-medium text-white/90 pr-4 whitespace-nowrap pointer-events-none">
              {selectedVoice}
            </span>
            <select
              aria-label="Voice persona"
              data-testid="live-voice-persona-select"
              value={selectedVoice}
              onChange={(e) =>
                handleSelectVoicePersona(e.target.value as GeminiFemaleVoiceName)
              }
              className="live-voice-select absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            >
              {VOICE_OPTIONS.map((v) => (
                <option key={v.id} value={v.id} className="bg-zinc-950 text-white">
                  {v.name} · {v.subtitle}
                </option>
              ))}
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-white/55 absolute right-2.5 pointer-events-none" />
          </label>

          <button
            type="button"
            data-testid="live-voice-close-btn"
            onClick={handleSafeExit}
            aria-label="Exit Voice Mode"
            title="Close"
            className="live-voice-control live-voice-ghost-btn w-9 h-9 rounded-full inline-flex items-center justify-center text-white/75 hover:text-white transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Center Stage: Top-Center Luminous Animation + Centered Gold-Biscuit Photo Frame */}
      <main className="relative z-10 flex-1 min-h-0 flex flex-col items-center justify-center w-full max-w-xl mx-auto px-4 sm:px-6 py-2 overflow-hidden">
        {/* Top-Center Animation Orb (compact above photo when photo exists, large centered when empty) */}
        <div
          data-testid="live-voice-orb-stage"
          onClick={handlePassiveOrbTap}
          className={`relative flex items-center justify-center shrink-0 transition-all duration-300 ${
            featuredImage ? 'mb-3.5' : 'my-auto'
          }`}
        >
          <div
            className={`live-voice-orb-pedestal pointer-events-none ${
              featuredImage ? 'is-compact' : ''
            } ${isUserVoicing || voiceState === 'speaking' ? 'is-energized' : ''}`}
            aria-hidden="true"
          />
          <canvas
            ref={orbCanvasRef}
            data-testid="live-voice-orb-canvas"
            className={`${
              featuredImage
                ? 'w-[78px] h-[78px] sm:w-[90px] sm:h-[90px]'
                : 'w-[208px] h-[208px] sm:w-[238px] sm:h-[238px]'
            } block transition-all duration-300`}
            aria-label="Live voice orb animation"
          />
        </div>

        {/* Centered Front Uploaded Photo in Clean Gold-Biscuit Sized Card (Uncropped object-contain) */}
        {featuredImage && (
          <section
            data-testid="live-voice-top-image-preview"
            aria-label="Uploaded photo preview"
            className="flex flex-col items-center justify-center gap-2.5 shrink-0"
          >
            <div
              data-testid="live-voice-image-preview-card"
              data-image-staged={featuredImage.isStaged ? 'true' : 'false'}
              className="live-voice-gold-biscuit-card w-[248px] sm:w-[288px] h-[144px] sm:h-[166px] group"
            >
              <div className="live-voice-gold-biscuit-card-inner relative">
                <button
                  type="button"
                  data-testid="live-voice-expand-image-btn"
                  onClick={() =>
                    setFullscreenImage({
                      url: featuredImage.url,
                      name: featuredImage.name,
                    })
                  }
                  aria-label={`Expand ${featuredImage.name} to fullscreen`}
                  title={voiceLang === 'bn-BD' ? 'বড় করে দেখুন' : 'View full image'}
                  className="w-full h-full flex items-center justify-center cursor-pointer bg-transparent border-0 p-1"
                >
                  <img
                    src={featuredImage.url}
                    alt={featuredImage.name}
                    className="w-full h-full object-contain rounded-[12px]"
                  />
                  <span className="absolute bottom-2 right-2 w-6 h-6 rounded-full bg-black/65 border border-amber-200/35 text-white/90 inline-flex items-center justify-center opacity-85 group-hover:opacity-100 transition-opacity pointer-events-none shadow-md">
                    <ZoomIn className="w-3.5 h-3.5" />
                  </span>
                </button>
              </div>

              {featuredImage.isStaged &&
                typeof featuredImage.stagedIndex === 'number' && (
                  <button
                    type="button"
                    data-testid={`live-voice-remove-img-${featuredImage.stagedIndex}`}
                    onClick={() =>
                      setAttachedImgs((prev) =>
                        prev.filter((_, i) => i !== featuredImage.stagedIndex)
                      )
                    }
                    aria-label={`Remove ${featuredImage.name}`}
                    className="live-voice-control absolute -top-2 -right-2 w-7 h-7 rounded-full bg-zinc-900/95 border border-amber-200/40 hover:bg-rose-500 text-white inline-flex items-center justify-center shadow-lg cursor-pointer transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
            </div>

            {secondaryImages.length > 0 && (
              <div className="flex items-center justify-center gap-2">
                {secondaryImages.map((imgItem) => (
                  <div
                    key={imgItem.id}
                    data-testid="live-voice-image-preview-card"
                    data-image-staged={imgItem.isStaged ? 'true' : 'false'}
                    className="relative w-12 h-12 rounded-xl border border-amber-300/35 bg-zinc-950 p-0.5"
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setFullscreenImage({ url: imgItem.url, name: imgItem.name })
                      }
                      aria-label={`View ${imgItem.name}`}
                      className="w-full h-full rounded-lg overflow-hidden cursor-pointer"
                    >
                      <img
                        src={imgItem.url}
                        alt={imgItem.name}
                        className="w-full h-full object-contain"
                      />
                    </button>
                    {imgItem.isStaged &&
                      typeof imgItem.stagedIndex === 'number' && (
                        <button
                          type="button"
                          data-testid={`live-voice-remove-img-${imgItem.stagedIndex}`}
                          onClick={() =>
                            setAttachedImgs((prev) =>
                              prev.filter((_, i) => i !== imgItem.stagedIndex)
                            )
                          }
                          aria-label={`Remove ${imgItem.name}`}
                          className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-zinc-900 border border-white/25 hover:bg-rose-500 text-white inline-flex items-center justify-center cursor-pointer"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                  </div>
                ))}
              </div>
            )}

            {attachedImgs.length > 0 && !keyboardOpen && (
              <button
                type="button"
                data-testid="live-voice-send-attachments-btn"
                onClick={() => handleSubmitTyped()}
                disabled={isGenerating}
                className="live-voice-control h-8 px-4 rounded-full bg-white text-black hover:bg-zinc-200 disabled:opacity-45 text-[12px] font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <ArrowUp className="w-3.5 h-3.5 stroke-[2.4]" />
                <span>{voiceLang === 'bn-BD' ? 'ছবি পাঠান' : 'Send photo'}</span>
              </button>
            )}
          </section>
        )}

        {/* Quiet Minimal Live Subtitle/Caption Feed (Zero card chrome or metadata clutter) */}
        {unifiedTimeline.length > 0 && (
          <div
            ref={timelineScrollRef}
            onScroll={handleTimelineScroll}
            data-testid="live-voice-timeline"
            className="live-voice-transcript mt-4 w-full max-w-md max-h-[112px] overflow-y-auto px-2 space-y-1.5 text-center shrink-0"
          >
            {unifiedTimeline.slice(-2).map((entry) => {
              const isPartial = entry.transcriptState === 'partial';
              const isUser = entry.role === 'user';
              if (isUser) {
                return (
                  <p
                    key={entry.id}
                    data-testid={
                      isPartial
                        ? 'live-voice-partial-transcript'
                        : 'live-voice-message-user'
                    }
                    data-transcript-state={entry.transcriptState}
                    className="text-[13px] text-white/65 leading-snug"
                  >
                    {isPartial ? (
                      <>
                        {entry.confirmedPrefix && (
                          <span data-testid="live-voice-partial-confirmed">
                            {entry.confirmedPrefix}{' '}
                          </span>
                        )}
                        <span data-testid="live-voice-partial-interim">
                          {entry.partialInterimText || entry.text}
                        </span>
                      </>
                    ) : (
                      entry.text
                    )}
                  </p>
                );
              }

              return entry.text ? (
                <p
                  key={entry.id}
                  data-testid="live-voice-message-ai"
                  data-stream-state={entry.streamState}
                  className="text-[14px] text-white/95 font-normal leading-relaxed line-clamp-3"
                >
                  {formatTextForNaturalSpeech(entry.text, 600)}
                </p>
              ) : null;
            })}
          </div>
        )}

        {needsTapToPlay && pendingAudioBufferRef.current && (
          <button
            type="button"
            data-testid="live-voice-tap-play-btn"
            onClick={() => {
              const ctx = ensureAudioContext();
              const buf = pendingAudioBufferRef.current;
              if (!ctx || !buf) return;
              void ctx.resume().then(() => {
                startDecodedBufferPlayback(ctx, buf, ttsAbortRef.current);
              });
            }}
            className="live-voice-control mt-3 inline-flex items-center gap-2 rounded-full bg-white text-black hover:bg-zinc-200 font-medium px-4 h-9 text-[12.5px] cursor-pointer transition-colors shrink-0"
          >
            <Volume2 className="w-4 h-4" />
            <span>Tap to enable audio</span>
          </button>
        )}

        {statusNotice && (
          <p
            data-testid="live-voice-status-notice"
            role="status"
            className="mt-2 max-w-sm text-[12px] text-white/60 leading-snug text-center shrink-0"
          >
            {statusNotice}
          </p>
        )}
      </main>

      {/* Minimalist ChatGPT Bottom Dock: Photo Send, Typing, and End Call ONLY */}
      <footer className="relative z-10 w-full max-w-md mx-auto px-4 pt-1 pb-[max(1.25rem,env(safe-area-inset-bottom))] flex flex-col items-center gap-2.5 shrink-0">
        <input
          ref={imageInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          data-testid="live-voice-image-input"
          onChange={(e) => void handlePickVoiceImage(e)}
          className="hidden"
        />

        {voiceState === 'disconnected' && (
          <button
            type="button"
            data-testid="live-voice-reconnect-btn"
            onClick={() => void establishVoiceConnection(false)}
            className="live-voice-control h-9 px-4 rounded-full bg-white text-black hover:bg-zinc-200 font-medium text-[12.5px] inline-flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Reconnect</span>
          </button>
        )}

        {keyboardOpen && (
          <form
            onSubmit={handleSubmitTyped}
            className="live-voice-composer w-full flex items-center gap-2 pl-4 pr-1.5 h-11 rounded-full"
          >
            <input
              ref={textInputRef}
              type="text"
              data-testid="live-voice-input"
              value={draftText}
              onChange={(e) => setDraftText(e.target.value)}
              placeholder={
                attachedImgs.length > 0
                  ? voiceLang === 'bn-BD'
                    ? 'ছবি সম্পর্কে লিখুন...'
                    : 'Ask about the photo...'
                  : voiceLang === 'bn-BD'
                    ? 'মেসেজ লিখুন...'
                    : 'Type a message...'
              }
              className="live-voice-input flex-1 min-w-0 bg-transparent text-[14px] text-white placeholder:text-white/45"
            />
            <button
              type="submit"
              data-testid="live-voice-send-btn"
              disabled={!draftText.trim() && attachedImgs.length === 0}
              aria-label="Send typed message"
              className="live-voice-control w-8 h-8 rounded-full bg-white text-black disabled:opacity-35 inline-flex items-center justify-center hover:bg-zinc-200 transition-opacity cursor-pointer shrink-0"
            >
              <ArrowUp className="w-4 h-4 stroke-[2.4]" />
            </button>
          </form>
        )}

        <div
          data-testid="live-voice-bottom-dock"
          className="live-voice-dock inline-flex items-center justify-center gap-3 px-3 py-2 rounded-full"
        >
          {/* 1. Photo Send */}
          <button
            type="button"
            data-testid="live-voice-attach-image-btn"
            onClick={() => imageInputRef.current?.click()}
            aria-label="Send photo"
            title={voiceLang === 'bn-BD' ? 'ছবি পাঠান' : 'Send photo'}
            className={`live-voice-control w-12 h-12 rounded-full inline-flex items-center justify-center transition-colors cursor-pointer shrink-0 ${
              attachedImgs.length > 0
                ? 'bg-amber-400/20 text-amber-200 ring-1 ring-amber-300/60'
                : 'bg-white/[0.08] hover:bg-white/[0.15] text-white'
            }`}
          >
            <ImagePlus className="w-5 h-5" />
          </button>

          {/* 2. Typing Toggle */}
          <button
            type="button"
            data-testid="live-voice-keyboard-toggle"
            onClick={() => {
              setKeyboardOpen((prev) => {
                const next = !prev;
                if (next) {
                  window.setTimeout(() => textInputRef.current?.focus(), 60);
                }
                return next;
              });
            }}
            aria-label={keyboardOpen ? 'Hide text input' : 'Type a message'}
            aria-pressed={keyboardOpen}
            title={keyboardOpen ? 'Hide keyboard' : 'Type message'}
            className={`live-voice-control w-12 h-12 rounded-full inline-flex items-center justify-center transition-colors cursor-pointer shrink-0 ${
              keyboardOpen
                ? 'bg-white text-black'
                : 'bg-white/[0.08] hover:bg-white/[0.15] text-white'
            }`}
          >
            <Keyboard className="w-5 h-5" />
          </button>

          {/* 3. End Call */}
          <button
            type="button"
            data-testid="live-voice-end-btn"
            onClick={handleSafeExit}
            aria-label="End voice session"
            title="End call"
            className="live-voice-control w-12 h-12 rounded-full bg-rose-500 hover:bg-rose-400 text-white inline-flex items-center justify-center transition-colors cursor-pointer shrink-0"
          >
            <PhoneOff className="w-5 h-5" />
          </button>
        </div>
      </footer>

      {/* Fullscreen Image Lightbox Modal */}
      {fullscreenImage && (
        <div
          data-testid="live-voice-fullscreen-image-modal"
          role="dialog"
          aria-modal="true"
          aria-label={fullscreenImage.name || 'Fullscreen image preview'}
          onClick={() => setFullscreenImage(null)}
          className="fixed inset-0 z-[90] bg-slate-950/90 backdrop-blur-xl flex flex-col items-center justify-center p-4 sm:p-8"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative max-w-4xl w-full max-h-[86dvh] flex flex-col items-center rounded-3xl bg-slate-900/90 border border-white/15 p-3 sm:p-4 shadow-2xl"
          >
            <div className="w-full flex items-center justify-between gap-3 pb-2.5 mb-2 border-b border-white/10">
              <span className="text-[13px] font-medium text-white/90 truncate">
                {fullscreenImage.name || 'Shared Image'}
              </span>
              <button
                type="button"
                data-testid="live-voice-fullscreen-close-btn"
                onClick={() => setFullscreenImage(null)}
                aria-label="Close fullscreen image"
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white inline-flex items-center justify-center cursor-pointer transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="w-full flex-1 min-h-0 flex items-center justify-center overflow-hidden rounded-2xl bg-slate-950/60">
              <img
                src={fullscreenImage.url}
                alt={fullscreenImage.name || 'Fullscreen preview'}
                className="max-h-[72dvh] max-w-full object-contain rounded-xl"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

