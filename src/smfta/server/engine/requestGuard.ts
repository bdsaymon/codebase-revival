/**
 * SMFTA Pro — Strict Request Guard (v18.9.0 hardening)
 *
 * The chat endpoint used to trust `req.body` after one loose `Array.isArray`
 * check: a client could send thousands of messages, megabyte-long strings,
 * unknown roles or non-string fields and the process would happily parse,
 * slice and forward them. This module is the single, fully unit-tested
 * admission gate BEFORE any SSE header is flushed or any provider is called.
 *
 * Pure functions only — no Express, no I/O.
 */

export interface ChatGuardLimits {
  maxMessages: number;
  maxMessageChars: number;
  maxTotalChars: number;
  maxRoleLength: number;
  maxImagesPerMessage: number;
  maxImageDataChars: number;
  maxImageMimeLength: number;
}

export const CHAT_GUARD_LIMITS: Readonly<ChatGuardLimits> = Object.freeze({
  maxMessages: 100,
  maxMessageChars: 60_000,
  maxTotalChars: 240_000,
  maxRoleLength: 24,
  maxImagesPerMessage: 8,
  maxImageDataChars: 5_000_000,
  maxImageMimeLength: 80,
});

/** Roles the engine understands. Anything else is rejected, not silently coerced. */
export const ALLOWED_MESSAGE_ROLES = Object.freeze([
  'user',
  'ai',
  'assistant',
  'system',
  'developer',
  'model',
]);

export interface GuardedImage {
  mime: string;
  data: string;
}

export interface GuardedMessage {
  role: string;
  text: string;
  imgs: GuardedImage[];
}

export type ChatGuardErrorCode = 'BAD_REQUEST' | 'PAYLOAD_TOO_LARGE';

export interface ChatGuardResult {
  ok: boolean;
  statusCode?: 422 | 413;
  errorCode?: ChatGuardErrorCode;
  error?: string;
  messages?: GuardedMessage[];
  totalChars?: number;
}

function reject(
  statusCode: 422 | 413,
  errorCode: ChatGuardErrorCode,
  error: string
): ChatGuardResult {
  return { ok: false, statusCode, errorCode, error };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Validates and normalizes the `/api/chat/stream` request body.
 * On success returns a sanitized message list containing only the known
 * fields (`role`, `text`, `imgs`) — every extra client field is dropped.
 */
export function sanitizeChatBody(
  rawBody: unknown,
  limits: ChatGuardLimits = CHAT_GUARD_LIMITS
): ChatGuardResult {
  if (!isRecord(rawBody)) {
    return reject(
      422,
      'BAD_REQUEST',
      'Request body must be a JSON object.'
    );
  }

  const rawMessages = rawBody.messages;
  if (!Array.isArray(rawMessages)) {
    return reject(
      422,
      'BAD_REQUEST',
      'Request body must include a valid messages array.'
    );
  }

  if (rawMessages.length === 0) {
    return reject(
      422,
      'BAD_REQUEST',
      'messages array must contain at least one valid message.'
    );
  }

  if (rawMessages.length > limits.maxMessages) {
    return reject(
      413,
      'PAYLOAD_TOO_LARGE',
      `Too many messages: ${rawMessages.length} > ${limits.maxMessages}.`
    );
  }

  const messages: GuardedMessage[] = [];
  let totalChars = 0;

  for (let index = 0; index < rawMessages.length; index += 1) {
    const entry = rawMessages[index];
    if (!isRecord(entry)) {
      return reject(
        422,
        'BAD_REQUEST',
        `messages[${index}] must be an object.`
      );
    }

    const rawRole = entry.role;
    if (typeof rawRole !== 'string' || !rawRole.trim()) {
      return reject(
        422,
        'BAD_REQUEST',
        `messages[${index}].role must be a non-empty string.`
      );
    }
    const role = rawRole.trim();
    if (role.length > limits.maxRoleLength) {
      return reject(
        422,
        'BAD_REQUEST',
        `messages[${index}].role is longer than ${limits.maxRoleLength} characters.`
      );
    }
    if (!ALLOWED_MESSAGE_ROLES.includes(role)) {
      return reject(
        422,
        'BAD_REQUEST',
        `messages[${index}].role "${role}" is not allowed. Allowed roles: ${ALLOWED_MESSAGE_ROLES.join(', ')}.`
      );
    }

    const rawText = entry.text ?? entry.content;
    const text = typeof rawText === 'string' ? rawText : '';
    if (typeof rawText !== 'string' && rawText !== undefined) {
      return reject(
        422,
        'BAD_REQUEST',
        `messages[${index}].text must be a string.`
      );
    }
    if (text.length > limits.maxMessageChars) {
      return reject(
        413,
        'PAYLOAD_TOO_LARGE',
        `messages[${index}].text exceeds ${limits.maxMessageChars} characters.`
      );
    }
    totalChars += text.length;
    if (totalChars > limits.maxTotalChars) {
      return reject(
        413,
        'PAYLOAD_TOO_LARGE',
        `Total message text exceeds ${limits.maxTotalChars} characters.`
      );
    }

    const imgs: GuardedImage[] = [];
    if (entry.imgs !== undefined) {
      if (!Array.isArray(entry.imgs)) {
        return reject(
          422,
          'BAD_REQUEST',
          `messages[${index}].imgs must be an array.`
        );
      }
      if (entry.imgs.length > limits.maxImagesPerMessage) {
        return reject(
          413,
          'PAYLOAD_TOO_LARGE',
          `messages[${index}].imgs exceeds ${limits.maxImagesPerMessage} images.`
        );
      }
      for (let imgIndex = 0; imgIndex < entry.imgs.length; imgIndex += 1) {
        const img = entry.imgs[imgIndex];
        if (!isRecord(img)) {
          return reject(
            422,
            'BAD_REQUEST',
            `messages[${index}].imgs[${imgIndex}] must be an object.`
          );
        }
        if (typeof img.mime !== 'string' || typeof img.data !== 'string') {
          return reject(
            422,
            'BAD_REQUEST',
            `messages[${index}].imgs[${imgIndex}] needs string mime and data.`
          );
        }
        if (img.mime.length > limits.maxImageMimeLength) {
          return reject(
            422,
            'BAD_REQUEST',
            `messages[${index}].imgs[${imgIndex}].mime is too long.`
          );
        }
        if (img.data.length > limits.maxImageDataChars) {
          return reject(
            413,
            'PAYLOAD_TOO_LARGE',
            `messages[${index}].imgs[${imgIndex}] data exceeds the image size limit.`
          );
        }
        imgs.push({ mime: img.mime, data: img.data });
      }
    }

    if (!text.trim() && imgs.length === 0) {
      return reject(
        422,
        'BAD_REQUEST',
        `messages[${index}] must contain text or at least one image.`
      );
    }

    messages.push({ role, text, imgs });
  }

  return { ok: true, messages, totalChars };
}
