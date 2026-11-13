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
  sanitizeErrorMsg,
} from '../aiClient';
import {
  classifyPromptComplexity,
  hasUnclosedCodeFence,
  interceptIdentityQuery,
  isLongCodeOrWritingRequest,
  matchTrainedWeights,
  retrainModelWeights,
} from '../intentRules';
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
import { SERVER_KEY_DAILY_CAP_REACHED_MESSAGE_BN } from '../engine/defaults';
import { sanitizeChatBody } from '../engine/requestGuard';
import type { CanonicalMessage } from '../engine/context';
import { mergeContinuationText } from '../../src/utils/streamGuard';
import { isLovableAiAvailable, streamFromLovableAi } from '../runtime/lovableAi';
import {
  isV2ModelId,
  getV2ModelSpec,
  V2ModelId,
} from '../../src/utils/v2UsageLimits';
import {
  checkAndConsumeServerV2Quota,
  getAllV2ModelStatusesForUser,
  isServerAuthorizedTester,
  setServerV2UsageCountForTesting,
  streamV2FirebaseModel,
  updateServerV2QuotaConfig,
} from '../v2FirebaseAi';

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

async function streamFromXrahat(
  systemInstruction: string,
  history: Array<{ role: string; content: string }>,
  uid: string,
  signal: AbortSignal,
  emitDelta: (delta: string) => void
): Promise<boolean> {
  const promptText = buildXrahatPrompt(systemInstruction, history);
  if (!promptText) return false;

  const streamUrl = buildXrahatUrl(promptText, uid, true);
  let emitted = false;
  let fallbackResetText = '';

  try {
    const res = await fetch(streamUrl, {
      method: 'GET',
      headers: { Accept: 'text/event-stream, application/json' },
      signal,
    });

    if (res.ok && res.body) {
      const contentType = (res.headers.get('content-type') || '').toLowerCase();
      if (contentType.includes('application/json')) {
        const json = await res.json().catch(() => null);
        const reply = extractXrahatReply(json);
        if (reply) {
          emitDelta(reply);
          return true;
        }
      } else {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            buffer += decoder.decode();
            break;
          }
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
              emitDelta(evt.delta);
              emitted = true;
            } else if (evt.reset) {
              fallbackResetText = evt.reset;
            }
          }
        }
        if (buffer.trim()) {
          for (const line of buffer.split(/\r?\n/)) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data:')) continue;
            const dataStr = trimmed.slice(5).trim();
            if (dataStr === '[DONE]') break;
            const evt = parseXrahatSseEvent(dataStr);
            if (evt.delta) {
              emitDelta(evt.delta);
              emitted = true;
            } else if (evt.reset) {
              fallbackResetText = evt.reset;
            }
          }
        }
        if (!emitted && fallbackResetText) {
          emitDelta(fallbackResetText);
          emitted = true;
        }
        if (emitted) return true;
      }
    }
  } catch {
    if (signal.aborted) return emitted;
  }

  if (!emitted && !signal.aborted) {
    try {
      const jsonUrl = buildXrahatUrl(promptText, uid, false);
      const res = await fetch(jsonUrl, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal,
      });
      if (res.ok) {
        const data = await res.json().catch(() => null);
        const reply = extractXrahatReply(data);
        if (reply) {
          emitDelta(reply);
          return true;
        }
      }
    } catch {
      // Ignore fallback error
    }
  }

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
  if (explicitWebSearch) return true;
  const clean = stripAttachedFileBlocks(rawText);
  if (!clean || clean.length < 3) return false;
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

  const emitDelta = (delta: string) => {
    if (!delta || clientClosed || res.writableEnded) return;
    const cleanDelta = sanitizeProprietaryOutput(delta);
    if (!cleanDelta) return;
    if (firstTokenPerf === null) {
      firstTokenPerf = performance.now();
    }
    fullReplyAccumulator += cleanDelta;
    res.write(
      `data: ${JSON.stringify({
        type: 'delta',
        text: cleanDelta,
        delta: cleanDelta,
      })}\n\n`
    );
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
  } = req.body || {};

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

  const parsedKeys = String(externalKeys || '')
    .split(/[\n,;]+/)
    .map((k: string) => k.trim())
    .filter(Boolean);

  const effectiveProvider = resolveEffectiveProvider(
    provider,
    parsedKeys,
    externalBaseUrl
  );

  const activeCustomModelName = String(externalModel || '').trim();
  const RECENT_HISTORY_WINDOW = 24;
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
      .slice(-14)
      .map((m) => {
        const speaker = m.role === 'user' ? 'User' : 'AI';
        const snippet = String(m.text || '')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 180);
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

  emitEvent({
    type: 'meta',
    requestId,
    requestedProvider: effectiveProvider,
    requestedModel: activeCustomModelName || 'default',
  });

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

    const quotaCheck = checkAndConsumeServerV2Quota({
      userId: v2ScopedUserId,
      userEmail:
        typeof firebaseUserEmail === 'string' ? firebaseUserEmail : undefined,
      emailVerified: Boolean(firebaseEmailVerified),
      modelId: v2ModelId,
      configOverride: effectiveV2Config,
    });

    const allQuotaSnapshot = getAllV2ModelStatusesForUser({
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

    const v2SystemInstruction = buildSystemInstruction({
      mode: mode as 'fast' | 'balanced' | 'power',
      style: style as 'concise' | 'detailed',
      replyLang: replyLang as 'auto' | 'bn' | 'en',
      workPersona,
      creativity,
      customInst,
      responseTone,
      codingPrefs,
      memory: memList,
      activeWidgets,
      userName,
      chatHistorySummary: effectiveHistorySummary,
      projectContext:
        typeof projectContext === 'string' ? projectContext.slice(0, 60_000) : '',
    });

    const v2StreamRes = await streamV2FirebaseModel({
      modelId: v2ModelId,
      systemInstruction: v2SystemInstruction,
      history:
        normalizedHistory.length > 0
          ? normalizedHistory
          : [
              {
                role: 'user',
                content: lastUserText || 'Hello',
                imgs: lastUserImgs,
              },
            ],
      signal: upstreamAbortController.signal,
      emitDelta,
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

    if (v2StreamRes.sources && v2StreamRes.sources.length > 0) {
      emitEvent({
        type: 'sources',
        sources: v2StreamRes.sources,
      });
    }

    finishStream({
      type: 'done',
      ok: true,
      requestId,
      requestedProvider: 'firebase_v2',
      requestedModel: v2ModelId,
      providerUsed: 'firebase_v2',
      modelUsed: v2ModelId,
      sources: v2StreamRes.sources,
      attemptCount: 1,
      ttftMs:
        firstTokenPerf !== null
          ? Math.max(1, Math.round(firstTokenPerf - streamStartPerf))
          : undefined,
      latencyMs: Math.max(1, Math.round(performance.now() - streamStartPerf)),
    });
    return;
  }

  // 0. Identity / creator / privacy interception (only for built-in default engine)
  if (lastUserImgs.length === 0 && !isCustomProviderActive) {
    const identityReply = interceptIdentityQuery(lastUserText, replyLang);
    if (identityReply) {
      emitDelta(identityReply);
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
    emitDelta(trainedMatch.exactReply);
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
    webToolAllowed && shouldAutoTriggerLiveWeb(lastUserText, Boolean(webSearch));

  if (normalizedHistory.length > 1 || effectiveHistorySummary.length > 0) {
    emitEvent({
      type: 'progress',
      step: 'context_analysis',
      detail: 'Analyzing Conversation Context...',
    });
  }

  if (lastUserImgs.length > 0) {
    emitEvent({
      type: 'progress',
      step: 'image_analysis',
      detail: `Analyzing ${lastUserImgs.length} attached image${lastUserImgs.length > 1 ? 's' : ''}`,
    });
  } else if (
    typeof projectContext === 'string' &&
    projectContext.trim().length > 0
  ) {
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
    groundedSources = searchRes.sources;
    if (groundedSources.length > 0) {
      emitEvent({
        type: 'sources',
        sources: groundedSources,
      });
    } else if (!webGroundingBlock) {
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
    activeWidgets: Array.isArray(activeWidgets)
      ? activeWidgets.map((w: unknown) => String(w || '')).filter(Boolean)
      : undefined,
    userName,
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

  const conciseRule = "\n\nRESPONSE STYLE (highest priority): Answer only what the user asked. Be short, direct and relevant — no filler, no greetings, no repeating the question, no unrelated suggestions. Use the user's language. When the user asks for code, give complete, working code without truncation.";
  const sysInstruction = `${baseSysInstruction}\n${algoDecision.thinkingHint}${trainedExamplesContext}${webGroundingBlock}${conciseRule}`;
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
      emitDelta(cachedHit);
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
  let lastErrorMessage = '';
  let actualProviderUsed = effectiveProvider;
  let actualModelUsed = activeCustomModelName || 'default';

  // P1-10: Respect requested maxOutputTokens or mode budget without hardcoding a 4096 ceiling on custom providers
  const requestedMaxTokens =
    typeof maxOutputTokens === 'number' && Number.isFinite(maxOutputTokens)
      ? Math.min(32_768, Math.max(64, Math.round(maxOutputTokens)))
      : algoDecision.maxOutputTokens;
  const effectiveMaxOutputTokens = Math.min(32_768, requestedMaxTokens);

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

  const canonicalMessages: CanonicalMessage[] = [
    { role: 'system', content: sysInstruction },
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

    // 4a. Use SSE streaming when supportsStreaming !== false
    if (supportsStreaming !== false) {
      const streamRes = await engine.stream(
        {
          userId: scopedUserId,
          conversationId: String(sessionId || 'default-session').slice(0, 64),
          messages: canonicalMessages,
          preferredProviderId: built.adHocProviders[0]?.provider.provider_id,
          preferredModelId: activeCustomModelName || undefined,
          maxOutputTokens: effectiveMaxOutputTokens,
          maxUserMessageChars: 120_000,
          temperature:
            typeof weightTemp === 'number'
              ? weightTemp
              : algoDecision.temperature,
          topP: typeof topP === 'number' ? topP : algoDecision.topP,
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
      built.adHocProviders.length > 0 &&
      (supportsStreaming === false || !isTerminalAuthOrModelFailure)
    ) {
      engine.resetEphemeralKeyPool();
      const nonStreamRes = await engine.generate({
        userId: scopedUserId,
        conversationId: String(sessionId || 'default-session').slice(0, 64),
        messages: canonicalMessages,
        preferredProviderId: built.adHocProviders[0]?.provider.provider_id,
        preferredModelId: activeCustomModelName || undefined,
        maxOutputTokens: effectiveMaxOutputTokens,
        maxUserMessageChars: 120_000,
        temperature:
          typeof weightTemp === 'number'
            ? weightTemp
            : algoDecision.temperature,
        topP: typeof topP === 'number' ? topP : algoDecision.topP,
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
        emitDelta(nonStreamRes.text);
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
      maxTokens: effectiveMaxOutputTokens,
    });
    if (gw.ok) {
      streamSucceeded = true;
      actualProviderUsed = 'smfta_cloud';
      actualModelUsed = activeCustomModelName || 'smfta-flash';
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
      emitDelta
    );
    if (streamSucceeded) {
      actualProviderUsed = 'xrahat';
      actualModelUsed = 'smfta-core';
    }
  }

  // 6. Auto-continuation if a long code fence was left unclosed
  const isLongTask = isLongCodeOrWritingRequest(lastUserText);
  if (
    streamSucceeded &&
    !clientClosed &&
    isLongTask &&
    hasUnclosedCodeFence(fullReplyAccumulator)
  ) {
    const tailSnippet = fullReplyAccumulator.slice(-500);
    const contPrompt = `Your previous response was cut off inside an unclosed code block. Continue writing from the exact line where it stopped without repeating the beginning, and close the code block properly.\n\nStopped right after:\n"""\n${tailSnippet}\n"""`;
    const contRes = await callBackendEngine(contPrompt, sysInstruction, {
      maxTokens: Math.min(8192, effectiveMaxOutputTokens),
      preferredProvider: effectiveProvider,
      preferredModel: activeCustomModelName,
      externalKeys: parsedKeys,
      externalBaseUrl,
      temperature: algoDecision.temperature,
      topP: algoDecision.topP,
    });
    if (contRes.ok && contRes.text) {
      const mergedCont = mergeContinuationText(fullReplyAccumulator, contRes.text);
      if (mergedCont.deltaToAppend) {
        emitDelta(mergedCont.deltaToAppend);
      }
    }
  }

  // 7. Store successful single-turn reply in user-scoped sha256 response cache
  if (
    streamSucceeded &&
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
      (actualProviderUsed === 'xrahat' || actualProviderUsed === 'server_gemini' || actualProviderUsed === 'smfta_cloud')
    );
  const modelSwitched = Boolean(
    activeCustomModelName &&
      actualModelUsed &&
      actualModelUsed !== 'default' &&
      actualModelUsed !== 'smfta-core' &&
      !activeCustomModelName.startsWith('smfta-') &&
      actualModelUsed !== activeCustomModelName
  );
  const fallbackUsed = providerSwitched || modelSwitched;
  const fallbackNotice = fallbackUsed
    ? `Switched from ${effectiveProvider}${activeCustomModelName ? `/${activeCustomModelName}` : ''} to ${actualProviderUsed}/${actualModelUsed}`
    : undefined;

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
    attemptCount: Math.max(1, allAttempts.length),
    ttftMs:
      firstTokenPerf !== null
        ? Math.max(1, Math.round(firstTokenPerf - streamStartPerf))
        : undefined,
    latencyMs: Math.max(1, Math.round(nowPerf - streamStartPerf)),
    sources: groundedSources.length > 0 ? groundedSources : undefined,
  });
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
chatRouter.get('/v2/quota', (req: Request, res: Response) => {
  const userId = String(
    req.query?.userId || req.userId || 'default-user'
  ).slice(0, 128);
  const userEmail = String(req.query?.userEmail || '').slice(0, 128);
  const emailVerified = req.query?.emailVerified === 'true';

  const snapshot = getAllV2ModelStatusesForUser({
    userId,
    userEmail: userEmail || undefined,
    emailVerified,
  });

  return res.json({
    ok: true,
    ...snapshot,
  });
});

chatRouter.post('/v2/quota/config', (req: Request, res: Response) => {
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

  const updated = updateServerV2QuotaConfig(String(userId), {
    v5Limit,
    proLimit,
    maxLimit,
    testingAllowance,
    testingBypassEnabled,
  });
  const snapshot = getAllV2ModelStatusesForUser({
    userId: String(userId),
    userEmail: typeof userEmail === 'string' ? userEmail : undefined,
    emailVerified: Boolean(emailVerified),
    configOverride: updated,
  });
  return res.json({ ok: true, ...snapshot });
});

chatRouter.post('/v2/quota/simulate', (req: Request, res: Response) => {
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

  const status = setServerV2UsageCountForTesting({
    userId: String(userId),
    userEmail: typeof userEmail === 'string' ? userEmail : undefined,
    modelId,
    usedCount: Number(usedCount) || 0,
    testingUsedCount:
      typeof testingUsedCount === 'number' ? testingUsedCount : undefined,
  });
  const snapshot = getAllV2ModelStatusesForUser({
    userId: String(userId),
    userEmail: typeof userEmail === 'string' ? userEmail : undefined,
    emailVerified: Boolean(emailVerified),
  });
  return res.json({ ok: true, status, ...snapshot });
});
