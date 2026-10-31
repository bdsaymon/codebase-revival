import crypto from 'node:crypto';

export interface CacheKeyInput {
  system: string;
  prompt: string;
  model: string;
  mode: string;
  lang: string;
  userId?: string;
}

interface CacheEntry {
  response: string;
  timestamp: number;
  hits: number;
  userId: string;
}

const MAX_CACHE_ENTRIES = 200;
const CACHE_TTL_MS = 1000 * 60 * 30; // 30 minutes
const responseCache = new Map<string, CacheEntry>();

export function computeResponseCacheKey(input: CacheKeyInput): string {
  const canonical = JSON.stringify({
    userId: String(input.userId || 'default').trim(),
    system: String(input.system || ''),
    prompt: String(input.prompt || '').trim(),
    model: String(input.model || 'default').trim().toLowerCase(),
    mode: String(input.mode || 'balanced').trim().toLowerCase(),
    lang: String(input.lang || 'auto').trim().toLowerCase(),
  });
  return crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
}

export function getCachedResponse(
  prompt: string,
  mode = 'balanced',
  replyLang = 'auto',
  systemInstruction = '',
  model = 'default',
  userId = 'default'
): string | null {
  const key = computeResponseCacheKey({
    userId,
    system: systemInstruction,
    prompt,
    model,
    mode,
    lang: replyLang,
  });
  const entry = responseCache.get(key);
  if (!entry) return null;

  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    responseCache.delete(key);
    return null;
  }

  // Refresh LRU order
  responseCache.delete(key);
  entry.hits += 1;
  responseCache.set(key, entry);
  return entry.response;
}

export function setCachedResponse(
  prompt: string,
  response: string,
  mode = 'balanced',
  replyLang = 'auto',
  systemInstruction = '',
  model = 'default',
  userId = 'default'
): void {
  const clean = (response || '').trim();
  if (!clean || clean.length < 4) return;
  const key = computeResponseCacheKey({
    userId,
    system: systemInstruction,
    prompt,
    model,
    mode,
    lang: replyLang,
  });

  if (!responseCache.has(key) && responseCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = responseCache.keys().next().value;
    if (oldestKey !== undefined) {
      responseCache.delete(oldestKey);
    }
  }

  responseCache.set(key, {
    response: clean,
    timestamp: Date.now(),
    hits: 1,
    userId: String(userId || 'default').trim(),
  });
}

export function clearResponseCache(userId?: string): { clearedEntries: number } {
  if (!userId) {
    const count = responseCache.size;
    responseCache.clear();
    return { clearedEntries: count };
  }
  const cleanUser = userId.trim();
  let removed = 0;
  for (const [k, v] of responseCache.entries()) {
    if (v.userId === cleanUser) {
      responseCache.delete(k);
      removed += 1;
    }
  }
  return { clearedEntries: removed };
}

export function getResponseCacheSize(): number {
  return responseCache.size;
}

export function getMaxResponseCacheSize(): number {
  return MAX_CACHE_ENTRIES;
}

