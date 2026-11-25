import React, { useEffect, useRef, useState } from 'react';
import { Check, Loader2, Mic, X } from 'lucide-react';
import {
  WAVEFORM_BAR_COUNT,
  WAVEFORM_IDLE_LEVEL,
  computeVoiceEnergy,
  shiftWaveformHistory,
} from '../utils/voiceWaveform';

interface VoiceWaveformBarProps {
  isListening: boolean;
  isTranscribing?: boolean;
  speechActivityAt?: number;
  liveText?: string;
  audioStream?: MediaStream | null;
  onCancel: () => void;
  onConfirm: () => void;
}

export const VoiceWaveformBar: React.FC<VoiceWaveformBarProps> = ({
  isListening,
  isTranscribing = false,
  liveText = '',
  audioStream = null,
  onCancel,
  onConfirm,
}) => {
  const hasLiveMic = Boolean(
    audioStream &&
      audioStream.getAudioTracks().some((t) => t.readyState === 'live' && t.enabled)
  );
  const [levels, setLevels] = useState<number[]>(() =>
    Array.from({ length: WAVEFORM_BAR_COUNT }, () => WAVEFORM_IDLE_LEVEL)
  );
  const [elapsedSec, setElapsedSec] = useState(0);
  const rafRef = useRef<number | null>(null);
  const lastSampleAtRef = useRef<number>(0);

  useEffect(() => {
    if (!isListening) {
      setElapsedSec(0);
      return;
    }
    const startedAt = Date.now();
    const t = window.setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - startedAt) / 1000));
    }, 500);
    return () => window.clearInterval(t);
  }, [isListening]);

  useEffect(() => {
    if (!isListening) return;

    if (!hasLiveMic || !audioStream) {
      setLevels(Array.from({ length: WAVEFORM_BAR_COUNT }, () => WAVEFORM_IDLE_LEVEL));
      return;
    }

    let cancelled = false;
    let audioCtx: AudioContext | null = null;
    let analyser: AnalyserNode | null = null;
    let source: MediaStreamAudioSourceNode | null = null;
    let zeroGain: GainNode | null = null;
    let freqData: Uint8Array<ArrayBuffer> | null = null;
    let timeData: Uint8Array<ArrayBuffer> | null = null;

    const attachStream = (stream: MediaStream) => {
      const AudioContextCtor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AudioContextCtor) return;
      try {
        audioCtx = new AudioContextCtor();
        if (audioCtx.state === 'suspended') {
          void audioCtx.resume().catch(() => {});
        }
        source = audioCtx.createMediaStreamSource(stream);
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 128;
        analyser.smoothingTimeConstant = 0.65;

        // Connect through a zero-gain sink so Chromium & Android WebView actively
        // pull live microphone frames without outputting audible echo.
        zeroGain = audioCtx.createGain();
        zeroGain.gain.value = 0;

        source.connect(analyser);
        analyser.connect(zeroGain);
        zeroGain.connect(audioCtx.destination);

        freqData = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
        timeData = new Uint8Array(new ArrayBuffer(analyser.fftSize));
      } catch {
        // Ignore WebAudio restrictions cleanly
      }
    };

    attachStream(audioStream);
    lastSampleAtRef.current = 0;

    const loop = (now: number) => {
      if (cancelled) return;
      if (audioCtx && audioCtx.state === 'suspended') {
        void audioCtx.resume().catch(() => {});
      }

      if (now - lastSampleAtRef.current >= 46) {
        lastSampleAtRef.current = now;
        let energy = WAVEFORM_IDLE_LEVEL;
        if (analyser && timeData && freqData) {
          analyser.getByteTimeDomainData(timeData);
          analyser.getByteFrequencyData(freqData);
          energy = computeVoiceEnergy(timeData, freqData);
        }
        setLevels((prev) => shiftWaveformHistory(prev, energy, WAVEFORM_BAR_COUNT));
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelled = true;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      try {
        source?.disconnect();
        analyser?.disconnect();
        zeroGain?.disconnect();
      } catch {
        // Ignore node disconnect errors
      }
      if (audioCtx && audioCtx.state !== 'closed') {
        audioCtx.close().catch(() => {});
      }
    };
  }, [isListening, audioStream, hasLiveMic]);

  if (!isListening && !isTranscribing) return null;

  const cleanLive = liveText.trim();
  const formattedTime = `${Math.floor(elapsedSec / 60)}:${String(elapsedSec % 60).padStart(2, '0')}`;

  return (
    <div
      data-testid="voice-waveform-bar"
      className="flex min-w-0 flex-col gap-2 px-3.5 py-2.5"
    >
      {isTranscribing ? (
        <div
          data-testid="voice-transcribing-status"
          className="flex items-center justify-between gap-2 text-[13px] font-medium text-[var(--ink)] px-2.5 py-1.5 rounded-xl bg-[var(--surface-2)] border border-[var(--border)]"
        >
          <span className="inline-flex items-center gap-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--primary)] shrink-0" />
            <span>কথাগুলো টেক্সটে রূপান্তর হচ্ছে…</span>
          </span>
          <span className="font-mono text-[11px] tabular-nums text-[var(--ink-dim)]">
            {formattedTime}
          </span>
        </div>
      ) : (
        cleanLive && (
          <div
            data-testid="voice-live-preview"
            className="text-[13.5px] font-normal text-[var(--ink)] leading-snug max-h-16 overflow-y-auto break-words px-1"
          >
            {cleanLive}
          </div>
        )
      )}

      {/* Lovable-style horizontal dictation control strip */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 shrink-0 text-[var(--ink-dim)]">
          <span
            className={`w-7 h-7 rounded-full inline-flex items-center justify-center ${
              hasLiveMic
                ? 'bg-[var(--primary-soft)] text-[var(--primary)]'
                : 'bg-[var(--surface-2)] text-[var(--ink-dim)]'
            }`}
          >
            <Mic className="w-3.5 h-3.5" />
          </span>
          <span
            data-testid={hasLiveMic ? 'voice-listening-label' : 'voice-mic-off-label'}
            className="font-mono text-[12px] tabular-nums text-[var(--ink-muted)]"
          >
            {hasLiveMic ? formattedTime : 'Mic off'}
          </span>
        </div>

        {/* Live right-to-left scrolling equalizer waveform */}
        <div
          data-testid="voice-waveform-bars"
          className="flex-1 flex items-center justify-center gap-[2.5px] h-8 overflow-hidden"
          aria-hidden="true"
        >
          {levels.map((lvl, i) => (
            <span
              key={i}
              className="w-[2.5px] rounded-full bg-[var(--primary)] motion-safe:transition-[height,opacity] duration-75 ease-out"
              style={{
                height: `${hasLiveMic ? Math.round(4 + lvl * 24) : 4}px`,
                opacity: isTranscribing || !hasLiveMic ? 0.25 : 0.35 + lvl * 0.65,
              }}
            />
          ))}
        </div>

        {/* Cancel (X) and Confirm (Check) Buttons */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            data-testid="voice-cancel-btn"
            onClick={onCancel}
            disabled={isTranscribing}
            className="w-8 h-8 rounded-full inline-flex items-center justify-center bg-[var(--surface-2)] border border-[var(--border)] text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--surface-3)] transition-colors cursor-pointer disabled:opacity-50"
            title="বাতিল করুন"
            aria-label="Cancel voice input"
          >
            <X className="w-4 h-4" />
          </button>

          <button
            type="button"
            data-testid="voice-confirm-btn"
            onClick={onConfirm}
            disabled={isTranscribing}
            className="w-8 h-8 rounded-full inline-flex items-center justify-center bg-[var(--ink)] text-[var(--bg)] hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50"
            title="টেক্সট বক্সে যোগ করুন"
            aria-label="Confirm voice input"
          >
            {isTranscribing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Check className="w-4 h-4 stroke-[2.4]" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
