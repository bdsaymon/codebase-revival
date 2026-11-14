/**
 * SMFTA AI Pro — pen-like typewriter reveal (v18.7.0)
 *
 * The user's complaint: “উত্তরগুলো একসাথে বার হয়ে যায় … কলমের মতো লিখে
 * রেখে চলে যায় এমন টাইপিং হোক”. Providers deliver text in uneven chunks —
 * sometimes a third of the answer in one SSE frame — so painting whatever
 * arrived makes the answer appear in jumps.
 *
 * This module owns the *pacing* only (pure, fully testable):
 *   • a steady base speed (~60 chars/s) that reads like handwriting,
 *   • an acceleration curve so a big chunk is caught up quickly,
 *   • a fast-but-visible drain when the stream ends,
 *   • `safeSlice` so a frame never cuts a Bengali combining mark or a
 *     surrogate pair in half (that would render a broken glyph).
 */

/** Characters per second at rest — comfortable human typing speed. */
export const TYPE_BASE_CPS = 72;
/** Never type faster than this during active streaming. */
export const TYPE_MAX_CPS = 360;
/** Smooth upper cap while finishing a buffered tail. */
export const TYPE_FINISHING_MAX_CPS = 420;
/** Threshold kept for compatibility with callers/tests. */
export const TYPE_CATCHUP_BACKLOG = 900;

/**
 * How many characters to reveal this frame.
 *
 * @param backlog  characters still waiting (target.length - shown)
 * @param dtMs     milliseconds since the previous frame
 * @param finishing upstream finished — type out smoothly, never dump at once
 */
export function revealChars(
  backlog: number,
  dtMs: number,
  finishing = false
): number {
  if (backlog <= 0) return 0;
  const dt = Math.min(90, Math.max(8, dtMs || 16));

  if (finishing) {
    const rate = Math.min(
      TYPE_FINISHING_MAX_CPS,
      Math.max(115, TYPE_BASE_CPS * 1.65 + backlog * 0.6)
    );
    return Math.min(backlog, Math.max(1, Math.ceil((rate * dt) / 1000)));
  }

  const rate = Math.min(TYPE_MAX_CPS, TYPE_BASE_CPS + backlog * 0.45);
  const chars = Math.ceil((rate * dt) / 1000);
  return Math.min(backlog, Math.max(1, chars));
}

/** Bengali matras, virama, ZWJ and generic combining marks. */
const COMBINING = /[\u0300-\u036F\u09BE-\u09CD\u09D7\u09E2\u09E3\u200B-\u200D\uFE00-\uFE0F]/;

/**
 * Slice a string at `shown` characters **without** splitting a grapheme.
 * Extends the cut past any trailing combining marks / zero-width joiners and
 * never separates a surrogate pair.
 */
export function safeSlice(text: string, shown: number): string {
  if (shown <= 0) return '';
  if (shown >= text.length) return text;
  let end = shown;
  while (end < text.length && COMBINING.test(text[end])) end += 1;
  if (end > 0 && end < text.length && /[\uD800-\uDBFF]/.test(text[end - 1])) {
    end += 1;
  }
  return text.slice(0, end);
}

/** True once everything has been revealed. */
export function revealDone(target: string, shown: number): boolean {
  return shown >= target.length;
}
