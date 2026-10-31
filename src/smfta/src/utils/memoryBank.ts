/**
 * SMFTA AI Pro — Memory Bank 🧠 (v18.2.0)
 *
 * The old memory was a flat 60-item array that silently dropped facts and was
 * often truncated away inside the prompt. This module makes memory reliable:
 *
 *   • 200 facts, normalised de-duplication and "key: value" merging
 *     ("পেশা: ডেভেলপার" replaces an older profession instead of piling up).
 *   • Pinning + hit counting so important facts are never evicted.
 *   • Instant local recall — "আমার নাম কী?" / "আমার পেশা কী?" is answered from
 *     memory without waiting for any model.
 *   • A compact, high-priority prompt block that is prepended (not appended) so
 *     prompt truncation can no longer erase it.
 *
 * Pure functions → fully unit-tested.
 */

export const MEMORY_MAX = 200;
export const MEMORY_PROMPT_LIMIT = 120;

export interface MemoryFact {
  text: string;
  createdAt: number;
  updatedAt: number;
  pinned?: boolean;
  hits?: number;
}

export interface MemoryState {
  facts: MemoryFact[];
  version: 2;
}

const KEY_ALIASES: Array<[string, RegExp]> = [
  ['নাম', /^(?:আমার\s*)?(?:নাম|name|আমাকে\s*ডাকা)\s*[:：]\s*(.+)$/i],
  ['পেশা', /^(?:আমার\s*)?(?:পেশা|কাজ|জব|profession|job|work)\s*[:：]\s*(.+)$/i],
  ['শহর', /^(?:আমার\s*)?(?:শহর|এলাকা|city|location|থাকা)\s*[:：]\s*(.+)$/i],
  ['দেশ', /^(?:আমার\s*)?(?:দেশ|country)\s*[:：]\s*(.+)$/i],
];

/** Lower-cases, trims punctuation and collapses spaces for comparison. */
export function normalizeFact(text: string): string {
  return (text || '')
    .toLowerCase()
    .replace(/[।.,!?;:"'“”‘’]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Pulls the "key" out of a key:value fact ("পেশা: ডেভেলপার" → "পেশা"). */
export function factKey(text: string): string {
  const t = (text || '').trim();
  for (const [key, rx] of KEY_ALIASES) {
    if (rx.test(t)) return key;
  }
  const m = t.match(/^([^:：]{2,20})[:：]\s*\S/);
  return m ? normalizeFact(m[1]) : '';
}

/** One-line value of a key:value fact. */
export function factValue(text: string): string {
  const m = (text || '').match(/^[^:：]{2,20}[:：]\s*(.+)$/);
  return m ? m[1].trim() : (text || '').trim();
}

/** Accepts either legacy string[] or the v2 object form. */
export function migrateMemory(raw: unknown): MemoryState {
  const now = Date.now();
  const list: unknown[] = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object' && Array.isArray((raw as MemoryState).facts)
    ? ((raw as MemoryState).facts as unknown[])
    : [];

  const facts: MemoryFact[] = [];
  for (const item of list) {
    if (typeof item === 'string') {
      const text = item.trim();
      if (text) facts.push({ text, createdAt: now, updatedAt: now });
      continue;
    }
    if (item && typeof item === 'object') {
      const o = item as Record<string, unknown>;
      const text = typeof o.text === 'string' ? o.text.trim() : '';
      if (!text) continue;
      facts.push({
        text,
        createdAt: typeof o.createdAt === 'number' ? o.createdAt : now,
        updatedAt: typeof o.updatedAt === 'number' ? o.updatedAt : now,
        pinned: o.pinned === true,
        hits: typeof o.hits === 'number' ? o.hits : 0,
      });
    }
  }
  return { facts: pruneFacts(facts), version: 2 };
}

/**
 * De-duplicates, merges same-key facts (newest wins), keeps pinned items and
 * trims to MEMORY_MAX with unpinned/oldest evicted first.
 */
export function pruneFacts(facts: MemoryFact[]): MemoryFact[] {
  const byKey = new Map<string, MemoryFact>();
  const byText = new Map<string, MemoryFact>();

  for (const fact of facts) {
    const key = factKey(fact.text);
    if (key) {
      const prev = byKey.get(key);
      // Same key (e.g. profession) → keep the newest value, preserve pin/hits.
      if (!prev || fact.updatedAt >= prev.updatedAt) {
        byKey.set(key, {
          ...fact,
          pinned: Boolean(fact.pinned || prev?.pinned),
          hits: Math.max(fact.hits || 0, prev?.hits || 0),
        });
      }
      continue;
    }
    const n = normalizeFact(fact.text);
    const prev = byText.get(n);
    if (!prev || fact.updatedAt >= prev.updatedAt) {
      byText.set(n, {
        ...fact,
        pinned: Boolean(fact.pinned || prev?.pinned),
        hits: Math.max(fact.hits || 0, prev?.hits || 0),
      });
    }
  }

  const merged = [...byKey.values(), ...byText.values()];
  merged.sort((a, b) => {
    if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
    return b.updatedAt - a.updatedAt;
  });

  if (merged.length <= MEMORY_MAX) return merged;

  // Keep every pinned fact, then the most recently used ones.
  const pinned = merged.filter((f) => f.pinned);
  const rest = merged.filter((f) => !f.pinned).slice(0, Math.max(0, MEMORY_MAX - pinned.length));
  return [...pinned, ...rest];
}

/** Adds facts to the bank and reports which ones were genuinely new. */
export function addFacts(
  facts: MemoryFact[],
  incoming: string[],
  opts: { source?: 'ai' | 'user' | 'auto' } = {}
): { facts: MemoryFact[]; added: string[] } {
  const now = Date.now();
  const next = [...facts];
  const added: string[] = [];

  for (const raw of incoming) {
    const text = (raw || '').replace(/\s+/g, ' ').trim().slice(0, 300);
    if (!text) continue;
    const key = factKey(text);
    const n = normalizeFact(text);
    const existingIndex = next.findIndex((f) =>
      key ? factKey(f.text) === key : normalizeFact(f.text) === n
    );

    if (existingIndex >= 0) {
      const existing = next[existingIndex];
      if (normalizeFact(existing.text) === n) {
        next[existingIndex] = { ...existing, updatedAt: now, hits: (existing.hits || 0) + 1 };
        continue;
      }
      // Same key, new value → replace (the user changed their mind).
      next[existingIndex] = {
        ...existing,
        text,
        updatedAt: now,
        hits: existing.hits || 0,
      };
      added.push(text);
      continue;
    }

    next.push({
      text,
      createdAt: now,
      updatedAt: now,
      pinned: opts.source === 'user',
      hits: 0,
    });
    added.push(text);
  }

  return { facts: pruneFacts(next), added };
}

export function removeFact(facts: MemoryFact[], text: string): MemoryFact[] {
  const n = normalizeFact(text);
  return facts.filter((f) => normalizeFact(f.text) !== n);
}

export function clearFacts(): MemoryFact[] {
  return [];
}

/** Marks a fact as "used" so the ranking knows it matters. */
export function touchFacts(facts: MemoryFact[], texts: string[]): MemoryFact[] {
  const keys = new Set(texts.map((t) => normalizeFact(t)));
  if (keys.size === 0) return facts;
  const now = Date.now();
  return facts.map((f) =>
    keys.has(normalizeFact(f.text)) ? { ...f, hits: (f.hits || 0) + 1, updatedAt: f.updatedAt } : f
  );
}

/** Flat list for storage / request payloads (most relevant first). */
export function factsToText(facts: MemoryFact[], limit = MEMORY_MAX): string[] {
  return facts.slice(0, limit).map((f) => f.text);
}

/**
 * Compact, high-priority prompt block. Kept short (prompt budget!) and placed
 * at the very top of the system instruction by the server.
 */
export function buildMemoryPromptBlock(
  facts: MemoryFact[],
  opts: { userName?: string; limit?: number; maxChars?: number } = {}
): string {
  const limit = opts.limit ?? MEMORY_PROMPT_LIMIT;
  const maxChars = opts.maxChars ?? 1400;
  const pinned = facts.filter((f) => f.pinned);
  const ranked = [
    ...pinned,
    ...facts
      .filter((f) => !f.pinned)
      .slice()
      .sort((a, b) => (b.hits || 0) - (a.hits || 0) || b.updatedAt - a.updatedAt),
  ];
  const lines: string[] = [];
  let used = 0;
  for (const fact of ranked.slice(0, limit)) {
    const line = `- ${fact.text}`;
    if (used + line.length + 1 > maxChars) continue;
    lines.push(line);
    used += line.length + 1;
  }
  if (lines.length === 0 && !opts.userName) return '';
  return (
    `\nMEMORY (authoritative — the user told you these; recall them instantly and never claim you forgot):` +
    (opts.userName ? `\n- ইউজারের নাম: ${opts.userName}` : '') +
    (lines.length ? `\n${lines.join('\n')}` : '')
  );
}

const RECALL_PATTERNS: Array<{ rx: RegExp; key: string; label: string }> = [
  // Name — anchored at the end so "আমার নাম কীভাবে বদলাবো?" is NOT a recall.
  {
    rx: /(?:আমার|my)\s*(?:নাম|name)\s*(?:কী|কি|what|কে)?\s*[।?!.]*$/i,
    key: 'নাম',
    label: 'আপনার নাম',
  },
  { rx: /what(?:'s| is)\s+my\s+name\s*[।?!.]*$/i, key: 'নাম', label: 'আপনার নাম' },
  { rx: /(?:আমাকে|আমার)\s*নাম\s*(?:মনে|জানো)/i, key: 'নাম', label: 'আপনার নাম' },
  // Profession
  {
    rx: /(?:আমার|my)\s*(?:পেশা|কাজ|জব|job|profession)\s*(?:কী|কি|what)?\s*[।?!.]*$/i,
    key: 'পেশা',
    label: 'আপনার পেশা',
  },
  {
    rx: /(?:আমি|i)\s*(?:কী|কি|what)\s*(?:কাজ|do)\s*(?:করি|করে|for a living)\s*[।?!.]*$/i,
    key: 'পেশা',
    label: 'আপনার পেশা',
  },
  {
    rx: /what(?:'s| is)?\s+my\s+(?:job|profession|work)\s*[।?!.]*$|what do i do\s*[।?!.]*$/i,
    key: 'পেশা',
    label: 'আপনার পেশা',
  },
  // City / location
  {
    rx: /(?:আমার|my)\s*(?:শহর|এলাকা|city|location)\s*(?:কী|কি|what|কোথায়)?\s*[।?!.]*$/i,
    key: 'শহর',
    label: 'আপনার শহর',
  },
  { rx: /(?:আমি|i)\s*(?:কোন|which)\s*(?:শহরে|city|town)/i, key: 'শহর', label: 'আপনার শহর' },
  { rx: /where\s+do\s+i\s+live|where am i (?:from|located)/i, key: 'শহর', label: 'আপনার শহর' },
  // Country
  {
    rx: /(?:আমার|my)\s*(?:দেশ|country)\s*(?:কী|কি|what)?\s*[।?!.]*$/i,
    key: 'দেশ',
    label: 'আপনার দেশ',
  },
];

/**
 * Answers a personal question straight from memory (0 ms, no model).
 * Returns null when the question is not a simple recall.
 */
export function recallFromMemory(
  query: string,
  facts: MemoryFact[],
  profileName?: string
): string | null {
  const q = (query || '').trim();
  if (!q || q.length > 120) return null;

  for (const { rx, key, label } of RECALL_PATTERNS) {
    if (!rx.test(q)) continue;
    if (key === 'নাম' && profileName && profileName.trim()) {
      return `আপনার নাম **${profileName.trim()}**।`;
    }
    const hit =
      facts.find((f) => factKey(f.text) === key) ||
      facts.find((f) => normalizeFact(f.text).includes(normalizeFact(key)));
    if (hit) {
      return `${label} **${factValue(hit.text)}**।`;
    }
    return null;
  }

  // "আমি কী কী মনে রেখেছো?"
  if (/(?:কী কী মনে|মনে রেখেছ|মেমোরি দেখাও|what do you remember|what do you know about me)/i.test(q)) {
    if (facts.length === 0) return 'মেমোরি এখনো খালি — “মনে রাখো …” লিখে আমাকে কিছু বলুন।';
    const top = facts.slice(0, 12).map((f, i) => `${i + 1}. ${f.text}`);
    return `**আমি যা মনে রেখেছি (${facts.length})**\n${top.join('\n')}`;
  }

  return null;
}

/** Extra auto-detection patterns (name, job, city, likes, goals, birthday). */
export function extractMemoryCandidates(text: string): string[] {
  const clean = (text || '').trim();
  if (!clean) return [];
  const out: string[] = [];
  const push = (key: string, value?: string) => {
    const v = (value || '').trim().replace(/[।.,!?]+$/, '');
    if (v.length >= 2 && v.length <= 80) out.push(`${key}: ${v}`);
  };

  const patterns: Array<{ key: string; rx: RegExp }> = [
    { key: 'নাম', rx: /(?:আমার\s*নাম|my name is|i am|i'm)\s+([^\n।.,!?]{2,40})/i },
    { key: 'পেশা', rx: /(?:আমি\s*(?:একজন|একটি|পেশায়)|i\s*(?:work as|am a|am an)|my profession is)\s+([^\n।.,!?]{2,40})/i },
    { key: 'শহর', rx: /(?:আমি|i)\s*(?:থাকি|live in|living in)\s+([^\n।.,!?]{2,40})/i },
    { key: 'পছন্দ', rx: /(?:আমার\s*পছন্দ|আমি\s*ভালোবাসি|আমার\s*প্রিয়|i like|i love|my favorite)\s+([^\n।.,!?]{2,60})/i },
    { key: 'লক্ষ্য', rx: /(?:আমার\s*লক্ষ্য|আমি\s*চাই|my goal is|i want to)\s+([^\n।.,!?]{3,60})/i },
    { key: 'জন্মদিন', rx: /(?:আমার\s*জন্মদিন|my birthday is)\s+([^\n।.,!?]{2,40})/i },
    { key: 'ভাষা', rx: /(?:আমি\s*বাংলায়|i speak|my language is)\s+([^\n।.,!?]{2,30})/i },
    { key: 'ব্যবসা', rx: /(?:আমার\s*(?:ব্যবসা|দোকান|কোম্পানি)|my (?:business|shop|company) is)\s+([^\n।.,!?]{2,50})/i },
  ];

  for (const { key, rx } of patterns) {
    const m = clean.match(rx);
    if (m && m[1]) push(key, m[1]);
  }

  // A name the user states twice in a row is usually a real introduction.
  const nameDirect = clean.match(/^(?:আমার\s*নাম|my name is)\s+([A-Za-z\u0980-\u09FF ]{2,40})$/i);
  if (nameDirect) push('নাম', nameDirect[1]);

  return Array.from(new Set(out));
}

/**
 * Rejects passwords, API keys, Bearer tokens, or secret credentials from being stored in memory.
 */
export function isSensitiveFact(text: string): boolean {
  if (!text) return false;
  const sensitiveRegexes = [
    /(?:password|passcode|passwd|secret_key|private_key|token|api_key|access_token|refresh_token)\s*[:=]\s*[^\s]+/i,
    /\b(?:sk-[a-zA-Z0-9_-]{20,}|ghp_[a-zA-Z0-9]{20,}|gho_[a-zA-Z0-9]{20,}|AIza[0-9A-Za-z-_]{35}|eyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,})\b/,
    /\bBearer\s+[a-zA-Z0-9_\-\.]{20,}\b/i,
    /(?:পাসওয়ার্ড|সিক্রেট|পিন\s*কোড|গোপন\s*কোড)\s*[:=]/i,
  ];
  return sensitiveRegexes.some((rx) => rx.test(text));
}

/**
 * Smart semantic & token relevance ranking to inject only pertinent memory facts into context.
 */
export function retrieveRelevantMemories(
  query: string,
  rawFacts: Array<MemoryFact | string>,
  limit = 8
): string[] {
  const q = (query || '').toLowerCase().trim();
  const normalizedFacts = rawFacts.map((f) => {
    if (typeof f === 'string') {
      const isPinned = f.startsWith('📌 ');
      return {
        text: isPinned ? f.slice(3) : f,
        pinned: isPinned,
        raw: f,
      };
    }
    return {
      text: f.text,
      pinned: Boolean(f.pinned),
      raw: f.pinned ? `📌 ${f.text}` : f.text,
    };
  });

  if (!q) {
    // Return pinned facts followed by latest
    return normalizedFacts
      .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0))
      .slice(0, limit)
      .map((f) => f.raw);
  }

  const qTokens = q.split(/[\s,।!?.]+/).filter((t) => t.length > 2);

  const scored = normalizedFacts.map((item) => {
    let score = item.pinned ? 5 : 0;
    const lower = item.text.toLowerCase();
    if (lower.includes(q)) {
      score += 10;
    }
    for (const t of qTokens) {
      if (lower.includes(t)) {
        score += 2;
      }
    }
    return { item, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.item.raw);
}

/**
 * User CRUD Helper: Add manual fact with sensitivity check.
 */
export function addManualMemoryFact(
  facts: string[],
  newFact: string
): { updated: string[]; error?: string } {
  const clean = (newFact || '').trim();
  if (!clean) return { updated: facts, error: 'Empty fact cannot be saved' };
  if (isSensitiveFact(clean)) {
    return { updated: facts, error: 'Sensitive credentials or keys cannot be saved to memory' };
  }
  const norm = normalizeFact(clean.startsWith('📌 ') ? clean.slice(3) : clean);
  const exists = facts.some((f) => normalizeFact(f.startsWith('📌 ') ? f.slice(3) : f) === norm);
  if (exists) {
    return { updated: facts, error: 'This fact is already in memory' };
  }
  return { updated: [clean, ...facts] };
}

/**
 * User CRUD Helper: Update existing fact with sensitivity check.
 */
export function updateMemoryFact(
  facts: string[],
  oldFact: string,
  newFact: string
): { updated: string[]; error?: string } {
  const clean = (newFact || '').trim();
  if (!clean) return { updated: facts, error: 'Empty fact cannot be saved' };
  if (isSensitiveFact(clean)) {
    return { updated: facts, error: 'Sensitive credentials or keys cannot be saved to memory' };
  }
  const index = facts.indexOf(oldFact);
  if (index === -1) {
    return { updated: facts, error: 'Original fact not found' };
  }
  const next = [...facts];
  next[index] = clean;
  return { updated: next };
}

/**
 * User CRUD Helper: Delete a single fact.
 */
export function deleteMemoryFact(facts: string[], factToDelete: string): string[] {
  return facts.filter((f) => f !== factToDelete);
}

/**
 * User CRUD Helper: Toggle pinned status on a fact.
 */
export function toggleMemoryPin(facts: string[], factText: string): string[] {
  const index = facts.indexOf(factText);
  if (index === -1) return facts;
  const isPinned = factText.startsWith('📌 ');
  const toggled = isPinned ? factText.slice(3) : `📌 ${factText}`;
  const next = [...facts];
  next[index] = toggled;
  return next;
}

/**
 * User CRUD Helper: Search memory facts by text keyword.
 */
export function searchMemoryFacts(facts: string[], query: string): string[] {
  const q = (query || '').toLowerCase().trim();
  if (!q) return facts;
  return facts.filter((f) => f.toLowerCase().includes(q));
}
