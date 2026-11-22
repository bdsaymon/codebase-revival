import { performance } from 'node:perf_hooks';
import { Router, Request, Response } from '../runtime/express';
import {
  buildXrahatPrompt,
  buildXrahatUrl,
  extractXrahatReply,
  parseXrahatDelta,
  parseXrahatSseEvent,
  resolveEffectiveProvider,
  sanitizeProprietaryOutput,
} from '../providers';
import { buildSystemInstruction } from '../systemPrompt';
import {
  buildAdHocProviderConfig,
  callBackendEngine,
  normalizeGeminiModelName,
  sanitizeErrorMsg,
} from '../aiClient';
import {
  classifyPromptComplexity,
  hasUnclosedArtifactTag,
  hasUnclosedCodeFence,
  hasUnclosedHtmlDocument,
  INSTANT_GREETING_REGEX,
  interceptIdentityQuery,
  isLongCodeOrWritingRequest,
  matchTrainedWeights,
  retrainModelWeights,
} from '../intentRules';
import { resolveActiveSystemLabel } from '../../src/utils/creatorIdentity';
import {
  getCachedResponse,
  setCachedResponse,
} from '../responseCache';
import {
  getSharedHardenedEngine,
  formatActionableProviderError,
  type AttemptRecord,
} from '../engine/router';
import { verifyConnectionTargetSafe } from '../engine/config';
import { parseCustomParamsSafe } from '../engine/adapters';
import { SERVER_KEY_DAILY_CAP_REACHED_MESSAGE_BN } from '../engine/defaults';
import { sanitizeChatBody } from '../engine/requestGuard';
import type { CanonicalMessage } from '../engine/context';
import { supportsNativeThinking } from '../engine/thinking';
import {
  continuationDirective,
  createIdleWatchdog,
  looksTruncated,
  mergeContinuationText,
  MAX_AUTO_CONTINUATIONS,
} from '../../src/utils/streamGuard';
import { parseExtractedMemoriesJson, isSensitiveFact } from '../../src/utils/memoryBank';
import { isLovableAiAvailable, streamFromLovableAi } from '../runtime/lovableAi';
import {
  isV2ModelId,
  getV2ModelSpec,
  V2ModelId,
} from '../../src/utils/v2UsageLimits';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import {
  checkAndConsumeServerV2Quota,
  getAllV2ModelStatusesForUser,
  getV2GeminiApiKey,
  isServerAuthorizedTester,
  setServerV2UsageCountForTesting,
  streamV2FirebaseModel,
  updateServerV2QuotaConfig,
} from '../v2FirebaseAi';
import {
  retrieveRelevantV2Memories,
  retrieveV2RagContext,
} from '../v2Rag';

export const chatRouter = Router();

// ============================================================================
// BOUNDED UID SESSION STORE (Phase 1.8)
// Capped at 5,000 entries, 6-hour idle TTL, periodic .unref()'d sweep timer
// ============================================================================
export interface UidSessionEntry {
  uid: string;
  updatedAt: number;
}

export const UID_SESSION_MAX_ENTRIES = 5_000;
export const UID_SESSION_TTL_MS = 6 * 60 * 60 * 1_000; // 6 hours
export const uidSessionStore = new Map<string, UidSessionEntry>();

export function sweepExpiredUidSessions(now = Date.now()): number {
  let removed = 0;
  for (const [key, entry] of uidSessionStore.entries()) {
    if (now - entry.updatedAt >= UID_SESSION_TTL_MS) {
      uidSessionStore.delete(key);
      removed += 1;
    }
  }
  return removed;
}

const uidSweepTimer = setInterval(() => {
  sweepExpiredUidSessions();
}, 10 * 60 * 1_000);
if (typeof uidSweepTimer.unref === 'function') {
  uidSweepTimer.unref();
}

export function getOrCreateSessionUid(
  sessionId?: string | number,
  rotate = false,
  now = Date.now()
): string {
  const key = String(sessionId || 'default-session').slice(0, 128);
  const existing = uidSessionStore.get(key);
  if (!rotate && existing && now - existing.updatedAt < UID_SESSION_TTL_MS) {
    existing.updatedAt = now;
    // Refresh insertion order for FIFO/LRU eviction
    uidSessionStore.delete(key);
    uidSessionStore.set(key, existing);
    return existing.uid;
  }

  if (!uidSessionStore.has(key) && uidSessionStore.size >= UID_SESSION_MAX_ENTRIES) {
    sweepExpiredUidSessions(now);
    if (uidSessionStore.size >= UID_SESSION_MAX_ENTRIES) {
      const oldestKey = uidSessionStore.keys().next().value;
      if (oldestKey !== undefined) {
        uidSessionStore.delete(oldestKey);
      }
    }
  }

  const fresh = `smfta-${now.toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
  uidSessionStore.set(key, { uid: fresh, updatedAt: now });
  return fresh;
}

export function buildContextualThinkingTrace(
  userText: string,
  replyLang: string = 'auto',
  modelLabel: string = 'SMFTA AI Pro',
  effort: 'low' | 'medium' | 'high' = 'medium'
): string {
  const clean = String(userText || '')
    .replace(/⟦FILE:[^\n⟧]+⟧[\s\S]*?⟦\/FILE⟧/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const snippet = clean.length > 90 ? `${clean.slice(0, 87).trimEnd()}...` : clean || 'Request';
  const hasBengali = /[\u0980-\u09FF]/.test(clean) || replyLang === 'bn';
  const isCodeOrDesign =
    /\b(code|html|css|js|javascript|typescript|react|tailwind|python|api|bug|fix|error|ui|design|website|app|component|function|database|sql)\b|কোড|ডিজাইন|ওয়েবসাইট|অ্যাপ|বাগ|আপডেট|তৈরি/i.test(
      clean
    );

  if (hasBengali) {
    const steps = [
      `১. ব্যবহারকারীর অনুরোধ বিশ্লেষণ করছি: "${snippet}"`,
      isCodeOrDesign
        ? `২. সম্পূর্ণ আর্কিটেকচার, কোড স্ট্রাকচার এবং প্রোডাকশন-রেডি ডিজাইন পরিকল্পনা সাজাচ্ছি (${modelLabel} · ${effort.toUpperCase()})।`
        : `২. প্রাসঙ্গিক তথ্য, মূল পয়েন্ট এবং যুক্তিগুলো ধাপে ধাপে যাচাই করছি (${modelLabel} · ${effort.toUpperCase()})।`,
    ];
    if (effort === 'high' || isCodeOrDesign) {
      steps.push(
        '৩. কোনো অংশ যেন বাদ না পড়ে তা নিশ্চিত করে স্পষ্ট, নির্ভুল ও সম্পূর্ণ উত্তর প্রস্তুত করছি।'
      );
    }
    return steps.join('\n');
  }

  const steps = [
    `1. Analyzing request intent & constraints: "${snippet}"`,
    isCodeOrDesign
      ? `2. Structuring complete architecture, edge cases, and production-grade implementation (${modelLabel} · ${effort.toUpperCase()}).`
      : `2. Synthesizing key facts, logical structure, and clear explanation (${modelLabel} · ${effort.toUpperCase()}).`,
  ];
  if (effort === 'high' || isCodeOrDesign) {
    steps.push(
      '3. Verifying completeness and formatting a thorough, well-structured response.'
    );
  }
  return steps.join('\n');
}

async function streamFromXrahat(
  systemInstruction: string,
  history: Array<{ role: string; content: string }>,
  uid: string,
  signal: AbortSignal,
  emitDelta: (delta: string) => void,
  emitChunked?: (fullText: string) => Promise<void>
): Promise<boolean> {
  const promptText = buildXrahatPrompt(systemInstruction, history);
  if (!promptText) return false;

  const deliverChunked = async (text: string) => {
    if (!text) return;
    if (emitChunked) {
      await emitChunked(text);
    } else {
      emitDelta(text);
    }
  };

  const XRAHAT_IDLE_TIMEOUT_MS = 20_000;
  const localAbort = new AbortController();
  const onParentAbort = () => localAbort.abort(signal.reason);
  signal.addEventListener('abort', onParentAbort, { once: true });
  const watchdog = createIdleWatchdog(() => {
    if (!localAbort.signal.aborted) {
      localAbort.abort(new Error('Xrahat stream timed out'));
    }
  }, XRAHAT_IDLE_TIMEOUT_MS);

  const streamUrl = buildXrahatUrl(promptText, uid, true);
  let emitted = false;
  let fallbackResetText = '';

  try {
    watchdog.arm();
    const res = await fetch(streamUrl, {
      method: 'GET',
      headers: { Accept: 'text/event-stream, application/json' },
      signal: localAbort.signal,
    });

    if (res.ok && res.body) {
      const contentType = (res.headers.get('content-type') || '').toLowerCase();
      if (contentType.includes('application/json')) {
        const json = await res.json().catch(() => null);
        watchdog.disarm();
        const reply = extractXrahatReply(json);
        if (reply) {
          await deliverChunked(reply);
          return true;
        }
      } else {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          watchdog.arm();
          const { done, value } = await reader.read();
          if (done) {
            buffer += decoder.decode();
            break;
          }
          watchdog.arm();
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split(/\r?\n/);
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data:')) continue;
            const dataStr = trimmed.slice(5).trim();
            if (dataStr === '[DONE]') break;
            const evt = parseXrahatSseEvent(dataStr);
            if (evt.delta) {
              if (evt.delta.length > 90 && emitChunked) {
                await emitChunked(evt.delta);
              } else {
                emitDelta(evt.delta);
              }
              emitted = true;
            } else if (evt.reset) {
              fallbackResetText = evt.reset;
            }
          }
        }
        watchdog.disarm();
        if (buffer.trim()) {
          for (const line of buffer.split(/\r?\n/)) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data:')) continue;
            const dataStr = trimmed.slice(5).trim();
            if (dataStr === '[DONE]') break;
            const evt = parseXrahatSseEvent(dataStr);
            if (evt.delta) {
              if (evt.delta.length > 90 && emitChunked) {
                await emitChunked(evt.delta);
              } else {
                emitDelta(evt.delta);
              }
              emitted = true;
            } else if (evt.reset) {
              fallbackResetText = evt.reset;
            }
          }
        }
        if (!emitted && fallbackResetText) {
          await deliverChunked(fallbackResetText);
          emitted = true;
        }
        if (emitted) return true;
      }
    }
  } catch {
    if (signal.aborted) {
      watchdog.disarm();
      signal.removeEventListener('abort', onParentAbort);
      return emitted;
    }
  } finally {
    watchdog.disarm();
  }

  if (!emitted && !signal.aborted) {
    const jsonCtrl = new AbortController();
    const onJsonParentAbort = () => jsonCtrl.abort(signal.reason);
    signal.addEventListener('abort', onJsonParentAbort, { once: true });
    const jsonTimer = setTimeout(() => jsonCtrl.abort(), XRAHAT_IDLE_TIMEOUT_MS);
    try {
      const jsonUrl = buildXrahatUrl(promptText, uid, false);
      const res = await fetch(jsonUrl, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: jsonCtrl.signal,
      });
      if (res.ok) {
        const data = await res.json().catch(() => null);
        const reply = extractXrahatReply(data);
        if (reply) {
          await deliverChunked(reply);
          return true;
        }
      }
    } catch {
      // Ignore fallback error
    } finally {
      clearTimeout(jsonTimer);
      signal.removeEventListener('abort', onJsonParentAbort);
    }
  }

  signal.removeEventListener('abort', onParentAbort);
  return emitted;
}

// ============================================================================
// 1. REAL-TIME AUTOMATIC WEB BROWSING & MULTI-SOURCE LIVE SEARCH GROUNDING
// ============================================================================

/** Strip inline ⟦FILE:...⟧ blocks when inspecting the user's conversational prompt. */
function stripAttachedFileBlocks(rawText: string): string {
  return (rawText || '').replace(/⟦FILE:[^\n⟧]+⟧[\s\S]*?⟦\/FILE⟧/g, ' ').trim();
}

/**
 * Extracts explicit http(s) URLs and bare website domains mentioned by the user
 * so the AI can automatically browse them without the user opening any separate modal.
 */
export function extractUrlsFromPrompt(rawText: string): string[] {
  const clean = stripAttachedFileBlocks(rawText);
  if (!clean) return [];
  const found: string[] = [];
  const seen = new Set<string>();

  const addUrl = (u: string) => {
    const trimmed = u.replace(/[.,;:!?)'"\]]+$/, '').trim();
    if (!trimmed) return;
    const normalized = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    try {
      const parsed = new URL(normalized);
      if (!parsed.hostname || !parsed.hostname.includes('.')) return;
      const href = parsed.toString();
      if (!seen.has(href)) {
        seen.add(href);
        found.push(href);
      }
    } catch {
      // Ignore malformed URLs
    }
  };

  // 1. Explicit http:// or https:// URLs
  const httpRegex = /https?:\/\/[^\s<>"')\]]+/gi;
  let m: RegExpExecArray | null;
  while ((m = httpRegex.exec(clean)) !== null) {
    addUrl(m[0]);
  }

  // 2. Bare domains (e.g. "github.com", "prothomalo.com", "example.org/docs")
  const domainRegex =
    /(?:^|[\s(])((?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:com|org|net|io|dev|ai|app|gov|edu|bd|in|co|uk|me|info|xyz|tech|news|wiki)(?:\/[^\s<>"')\]]*)?)/gi;
  while ((m = domainRegex.exec(clean)) !== null) {
    const candidate = m[1].trim();
    // Skip common code filenames like index.html, app.js, style.css
    if (/\.(?:html?|css|jsx?|tsx?|json|py|java|kt|cpp|rs|go|md|txt|zip|pdf|png|jpe?g|svg)$/i.test(candidate)) {
      continue;
    }
    addUrl(candidate);
  }

  return found.slice(0, 3);
}

/**
 * Determines whether the AI should automatically run real-time web search or
 * live webpage browsing for the user's message.
 */
export function shouldAutoTriggerLiveWeb(
  rawText: string,
  explicitWebSearch = false
): boolean {
  const clean = stripAttachedFileBlocks(rawText).trim();
  if (!clean || clean.length < 4) return false;
  if (INSTANT_GREETING_REGEX.test(clean)) return false;
  if (
    /^(?:hi+|hello+|hey+|hlw+|ki+|kemon(?:\s+ach[o|en]*)?|হ্যালো|হাই|কি|কী|কেমন(?:\s+আছো|\s+আছেন)?|সালাম|আসসালামু(?:\s+আলাইকুম)?)[?!।.\s]*$/i.test(
      clean
    )
  ) {
    return false;
  }
  if (explicitWebSearch) return true;
  if (extractUrlsFromPrompt(clean).length > 0) return true;

  return /(?:সার্চ|ব্রাউজ|ব্রাউজার|ওয়েবসাইট|ওয়েবসাইট|ওয়েব|ওয়েব|অনলাইন|লাইভ|রিয়েল\s*টাইম|রিয়েল\s*টাইম|সর্বশেষ|আজকের|বর্তমান|খবর|সংবাদ|আপডেট|দাম|মূল্য|আবহাওয়া|আবহাওয়া|স্কোর|তথ্য\s*খুঁজে|খুঁজে\s*বের|লিঙ্ক|লিংক|search|browse|website|webpage|online|real[-\s]?time|latest|current|today'?s|breaking\s+news|live\s+update|weather|stock\s+price|crypto\s+price|who\s+is\s+the\s+current|what\s+is\s+the\s+latest|2025|2026)/i.test(
    clean
  );
}

function decodeHtmlEntities(input: string): string {
  return (input || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&#x27;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_m, code) => {
      const n = Number(code);
      return Number.isFinite(n) && n > 0 && n < 0x10ffff ? String.fromCodePoint(n) : '';
    });
}

/**
 * Performs an HTTP GET while validating every redirect target against SSRF / private IP rules.
 */
async function safeFetchUrlWithRedirects(
  initialUrl: string,
  signal: AbortSignal,
  maxRedirects = 3
): Promise<{ res: globalThis.Response; finalUrl: string } | null> {
  let currentUrl = initialUrl;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const safeCheck = await verifyConnectionTargetSafe(currentUrl, {
      isCustomProvider: true,
    });
    if (!safeCheck.safe) return null;

    const res = await fetch(currentUrl, {
      method: 'GET',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; SMFTA-AI-Pro-Browser/19.0; +https://smfta.ai)',
        Accept:
          'text/html,application/xhtml+xml,application/json,text/plain;q=0.9,*/*;q=0.8',
      },
      redirect: 'manual',
      signal,
    });

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      if (!location || hop === maxRedirects) return null;
      try {
        currentUrl = new URL(location, currentUrl).toString();
      } catch {
        return null;
      }
      continue;
    }

    return { res, finalUrl: currentUrl };
  }
  return null;
}

/** Fetches and extracts readable content from a live URL safely (SSRF-guarded, including redirects). */
export async function fetchLiveUrlDigest(
  targetUrl: string,
  signal: AbortSignal
): Promise<{ title: string; url: string; snippet: string } | null> {
  try {
    const fetched = await safeFetchUrlWithRedirects(targetUrl, signal, 3);
    if (!fetched || !fetched.res.ok) return null;
    const { res, finalUrl } = fetched;
    const raw = (await res.text()).slice(0, 220_000);
    const titleMatch = raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleMatch
      ? decodeHtmlEntities(titleMatch[1]).replace(/\s+/g, ' ').trim().slice(0, 120)
      : finalUrl;
    const descMatch =
      raw.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) ||
      raw.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i);
    const metaDesc = descMatch
      ? decodeHtmlEntities(descMatch[1]).replace(/\s+/g, ' ').trim()
      : '';

    const bodyText = decodeHtmlEntities(
      raw
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
        .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
        .replace(/<\/(p|div|h[1-6]|li|tr|section|article|header|footer|br)>/gi, '\n')
        .replace(/<[^>]+>/g, ' ')
    )
      .replace(/[ \t]+/g, ' ')
      .replace(/\n\s*\n+/g, '\n')
      .trim()
      .slice(0, 3_200);

    if (!bodyText && !metaDesc) return null;
    return {
      title,
      url: finalUrl,
      snippet: `[LIVE WEBPAGE BROWSED: "${title}" (${finalUrl})]\n${
        metaDesc ? `Description: ${metaDesc}\n` : ''
      }Content Extract:\n${bodyText}`,
    };
  } catch {
    return null;
  }
}

export async function fetchLiveWebSearchGrounding(
  query: string,
  signal: AbortSignal
): Promise<{
  groundedBlock: string;
  sources: Array<{ title: string; url: string }>;
}> {
  const userPart = stripAttachedFileBlocks(query);
  const directUrls = extractUrlsFromPrompt(userPart);
  let cleanQ = (userPart || query || '')
    .replace(/https?:\/\/[^\s]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240);

  if (directUrls.length > 0) {
    // Remove bare domains and generic "browse this website" filler when explicit URLs are present
    for (const u of directUrls) {
      try {
        const host = new URL(u).hostname;
        cleanQ = cleanQ.replace(new RegExp(host.replace(/\./g, '\\.'), 'gi'), ' ');
      } catch {
        // ignore
      }
    }
    cleanQ = cleanQ
      .replace(
        /(?:এই|ওই|টি|টা|ওয়েবসাইটটি|ওয়েবসাইটটি|ওয়েবসাইট|ওয়েবসাইট|পেজটি|পেজ|লিঙ্কটি|লিংকটি|সাইটটি|ব্রাউজ\s*করে\s*দেখো|ব্রাউজ\s*করো|ব্রাউজ|ভিজিট\s*করো|পড়ে\s*দেখো|পড়ে\s*দেখো|দেখো|বলো|কী\s*আছে|কি\s*আছে|browse|visit|open|read|check|this|website|webpage|page|url|link|and|tell|me|what|is|on|it)/gi,
        ' '
      )
      .replace(/[?!।.,;:'"`()[\]]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  if (!cleanQ && directUrls.length === 0) {
    return { groundedBlock: '', sources: [] };
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6_000);
  const onParentAbort = () => ctrl.abort();
  signal.addEventListener('abort', onParentAbort, { once: true });

  const sources: Array<{ title: string; url: string }> = [];
  const seenUrls = new Set<string>();
  const addSource = (title: string, url: string) => {
    if (!url || seenUrls.has(url)) return;
    seenUrls.add(url);
    sources.push({ title: decodeHtmlEntities(title || url).slice(0, 90), url });
  };
  const snippets: string[] = [];

  try {
    // 1. Direct Live URL Browsing (if user mentioned any URL or domain)
    if (directUrls.length > 0) {
      const browsedPages = await Promise.allSettled(
        directUrls.slice(0, 2).map((u) => fetchLiveUrlDigest(u, ctrl.signal))
      );
      for (const p of browsedPages) {
        if (p.status === 'fulfilled' && p.value) {
          snippets.push(p.value.snippet);
          addSource(p.value.title, p.value.url);
        }
      }
    }

    // 2. Multi-Source Real-Time Web Search (DuckDuckGo Instant Answer + Wikipedia bn/en + DDG HTML Lite)
    const shouldRunSearchEngines =
      cleanQ.length >= 2 && (directUrls.length === 0 || cleanQ.length >= 6);
    if (shouldRunSearchEngines) {
      const hasBengali = /[\u0980-\u09FF]/.test(cleanQ);
      const wikiLang = hasBengali ? 'bn' : 'en';

      const ddgJsonPromise = (async () => {
        const ddgUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(
          cleanQ
        )}&format=json&no_html=1&skip_disambig=1`;
        const res = await fetch(ddgUrl, {
          headers: { Accept: 'application/json' },
          signal: ctrl.signal,
        });
        if (!res.ok) return;
        const data = (await res.json()) as Record<string, unknown>;
        const abstractText = decodeHtmlEntities(String(data.AbstractText || '')).trim();
        const abstractUrl = String(data.AbstractURL || '').trim();
        const heading = decodeHtmlEntities(String(data.Heading || cleanQ)).trim();
        if (abstractText) {
          snippets.push(`• ${heading}: ${abstractText}`);
          if (abstractUrl) addSource(heading, abstractUrl);
        }
        if (Array.isArray(data.RelatedTopics)) {
          for (const item of data.RelatedTopics.slice(0, 4)) {
            if (item && typeof item === 'object') {
              const obj = item as Record<string, unknown>;
              const txt = decodeHtmlEntities(String(obj.Text || '')).trim();
              const firstUrl = String(obj.FirstURL || '').trim();
              if (txt) {
                snippets.push(`• ${txt}`);
                if (firstUrl) addSource(txt.slice(0, 68), firstUrl);
              }
            }
          }
        }
      })();

      const wikiSearchPromise = (async () => {
        const wikiUrl = `https://${wikiLang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
          cleanQ
        )}&utf8=1&format=json&srlimit=3`;
        const res = await fetch(wikiUrl, {
          headers: {
            Accept: 'application/json',
            'User-Agent': 'SMFTA-AI-Pro/19.0 (https://smfta.ai)',
          },
          signal: ctrl.signal,
        });
        if (!res.ok) return;
        const data = (await res.json()) as {
          query?: { search?: Array<{ title?: string; snippet?: string }> };
        };
        const results = data.query?.search || [];
        for (const item of results.slice(0, 3)) {
          const title = decodeHtmlEntities(String(item.title || '')).trim();
          const cleanSnippet = decodeHtmlEntities(
            String(item.snippet || '').replace(/<[^>]+>/g, '')
          )
            .replace(/\s+/g, ' ')
            .trim();
          if (title && cleanSnippet) {
            const pageUrl = `https://${wikiLang}.wikipedia.org/wiki/${encodeURIComponent(
              title.replace(/\s+/g, '_')
            )}`;
            snippets.push(`• [Wikipedia: ${title}] ${cleanSnippet}`);
            addSource(`${title} — Wikipedia`, pageUrl);
          }
        }
      })();

      const ddgHtmlPromise = (async () => {
        const htmlUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(cleanQ)}`;
        const res = await fetch(htmlUrl, {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            Accept: 'text/html',
          },
          signal: ctrl.signal,
        });
        if (!res.ok) return;
        const html = (await res.text()).slice(0, 120_000);
        const blockRegex =
          /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]+class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
        let m: RegExpExecArray | null;
        let count = 0;
        while ((m = blockRegex.exec(html)) !== null && count < 4) {
          let href = m[1];
          const uddgMatch = href.match(/[?&]uddg=([^&]+)/);
          if (uddgMatch) {
            try {
              href = decodeURIComponent(uddgMatch[1]);
            } catch {
              // keep original href
            }
          }
          const title = decodeHtmlEntities(m[2].replace(/<[^>]+>/g, ''))
            .replace(/\s+/g, ' ')
            .trim();
          const snippet = decodeHtmlEntities(m[3].replace(/<[^>]+>/g, ''))
            .replace(/\s+/g, ' ')
            .trim();
          if (title && snippet && /^https?:\/\//i.test(href)) {
            snippets.push(`• [${title}] (${href}): ${snippet}`);
            addSource(title, href);
            count++;
          }
        }
      })();

      await Promise.allSettled([ddgJsonPromise, wikiSearchPromise, ddgHtmlPromise]);
    }

    if (snippets.length === 0) {
      return { groundedBlock: '', sources: [] };
    }

    const accessedAt = new Date().toISOString();
    const groundedBlock = `\nLIVE REAL-TIME WEB & BROWSER GROUNDING (automatically fetched at ${accessedAt} — use these real-time facts and cite URLs where helpful):\n${snippets
      .slice(0, 10)
      .join('\n')}\n`;
    return { groundedBlock, sources: sources.slice(0, 6) };
  } catch {
    return { groundedBlock: '', sources: [] };
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', onParentAbort);
  }
}

// ============================================================================
// 1. REAL-TIME STREAMING CHAT ENDPOINT (Phase 2.1, 2.3, 2.5 & Audit P1-07/P1-33)
// ============================================================================
chatRouter.post('/chat/stream', async (req: Request, res: Response) => {
  // v18.9.0: strict admission gate BEFORE flushing SSE headers — bounded message
  // count, text/image sizes, allow-listed roles, known fields only.
  const bodyGuard = sanitizeChatBody(req.body);
  if (!bodyGuard.ok || !bodyGuard.messages) {
    return res.status(bodyGuard.statusCode || 422).json({
      ok: false,
      errorCode: bodyGuard.errorCode || 'BAD_REQUEST',
      error: bodyGuard.error || 'Invalid request body.',
    });
  }
  const messages = bodyGuard.messages;

  const requestId = req.requestId || `req_${Date.now().toString(36)}`;
  const streamStartPerf = performance.now();

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();
  res.write(': connected\n\n');

  let clientClosed = false;
  const upstreamAbortController = new AbortController();

  // Heartbeat every 12 seconds (Phase 2.3)
  const heartbeat = setInterval(() => {
    if (!clientClosed && !res.writableEnded) {
      try {
        res.write(': ping\n\n');
      } catch {
        // Ignore write error on closed socket
      }
    }
  }, 12_000);
  if (typeof heartbeat.unref === 'function') {
    heartbeat.unref();
  }

  res.on('close', () => {
    clearInterval(heartbeat);
    if (!res.writableEnded) {
      clientClosed = true;
      upstreamAbortController.abort();
    }
  });

  let fullReplyAccumulator = '';
  let firstTokenPerf: number | null = null;

  const emitEvent = (payload: Record<string, unknown>) => {
    if (clientClosed || res.writableEnded) return;
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  const emitStatus = (status: string, step: string, detail?: string) => {
    if (!status || clientClosed || res.writableEnded) return;
    res.write(
      `data: ${JSON.stringify({
        type: 'status',
        status,
        step,
        detail: detail || status,
      })}\n\n`
    );
  };

  let ensureThinkingBeforeFirstDelta: (() => void) | null = null;

  const emitDelta = (delta: string) => {
    if (!delta || clientClosed || res.writableEnded) return;
    const cleanDelta = sanitizeProprietaryOutput(delta);
    if (!cleanDelta) return;
    if (fullReplyAccumulator.length === 0 && ensureThinkingBeforeFirstDelta) {
      ensureThinkingBeforeFirstDelta();
    }
    if (firstTokenPerf === null) {
      firstTokenPerf = performance.now();
    }
    fullReplyAccumulator += cleanDelta;
    res.write(
      `data: ${JSON.stringify({
        type: 'text',
        text: cleanDelta,
        delta: cleanDelta,
      })}\n\n`
    );
  };

  const emitChunkedDelta = async (fullText: string) => {
    if (!fullText || clientClosed || res.writableEnded) return;
    if (fullText.length <= 60) {
      emitDelta(fullText);
      return;
    }
    const step = 28;
    for (let i = 0; i < fullText.length; i += step) {
      if (clientClosed || res.writableEnded || upstreamAbortController.signal.aborted) {
        break;
      }
      emitDelta(fullText.slice(i, i + step));
      await new Promise((r) => setTimeout(r, 10));
    }
  };

  const emitReset = () => {
    if (clientClosed || res.writableEnded) return;
    fullReplyAccumulator = '';
    res.write(`data: ${JSON.stringify({ type: 'reset', reset: true, delta: '' })}\n\n`);
  };

  const finishStream = (terminalMeta?: Record<string, unknown>) => {
    clearInterval(heartbeat);
    if (!res.writableEnded) {
      if (!clientClosed) {
        if (terminalMeta) {
          emitEvent(terminalMeta);
        }
        res.write('data: [DONE]\n\n');
      }
      res.end();
    }
  };

  const {
    mode = 'balanced',
    style = 'detailed',
    replyLang = 'auto',
    creativity = 'balanced',
    customInst = '',
    responseTone = '',
    codingPrefs = '',
    memory = [],
    autoMemory = true,
    activeWidgets = [],
    userName = '',
    workPersona = 'allrounder',
    provider = 'xrahat',
    externalKeys = '',
    externalModel = '',
    externalBaseUrl = '',
    webSearch = false,
    enabledTools,
    sessionId = 'default-session',
    weightTemp,
    topP,
    topK,
    stopSequences,
    thinkingMode = 'medium',
    outputFormat = 'markdown',
    userProfileContext = '',
    knowledgeContext = '',
    mcpToolsContext = '',
    customParams,
    requestTimeoutSec,
    maxOutputTokens,
    trainingData,
    fastDecision = true,
    memoryCache = true,
    chatHistorySummary = '',
    selfState,
    notebook,
    activeSkills,
    installedSkills,
    autonomy,
    allowKeylessFallback,
    discoveredModels = [],
    projectContext = '',
    supportsStreaming = true,
    contextWindow,
    firebaseUid = '',
    firebaseUserEmail = '',
    firebaseEmailVerified = false,
    v2TestingBypass = false,
    v2QuotaConfig,
    nickname = '',
    globalInstructions = '',
    projectInstructions = '',
    projectName = '',
    responseStyle = 'normal',
    customStyleSample = '',
    responseLength = 'medium',
    memoryPaused = false,
    incognito = false,
    thinkingEnabled = true,
    liveVoiceMode = false,
  } = req.body || {};

  const parsedCustomParams = parseCustomParamsSafe(customParams);
  const parsedStopSequences = Array.isArray(stopSequences)
    ? stopSequences
        .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
        .map((s) => s.trim().slice(0, 80))
        .slice(0, 8)
    : undefined;
  const parsedTopK =
    typeof topK === 'number' && Number.isFinite(topK) && topK > 0
      ? Math.min(200, Math.max(1, Math.round(topK)))
      : undefined;
  const requestedThinkingMode: 'off' | 'low' | 'medium' | 'high' =
    thinkingEnabled === false || thinkingMode === 'off'
      ? 'off'
      : thinkingMode === 'low' ||
        thinkingMode === 'medium' ||
        thinkingMode === 'high'
      ? thinkingMode
      : 'medium';
  const perAttemptTimeoutMs =
    typeof requestTimeoutSec === 'number' && Number.isFinite(requestTimeoutSec)
      ? Math.min(240_000, Math.max(10_000, Math.round(requestTimeoutSec * 1000)))
      : undefined;

  // P0-01 & P0-03: Derive isolated user scope from authenticated server identity
  const scopedUserId = String(req.userId || sessionId || 'default').slice(0, 64);
  const v2ScopedUserId = String(
    firebaseUid || req.userId || sessionId || 'default-user'
  ).slice(0, 128);

  if (
    typeof trainingData === 'string' ||
    typeof weightTemp === 'number' ||
    typeof topP === 'number'
  ) {
    retrainModelWeights({
      trainingData: typeof trainingData === 'string' ? trainingData : undefined,
      temperature: typeof weightTemp === 'number' ? weightTemp : undefined,
      topP: typeof topP === 'number' ? topP : undefined,
      userId: scopedUserId,
    });
  }

  const rawKeysInput =
    typeof externalKeys === 'string'
      ? externalKeys
      : Array.isArray(externalKeys)
      ? externalKeys.map((k) => String(k || '')).join('\n')
      : '';
  const parsedKeys = rawKeysInput
    .split(/[\n,;]+/)
    .map((k: string) => k.trim())
    .filter(Boolean);

  const effectiveProvider = resolveEffectiveProvider(
    provider,
    parsedKeys,
    externalBaseUrl
  );

  const activeCustomModelName = String(externalModel || '').trim();
  const modelSupportsThinking = supportsNativeThinking(
    effectiveProvider,
    activeCustomModelName
  );
  const effectiveThinkingMode: 'off' | 'low' | 'medium' | 'high' =
    requestedThinkingMode !== 'off' && modelSupportsThinking
      ? requestedThinkingMode
      : 'off';

  let hasEmittedAnyThinking = false;
  const emitThinking = (thinkingChunk: string) => {
    if (
      !thinkingChunk ||
      requestedThinkingMode === 'off' ||
      clientClosed ||
      res.writableEnded
    ) {
      return;
    }
    const cleanThinking = sanitizeProprietaryOutput(thinkingChunk);
    if (!cleanThinking) return;
    hasEmittedAnyThinking = true;
    if (firstTokenPerf === null) {
      firstTokenPerf = performance.now();
    }
    res.write(
      `data: ${JSON.stringify({
        type: 'thinking',
        thinking: cleanThinking,
      })}\n\n`
    );
  };
  const RECENT_HISTORY_WINDOW = 40;
  const normalizedHistory: Array<{
    role: string;
    content: string;
    imgs?: Array<{ mime: string; data: string }>;
  }> = messages
    .slice(-RECENT_HISTORY_WINDOW)
    .map((m) => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: String(m.text || '').trim(),
      imgs: Array.isArray(m.imgs) && m.imgs.length > 0 ? m.imgs : undefined,
    }))
    .filter(
      (m) => m.content.length > 0 || (Array.isArray(m.imgs) && m.imgs.length > 0)
    );

  // If the client sent more than RECENT_HISTORY_WINDOW messages, build a lossless rolling summary of the older turns
  let autoOlderTurnsSummary = '';
  if (messages.length > RECENT_HISTORY_WINDOW) {
    const olderSlice = messages.slice(0, messages.length - RECENT_HISTORY_WINDOW);
    const firstUserTurn = olderSlice.find((m) => m.role === 'user');
    const olderBullets = olderSlice
      .slice(-30)
      .map((m) => {
        const speaker = m.role === 'user' ? 'User' : 'AI';
        const snippet = String(m.text || '')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 400);
        return snippet ? `- ${speaker}: ${snippet}` : '';
      })
      .filter(Boolean);
    autoOlderTurnsSummary = [
      firstUserTurn
        ? `Original Conversation Goal: ${String(firstUserTurn.text || '').replace(/\s+/g, ' ').trim().slice(0, 240)}`
        : '',
      olderBullets.length > 0
        ? `Earlier Conversation Turns (${olderSlice.length} messages compressed):\n${olderBullets.join('\n')}`
        : '',
    ]
      .filter(Boolean)
      .join('\n');
  }

  const effectiveHistorySummary = [
    String(chatHistorySummary || '').trim(),
    autoOlderTurnsSummary,
  ]
    .filter(Boolean)
    .join('\n\n');

  const lastUserMsgObj = messages[messages.length - 1];
  const lastUserText = String(lastUserMsgObj.text || 'Hello').trim();
  const lastUserImgs = lastUserMsgObj.imgs;

  const isCustomProviderActive =
    parsedKeys.length > 0 ||
    (effectiveProvider !== 'xrahat' && effectiveProvider !== 'smfta_cloud');

  const ensurePreResponseThinking = (modelLabelOverride?: string) => {
    if (requestedThinkingMode === 'off' || hasEmittedAnyThinking) {
      return;
    }
    const trace = buildContextualThinkingTrace(
      lastUserText,
      replyLang,
      modelLabelOverride || activeCustomModelName || effectiveProvider,
      requestedThinkingMode
    );
    emitThinking(trace);
  };
  ensureThinkingBeforeFirstDelta = () =>
    ensurePreResponseThinking(activeCustomModelName || effectiveProvider);

  emitEvent({
    type: 'meta',
    requestId,
    requestedProvider: effectiveProvider,
    requestedModel: activeCustomModelName || 'default',
  });

  try {

  // ============================================================================
  // INDEPENDENT V2 – SPECIAL (FIREBASE AI SYSTEM) BRANCH
  // Strictly isolated from V1 – Natural. Never routes to or falls back to V1.
  // ============================================================================
  if (isV2ModelId(activeCustomModelName)) {
    const v2ModelId = activeCustomModelName as V2ModelId;
    const v2Spec = getV2ModelSpec(v2ModelId);
    const v2AuthorizedTester = isServerAuthorizedTester(
      typeof firebaseUserEmail === 'string' ? firebaseUserEmail : undefined,
      v2ScopedUserId,
      Boolean(firebaseEmailVerified)
    );
    const effectiveV2Config = {
      ...(v2QuotaConfig && typeof v2QuotaConfig === 'object' ? v2QuotaConfig : {}),
      testingBypassEnabled: Boolean(v2TestingBypass && v2AuthorizedTester),
    };

    const memList = Array.isArray(memory)
      ? memory
          .map((item: unknown) => String(item || '').trim())
          .filter(Boolean)
          .slice(0, 12)
      : [];

    const quotaCheck = await checkAndConsumeServerV2Quota({
      userId: v2ScopedUserId,
      userEmail:
        typeof firebaseUserEmail === 'string' ? firebaseUserEmail : undefined,
      emailVerified: Boolean(firebaseEmailVerified),
      modelId: v2ModelId,
      configOverride: effectiveV2Config,
    });

    const allQuotaSnapshot = await getAllV2ModelStatusesForUser({
      userId: v2ScopedUserId,
      userEmail:
        typeof firebaseUserEmail === 'string' ? firebaseUserEmail : undefined,
      emailVerified: Boolean(firebaseEmailVerified),
      configOverride: effectiveV2Config,
    });

    emitEvent({
      type: 'v2_quota',
      status: quotaCheck.status,
      snapshot: allQuotaSnapshot,
    });

    if (!quotaCheck.allowed) {
      const blockedMsg =
        quotaCheck.status.blockedMessage ||
        `Daily usage limit reached for ${v2Spec.label}.`;
      emitEvent({
        type: 'error',
        ok: false,
        code: 'V2_DAILY_LIMIT_REACHED',
        httpStatus: 429,
        retryable: false,
        requestId,
        message: blockedMsg,
        text: blockedMsg,
        delta: blockedMsg,
      });
      finishStream();
      return;
    }

    const allowMemoryForRequest =
      Boolean(autoMemory) && !memoryPaused && !incognito;
    if (allowMemoryForRequest && memList.length > 0) {
      emitStatus('মেমোরি দেখছি', 'memory_lookup', 'Using saved memories');
    }
    if (
      lastUserImgs.length > 0 ||
      (typeof projectContext === 'string' && projectContext.trim().length > 0)
    ) {
      emitStatus('ফাইল পড়ছি', 'file_read', 'Reading attached files & context');
    }

    const activeV2SystemLabel = resolveActiveSystemLabel({
      customModelName: v2ModelId,
      mode,
    });
    if (lastUserImgs.length === 0) {
      const identityReply = interceptIdentityQuery(
        lastUserText,
        replyLang,
        activeV2SystemLabel
      );
      if (identityReply) {
        ensurePreResponseThinking(activeV2SystemLabel);
        await emitChunkedDelta(identityReply);
        finishStream({
          type: 'done',
          ok: true,
          requestId,
          requestedProvider: 'firebase_v2',
          requestedModel: v2ModelId,
          providerUsed: 'firebase_v2',
          modelUsed: v2ModelId,
          attemptCount: 1,
          latencyMs: Math.max(1, Math.round(performance.now() - streamStartPerf)),
        });
        return;
      }
    }

    let v2ProjectContext =
      typeof projectContext === 'string' ? projectContext.slice(0, 60_000) : '';
    let v2MemoryList = memList;
    const ragCitations: Array<{ title: string; uri: string }> = [];

    if (!incognito) {
      const [ragRes, dbV2Memories] = await Promise.all([
        retrieveV2RagContext({
          userId: v2ScopedUserId,
          query: lastUserText,
          topK: 5,
        }).catch(() => null),
        !memoryPaused
          ? retrieveRelevantV2Memories({
              userId: v2ScopedUserId,
              query: lastUserText,
              topK: 6,
            }).catch(() => [])
          : Promise.resolve([]),
      ]);

      if (dbV2Memories.length > 0) {
        const seenMem = new Set(v2MemoryList.map((m) => m.trim().toLowerCase()));
        for (const m of dbV2Memories) {
          const cleanM = m.trim();
          if (cleanM && !seenMem.has(cleanM.toLowerCase())) {
            seenMem.add(cleanM.toLowerCase());
            v2MemoryList = [cleanM, ...v2MemoryList];
          }
        }
      }

      if (ragRes) {
        if (ragRes.matched && ragRes.contextBlock) {
          v2ProjectContext = v2ProjectContext
            ? `${v2ProjectContext}\n\n${ragRes.contextBlock}`
            : ragRes.contextBlock;
          for (const cit of ragRes.citations) {
            ragCitations.push({
              title: `${cit.fileName} (chunk #${cit.chunkIndex + 1})`,
              uri: `rag://${encodeURIComponent(cit.docId)}#${cit.chunkIndex + 1}`,
            });
          }
        } else if (ragRes.hasDocuments && ragRes.emptyNotice) {
          v2ProjectContext = v2ProjectContext
            ? `${v2ProjectContext}\n\n[V2 RAG STATUS]: ${ragRes.emptyNotice}`
            : `[V2 RAG STATUS]: ${ragRes.emptyNotice}`;
        }
      }
    }

    const v2SystemInstruction = buildSystemInstruction({
      mode: mode as 'fast' | 'balanced' | 'power',
      style: style as 'concise' | 'detailed',
      replyLang: replyLang as 'auto' | 'bn' | 'en',
      workPersona,
      creativity,
      customInst,
      responseTone,
      codingPrefs,
      memory: v2MemoryList,
      autoMemory: Boolean(autoMemory),
      memoryPaused: Boolean(memoryPaused),
      incognito: Boolean(incognito),
      activeWidgets,
      userName,
      nickname: typeof nickname === 'string' ? nickname : undefined,
      globalInstructions:
        typeof globalInstructions === 'string' ? globalInstructions : undefined,
      projectInstructions:
        typeof projectInstructions === 'string'
          ? projectInstructions
          : undefined,
      projectName: typeof projectName === 'string' ? projectName : undefined,
      responseStyle:
        responseStyle === 'normal' ||
        responseStyle === 'concise' ||
        responseStyle === 'explanatory' ||
        responseStyle === 'formal' ||
        responseStyle === 'custom'
          ? responseStyle
          : undefined,
      customStyleSample:
        typeof customStyleSample === 'string' ? customStyleSample : undefined,
      responseLength:
        responseLength === 'short' ||
        responseLength === 'medium' ||
        responseLength === 'detailed'
          ? responseLength
          : undefined,
      chatHistorySummary: effectiveHistorySummary,
      recentTranscript: normalizedHistory,
      projectContext: v2ProjectContext.slice(0, 60_000),
    });

    if (requestedThinkingMode !== 'off' && !INSTANT_GREETING_REGEX.test(lastUserText)) {
      emitStatus('চিন্তা করছি…', 'thinking', 'Deep reasoning in progress');
    }

    const baseV2History =
      normalizedHistory.length > 0
        ? normalizedHistory
        : [
            {
              role: 'user',
              content: lastUserText || 'Hello',
              imgs: lastUserImgs,
            },
          ];

    let v2StreamRes = await streamV2FirebaseModel({
      modelId: v2ModelId,
      systemInstruction: v2SystemInstruction,
      history: baseV2History,
      signal: upstreamAbortController.signal,
      emitDelta,
      emitThinking,
      thinkingEnabled: requestedThinkingMode !== 'off',
      thinkingEffort:
        requestedThinkingMode === 'off' ? 'low' : requestedThinkingMode,
    });

    if (!v2StreamRes.ok && !clientClosed) {
      const errText =
        v2StreamRes.error ||
        `${v2Spec.label} failed to complete your request.`;
      emitEvent({
        type: 'error',
        ok: false,
        code: v2StreamRes.errorCode || 'V2_AI_UNAVAILABLE',
        httpStatus: v2StreamRes.httpStatus,
        retryable: false,
        requestId,
        message: errText,
        text: errText,
        delta: errText,
      });
      finishStream();
      return;
    }

    // Section 8A: Auto-continuation for V2 (strictly stays on the V2 model chain)
    const isLongV2Task = isLongCodeOrWritingRequest(lastUserText);
    const v2NeedsContinuation = (acc: string) =>
      hasUnclosedCodeFence(acc) ||
      hasUnclosedArtifactTag(acc) ||
      hasUnclosedHtmlDocument(acc) ||
      (isLongV2Task && acc.length > 400 && looksTruncated(acc));

    let v2LastTruncated = Boolean(v2StreamRes.truncated);
    for (
      let v2ContRound = 0;
      v2ContRound < MAX_AUTO_CONTINUATIONS &&
      v2StreamRes.ok &&
      !clientClosed &&
      (v2LastTruncated || v2NeedsContinuation(fullReplyAccumulator));
      v2ContRound++
    ) {
      const baseBeforeV2Cont = fullReplyAccumulator;
      let contBuffer = '';
      const v2ContRes = await streamV2FirebaseModel({
        modelId: v2ModelId,
        systemInstruction: v2SystemInstruction,
        history: [
          ...baseV2History,
          { role: 'assistant', content: baseBeforeV2Cont.slice(-3000) },
          { role: 'user', content: continuationDirective(baseBeforeV2Cont) },
        ],
        signal: upstreamAbortController.signal,
        emitDelta: (chunk) => {
          contBuffer += chunk;
        },
        thinkingEnabled: false,
        thinkingEffort: 'low',
      });
      if (!v2ContRes.ok || !contBuffer.trim()) {
        v2LastTruncated = v2LastTruncated || Boolean(v2ContRes.truncated);
        break;
      }
      const mergedV2 = mergeContinuationText(baseBeforeV2Cont, contBuffer);
      if (!mergedV2.deltaToAppend.trim()) {
        v2LastTruncated = Boolean(v2ContRes.truncated);
        break;
      }
      emitDelta(mergedV2.deltaToAppend);
      v2LastTruncated = Boolean(v2ContRes.truncated);
      v2StreamRes = {
        ...v2StreamRes,
        modelUsed: v2ContRes.modelUsed || v2StreamRes.modelUsed,
        fallbackUsed: v2StreamRes.fallbackUsed || v2ContRes.fallbackUsed,
        fallbackNotice: v2StreamRes.fallbackNotice || v2ContRes.fallbackNotice,
        truncated: v2LastTruncated,
        sources:
          v2ContRes.sources && v2ContRes.sources.length > 0
            ? [...(v2StreamRes.sources || []), ...v2ContRes.sources]
            : v2StreamRes.sources,
      };
    }

    const mergedV2Sources = [
      ...(v2StreamRes.sources || []),
      ...ragCitations,
    ];
    if (mergedV2Sources.length > 0) {
      emitEvent({
        type: 'sources',
        sources: mergedV2Sources,
      });
    }

    const v2StillTruncated = v2LastTruncated || v2NeedsContinuation(fullReplyAccumulator);
    finishStream({
      type: 'done',
      ok: true,
      requestId,
      requestedProvider: 'firebase_v2',
      requestedModel: v2ModelId,
      providerUsed: 'firebase_v2',
      modelUsed: v2StreamRes.modelUsed || v2Spec.serverGeminiModel || v2ModelId,
      fallbackUsed: Boolean(v2StreamRes.fallbackUsed),
      fallbackNotice: v2StreamRes.fallbackNotice,
      truncated: v2StillTruncated,
      resumedAfterDrop: Boolean(v2StreamRes.resumedAfterDrop),
      sources: mergedV2Sources.length > 0 ? mergedV2Sources : undefined,
      attemptCount: 1,
      ttftMs:
        firstTokenPerf !== null
          ? Math.max(1, Math.round(firstTokenPerf - streamStartPerf))
          : undefined,
      latencyMs: Math.max(1, Math.round(performance.now() - streamStartPerf)),
    });
    return;
  }

  const activeSystemLabel = resolveActiveSystemLabel({
    customModelName: activeCustomModelName,
    mode,
  });

  // 0. Identity / creator / security / privacy interception across active systems
  if (lastUserImgs.length === 0) {
    const identityReply = interceptIdentityQuery(
      lastUserText,
      replyLang,
      activeSystemLabel
    );
    if (identityReply) {
      ensurePreResponseThinking(activeSystemLabel);
      await emitChunkedDelta(identityReply);
      finishStream({
        type: 'done',
        ok: true,
        requestId,
        providerUsed: effectiveProvider,
        modelUsed: activeCustomModelName || 'smfta-core',
        attemptCount: 1,
        latencyMs: Math.max(1, Math.round(performance.now() - streamStartPerf)),
      });
      return;
    }
  }

  // 1. Custom trained Q&A weight match (scoped per user - P0-03)
  const trainedMatch = matchTrainedWeights(lastUserText, scopedUserId);
  if (trainedMatch.exactReply && lastUserImgs.length === 0 && !isCustomProviderActive) {
    ensurePreResponseThinking(activeSystemLabel);
    await emitChunkedDelta(trainedMatch.exactReply);
    finishStream({
      type: 'done',
      ok: true,
      requestId,
      providerUsed: effectiveProvider,
      modelUsed: 'trained-weights',
      attemptCount: 1,
      latencyMs: Math.max(1, Math.round(performance.now() - streamStartPerf)),
    });
    return;
  }

  // 2. Prompt complexity & token budget
  const algoDecision = classifyPromptComplexity({
    text: lastUserText,
    mode,
    style,
    fastDecision: Boolean(fastDecision),
    creativity,
  });

  // P1-17 + v19.0: Automatic real-time web browsing & search grounding whenever
  // webSearch is toggled OR the user's message mentions a URL/website or live/current query.
  const webToolAllowed =
    !enabledTools ||
    typeof enabledTools !== 'object' ||
    ((enabledTools as Record<string, boolean>).web_search !== false &&
      (enabledTools as Record<string, boolean>).web_browse !== false);
  const webSearchPermitted =
    webToolAllowed &&
    (liveVoiceMode
      ? Boolean(webSearch)
      : shouldAutoTriggerLiveWeb(lastUserText, Boolean(webSearch)));

  const allowMemoryForV1 =
    Boolean(autoMemory) && !memoryPaused && !incognito;
  if (allowMemoryForV1 && Array.isArray(memory) && memory.length > 0) {
    emitStatus('মেমোরি দেখছি', 'memory_lookup', 'Using saved memories');
  }

  if (normalizedHistory.length > 1 || effectiveHistorySummary.length > 0) {
    emitEvent({
      type: 'progress',
      step: 'context_analysis',
      detail: 'Analyzing Conversation Context...',
    });
  }

  if (lastUserImgs.length > 0) {
    emitStatus('ফাইল পড়ছি', 'file_read', `Analyzing ${lastUserImgs.length} attached image${lastUserImgs.length > 1 ? 's' : ''}`);
    emitEvent({
      type: 'progress',
      step: 'image_analysis',
      detail: `Analyzing ${lastUserImgs.length} attached image${lastUserImgs.length > 1 ? 's' : ''}`,
    });
  } else if (
    typeof projectContext === 'string' &&
    projectContext.trim().length > 0
  ) {
    emitStatus('ফাইল পড়ছি', 'file_read', 'Reading workspace & document context');
    if (projectContext.includes('[LIVE GITHUB INTEGRATION')) {
      emitEvent({
        type: 'progress',
        step: 'github_read',
        detail: 'Connecting to GitHub & Reading Source Files...',
      });
    } else if (projectContext.includes('[LIVE VERCEL INTEGRATION')) {
      emitEvent({
        type: 'progress',
        step: 'vercel_verify',
        detail: 'Verifying Deployment & Build Status...',
      });
    } else if (projectContext.includes('[LIVE SUPABASE DATABASE INTEGRATION')) {
      emitEvent({
        type: 'progress',
        step: 'supabase_schema',
        detail: 'Inspecting Supabase Database Schema...',
      });
    } else {
      emitEvent({
        type: 'progress',
        step: 'document_analysis',
        detail: 'Reading workspace & document context',
      });
    }
  }
  let webGroundingBlock = '';
  let groundedSources: Array<{ title: string; url: string }> = [];
  if (webSearchPermitted && lastUserText.length >= 2) {
    emitStatus('ওয়েবে খুঁজছি', 'web_search', 'Searching live web sources');
    emitEvent({
      type: 'progress',
      step: 'web_search',
      detail: 'Searching live web sources',
    });
    const searchRes = await fetchLiveWebSearchGrounding(
      lastUserText,
      upstreamAbortController.signal
    );
    webGroundingBlock = searchRes.groundedBlock;
    groundedSources = [];
    if (!webGroundingBlock) {
      webGroundingBlock =
        '\nLIVE WEB SEARCH STATUS: Live online search/browsing was attempted for this request, but no verified online results could be retrieved right now. If this request depends on live/current web information or reading an external URL that failed to load, state clearly and honestly that verified online information could not be retrieved right now — NEVER claim that you successfully browsed or verified live web results when none were returned.\n';
    }
  }

  const baseSysInstruction = buildSystemInstruction({
    mode,
    style,
    replyLang,
    customInst,
    responseTone: String(responseTone || ''),
    codingPrefs: String(codingPrefs || ''),
    memory,
    autoMemory: Boolean(autoMemory),
    memoryPaused: Boolean(memoryPaused),
    incognito: Boolean(incognito),
    activeWidgets: Array.isArray(activeWidgets)
      ? activeWidgets.map((w: unknown) => String(w || '')).filter(Boolean)
      : undefined,
    userName,
    nickname: typeof nickname === 'string' ? nickname : undefined,
    globalInstructions:
      typeof globalInstructions === 'string' ? globalInstructions : undefined,
    projectInstructions:
      typeof projectInstructions === 'string' ? projectInstructions : undefined,
    projectName: typeof projectName === 'string' ? projectName : undefined,
    responseStyle:
      responseStyle === 'normal' ||
      responseStyle === 'concise' ||
      responseStyle === 'explanatory' ||
      responseStyle === 'formal' ||
      responseStyle === 'custom'
        ? responseStyle
        : undefined,
    customStyleSample:
      typeof customStyleSample === 'string' ? customStyleSample : undefined,
    responseLength:
      responseLength === 'short' ||
      responseLength === 'medium' ||
      responseLength === 'detailed'
        ? responseLength
        : undefined,
    workPersona,
    webSearch: webSearchPermitted,
    customModelName: activeCustomModelName,
    activeProvider: effectiveProvider,
    recentTranscript: normalizedHistory,
    chatHistorySummary: effectiveHistorySummary,
    selfState,
    notebook: Array.isArray(notebook) ? notebook : undefined,
    activeSkills: Array.isArray(activeSkills) ? activeSkills : undefined,
    installedSkills: Array.isArray(installedSkills)
      ? installedSkills
      : undefined,
    autonomy:
      autonomy === 'safe' || autonomy === 'full' ? autonomy : undefined,
    outputFormat:
      outputFormat === 'plain' ||
      outputFormat === 'json' ||
      outputFormat === 'structured'
        ? outputFormat
        : 'markdown',
    userProfileContext:
      typeof userProfileContext === 'string' && userProfileContext.trim()
        ? userProfileContext.slice(0, 2000)
        : undefined,
    knowledgeContext:
      typeof knowledgeContext === 'string' && knowledgeContext.trim()
        ? knowledgeContext.slice(0, 6000)
        : undefined,
    mcpToolsContext:
      typeof mcpToolsContext === 'string' && mcpToolsContext.trim()
        ? mcpToolsContext.slice(0, 3000)
        : undefined,
    projectContext:
      typeof projectContext === 'string' && projectContext.trim()
        ? projectContext.slice(0, 120000)
        : undefined,
  });

  const trainedExamplesContext =
    trainedMatch.relevantExamples.length > 0
      ? `\nCUSTOM TRAINED EXAMPLES (FOLLOW THIS STYLE):\n` +
        trainedMatch.relevantExamples
          .map((ex) => `Q: ${ex.question}\nA: ${ex.answer}`)
          .join('\n\n')
      : '';

  const isLongTaskReq = isLongCodeOrWritingRequest(lastUserText);
  const wantConciseOnly =
    style === 'concise' && responseLength !== 'detailed' && !isLongTaskReq;
  const outputGuidanceRule = wantConciseOnly
    ? "\n\nRESPONSE STYLE: Keep the answer concise, direct, and focused in the user's language, while still giving complete code if code is requested."
    : "\n\nRESPONSE STYLE (highest priority): Use the user's language. When the user asks for large writing, in-depth information, creating/building apps, large UI/web designs, or code updates, ALWAYS provide the FULL, complete, richly detailed implementation and information without shortening, skipping parts, or leaving placeholders like '// ... existing code'.";
  const sysInstruction = `${baseSysInstruction}\n${algoDecision.thinkingHint}${trainedExamplesContext}${webGroundingBlock}${outputGuidanceRule}`;
  const cacheModelKey = `${effectiveProvider}:${activeCustomModelName || 'default'}`;

  // 3. Response Cache Lookup (user-scoped sha256 - P0-03; only for standalone single-turn requests without active conversation/project context)
  if (
    memoryCache !== false &&
    normalizedHistory.length === 1 &&
    !effectiveHistorySummary &&
    (!projectContext || !String(projectContext).trim()) &&
    lastUserImgs.length === 0 &&
    !webSearch
  ) {
    const cachedHit = getCachedResponse(
      lastUserText,
      mode,
      replyLang,
      sysInstruction,
      cacheModelKey,
      scopedUserId
    );
    if (cachedHit) {
      ensurePreResponseThinking(activeCustomModelName || activeSystemLabel);
      await emitChunkedDelta(cachedHit);
      finishStream({
        type: 'done',
        ok: true,
        cached: true,
        requestId,
        providerUsed: effectiveProvider,
        modelUsed: activeCustomModelName || 'default',
        attemptCount: 1,
        latencyMs: Math.max(1, Math.round(performance.now() - streamStartPerf)),
      });
      return;
    }
  }

  const engine = getSharedHardenedEngine();
  if (!engine.storage.isKillSwitchEnabled()) {
    const killMsg = '⚠️ AI সার্ভিস সাময়িকভাবে বন্ধ আছে।';
    emitEvent({
      type: 'error',
      ok: false,
      code: 'KILL_SWITCH_ACTIVE',
      retryable: false,
      requestId,
      message: killMsg,
      text: killMsg,
      delta: killMsg,
    });
    finishStream();
    return;
  }

  let streamSucceeded = false;
  let streamTruncated = false;
  let gatewayFallbackNotice: string | undefined;
  let lastErrorMessage = '';
  let actualProviderUsed = effectiveProvider;
  let actualModelUsed = activeCustomModelName || 'default';

  // P1-10: Respect requested maxOutputTokens or mode budget without hardcoding a 4096 ceiling on custom providers
  const requestedMaxTokens =
    typeof maxOutputTokens === 'number' && Number.isFinite(maxOutputTokens)
      ? Math.min(32_768, Math.max(64, Math.round(maxOutputTokens)))
      : algoDecision.maxOutputTokens;
  // Long code, design, update, or detailed writing requests get at least 24k tokens so big files & designs are never cut off
  const longTaskFloor = isLongTaskReq ? 24_576 : 0;
  const effectiveMaxOutputTokens = Math.min(32_768, Math.max(requestedMaxTokens, longTaskFloor));

  const parsedDiscoveredModels = Array.isArray(discoveredModels)
    ? discoveredModels
        .map((m: unknown) => String(m || '').trim())
        .filter(Boolean)
    : [];

  const built = buildAdHocProviderConfig({
    provider: effectiveProvider,
    externalKeys: parsedKeys,
    externalModel: activeCustomModelName,
    externalBaseUrl,
    maxOutputTokens: effectiveMaxOutputTokens,
    discoveredModels: parsedDiscoveredModels,
    exactModelOnly: Boolean(activeCustomModelName),
    contextWindow,
    respectCustomBaseUrl: true,
  });

  const cleanVoiceUserName = String(nickname || userName || '').trim();
  const liveVoiceSysInstruction = liveVoiceMode
    ? [
        `You are SMFTA AI Pro in real-time spoken voice conversation${cleanVoiceUserName ? ` with ${cleanVoiceUserName}` : ''}.`,
        'Reply naturally, warmly, and clearly in the exact language the user spoke (Bengali, English, or mixed Banglish).',
        'Keep replies crisp and directly helpful: usually 1 to 3 clear, natural, complete spoken sentences.',
        'NEVER output markdown tables, pipe characters (|), bullet lists, numbered lists, code blocks, raw URLs, asterisks (*), hashtags (#), or emojis — write pure, natural spoken prose that sounds effortless and crystal clear when read aloud.',
        replyLang === 'bn'
          ? 'Use natural, clear standard Bengali pronunciation and simple everyday words.'
          : replyLang === 'en'
            ? 'Use clear, natural conversational English.'
            : 'Match the user language seamlessly with clear, natural phrasing.',
      ].join(' ')
    : '';

  const effectiveSysInstruction = liveVoiceMode ? liveVoiceSysInstruction : sysInstruction;

  const canonicalMessages: CanonicalMessage[] = [
    { role: 'system', content: effectiveSysInstruction },
    ...normalizedHistory.map((m) => ({
      role: (m.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
      content: m.content || (m.imgs?.length ? 'Analyze the attached image(s).' : ''),
      imgs: m.imgs,
    })),
  ];

  emitEvent({
    type: 'progress',
    step: 'routing',
    detail: `Routing to ${effectiveProvider}${activeCustomModelName ? ` · ${activeCustomModelName}` : ''}`,
  });

  if (requestedThinkingMode !== 'off' && !INSTANT_GREETING_REGEX.test(lastUserText)) {
    emitStatus('চিন্তা করছি…', 'thinking', 'Reasoning in progress');
  }

  // 3B. Ultra-low-latency Live Voice Fast-Lane (sub-second TTFT via gemini-3.1-flash-lite)
  const isCustomNonGeminiProvider =
    Boolean(parsedKeys.length > 0) &&
    effectiveProvider !== 'gemini_custom' &&
    effectiveProvider !== 'gemini_openai' &&
    effectiveProvider !== 'xrahat' &&
    effectiveProvider !== 'smfta_cloud';

  if (liveVoiceMode && !isCustomNonGeminiProvider && !clientClosed) {
    const fastGeminiKey =
      (parsedKeys.find((k) => k.startsWith('AIza')) || getV2GeminiApiKey() || '').trim();
    if (fastGeminiKey) {
      const fastAi = new GoogleGenAI({
        apiKey: fastGeminiKey,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
      });
      const voiceHistoryContents = normalizedHistory.slice(-8).map((m) => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: String(m.content || '').slice(0, 2000) || ' ' }],
      }));
      const fastVoiceCandidates: Array<{ model: string; level: ThinkingLevel }> = [
        { model: 'gemini-3.1-flash-lite', level: ThinkingLevel.MINIMAL },
        { model: 'gemini-4-hydrogen', level: ThinkingLevel.LOW },
      ];

      for (const cand of fastVoiceCandidates) {
        if (clientClosed || upstreamAbortController.signal.aborted) break;
        let receivedFirstChunk = false;
        let candidateTimedOut = false;
        let firstTokenTimer: ReturnType<typeof setTimeout> | null = null;
        try {
          const streamPromise = fastAi.models.generateContentStream({
            model: cand.model,
            contents: voiceHistoryContents,
            config: {
              systemInstruction: liveVoiceSysInstruction,
              maxOutputTokens: Math.min(effectiveMaxOutputTokens, 260),
              thinkingConfig: { thinkingLevel: cand.level },
            },
          });

          const fastStream = await Promise.race([
            streamPromise,
            new Promise<never>((_, reject) => {
              firstTokenTimer = setTimeout(() => {
                candidateTimedOut = true;
                reject(new Error(`Voice fast-lane ${cand.model} connect timeout`));
              }, 6000);
            }),
          ]);

          for await (const chunk of fastStream) {
            if (clientClosed || upstreamAbortController.signal.aborted || candidateTimedOut) {
              break;
            }
            const deltaText = chunk.text || '';
            if (deltaText) {
              if (!receivedFirstChunk) {
                receivedFirstChunk = true;
                if (firstTokenTimer) {
                  clearTimeout(firstTokenTimer);
                  firstTokenTimer = null;
                }
              }
              emitDelta(deltaText);
            }
          }

          if (firstTokenTimer) {
            clearTimeout(firstTokenTimer);
            firstTokenTimer = null;
          }

          if (fullReplyAccumulator.trim()) {
            finishStream({
              type: 'done',
              ok: true,
              requestId,
              requestedProvider: effectiveProvider,
              requestedModel: activeCustomModelName || cand.model,
              providerUsed: 'gemini',
              modelUsed: cand.model,
              attemptCount: 1,
              latencyMs: Math.max(1, Math.round(performance.now() - streamStartPerf)),
            });
            return;
          }
        } catch {
          if (firstTokenTimer) {
            clearTimeout(firstTokenTimer);
            firstTokenTimer = null;
          }
          // Try next fast voice candidate or fall through to standard engine
        }
      }
    }
  }

  // 4. Route through HardenedAIEngine.stream() when provider/server-key candidates exist
  const shouldTryEngineCandidates =
    built.adHocProviders.length > 0 ||
    (effectiveProvider !== 'xrahat' && effectiveProvider !== 'smfta_cloud');

  let streamResAttempts: AttemptRecord[] = [];
  let nonStreamAttempts: AttemptRecord[] = [];

  if (shouldTryEngineCandidates) {
    const isolateCustom =
      built.hasUserKeys ||
      effectiveProvider === 'custom' ||
      effectiveProvider === 'ollama' ||
      effectiveProvider === 'lmstudio';

    const preferredModelForEngine =
      effectiveProvider === 'gemini_custom' || effectiveProvider === 'gemini_openai'
        ? activeCustomModelName
          ? normalizeGeminiModelName(activeCustomModelName)
          : 'gemini-3.1-flash-lite'
        : built.adHocProviders[0]?.provider.provider_id === 'gemini_server'
        ? built.adHocProviders[0].provider.models[0]?.model_id || 'gemini-3.1-flash-lite'
        : activeCustomModelName || undefined;

    // 4a. Use SSE streaming when supportsStreaming !== false
    if (supportsStreaming !== false) {
      const streamRes = await engine.stream(
        {
          userId: scopedUserId,
          conversationId: String(sessionId || 'default-session').slice(0, 64),
          messages: canonicalMessages,
          preferredProviderId:
            built.adHocProviders[0]?.provider.provider_id ||
            (effectiveProvider === 'gemini_custom' ||
            effectiveProvider === 'gemini_openai'
              ? effectiveProvider
              : undefined),
          preferredModelId: preferredModelForEngine,
          maxOutputTokens: effectiveMaxOutputTokens,
          maxUserMessageChars: 120_000,
          temperature:
            typeof weightTemp === 'number'
              ? weightTemp
              : algoDecision.temperature,
          topP: typeof topP === 'number' ? topP : algoDecision.topP,
          topK: parsedTopK,
          stopSequences: parsedStopSequences,
          thinkingMode: effectiveThinkingMode,
          customParams: parsedCustomParams,
          perAttemptTimeoutMs,
          language:
            replyLang === 'bn' || replyLang === 'en' ? replyLang : 'auto',
          abortSignal: upstreamAbortController.signal,
          adHocProviders: built.adHocProviders,
          skipServerRegistry: isolateCustom,
          allowResetUnderChars: 80,
        },
        {
          onToken: (delta) => {
            emitDelta(delta);
          },
          onThinking: (thinkingChunk) => {
            emitThinking(thinkingChunk);
          },
          onReset: () => {
            emitReset();
          },
          onErrorEvent: (msg) => {
            lastErrorMessage = msg;
          },
        }
      );

      if (streamRes.attempts) {
        streamResAttempts = streamRes.attempts;
      }

      if (streamRes.ok && fullReplyAccumulator.trim()) {
        streamSucceeded = true;
        streamTruncated = Boolean(streamRes.truncated);
        actualProviderUsed = streamRes.providerId || effectiveProvider;
        actualModelUsed = streamRes.modelId || activeCustomModelName || 'default';
      } else if (
        streamRes.text === SERVER_KEY_DAILY_CAP_REACHED_MESSAGE_BN &&
        allowKeylessFallback === false
      ) {
        emitEvent({
          type: 'error',
          ok: false,
          code: 'QUOTA_EXHAUSTED',
          retryable: false,
          requestId,
          message: SERVER_KEY_DAILY_CAP_REACHED_MESSAGE_BN,
          text: SERVER_KEY_DAILY_CAP_REACHED_MESSAGE_BN,
          delta: SERVER_KEY_DAILY_CAP_REACHED_MESSAGE_BN,
        });
        finishStream();
        return;
      }
    }

    const lastStreamFailClass =
      streamResAttempts.length > 0
        ? streamResAttempts[streamResAttempts.length - 1]?.class
        : null;
    const isTerminalAuthOrModelFailure =
      lastStreamFailClass === 'AUTH_INVALID' ||
      lastStreamFailClass === 'QUOTA_EXHAUSTED' ||
      lastStreamFailClass === 'MODEL_UNAVAILABLE' ||
      lastStreamFailClass === 'PERMISSION_DENIED';

    // 4b. Non-streaming execution when supportsStreaming === false, OR fallback when streaming failed due to gateway SSE incompatibility
    if (
      !streamSucceeded &&
      !clientClosed &&
      (built.adHocProviders.length > 0 ||
        effectiveProvider === 'gemini_custom' ||
        effectiveProvider === 'gemini_openai') &&
      (supportsStreaming === false || !isTerminalAuthOrModelFailure)
    ) {
      engine.resetEphemeralKeyPool();
      const nonStreamRes = await engine.generate({
        userId: scopedUserId,
        conversationId: String(sessionId || 'default-session').slice(0, 64),
        messages: canonicalMessages,
        preferredProviderId:
          built.adHocProviders[0]?.provider.provider_id ||
          (effectiveProvider === 'gemini_custom' ||
          effectiveProvider === 'gemini_openai'
            ? effectiveProvider
            : undefined),
        preferredModelId: preferredModelForEngine,
        maxOutputTokens: effectiveMaxOutputTokens,
        maxUserMessageChars: 120_000,
        temperature:
          typeof weightTemp === 'number'
            ? weightTemp
            : algoDecision.temperature,
        topP: typeof topP === 'number' ? topP : algoDecision.topP,
        topK: parsedTopK,
        stopSequences: parsedStopSequences,
        thinkingMode: effectiveThinkingMode,
        customParams: parsedCustomParams,
        perAttemptTimeoutMs,
        language:
          replyLang === 'bn' || replyLang === 'en' ? replyLang : 'auto',
        abortSignal: upstreamAbortController.signal,
        adHocProviders: built.adHocProviders,
        skipServerRegistry: isolateCustom,
      });
      if (nonStreamRes.attempts) {
        nonStreamAttempts = nonStreamRes.attempts;
      }
      if (nonStreamRes.ok && nonStreamRes.text.trim()) {
        if (fullReplyAccumulator.length > 0) {
          emitReset();
        }
        if (nonStreamRes.thinking) {
          emitThinking(nonStreamRes.thinking);
        }
        await emitChunkedDelta(nonStreamRes.text);
        streamSucceeded = true;
        actualProviderUsed = nonStreamRes.providerId || effectiveProvider;
        actualModelUsed = nonStreamRes.modelId || activeCustomModelName || 'default';
      } else if (nonStreamRes.text) {
        lastErrorMessage = nonStreamRes.text;
      }
    }
  }

  // 5. Keyless Xrahat engine ONLY when explicitly selected or when user explicitly consented to allowKeylessFallback (P1-05)
  const canUseKeyless =
    effectiveProvider === 'xrahat' ||
    effectiveProvider === 'smfta_cloud' ||
    allowKeylessFallback === true;

  // 5a. Built-in SMFTA models: reliable gateway path first (no user key needed)
  if (!streamSucceeded && !clientClosed && canUseKeyless && isLovableAiAvailable()) {
    if (fullReplyAccumulator.length > 0) {
      emitReset();
    }
    const gw = await streamFromLovableAi({
      systemInstruction: sysInstruction,
      history:
        normalizedHistory.length > 0
          ? normalizedHistory
          : [{ role: 'user', content: lastUserText }],
      requestedModel: activeCustomModelName,
      signal: upstreamAbortController.signal,
      emitDelta,
      emitThinking,
      thinkingEffort: requestedThinkingMode,
      maxTokens: effectiveMaxOutputTokens,
    });
    if (gw.ok) {
      streamSucceeded = true;
      streamTruncated = Boolean(gw.truncated);
      actualProviderUsed = 'smfta_cloud';
      actualModelUsed = gw.modelUsed || gw.model || activeCustomModelName || 'smfta-flash';
      if (gw.fallbackNotice) {
        gatewayFallbackNotice = gw.fallbackNotice;
      }
    } else if (fullReplyAccumulator.length > 0) {
      emitReset();
    }
  }

  if (!streamSucceeded && !clientClosed && canUseKeyless) {
    if (fullReplyAccumulator.length > 0) {
      emitReset();
    }
    const uid = getOrCreateSessionUid(
      sessionId,
      normalizedHistory.length <= 1
    );
    streamSucceeded = await streamFromXrahat(
      sysInstruction,
      normalizedHistory.length > 0
        ? normalizedHistory
        : [{ role: 'user', content: lastUserText }],
      uid,
      upstreamAbortController.signal,
      emitDelta,
      emitChunkedDelta
    );
    if (streamSucceeded) {
      actualProviderUsed = 'xrahat';
      actualModelUsed = 'SMFTA cloud fallback';
    }
  }

  // 6. Auto-continuation if truncated (MAX_TOKENS/LENGTH) or cut mid-block/mid-sentence
  const isLongTask = isLongCodeOrWritingRequest(lastUserText);
  const needsContinuation = (acc: string) =>
    hasUnclosedCodeFence(acc) ||
    hasUnclosedArtifactTag(acc) ||
    hasUnclosedHtmlDocument(acc) ||
    (isLongTask && acc.length > 400 && looksTruncated(acc));

  let contFailedOrStillTruncated = false;
  for (
    let contRound = 0;
    contRound < MAX_AUTO_CONTINUATIONS &&
    streamSucceeded &&
    !clientClosed &&
    (streamTruncated || needsContinuation(fullReplyAccumulator));
    contRound++
  ) {
    const tailSnippet = fullReplyAccumulator.slice(-900);
    const reasonHint = hasUnclosedArtifactTag(fullReplyAccumulator)
      ? 'inside an unclosed <smfta_artifact> block. Continue directly and close </smfta_artifact> properly.'
      : hasUnclosedHtmlDocument(fullReplyAccumulator)
      ? 'inside an incomplete HTML document. Continue directly and finish through </html>.'
      : hasUnclosedCodeFence(fullReplyAccumulator)
      ? 'inside an unclosed code block. Continue writing from the exact line where it stopped and close the code block properly.'
      : 'before finishing the full response. Continue writing seamlessly from the exact point where it stopped until complete.';
    const contPrompt = `Your previous response was cut off ${reasonHint} Do NOT repeat the beginning.\n\nStopped right after:\n\"\"\"\n${tailSnippet}\n\"\"\"`;
    const contRes = await callBackendEngine(contPrompt, sysInstruction, {
      maxTokens: Math.min(32_768, Math.max(16_384, effectiveMaxOutputTokens)),
      preferredProvider: effectiveProvider,
      preferredModel: activeCustomModelName,
      externalKeys: parsedKeys,
      externalBaseUrl,
      temperature: algoDecision.temperature,
      topP: algoDecision.topP,
    });
    if (!contRes.ok || !contRes.text) {
      contFailedOrStillTruncated = true;
      break;
    }
    const mergedCont = mergeContinuationText(fullReplyAccumulator, contRes.text);
    if (!mergedCont.deltaToAppend) {
      contFailedOrStillTruncated = false;
      streamTruncated = false;
      break;
    }
    emitDelta(mergedCont.deltaToAppend);
    streamTruncated = false;
  }

  const finalV1Truncated =
    contFailedOrStillTruncated || streamTruncated || needsContinuation(fullReplyAccumulator);

  // 7. Store successful non-truncated single-turn reply in user-scoped sha256 response cache
  if (
    streamSucceeded &&
    !finalV1Truncated &&
    memoryCache !== false &&
    normalizedHistory.length <= 2 &&
    lastUserImgs.length === 0 &&
    !webSearch &&
    fullReplyAccumulator.trim().length > 8
  ) {
    setCachedResponse(
      lastUserText,
      fullReplyAccumulator,
      mode,
      replyLang,
      sysInstruction,
      cacheModelKey,
      scopedUserId
    );
  }

  const allAttempts: AttemptRecord[] = [
    ...streamResAttempts,
    ...nonStreamAttempts,
  ];

  if (!streamSucceeded && !clientClosed) {
    if (
      engine.isServerKeyBudgetReached() &&
      allowKeylessFallback === false
    ) {
      emitEvent({
        type: 'error',
        ok: false,
        code: 'QUOTA_EXHAUSTED',
        retryable: false,
        requestId,
        message: SERVER_KEY_DAILY_CAP_REACHED_MESSAGE_BN,
        text: SERVER_KEY_DAILY_CAP_REACHED_MESSAGE_BN,
        delta: SERVER_KEY_DAILY_CAP_REACHED_MESSAGE_BN,
      });
    } else {
      let detailedDiag = '';
      const lastAttempt =
        allAttempts.length > 0 ? allAttempts[allAttempts.length - 1] : null;
      const errorCode =
        lastAttempt?.class ||
        (fullReplyAccumulator.trim() ? 'STREAM_ERROR' : 'EMPTY_RESPONSE');
      const httpStatus = lastAttempt?.http_status ?? null;
      const upstreamError = sanitizeErrorMsg(
        lastAttempt?.error_message || '',
        parsedKeys
      );
      const statusBadge = httpStatus ? `HTTP ${httpStatus}` : errorCode;
      const upstreamSnippet = upstreamError
        ? ` — Upstream: "${upstreamError.slice(0, 200)}"`
        : '';
      const targetModelLabel =
        lastAttempt?.candidate?.model_id || activeCustomModelName || 'default';

      engine.storage.appendAuditLog({
        eventType: 'CHAT_STREAM_PROVIDER_FAILED',
        providerId: effectiveProvider,
        details: {
          request_id: requestId,
          provider: effectiveProvider,
          model: targetModelLabel,
          http_status: httpStatus,
          error_code: errorCode,
          upstream_error: upstreamError.slice(0, 300),
          attempt_count: allAttempts.length,
        },
      });

      if (lastAttempt) {
        if (lastAttempt.class === 'AUTH_INVALID') {
          detailedDiag = `API Key সঠিক নয় বা অনুমোদনহীন (${statusBadge} · AUTH_INVALID on ${targetModelLabel})${upstreamSnippet}`;
        } else if (lastAttempt.class === 'PERMISSION_DENIED') {
          detailedDiag = `প্রোভাইডার অ্যাক্সেস প্রত্যাখ্যান করেছে (${statusBadge} · PERMISSION_DENIED on ${targetModelLabel})${upstreamSnippet}`;
        } else if (lastAttempt.class === 'MODEL_UNAVAILABLE') {
          detailedDiag = `মডেল "${targetModelLabel}" এই গেটওয়েতে পাওয়া যায়নি বা সাপোর্টেড নয় (${statusBadge} · MODEL_UNAVAILABLE)${upstreamSnippet}`;
        } else if (lastAttempt.class === 'QUOTA_EXHAUSTED') {
          detailedDiag = `প্রোভাইডারের ব্যালেন্স বা কোটা শেষ (${statusBadge} · QUOTA_EXHAUSTED on ${targetModelLabel})${upstreamSnippet}`;
        } else if (lastAttempt.class === 'RATE_LIMITED') {
          detailedDiag = `রিকোয়েস্ট লিমিট অতিক্রম করেছে (${statusBadge} · RATE_LIMITED 429 on ${targetModelLabel})${upstreamSnippet}`;
        } else if (lastAttempt.class === 'BAD_REQUEST') {
          detailedDiag = `গেটওয়ে রিকোয়েস্ট বা মডেল প্যারামিটার গ্রহণ করেনি (${statusBadge} · BAD_REQUEST on "${targetModelLabel}")${upstreamSnippet}`;
        } else if (lastAttempt.class === 'CONTEXT_TOO_LONG') {
          detailedDiag = `মেসেজের আকার মডেলের কনটেক্সট সীমার চেয়ে বড় (${statusBadge} · CONTEXT_TOO_LONG on ${targetModelLabel})${upstreamSnippet}`;
        } else if (lastAttempt.class === 'BAD_RESPONSE') {
          detailedDiag = `গেটওয়ে থেকে খালি বা অপ্রত্যাশিত রেসপন্স এসেছে (${statusBadge} · BAD_RESPONSE on "${targetModelLabel}")${upstreamSnippet}`;
        } else if (lastAttempt.class === 'SERVER_ERROR') {
          detailedDiag = `প্রোভাইডার গেটওয়ে সার্ভার ত্রুটি (${statusBadge} · SERVER_ERROR on "${targetModelLabel}")${upstreamSnippet}`;
        } else if (lastAttempt.class === 'NETWORK_ERROR') {
          detailedDiag = `কাস্টম সার্ভার সংযোগ ব্যর্থ (${statusBadge} · NETWORK_ERROR)${upstreamSnippet}`;
        } else if (lastAttempt.class === 'TIMEOUT') {
          detailedDiag = `কাস্টম সার্ভার থেকে নির্ধারিত সময়ে উত্তর আসেনি (${statusBadge} · TIMEOUT)${upstreamSnippet}`;
        } else {
          detailedDiag = formatActionableProviderError(
            allAttempts,
            replyLang === 'bn' || replyLang === 'en' ? replyLang : 'auto',
            lastUserText
          );
        }
      }

      const errToShow =
        detailedDiag ||
        lastErrorMessage ||
        'সার্ভার থেকে উত্তর পাওয়া যায়নি।';
      const formattedErr = `⚠️ AI প্রোভাইডার ত্রুটি: ${sanitizeErrorMsg(errToShow, parsedKeys)}`;
      const retryable =
        errorCode === 'RATE_LIMITED' ||
        errorCode === 'NETWORK_ERROR' ||
        errorCode === 'TIMEOUT' ||
        errorCode === 'SERVER_ERROR';

      emitEvent({
        type: 'error',
        ok: false,
        code: errorCode,
        httpStatus,
        upstreamError,
        retryable,
        requestId,
        attemptCount: allAttempts.length || 1,
        message: formattedErr,
        text: formattedErr,
        delta: formattedErr,
      });
    }
    finishStream();
    return;
  }

  const nowPerf = performance.now();
  const providerSwitched =
    actualProviderUsed !== effectiveProvider &&
    !(
      (effectiveProvider === 'smfta_cloud' || effectiveProvider === 'xrahat') &&
      (actualProviderUsed === 'xrahat' ||
        actualProviderUsed === 'gemini' ||
        actualProviderUsed === 'server_gemini' ||
        actualProviderUsed === 'gemini_server' ||
        actualProviderUsed === 'smfta_cloud')
    ) &&
    !(
      (effectiveProvider === 'gemini_custom' || effectiveProvider === 'gemini_openai') &&
      actualProviderUsed === 'gemini'
    );
  const modelSwitched = Boolean(
    activeCustomModelName &&
      actualModelUsed &&
      actualModelUsed !== 'default' &&
      actualModelUsed !== 'smfta-core' &&
      !activeCustomModelName.startsWith('smfta-') &&
      actualModelUsed !== activeCustomModelName
  );
  const fallbackUsed = providerSwitched || modelSwitched || Boolean(gatewayFallbackNotice);
  const fallbackNotice =
    gatewayFallbackNotice ||
    (providerSwitched || modelSwitched
      ? `Switched from ${effectiveProvider}${activeCustomModelName ? `/${activeCustomModelName}` : ''} to ${actualProviderUsed}/${actualModelUsed}`
      : undefined);

  finishStream({
    type: 'done',
    ok: true,
    requestId,
    requestedProvider: effectiveProvider,
    requestedModel: activeCustomModelName || 'default',
    providerUsed: actualProviderUsed,
    modelUsed: actualModelUsed,
    fallbackUsed,
    fallbackNotice,
    truncated: finalV1Truncated,
    attemptCount: Math.max(1, allAttempts.length),
    ttftMs:
      firstTokenPerf !== null
        ? Math.max(1, Math.round(firstTokenPerf - streamStartPerf))
        : undefined,
    latencyMs: Math.max(1, Math.round(nowPerf - streamStartPerf)),
    sources: groundedSources.length > 0 ? groundedSources : undefined,
  });
  } catch (unhandledErr: unknown) {
    const safeMsg = sanitizeErrorMsg(unhandledErr, parsedKeys);
    console.error('[chat/stream] unhandled error:', unhandledErr);
    if (!clientClosed && !res.writableEnded) {
      const formatted = `⚠️ AI প্রোভাইডার ত্রুটি: ${safeMsg}`;
      emitEvent({
        type: 'error',
        ok: false,
        code: 'STREAM_EXCEPTION',
        retryable: true,
        requestId,
        message: formatted,
        text: formatted,
        delta: formatted,
      });
      finishStream();
    }
  }
});

// ============================================================================
// 2. ENGINE BATTLE ENDPOINT (Phase 4.2)
// ============================================================================
function countWords(text: string): number {
  const clean = (text || '').trim();
  if (!clean) return 0;
  return clean.split(/\s+/).filter(Boolean).length;
}

chatRouter.post('/battle', async (req: Request, res: Response) => {
  const {
    prompt = '',
    provider,
    externalKeys,
    externalModel,
    externalBaseUrl,
  } = req.body || {};

  const trimmedPrompt = String(prompt || '').trim();
  if (!trimmedPrompt) {
    return res.status(400).json({ error: 'Prompt is required' });
  }

  const runSide = async (sysPrompt: string, maxTokens: number) => {
    const t0 = performance.now();
    try {
      const result = await callBackendEngine(trimmedPrompt, sysPrompt, {
        maxTokens,
        preferredProvider: provider,
        preferredModel: externalModel,
        externalKeys,
        externalBaseUrl,
      });
      const ms = Math.max(1, Math.round(performance.now() - t0));
      if (!result.ok || !result.text.trim()) {
        throw new Error(result.error || 'Provider returned empty response');
      }
      const text = sanitizeProprietaryOutput(result.text.trim());
      return {
        text,
        ms,
        words: countWords(text),
      };
    } catch (err) {
      const ms = Math.max(1, Math.round(performance.now() - t0));
      const errWithTiming = new Error(sanitizeErrorMsg(err)) as Error & {
        ms?: number;
      };
      errWithTiming.ms = ms;
      throw errWithTiming;
    }
  };

  const [settledA, settledB] = await Promise.allSettled([
    runSide(
      'You are SMFTA-1 Flash. Reply with speed, punchy bullet points, and concise clarity in the same language as the user.',
      1024
    ),
    runSide(
      'You are SMFTA-3 Ultra. Provide a comprehensive, deeply structured, analytical breakdown with examples in the same language as the user.',
      2048
    ),
  ]);

  const aOk = settledA.status === 'fulfilled';
  const bOk = settledB.status === 'fulfilled';

  if (!aOk && !bOk) {
    const errA = sanitizeErrorMsg(
      (settledA as PromiseRejectedResult).reason
    );
    const errB = sanitizeErrorMsg(
      (settledB as PromiseRejectedResult).reason
    );
    const msA =
      ((settledA as PromiseRejectedResult).reason as { ms?: number })?.ms ?? 1;
    const msB =
      ((settledB as PromiseRejectedResult).reason as { ms?: number })?.ms ?? 1;

    return res.status(502).json({
      error: `${errA}; ${errB}`,
      flash: '',
      ultra: '',
      engineA: { text: errA, ms: msA, words: 0, isError: true },
      engineB: { text: errB, ms: msB, words: 0, isError: true },
    });
  }

  const engineA = aOk
    ? settledA.value
    : {
        text: `⚠️ ${sanitizeErrorMsg(
          (settledA as PromiseRejectedResult).reason
        )}`,
        ms:
          ((settledA as PromiseRejectedResult).reason as { ms?: number })?.ms ??
          1,
        words: 0,
        isError: true,
      };

  const engineB = bOk
    ? settledB.value
    : {
        text: `⚠️ ${sanitizeErrorMsg(
          (settledB as PromiseRejectedResult).reason
        )}`,
        ms:
          ((settledB as PromiseRejectedResult).reason as { ms?: number })?.ms ??
          1,
        words: 0,
        isError: true,
      };

  return res.json({
    flash: engineA.text,
    ultra: engineB.text,
    engineA,
    engineB,
  });
});

// ============================================================================
// 3. V2 – SPECIAL (FIREBASE AI) QUOTA & TESTING ENDPOINTS
// ============================================================================
chatRouter.get('/v2/quota', async (req: Request, res: Response) => {
  const userId = String(
    req.query?.userId || req.userId || 'default-user'
  ).slice(0, 128);
  const userEmail = String(req.query?.userEmail || '').slice(0, 128);
  const emailVerified = req.query?.emailVerified === 'true';

  const snapshot = await getAllV2ModelStatusesForUser({
    userId,
    userEmail: userEmail || undefined,
    emailVerified,
  });

  return res.json({
    ok: true,
    ...snapshot,
  });
});

chatRouter.post('/v2/quota/config', async (req: Request, res: Response) => {
  const {
    userId = 'default-user',
    userEmail = '',
    emailVerified = false,
    v5Limit,
    proLimit,
    maxLimit,
    testingAllowance,
    testingBypassEnabled,
  } = req.body || {};

  const authorized = isServerAuthorizedTester(
    typeof userEmail === 'string' ? userEmail : undefined,
    typeof userId === 'string' ? userId : undefined,
    Boolean(emailVerified)
  );
  if (!authorized) {
    return res.status(403).json({
      ok: false,
      error: 'Only authorized admin/testing accounts can update V2 quota config.',
    });
  }

  const updated = await updateServerV2QuotaConfig(String(userId), {
    v5Limit,
    proLimit,
    maxLimit,
    testingAllowance,
    testingBypassEnabled,
  });
  const snapshot = await getAllV2ModelStatusesForUser({
    userId: String(userId),
    userEmail: typeof userEmail === 'string' ? userEmail : undefined,
    emailVerified: Boolean(emailVerified),
    configOverride: updated,
  });
  return res.json({ ok: true, ...snapshot });
});

chatRouter.post('/v2/quota/simulate', async (req: Request, res: Response) => {
  const {
    userId = 'default-user',
    userEmail = '',
    emailVerified = false,
    modelId = 'smfta-v5',
    usedCount = 0,
    testingUsedCount,
  } = req.body || {};

  const authorized = isServerAuthorizedTester(
    typeof userEmail === 'string' ? userEmail : undefined,
    typeof userId === 'string' ? userId : undefined,
    Boolean(emailVerified)
  );
  if (!authorized || !isV2ModelId(modelId)) {
    return res.status(403).json({
      ok: false,
      error: 'Unauthorized or invalid V2 modelId for simulation.',
    });
  }

  const status = await setServerV2UsageCountForTesting({
    userId: String(userId),
    userEmail: typeof userEmail === 'string' ? userEmail : undefined,
    modelId,
    usedCount: Number(usedCount) || 0,
    testingUsedCount:
      typeof testingUsedCount === 'number' ? testingUsedCount : undefined,
  });
  const snapshot = await getAllV2ModelStatusesForUser({
    userId: String(userId),
    userEmail: typeof userEmail === 'string' ? userEmail : undefined,
    emailVerified: Boolean(emailVerified),
  });
  return res.json({ ok: true, status, ...snapshot });
});

// ============================================================================
// 4. LIGHTWEIGHT AI MEMORY EXTRACTION ENDPOINT (§4 Memory System)
// ============================================================================
chatRouter.post('/memory/extract', async (req: Request, res: Response) => {
  const {
    messages = [],
    existingMemories = [],
    autoMemory = true,
    memoryPaused = false,
    incognito = false,
    provider,
    externalKeys,
    externalModel,
    externalBaseUrl,
  } = req.body || {};

  if (!autoMemory || memoryPaused || incognito) {
    return res.json({ ok: true, memories: [], skipped: true });
  }

  const validMessages = Array.isArray(messages)
    ? messages
        .slice(-10)
        .map((m: { role?: string; text?: string; content?: string }) => ({
          role: m?.role === 'user' ? 'User' : 'AI',
          text: String(m?.text || m?.content || '').trim().slice(0, 600),
        }))
        .filter((m) => m.text.length > 0)
    : [];

  if (validMessages.length === 0) {
    return res.json({ ok: true, memories: [] });
  }

  const existingList = Array.isArray(existingMemories)
    ? existingMemories
        .map((m: unknown) => String(m || '').trim())
        .filter(Boolean)
        .slice(0, 40)
    : [];

  const extractionSystemPrompt = [
    'You are a strict memory extraction engine.',
    'Analyze the recent conversation and extract ONLY stable, useful personal or project facts about the user (such as name, profession, preferred language, tech stack, ongoing project, or communication preference).',
    'STRICT SECURITY RULES:',
    '- NEVER save passwords, API keys, secret tokens, bank/card numbers, national ID/passport numbers, or private medical/health info.',
    '- NEVER save temporary one-off questions or general knowledge.',
    '- If a fact updates an existing memory key, use the SAME key name with the updated value so it overwrites instead of duplicating.',
    '- Output ONLY valid JSON in the exact format: {"memories": [{"key": "Name", "value": "Rahim"}, {"key": "Preferred Stack", "value": "React + TypeScript"}]}',
    '- If no new or updated stable facts are present, output: {"memories": []}',
  ].join('\n');

  const extractionUserPrompt = [
    existingList.length > 0
      ? `Existing memories:\n${existingList.map((m) => `- ${m}`).join('\n')}\n`
      : '',
    'Recent conversation:',
    ...validMessages.map((m) => `${m.role}: ${m.text}`),
    '\nReturn JSON only:',
  ]
    .filter(Boolean)
    .join('\n');

  try {
    const parsedKeys = String(externalKeys || '')
      .split(/[\n,;]+/)
      .map((k: string) => k.trim())
      .filter(Boolean);

    const aiRes = await callBackendEngine(
      extractionUserPrompt,
      extractionSystemPrompt,
      {
        maxTokens: 400,
        preferredProvider: provider,
        preferredModel: externalModel,
        externalKeys: parsedKeys,
        externalBaseUrl,
        temperature: 0.1,
      }
    );

    const parsedItems = aiRes.ok ? parseExtractedMemoriesJson(aiRes.text) : [];
    const safeItems = parsedItems.filter(
      (item) =>
        !isSensitiveFact(`${item.key}: ${item.value}`) &&
        !isSensitiveFact(item.value)
    );

    return res.json({
      ok: true,
      memories: safeItems,
    });
  } catch {
    return res.json({
      ok: true,
      memories: [],
    });
  }
});

// ============================================================================
// 5. MESSAGE FEEDBACK ENDPOINT (§8 Bottom Action Row — ভালো উত্তর / খারাপ উত্তর)
// ============================================================================
chatRouter.post('/feedback', (req: Request, res: Response) => {
  const {
    messageId = '',
    conversationId = 'default',
    rating = '',
    reason = '',
  } = req.body || {};

  if (rating !== 'up' && rating !== 'down') {
    return res.status(400).json({
      ok: false,
      error: 'rating must be "up" or "down".',
    });
  }

  const cleanMessageId =
    String(messageId || '').trim() || `msg_${Date.now().toString(36)}`;
  const cleanConvId = String(conversationId || 'default').trim().slice(0, 128);
  const cleanReason = String(reason || '').trim().slice(0, 500);
  const userId = String(req.userId || 'anonymous').slice(0, 128);

  try {
    const engine = getSharedHardenedEngine();
    const record = engine.storage.saveMessageFeedback({
      messageId: cleanMessageId,
      conversationId: cleanConvId,
      userId,
      rating,
      reason: cleanReason,
    });
    return res.json({
      ok: true,
      feedback: record,
    });
  } catch (err: unknown) {
    return res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to save feedback.',
    });
  }
});
