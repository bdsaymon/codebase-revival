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

export const MASTER_PROFILE_NAME = 'SAYMON HASAN';
export const MASTER_PROFILE_FACTS: string[] = [
  'নাম: SAYMON HASAN',
  'পরিচয়: Full-Stack Web & Android Developer from Saudi Arabia',
  'ব্র্যান্ড: MSFTASHOP',
  'নিয়ম: Reply in the user language (clear Bengali for Bengali prompts). Deliver complete, thorough answers for detailed information, long writing, UI/web design, and code update requests without truncation, and never break existing systems.',
];

export const MASTER_PROFILE_PROMPT_BASELINE = [
  'PERMANENT MASTER USER PROFILE & CORE RULES (ALWAYS REMEMBER & FOLLOW):',
  '- User Name: SAYMON HASAN',
  '- Identity & Location: Full-Stack Web & Android Developer from Saudi Arabia (Brand: MSFTASHOP)',
  '- Reply Rule: Match the user language (clear Bengali for Bengali prompts). Deliver thorough, complete, richly structured answers whenever large writing, deep information, designs, builds, or code updates are requested.',
  '- Code & Design Rule: When asked to design, build, create, or update apps, websites, UI layouts, components, or code, provide complete, full-scale working code with zero truncation or placeholders. Omit code blocks only on purely non-technical questions.',
  '- Safety Rule: Never break existing systems or features.',
].join('\n');

/**
 * Ensures SAYMON HASAN's permanent master profile facts are pinned in the memory list
 * without duplicating existing entries.
 */
export function ensureMasterProfileMemory(raw: unknown): string[] {
  const migrated = migrateMemory(raw).facts;
  const { facts: merged } = addFacts(migrated, MASTER_PROFILE_FACTS, {
    source: 'user',
  });
  return factsToText(merged, MEMORY_MAX);
}

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
 * Deduplicates facts by normalized text and by structured `key: value` prefix
 * so obsolete or conflicting facts (e.g. older `নাম: ...` entries) never pollute prompts.
 */
export function deduplicateFactsList(facts: MemoryFact[]): MemoryFact[] {
  const seenNorm = new Set<string>();
  const seenKeys = new Set<string>();
  const out: MemoryFact[] = [];
  for (const fact of facts) {
    const cleanText = (fact.text || '').replace(/^📌\s*/, '').trim();
    if (!cleanText) continue;
    const norm = normalizeFact(cleanText);
    if (!norm || seenNorm.has(norm)) continue;
    const key = factKey(cleanText);
    const hasExplicitKeyValue = cleanText.includes(':') || cleanText.includes('—') || cleanText.includes('=');
    if (hasExplicitKeyValue && key && seenKeys.has(key)) {
      continue;
    }
    seenNorm.add(norm);
    if (hasExplicitKeyValue && key) {
      seenKeys.add(key);
    }
    out.push(fact);
  }
  return out;
}

/**
 * Compact, context-aware prompt block. Filters facts against the current
 * conversation topic (`activeQuery`) and prevents obsolete, duplicated, or
 * conflicting facts from polluting the prompt.
 */
export function buildMemoryPromptBlock(
  facts: MemoryFact[],
  opts: { userName?: string; limit?: number; maxChars?: number; activeQuery?: string } = {}
): string {
  const limit = opts.limit ?? MEMORY_PROMPT_LIMIT;
  const maxChars = opts.maxChars ?? 1400;
  const deduped = deduplicateFactsList(facts);

  let candidateTexts: string[];
  if (typeof opts.activeQuery === 'string' && opts.activeQuery.trim().length > 0) {
    candidateTexts = retrieveRelevantMemories(opts.activeQuery, deduped, limit);
  } else {
    const pinned = deduped.filter((f) => f.pinned);
    const ranked = [
      ...pinned,
      ...deduped
        .filter((f) => !f.pinned)
        .slice()
        .sort((a, b) => (b.hits || 0) - (a.hits || 0) || b.updatedAt - a.updatedAt),
    ];
    candidateTexts = ranked.slice(0, Math.min(limit, 12)).map((f) => f.text);
  }

  const lines: string[] = [];
  let used = 0;
  for (const text of candidateTexts.slice(0, limit)) {
    const line = `- ${text}`;
    if (used + line.length + 1 > maxChars) continue;
    lines.push(line);
    used += line.length + 1;
  }
  if (lines.length === 0 && !opts.userName) return '';
  return (
    `\nMEMORY (context-relevant user facts — use naturally when relevant):` +
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
  // Skip large pasted notes/documents so auto-memory never freezes or extracts noise.
  if (
    !clean ||
    clean.length > 450 ||
    (clean.includes('\n') && clean.split('\n').length > 6 && clean.length > 260)
  ) {
    return [];
  }
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
 * Rejects passwords, API keys, Bearer tokens, financial numbers, NID/passport IDs,
 * and private health/sensitive details from being stored in memory.
 */
export function isSensitiveFact(text: string): boolean {
  if (!text) return false;
  const sensitiveRegexes = [
    /(?:password|passcode|passwd|secret_key|private_key|token|api_key|access_token|refresh_token|cvv|pin)\s*[:=]\s*[^\s]+/i,
    /\b(?:sk-[a-zA-Z0-9_-]{20,}|ghp_[a-zA-Z0-9]{20,}|gho_[a-zA-Z0-9]{20,}|AIza[0-9A-Za-z-_]{35}|eyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,})\b/,
    /\bBearer\s+[a-zA-Z0-9_\-\.]{20,}\b/i,
    /(?:পাসওয়ার্ড|সিক্রেট|পিন\s*কোড|গোপন\s*কোড|ব্যাংক\s*অ্যাকাউন্ট|কার্ড\s*নম্বর|ক্রেডিট\s*কার্ড|ডেবিট\s*কার্ড|পাসপোর্ট|এনআইডি|জাতীয়\s*পরিচয়পত্র)\s*[:=ঃ\-]/i,
    /\b(?:\d[ -]*?){13,19}\b/, // Credit / debit card or long account number pattern
    /\b(?:IBAN|SWIFT|routing\s*(?:number|no)|account\s*(?:number|no)|nid|passport(?:\s*no|\s*number)?|ssn)\s*[:=#-]?\s*[a-zA-Z0-9-]{6,}/i,
    /(?:ব্লাড\s*গ্রুপ|ডায়াবেটিস|রোগ|চিকিৎসা|প্রেসক্রিপশন|হেলথ|মেডিকেল\s*রিপোর্ট|diagnosis|prescription|blood\s*pressure|medical\s*record|mental\s*health)/i,
  ];
  return sensitiveRegexes.some((rx) => rx.test(text));
}

/**
 * Parses an AI extraction response (strict JSON array or `{ facts: [...] }`) safely,
 * rejecting any sensitive items and truncating overly long text.
 */
export function parseExtractedMemoriesJson(rawText: string): string[] {
  const raw = (rawText || '').trim();
  if (!raw) return [];
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  let parsed: unknown = null;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const arrMatch = cleaned.match(/\[[\s\S]*\]/);
    if (arrMatch) {
      try {
        parsed = JSON.parse(arrMatch[0]);
      } catch {
        parsed = null;
      }
    }
  }

  let items: unknown[] = [];
  if (Array.isArray(parsed)) {
    items = parsed;
  } else if (parsed && typeof parsed === 'object') {
    const obj = parsed as Record<string, unknown>;
    if (Array.isArray(obj.facts)) items = obj.facts;
    else if (Array.isArray(obj.memories)) items = obj.memories;
    else if (Array.isArray(obj.items)) items = obj.items;
  }

  const out: string[] = [];
  for (const item of items) {
    let line = '';
    if (typeof item === 'string') {
      line = item.trim();
    } else if (item && typeof item === 'object') {
      const o = item as Record<string, unknown>;
      const k = typeof o.key === 'string' ? o.key.trim() : typeof o.category === 'string' ? o.category.trim() : '';
      const v = typeof o.value === 'string' ? o.value.trim() : typeof o.fact === 'string' ? o.fact.trim() : typeof o.text === 'string' ? o.text.trim() : '';
      if (k && v && !v.includes(':')) line = `${k}: ${v}`;
      else line = v;
    }
    line = line.replace(/\s+/g, ' ').trim().slice(0, 240);
    if (!line || line.length < 3 || isSensitiveFact(line)) continue;
    out.push(line);
  }
  return Array.from(new Set(out)).slice(0, 10);
}

/**
 * Merges incoming AI-extracted facts into an existing flat `string[]` memory list,
 * updating same-key entries rather than creating duplicates and preserving pins.
 */
export function mergeExtractedMemories(
  existingFacts: string[],
  incomingFacts: string[],
  maxCount = MEMORY_MAX
): { updated: string[]; added: string[] } {
  const safeIncoming = (incomingFacts || []).filter((f) => f && !isSensitiveFact(f));
  if (safeIncoming.length === 0) {
    return { updated: existingFacts, added: [] };
  }
  const migrated = migrateMemory(existingFacts).facts;
  const { facts, added } = addFacts(migrated, safeIncoming, { source: 'ai' });
  return {
    updated: factsToText(facts, maxCount),
    added,
  };
}

/**
 * Smart semantic & token relevance ranking to inject only pertinent memory facts into context.
 * Deduplicates conflicting/duplicate facts and filters out unrelated facts that do not match
 * the active conversation topic (unless pinned or core identity).
 */
export function retrieveRelevantMemories(
  query: string,
  rawFacts: Array<MemoryFact | string>,
  limit = 8
): string[] {
  const q = (query || '').toLowerCase().trim();
  const seenNorm = new Set<string>();
  const seenKeys = new Set<string>();

  const normalizedFacts: Array<{ text: string; pinned: boolean; raw: string; key: string }> = [];
  for (const f of rawFacts) {
    const rawStr = typeof f === 'string' ? f : f.pinned ? `📌 ${f.text}` : f.text;
    const isPinned = typeof f === 'string' ? f.startsWith('📌 ') : Boolean(f.pinned) || f.text.startsWith('📌 ');
    const cleanText = (typeof f === 'string' ? (isPinned ? f.slice(3) : f) : f.text.replace(/^📌\s*/, '')).trim();
    if (!cleanText || isSensitiveFact(cleanText)) continue;

    const norm = normalizeFact(cleanText);
    if (!norm || seenNorm.has(norm)) continue;

    const key = factKey(cleanText);
    const hasExplicitKeyValue = cleanText.includes(':') || cleanText.includes('—') || cleanText.includes('=');
    if (hasExplicitKeyValue && key && seenKeys.has(key)) {
      continue;
    }
    seenNorm.add(norm);
    if (hasExplicitKeyValue && key) {
      seenKeys.add(key);
    }

    normalizedFacts.push({
      text: cleanText,
      pinned: isPinned,
      raw: rawStr,
      key,
    });
  }

  if (!q) {
    return normalizedFacts
      .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0))
      .slice(0, limit)
      .map((f) => f.raw);
  }

  const isExplicitMemoryQuery =
    /(?:মনে|মেমোরি|memory|remember|know about me|আমার সম্পর্কে|who am i|what is my|আমার\s*(?:নাম|পেশা|শহর|দেশ|লক্ষ্য|পছন্দ|ব্যবসা))/i.test(
      q
    );
  const coreIdentityKeys = new Set(['নাম', 'পেশা', 'ভাষা', 'name', 'profession', 'language', 'role']);
  const stopWords = new Set([
    'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had', 'her', 'was', 'one',
    'our', 'out', 'day', 'get', 'has', 'him', 'his', 'how', 'man', 'new', 'now', 'old', 'see',
    'two', 'way', 'who', 'boy', 'did', 'its', 'let', 'put', 'say', 'she', 'too', 'use', 'what',
    'when', 'where', 'which', 'with', 'this', 'that', 'from', 'have', 'আমি', 'তুমি', 'আপনি',
    'আমার', 'তোমার', 'কী', 'কি', 'কেন', 'কিভাবে', 'কখন', 'একটি', 'একটা', 'জন্য', 'এবং', 'করে', 'করো',
  ]);
  const qTokens = q
    .split(/[\s,।!?.:;'"()[\]{}\-_/]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !stopWords.has(t));

  const scored = normalizedFacts.map((item) => {
    let score = 0;
    if (item.pinned) score += 6;
    if (coreIdentityKeys.has(item.key)) score += 2;
    if (isExplicitMemoryQuery) score += 4;

    const lower = item.text.toLowerCase();
    if (q.length >= 3 && lower.includes(q)) {
      score += 12;
    }
    for (const t of qTokens) {
      if (lower.includes(t)) {
        score += 4;
      }
    }
    return { item, score };
  });

  const relevant = scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  return relevant.slice(0, limit).map((s) => s.item.raw);
}

/**
 * Completely wipes both primary and backup memory keys from localStorage.
 */
export function clearEntireMemoryBank(): void {
  try {
    localStorage.removeItem('smfta_memory');
    localStorage.removeItem('smfta_memory_backup');
  } catch (e) {
    console.warn('Failed to clear memory localStorage', e);
  }
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
