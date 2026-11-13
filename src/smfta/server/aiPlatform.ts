export type AiRole = 'system' | 'user' | 'assistant';

export interface AiMessage { role: AiRole; content: string; }
export interface RetryOptions { attempts?: number; baseDelayMs?: number; maxDelayMs?: number; shouldRetry?: (error: unknown, attempt: number) => boolean; sleep?: (ms: number) => Promise<void>; }
export interface UsageEstimate { inputTokens: number; outputTokens: number; totalTokens: number; }

const DEFAULT_CONTEXT_CHARS = 120_000;
const RETRYABLE_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

export function estimateTokens(text: string): number { return Math.max(0, Math.ceil(String(text || '').trim().length / 4)); }
export function estimateUsage(input: string, output: string): UsageEstimate { const inputTokens = estimateTokens(input); const outputTokens = estimateTokens(output); return { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens }; }

export function trimMessagesToContext(messages: AiMessage[], maxChars = DEFAULT_CONTEXT_CHARS): AiMessage[] {
  const limit = Math.max(1_000, Math.floor(maxChars));
  const normalized = messages.filter((m) => m && typeof m.content === 'string').map((m) => ({ ...m, content: m.content.trim() })).filter((m) => m.content.length > 0);
  if (!normalized.length) return [];
  const system = normalized.find((m) => m.role === 'system');
  const turns = normalized.filter((m) => m !== system);
  const kept: AiMessage[] = [];
  let used = system?.content.length ?? 0;
  for (let i = turns.length - 1; i >= 0; i -= 1) { const turn = turns[i]; if (!turn) continue; if (kept.length > 0 && used + turn.content.length > limit) break; kept.unshift(turn); used += turn.content.length; }
  return system ? [system, ...kept] : kept;
}

export function parseStructuredJson<T>(text: string): T | null {
  const source = String(text || '').trim(); if (!source) return null;
  const candidates = [source, source.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')];
  for (const candidate of candidates) { try { return JSON.parse(candidate) as T; } catch { /* try next */ } }
  const match = source.match(/\{[\s\S]*\}/); if (!match) return null;
  try { return JSON.parse(match[0]) as T; } catch { return null; }
}
export function isRetryableResponse(status: number): boolean { return RETRYABLE_STATUS.has(status); }

export async function withTimeout<T>(operation: (signal: AbortSignal) => Promise<T>, timeoutMs: number, parentSignal?: AbortSignal): Promise<T> {
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), Math.max(1, timeoutMs));
  const abortParent = () => controller.abort(parentSignal?.reason); parentSignal?.addEventListener('abort', abortParent, { once: true });
  try { return await operation(controller.signal); } finally { clearTimeout(timer); parentSignal?.removeEventListener('abort', abortParent); }
}

export async function withRetry<T>(operation: (attempt: number) => Promise<T>, options?: RetryOptions): Promise<T> {
  const attempts = Math.max(1, Math.floor(options?.attempts ?? 3)); const base = Math.max(0, options?.baseDelayMs ?? 250); const max = Math.max(base, options?.maxDelayMs ?? 4_000);
  const shouldRetry = options?.shouldRetry ?? (() => true); const sleep = options?.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) { try { return await operation(attempt); } catch (error) { lastError = error; if (attempt >= attempts || !shouldRetry(error, attempt)) throw error; await sleep(Math.min(max, base * 2 ** (attempt - 1))); } }
  throw lastError instanceof Error ? lastError : new Error('AI operation failed');
}
export function getDefaultContextLimit(): number { return DEFAULT_CONTEXT_CHARS; }
