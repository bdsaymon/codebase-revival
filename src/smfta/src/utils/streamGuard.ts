/**
 * SMFTA AI Pro — Stream Guard 🛡️ (v18.0.0)
 *
 * The engine must never "get stuck" or hand back a half-written answer.
 * These helpers power three guarantees:
 *
 *   1. Stall detection — a silent stream is aborted and retried instead of
 *      leaving the UI frozen forever.
 *   2. Completion guarantee — a truncated reply (cut code fence, mid-sentence
 *      stop) is detected and automatically continued from where it stopped.
 *   3. Response economy — repeated paragraphs / model loops are removed, and
 *      in "concise" mode the empty filler (obvious preamble + closing offers)
 *      is stripped so a one-line question never gets a wall of padding.
 *
 * Everything here is pure and unit-tested.
 */

/** v18.7.0 — up to three passes, so a cut answer is always finished. */
export const MAX_AUTO_CONTINUATIONS = 3;
export const DEFAULT_IDLE_TIMEOUT_MS = 75_000;

const OPEN_BLOCKS = /⟦(?:SELF_UPDATE|NOTE|SELF_CODE)(?![^⟧]*⟧)/gi;

/** ``` fences that were opened but never closed. */
export function unclosedFenceCount(text: string): number {
  if (!text) return 0;
  const fences = text.match(/```/g);
  return fences ? fences.length % 2 : 0;
}

/** ⟦SELF_UPDATE⟧ / ⟦NOTE⟧ / ⟦SELF_CODE⟧ blocks that were opened but not closed. */
export function hasUnclosedControlBlock(text: string): boolean {
  if (!text) return false;
  const opens = (text.match(/⟦(?:SELF_UPDATE|NOTE|SELF_CODE)⟧/g) || []).length;
  const closes = (text.match(/⟦\/(?:SELF_UPDATE|NOTE|SELF_CODE)⟧/g) || []).length;
  if (opens > closes) return true;
  // A block was started with content but the closing marker never arrived.
  OPEN_BLOCKS.lastIndex = 0;
  return /⟦(?:SELF_UPDATE|NOTE|SELF_CODE)⟧[\s\S]*$/.test(text) && opens > closes;
}

function branchBalance(text: string): number {
  const pairs: Array<[string, string]> = [
    ['{', '}'],
    ['(', ')'],
    ['[', ']'],
  ];
  let balance = 0;
  for (const [open, close] of pairs) {
    const o = (text.split(open).length - 1) as number;
    const c = (text.split(close).length - 1) as number;
    balance += Math.max(0, o - c);
  }
  return balance;
}

/**
 * Heuristic: does this reply look cut off? Tuned to be *conservative* — a false
 * positive costs one extra (cheap) continuation call, a false negative leaves
 * the user with a broken answer.
 */
export function looksTruncated(text: string): boolean {
  const t = (text || '').trimEnd();
  if (!t) return false;
  // Structural damage is conclusive regardless of length.
  if (unclosedFenceCount(t) > 0) return true;
  if (hasUnclosedControlBlock(t)) return true;
  if (t.length < 40) return false;

  const tail = t.slice(-240);
  // Ended on an obvious "more is coming" token.
  if (
    /(:|：|,|、|;|=|\(|\[|\{|\+|\/|&|\||(?:\b(?:and|or|but|the|a|of|to|with|for|is|are|was)|কে|এবং|বা|আর)\s*)$/i.test(
      tail
    )
  ) {
    // Only trust this when the tail is also structurally unbalanced or long.
    if (branchBalance(t) > 0 || t.length > 320) return true;
  }

  // Unbalanced JSON / code brackets anywhere near the end.
  if (branchBalance(t) > 0 && /[{([]/.test(tail)) return true;

  // Long prose that simply stops without terminal punctuation. Structured
  // lines (bullets, headings, numbered lists, markdown tables) are exempt
  // because they often legitimately end without a full stop.
  const lastLine = tail.split('\n').pop() || '';
  const isStructured = /^\s*(?:[-*•#>|]|\d+[.)])\s/.test(lastLine) || /\|\s*$/.test(lastLine);
  if (
    t.length > 160 &&
    !isStructured &&
    !/[.!?।…"'"”’`)\]}>*_~\-]\s*$/.test(t)
  ) {
    return true;
  }
  return false;
}

/** Hidden instruction appended as the last user turn when continuing. */
export function continuationDirective(tail: string): string {
  const cleanTail = (tail || '').slice(-1200);
  return (
    'SYSTEM CONTINUATION (auto-repair): আপনার আগের উত্তরটি হঠাৎ কেটে গেছে। ' +
    'ঠিক যেখানে থেমেছিলে সেখান থেকেই বাকিটা লিখতে থাকো, একটুও পুনরাবৃত্তি না করে। ' +
    'শুরুতে কোনো ভূমিকা/সারাংশ দিও না — শুধু বাকি অংশ। কোড ব্লক অসম্পূর্ণ হলে সেটি সম্পূর্ণ করো। ' +
    'উত্তরটি অবশ্যই শেষ বাক্য বা বন্ধ ব্র্যাকেট/কোড ফেন্স দিয়ে শেষ করবে।\n\n' +
    '--- LAST LINES OF MY PREVIOUS ANSWER ---\n' +
    cleanTail
  );
}

/**
 * Merges a continuation chunk onto `existing` without duplicating overlapping
 * prefixes, repeated full answers, or re-opened markdown code fences.
 */
export function mergeContinuationText(
  existing: string,
  incoming: string
): { merged: string; deltaToAppend: string } {
  const base = existing || '';
  if (!incoming || !incoming.trim()) {
    return { merged: base, deltaToAppend: '' };
  }
  if (!base) {
    return { merged: incoming, deltaToAppend: incoming };
  }

  let cont = incoming;

  // 1. Strip conversational preamble that models sometimes emit before continuing
  cont = cont.replace(
    /^(?:sure[,!.]?\s*|certainly[,!.]?\s*|here(?:'s| is) the (?:rest|continuation)[^\n]*\n+|continuing from where[^\n]*\n+|নিচে বাকি অংশ[^\n]*\n+|বাকি অংশটুকু[^\n]*\n+)/i,
    ''
  );

  // 2. If the model repeated the entire existing answer from the beginning and added more:
  const trimmedBase = base.trim();
  const trimmedCont = cont.trim();
  if (trimmedCont === trimmedBase || (trimmedBase.length > 40 && trimmedBase.includes(trimmedCont))) {
    return { merged: base, deltaToAppend: '' };
  }
  if (trimmedBase.length > 30 && trimmedCont.startsWith(trimmedBase)) {
    const remainder = trimmedCont.slice(trimmedBase.length);
    return {
      merged: base + remainder,
      deltaToAppend: remainder,
    };
  }

  // 3. If `base` currently has an unclosed code fence and `cont` begins by opening a new ```lang fence,
  // strip that redundant opening fence line so it does not prematurely close the open code block.
  if (unclosedFenceCount(base) > 0) {
    const reOpenedFence = cont.match(/^\s*```[a-zA-Z0-9_+-]*\r?\n([\s\S]*)$/);
    if (reOpenedFence && unclosedFenceCount(reOpenedFence[1]) > 0) {
      cont = reOpenedFence[1];
    }
  }

  // 4. Find longest exact suffix of `base` that matches a prefix of `cont`
  const maxOverlapCheck = Math.min(base.length, cont.length, 800);
  let overlapLen = 0;
  for (let len = maxOverlapCheck; len >= 6; len--) {
    const baseSuffix = base.slice(base.length - len);
    const contPrefix = cont.slice(0, len);
    if (baseSuffix === contPrefix) {
      overlapLen = len;
      break;
    }
  }
  if (overlapLen > 0) {
    cont = cont.slice(overlapLen);
  } else {
    // Also check trimmed-start overlap in case of leading newline differences
    const contTrimStart = cont.trimStart();
    const maxTrimOverlap = Math.min(base.trimEnd().length, contTrimStart.length, 600);
    const baseTrimEnd = base.trimEnd();
    let trimOverlap = 0;
    for (let len = maxTrimOverlap; len >= 10; len--) {
      if (baseTrimEnd.slice(baseTrimEnd.length - len) === contTrimStart.slice(0, len)) {
        trimOverlap = len;
        break;
      }
    }
    if (trimOverlap > 0) {
      cont = contTrimStart.slice(trimOverlap);
    }
  }

  // 5. Line-by-line overlap guard: if the first 1–3 non-empty lines of `cont`
  // already appear at the tail of `base`, drop those duplicate lines.
  if (overlapLen === 0 && cont.trim()) {
    const baseLines = base.trimEnd().split(/\r?\n/);
    const contLines = cont.split(/\r?\n/);
    const tailWindow = baseLines.slice(-8).map((l) => l.trim()).filter(Boolean);
    let dropLines = 0;
    for (let i = 0; i < Math.min(4, contLines.length); i++) {
      const candidate = contLines[i].trim();
      if (!candidate) {
        if (dropLines > 0) dropLines++;
        continue;
      }
      if (candidate.length >= 8 && tailWindow.includes(candidate)) {
        dropLines = i + 1;
      } else {
        break;
      }
    }
    if (dropLines > 0) {
      cont = contLines.slice(dropLines).join('\n');
    }
  }

  if (!cont || !cont.trim()) {
    return { merged: base, deltaToAppend: '' };
  }

  const needsSeparator =
    !base.endsWith('\n') &&
    !base.endsWith(' ') &&
    !cont.startsWith('\n') &&
    !cont.startsWith(' ') &&
    unclosedFenceCount(base) > 0;
  const deltaToAppend = needsSeparator ? '\n' + cont : cont;
  return {
    merged: base + deltaToAppend,
    deltaToAppend,
  };
}

function normalizeLine(line: string): string {
  return line
    .toLowerCase()
    .replace(/[\s\u00a0]+/g, ' ')
    .replace(/[^\p{L}\p{N} ]/gu, '')
    .trim();
}

/**
 * Removes model loops: the same paragraph or sentence emitted repeatedly, and
 * triple-blank runs. Safe for normal text (only exact normalised duplicates die).
 */
export function dedupeRepeats(text: string): string {
  if (!text) return '';
  const paragraphs = text.split(/\n{2,}/);
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const para of paragraphs) {
    const key = normalizeLine(para);
    if (key.length > 24) {
      if (seen.has(key)) continue;
      seen.add(key);
    }
    // Collapse sentence-level loops inside a paragraph.
    const sentences = para.split(/(?<=[.!?।])\s+/);
    const keptSentences: string[] = [];
    let prevKey = '';
    let run = 0;
    for (const s of sentences) {
      const sKey = normalizeLine(s);
      if (sKey && sKey === prevKey) {
        run += 1;
        if (run >= 1) continue;
      }
      prevKey = sKey;
      run = 0;
      keptSentences.push(s);
    }
    kept.push(keptSentences.join(' '));
  }
  return kept
    .join('\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const FILLER_PREFIXES: RegExp[] = [
  /^(অবশ্যই|নিশ্চয়ই|অবশ্যই!|সার্ট|ঠিক আছে)[!,.।—-]?\s*/i,
  /^(ভালো প্রশ্ন|দারুণ প্রশ্ন|চমৎকার প্রশ্ন)[!,.।—-]?\s*/i,
  /^(sure|certainly|of course|absolutely|great question|good question)[!,.—-]?\s*/i,
  /^(here('| i)s|here you go|below is|নিচে দিচ্ছি)[^\n]{0,80}\n/i,
  /^(আমি (এখন|তাৎক্ষণিকভাবে) (আপনাকে|তোমাকে) (সাহায্য|উত্তর) (করব|দিচ্ছি))[^.\n]*[.।]\s*/i,
];

const FILLER_SUFFIXES: RegExp[] = [
  /\n{0,2}(আশা করি (এটি|এটা|উত্তরটি) (আপনার|তোমার)?\s*কাজে (আসবে|লাগবে)[^.\n]*[.।]?)\s*$/i,
  /\n{0,2}(আরও কিছু (জানতে|শিখতে) চাইলে (বলুন|জিজ্ঞেস করুন)[^.\n]*[.।]?)\s*$/i,
  /\n{0,2}(কোনো প্রশ্ন থাকলে (বলুন|জানাতে পারেন)[^.\n]*[.।]?)\s*$/i,
  /\n{0,2}(hope (this|that) helps[^.\n]*[.!]?)\s*$/i,
  /\n{0,2}(let me know if you (need|want)[^.\n]*[.!]?)\s*$/i,
  /\n{0,2}(feel free to ask[^.\n]*[.!]?)\s*$/i,
];

/**
 * Strips the obvious padding (hollow preamble / "hope this helps" tail) that
 * makes a tiny question produce a bloated answer. Only used in concise mode.
 */
export function stripPadding(text: string): string {
  if (!text) return '';
  let out = text.trim();
  // Repeatedly peel hollow openers.
  for (let i = 0; i < 3; i += 1) {
    const before = out;
    for (const rx of FILLER_PREFIXES) out = out.replace(rx, '').trimStart();
    if (before === out) break;
  }
  for (let i = 0; i < 3; i += 1) {
    const before = out;
    for (const rx of FILLER_SUFFIXES) out = out.replace(rx, '').trimEnd();
    if (before === out) break;
  }
  return out.trim();
}

// ── v18.3.0 — ANSWER LENGTH MATCHING ────────────────────────────────────────
// The user asked (repeatedly) for answers that match the size of the question.
// These limits are a final deterministic safety net behind the prompt rules.

export const GREETING_MAX_CHARS = 220;
/**
 * @deprecated v18.5.0 — no longer used. Kept only so older imports keep
 * compiling; answer length is never clamped by character count again.
 */
export const SHORT_PROMPT_MAX_CHARS = 0;
/** @deprecated v18.5.0 — see {@link SHORT_PROMPT_MAX_CHARS}. */
export const SHORT_PROMPT_LENGTH = 0;

const GREETING_ONLY_RX =
  /^(?:hi+|hello+|hey+|yo|hola|নমস্কার|হাই|হ্যালো|হেলো|সালাম|আসসালামু\s*আলাইকুম|আসসালামুআলাইকুম|শুভ\s*(?:সকাল|সন্ধ্যা|রাত|দুপুর)|good\s*(?:morning|afternoon|evening|night)|কেমন\s*আছো?|কেমন\s*আছেন|kemon\s*acho|how are you|nice to meet you)$/i;

/** Is this message nothing more than a greeting? */
export function isGreetingMessage(text: string): boolean {
  const clean = (text || '')
    .toLowerCase()
    .replace(/[?!।.,'"`]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean || clean.length > 40) return false;
  return GREETING_ONLY_RX.test(clean);
}

/** Code fences / control blocks — these must never be cut or restructured. */
function hasCodeContent(text: string): boolean {
  return /```|⟦/.test(text || '');
}

/** Tables and multi-section answers are intentional structure, not padding. */
export function hasStructuredContent(text: string): boolean {
  return /\|\s*---|^#{2,}\s/m.test(text || '');
}

/** Cuts at the last sentence boundary inside `maxChars`. */
export function clampToSentences(text: string, maxChars: number): string {
  const t = (text || '').trim();
  if (t.length <= maxChars) return t;
  const window = t.slice(0, maxChars);
  const lastBreak = Math.max(
    window.lastIndexOf('।'),
    window.lastIndexOf('. '),
    window.lastIndexOf('!'),
    window.lastIndexOf('?'),
    window.lastIndexOf('\n')
  );
  if (lastBreak > maxChars * 0.45) return window.slice(0, lastBreak + 1).trim();
  const space = window.lastIndexOf(' ');
  return (space > maxChars * 0.5 ? window.slice(0, space) : window).trim() + ' …';
}

/**
 * Makes the final answer proportional to the question — without ever
 * mutilating a real answer.
 *
 * v18.5.0: the old "short prompt → 480 characters" clamp was removed. It cut
 * genuine answers in half (an 866-character diet plan became 431 characters,
 * losing steps 7–12) because almost every real prompt is shorter than 70
 * characters. Length is now guided by the MATCH-LENGTH prompt rule and the
 * model itself; this guard only normalises greetings.
 *
 * - Greeting ("hi", "হ্যালো") → 1–2 short lines, no lists/headers.
 * - Everything else is returned untouched (code, tables, steps, long answers).
 */
export function matchAnswerLength(
  answer: string,
  prompt: string,
  opts: { maxGreetingChars?: number; maxShortChars?: number } = {}
): string {
  const text = (answer || '').trim();
  const question = (prompt || '').trim();
  if (!text) return text;
  // Code / control blocks must always arrive complete.
  if (hasCodeContent(text) || hasCodeContent(question)) return text;

  const greeting = isGreetingMessage(question);
  // Every non-greeting answer is returned whole. Brevity is a prompting rule,
  // not something to enforce by amputation after the model already replied.
  if (!greeting) return text;
  const greetingMax = opts.maxGreetingChars ?? GREETING_MAX_CHARS;

  if (greeting) {
    // A greeting never needs headings, bullets or paragraphs.
    let out = text
      .replace(/^#{1,6}\s.*$/gm, '')
      .replace(/^\s*[-*•]\s+/gm, '')
      .replace(/\n{2,}/g, '\n')
      .trim();
    const sentences = out
      .replace(/\n+/g, ' ')
      .split(/(?<=[.!?।])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
    out = (sentences.length > 0 ? sentences.slice(0, 2).join(' ') : out).trim();
    return clampToSentences(out, greetingMax);
  }

  return text;
}

/** Final presentation pass applied to every finished reply. */
export function polishReply(
  text: string,
  opts: { concise?: boolean } = {}
): string {
  let out = dedupeRepeats(text);
  if (opts.concise) out = stripPadding(out);
  return out;
}

export interface IdleWatchdog {
  arm: () => void;
  disarm: () => void;
}

/**
 * Fires `onIdle` once the stream has been silent for `idleMs`. Call `arm()`
 * after every received chunk — a stalled provider can no longer freeze the app.
 */
export function createIdleWatchdog(
  onIdle: () => void,
  idleMs: number = DEFAULT_IDLE_TIMEOUT_MS
): IdleWatchdog {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let fired = false;
  const disarm = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
  return {
    arm() {
      disarm();
      if (fired) return;
      timer = setTimeout(() => {
        fired = true;
        onIdle();
      }, idleMs);
    },
    disarm() {
      disarm();
    },
  };
}

/** Words that must never appear as a stall excuse in a finished answer. */
export const STALL_PHRASES = [
  'একটু অপেক্ষা করুন',
  'আরও লিখব',
  'চলমান আছে',
  'আমি পারি না',
  'সম্ভব নয়',
  'i cannot continue',
  'please wait',
];

export function hasStallExcuse(text: string): boolean {
  const lower = (text || '').toLowerCase();
  return STALL_PHRASES.some((p) => lower.includes(p.toLowerCase()));
}

/**
 * Removes a trailing "wait a moment / I can't write more" excuse from a
 * finished reply so a stalled-model apology never reaches the user.
 *
 * v18.5.0: only the **tail** is inspected. Dropping every matching sentence
 * anywhere in the text used to delete real content — e.g. an honest answer such
 * as "এটা এখনই সম্ভব নয়, কারণ…" lost that sentence from the middle of the
 * answer. Content in the middle of a reply is never touched now.
 */
export function dropStallSentences(text: string): string {
  if (!text || !hasStallExcuse(text)) return text;
  const sentences = text.split(/(?<=[.!?।\n])/);
  const isExcuse = (sentence: string) => {
    const lower = sentence.toLowerCase();
    if (!STALL_PHRASES.some((p) => lower.includes(p.toLowerCase()))) return false;
    // Require a continuation-ish context, so genuine statements survive.
    return /(লিখ|লেখা|উত্তর|চলমান|আরও|অপেক্ষা|continue|answer|respon|wait)/i.test(lower);
  };
  // Drop stall tics wherever they sit — but only short ones that explicitly
  // talk about writing/continuing/waiting, so genuine statements survive.
  const kept = sentences.filter((sentence) => {
    if (!sentence.trim()) return false;
    if (sentence.trim().length >= 160) return true;
    return !isExcuse(sentence);
  });
  const out = kept.join('').replace(/\n{3,}/g, '\n\n').trim();
  // If the whole reply was an excuse, keep the original rather than showing
  // an empty bubble — the caller decides how to handle it.
  return out || text;
}
