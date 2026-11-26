import { ThinkingLevel } from '@google/genai';

export interface VoiceFastLaneCandidate {
  model: string;
  level?: ThinkingLevel;
}

export const VOICE_FAST_LANE_CANDIDATES: ReadonlyArray<VoiceFastLaneCandidate> = [
  { model: 'gemini-3.5-flash-lite', level: ThinkingLevel.MINIMAL },
  { model: 'gemini-3.1-flash-lite', level: ThinkingLevel.MINIMAL },
  { model: 'gemini-3-flash-preview', level: ThinkingLevel.MINIMAL },
  { model: 'gemini-flash-lite-latest', level: ThinkingLevel.MINIMAL },
];

export const VOICE_FAST_LANE_TEXT_TIMEOUT_MS = 8_000;
export const VOICE_FAST_LANE_MULTIMODAL_TIMEOUT_MS = 12_000;

export function resolveVoiceFastLaneTimeoutMs(hasImages: boolean): number {
  return hasImages
    ? VOICE_FAST_LANE_MULTIMODAL_TIMEOUT_MS
    : VOICE_FAST_LANE_TEXT_TIMEOUT_MS;
}

export interface VoiceFastLaneResult {
  ok: boolean;
  modelUsed?: string;
  attemptCount: number;
  text: string;
  errors: Array<{ model: string; message: string }>;
}

export interface RunVoiceFastLaneOptions {
  candidates?: ReadonlyArray<VoiceFastLaneCandidate>;
  timeoutMs: number;
  upstreamSignal?: AbortSignal;
  isClientClosed?: () => boolean;
  emitDelta: (delta: string) => void;
  openStream: (
    candidate: VoiceFastLaneCandidate,
    abortSignal: AbortSignal
  ) => Promise<AsyncIterable<{ text?: string }>>;
}

/**
 * Streams a Live Voice reply across prioritized fast Gemini candidates with:
 * - Per-candidate AbortController linked to upstream client disconnect
 * - Clean first-token timeout with socket abort and zero unhandled rejections
 * - No partial-sentence corruption (stops fallback once any text has streamed)
 * - Aggregated error reporting instead of noisy per-attempt warnings on recovered fallbacks
 */
export async function runVoiceFastLaneStream(
  opts: RunVoiceFastLaneOptions
): Promise<VoiceFastLaneResult> {
  const candidates = opts.candidates || VOICE_FAST_LANE_CANDIDATES;
  const errors: Array<{ model: string; message: string }> = [];
  let accumulated = '';
  let attempts = 0;

  for (const cand of candidates) {
    if (opts.isClientClosed?.() || opts.upstreamSignal?.aborted) {
      break;
    }

    attempts += 1;
    const candidateAbort = new AbortController();
    let candidateTimedOut = false;
    let firstTokenTimer: ReturnType<typeof setTimeout> | null = null;

    const onUpstreamAbort = () => {
      candidateAbort.abort();
    };
    if (opts.upstreamSignal) {
      if (opts.upstreamSignal.aborted) {
        candidateAbort.abort();
        break;
      }
      opts.upstreamSignal.addEventListener('abort', onUpstreamAbort, {
        once: true,
      });
    }

    const clearWatchdog = () => {
      if (firstTokenTimer) {
        clearTimeout(firstTokenTimer);
        firstTokenTimer = null;
      }
    };

    try {
      const abortPromise = new Promise<never>((_, reject) => {
        if (candidateAbort.signal.aborted) {
          reject(new Error('Voice fast-lane aborted'));
          return;
        }
        candidateAbort.signal.addEventListener(
          'abort',
          () => {
            reject(
              new Error(
                candidateTimedOut
                  ? `Voice fast-lane ${cand.model} first-token timeout`
                  : 'Voice fast-lane aborted'
              )
            );
          },
          { once: true }
        );
      });
      // Prevent unhandled rejection if abort fires during cleanup
      abortPromise.catch(() => {});

      firstTokenTimer = setTimeout(() => {
        candidateTimedOut = true;
        candidateAbort.abort();
      }, opts.timeoutMs);

      const streamOpenPromise = opts.openStream(cand, candidateAbort.signal);
      // Prevent unhandled rejection if stream open rejects after timeout/abort wins the race
      streamOpenPromise.catch(() => {});

      const fastStream = await Promise.race([streamOpenPromise, abortPromise]);
      const iterator = fastStream[Symbol.asyncIterator]();

      while (true) {
        if (
          opts.isClientClosed?.() ||
          opts.upstreamSignal?.aborted ||
          candidateTimedOut
        ) {
          candidateAbort.abort();
          break;
        }

        const nextPromise = iterator.next();
        nextPromise.catch(() => {});
        const nextStep = await Promise.race([nextPromise, abortPromise]);

        if (
          nextStep.done ||
          opts.isClientClosed?.() ||
          opts.upstreamSignal?.aborted ||
          candidateTimedOut
        ) {
          break;
        }
        const deltaText = nextStep.value?.text || '';
        if (deltaText) {
          clearWatchdog();
          accumulated += deltaText;
          opts.emitDelta(deltaText);
        }
      }

      clearWatchdog();

      if (accumulated.trim()) {
        return {
          ok: true,
          modelUsed: cand.model,
          attemptCount: attempts,
          text: accumulated,
          errors,
        };
      }

      if (opts.isClientClosed?.() || opts.upstreamSignal?.aborted) {
        break;
      }

      errors.push({
        model: cand.model,
        message: 'Empty response from fast-lane stream',
      });
    } catch (err) {
      clearWatchdog();
      candidateAbort.abort();
      if (opts.isClientClosed?.() || opts.upstreamSignal?.aborted) {
        break;
      }
      errors.push({
        model: cand.model,
        message: err instanceof Error ? err.message : String(err),
      });
      if (accumulated.trim()) {
        return {
          ok: true,
          modelUsed: cand.model,
          attemptCount: attempts,
          text: accumulated,
          errors,
        };
      }
    } finally {
      clearWatchdog();
      if (opts.upstreamSignal) {
        opts.upstreamSignal.removeEventListener('abort', onUpstreamAbort);
      }
    }
  }

  return {
    ok: false,
    attemptCount: attempts,
    text: accumulated,
    errors,
  };
}
