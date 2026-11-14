import React, { useEffect, useRef, useState } from 'react';
import { Check, X } from 'lucide-react';

interface VoiceWaveformBarProps {
  isListening: boolean;
  speechActivityAt?: number;
  liveText?: string;
  onCancel: () => void;
  onConfirm: () => void;
}

const BAR_COUNT = 32;

export const VoiceWaveformBar: React.FC<VoiceWaveformBarProps> = ({
  isListening,
  speechActivityAt = 0,
  liveText = '',
  onCancel,
  onConfirm,
}) => {
  const [levels, setLevels] = useState<number[]>(() =>
    Array.from({ length: BAR_COUNT }, () => 0.2)
  );
  const rafRef = useRef<number | null>(null);
  const activityRef = useRef<number>(speechActivityAt);

  useEffect(() => {
    activityRef.current = speechActivityAt;
  }, [speechActivityAt]);

  useEffect(() => {
    if (!isListening) return;

    let cancelled = false;
    let tick = 0;

    const loop = () => {
      if (cancelled) return;
      tick += 0.16;

      const msSinceSpeech = Date.now() - (activityRef.current || 0);
      const isSpeakingNow = msSinceSpeech >= 0 && msSinceSpeech < 750;
      const boost = isSpeakingNow
        ? 0.65 + 0.35 * Math.max(0, 1 - msSinceSpeech / 750)
        : 0.28;

      setLevels(
        Array.from({ length: BAR_COUNT }, (_, idx) => {
          const center =
            1 - Math.abs(idx - (BAR_COUNT - 1) / 2) / (BAR_COUNT / 1.4);
          const primaryWave =
            0.46 +
            0.34 * Math.sin(tick * (isSpeakingNow ? 2.1 : 1.1) + idx * 0.52) +
            0.2 * Math.cos(tick * (isSpeakingNow ? 3.2 : 1.6) - idx * 0.37);
          const heightRatio =
            primaryWave * boost * (0.4 + Math.max(0.18, center) * 0.75);
          return Math.max(0.14, Math.min(1, heightRatio));
        })
      );

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelled = true;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [isListening]);

  if (!isListening) return null;

  const cleanLive = liveText.trim();

  return (
    <div
      data-testid="voice-waveform-bar"
      className="flex flex-col gap-1.5 px-4 py-3 min-h-[60px]"
    >
      {cleanLive && (
        <div
          data-testid="voice-live-preview"
          className="text-[13.5px] text-[var(--ink)] leading-snug max-h-16 overflow-y-auto break-words px-0.5"
        >
          {cleanLive}
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
                opacity: 0.4 + lvl * 0.6,
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
            className="w-9 h-9 rounded-full inline-flex items-center justify-center bg-[var(--surface-2)] border border-[var(--border)] text-[var(--ink-dim)] hover:text-[var(--ink)] hover:bg-[var(--surface-3)] transition-colors cursor-pointer"
            title="বাতিল করুন"
            aria-label="Cancel voice input"
          >
            <X className="w-4 h-4" />
          </button>

          <button
            type="button"
            data-testid="voice-confirm-btn"
            onClick={onConfirm}
            className="w-9 h-9 rounded-full inline-flex items-center justify-center bg-[var(--ink)] text-[var(--bg)] hover:opacity-90 transition-opacity cursor-pointer shadow-xs"
            title="টেক্সট বক্সে যোগ করুন"
            aria-label="Confirm voice input"
          >
            <Check className="w-4 h-4 stroke-[2.5]" />
          </button>
        </div>
      </div>
    </div>
  );
};
