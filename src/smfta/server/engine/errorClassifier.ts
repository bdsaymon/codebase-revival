import type { SupportedProtocol } from './config';
import { redactSecrets } from './security';

/**
 * Section 5: ERROR CLASSES (E1 - E4)
 */

export type ErrorClass =
  | 'RATE_LIMITED'
  | 'QUOTA_EXHAUSTED'
  | 'AUTH_INVALID'
  | 'PERMISSION_DENIED'
  | 'MODEL_UNAVAILABLE'
  | 'CONTEXT_TOO_LONG'
  | 'BAD_REQUEST'
  | 'TIMEOUT'
  | 'SERVER_ERROR'
  | 'NETWORK_ERROR'
  | 'BAD_RESPONSE'
  | 'CONTENT_BLOCKED'
  | 'UNKNOWN';

export const TRANSIENT_ERROR_CLASSES: ReadonlySet<ErrorClass> = new Set([
  'TIMEOUT',
  'SERVER_ERROR',
  'NETWORK_ERROR',
  'UNKNOWN',
]);

export function isTransientErrorClass(errorClass: ErrorClass): boolean {
  return TRANSIENT_ERROR_CLASSES.has(errorClass);
}

export interface ClassifiedError {
  errorClass: ErrorClass;
  transient: boolean;
  fallbackAllowed: boolean;
  retrySameCandidateAllowed: boolean;
  rebuildContextAt70Percent: boolean;
  alertRequired: boolean;
  httpStatus: number | null;
  retryAfterTimestampMs: number | null;
  redactedMessage: string;
}

/**
 * E1: Reads Retry-After header as delta-seconds or as an HTTP date.
 */
export function parseRetryAfterHeader(
  retryAfterValue: string | null | undefined,
  nowMs: number = Date.now()
): number | null {
  if (!retryAfterValue) return null;
  const trimmed = String(retryAfterValue).trim();
  if (!trimmed) return null;

  // Check if numeric delta-seconds
  if (/^\d+(?:\.\d+)?$/.test(trimmed)) {
    const seconds = Number(trimmed);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return nowMs + Math.ceil(seconds * 1_000);
    }
  }

  // Otherwise parse as HTTP-date
  const parsedDateMs = Date.parse(trimmed);
  if (!Number.isNaN(parsedDateMs) && parsedDateMs > nowMs) {
    return parsedDateMs;
  }

  return null;
}

function extractErrorDetailsFromBody(rawBody?: string | unknown): {
  code: string;
  type: string;
  statusStr: string;
  message: string;
  stopReason: string;
} {
  if (!rawBody) {
    return { code: '', type: '', statusStr: '', message: '', stopReason: '' };
  }

  let parsed: Record<string, unknown> | null = null;
  if (typeof rawBody === 'string') {
    try {
      parsed = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      return {
        code: '',
        type: '',
        statusStr: '',
        message: rawBody,
        stopReason: '',
      };
    }
  } else if (typeof rawBody === 'object' && rawBody !== null) {
    parsed = rawBody as Record<string, unknown>;
  }

  if (!parsed) {
    return { code: '', type: '', statusStr: '', message: '', stopReason: '' };
  }

  const errObj =
    typeof parsed.error === 'object' && parsed.error !== null
      ? (parsed.error as Record<string, unknown>)
      : parsed;

  const code = String(errObj.code ?? parsed.code ?? '').toLowerCase();
  const type = String(errObj.type ?? parsed.type ?? '').toLowerCase();
  const statusStr = String(errObj.status ?? parsed.status ?? '').toLowerCase();
  const message = String(
    errObj.message ??
      parsed.message ??
      parsed.detail ??
      (typeof parsed.error === 'string' ? parsed.error : '')
  );

  // Stop reasons across OpenAI, Gemini, Anthropic
  let stopReason = '';
  if (Array.isArray(parsed.choices) && parsed.choices.length > 0) {
    const c0 = parsed.choices[0] as Record<string, unknown>;
    stopReason = String(c0.finish_reason ?? '');
  } else if (Array.isArray(parsed.candidates) && parsed.candidates.length > 0) {
    const cand0 = parsed.candidates[0] as Record<string, unknown>;
    stopReason = String(cand0.finishReason ?? '');
  } else if (typeof parsed.stop_reason === 'string') {
    stopReason = parsed.stop_reason;
  } else if (
    typeof parsed.promptFeedback === 'object' &&
    parsed.promptFeedback !== null &&
    'blockReason' in parsed.promptFeedback
  ) {
    stopReason = String(
      (parsed.promptFeedback as { blockReason?: unknown }).blockReason ?? ''
    );
  }

  return {
    code,
    type,
    statusStr,
    message,
    stopReason: stopReason.toLowerCase(),
  };
}

const QUOTA_WORDING_REGEX =
  /\b(insufficient_quota|quota\s+exceeded|exceeded\s+your\s+current\s+quota|billing_hard_limit_reached|billing_not_active|billing|credit\s+balance|out\s+of\s+credits|credits?\s+exhausted|quota_exhausted|daily\s+limit\s+exceeded|spend\s+limit|payment\s+required|account\s+balance)\b/i;

const AUTH_KEY_WORDING_REGEX =
  /\b(invalid_api_key|api_key_invalid|invalid\s+api\s+key|invalid\s+x-api-key|authentication_error|unauthenticated|incorrect\s+api\s+key|invalid\s+authentication|invalid\s+token|bad\s+credentials|key\s+not\s+valid|expired\s+api\s+key)\b/i;

const MODEL_NOT_FOUND_WORDING_REGEX =
  /\b(model_not_found|does\s+not\s+exist|unknown\s+model|no\s+such\s+model|model\s+is\s+not\s+found|model\s+not\s+supported|unsupported\s+model|invalid\s+model|not\s+a\s+valid\s+model|no\s+endpoints?\s+found|model\s+.*\s+is\s+not\s+available|model\s+[^\s"']+\s+not\s+found|no\s+available\s+channels?|channel\s+not\s+found|model_not_supported|no\s+distributor|unrecognized\s+model|decommissioned|deprecated\s+model|not_found_error)\b/i;

const CONTEXT_LENGTH_WORDING_REGEX =
  /\b(context_length_exceeded|maximum\s+context\s+length|prompt\s+is\s+too\s+long|input\s+is\s+too\s+long|too\s+many\s+tokens|max_tokens_exceeded|token\s+limit\s+exceeded|exceeds\s+the\s+maximum\s+number\s+of\s+tokens|context\s+window)\b/i;

const SAFETY_STOP_REASON_REGEX =
  /\b(content_filter|safety|recitation|blocklist|prohibited_content|spii|refusal|sensitive)\b/i;

/**
 * Section 5: Classifies any provider response or thrown exception into one of the 13 canonical ErrorClasses.
 */
export function classifyProviderError(params: {
  protocol: SupportedProtocol;
  httpStatus?: number | null;
  rawBody?: string | unknown;
  headers?: Record<string, string | undefined>;
  networkError?: unknown;
  isLocalTimeout?: boolean;
  nowMs?: number;
  providerId?: string;
  keyId?: string;
  requestId?: string;
  logger?: (entry: Record<string, unknown>) => void;
}): ClassifiedError {
  const nowMs = params.nowMs ?? Date.now();
  const status = params.httpStatus ?? null;
  const retryAfterHeader =
    params.headers?.['retry-after'] ?? params.headers?.['Retry-After'];
  const retryAfterTimestampMs = parseRetryAfterHeader(retryAfterHeader, nowMs);

  const details = extractErrorDetailsFromBody(params.rawBody);
  const combinedText = `${details.code} ${details.type} ${details.statusStr} ${details.message}`.trim();
  const redactedMessage = redactSecrets(
    combinedText ||
      (params.networkError instanceof Error
        ? params.networkError.message
        : String(params.networkError || ''))
  );

  const finalize = (
    errorClass: ErrorClass,
    opts?: {
      fallbackAllowed?: boolean;
      rebuildContextAt70Percent?: boolean;
      alertRequired?: boolean;
    }
  ): ClassifiedError => {
    const transient = isTransientErrorClass(errorClass);
    const result: ClassifiedError = {
      errorClass,
      transient,
      fallbackAllowed: opts?.fallbackAllowed ?? true,
      retrySameCandidateAllowed:
        transient || Boolean(opts?.rebuildContextAt70Percent),
      rebuildContextAt70Percent: Boolean(opts?.rebuildContextAt70Percent),
      alertRequired: Boolean(opts?.alertRequired),
      httpStatus: status,
      retryAfterTimestampMs,
      redactedMessage,
    };

    // E3: Every classified error is logged with class, provider_id, key_id (never key value), HTTP status, and request_id
    const logFn = params.logger;
    if (logFn) {
      logFn({
        class: errorClass,
        provider_id: params.providerId || 'unknown',
        key_id: params.keyId || 'unknown',
        http_status: status,
        request_id: params.requestId || 'unknown',
        message: redactedMessage.slice(0, 300),
      });
    }
    return result;
  };

  // 1. Check local timeout or explicit timeout error
  if (params.isLocalTimeout) {
    return finalize('TIMEOUT');
  }

  if (params.networkError && status === null) {
    const errMsg =
      params.networkError instanceof Error
        ? `${params.networkError.name} ${params.networkError.message}`
        : String(params.networkError);
    if (/TimeoutError|AbortError|timed?\s*out|ETIMEDOUT/i.test(errMsg)) {
      return finalize('TIMEOUT');
    }
    if (
      /ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|TLS|certificate|SSL|socket\s+hang\s+up|fetch\s+failed|network/i.test(
        errMsg
      )
    ) {
      return finalize('NETWORK_ERROR');
    }
    return finalize('UNKNOWN', { alertRequired: true });
  }

  // 2. Any 3xx redirect (CP3 & Section 5: classified UNKNOWN and alerted)
  if (status !== null && status >= 300 && status < 400) {
    return finalize('UNKNOWN', { alertRequired: true });
  }

  // 3. Check 2xx responses for CONTENT_BLOCKED, embedded gateway error objects, or BAD_RESPONSE
  if (status !== null && status >= 200 && status < 300) {
    if (
      details.stopReason &&
      SAFETY_STOP_REASON_REGEX.test(details.stopReason)
    ) {
      return finalize('CONTENT_BLOCKED', { fallbackAllowed: false });
    }

    if (params.rawBody === undefined || params.rawBody === null || params.rawBody === '') {
      return finalize('BAD_RESPONSE');
    }

    const classifyEmbedded2xxError = (parsedObj: Record<string, unknown>): ClassifiedError => {
      if (
        details.stopReason &&
        SAFETY_STOP_REASON_REGEX.test(details.stopReason)
      ) {
        return finalize('CONTENT_BLOCKED', { fallbackAllowed: false });
      }
      if (parsedObj.error && combinedText) {
        if (AUTH_KEY_WORDING_REGEX.test(combinedText)) {
          return finalize('AUTH_INVALID');
        }
        if (QUOTA_WORDING_REGEX.test(combinedText)) {
          return finalize('QUOTA_EXHAUSTED');
        }
        if (MODEL_NOT_FOUND_WORDING_REGEX.test(combinedText)) {
          return finalize('MODEL_UNAVAILABLE', { alertRequired: true });
        }
      }
      return finalize('BAD_RESPONSE');
    };

    if (typeof params.rawBody === 'string') {
      const trimmed = params.rawBody.trim();
      if (!trimmed) {
        return finalize('BAD_RESPONSE');
      }
      try {
        const parsed = JSON.parse(trimmed) as Record<string, unknown>;
        if (!hasRequiredProtocolFields(params.protocol, parsed)) {
          return classifyEmbedded2xxError(parsed);
        }
      } catch {
        return finalize('BAD_RESPONSE');
      }
    } else if (typeof params.rawBody === 'object') {
      const parsed = params.rawBody as Record<string, unknown>;
      if (!hasRequiredProtocolFields(params.protocol, parsed)) {
        return classifyEmbedded2xxError(parsed);
      }
    }
  }

  // 4. HTTP 402 -> QUOTA_EXHAUSTED
  if (status === 402) {
    return finalize('QUOTA_EXHAUSTED');
  }

  // 5. HTTP 429 -> E2: Distinguish QUOTA_EXHAUSTED vs RATE_LIMITED using wording/code/type
  if (status === 429) {
    if (QUOTA_WORDING_REGEX.test(combinedText)) {
      return finalize('QUOTA_EXHAUSTED');
    }
    return finalize('RATE_LIMITED');
  }

  // 6. HTTP 401 -> AUTH_INVALID
  if (status === 401) {
    return finalize('AUTH_INVALID');
  }

  // 7. HTTP 403 -> AUTH_INVALID if key/auth wording, else PERMISSION_DENIED
  if (status === 403) {
    if (AUTH_KEY_WORDING_REGEX.test(combinedText)) {
      return finalize('AUTH_INVALID');
    }
    return finalize('PERMISSION_DENIED', { alertRequired: true });
  }

  // 8. HTTP 404 or model-not-found wording -> MODEL_UNAVAILABLE
  if (status === 404 || MODEL_NOT_FOUND_WORDING_REGEX.test(combinedText)) {
    return finalize('MODEL_UNAVAILABLE', { alertRequired: true });
  }

  // 9. HTTP 400 or 422 -> CONTEXT_TOO_LONG if context-length wording, Safety if safety wording, else BAD_REQUEST
  if (status === 400 || status === 422) {
    if (status === 400 && CONTEXT_LENGTH_WORDING_REGEX.test(combinedText)) {
      return finalize('CONTEXT_TOO_LONG', {
        fallbackAllowed: true,
        rebuildContextAt70Percent: true,
      });
    }
    if (AUTH_KEY_WORDING_REGEX.test(combinedText)) {
      // Gemini sometimes returns 400 with API_KEY_INVALID
      return finalize('AUTH_INVALID');
    }
    return finalize('BAD_REQUEST', {
      fallbackAllowed: false,
      alertRequired: true,
    });
  }

  // 10. HTTP 408 or 504 -> TIMEOUT
  if (status === 408 || status === 504) {
    return finalize('TIMEOUT');
  }

  // 11. HTTP 500, 502, 503, or 529 -> SERVER_ERROR
  if (status === 500 || status === 502 || status === 503 || status === 529) {
    return finalize('SERVER_ERROR');
  }

  // 12. E4: Any unrecognized status is UNKNOWN and alerted. Never treated as success.
  return finalize('UNKNOWN', { alertRequired: true });
}

function hasRequiredProtocolFields(
  protocol: SupportedProtocol,
  body: Record<string, unknown>
): boolean {
  if (!body || typeof body !== 'object') return false;
  if (body.error) return false;

  if (protocol === 'openai_compatible') {
    if (
      typeof body.output_text === 'string' &&
      body.output_text.trim().length > 0
    ) {
      return true;
    }
    if (typeof body.reply === 'string' && body.reply.trim().length > 0) {
      return true;
    }
    if (typeof body.response === 'string' && body.response.trim().length > 0) {
      return true;
    }
    if (!Array.isArray(body.choices) || body.choices.length === 0) return false;
    const c0 = body.choices[0] as Record<string, unknown>;
    if (!c0 || typeof c0 !== 'object') return false;
    if (typeof c0.text === 'string' && c0.text.trim().length > 0) return true;
    const msg = c0.message as Record<string, unknown> | undefined;
    if (!msg || typeof msg !== 'object') return false;
    const hasContent =
      (typeof msg.content === 'string' && msg.content.trim().length > 0) ||
      (Array.isArray(msg.content) && msg.content.length > 0) ||
      (typeof msg.reasoning_content === 'string' &&
        msg.reasoning_content.trim().length > 0) ||
      (typeof msg.reasoning === 'string' && msg.reasoning.trim().length > 0) ||
      (Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0);
    return hasContent;
  }

  if (protocol === 'gemini_native') {
    if (!Array.isArray(body.candidates) || body.candidates.length === 0) {
      return false;
    }
    const cand0 = body.candidates[0] as Record<string, unknown>;
    const content = cand0?.content as { parts?: unknown[] } | undefined;
    if (Array.isArray(content?.parts) && content.parts.length > 0) {
      return true;
    }
    // Gemini 2.5 thinking models with low maxOutputTokens can return finishReason: MAX_TOKENS with thoughtsTokenCount > 0
    if (
      String(cand0?.finishReason || '').toUpperCase() === 'MAX_TOKENS' &&
      content &&
      typeof content === 'object'
    ) {
      return true;
    }
    return false;
  }

  if (protocol === 'anthropic_native') {
    if (!Array.isArray(body.content) || body.content.length === 0) return false;
    return true;
  }

  return false;
}
