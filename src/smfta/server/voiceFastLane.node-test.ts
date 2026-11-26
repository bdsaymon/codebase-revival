import test from 'node:test';
import assert from 'node:assert/strict';
import {
  VOICE_FAST_LANE_CANDIDATES,
  VOICE_FAST_LANE_MULTIMODAL_TIMEOUT_MS,
  VOICE_FAST_LANE_TEXT_TIMEOUT_MS,
  resolveVoiceFastLaneTimeoutMs,
  runVoiceFastLaneStream,
} from './voiceFastLane';

test('resolveVoiceFastLaneTimeoutMs provides generous headroom for text and multimodal turns', () => {
  assert.equal(resolveVoiceFastLaneTimeoutMs(false), VOICE_FAST_LANE_TEXT_TIMEOUT_MS);
  assert.equal(resolveVoiceFastLaneTimeoutMs(true), VOICE_FAST_LANE_MULTIMODAL_TIMEOUT_MS);
  assert.ok(VOICE_FAST_LANE_TEXT_TIMEOUT_MS >= 8_000);
  assert.ok(VOICE_FAST_LANE_MULTIMODAL_TIMEOUT_MS >= 12_000);
  assert.equal(VOICE_FAST_LANE_CANDIDATES[0]?.model, 'gemini-3.5-flash-lite');
});

test('runVoiceFastLaneStream aborts timed-out first candidate and recovers cleanly on second candidate', async () => {
  const abortedSignals: Record<string, boolean> = {};
  const deltas: string[] = [];

  const res = await runVoiceFastLaneStream({
    candidates: [
      { model: 'slow-candidate' },
      { model: 'fast-candidate' },
    ],
    timeoutMs: 40,
    emitDelta: (d) => deltas.push(d),
    openStream: async (cand, abortSignal) => {
      abortSignal.addEventListener('abort', () => {
        abortedSignals[cand.model] = true;
      });
      if (cand.model === 'slow-candidate') {
        await new Promise((r) => setTimeout(r, 150));
        return {
          async *[Symbol.asyncIterator]() {
            yield { text: 'too late' };
          },
        };
      }
      return {
        async *[Symbol.asyncIterator]() {
          yield { text: 'Hello ' };
          yield { text: 'from fast candidate!' };
        },
      };
    },
  });

  assert.equal(res.ok, true);
  assert.equal(res.modelUsed, 'fast-candidate');
  assert.equal(res.attemptCount, 2);
  assert.equal(abortedSignals['slow-candidate'], true);
  assert.equal(deltas.join(''), 'Hello from fast candidate!');
});

test('runVoiceFastLaneStream preserves partial reply without corrupting sentence on mid-stream error', async () => {
  const deltas: string[] = [];
  const modelsTried: string[] = [];

  const res = await runVoiceFastLaneStream({
    candidates: [
      { model: 'partial-candidate' },
      { model: 'never-called' },
    ],
    timeoutMs: 200,
    emitDelta: (d) => deltas.push(d),
    openStream: async (cand) => {
      modelsTried.push(cand.model);
      return {
        async *[Symbol.asyncIterator]() {
          yield { text: 'First sentence.' };
          throw new Error('upstream reset');
        },
      };
    },
  });

  assert.equal(res.ok, true);
  assert.equal(res.modelUsed, 'partial-candidate');
  assert.deepEqual(modelsTried, ['partial-candidate']);
  assert.equal(deltas.join(''), 'First sentence.');
});

test('runVoiceFastLaneStream stops immediately when upstream client disconnects', async () => {
  const upstream = new AbortController();
  let abortedCandidate = false;

  const promise = runVoiceFastLaneStream({
    candidates: [{ model: 'cand-1' }, { model: 'cand-2' }],
    timeoutMs: 500,
    upstreamSignal: upstream.signal,
    emitDelta: () => {},
    openStream: async (_cand, signal) => {
      signal.addEventListener('abort', () => {
        abortedCandidate = true;
      });
      return {
        async *[Symbol.asyncIterator]() {
          await new Promise((r) => setTimeout(r, 120));
          yield { text: 'ignored' };
        },
      };
    },
  });

  setTimeout(() => upstream.abort(), 20);
  const res = await promise;
  assert.equal(res.ok, false);
  assert.equal(abortedCandidate, true);
  assert.equal(res.attemptCount, 1);
});
