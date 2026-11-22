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
  computeRmsEnergy,
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
  const playbackAnalyserRef = useRef<AnalyserNode | null>(null);
  const nextPlayTimeRef = useRef<number>(0);
  const pendingAudioBufferRef = useRef<AudioBuffer | null>(null);
  const ttsAbortRef = useRef<AbortController | null>(null);
  const pendingChunksRef = useRef<string[]>([]);
  const pipelineBusyRef = useRef<boolean>(false);
  const spokenCursorRef = useRef<number>(0);
  const activeTurnMsgIdRef = useRef<string | null>(null);
  const spokenMsgIdRef = useRef<string | null>(null);
  const useBrowserTtsForTurnRef = useRef<boolean>(false);
  const serverTtsCooldownUntilRef = useRef<number>(0);
  const aiSpeakingStartedAtRef = useRef<number>(0);

  // Persistent single-session microphone, VAD, recorder & speech recognition refs
  const persistentStreamRef = useRef<MediaStream | null>(null);
  const micSourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const micAnalyserRef = useRef<AnalyserNode | null>(null);
  const turnRecorderRef = useRef<MediaRecorder | null>(null);
  const turnChunksRef = useRef<Blob[]>([]);
  const turnMimeRef = useRef<string>('audio/webm');
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
    const rec = turnRecorderRef.current;
    turnRecorderRef.current = null;
    if (!rec) {
      const existing =
        turnChunksRef.current.length > 0
          ? new Blob(turnChunksRef.current, { type: turnMimeRef.current })
          : null;
      turnChunksRef.current = [];
      return Promise.resolve(existing);
    }
    if (rec.state === 'inactive') {
      const existing =
        turnChunksRef.current.length > 0
          ? new Blob(turnChunksRef.current, { type: turnMimeRef.current })
          : null;
      turnChunksRef.current = [];
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
  }, []);

  const stopListeningTurnOnly = useCallback(() => {
    setIsSessionListening(false);
    setIsUserVoicing(false);
    stopTurnRecognition();
    void stopTurnRecorder();
    vadStateRef.current = createVadTracker(vadStateRef.current.noiseFloor);
    turnHadRealSpeechRef.current = false;
    recognitionFinalPrefixRef.current = '';
    recognitionLiveTextRef.current = '';
  }, [stopTurnRecorder, stopTurnRecognition]);

  const stopAiSpeechPlayback = useCallback(() => {
    if (autoListenTimerRef.current !== null) {
      window.clearTimeout(autoListenTimerRef.current);
      autoListenTimerRef.current = null;
    }
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
    pendingAudioBufferRef.current = null;
    setNeedsTapToPlay(false);
    setIsSynthesizingVoice(false);
    setIsAiSpeaking(false);
  }, []);

  const releaseAllMicResources = useCallback(() => {
    stopListeningTurnOnly();
    micAnalyserRef.current = null;
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

  // Forward ref so SpeechRecognition.onresult/onend can commit cleanly without circular hooks
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

            // Dual-trigger auto-commit: guarantees spoken words ALWAYS send even if phone RMS is soft!
            clearSpeechRecCommitTimer();
            const resultsLen = e?.results?.length ?? 0;
            const latestIsFinal =
              resultsLen > 0 && Boolean(e?.results?.[resultsLen - 1]?.isFinal);
            const commitDelayMs = latestIsFinal ? 480 : 860;
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
          // Persistent MediaRecorder + server STT remains seamlessly active
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
      vadStateRef.current = createVadTracker(vadStateRef.current.noiseFloor);
      setLiveCaption('');
      setIsUserVoicing(false);
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
            }
          };
          recorder.start(200);
          turnRecorderRef.current = recorder;
        } catch {
          turnRecorderRef.current = null;
        }
      }

      startSingleTurnRecognition(langOverride);
    },
    [ensureAudioContext, startSingleTurnRecognition, stopTurnRecognition]
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
      }, 240);
    },
    [startListeningTurn]
  );

  const commitActiveUtterance = useCallback(
    async (forceManual = false) => {
      if (turnCommitInFlightRef.current) return;
      if (!stateRef.current.isOpen || stateRef.current.isGenerating) return;

      clearSpeechRecCommitTimer();
      const hadSpeech = turnHadRealSpeechRef.current;
      const webSpeechText = sanitizeVoiceUtterance(recognitionLiveTextRef.current);

      // Strict zero-empty guard: never submit pure silence
      if (!hadSpeech && !webSpeechText) {
        if (forceManual) {
          // Re-arm recognition silently if idle timeout ended it
          startSingleTurnRecognition();
          setStatusNotice('Listening — speak naturally in Bangla or English.');
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

      // Ultra-fast path: crisp Web Speech transcript already captured (0ms STT delay!)
      if (webSpeechText && submitCleanText(webSpeechText, true)) {
        turnCommitInFlightRef.current = false;
        return;
      }

      // Fast server STT path powered by gemini-3.1-flash-lite whenever vocal energy was heard
      if (hadSpeech && recordedBlob && recordedBlob.size >= 600) {
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

  const schedulePcmSamples = useCallback(
    (
      ctx: AudioContext,
      samples: Float32Array,
      sampleRate: number,
      ctrl: AbortController
    ) => {
      if (ctrl.signal.aborted || samples.length === 0) return;

      const now = ctx.currentTime;
      const isFreshStart =
        activeSourcesRef.current.size === 0 || nextPlayTimeRef.current <= now + 0.008;

      let renderSamples = samples;
      if (isFreshStart && samples.length > 64) {
        renderSamples = new Float32Array(samples);
        const fadeInLen = Math.min(
          Math.round(sampleRate * 0.003),
          Math.floor(renderSamples.length / 4)
        );
        for (let i = 0; i < fadeInLen; i += 1) {
          renderSamples[i] = renderSamples[i]! * (i / fadeInLen);
        }
      }

      const audioBuffer = ctx.createBuffer(1, renderSamples.length, sampleRate);
      audioBuffer.copyToChannel(renderSamples as Float32Array<ArrayBuffer>, 0);

      const analyser = ensurePlaybackAnalyser(ctx);
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(analyser);

      const startAt = isFreshStart
        ? Math.max(now + 0.08, nextPlayTimeRef.current)
        : nextPlayTimeRef.current;
      nextPlayTimeRef.current = startAt + audioBuffer.duration;

      activeSourcesRef.current.add(source);
      playbackSourceRef.current = source;
      if (isFreshStart) {
        aiSpeakingStartedAtRef.current = Date.now();
        bargeInStateRef.current = createBargeInState();
      }
      setIsSynthesizingVoice(false);
      setIsAiSpeaking(true);

      source.onended = () => {
        activeSourcesRef.current.delete(source);
        if (playbackSourceRef.current === source) {
          playbackSourceRef.current = null;
        }
        scheduleAutoListenAfterSpeech(ctrl);
      };

      source.start(startAt);
    },
    [ensurePlaybackAnalyser, scheduleAutoListenAfterSpeech]
  );

  const startDecodedBufferPlayback = useCallback(
    (ctx: AudioContext, audioBuffer: AudioBuffer, ctrl?: AbortController | null) => {
      const analyser = ensurePlaybackAnalyser(ctx);
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(analyser);

      const startAt = Math.max(ctx.currentTime + 0.02, nextPlayTimeRef.current);
      nextPlayTimeRef.current = startAt + audioBuffer.duration;

      activeSourcesRef.current.add(source);
      playbackSourceRef.current = source;
      pendingAudioBufferRef.current = null;
      aiSpeakingStartedAtRef.current = Date.now();
      bargeInStateRef.current = createBargeInState();
      setNeedsTapToPlay(false);
      setIsSynthesizingVoice(false);
      setIsAiSpeaking(true);

      source.onended = () => {
        activeSourcesRef.current.delete(source);
        if (playbackSourceRef.current === source) {
          playbackSourceRef.current = null;
        }
        scheduleAutoListenAfterSpeech(ctrl);
      };

      source.start(startAt);
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

      pipelineBusyRef.current = true;
      try {
        while (pendingChunksRef.current.length > 0 && !ctrl.signal.aborted) {
          const sentence = pendingChunksRef.current.shift();
          if (!sentence) continue;

          const voice = stateRef.current.selectedVoice;
          const isMaleVoice =
            voice === 'Puck' || voice === 'Charon' || voice === 'Fenrir';
          const voiceStyle = buildVoiceStylePrompt(voice);

          if (
            useBrowserTtsForTurnRef.current ||
            Date.now() < serverTtsCooldownUntilRef.current
          ) {
            await speakSentenceViaBrowser(sentence, msgId, isMaleVoice, voice, ctrl);
            continue;
          }

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
          if (ctrl.signal.aborted) break;

          if (ctx && (ctx.state as string) !== 'suspended') {
            const streamRes = await streamGeminiPcmSpeech({
              text: sentence,
              voiceName: voice,
              style: voiceStyle,
              signal: ctrl.signal,
              onPcmChunk: (samples, sampleRate) => {
                schedulePcmSamples(ctx, samples, sampleRate, ctrl);
              },
            });
            if (ctrl.signal.aborted) break;
            if (streamRes.ok && streamRes.receivedAudio) {
              if (
                pendingChunksRef.current.length > 0 &&
                nextPlayTimeRef.current > ctx.currentTime
              ) {
                nextPlayTimeRef.current += 0.1;
              }
              continue;
            }
            if (streamRes.integrationRequired || streamRes.fallbackToBrowser) {
              useBrowserTtsForTurnRef.current = true;
              if (streamRes.fallbackToBrowser) {
                serverTtsCooldownUntilRef.current = Date.now() + 90_000;
              }
              if (isSpeechSynthesisSupported()) {
                await speakSentenceViaBrowser(
                  sentence,
                  msgId,
                  isMaleVoice,
                  voice,
                  ctrl
                );
                continue;
              }
              break;
            }
          }

          const res = await requestGeminiFemaleSpeech({
            text: sentence,
            voiceName: voice,
            style: voiceStyle,
            signal: ctrl.signal,
          });
          if (ctrl.signal.aborted) break;

          if (!res.ok || !res.audioBase64) {
            useBrowserTtsForTurnRef.current = true;
            if (!/abort/i.test(res.error || '') && isSpeechSynthesisSupported()) {
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
            if (ctrl.signal.aborted) break;
            if ((activeCtx.state as string) === 'suspended') {
              pendingAudioBufferRef.current = audioBuffer;
              setNeedsTapToPlay(true);
              break;
            }
            startDecodedBufferPlayback(activeCtx, audioBuffer, ctrl);
          } catch {
            useBrowserTtsForTurnRef.current = true;
            if (isSpeechSynthesisSupported()) {
              await speakSentenceViaBrowser(sentence, msgId, isMaleVoice, voice, ctrl);
            }
          }
        }
      } finally {
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
            analyser.smoothingTimeConstant = 0.68;
            src.connect(analyser);
            micSourceNodeRef.current = src;
            micAnalyserRef.current = analyser;
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

  // Real-time streaming AI reply → TTS pipeline
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

  // Unified 60fps loop: Real VAD + Barge-In + Signature Cosmic SMFTA Crystal Orb + Symmetrical Spectrum
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
    const barCount = 34;
    const smoothBars = new Float32Array(barCount);

    // Subtle cosmic starlight constellation orbiting the crystal orb
    const stars: StarParticle[] = Array.from({ length: 32 }, (_, idx) => ({
      angle: (idx / 32) * Math.PI * 2 + (idx % 3) * 0.25,
      radius: 98 + (idx % 5) * 14,
      speed: (idx % 2 === 0 ? 1 : -1) * (0.0028 + (idx % 4) * 0.0012),
      size: 0.9 + (idx % 3) * 0.55,
      alpha: 0.22 + (idx % 4) * 0.14,
      drift: idx * 0.7,
    }));

    const tick = () => {
      const nowMs = Date.now();
      const state = visualStateRef.current;
      const cur = stateRef.current;

      // 1. Sample real microphone RMS for VAD, Barge-In & live acoustic ripples
      let micRms = 0;
      if (micAnalyserRef.current && !cur.isMuted) {
        micAnalyserRef.current.getByteTimeDomainData(timeBuf);
        micRms = computeRmsEnergy(timeBuf);
      }
      micLevelRef.current += (Math.min(1, micRms * 7.5) - micLevelRef.current) * 0.24;

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
          // Re-wake SpeechRecognition cleanly if idle timeout ended it before user started speaking
          if (!recognitionRef.current) {
            startSingleTurnRecognition();
          }
          if (nowMs - lastRippleAtRef.current > 320) {
            lastRippleAtRef.current = nowMs;
            ripplesRef.current.push({ radius: 82, alpha: 0.72 });
          }
        } else if (vadRes.action === 'speaking') {
          if (!turnHadRealSpeechRef.current && vadRes.nextState.speechConfirmed) {
            turnHadRealSpeechRef.current = true;
          }
          setIsUserVoicing(vadRes.nextState.isVoiceActive);
          if (vadRes.nextState.isVoiceActive && nowMs - lastRippleAtRef.current > 460) {
            lastRippleAtRef.current = nowMs;
            ripplesRef.current.push({ radius: 82, alpha: 0.52 });
          }
        } else if (vadRes.action === 'commit') {
          setIsUserVoicing(false);
          void commitActiveUtteranceRef.current(false);
        } else if (!vadRes.nextState.isVoiceActive && !recognitionLiveTextRef.current) {
          setIsUserVoicing(false);
        }
      }

      // Real echo-guarded Barge-In while AI is speaking
      if (
        state === 'speaking' &&
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
        const bins = Math.min(44, freqBuf.length);
        for (let i = 0; i < bins; i += 1) {
          sum += freqBuf[i]!;
        }
        targetEnergy = Math.min(1, (sum / (bins * 255)) * 2.7);
        if (state === 'listening') {
          targetEnergy = Math.max(targetEnergy, micLevelRef.current * 0.95);
        }
      } else if (state === 'thinking') {
        targetEnergy = 0.28 + 0.12 * Math.sin(t * 2.6);
      } else if (state === 'connecting' || state === 'reconnecting') {
        targetEnergy = 0.18 + 0.08 * Math.sin(t * 2.0);
      } else if (state === 'disconnected') {
        targetEnergy = 0.03;
      }

      // Subtle speaking energy pulse even when browser speechSynthesis is used (no playback analyser node)
      if (state === 'speaking' && targetEnergy < 0.16) {
        targetEnergy = 0.28 + 0.18 * Math.abs(Math.sin(t * 3.8)) + 0.1 * Math.cos(t * 6.2);
      }

      energyRef.current += (targetEnergy - energyRef.current) * 0.19;
      const e = energyRef.current;

      // 3. Render Signature SMFTA Living Crystal Orb + Orbiting Constellation + Acoustic Ripples
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const orbSize = 310;
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
            ? 80 + e * 18
            : state === 'listening'
              ? 78 + e * 16
              : 75 + e * 9;

      const palette =
        state === 'speaking'
          ? {
              hueA: 210,
              hueB: 268,
              hueC: 325,
              glow: 'rgba(139, 92, 246,',
              halo: 'rgba(56, 189, 248,',
              star: 'rgba(216, 180, 254,',
            }
          : state === 'listening'
            ? {
                hueA: 182,
                hueB: 162,
                hueC: 204,
                glow: 'rgba(34, 211, 238,',
                halo: 'rgba(52, 211, 153,',
                star: 'rgba(165, 243, 252,',
              }
            : state === 'thinking'
              ? {
                  hueA: 232,
                  hueB: 256,
                  hueC: 208,
                  glow: 'rgba(99, 102, 241,',
                  halo: 'rgba(129, 140, 248,',
                  star: 'rgba(199, 210, 254,',
                }
              : state === 'reconnecting'
                ? {
                    hueA: 34,
                    hueB: 45,
                    hueC: 24,
                    glow: 'rgba(245, 158, 11,',
                    halo: 'rgba(251, 191, 36,',
                    star: 'rgba(253, 230, 138,',
                  }
                : state === 'disconnected'
                  ? {
                      hueA: 215,
                      hueB: 220,
                      hueC: 210,
                      glow: 'rgba(100, 116, 139,',
                      halo: 'rgba(71, 85, 105,',
                      star: 'rgba(148, 163, 184,',
                    }
                  : {
                      hueA: 204,
                      hueB: 224,
                      hueC: 192,
                      glow: 'rgba(59, 130, 246,',
                      halo: 'rgba(96, 165, 250,',
                      star: 'rgba(191, 219, 254,',
                    };

      // 3a. Drifting Starlight Constellation around the Orb
      if (!reducedMotion && state !== 'disconnected') {
        const starBoost = state === 'speaking' ? 2.1 : state === 'listening' ? 1.4 + e * 2.2 : 1.0;
        for (const s of stars) {
          s.angle += s.speed * starBoost;
          const radialPulse =
            s.radius + Math.sin(t * 1.4 + s.drift) * 6 + e * (state === 'speaking' ? 14 : -6);
          const sx = cx + Math.cos(s.angle) * radialPulse;
          const sy = cy + Math.sin(s.angle) * radialPulse;
          const twinkle = s.alpha * (0.62 + 0.38 * Math.sin(t * 2.5 + s.drift));
          orbCtx.fillStyle = `${palette.star} ${twinkle})`;
          orbCtx.beginPath();
          orbCtx.arc(sx, sy, s.size, 0, Math.PI * 2);
          orbCtx.fill();
        }
      }

      // 3b. Expanding Voice-Reactive Acoustic Ripple Rings (confirms real voice pickup!)
      if (ripplesRef.current.length > 0) {
        const nextRipples: AcousticRipple[] = [];
        for (const rip of ripplesRef.current) {
          rip.radius += 1.45;
          rip.alpha *= 0.962;
          if (rip.alpha > 0.03 && rip.radius < orbSize * 0.49) {
            orbCtx.beginPath();
            orbCtx.arc(cx, cy, rip.radius, 0, Math.PI * 2);
            orbCtx.strokeStyle = `rgba(103, 232, 249, ${rip.alpha})`;
            orbCtx.lineWidth = 1.6;
            orbCtx.stroke();
            nextRipples.push(rip);
          }
        }
        ripplesRef.current = nextRipples;
      }

      // 3c. Deep Volumetric Outer Aurora Bloom
      const haloGrad = orbCtx.createRadialGradient(
        cx,
        cy,
        baseRadius * 0.35,
        cx,
        cy,
        baseRadius * 1.82
      );
      haloGrad.addColorStop(
        0,
        `${palette.glow} ${state === 'disconnected' ? 0.14 : 0.38 + e * 0.32})`
      );
      haloGrad.addColorStop(
        0.52,
        `${palette.halo} ${state === 'disconnected' ? 0.04 : 0.16 + e * 0.12})`
      );
      haloGrad.addColorStop(1, 'rgba(2, 5, 14, 0)');
      orbCtx.fillStyle = haloGrad;
      orbCtx.beginPath();
      orbCtx.arc(cx, cy, baseRadius * 1.82, 0, Math.PI * 2);
      orbCtx.fill();

      // 3d. State-Specific Precision Orbitals
      if (state === 'connecting' || state === 'reconnecting') {
        for (let ring = 0; ring < 2; ring += 1) {
          const p = (t * 0.55 + ring * 0.5) % 1;
          const r = baseRadius * (1.03 + p * 0.44);
          orbCtx.beginPath();
          orbCtx.arc(cx, cy, r, 0, Math.PI * 2);
          orbCtx.strokeStyle = `${palette.glow} ${(1 - p) * 0.52})`;
          orbCtx.lineWidth = 1.5;
          orbCtx.stroke();
        }
      } else if (state === 'thinking') {
        // Twin counter-rotating precision light arcs
        orbCtx.save();
        orbCtx.translate(cx, cy);
        orbCtx.rotate(t * 1.45);
        orbCtx.beginPath();
        orbCtx.arc(0, 0, baseRadius * 1.15, 0, Math.PI * 0.72);
        orbCtx.strokeStyle = 'rgba(165, 180, 252, 0.78)';
        orbCtx.lineWidth = 2.2;
        orbCtx.lineCap = 'round';
        orbCtx.stroke();
        orbCtx.restore();

        orbCtx.save();
        orbCtx.translate(cx, cy);
        orbCtx.rotate(-t * 1.05 + 1.8);
        orbCtx.beginPath();
        orbCtx.arc(0, 0, baseRadius * 1.24, 0, Math.PI * 0.5);
        orbCtx.strokeStyle = 'rgba(125, 211, 252, 0.42)';
        orbCtx.lineWidth = 1.4;
        orbCtx.lineCap = 'round';
        orbCtx.stroke();
        orbCtx.restore();
      } else if (state === 'listening' && !cur.isMuted) {
        const pulseR = baseRadius * (1.08 + e * 0.28);
        orbCtx.beginPath();
        orbCtx.arc(cx, cy, pulseR, 0, Math.PI * 2);
        orbCtx.strokeStyle = `rgba(103, 232, 249, ${0.22 + e * 0.48})`;
        orbCtx.lineWidth = 1.3 + e * 1.7;
        orbCtx.stroke();
      }

      // 3e. Deep Refractive Obsidian-Crystal Core
      orbCtx.save();
      orbCtx.beginPath();
      orbCtx.arc(cx, cy, baseRadius, 0, Math.PI * 2);
      orbCtx.clip();

      const coreGrad = orbCtx.createRadialGradient(
        cx - baseRadius * 0.3,
        cy - baseRadius * 0.3,
        4,
        cx + baseRadius * 0.14,
        cy + baseRadius * 0.16,
        baseRadius * 1.14
      );
      coreGrad.addColorStop(
        0,
        state === 'disconnected' ? 'rgba(30, 41, 59, 0.75)' : 'rgba(18, 46, 108, 0.74)'
      );
      coreGrad.addColorStop(0.6, 'rgba(6, 14, 38, 0.94)');
      coreGrad.addColorStop(1, 'rgba(2, 6, 20, 0.99)');
      orbCtx.fillStyle = coreGrad;
      orbCtx.fillRect(cx - baseRadius, cy - baseRadius, baseRadius * 2, baseRadius * 2);

      // 3f. Multi-Band Iridescent Aurora Fluid Filaments
      orbCtx.globalCompositeOperation = 'screen';
      const ribbonCount = state === 'speaking' ? 5 : 4;
      const sat = state === 'disconnected' ? 16 : 96;
      const hues = [palette.hueA, palette.hueB, palette.hueC, palette.hueA + 18, palette.hueB - 14];
      for (let r = 0; r < ribbonCount; r += 1) {
        const speedMul =
          state === 'speaking'
            ? 1.2
            : state === 'listening'
              ? 0.92 + e * 0.45
              : state === 'thinking'
                ? 1.45
                : 0.45;
        const phase = t * speedMul * (0.68 + r * 0.15) + r * 1.48;
        const swell = 1 + e * (state === 'speaking' ? 0.36 : 0.24);
        const hue = hues[r % hues.length]!;

        const fillGrad = orbCtx.createRadialGradient(
          cx + Math.cos(phase) * baseRadius * 0.42,
          cy + Math.sin(phase * 0.92) * baseRadius * 0.42,
          baseRadius * 0.06,
          cx,
          cy,
          baseRadius * 1.06
        );
        fillGrad.addColorStop(
          0,
          `hsla(${hue}, ${sat}%, 84%, ${state === 'disconnected' ? 0.18 : 0.52 + e * 0.34})`
        );
        fillGrad.addColorStop(
          0.48,
          `hsla(${hue + 14}, ${sat}%, 58%, ${state === 'disconnected' ? 0.1 : 0.28 + e * 0.28})`
        );
        fillGrad.addColorStop(1, `hsla(${hue + 32}, ${sat}%, 50%, 0)`);

        orbCtx.beginPath();
        const steps = 64;
        for (let i = 0; i <= steps; i += 1) {
          const a = (i / steps) * Math.PI * 2;
          const harmonicAmp =
            state === 'speaking'
              ? 13 + e * 26
              : state === 'listening'
                ? 8 + e * 18
                : 6 + e * 9;
          const wave =
            Math.sin(a * (state === 'speaking' ? 3 : 2) + phase) * harmonicAmp +
            Math.cos(a * 4 - phase * 1.18) * (harmonicAmp * 0.46);
          const rx =
            baseRadius * (0.83 + 0.11 * Math.sin(phase + r)) * swell + wave * 0.36;
          const ry =
            baseRadius * (0.58 + 0.18 * Math.cos(phase * 0.8 + r)) * swell +
            wave * 0.28;
          const rot = phase * 0.38 + r * 0.85;
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

        orbCtx.strokeStyle = `hsla(${hue - 6}, ${sat}%, 84%, ${state === 'disconnected' ? 0.08 : 0.18 + e * 0.3})`;
        orbCtx.lineWidth = 1.4 + e * 1.6;
        orbCtx.stroke();
      }

      // 3g. Top-Left Crystal Glass Specular Sheen + Inner Caustic Rim
      const glassHighlight = orbCtx.createRadialGradient(
        cx - baseRadius * 0.36,
        cy - baseRadius * 0.38,
        2,
        cx - baseRadius * 0.3,
        cy - baseRadius * 0.32,
        baseRadius * 0.56
      );
      glassHighlight.addColorStop(0, 'rgba(255, 255, 255, 0.36)');
      glassHighlight.addColorStop(0.45, 'rgba(224, 242, 254, 0.1)');
      glassHighlight.addColorStop(1, 'rgba(255, 255, 255, 0)');
      orbCtx.fillStyle = glassHighlight;
      orbCtx.beginPath();
      orbCtx.arc(cx, cy, baseRadius, 0, Math.PI * 2);
      orbCtx.fill();

      const innerRim = orbCtx.createRadialGradient(
        cx - baseRadius * 0.14,
        cy - baseRadius * 0.14,
        baseRadius * 0.66,
        cx,
        cy,
        baseRadius
      );
      innerRim.addColorStop(0, 'rgba(56, 189, 248, 0)');
      innerRim.addColorStop(0.74, `${palette.glow} ${0.14 + e * 0.22})`);
      innerRim.addColorStop(
        0.95,
        state === 'disconnected'
          ? 'rgba(148, 163, 184, 0.22)'
          : `rgba(224, 248, 255, ${0.58 + e * 0.32})`
      );
      innerRim.addColorStop(1, 'rgba(186, 230, 253, 0.16)');
      orbCtx.fillStyle = innerRim;
      orbCtx.beginPath();
      orbCtx.arc(cx, cy, baseRadius, 0, Math.PI * 2);
      orbCtx.fill();
      orbCtx.restore();

      // 3h. Feathered Chromatic Rim
      orbCtx.globalCompositeOperation = 'screen';
      const rimGrad = orbCtx.createLinearGradient(
        cx - baseRadius,
        cy - baseRadius,
        cx + baseRadius,
        cy + baseRadius
      );
      rimGrad.addColorStop(0, 'rgba(224, 242, 254, 0.4)');
      rimGrad.addColorStop(0.45, `${palette.glow} 0.18)`);
      rimGrad.addColorStop(0.84, `${palette.halo} ${state === 'disconnected' ? 0.18 : 0.72})`);
      rimGrad.addColorStop(1, 'rgba(244, 114, 182, 0.36)');
      orbCtx.beginPath();
      orbCtx.arc(cx, cy, baseRadius, 0, Math.PI * 2);
      orbCtx.strokeStyle = rimGrad;
      orbCtx.lineWidth = 1.5 + e * 1.2;
      orbCtx.stroke();
      orbCtx.restore();

      // 4. Render Symmetrical 34-Bar Luminous Spectrum Ribbon below the Orb
      const waveCanvas = waveCanvasRef.current;
      if (waveCanvas) {
        const wCtx = waveCanvas.getContext('2d');
        if (wCtx) {
          const wWidth = 248;
          const wHeight = 40;
          if (waveCanvas.width !== wWidth * dpr || waveCanvas.height !== wHeight * dpr) {
            waveCanvas.width = wWidth * dpr;
            waveCanvas.height = wHeight * dpr;
          }
          wCtx.save();
          wCtx.scale(dpr, dpr);
          wCtx.clearRect(0, 0, wWidth, wHeight);

          const gap = wWidth / barCount;
          const barW = 2.6;
          const midY = wHeight / 2;
          const half = (barCount - 1) / 2;

          for (let i = 0; i < barCount; i += 1) {
            const symDist = Math.abs(i - half) / half;
            const envelope = 0.22 + 0.78 * Math.pow(1 - symDist, 1.35);

            let rawBar = 0.08;
            if (state === 'speaking') {
              const binIdx = Math.min(freqBuf.length - 1, Math.floor((1 - symDist) * 32) + 2);
              const specVal = activeAnalyser ? (freqBuf[binIdx]! / 255) * 1.2 : 0;
              const vocalHarmonic =
                0.22 +
                0.38 * Math.abs(Math.sin(t * 4.4 - symDist * 4.8)) +
                0.18 * Math.abs(Math.cos(t * 6.6 + i * 0.4));
              rawBar = Math.max(specVal, vocalHarmonic * (0.65 + e * 0.55));
            } else if (state === 'listening' && !cur.isMuted) {
              const binIdx = Math.min(freqBuf.length - 1, Math.floor((1 - symDist) * 34) + 1);
              const specVal = activeAnalyser ? (freqBuf[binIdx]! / 255) * 1.25 : 0;
              const idleBreath = 0.11 + 0.08 * (0.5 + 0.5 * Math.sin(t * 2.4 - symDist * 3.2));
              rawBar = Math.max(
                idleBreath,
                specVal,
                micLevelRef.current * (0.55 + 0.45 * Math.sin(t * 5.2 + i * 0.45))
              );
            } else if (state === 'thinking') {
              rawBar = 0.16 + 0.24 * (0.5 + 0.5 * Math.sin(t * 3.8 - i * 0.36));
            } else if (state === 'connecting' || state === 'reconnecting') {
              rawBar = 0.12 + 0.16 * (0.5 + 0.5 * Math.sin(t * 2.2 - i * 0.32));
            } else {
              rawBar = 0.06;
            }

            const targetH = Math.max(3, Math.min(wHeight - 4, (3.5 + rawBar * 32) * envelope));
            smoothBars[i] = smoothBars[i]! + (targetH - smoothBars[i]!) * 0.28;

            const h = smoothBars[i]!;
            const x = i * gap + (gap - barW) / 2;
            const y = midY - h / 2;

            wCtx.fillStyle =
              state === 'speaking'
                ? `rgba(192, 132, 252, ${0.42 + envelope * 0.55})`
                : state === 'listening'
                  ? cur.isMuted
                    ? 'rgba(148, 163, 184, 0.26)'
                    : `rgba(52, 211, 153, ${0.34 + envelope * 0.6})`
                  : state === 'reconnecting'
                    ? `rgba(251, 191, 36, ${0.38 + envelope * 0.46})`
                    : state === 'disconnected'
                      ? 'rgba(100, 116, 139, 0.28)'
                      : `rgba(125, 211, 252, ${0.36 + envelope * 0.5})`;

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
            ? 0.044
            : state === 'listening'
              ? 0.036
              : state === 'thinking'
                ? 0.034
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
          ? 'বাংলা বা ইংরেজিতে স্বাভাবিকভাবে বলুন'
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
    (isUserVoicing || Boolean(liveCaption.trim()));

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
      if (turnHadRealSpeechRef.current || recognitionLiveTextRef.current.trim()) {
        void commitActiveUtterance(true);
      } else {
        // Wake recognition silently if it timed out during idle
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
          ? 'bg-emerald-400'
          : 'bg-cyan-400'
      : voiceState === 'speaking'
        ? 'bg-violet-400'
        : voiceState === 'thinking'
          ? 'bg-indigo-400'
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
      {/* Ambient Horizon Aurora Layer */}
      <div className="live-voice-aurora-horizon pointer-events-none" aria-hidden="true" />

      {/* Top Bar: Clean 3-zone spatial header (zero overlap on 360px-390px mobile) */}
      <header className="relative z-10 w-full max-w-3xl mx-auto flex items-center justify-between gap-2 px-4 sm:px-6 pt-[max(1.1rem,env(safe-area-inset-top))] pb-2">
        <div className="flex items-center gap-2 min-w-0 shrink">
          <div className="flex flex-col min-w-0">
            <span className="text-[13.5px] font-semibold tracking-tight text-white/95 leading-tight truncate">
              SMFTA Voice
            </span>
            <div className="flex items-center gap-1.5 mt-0.5 text-[11.5px] text-slate-300/80 whitespace-nowrap">
              <span
                className={`w-1.5 h-1.5 rounded-full shrink-0 ${stateDotColor}`}
                aria-hidden="true"
              />
              <span data-testid="live-voice-status-label" className="font-medium">
                {voiceState === 'listening' && isMuted ? 'Muted' : activeCopy.label}
              </span>
              <span className="text-white/25" aria-hidden="true">
                ·
              </span>
              <span className="font-mono text-[11px] tabular-nums text-slate-300/70">
                {formattedTime}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <label className="live-voice-select-wrap relative inline-flex items-center h-11 px-3 rounded-full bg-white/[0.06] hover:bg-white/[0.11] transition-colors cursor-pointer">
            <Volume2 className="w-3.5 h-3.5 text-cyan-300/90 mr-1.5 shrink-0 pointer-events-none" />
            <select
              aria-label="Voice persona"
              data-testid="live-voice-persona-select"
              value={selectedVoice}
              onChange={(e) =>
                setSelectedVoice(e.target.value as GeminiFemaleVoiceName)
              }
              className="live-voice-select appearance-none bg-transparent pr-5 text-[12px] sm:text-[12.5px] font-medium text-white/90 cursor-pointer max-w-[116px] sm:max-w-[160px] truncate"
            >
              {VOICE_OPTIONS.map((v) => (
                <option key={v.id} value={v.id} className="bg-slate-950 text-white">
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
            title="Exit Voice Mode"
            className="live-voice-control w-11 h-11 rounded-full inline-flex items-center justify-center bg-white/[0.06] hover:bg-white/[0.14] text-white/85 hover:text-white transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Center Stage: Signature Cosmic Crystal Orb + Symmetrical Luminous Spectrum + Live Captions */}
      <main className="relative z-10 flex-1 min-h-0 flex flex-col items-center justify-center text-center w-full max-w-xl mx-auto px-5 py-1">
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
            className="w-[244px] h-[244px] sm:w-[292px] sm:h-[292px] block"
            aria-hidden="true"
          />
        </button>

        {/* Symmetrical 34-Bar Luminous Acoustic Spectrum */}
        <div className="mt-0.5 mb-2.5 flex items-center justify-center h-10">
          <canvas
            ref={waveCanvasRef}
            data-testid="live-voice-waveform-canvas"
            className="w-[248px] h-[40px] block"
            aria-label="Live audio waveform"
          />
        </div>

        {/* Crisp State Headline & Bilingual Micro-Guidance */}
        <div className="space-y-1 max-w-md px-2">
          <h2
            data-testid="live-voice-headline"
            className="text-[24px] sm:text-[29px] font-semibold tracking-tight text-white leading-tight"
          >
            {effectiveHeadline}
          </h2>
          <p className="text-[13.5px] font-normal text-slate-300/75 leading-snug">
            {effectiveHint}
          </p>
        </div>

        {/* Compact Borderless Live Transcript (never exposes <think> reasoning) */}
        {(cleanUserTranscript || cleanAiTranscript) && (
          <div
            data-testid="live-voice-transcript-box"
            className="live-voice-transcript mt-4 w-full max-w-md px-2 py-1 text-center space-y-2 max-h-[118px] overflow-y-auto"
          >
            {cleanUserTranscript && (
              <p className="text-[13.5px] text-cyan-200/90 leading-relaxed line-clamp-2">
                {cleanUserTranscript}
              </p>
            )}
            {cleanAiTranscript && (
              <p className="text-[14px] text-white/92 font-normal leading-relaxed line-clamp-3">
                {cleanAiTranscript}
              </p>
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
            className="live-voice-control mt-3 inline-flex items-center gap-2 rounded-full bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-semibold px-5 h-11 text-[13px] cursor-pointer transition-colors"
          >
            <Volume2 className="w-4 h-4" />
            <span>Tap to enable voice audio</span>
          </button>
        )}

        {statusNotice && (
          <p
            data-testid="live-voice-status-notice"
            role="status"
            className="mt-3 max-w-sm text-[12.5px] text-amber-200/90 leading-snug"
          >
            {statusNotice}
          </p>
        )}
      </main>

      {/* Bottom Elevated Glassmorphic Thumb Dock */}
      <footer className="relative z-10 w-full max-w-md mx-auto px-4 pt-2 pb-[max(1.4rem,env(safe-area-inset-bottom))] flex flex-col items-center gap-3">
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

        <div className="live-voice-dock inline-flex items-center justify-center gap-2.5 sm:gap-3.5 px-3 py-2 rounded-full">
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
                  ? 'bg-emerald-400/25 text-emerald-200 ring-2 ring-emerald-400/70'
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
