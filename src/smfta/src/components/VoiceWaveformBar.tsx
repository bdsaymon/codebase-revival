import React, { useEffect, useRef, useState } from 'react';
import { Check, Loader2, Mic, X } from 'lucide-react';

interface VoiceWaveformBarProps {
  isListening: boolean;
  isTranscribing?: boolean;
  speechActivityAt?: number;
  liveText?: string;
  audioStream?: MediaStream | null;
  onCancel: () => void;
  onConfirm: () => void;
}

const BAR_COUNT = 32;

export const VoiceWaveformBar: React.FC<VoiceWaveformBarProps> = ({
  isListening,
  isTranscribing = false,
  speechActivityAt = 0,
  liveText = '',
  audioStream = null,
  onCancel,
  onConfirm,
}) => {
  const [levels, setLevels] = useState<number[]>(() =>
    Array.from({ length: BAR_COUNT }, () => 0.2)
  );
  const [elapsedSec, setElapsedSec] = useState(0);
  const rafRef = useRef<number | null>(null);
  const activityRef = useRef<number>(speechActivityAt);

  useEffect(() => {
    activityRef.current = speechActivityAt;
  }, [speechActivityAt]);

  useEffect(() => {
    if (!isListening) {
      setElapsedSec(0);
      return;
    }
    const startedAt = Date.now();
    const t = setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - startedAt) / 1000));
    }, 500);
    return () => clearInterval(t);
  }, [isListening]);

  useEffect(() => {
    if (!isListening) return;

    let cancelled = false;
    let tick = 0;
    let audioCtx: AudioContext | null = null;
    let analyser: AnalyserNode | null = null;
    let ownedStream: MediaStream | null = null;
    let freqData: Uint8Array<ArrayBuffer> | null = null;

    const attachStream = (stream: MediaStream, owned: boolean) => {
      if (cancelled) {
        if (owned) stream.getTracks().forEach((t) => t.stop());
        return;
      }
      if (owned) ownedStream = stream;
      const AudioContextCtor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AudioContextCtor) return;
      try {
        audioCtx = new AudioContextCtor();
        const source = audioCtx.createMediaStreamSource(stream);
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 64;
        analyser.smoothingTimeConstant = 0.72;
        source.connect(analyser);
        freqData = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
      } catch {
        // Fallback smoothly if WebAudio is blocked
      }
    };

    if (audioStream) {
      attachStream(audioStream, false);
    } else if (
      typeof window !== 'undefined' &&
      typeof navigator !== 'undefined' &&
      navigator.mediaDevices &&
      typeof navigator.mediaDevices.getUserMedia === 'function'
    ) {
      navigator.mediaDevices
        .getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        })
        .then((stream) => attachStream(stream, true))
        .catch(() => {
          // Graceful fallback to speech-activity wave when mic stream is unavailable
        });
    }

    const loop = () => {
      if (cancelled) return;
      tick += 0.16;

      const msSinceSpeech = Date.now() - (activityRef.current || 0);
      const isSpeakingNow = msSinceSpeech >= 0 && msSinceSpeech < 750;
      const boost = isSpeakingNow
        ? 0.65 + 0.35 * Math.max(0, 1 - msSinceSpeech / 750)
        : 0.3;

      if (analyser && freqData) {
        analyser.getByteFrequencyData(freqData);
      }

      setLevels(
        Array.from({ length: BAR_COUNT }, (_, idx) => {
          const center =
            1 - Math.abs(idx - (BAR_COUNT - 1) / 2) / (BAR_COUNT / 1.4);
          const primaryWave =
            0.46 +
            0.34 * Math.sin(tick * (isSpeakingNow ? 2.1 : 1.1) + idx * 0.52) +
            0.2 * Math.cos(tick * (isSpeakingNow ? 3.2 : 1.6) - idx * 0.37);
          const syntheticRatio =
            primaryWave * boost * (0.4 + Math.max(0.18, center) * 0.75);

          if (freqData && freqData.length > 0) {
            const binIdx = Math.min(
              freqData.length - 1,
              Math.floor((idx / BAR_COUNT) * Math.min(freqData.length, 24))
            );
            const micRatio = (freqData[binIdx] || 0) / 255;
            if (micRatio > 0.04) {
              const blended = Math.max(
                syntheticRatio * 0.65,
                micRatio * (0.55 + center * 0.55)
              );
              return Math.max(0.14, Math.min(1, blended));
            }
          }

          return Math.max(0.14, Math.min(1, syntheticRatio));
        })
      );

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelled = true;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      if (ownedStream) {
        ownedStream.getTracks().forEach((t) => t.stop());
      }
      if (audioCtx && audioCtx.state !== 'closed') {
        audioCtx.close().catch(() => {});
      }
    };
  }, [isListening, audioStream]);

  if (!isListening && !isTranscribing) return null;

  const cleanLive = liveText.trim();
  const formattedTime = `${Math.floor(elapsedSec / 60)}:${String(elapsedSec % 60).padStart(2, '0')}`;

  return (
    <div
      data-testid="voice-waveform-bar"
      className="flex flex-col gap-2 px-4 py-3 min-h-[68px]"
    >
      {isTranscribing ? (
        <div
          data-testid="voice-transcribing-status"
          className="flex items-center justify-between gap-2 text-[13px] font-medium text-[var(--primary)] px-1 py-1 rounded-xl bg-[var(--primary)]/[0.06] border border-[var(--primary)]/20"
        >
          <span className="inline-flex items-center gap-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
            <span>কথাগুলো টেক্সটে রূপান্তর হচ্ছে…</span>
          </span>
          <span className="font-mono text-[11px] tabular-nums opacity-75">{formattedTime}</span>
        </div>
      ) : (
        <div className="flex flex-col gap-1 px-1">
          <div className="flex items-center justify-between text-[11.5px] text-[var(--ink-dim)]">
            <span className="inline-flex items-center gap-1.5 font-medium">
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse shrink-0" />
              <Mic className="w-3 h-3 text-[var(--primary)]" />
              <span>{cleanLive ? 'লাইভ ভয়েস টেক্সট' : 'শুনছি — কথা বলুন… শেষ হলে ✓ চাপুন'}</span>
            </span>
            <span className="font-mono text-[11px] tabular-nums text-[var(--text-3)]">
              {formattedTime}
            </span>
          </div>
          {cleanLive && (
            <div
              data-testid="voice-live-preview"
              className="text-[14px] font-medium text-[var(--ink)] leading-snug max-h-20 overflow-y-auto break-words rounded-xl bg-[var(--surface-2)]/75 border border-[var(--border)] px-3 py-2 shadow-xs"
            >
              {cleanLive}
            </div>
          )}
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        {/* Animated Audio Waveform Bars */}
        <div
          className="flex-1 flex items-center justify-center gap-[3px] h-9 overflow-hidden"
          aria-hidden="true"
        >
          {levels.map((lvl, i) => (
            <span
              key={i}
              className="w-[3px] rounded-full bg-[var(--ink)]/75 transition-[height] duration-75 ease-out"
              style={{
                height: `${Math.round(5 + lvl * 28)}px`,
                opacity: isTranscribing ? 0.35 : 0.4 + lvl * 0.6,
              }}
            />
          ))}
        </div>

        {/* Cancel (X) and Confirm (Check) Buttons */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            data-testid="voice-cancel-btn"
            onClick={onCancel}
            disabled={isTranscribing}
            className="w-9 h-9 rounded-full inline-flex items-center justify-center bg-[var(--surface-2)] border border-[var(--border)] text-[var(--ink-dim)] hover:text-[var(--ink)] hover:bg-[var(--surface-3)] transition-colors cursor-pointer disabled:opacity-50"
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
            className="w-9 h-9 rounded-full inline-flex items-center justify-center bg-[var(--ink)] text-[var(--bg)] hover:opacity-90 transition-opacity cursor-pointer shadow-xs disabled:opacity-50"
            title="টেক্সট বক্সে যোগ করুন"
            aria-label="Confirm voice input"
          >
            {isTranscribing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Check className="w-4 h-4 stroke-[2.5]" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

