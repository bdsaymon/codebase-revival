import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowUp,
  ChevronDown,
  Hand,
  Keyboard,
  Mic,
  MicOff,
  PhoneOff,
  RefreshCw,
  Volume2,
  X,
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
  streamGeminiPcmSpeech,
} from '../utils/voiceEngine';
import {
  BargeInState,
  buildVoiceGreeting,
  computeVocalEnergy,
  createBargeInState,
  createVadTracker,
  deriveVoiceSessionState,
  sanitizeVoiceUtterance,
  shouldSubmitVoiceUtterance,
  stepBargeInDetector,
  stepVadTracker,
  VadTrackerState,
  VoiceConnectionState,
} from '../utils/voiceSession';

export interface LiveVoiceMessageSnapshot {
  id: string;
  text: string;
  isError?: boolean;
}

export interface LiveVoiceOverlayProps {
  isOpen: boolean;
  userName?: string;
  preferredLang?: string;
  isListening?: boolean;
  isGenerating: boolean;
  isTranscribing?: boolean;
  liveTranscript?: string;
  micStream?: MediaStream | null;
  lastUserText: string;
  lastAiMessage: LiveVoiceMessageSnapshot | null;
  onToggleMic?: () => void;
  onCancelMic?: () => void;
  onAbortGeneration?: () => void;
  onSendText: (text: string) => void;
  onEndCall: () => void;
}

const VOICE_OPTIONS: Array<{
  id: GeminiFemaleVoiceName;
  name: string;
  subtitle: string;
}> = [
  { id: 'Kore', name: 'Kore', subtitle: 'Female' },
  { id: 'Zephyr', name: 'Zephyr', subtitle: 'Female' },
  { id: 'Puck', name: 'Puck', subtitle: 'Male' },
  { id: 'Charon', name: 'Charon', subtitle: 'Male' },
  { id: 'Fenrir', name: 'Fenrir', subtitle: 'Male' },
];

const VOICE_PREF_KEY = 'smfta_live_voice_persona_v1';
const VOICE_LANG_PREF_KEY = 'smfta_live_voice_lang_v1';

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

function buildVoiceStylePrompt(voice: GeminiFemaleVoiceName): string {
  const isMale = voice === 'Puck' || voice === 'Charon' || voice === 'Fenrir';
  return isMale
    ? 'Crystal clear, warm natural human male conversational voice with accurate standard Bengali and English pronunciation, smooth sentence pacing, never robotic or rushed'
    : 'Crystal clear, warm natural human female conversational voice with accurate standard Bengali and English pronunciation, smooth sentence pacing, never robotic or rushed';
}

const STATE_COPY: Record<
  VoiceConnectionState,
  { label: string; headline: string; hint: string }
> = {
  connecting: {
    label: 'Connecting',
    headline: 'Connecting voice...',
    hint: 'Preparing live microphone and audio',
  },
  listening: {
    label: 'Listening',
    headline: 'Listening',
    hint: 'Speak naturally — I am listening',
  },
  thinking: {
    label: 'Thinking',
    headline: 'Thinking...',
    hint: 'Crafting your reply',
  },
  speaking: {
    label: 'Speaking',
    headline: 'Speaking',
    hint: 'Speak or tap anytime to interrupt',
  },
  reconnecting: {
    label: 'Reconnecting',
    headline: 'Reconnecting...',
    hint: 'Restoring voice connection',
  },
  disconnected: {
    label: 'Disconnected',
    headline: 'Voice disconnected',
    hint: 'Tap reconnect to resume',
  },
};

interface StarParticle {
  angle: number;
  radius: number;
  speed: number;
  size: number;
  alpha: number;
  drift: number;
}

interface AcousticRipple {
  radius: number;
  alpha: number;
}

export const LiveVoiceOverlay: React.FC<LiveVoiceOverlayProps> = ({
  isOpen,
  userName,
  preferredLang = 'auto',
  isGenerating,
  lastUserText,
  lastAiMessage,
  onCancelMic,
  onAbortGeneration,
  onSendText,
  onEndCall,
}) => {
  const [selectedVoice, setSelectedVoice] =
    useState<GeminiFemaleVoiceName>(loadSavedVoice);
  const [voiceLang, setVoiceLang] = useState<'bn-BD' | 'en-US'>(() =>
    loadSavedVoiceLang(preferredLang)
  );
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
  const [hasRecordedAudio, setHasRecordedAudio] = useState(false);
  const [liveCaption, setLiveCaption] = useState('');
  const [greetingText, setGreetingText] = useState('');
  const [sessionUserText, setSessionUserText] = useState('');
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const [needsTapToPlay, setNeedsTapToPlay] = useState(false);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [draftText, setDraftText] = useState('');
  const [seconds, setSeconds] = useState(0);

  // Visual canvas refs
  const orbCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const waveCanvasRef = useRef<HTMLCanvasElement | null>(null);

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
  const recognitionLiveTextRef = useRef<string>('');
  const speechRecCommitTimerRef = useRef<number | null>(null);
  const vadStateRef = useRef<VadTrackerState>(createVadTracker());
  const bargeInStateRef = useRef<BargeInState>(createBargeInState());
  const turnHadRealSpeechRef = useRef<boolean>(false);
  const turnCommitInFlightRef = useRef<boolean>(false);
  const lastSubmittedRef = useRef<{ text: string; at: number } | null>(null);
  const hasGreetedRef = useRef<boolean>(false);
  const autoListenTimerRef = useRef<number | null>(null);
  const sessionTokenRef = useRef<number>(0);
  const textInputRef = useRef<HTMLInputElement | null>(null);

  // Smooth animation & reactive ripple refs
  const energyRef = useRef(0);
  const micLevelRef = useRef(0);
  const ripplesRef = useRef<AcousticRipple[]>([]);
  const lastRippleAtRef = useRef<number>(0);
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
    isDisconnected,
    isOffline,
    isGenerating,
    isTranscribingTurn,
    isAiSpeaking,
    isSynthesizingVoice,
    isSessionListening,
    selectedVoice,
    voiceLang,
    userName,
    onSendText,
    onAbortGeneration,
  });
  stateRef.current = {
    isOpen,
    isMuted,
    isDisconnected,
    isOffline,
    isGenerating,
    isTranscribingTurn,
    isAiSpeaking,
    isSynthesizingVoice,
    isSessionListening,
    selectedVoice,
    voiceLang,
    userName,
    onSendText,
    onAbortGeneration,
  };

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
    analyser.connect(ctx.destination);
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
    recognitionLiveTextRef.current = '';
    rollingSttCheckedBytesRef.current = 0;
  }, [clearRollingSttTimer, stopTurnRecorder, stopTurnRecognition]);

  const stopAiSpeechPlayback = useCallback(() => {
    // Bump pipeline run token so any suspended async TTS worker exits immediately without overlapping
    pipelineRunIdRef.current += 1;
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
    setIsAiSpeaking(false);
  }, []);

  const releaseAllMicResources = useCallback(() => {
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
          const { finalPrefix, liveTranscript } = accumulateSpeechResults(
            e?.results,
            recognitionFinalPrefixRef.current
          );
          if (finalPrefix) {
            recognitionFinalPrefixRef.current = finalPrefix;
          }
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
        cur.isTranscribingTurn
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
      recognitionLiveTextRef.current = '';
      rollingSttCheckedBytesRef.current = 0;
      vadStateRef.current = createVadTracker(vadStateRef.current.noiseFloor);
      setLiveCaption('');
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

  const scheduleAutoListenAfterSpeech = useCallback(
    (ctrl?: AbortController | null) => {
      if (ctrl?.signal.aborted) return;
      if (!stateRef.current.isOpen) return;
      if (pipelineBusyRef.current) return;
      if (pendingChunksRef.current.length > 0) return;
      if (activeSourcesRef.current.size > 0) return;
      if (stateRef.current.isGenerating) return;

      setIsSynthesizingVoice(false);
      setIsAiSpeaking(false);

      if (autoListenTimerRef.current !== null) {
        window.clearTimeout(autoListenTimerRef.current);
      }
      autoListenTimerRef.current = window.setTimeout(() => {
        autoListenTimerRef.current = null;
        if (
          !ctrl?.signal.aborted &&
          stateRef.current.isOpen &&
          !stateRef.current.isDisconnected &&
          !stateRef.current.isOffline &&
          !stateRef.current.isGenerating &&
          !stateRef.current.isAiSpeaking
        ) {
          startListeningTurn();
        }
      }, 200);
    },
    [startListeningTurn]
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

      // Strict zero-empty guard: never submit pure silence unless user recorded audio and tapped Send
      if (!hadSpeech && !webSpeechText && !(forceManual && hasRecordedChunks)) {
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
      recognitionLiveTextRef.current = '';
      rollingSttCheckedBytesRef.current = 0;

      const submitCleanText = (candidate: string, realEnergy: boolean): boolean => {
        const verdict = shouldSubmitVoiceUtterance({
          rawText: candidate,
          hadRealSpeechEnergy: realEnergy,
          lastSubmitted: lastSubmittedRef.current,
          nowMs: Date.now(),
        });
        if (!verdict.accept) return false;
        lastSubmittedRef.current = { text: verdict.cleanText, at: Date.now() };
        setSessionUserText(verdict.cleanText);
        setLiveCaption('');
        setStatusNotice(null);
        stateRef.current.onSendText(verdict.cleanText);
        return true;
      };

      // 1. Ultra-fast path: crisp Web Speech / Rolling STT transcript already captured (0ms STT delay!)
      if (webSpeechText && submitCleanText(webSpeechText, true)) {
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
        nextPlayTimeRef.current = startAt + audioBuffer.duration;

        activeSourcesRef.current.add(source);
        playbackSourceRef.current = source;
        pendingAudioBufferRef.current = null;
        aiSpeakingStartedAtRef.current = Date.now();
        bargeInStateRef.current = createBargeInState();
        setNeedsTapToPlay(false);
        setIsSynthesizingVoice(false);
        setIsAiSpeaking(true);

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
          Math.max(0, Math.ceil((startAt - now + audioBuffer.duration) * 1000)) + 450;
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
    [ensurePlaybackAnalyser, scheduleAutoListenAfterSpeech]
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
      const audioBuffer = ctx.createBuffer(1, samples.length, sampleRate);
      audioBuffer.copyToChannel(new Float32Array(samples), 0);

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(analyser);

      const now = ctx.currentTime;
      const startAt = Math.max(now + 0.015, nextPlayTimeRef.current);
      nextPlayTimeRef.current = startAt + audioBuffer.duration;

      if (activeSourcesRef.current.size === 0) {
        aiSpeakingStartedAtRef.current = Date.now();
        bargeInStateRef.current = createBargeInState();
      }
      activeSourcesRef.current.add(source);
      playbackSourceRef.current = source;
      pendingAudioBufferRef.current = null;
      setNeedsTapToPlay(false);
      setIsSynthesizingVoice(false);
      setIsAiSpeaking(true);

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
        Math.max(0, Math.ceil((startAt - now + audioBuffer.duration) * 1000)) + 450;
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
    [ensurePlaybackAnalyser, scheduleAutoListenAfterSpeech]
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
        setIsSynthesizingVoice(false);
        setIsAiSpeaking(true);
        bilingualSpeechPlayer.speak({
          msgId: `live-voice-${msgId}-${Date.now()}`,
          text,
          voiceProfile: isMaleVoice ? 'bengali_male' : 'bengali_female',
          geminiVoice: voice,
          skipServerTts: true,
          onDone: () => resolve(),
        });
      }),
    []
  );

  const drainSpeechPipeline = useCallback(
    async (msgId: string) => {
      if (pipelineBusyRef.current) return;
      const ctrl = ttsAbortRef.current;
      if (!ctrl || ctrl.signal.aborted) return;

      const runId = pipelineRunIdRef.current;
      pipelineBusyRef.current = true;
      try {
        while (
          pendingChunksRef.current.length > 0 &&
          !ctrl.signal.aborted &&
          runId === pipelineRunIdRef.current
        ) {
          // Coalesce queued chunks up to 380 chars so each utterance streams with one natural voice cadence
          let sentence = (pendingChunksRef.current.shift() || '').trim();
          while (
            pendingChunksRef.current.length > 0 &&
            sentence.length + 1 + (pendingChunksRef.current[0]?.length || 0) <= 380
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
          }

          const ctx = ensureAudioContext();
          if (ctx && ctx.state === 'suspended') {
            try {
              await ctx.resume();
            } catch {
              // Handled below
            }
          }
          if (ctrl.signal.aborted || runId !== pipelineRunIdRef.current) break;

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
            if (ctrl.signal.aborted || runId !== pipelineRunIdRef.current) break;
            if (streamRes.ok && streamRes.receivedAudio) {
              continue;
            }
          }

          // 2. Unary neural audio endpoint (/api/voice/tts: Gemini 3.8 Live WAV -> Gemini TTS)
          const res = await requestGeminiFemaleSpeech({
            text: sentence,
            voiceName: voice,
            style: voiceStyle,
            signal: ctrl.signal,
          });
          if (ctrl.signal.aborted || runId !== pipelineRunIdRef.current) break;

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
            break;
          }

          try {
            const activeCtx = ensureAudioContext();
            const bytes = base64ToUint8Array(res.audioBase64);
            if (!activeCtx || bytes.byteLength === 0) continue;
            const audioBuffer = await activeCtx.decodeAudioData(bytes.slice().buffer);
            if (ctrl.signal.aborted || runId !== pipelineRunIdRef.current) break;
            if ((activeCtx.state as string) === 'suspended') {
              pendingAudioBufferRef.current = audioBuffer;
              setNeedsTapToPlay(true);
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
            }
          }
        }
      } finally {
        if (runId === pipelineRunIdRef.current) {
          pipelineBusyRef.current = false;
          if (
            pendingChunksRef.current.length > 0 &&
            ttsAbortRef.current &&
            !ttsAbortRef.current.signal.aborted
          ) {
            void drainSpeechPipeline(msgId);
          } else {
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
      setStatusNotice(null);
      setIsDisconnected(false);
      setIsReconnecting(false);
      setIsConnecting(true);

      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        setIsConnecting(false);
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
        setIsConnecting(false);
        setIsDisconnected(true);
        setStatusNotice('Microphone API unavailable in this browser. Tap keyboard to chat.');
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
        stream.getAudioTracks().forEach((track) => {
          track.enabled = !stateRef.current.isMuted;
          track.onended = () => {
            if (token !== sessionTokenRef.current || !stateRef.current.isOpen) return;
            setIsSessionListening(false);
            setIsDisconnected(true);
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
        setIsDisconnected(false);
        setIsReconnecting(false);

        if (allowGreeting && !hasGreetedRef.current) {
          hasGreetedRef.current = true;
          const greeting = buildVoiceGreeting(
            stateRef.current.userName,
            stateRef.current.voiceLang
          );
          setGreetingText(greeting);
          ttsAbortRef.current = new AbortController();
          useBrowserTtsForTurnRef.current = false;
          pendingChunksRef.current = [greeting];
          aiSpeakingStartedAtRef.current = Date.now();
          void drainSpeechPipeline('greeting');
        } else {
          startListeningTurn();
        }
      } catch (err) {
        if (token !== sessionTokenRef.current || !stateRef.current.isOpen) return;
        setIsConnecting(false);
        setIsDisconnected(true);
        const name = err instanceof Error ? err.name : '';
        if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
          setStatusNotice(
            'Microphone access denied. Allow mic permission and tap reconnect, or use keyboard.'
          );
        } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
          setStatusNotice('No microphone detected. Connect a microphone or tap keyboard.');
        } else {
          setStatusNotice('Could not start microphone. Tap reconnect to try again.');
        }

        if (allowGreeting && !hasGreetedRef.current) {
          hasGreetedRef.current = true;
          const greeting = buildVoiceGreeting(
            stateRef.current.userName,
            stateRef.current.voiceLang
          );
          setGreetingText(greeting);
          ttsAbortRef.current = new AbortController();
          useBrowserTtsForTurnRef.current = false;
          pendingChunksRef.current = [greeting];
          void drainSpeechPipeline('greeting');
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
      setSeconds(0);
      setDraftText('');
      setKeyboardOpen(false);
      setIsMuted(false);
      setLiveCaption('');
      setGreetingText('');
      setSessionUserText('');
      setStatusNotice(null);
      setIsConnecting(false);
      setIsReconnecting(false);
      setIsDisconnected(false);
      setIsTranscribingTurn(false);
      activeTurnMsgIdRef.current = null;
      spokenCursorRef.current = 0;
      lastSubmittedRef.current = null;
      ripplesRef.current = [];
      stopAiSpeechPlayback();
      releaseAllMicResources();
      return;
    }

    spokenMsgIdRef.current = lastAiMessage?.id || null;
    activeTurnMsgIdRef.current = lastAiMessage?.id || null;
    spokenCursorRef.current = lastAiMessage?.text ? lastAiMessage.text.length : 0;
    setSessionUserText('');
    setGreetingText('');
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
      if (e.key === 'Escape' && !keyboardOpen) {
        e.preventDefault();
        stopAiSpeechPlayback();
        releaseAllMicResources();
        onEndCall();
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
      stopAiSpeechPlayback();
      releaseAllMicResources();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Real-time streaming AI reply → Single-Voice TTS pipeline
  useEffect(() => {
    if (!isOpen) return;
    if (!lastAiMessage || !lastAiMessage.id) return;

    if (
      spokenMsgIdRef.current === lastAiMessage.id &&
      activeTurnMsgIdRef.current === lastAiMessage.id &&
      spokenCursorRef.current >= (lastAiMessage.text?.length || 0)
    ) {
      return;
    }

    if (activeTurnMsgIdRef.current !== lastAiMessage.id) {
      activeTurnMsgIdRef.current = lastAiMessage.id;
      spokenMsgIdRef.current = lastAiMessage.id;
      spokenCursorRef.current = 0;
      useBrowserTtsForTurnRef.current = false;
      stopListeningTurnOnly();
      stopAiSpeechPlayback();
      setStatusNotice(null);

      if (lastAiMessage.isError) {
        const errClean = formatTextForNaturalSpeech(lastAiMessage.text, 200);
        if (errClean) setStatusNotice(errClean);
        spokenCursorRef.current = lastAiMessage.text.length;
        scheduleAutoListenAfterSpeech(null);
        return;
      }

      ttsAbortRef.current = new AbortController();
    }

    if (lastAiMessage.isError) return;

    // Wait until streaming finishes OR a full paragraph (>= 160 chars) is ready
    // so short 1-3 sentence voice replies are synthesized in ONE single voice request!
    const unqueuedLen = Math.max(0, (lastAiMessage.text?.length || 0) - spokenCursorRef.current);
    if (isGenerating && unqueuedLen < 160) {
      return;
    }

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
    } else if (!isGenerating) {
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

  // Unified 60fps loop: Real VAD + Barge-In + Sculptural 3D Holographic Quantum Orb + 36-Bar Mirrored Spectrum
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
    const barCount = 36;
    const smoothBars = new Float32Array(barCount);

    // Orbiting quantum dust constellation
    const stars: StarParticle[] = Array.from({ length: 36 }, (_, idx) => ({
      angle: (idx / 36) * Math.PI * 2 + (idx % 3) * 0.25,
      radius: 96 + (idx % 6) * 12,
      speed: (idx % 2 === 0 ? 1 : -1) * (0.0026 + (idx % 4) * 0.0011),
      size: 0.85 + (idx % 3) * 0.55,
      alpha: 0.24 + (idx % 4) * 0.15,
      drift: idx * 0.68,
    }));

    const tick = () => {
      const nowMs = Date.now();
      const state = visualStateRef.current;
      const cur = stateRef.current;

      // 1. Sample real microphone vocal energy (time-domain RMS + vocal frequency bins)
      let micRms = 0;
      if (micAnalyserRef.current && !cur.isMuted) {
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
          if (nowMs - lastRippleAtRef.current > 290) {
            lastRippleAtRef.current = nowMs;
            ripplesRef.current.push({ radius: 78, alpha: 0.78 });
          }
        } else if (vadRes.action === 'speaking') {
          if (!turnHadRealSpeechRef.current && vadRes.nextState.speechConfirmed) {
            turnHadRealSpeechRef.current = true;
          }
          setIsUserVoicing(vadRes.nextState.isVoiceActive);
          if (vadRes.nextState.isVoiceActive && nowMs - lastRippleAtRef.current > 420) {
            lastRippleAtRef.current = nowMs;
            ripplesRef.current.push({ radius: 78, alpha: 0.56 });
          }
        } else if (vadRes.action === 'commit') {
          setIsUserVoicing(false);
          void commitActiveUtteranceRef.current(false);
        } else if (!vadRes.nextState.isVoiceActive && !recognitionLiveTextRef.current) {
          setIsUserVoicing(false);
        }
      }

      // Real echo-guarded Barge-In while AI is speaking or synthesizing greeting
      if (
        (state === 'speaking' || cur.isSynthesizingVoice) &&
        !cur.isMuted &&
        micAnalyserRef.current &&
        aiSpeakingStartedAtRef.current > 0
      ) {
        const barge = stepBargeInDetector(bargeInStateRef.current, {
          rms: micRms,
          nowMs,
          aiSpeakingStartedAt: aiSpeakingStartedAtRef.current,
        });
        bargeInStateRef.current = barge.nextState;
        if (barge.shouldInterrupt) {
          handleInterruptAndListen();
        }
      }

      // 2. Compute real acoustic spectrum energy for visuals
      let targetEnergy = 0.09;
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
        targetEnergy = Math.min(1, (sum / (bins * 255)) * 2.8);
        if (state === 'listening') {
          targetEnergy = Math.max(targetEnergy, micLevelRef.current * 0.96);
        }
      } else if (state === 'thinking') {
        targetEnergy = 0.3 + 0.14 * Math.sin(t * 2.8);
      } else if (state === 'connecting' || state === 'reconnecting') {
        targetEnergy = 0.2 + 0.08 * Math.sin(t * 2.1);
      } else if (state === 'disconnected') {
        targetEnergy = 0.03;
      }

      if (state === 'speaking' && targetEnergy < 0.18) {
        targetEnergy = 0.32 + 0.2 * Math.abs(Math.sin(t * 4.0)) + 0.12 * Math.cos(t * 6.5);
      }

      energyRef.current += (targetEnergy - energyRef.current) * 0.21;
      const e = energyRef.current;

      // 3. Render Sculptural 3D Holographic Quantum Core + Gyroscopic Equatorial Rings + Ripples
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const orbSize = 320;
      if (orbCanvas.width !== orbSize * dpr || orbCanvas.height !== orbSize * dpr) {
        orbCanvas.width = orbSize * dpr;
        orbCanvas.height = orbSize * dpr;
      }

      orbCtx.save();
      orbCtx.scale(dpr, dpr);
      orbCtx.clearRect(0, 0, orbSize, orbSize);

      const cx = orbSize / 2;
      const cy = orbSize / 2;
      const baseRadius =
        state === 'disconnected'
          ? 70
          : state === 'speaking'
            ? 81 + e * 18
            : state === 'listening'
              ? 78 + e * 16
              : 75 + e * 9;

      const palette =
        state === 'speaking'
          ? {
              hueA: 264,
              hueB: 316,
              hueC: 196,
              glow: 'rgba(168, 85, 247,',
              halo: 'rgba(236, 72, 153,',
              accent: 'rgba(56, 189, 248,',
              star: 'rgba(233, 213, 255,',
            }
          : state === 'listening'
            ? {
                hueA: 174,
                hueB: 154,
                hueC: 198,
                glow: 'rgba(16, 185, 129,',
                halo: 'rgba(34, 211, 238,',
                accent: 'rgba(52, 211, 153,',
                star: 'rgba(167, 243, 208,',
              }
            : state === 'thinking'
              ? {
                  hueA: 234,
                  hueB: 266,
                  hueC: 42,
                  glow: 'rgba(99, 102, 241,',
                  halo: 'rgba(168, 85, 247,',
                  accent: 'rgba(250, 204, 21,',
                  star: 'rgba(199, 210, 254,',
                }
              : state === 'reconnecting'
                ? {
                    hueA: 36,
                    hueB: 48,
                    hueC: 22,
                    glow: 'rgba(245, 158, 11,',
                    halo: 'rgba(251, 191, 36,',
                    accent: 'rgba(253, 224, 71,',
                    star: 'rgba(253, 230, 138,',
                  }
                : state === 'disconnected'
                  ? {
                      hueA: 215,
                      hueB: 220,
                      hueC: 210,
                      glow: 'rgba(100, 116, 139,',
                      halo: 'rgba(71, 85, 105,',
                      accent: 'rgba(148, 163, 184,',
                      star: 'rgba(148, 163, 184,',
                    }
                  : {
                      hueA: 202,
                      hueB: 226,
                      hueC: 188,
                      glow: 'rgba(56, 189, 248,',
                      halo: 'rgba(99, 102, 241,',
                      accent: 'rgba(125, 211, 252,',
                      star: 'rgba(191, 219, 254,',
                    };

      // 3a. Orbiting Quantum Dust Constellation
      if (!reducedMotion && state !== 'disconnected') {
        const starBoost = state === 'speaking' ? 2.2 : state === 'listening' ? 1.45 + e * 2.3 : 1.05;
        for (const s of stars) {
          s.angle += s.speed * starBoost;
          const radialPulse =
            s.radius + Math.sin(t * 1.5 + s.drift) * 6 + e * (state === 'speaking' ? 15 : -5);
          const sx = cx + Math.cos(s.angle) * radialPulse;
          const sy = cy + Math.sin(s.angle) * radialPulse;
          const twinkle = s.alpha * (0.6 + 0.4 * Math.sin(t * 2.7 + s.drift));
          orbCtx.fillStyle = `${palette.star} ${twinkle})`;
          orbCtx.beginPath();
          orbCtx.arc(sx, sy, s.size, 0, Math.PI * 2);
          orbCtx.fill();
        }
      }

      // 3b. Expanding Voice-Reactive Shockwave Ripples
      if (ripplesRef.current.length > 0) {
        const nextRipples: AcousticRipple[] = [];
        for (const rip of ripplesRef.current) {
          rip.radius += 1.55;
          rip.alpha *= 0.96;
          if (rip.alpha > 0.03 && rip.radius < orbSize * 0.49) {
            orbCtx.beginPath();
            orbCtx.arc(cx, cy, rip.radius, 0, Math.PI * 2);
            orbCtx.strokeStyle = `${palette.accent} ${rip.alpha})`;
            orbCtx.lineWidth = 1.6;
            orbCtx.stroke();
            nextRipples.push(rip);
          }
        }
        ripplesRef.current = nextRipples;
      }

      // 3c. Deep Volumetric Outer Corona Bloom
      const haloGrad = orbCtx.createRadialGradient(
        cx,
        cy,
        baseRadius * 0.32,
        cx,
        cy,
        baseRadius * 1.88
      );
      haloGrad.addColorStop(
        0,
        `${palette.glow} ${state === 'disconnected' ? 0.14 : 0.42 + e * 0.34})`
      );
      haloGrad.addColorStop(
        0.5,
        `${palette.halo} ${state === 'disconnected' ? 0.04 : 0.18 + e * 0.14})`
      );
      haloGrad.addColorStop(1, 'rgba(2, 5, 14, 0)');
      orbCtx.fillStyle = haloGrad;
      orbCtx.beginPath();
      orbCtx.arc(cx, cy, baseRadius * 1.88, 0, Math.PI * 2);
      orbCtx.fill();

      // 3d. 3D Tilted Gyroscopic Equatorial Rings & Photon Nodes (Signature SMFTA Architectural Halo)
      if (state !== 'disconnected') {
        const gyroCount = state === 'speaking' ? 3 : 2;
        for (let g = 0; g < gyroCount; g += 1) {
          const tiltAngle =
            t * (g % 2 === 0 ? 0.55 : -0.44) + g * (Math.PI / gyroCount) + e * 0.35;
          const rx = baseRadius * (1.22 + g * 0.09 + e * 0.14);
          const ry = baseRadius * (0.38 + g * 0.08 + Math.sin(t * 0.9 + g) * 0.06);

          orbCtx.save();
          orbCtx.translate(cx, cy);
          orbCtx.rotate(tiltAngle);

          // Glowing elliptical orbit track
          orbCtx.beginPath();
          orbCtx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
          orbCtx.strokeStyle =
            g === 0
              ? `${palette.accent} ${0.26 + e * 0.34})`
              : `${palette.glow} ${0.2 + e * 0.28})`;
          orbCtx.lineWidth = g === 0 ? 1.4 : 1.1;
          orbCtx.stroke();

          // Orbiting photon node traveling along the 3D ellipse
          const photonTheta = t * (1.8 + g * 0.55) * (g % 2 === 0 ? 1 : -1);
          const px = Math.cos(photonTheta) * rx;
          const py = Math.sin(photonTheta) * ry;
          const nodeGrad = orbCtx.createRadialGradient(px, py, 0.5, px, py, 7 + e * 4);
          nodeGrad.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
          nodeGrad.addColorStop(0.45, `${palette.accent} 0.7)`);
          nodeGrad.addColorStop(1, `${palette.glow} 0)`);
          orbCtx.fillStyle = nodeGrad;
          orbCtx.beginPath();
          orbCtx.arc(px, py, 7 + e * 4, 0, Math.PI * 2);
          orbCtx.fill();

          orbCtx.restore();
        }
      }

      // 3e. Deep Refractive Obsidian-Crystal Sphere Clip
      orbCtx.save();
      orbCtx.beginPath();
      orbCtx.arc(cx, cy, baseRadius, 0, Math.PI * 2);
      orbCtx.clip();

      const coreGrad = orbCtx.createRadialGradient(
        cx - baseRadius * 0.28,
        cy - baseRadius * 0.28,
        4,
        cx + baseRadius * 0.12,
        cy + baseRadius * 0.15,
        baseRadius * 1.15
      );
      coreGrad.addColorStop(
        0,
        state === 'disconnected' ? 'rgba(30, 41, 59, 0.78)' : 'rgba(15, 38, 96, 0.78)'
      );
      coreGrad.addColorStop(0.58, 'rgba(5, 12, 34, 0.95)');
      coreGrad.addColorStop(1, 'rgba(2, 5, 18, 0.99)');
      orbCtx.fillStyle = coreGrad;
      orbCtx.fillRect(cx - baseRadius, cy - baseRadius, baseRadius * 2, baseRadius * 2);

      // 3f. Internal Bioluminescent Vocal Nucleus + 6 Iridescent Aurora Plasma Curtains
      orbCtx.globalCompositeOperation = 'screen';

      // Inner living vocal nucleus that breathes with real voice energy
      const nucleusRadius = baseRadius * (0.34 + e * 0.36);
      const nucleusGrad = orbCtx.createRadialGradient(
        cx + Math.cos(t * 1.3) * 5,
        cy + Math.sin(t * 1.1) * 5,
        2,
        cx,
        cy,
        nucleusRadius * 1.5
      );
      nucleusGrad.addColorStop(
        0,
        state === 'disconnected'
          ? 'rgba(148, 163, 184, 0.15)'
          : `rgba(255, 255, 255, ${0.42 + e * 0.42})`
      );
      nucleusGrad.addColorStop(
        0.42,
        `${palette.accent} ${state === 'disconnected' ? 0.08 : 0.36 + e * 0.35})`
      );
      nucleusGrad.addColorStop(1, `${palette.glow} 0)`);
      orbCtx.fillStyle = nucleusGrad;
      orbCtx.beginPath();
      orbCtx.arc(cx, cy, nucleusRadius * 1.5, 0, Math.PI * 2);
      orbCtx.fill();

      const ribbonCount = state === 'speaking' ? 6 : 5;
      const sat = state === 'disconnected' ? 16 : 96;
      const hues = [
        palette.hueA,
        palette.hueB,
        palette.hueC,
        palette.hueA + 20,
        palette.hueB - 16,
        palette.hueC + 14,
      ];
      for (let r = 0; r < ribbonCount; r += 1) {
        const speedMul =
          state === 'speaking'
            ? 1.24
            : state === 'listening'
              ? 0.95 + e * 0.48
              : state === 'thinking'
                ? 1.5
                : 0.45;
        const phase = t * speedMul * (0.66 + r * 0.14) + r * 1.35;
        const swell = 1 + e * (state === 'speaking' ? 0.38 : 0.26);
        const hue = hues[r % hues.length]!;

        const fillGrad = orbCtx.createRadialGradient(
          cx + Math.cos(phase) * baseRadius * 0.44,
          cy + Math.sin(phase * 0.92) * baseRadius * 0.44,
          baseRadius * 0.05,
          cx,
          cy,
          baseRadius * 1.06
        );
        fillGrad.addColorStop(
          0,
          `hsla(${hue}, ${sat}%, 85%, ${state === 'disconnected' ? 0.16 : 0.54 + e * 0.34})`
        );
        fillGrad.addColorStop(
          0.48,
          `hsla(${hue + 14}, ${sat}%, 58%, ${state === 'disconnected' ? 0.08 : 0.28 + e * 0.28})`
        );
        fillGrad.addColorStop(1, `hsla(${hue + 32}, ${sat}%, 50%, 0)`);

        orbCtx.beginPath();
        const steps = 64;
        for (let i = 0; i <= steps; i += 1) {
          const a = (i / steps) * Math.PI * 2;
          const harmonicAmp =
            state === 'speaking'
              ? 14 + e * 27
              : state === 'listening'
                ? 9 + e * 19
                : 6 + e * 9;
          const wave =
            Math.sin(a * (state === 'speaking' ? 3 : 2) + phase) * harmonicAmp +
            Math.cos(a * 4 - phase * 1.2) * (harmonicAmp * 0.48);
          const rx =
            baseRadius * (0.82 + 0.11 * Math.sin(phase + r)) * swell + wave * 0.36;
          const ry =
            baseRadius * (0.56 + 0.19 * Math.cos(phase * 0.82 + r)) * swell +
            wave * 0.28;
          const rot = phase * 0.39 + r * 0.82;
          const px = Math.cos(a) * rx;
          const py = Math.sin(a) * ry;
          const x = cx + px * Math.cos(rot) - py * Math.sin(rot);
          const y = cy + px * Math.sin(rot) + py * Math.cos(rot);
          if (i === 0) orbCtx.moveTo(x, y);
          else orbCtx.lineTo(x, y);
        }
        orbCtx.closePath();
        orbCtx.fillStyle = fillGrad;
        orbCtx.fill();

        orbCtx.strokeStyle = `hsla(${hue - 6}, ${sat}%, 86%, ${state === 'disconnected' ? 0.08 : 0.2 + e * 0.32})`;
        orbCtx.lineWidth = 1.35 + e * 1.6;
        orbCtx.stroke();
      }

      // 3g. Dual Optical Glass Specular Lens Sheen + Fresnel Rim
      const glassHighlight = orbCtx.createRadialGradient(
        cx - baseRadius * 0.36,
        cy - baseRadius * 0.38,
        2,
        cx - baseRadius * 0.28,
        cy - baseRadius * 0.3,
        baseRadius * 0.58
      );
      glassHighlight.addColorStop(0, 'rgba(255, 255, 255, 0.42)');
      glassHighlight.addColorStop(0.45, 'rgba(224, 242, 254, 0.12)');
      glassHighlight.addColorStop(1, 'rgba(255, 255, 255, 0)');
      orbCtx.fillStyle = glassHighlight;
      orbCtx.beginPath();
      orbCtx.arc(cx, cy, baseRadius, 0, Math.PI * 2);
      orbCtx.fill();

      const innerRim = orbCtx.createRadialGradient(
        cx - baseRadius * 0.12,
        cy - baseRadius * 0.12,
        baseRadius * 0.65,
        cx,
        cy,
        baseRadius
      );
      innerRim.addColorStop(0, 'rgba(56, 189, 248, 0)');
      innerRim.addColorStop(0.74, `${palette.glow} ${0.16 + e * 0.24})`);
      innerRim.addColorStop(
        0.95,
        state === 'disconnected'
          ? 'rgba(148, 163, 184, 0.22)'
          : `rgba(224, 248, 255, ${0.62 + e * 0.32})`
      );
      innerRim.addColorStop(1, 'rgba(186, 230, 253, 0.2)');
      orbCtx.fillStyle = innerRim;
      orbCtx.beginPath();
      orbCtx.arc(cx, cy, baseRadius, 0, Math.PI * 2);
      orbCtx.fill();
      orbCtx.restore();

      // 3h. Iridescent Chromatic Sphere Edge
      orbCtx.globalCompositeOperation = 'screen';
      const rimGrad = orbCtx.createLinearGradient(
        cx - baseRadius,
        cy - baseRadius,
        cx + baseRadius,
        cy + baseRadius
      );
      rimGrad.addColorStop(0, 'rgba(255, 255, 255, 0.5)');
      rimGrad.addColorStop(0.45, `${palette.accent} 0.28)`);
      rimGrad.addColorStop(0.84, `${palette.halo} ${state === 'disconnected' ? 0.18 : 0.78})`);
      rimGrad.addColorStop(1, 'rgba(244, 114, 182, 0.42)');
      orbCtx.beginPath();
      orbCtx.arc(cx, cy, baseRadius, 0, Math.PI * 2);
      orbCtx.strokeStyle = rimGrad;
      orbCtx.lineWidth = 1.6 + e * 1.3;
      orbCtx.stroke();
      orbCtx.restore();

      // 4. Render Symmetrical 36-Bar Mirrored Harmonic Spectrum below the Orb
      const waveCanvas = waveCanvasRef.current;
      if (waveCanvas) {
        const wCtx = waveCanvas.getContext('2d');
        if (wCtx) {
          const wWidth = 264;
          const wHeight = 42;
          if (waveCanvas.width !== wWidth * dpr || waveCanvas.height !== wHeight * dpr) {
            waveCanvas.width = wWidth * dpr;
            waveCanvas.height = wHeight * dpr;
          }
          wCtx.save();
          wCtx.scale(dpr, dpr);
          wCtx.clearRect(0, 0, wWidth, wHeight);

          const gap = wWidth / barCount;
          const barW = 2.8;
          const midY = wHeight / 2;
          const half = (barCount - 1) / 2;

          for (let i = 0; i < barCount; i += 1) {
            const symDist = Math.abs(i - half) / half;
            const envelope = 0.22 + 0.78 * Math.pow(1 - symDist, 1.35);

            let rawBar = 0.08;
            if (state === 'speaking') {
              const binIdx = Math.min(freqBuf.length - 1, Math.floor((1 - symDist) * 32) + 2);
              const specVal = activeAnalyser ? (freqBuf[binIdx]! / 255) * 1.25 : 0;
              const vocalHarmonic =
                0.22 +
                0.38 * Math.abs(Math.sin(t * 4.5 - symDist * 4.8)) +
                0.18 * Math.abs(Math.cos(t * 6.8 + i * 0.4));
              rawBar = Math.max(specVal, vocalHarmonic * (0.65 + e * 0.55));
            } else if (state === 'listening' && !cur.isMuted) {
              const binIdx = Math.min(freqBuf.length - 1, Math.floor((1 - symDist) * 34) + 1);
              const specVal = activeAnalyser ? (freqBuf[binIdx]! / 255) * 1.28 : 0;
              const idleBreath = 0.11 + 0.08 * (0.5 + 0.5 * Math.sin(t * 2.4 - symDist * 3.2));
              rawBar = Math.max(
                idleBreath,
                specVal,
                micLevelRef.current * (0.58 + 0.42 * Math.sin(t * 5.2 + i * 0.45))
              );
            } else if (state === 'thinking') {
              rawBar = 0.16 + 0.25 * (0.5 + 0.5 * Math.sin(t * 3.8 - i * 0.36));
            } else if (state === 'connecting' || state === 'reconnecting') {
              rawBar = 0.12 + 0.16 * (0.5 + 0.5 * Math.sin(t * 2.2 - i * 0.32));
            } else {
              rawBar = 0.06;
            }

            const targetH = Math.max(3.2, Math.min(wHeight - 4, (3.6 + rawBar * 34) * envelope));
            smoothBars[i] = smoothBars[i]! + (targetH - smoothBars[i]!) * 0.28;

            const h = smoothBars[i]!;
            const x = i * gap + (gap - barW) / 2;
            const y = midY - h / 2;

            const barGrad = wCtx.createLinearGradient(x, y, x, y + h);
            if (state === 'speaking') {
              barGrad.addColorStop(0, `rgba(244, 114, 182, ${0.48 + envelope * 0.5})`);
              barGrad.addColorStop(0.5, `rgba(192, 132, 252, ${0.58 + envelope * 0.42})`);
              barGrad.addColorStop(1, `rgba(56, 189, 248, ${0.46 + envelope * 0.48})`);
            } else if (state === 'listening') {
              if (cur.isMuted) {
                barGrad.addColorStop(0, 'rgba(148, 163, 184, 0.25)');
                barGrad.addColorStop(1, 'rgba(100, 116, 139, 0.25)');
              } else {
                barGrad.addColorStop(0, `rgba(103, 232, 249, ${0.42 + envelope * 0.56})`);
                barGrad.addColorStop(0.5, `rgba(52, 211, 153, ${0.54 + envelope * 0.46})`);
                barGrad.addColorStop(1, `rgba(16, 185, 129, ${0.38 + envelope * 0.52})`);
              }
            } else if (state === 'reconnecting') {
              barGrad.addColorStop(0, `rgba(253, 224, 71, ${0.4 + envelope * 0.45})`);
              barGrad.addColorStop(1, `rgba(245, 158, 11, ${0.4 + envelope * 0.45})`);
            } else if (state === 'disconnected') {
              barGrad.addColorStop(0, 'rgba(100, 116, 139, 0.28)');
              barGrad.addColorStop(1, 'rgba(71, 85, 105, 0.28)');
            } else {
              barGrad.addColorStop(0, `rgba(165, 180, 252, ${0.42 + envelope * 0.5})`);
              barGrad.addColorStop(1, `rgba(56, 189, 248, ${0.42 + envelope * 0.5})`);
            }

            wCtx.fillStyle = barGrad;
            wCtx.beginPath();
            wCtx.roundRect(x, y, barW, h, 999);
            wCtx.fill();
          }
          wCtx.restore();
        }
      }

      if (!reducedMotion) {
        t +=
          state === 'speaking'
            ? 0.045
            : state === 'listening'
              ? 0.037
              : state === 'thinking'
                ? 0.035
                : 0.022;
        rafId = window.requestAnimationFrame(tick);
      }
    };

    tick();
    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, [handleInterruptAndListen, isOpen, startSingleTurnRecognition]);

  if (!isOpen) return null;

  const formattedTime =
    String(Math.floor(seconds / 60)).padStart(2, '0') +
    ':' +
    String(seconds % 60).padStart(2, '0');

  const activeCopy = STATE_COPY[voiceState];
  const effectiveHeadline =
    voiceState === 'listening' && isMuted
      ? 'Microphone muted'
      : voiceState === 'listening' && (isUserVoicing || Boolean(liveCaption.trim()))
        ? 'Hearing you...'
        : activeCopy.headline;
  const effectiveHint =
    voiceState === 'listening' && isMuted
      ? 'Tap mic below to resume'
      : voiceState === 'listening' && (isUserVoicing || Boolean(liveCaption.trim()))
        ? 'Pause briefly or tap send to reply'
        : voiceLang === 'bn-BD' && voiceState === 'listening'
          ? 'বাংলা বা ইংরেজিতে স্বাভাবিকভাবে কথা বলুন'
          : activeCopy.hint;

  const cleanUserTranscript = sanitizeVoiceUtterance(
    liveCaption || sessionUserText || lastUserText
  );
  const cleanAiTranscript =
    lastAiMessage?.text && activeTurnMsgIdRef.current === lastAiMessage.id
      ? formatTextForNaturalSpeech(lastAiMessage.text, 240)
      : greetingText;

  const hasCapturedSpeechToSend =
    voiceState === 'listening' &&
    !isMuted &&
    (isUserVoicing || Boolean(liveCaption.trim()) || hasRecordedAudio);

  const handleSelectVoicePersona = (nextVoice: GeminiFemaleVoiceName) => {
    ensureAudioContext();
    setSelectedVoice(nextVoice);
    stateRef.current.selectedVoice = nextVoice;
    // Speak a brief natural voice sample in the chosen persona whenever not actively generating
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

  const handleToggleMute = () => {
    ensureAudioContext();
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    if (persistentStreamRef.current) {
      persistentStreamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = !nextMuted;
      });
    }
    if (nextMuted) {
      stopTurnRecognition();
      setIsUserVoicing(false);
    } else if (
      voiceState === 'listening' &&
      !isGenerating &&
      !isAiSpeaking &&
      !isDisconnected
    ) {
      startListeningTurn();
    }
  };

  const handleToggleVoiceLang = () => {
    ensureAudioContext();
    const nextLang: 'bn-BD' | 'en-US' = voiceLang === 'bn-BD' ? 'en-US' : 'bn-BD';
    setVoiceLang(nextLang);
    stateRef.current.voiceLang = nextLang;
    if (
      voiceState === 'listening' &&
      !isMuted &&
      !isGenerating &&
      !isAiSpeaking &&
      !isDisconnected
    ) {
      stopTurnRecognition();
      startSingleTurnRecognition(nextLang);
    }
  };

  const handlePrimaryOrbAction = () => {
    ensureAudioContext();
    if (voiceState === 'disconnected') {
      void establishVoiceConnection(false);
      return;
    }
    if (voiceState === 'speaking' || isSynthesizingVoice) {
      handleInterruptAndListen();
      return;
    }
    if (voiceState === 'listening') {
      if (isMuted) {
        handleToggleMute();
        return;
      }
      if (
        turnHadRealSpeechRef.current ||
        recognitionLiveTextRef.current.trim() ||
        turnChunksRef.current.length >= 2
      ) {
        void commitActiveUtterance(true);
      } else {
        startSingleTurnRecognition();
      }
    }
  };

  const handleSubmitTyped = (e: React.FormEvent) => {
    e.preventDefault();
    const verdict = shouldSubmitVoiceUtterance({
      rawText: draftText,
      hadRealSpeechEnergy: true,
      lastSubmitted: lastSubmittedRef.current,
      nowMs: Date.now(),
    });
    if (!verdict.accept) return;
    ensureAudioContext();
    stopListeningTurnOnly();
    stopAiSpeechPlayback();
    lastSubmittedRef.current = { text: verdict.cleanText, at: Date.now() };
    setSessionUserText(verdict.cleanText);
    setDraftText('');
    setKeyboardOpen(false);
    setStatusNotice(null);
    onSendText(verdict.cleanText);
  };

  const handleSafeExit = () => {
    stopAiSpeechPlayback();
    onAbortGeneration?.();
    releaseAllMicResources();
    onCancelMic?.();
    onEndCall();
  };

  const stateDotColor =
    voiceState === 'listening'
      ? isMuted
        ? 'bg-slate-400'
        : isUserVoicing
          ? 'bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.9)]'
          : 'bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.8)]'
      : voiceState === 'speaking'
        ? 'bg-violet-400 shadow-[0_0_10px_rgba(167,139,250,0.9)]'
        : voiceState === 'thinking'
          ? 'bg-indigo-400 shadow-[0_0_10px_rgba(129,140,248,0.85)]'
          : voiceState === 'reconnecting'
            ? 'bg-amber-400'
            : voiceState === 'disconnected'
              ? 'bg-rose-400'
              : 'bg-sky-400';

  return (
    <div
      data-testid="voice-call-overlay"
      data-voice-state={voiceState}
      role="dialog"
      aria-modal="true"
      aria-label="SMFTA Live Voice Conversation"
      className={`live-voice-overlay live-voice-state-${voiceState} fixed inset-0 z-[70] h-[100dvh] w-full text-white flex flex-col justify-between select-none overflow-hidden`}
    >
      {/* Ambient Architectural Halo & Horizon Aurora Layers */}
      <div className="live-voice-ambient-grid pointer-events-none" aria-hidden="true" />
      <div className="live-voice-aurora-horizon pointer-events-none" aria-hidden="true" />

      {/* Top Spatial HUD Bar: Sculpted Telemetry Pill + Natural Voice Selector + Exit */}
      <header className="relative z-10 w-full max-w-3xl mx-auto flex items-center justify-between gap-2 px-3.5 sm:px-6 pt-[max(1rem,env(safe-area-inset-top))] pb-1.5">
        <div className="live-voice-hud-pill inline-flex items-center gap-2.5 pl-3 pr-4 h-11 rounded-full shrink-0">
          <span
            className={`w-2 h-2 rounded-full shrink-0 transition-colors ${stateDotColor}`}
            aria-hidden="true"
          />
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="text-[12.5px] font-semibold tracking-tight text-white/95 whitespace-nowrap">
                SMFTA Voice
              </span>
              <span className="hidden sm:inline-block text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded bg-cyan-400/15 text-cyan-200/90">
                Natural HD
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-slate-300/80 whitespace-nowrap leading-none mt-0.5">
              <span data-testid="live-voice-status-label" className="font-medium text-cyan-100/90">
                {voiceState === 'listening' && isMuted ? 'Muted' : activeCopy.label}
              </span>
              <span className="text-white/25" aria-hidden="true">
                ·
              </span>
              <span className="font-mono text-[10.5px] tabular-nums text-slate-300/75">
                {formattedTime}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <label className="live-voice-select-wrap live-voice-hud-pill relative inline-flex items-center h-11 px-3 sm:px-3.5 rounded-full hover:bg-white/[0.11] transition-colors cursor-pointer">
            <Volume2 className="w-3.5 h-3.5 text-cyan-300/95 mr-1.5 shrink-0 pointer-events-none" />
            <select
              aria-label="Voice persona"
              data-testid="live-voice-persona-select"
              value={selectedVoice}
              onChange={(e) =>
                handleSelectVoicePersona(e.target.value as GeminiFemaleVoiceName)
              }
              className="live-voice-select appearance-none bg-transparent pr-4 sm:pr-5 text-[11.5px] sm:text-[12.5px] font-medium text-white/95 cursor-pointer max-w-[96px] sm:max-w-[156px] truncate"
            >
              {VOICE_OPTIONS.map((v) => (
                <option key={v.id} value={v.id} className="bg-slate-950 text-white">
                  {v.name} · {v.subtitle}
                </option>
              ))}
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-white/60 absolute right-2.5 pointer-events-none" />
          </label>

          <button
            type="button"
            data-testid="live-voice-close-btn"
            onClick={handleSafeExit}
            aria-label="Exit Voice Mode"
            title="Exit Voice Mode"
            className="live-voice-control live-voice-hud-pill w-11 h-11 rounded-full inline-flex items-center justify-center hover:bg-white/[0.14] text-white/85 hover:text-white transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Center Stage: Sculptural 3D Quantum Orb + 36-Bar Mirrored Spectrum + Persona Strip + Live Dialogue Card */}
      <main className="relative z-10 flex-1 min-h-0 flex flex-col items-center justify-center text-center w-full max-w-xl mx-auto px-4 py-1">
        <div className="relative flex items-center justify-center">
          <div
            className={`live-voice-orb-pedestal pointer-events-none ${
              isUserVoicing || voiceState === 'speaking' ? 'is-energized' : ''
            }`}
            aria-hidden="true"
          />
          <button
            type="button"
            onClick={handlePrimaryOrbAction}
            aria-label={
              voiceState === 'speaking'
                ? 'Interrupt AI and start listening'
                : voiceState === 'disconnected'
                  ? 'Reconnect voice session'
                  : hasCapturedSpeechToSend
                    ? 'Send spoken message now'
                    : 'Voice assistant orb'
            }
            className="live-voice-orb-trigger relative flex items-center justify-center rounded-full cursor-pointer bg-transparent border-0 p-0 transition-transform active:scale-[0.97]"
          >
            <canvas
              ref={orbCanvasRef}
              data-testid="live-voice-orb-canvas"
              className="w-[236px] h-[236px] sm:w-[288px] sm:h-[288px] block"
              aria-hidden="true"
            />
          </button>
        </div>

        {/* Symmetrical 36-Bar Mirrored Harmonic Spectrum */}
        <div className="mt-0.5 mb-1.5 flex items-center justify-center h-10">
          <canvas
            ref={waveCanvasRef}
            data-testid="live-voice-waveform-canvas"
            className="w-[264px] h-[42px] block"
            aria-label="Live audio waveform"
          />
        </div>

        {/* Crisp State Headline & Bilingual Micro-Guidance */}
        <div className="space-y-1 max-w-md px-2">
          <h2
            data-testid="live-voice-headline"
            className="live-voice-headline-glow text-[23px] sm:text-[28px] font-semibold tracking-tight text-white leading-tight"
          >
            {effectiveHeadline}
          </h2>
          <p className="text-[13px] sm:text-[13.5px] font-normal text-slate-300/80 leading-snug">
            {effectiveHint}
          </p>
        </div>

        {/* Interactive Natural Voice Persona Quick-Switch Bar */}
        <div
          role="group"
          aria-label="Natural voice personas"
          className="mt-2.5 flex items-center justify-center gap-1.5 flex-wrap max-w-md px-1"
        >
          {VOICE_OPTIONS.map((v) => {
            const active = selectedVoice === v.id;
            return (
              <button
                key={v.id}
                type="button"
                data-testid={`live-voice-chip-${v.id.toLowerCase()}`}
                onClick={() => handleSelectVoicePersona(v.id)}
                aria-pressed={active}
                className={`live-voice-control live-voice-persona-chip h-7 px-2.5 rounded-full text-[11px] font-medium inline-flex items-center gap-1 transition-all cursor-pointer ${
                  active
                    ? 'is-active text-white'
                    : 'text-slate-300/75 hover:text-white/95'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    active ? 'bg-cyan-300 shadow-[0_0_6px_rgba(103,232,249,0.9)]' : 'bg-white/25'
                  }`}
                  aria-hidden="true"
                />
                <span>{v.name}</span>
              </button>
            );
          })}
        </div>

        {/* Frosted-Glass Live Dialogue Deck (never exposes <think> reasoning) */}
        {(cleanUserTranscript || cleanAiTranscript) && (
          <div
            data-testid="live-voice-transcript-box"
            className="live-voice-transcript live-voice-dialogue-card mt-3 w-full max-w-md px-3.5 py-2.5 rounded-2xl text-left space-y-1.5 max-h-[112px] overflow-y-auto"
          >
            {cleanUserTranscript && (
              <div className="flex items-start gap-2">
                <span className="shrink-0 mt-0.5 px-1.5 py-0.5 rounded text-[9.5px] font-semibold uppercase tracking-wider bg-emerald-400/15 text-emerald-200/95">
                  {voiceLang === 'bn-BD' ? 'আপনি' : 'YOU'}
                </span>
                <p className="text-[13px] text-cyan-100/95 leading-snug line-clamp-2">
                  {cleanUserTranscript}
                </p>
              </div>
            )}
            {cleanAiTranscript && (
              <div className="flex items-start gap-2">
                <span className="shrink-0 mt-0.5 px-1.5 py-0.5 rounded text-[9.5px] font-semibold uppercase tracking-wider bg-violet-400/20 text-violet-200/95">
                  {selectedVoice}
                </span>
                <p className="text-[13.5px] text-white/95 font-normal leading-snug line-clamp-2">
                  {cleanAiTranscript}
                </p>
              </div>
            )}
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
            className="live-voice-control mt-2.5 inline-flex items-center gap-2 rounded-full bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-semibold px-5 h-10 text-[12.5px] cursor-pointer transition-colors"
          >
            <Volume2 className="w-4 h-4" />
            <span>Tap to enable voice audio</span>
          </button>
        )}

        {statusNotice && (
          <p
            data-testid="live-voice-status-notice"
            role="status"
            className="mt-2 max-w-sm text-[12px] text-amber-200/90 leading-snug"
          >
            {statusNotice}
          </p>
        )}
      </main>

      {/* Bottom Elevated Glassmorphic Thumb Dock */}
      <footer className="relative z-10 w-full max-w-md mx-auto px-4 pt-1.5 pb-[max(1.25rem,env(safe-area-inset-bottom))] flex flex-col items-center gap-2.5">
        {keyboardOpen && (
          <form
            onSubmit={handleSubmitTyped}
            className="live-voice-composer w-full flex items-center gap-2 pl-4 pr-1.5 h-12 rounded-full"
          >
            <input
              ref={textInputRef}
              type="text"
              data-testid="live-voice-input"
              value={draftText}
              onChange={(e) => setDraftText(e.target.value)}
              placeholder={voiceLang === 'bn-BD' ? 'মেসেজ লিখুন...' : 'Type a message...'}
              className="live-voice-input flex-1 min-w-0 bg-transparent text-[14.5px] text-white placeholder:text-white/50"
            />
            <button
              type="submit"
              data-testid="live-voice-send-btn"
              disabled={!draftText.trim()}
              aria-label="Send typed message"
              className="live-voice-control w-9 h-9 rounded-full bg-white text-slate-950 disabled:opacity-35 inline-flex items-center justify-center hover:bg-sky-50 transition-opacity cursor-pointer shrink-0"
            >
              <ArrowUp className="w-4 h-4 stroke-[2.4]" />
            </button>
          </form>
        )}

        <div className="live-voice-dock inline-flex items-center justify-center gap-2.5 sm:gap-3 px-3.5 py-2 rounded-full">
          {/* Mute / Unmute Microphone */}
          <button
            type="button"
            data-testid="live-voice-mute-btn"
            onClick={handleToggleMute}
            disabled={voiceState === 'disconnected' || voiceState === 'connecting'}
            aria-label={isMuted ? 'Unmute microphone' : 'Mute microphone'}
            aria-pressed={isMuted}
            title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
            className={`live-voice-control w-12 h-12 rounded-full inline-flex items-center justify-center transition-all cursor-pointer disabled:opacity-35 ${
              isMuted
                ? 'bg-white text-slate-950'
                : isUserVoicing
                  ? 'bg-emerald-400/25 text-emerald-200 ring-2 ring-emerald-400/75 shadow-[0_0_18px_rgba(16,185,129,0.38)]'
                  : 'bg-white/[0.08] hover:bg-white/[0.15] text-white'
            }`}
          >
            {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          </button>

          {/* 1-Tap Bangla / English Speech Recognition Language Switch */}
          <button
            type="button"
            data-testid="live-voice-lang-btn"
            onClick={handleToggleVoiceLang}
            aria-label={`Switch speech recognition language (current: ${voiceLang === 'bn-BD' ? 'Bangla' : 'English'})`}
            title={voiceLang === 'bn-BD' ? 'Listening in Bangla — tap for English' : 'Listening in English — tap for Bangla'}
            className="live-voice-control w-11 h-11 rounded-full bg-white/[0.08] hover:bg-white/[0.16] text-[12px] font-semibold tracking-tight text-cyan-200 inline-flex items-center justify-center transition-colors cursor-pointer"
          >
            {voiceLang === 'bn-BD' ? 'বাং' : 'EN'}
          </button>

          {/* Contextual Primary Action: Instant Send / Interrupt AI / Reconnect */}
          {voiceState === 'disconnected' ? (
            <button
              type="button"
              data-testid="live-voice-reconnect-btn"
              onClick={() => void establishVoiceConnection(false)}
              aria-label="Reconnect voice session"
              className="live-voice-control h-12 px-5 rounded-full bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-semibold text-[13.5px] inline-flex items-center gap-2 transition-colors cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Reconnect</span>
            </button>
          ) : voiceState === 'speaking' ? (
            <button
              type="button"
              data-testid="live-voice-interrupt-btn"
              onClick={handleInterruptAndListen}
              aria-label="Interrupt AI and speak"
              className="live-voice-control h-12 px-4 rounded-full bg-violet-400/20 hover:bg-violet-400/30 text-violet-100 font-medium text-[13px] inline-flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Hand className="w-4 h-4 text-violet-300" />
              <span>Interrupt</span>
            </button>
          ) : hasCapturedSpeechToSend ? (
            <button
              type="button"
              data-testid="live-voice-send-now-btn"
              onClick={() => void commitActiveUtterance(true)}
              aria-label="Send spoken message now"
              className="live-voice-control h-12 px-4 rounded-full bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-semibold text-[13px] inline-flex items-center gap-1.5 transition-colors cursor-pointer shadow-lg shadow-emerald-950/50"
            >
              <ArrowUp className="w-4 h-4 stroke-[2.5]" />
              <span>Send</span>
            </button>
          ) : null}

          {/* Optional Keyboard Drawer Toggle */}
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
            title={keyboardOpen ? 'Hide text input' : 'Type a message'}
            className={`live-voice-control w-11 h-11 rounded-full inline-flex items-center justify-center transition-colors cursor-pointer ${
              keyboardOpen
                ? 'bg-cyan-400/25 text-cyan-200'
                : 'bg-white/[0.08] hover:bg-white/[0.15] text-white/85 hover:text-white'
            }`}
          >
            <Keyboard className="w-4 h-4" />
          </button>

          {/* Safe End Call / Disconnect Button */}
          <button
            type="button"
            data-testid="live-voice-end-btn"
            onClick={handleSafeExit}
            aria-label="End voice session"
            title="End voice session"
            className="live-voice-control w-12 h-12 rounded-full bg-gradient-to-br from-rose-500 to-pink-600 hover:from-rose-400 hover:to-pink-500 text-white inline-flex items-center justify-center transition-all cursor-pointer shadow-lg shadow-rose-950/60"
          >
            <PhoneOff className="w-5 h-5" />
          </button>
        </div>
      </footer>
    </div>
  );
};
