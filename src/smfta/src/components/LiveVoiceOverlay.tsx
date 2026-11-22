import React, { useEffect, useRef, useState } from 'react';
import { ArrowUp, Mic, RefreshCw, Volume2, X } from 'lucide-react';
import {
  base64ToUint8Array,
  bilingualSpeechPlayer,
  extractReadySpeechChunks,
  formatTextForNaturalSpeech,
  GeminiFemaleVoiceName,
  isSpeechSynthesisSupported,
  requestGeminiFemaleSpeech,
  streamGeminiPcmSpeech,
} from '../utils/voiceEngine';

export interface LiveVoiceMessageSnapshot {
  id: string;
  text: string;
  isError?: boolean;
}

export interface LiveVoiceOverlayProps {
  isOpen: boolean;
  userName?: string;
  isListening: boolean;
  isGenerating: boolean;
  isTranscribing?: boolean;
  liveTranscript?: string;
  micStream?: MediaStream | null;
  lastUserText: string;
  lastAiMessage: LiveVoiceMessageSnapshot | null;
  onToggleMic: () => void;
  onCancelMic?: () => void;
  onSendText: (text: string) => void;
  onEndCall: () => void;
}

const VOICE_OPTIONS: Array<{ id: GeminiFemaleVoiceName; label: string }> = [
  { id: 'Kore', label: 'Kore · Natural Female' },
  { id: 'Zephyr', label: 'Zephyr · Bright Female' },
  { id: 'Puck', label: 'Puck · Warm Male' },
  { id: 'Charon', label: 'Charon · Deep Male' },
  { id: 'Fenrir', label: 'Fenrir · Crisp Male' },
];

let sharedLiveAudioCtx: AudioContext | null = null;

/**
 * Call synchronously inside user click/tap handlers so mobile Chrome & iOS Safari
 * unlock Web Audio before async Gemini TTS payloads arrive.
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

export const LiveVoiceOverlay: React.FC<LiveVoiceOverlayProps> = ({
  isOpen,
  userName,
  isListening,
  isGenerating,
  isTranscribing = false,
  liveTranscript = '',
  micStream = null,
  lastUserText,
  lastAiMessage,
  onToggleMic,
  onCancelMic,
  onSendText,
  onEndCall,
}) => {
  const [selectedVoice, setSelectedVoice] = useState<GeminiFemaleVoiceName>('Kore');
  const [continuousLoop, setContinuousLoop] = useState(true);
  const [draftText, setDraftText] = useState('');
  const [seconds, setSeconds] = useState(0);
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const [isSynthesizingVoice, setIsSynthesizingVoice] = useState(false);
  const [integrationNotice, setIntegrationNotice] = useState<string | null>(null);
  const [needsTapToPlay, setNeedsTapToPlay] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const playbackSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const playbackAnalyserRef = useRef<AnalyserNode | null>(null);
  const nextPlayTimeRef = useRef<number>(0);
  const pendingAudioBufferRef = useRef<AudioBuffer | null>(null);
  const micAnalyserRef = useRef<AnalyserNode | null>(null);
  const micSourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const ttsAbortRef = useRef<AbortController | null>(null);
  const pendingChunksRef = useRef<string[]>([]);
  const pipelineBusyRef = useRef<boolean>(false);
  const spokenCursorRef = useRef<number>(0);
  const activeTurnMsgIdRef = useRef<string | null>(null);
  const useBrowserTtsForTurnRef = useRef<boolean>(false);
  const autoListenTimerRef = useRef<number | null>(null);

  const energyRef = useRef(0);
  const modeRef = useRef<'idle' | 'listening' | 'thinking' | 'speaking'>('idle');
  const spokenMsgIdRef = useRef<string | null>(null);
  const openedSessionAtRef = useRef<number>(0);

  // Keep refs updated cleanly without restarting the 60fps canvas loop
  const propsRef = useRef({
    isListening,
    isGenerating,
    isAiSpeaking,
    isSynthesizingVoice,
    continuousLoop,
    selectedVoice,
    onToggleMic,
  });
  propsRef.current = {
    isListening,
    isGenerating,
    isAiSpeaking,
    isSynthesizingVoice,
    continuousLoop,
    selectedVoice,
    onToggleMic,
  };

  useEffect(() => {
    modeRef.current = isAiSpeaking
      ? 'speaking'
      : isListening
        ? 'listening'
        : isGenerating || isSynthesizingVoice
          ? 'thinking'
          : 'idle';
  }, [isAiSpeaking, isListening, isGenerating, isSynthesizingVoice]);

  const ensureAudioContext = (): AudioContext | null => {
    const ctx = unlockSharedLiveAudioContext();
    audioCtxRef.current = ctx;
    return ctx;
  };

  const ensurePlaybackAnalyser = (ctx: AudioContext): AnalyserNode => {
    if (playbackAnalyserRef.current && playbackAnalyserRef.current.context === ctx) {
      return playbackAnalyserRef.current;
    }
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 128;
    analyser.smoothingTimeConstant = 0.72;
    analyser.connect(ctx.destination);
    playbackAnalyserRef.current = analyser;
    return analyser;
  };

  const stopAiSpeechPlayback = () => {
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
  };

  // Call timer + clean open/close lifecycle
  useEffect(() => {
    if (!isOpen) {
      setSeconds(0);
      setDraftText('');
      setIntegrationNotice(null);
      activeTurnMsgIdRef.current = null;
      spokenCursorRef.current = 0;
      stopAiSpeechPlayback();
      return;
    }
    openedSessionAtRef.current = Date.now();
    // Mark whatever AI message already existed before opening Live Voice so it does not auto-replay old history
    spokenMsgIdRef.current = lastAiMessage?.id || null;
    activeTurnMsgIdRef.current = lastAiMessage?.id || null;
    spokenCursorRef.current = lastAiMessage?.text ? lastAiMessage.text.length : 0;
    const timer = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => {
      window.clearInterval(timer);
    };
  }, [isOpen]);

  // Cleanup active playback on unmount (preserve sharedLiveAudioCtx for instant reopen)
  useEffect(() => {
    return () => {
      stopAiSpeechPlayback();
      if (micSourceNodeRef.current) {
        try {
          micSourceNodeRef.current.disconnect();
        } catch {
          // Ignore disconnect errors
        }
        micSourceNodeRef.current = null;
      }
    };
  }, []);

  // Connect live microphone stream to AnalyserNode so user's speech animates the orb
  useEffect(() => {
    if (!isOpen || !micStream) {
      micAnalyserRef.current = null;
      if (micSourceNodeRef.current) {
        try {
          micSourceNodeRef.current.disconnect();
        } catch {
          // Ignore disconnect errors
        }
        micSourceNodeRef.current = null;
      }
      return;
    }
    const ctx = ensureAudioContext();
    if (!ctx) return;
    try {
      const src = ctx.createMediaStreamSource(micStream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 128;
      analyser.smoothingTimeConstant = 0.72;
      src.connect(analyser);
      micSourceNodeRef.current = src;
      micAnalyserRef.current = analyser;
    } catch {
      micAnalyserRef.current = null;
    }
    return () => {
      micAnalyserRef.current = null;
      if (micSourceNodeRef.current) {
        try {
          micSourceNodeRef.current.disconnect();
        } catch {
          // Ignore disconnect errors
        }
        micSourceNodeRef.current = null;
      }
    };
  }, [isOpen, micStream]);

  const maybeFinishTurnAndAutoListen = (ctrl?: AbortController | null) => {
    if (ctrl?.signal.aborted) return;
    if (pipelineBusyRef.current) return;
    if (pendingChunksRef.current.length > 0) return;
    if (activeSourcesRef.current.size > 0) return;
    if (propsRef.current.isGenerating) return;

    setIsSynthesizingVoice(false);
    setIsAiSpeaking(false);

    if (
      propsRef.current.continuousLoop &&
      !propsRef.current.isListening &&
      !propsRef.current.isGenerating
    ) {
      if (autoListenTimerRef.current !== null) {
        window.clearTimeout(autoListenTimerRef.current);
      }
      autoListenTimerRef.current = window.setTimeout(() => {
        autoListenTimerRef.current = null;
        if (!ctrl?.signal.aborted && !propsRef.current.isListening && !propsRef.current.isGenerating) {
          propsRef.current.onToggleMic();
        }
      }, 260);
    }
  };

  const schedulePcmSamples = (
    ctx: AudioContext,
    samples: Float32Array,
    sampleRate: number,
    ctrl: AbortController
  ) => {
    if (ctrl.signal.aborted || samples.length === 0) return;

    const now = ctx.currentTime;
    const isFreshStart =
      activeSourcesRef.current.size === 0 || nextPlayTimeRef.current <= now + 0.008;

    // Apply a gentle 3ms fade-in only when starting/resuming after silence to prevent clicks
    let renderSamples = samples;
    if (isFreshStart && samples.length > 64) {
      renderSamples = new Float32Array(samples);
      const fadeInLen = Math.min(Math.round(sampleRate * 0.003), Math.floor(renderSamples.length / 4));
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

    // 90ms initial jitter cushion prevents micro-stuttering while keeping first audio crisp
    const startAt = isFreshStart
      ? Math.max(now + 0.09, nextPlayTimeRef.current)
      : nextPlayTimeRef.current;
    nextPlayTimeRef.current = startAt + audioBuffer.duration;

    activeSourcesRef.current.add(source);
    playbackSourceRef.current = source;
    setIsSynthesizingVoice(false);
    setIsAiSpeaking(true);

    source.onended = () => {
      activeSourcesRef.current.delete(source);
      if (playbackSourceRef.current === source) {
        playbackSourceRef.current = null;
      }
      maybeFinishTurnAndAutoListen(ctrl);
    };

    source.start(startAt);
  };

  const startDecodedBufferPlayback = (
    ctx: AudioContext,
    audioBuffer: AudioBuffer,
    ctrl?: AbortController | null
  ) => {
    const analyser = ensurePlaybackAnalyser(ctx);
    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(analyser);

    const startAt = Math.max(ctx.currentTime + 0.02, nextPlayTimeRef.current);
    nextPlayTimeRef.current = startAt + audioBuffer.duration;

    activeSourcesRef.current.add(source);
    playbackSourceRef.current = source;
    pendingAudioBufferRef.current = null;
    setNeedsTapToPlay(false);
    setIsSynthesizingVoice(false);
    setIsAiSpeaking(true);

    source.onended = () => {
      activeSourcesRef.current.delete(source);
      if (playbackSourceRef.current === source) {
        playbackSourceRef.current = null;
      }
      maybeFinishTurnAndAutoListen(ctrl);
    };

    source.start(startAt);
  };

  const speakSentenceViaBrowser = (
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
    });

  const drainSpeechPipeline = async (msgId: string) => {
    if (pipelineBusyRef.current) return;
    const ctrl = ttsAbortRef.current;
    if (!ctrl || ctrl.signal.aborted) return;

    pipelineBusyRef.current = true;
    try {
      while (pendingChunksRef.current.length > 0 && !ctrl.signal.aborted) {
        const sentence = pendingChunksRef.current.shift();
        if (!sentence) continue;

        const voice = propsRef.current.selectedVoice;
        const isMaleVoice =
          voice === 'Puck' || voice === 'Charon' || voice === 'Fenrir';
        const voiceStyle = isMaleVoice
          ? 'Crystal clear, natural, warm human male conversational voice with crisp word articulation, accurate Bengali and English pronunciation, steady comfortable pace, never rushed or robotic'
          : 'Crystal clear, natural, warm human female conversational voice with crisp word articulation, accurate Bengali and English pronunciation, steady comfortable pace, never rushed or robotic';

        if (useBrowserTtsForTurnRef.current) {
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
            // Will check suspended state below
          }
        }
        if (ctrl.signal.aborted) break;

        // Primary low-latency path: streaming 24kHz PCM chunk-by-chunk
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
            // Add a subtle 110ms natural breath pause between consecutive sentences
            if (pendingChunksRef.current.length > 0 && nextPlayTimeRef.current > ctx.currentTime) {
              nextPlayTimeRef.current += 0.11;
            }
            continue;
          }
          if (streamRes.integrationRequired) {
            useBrowserTtsForTurnRef.current = true;
            if (isSpeechSynthesisSupported()) {
              await speakSentenceViaBrowser(sentence, msgId, isMaleVoice, voice, ctrl);
              continue;
            }
          }
        }

        // Secondary fallback: unary WAV endpoint or instant browser speech
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
          if (res.integrationRequired) {
            setIntegrationNotice(
              res.error ||
                'Integration required: Server GEMINI_API_KEY is needed for Gemini natural voice.'
            );
          } else if (res.error && !/abort/i.test(res.error)) {
            setIntegrationNotice(res.error);
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
        } catch (err) {
          useBrowserTtsForTurnRef.current = true;
          if (isSpeechSynthesisSupported()) {
            await speakSentenceViaBrowser(sentence, msgId, isMaleVoice, voice, ctrl);
          } else {
            setIntegrationNotice(
              err instanceof Error ? err.message : 'Could not play voice audio response.'
            );
          }
        }
      }
    } finally {
      pipelineBusyRef.current = false;
      if (pendingChunksRef.current.length > 0 && ttsAbortRef.current && !ttsAbortRef.current.signal.aborted) {
        void drainSpeechPipeline(msgId);
      } else {
        maybeFinishTurnAndAutoListen(ctrl);
      }
    }
  };

  // Real-time streaming sentence pipeline: begins speaking as soon as the FIRST sentence streams in!
  useEffect(() => {
    if (!isOpen) return;
    if (!lastAiMessage || !lastAiMessage.id) return;

    // Ignore historical message that already existed before Live Voice opened
    if (spokenMsgIdRef.current === lastAiMessage.id && activeTurnMsgIdRef.current === lastAiMessage.id && spokenCursorRef.current >= (lastAiMessage.text?.length || 0)) {
      return;
    }

    // New AI turn detected — initialize streaming pipeline immediately
    if (activeTurnMsgIdRef.current !== lastAiMessage.id) {
      activeTurnMsgIdRef.current = lastAiMessage.id;
      spokenMsgIdRef.current = lastAiMessage.id;
      spokenCursorRef.current = 0;
      useBrowserTtsForTurnRef.current = false;
      stopAiSpeechPlayback();
      setIntegrationNotice(null);

      if (lastAiMessage.isError) {
        const errClean = formatTextForNaturalSpeech(lastAiMessage.text, 220);
        if (errClean) setIntegrationNotice(errClean);
        spokenCursorRef.current = lastAiMessage.text.length;
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
      maybeFinishTurnAndAutoListen(ttsAbortRef.current);
    }
  }, [isOpen, isGenerating, lastAiMessage?.id, lastAiMessage?.text, lastAiMessage?.isError]);

  // Glowing Iridescent Blue Fluid Orb Canvas Renderer (60fps, matches reference aesthetic)
  useEffect(() => {
    if (!isOpen) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    let rafId = 0;
    let t = 0;
    const freqBuf = new Uint8Array(64);

    const sampleEnergy = (): number => {
      const analyser =
        modeRef.current === 'speaking'
          ? playbackAnalyserRef.current
          : modeRef.current === 'listening'
            ? micAnalyserRef.current
            : null;
      if (!analyser) {
        if (modeRef.current === 'thinking') {
          return 0.24 + 0.12 * Math.sin(t * 2.6);
        }
        return 0.08 + 0.04 * Math.sin(t * 1.4);
      }
      analyser.getByteFrequencyData(freqBuf);
      let sum = 0;
      const bins = Math.min(32, freqBuf.length);
      for (let i = 0; i < bins; i += 1) {
        sum += freqBuf[i]!;
      }
      const avg = sum / (bins * 255);
      return Math.min(1, avg * 2.4);
    };

    const drawOrb = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const size = 252;
      if (canvas.width !== size * dpr || canvas.height !== size * dpr) {
        canvas.width = size * dpr;
        canvas.height = size * dpr;
      }

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, size, size);

      const targetEnergy = sampleEnergy();
      energyRef.current += (targetEnergy - energyRef.current) * 0.18;
      const e = energyRef.current;
      const mode = modeRef.current;

      const cx = size / 2;
      const cy = size / 2;
      const baseRadius = 74 + e * 14;

      // 1. Ambient outer cobalt aura
      const haloGrad = ctx.createRadialGradient(
        cx + baseRadius * 0.12,
        cy + baseRadius * 0.08,
        baseRadius * 0.25,
        cx,
        cy,
        baseRadius * 1.65
      );
      haloGrad.addColorStop(
        0,
        mode === 'listening'
          ? `rgba(56, 189, 248, ${0.34 + e * 0.28})`
          : mode === 'speaking'
            ? `rgba(96, 165, 250, ${0.42 + e * 0.32})`
            : `rgba(37, 99, 235, ${0.26 + e * 0.2})`
      );
      haloGrad.addColorStop(0.5, 'rgba(29, 78, 216, 0.16)');
      haloGrad.addColorStop(1, 'rgba(2, 5, 14, 0)');
      ctx.fillStyle = haloGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, baseRadius * 1.65, 0, Math.PI * 2);
      ctx.fill();

      // 2. Deep translucent glass sphere base
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, baseRadius, 0, Math.PI * 2);
      ctx.clip();

      const coreGrad = ctx.createRadialGradient(
        cx - baseRadius * 0.3,
        cy - baseRadius * 0.25,
        4,
        cx + baseRadius * 0.15,
        cy + baseRadius * 0.15,
        baseRadius * 1.1
      );
      coreGrad.addColorStop(0, 'rgba(12, 34, 88, 0.65)');
      coreGrad.addColorStop(0.62, 'rgba(4, 14, 42, 0.88)');
      coreGrad.addColorStop(1, 'rgba(2, 8, 28, 0.96)');
      ctx.fillStyle = coreGrad;
      ctx.fillRect(cx - baseRadius, cy - baseRadius, baseRadius * 2, baseRadius * 2);

      // 3. Silky sweeping iridescent fluid ribbons (layered filled crescents + soft glow)
      ctx.globalCompositeOperation = 'screen';
      const ribbonCount = 4;
      for (let r = 0; r < ribbonCount; r += 1) {
        const phase = t * (0.72 + r * 0.16) + r * 1.55;
        const swell = 1 + e * 0.24;
        const hue =
          mode === 'listening'
            ? 194 + r * 12
            : mode === 'speaking'
              ? 204 + r * 14
              : 210 + r * 12;

        const fillGrad = ctx.createRadialGradient(
          cx + Math.cos(phase) * baseRadius * 0.42,
          cy + Math.sin(phase * 0.9) * baseRadius * 0.42,
          baseRadius * 0.08,
          cx,
          cy,
          baseRadius * 1.05
        );
        fillGrad.addColorStop(0, `hsla(${hue - 10}, 100%, 84%, ${0.52 + e * 0.32})`);
        fillGrad.addColorStop(0.45, `hsla(${hue + 14}, 94%, 60%, ${0.28 + e * 0.26})`);
        fillGrad.addColorStop(1, `hsla(${hue + 42}, 86%, 54%, 0)`);

        ctx.beginPath();
        const steps = 64;
        for (let i = 0; i <= steps; i += 1) {
          const a = (i / steps) * Math.PI * 2;
          const wave =
            Math.sin(a * 2 + phase) * (9 + e * 18) +
            Math.cos(a * 3 - phase * 1.15) * (5 + e * 10);
          const rx = baseRadius * (0.86 + 0.1 * Math.sin(phase + r)) * swell + wave * 0.36;
          const ry = baseRadius * (0.56 + 0.18 * Math.cos(phase * 0.8 + r)) * swell + wave * 0.28;
          const rot = phase * 0.34 + r * 0.78;
          const px = Math.cos(a) * rx;
          const py = Math.sin(a) * ry;
          const x = cx + px * Math.cos(rot) - py * Math.sin(rot);
          const y = cy + px * Math.sin(rot) + py * Math.cos(rot);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fillStyle = fillGrad;
        ctx.fill();

        ctx.strokeStyle = `hsla(${hue - 8}, 98%, 80%, ${0.18 + e * 0.26})`;
        ctx.lineWidth = 1.6 + e * 1.8;
        ctx.stroke();
      }

      // 4. Inner bright crescent rim light (upper-top & right-bottom specular sheen)
      const innerRim = ctx.createRadialGradient(
        cx - baseRadius * 0.15,
        cy - baseRadius * 0.12,
        baseRadius * 0.68,
        cx,
        cy,
        baseRadius
      );
      innerRim.addColorStop(0, 'rgba(56, 189, 248, 0)');
      innerRim.addColorStop(0.72, `rgba(96, 165, 250, ${0.14 + e * 0.22})`);
      innerRim.addColorStop(0.94, `rgba(191, 232, 255, ${0.58 + e * 0.3})`);
      innerRim.addColorStop(1, 'rgba(147, 197, 253, 0.2)');
      ctx.fillStyle = innerRim;
      ctx.beginPath();
      ctx.arc(cx, cy, baseRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // 5. Soft feathered outer glow edge (no harsh wireframe border)
      ctx.globalCompositeOperation = 'screen';
      const rimGrad = ctx.createLinearGradient(
        cx - baseRadius,
        cy - baseRadius,
        cx + baseRadius,
        cy + baseRadius
      );
      rimGrad.addColorStop(0, 'rgba(147, 197, 253, 0.32)');
      rimGrad.addColorStop(0.42, 'rgba(56, 189, 248, 0.14)');
      rimGrad.addColorStop(0.78, `rgba(186, 230, 253, ${0.72 + e * 0.25})`);
      rimGrad.addColorStop(1, 'rgba(167, 139, 250, 0.45)');
      ctx.beginPath();
      ctx.arc(cx, cy, baseRadius, 0, Math.PI * 2);
      ctx.strokeStyle = rimGrad;
      ctx.lineWidth = 1.6 + e * 1.2;
      ctx.stroke();

      ctx.restore();

      if (!reducedMotion) {
        t += mode === 'speaking' || mode === 'listening' ? 0.042 : 0.022;
        rafId = window.requestAnimationFrame(drawOrb);
      }
    };

    drawOrb();
    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const formattedTime =
    String(Math.floor(seconds / 60)).padStart(2, '0') +
    ':' +
    String(seconds % 60).padStart(2, '0');

  const cleanName = (userName || '').trim();
  const displayStatusText = isAiSpeaking
    ? 'Speaking...'
    : isSynthesizingVoice
      ? 'Preparing voice...'
      : isGenerating
        ? 'Thinking...'
        : isTranscribing
          ? 'Understanding your voice...'
          : isListening
            ? 'Listening — speak now'
            : 'How can I help you today?';

  const handleSubmitDraft = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = draftText.trim();
    if (!clean) return;
    ensureAudioContext();
    stopAiSpeechPlayback();
    setDraftText('');
    onSendText(clean);
  };

  const handleMicOrWaveClick = () => {
    ensureAudioContext();
    if (isAiSpeaking || isSynthesizingVoice) {
      stopAiSpeechPlayback();
    }
    onToggleMic();
  };

  const activeTranscriptPreview =
    (isListening && liveTranscript.trim()) ||
    (!isAiSpeaking && !isListening && lastUserText ? '' : '');

  return (
    <div
      data-testid="voice-call-overlay"
      className="live-voice-backdrop fixed inset-0 z-50 text-white flex flex-col justify-between px-4 py-5 sm:px-8 sm:py-7 select-none overflow-hidden"
    >
      {/* Top Minimal Bar */}
      <div className="relative z-10 w-full max-w-2xl mx-auto flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.06] border border-white/10 text-[11.5px] font-medium text-sky-100/90 backdrop-blur-md">
            <Volume2 className="w-3.5 h-3.5 text-sky-300 shrink-0" />
            <select
              aria-label="Gemini Female Voice"
              data-testid="live-voice-persona-select"
              value={selectedVoice}
              onChange={(e) =>
                setSelectedVoice(e.target.value as GeminiFemaleVoiceName)
              }
              className="bg-transparent outline-none cursor-pointer text-sky-100 font-medium"
            >
              {VOICE_OPTIONS.map((v) => (
                <option key={v.id} value={v.id} className="bg-slate-900 text-white">
                  {v.label}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            data-testid="live-voice-loop-toggle"
            onClick={() => setContinuousLoop((v) => !v)}
            title="Auto-listen after AI finishes speaking"
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border text-[11px] font-medium cursor-pointer transition-colors backdrop-blur-md ${
              continuousLoop
                ? 'bg-sky-500/20 border-sky-400/40 text-sky-200'
                : 'bg-white/[0.05] border-white/10 text-slate-300 hover:text-white'
            }`}
          >
            <RefreshCw className="w-3 h-3" />
            <span>{continuousLoop ? 'Auto Loop' : 'Push to Talk'}</span>
          </button>

          <span className="hidden sm:inline-block font-mono text-[11px] text-sky-200/60 ml-1">
            {formattedTime}
          </span>
        </div>

        <button
          type="button"
          data-testid="live-voice-close-btn"
          onClick={() => {
            stopAiSpeechPlayback();
            onCancelMic?.();
            onEndCall();
          }}
          aria-label="End voice conversation"
          title="End voice conversation"
          className="w-10 h-10 rounded-full inline-flex items-center justify-center bg-white/[0.08] hover:bg-white/[0.16] border border-white/15 text-white cursor-pointer transition-colors backdrop-blur-md shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Center Animated Glowing Blue Orb + Greeting */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center text-center max-w-lg mx-auto w-full py-2">
        <div className="relative flex items-center justify-center mb-4">
          <canvas
            ref={canvasRef}
            data-testid="live-voice-orb-canvas"
            className="w-[216px] h-[216px] sm:w-[244px] sm:h-[244px]"
            aria-label="Live AI voice fluid orb"
          />
        </div>

        <div className="space-y-1.5 px-2">
          <p className="text-[14px] sm:text-[15px] font-normal text-sky-100/65 tracking-tight">
            {cleanName ? `Hello ${cleanName}` : 'Hello'}
          </p>
          <h2
            data-testid="live-voice-headline"
            className="text-[26px] sm:text-[31px] font-semibold tracking-tight text-white leading-[1.18]"
          >
            {displayStatusText}
          </h2>
        </div>

        {/* Live Spoken Transcript / AI Reply Snippet */}
        {(activeTranscriptPreview || lastAiMessage?.text || (isListening && liveTranscript)) && (
          <div
            data-testid="live-voice-transcript-box"
            className="mt-5 w-full max-w-md rounded-2xl bg-slate-950/45 border border-sky-300/15 backdrop-blur-md px-4 py-3 text-left text-[12.5px] space-y-1.5 max-h-[120px] overflow-y-auto"
          >
            {(liveTranscript || lastUserText) && (
              <p className="text-sky-200/85 leading-relaxed">
                <span className="font-semibold text-sky-300">You: </span>
                {(liveTranscript || lastUserText).slice(-180)}
              </p>
            )}
            {lastAiMessage?.text && (
              <p className="text-white/90 leading-relaxed">
                <span className="font-semibold text-indigo-300">{selectedVoice}: </span>
                {formatTextForNaturalSpeech(lastAiMessage.text, 240)}
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
            className="mt-3 inline-flex items-center gap-2 rounded-full bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold px-4 py-2 text-[12.5px] shadow-lg cursor-pointer transition-colors"
          >
            <Volume2 className="w-4 h-4" />
            <span>Tap to play voice reply</span>
          </button>
        )}

        {integrationNotice && (
          <div
            data-testid="live-voice-integration-notice"
            className="mt-3 max-w-md rounded-xl bg-amber-500/15 border border-amber-400/35 px-3.5 py-2 text-[12px] text-amber-200"
          >
            {integrationNotice}
          </div>
        )}
      </div>

      {/* Bottom Frosted Luminous Blue Pill ("Ask anything..." + Waveform / Mic) */}
      <div className="relative z-10 w-full max-w-md mx-auto pb-1">
        <form
          onSubmit={handleSubmitDraft}
          className="live-voice-pill flex items-center gap-2 pl-5 pr-2.5 h-[58px] rounded-full"
        >
          <input
            type="text"
            data-testid="live-voice-input"
            value={draftText}
            onChange={(e) => setDraftText(e.target.value)}
            placeholder="Ask anything..."
            className="flex-1 min-w-0 bg-transparent border-none outline-none text-[15px] font-normal text-white placeholder:text-white/75"
          />

          {draftText.trim() ? (
            <button
              type="submit"
              data-testid="live-voice-send-btn"
              aria-label="Send message"
              className="w-10 h-10 rounded-full bg-white text-slate-950 inline-flex items-center justify-center hover:bg-sky-50 transition-colors cursor-pointer shrink-0 shadow-sm"
            >
              <ArrowUp className="w-4 h-4 stroke-[2.4]" />
            </button>
          ) : (
            <button
              type="button"
              data-testid="live-voice-mic-btn"
              onClick={handleMicOrWaveClick}
              aria-label={isListening ? 'Stop listening and send' : 'Start speaking'}
              title={isListening ? 'Tap to finish speaking' : 'Tap to speak'}
              className={`w-11 h-11 rounded-full inline-flex items-center justify-center cursor-pointer transition-all shrink-0 ${
                isListening
                  ? 'bg-white text-slate-950 shadow-lg scale-105'
                  : 'bg-transparent hover:bg-white/15 text-white'
              }`}
            >
              {isListening ? (
                <Mic className="w-4 h-4 animate-pulse" />
              ) : (
                <span className="live-voice-wave-bars" aria-hidden="true">
                  <span className="wbar wbar-1" />
                  <span className="wbar wbar-2" />
                  <span className="wbar wbar-3" />
                  <span className="wbar wbar-4" />
                  <span className="wbar wbar-5" />
                </span>
              )}
            </button>
          )}
        </form>
      </div>
    </div>
  );
};
