export const WAVEFORM_BAR_COUNT = 38;
export const WAVEFORM_IDLE_LEVEL = 0.08;
export const WAVEFORM_NOISE_FLOOR = 0.016;

/**
 * Computes a normalized [0, 1] instantaneous voice amplitude from WebAudio
 * time-domain and frequency-domain buffers with adaptive noise-floor gating.
 */
export function computeVoiceEnergy(
  timeData?: ArrayLike<number> | null,
  freqData?: ArrayLike<number> | null
): number {
  let rms = 0;
  if (timeData && timeData.length > 0) {
    let sumSq = 0;
    for (let i = 0; i < timeData.length; i += 1) {
      const centered = ((timeData[i] ?? 128) - 128) / 128;
      sumSq += centered * centered;
    }
    rms = Math.sqrt(sumSq / timeData.length);
  }

  let vocalBandPeak = 0;
  if (freqData && freqData.length > 0) {
    // Focus on speech-bearing lower-to-mid bins (roughly 120Hz–4kHz)
    const endBin = Math.min(freqData.length, 18);
    let sum = 0;
    for (let i = 1; i < endBin; i += 1) {
      sum += (freqData[i] ?? 0) / 255;
    }
    const count = Math.max(1, endBin - 1);
    vocalBandPeak = sum / count;
  }

  const rawEnergy = Math.max(rms * 4.4, vocalBandPeak * 1.15);
  if (rawEnergy <= WAVEFORM_NOISE_FLOOR) {
    return WAVEFORM_IDLE_LEVEL;
  }

  const gated = (rawEnergy - WAVEFORM_NOISE_FLOOR) / (1 - WAVEFORM_NOISE_FLOOR);
  // Gentle non-linear boost so conversational speech reads clearly without clipping
  const shaped = Math.pow(Math.min(1, Math.max(0, gated)), 0.72);
  return Math.max(WAVEFORM_IDLE_LEVEL, Math.min(1, WAVEFORM_IDLE_LEVEL + shaped * 0.92));
}

/**
 * Shifts waveform history right-to-left (Lovable recorder motion) so the
 * latest voice sample enters on the right and ripples left over time.
 */
export function shiftWaveformHistory(
  previous: number[],
  nextLevel: number,
  barCount = WAVEFORM_BAR_COUNT
): number[] {
  const clamped = Number.isFinite(nextLevel)
    ? Math.max(WAVEFORM_IDLE_LEVEL, Math.min(1, nextLevel))
    : WAVEFORM_IDLE_LEVEL;
  const safePrev =
    previous.length === barCount
      ? previous
      : Array.from({ length: barCount }, () => WAVEFORM_IDLE_LEVEL);

  const prevLast = safePrev[safePrev.length - 1] ?? WAVEFORM_IDLE_LEVEL;
  // Fast attack on speech onset, smooth organic release
  const smoothed =
    clamped > prevLast
      ? prevLast * 0.25 + clamped * 0.75
      : prevLast * 0.45 + clamped * 0.55;

  return [...safePrev.slice(1), smoothed];
}
