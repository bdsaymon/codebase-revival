export type ChatErrorCategory =
  | 'INTEGRATION_REQUIRED'
  | 'RATE_LIMITED'
  | 'NETWORK_ERROR'
  | 'EMPTY_RESPONSE'
  | 'ABORTED'
  | 'PROVIDER_ERROR';

export interface ParsedSseEvent {
  type?: string;
  ok?: boolean;
  code?: string;
  httpStatus?: number;
  integrationRequired?: boolean;
  retryable?: boolean;
  requestId?: string;
  providerUsed?: string;
  modelUsed?: string;
  fallbackUsed?: boolean;
  fallbackNotice?: string;
  attemptCount?: number;
  ttftMs?: number;
  latencyMs?: number;
  sources?: Array<{ title: string; uri?: string; url?: string }>;
  text?: string;
  delta?: string;
  thinking?: string;
  truncated?: boolean;
  reset?: string | boolean;
  message?: string;
  error?: string;
  snapshot?: unknown;
  status?: unknown;
}

export function parseSseChunkBuffer(
  existingBuffer: string,
  incomingText: string
): { events: ParsedSseEvent[]; remainingBuffer: string } {
  const combined = existingBuffer + incomingText;
  const lines = combined.split(/\r?\n/);
  const remainingBuffer = lines.pop() ?? '';
  const events: ParsedSseEvent[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || !line.startsWith('data:')) continue;
    const payload = line.slice(5).trim();
    if (!payload || payload === '[DONE]') continue;
    try {
      const parsed = JSON.parse(payload) as ParsedSseEvent | null;
      if (parsed && typeof parsed === 'object') {
        events.push(parsed);
      }
    } catch {
      // Ignore partial / non-JSON comment lines
    }
  }

  return { events, remainingBuffer };
}

export function classifyChatError(err: unknown): {
  category: ChatErrorCategory;
  message: string;
  retryable: boolean;
} {
  if (
    err instanceof Error &&
    (err.name === 'AbortError' || /\babort(?:ed)?\b/i.test(err.message))
  ) {
    return {
      category: 'ABORTED',
      message: 'Generation stopped by user.',
      retryable: false,
    };
  }

  const withCode = err as { code?: string; integrationRequired?: boolean; message?: string } | null;
  const code = String(withCode?.code || '').toUpperCase();
  const raw = err instanceof Error ? err.message : String(err || 'Unknown error');

  if (
    code === 'INTEGRATION_REQUIRED' ||
    withCode?.integrationRequired ||
    /integration required|missing api key|api_key.*missing/i.test(raw)
  ) {
    return {
      category: 'INTEGRATION_REQUIRED',
      message: raw.includes('Integration required')
        ? raw
        : `Integration required: ${raw}`,
      retryable: false,
    };
  }

  if (code === 'RATE_LIMITED' || /\b429\b|rate limit|quota/i.test(raw)) {
    return {
      category: 'RATE_LIMITED',
      message: raw || 'Rate limit reached (HTTP 429). Please retry in a moment.',
      retryable: true,
    };
  }

  if (code === 'EMPTY_RESPONSE' || /empty response|খালি উত্তর/i.test(raw)) {
    return {
      category: 'EMPTY_RESPONSE',
      message: raw || 'The model returned an empty response. Please try again.',
      retryable: true,
    };
  }

  if (
    code === 'NETWORK_ERROR' ||
    /failed to fetch|networkerror|econn|enotfound|offline|timeout/i.test(raw)
  ) {
    return {
      category: 'NETWORK_ERROR',
      message: raw || 'Network connection error. Please check your connection and retry.',
      retryable: true,
    };
  }

  return {
    category: 'PROVIDER_ERROR',
    message: raw,
    retryable: true,
  };
}
