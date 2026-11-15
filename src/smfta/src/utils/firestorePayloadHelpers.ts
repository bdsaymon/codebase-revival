import type { ChatMessage, ChatSession } from '../types';

export const FIRESTORE_TITLE_MAX_CHARS = 180;
export const FIRESTORE_MODEL_ID_MAX_CHARS = 64;
export const FIRESTORE_MESSAGE_TEXT_MAX_CHARS = 12_000;
export const FIRESTORE_MESSAGE_THINKING_MAX_CHARS = 4_000;
export const FIRESTORE_SESSION_MSG_MAX_CHARS = 28_000;
export const FIRESTORE_MEMORY_FACT_MAX_CHARS = 900;
export const FIRESTORE_MESSAGES_PAYLOAD_MAX_CHARS = 200_000;
export const FIRESTORE_MESSAGES_PAYLOAD_MAX_UTF8_BYTES = 220_000;

export function sanitizeFirestoreDocId(rawId: string | number): string {
  const cleaned = String(rawId || 'doc')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 120);
  return cleaned || 'doc_default';
}

export function utf8ByteLength(text: string): number {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(text).length;
  }
  return unescape(encodeURIComponent(text)).length;
}

/**
 * Truncates a string so both its UTF-16 character length and UTF-8 byte length
 * remain safely within Firestore security rule `.size()` bounds without splitting surrogate pairs.
 */
export function truncateUtf8Safe(
  input: string,
  maxChars: number,
  maxUtf8Bytes = maxChars
): string {
  let out = String(input || '').slice(0, maxChars);
  if (!out) return '';
  // Avoid trailing lone high surrogate
  const lastCode = out.charCodeAt(out.length - 1);
  if (lastCode >= 0xd800 && lastCode <= 0xdbff) {
    out = out.slice(0, -1);
  }
  while (out.length > 0 && utf8ByteLength(out) > maxUtf8Bytes) {
    const excessRatio = maxUtf8Bytes / Math.max(1, utf8ByteLength(out));
    const nextLen = Math.max(0, Math.min(out.length - 1, Math.floor(out.length * excessRatio)));
    out = out.slice(0, nextLen);
    if (out.length > 0) {
      const code = out.charCodeAt(out.length - 1);
      if (code >= 0xd800 && code <= 0xdbff) {
        out = out.slice(0, -1);
      }
    }
  }
  return out;
}

/**
 * Serializes conversation messages into valid JSON guaranteed to fit within
 * Firestore `messagesPayload` size bounds (`>= 2` and `<= 250_000`).
 * Never slices JSON mid-string.
 */
export function buildBoundedMessagesPayload(msgs: ChatMessage[]): {
  messagesPayload: string;
  messageCount: number;
} {
  const rawList = Array.isArray(msgs) ? msgs.slice(-80) : [];
  let compact = rawList.map((m) => ({
    id: String(m.id || ''),
    role: m.role,
    text: truncateUtf8Safe(
      String(m.text || ''),
      FIRESTORE_MESSAGE_TEXT_MAX_CHARS,
      FIRESTORE_MESSAGE_TEXT_MAX_CHARS
    ),
    ...(m.thinking
      ? {
          thinking: truncateUtf8Safe(
            String(m.thinking),
            FIRESTORE_MESSAGE_THINKING_MAX_CHARS,
            FIRESTORE_MESSAGE_THINKING_MAX_CHARS
          ),
        }
      : {}),
    ...(m.v2ModelId ? { v2ModelId: String(m.v2ModelId).slice(0, 64) } : {}),
    ts: typeof m.ts === 'number' && Number.isFinite(m.ts) ? m.ts : Date.now(),
  }));

  const fits = (candidate: typeof compact): string | null => {
    const json = JSON.stringify(candidate);
    if (
      json.length >= 2 &&
      json.length <= FIRESTORE_MESSAGES_PAYLOAD_MAX_CHARS &&
      utf8ByteLength(json) <= FIRESTORE_MESSAGES_PAYLOAD_MAX_UTF8_BYTES
    ) {
      return json;
    }
    return null;
  };

  let serialized = fits(compact);
  while (!serialized && compact.length > 1) {
    compact = compact.slice(1);
    serialized = fits(compact);
  }

  if (!serialized && compact.length === 1) {
    const newest = compact[0]!;
    compact = [
      {
        id: newest.id,
        role: newest.role,
        text: truncateUtf8Safe(newest.text, 40_000, 40_000),
        ...(newest.v2ModelId ? { v2ModelId: newest.v2ModelId } : {}),
        ts: newest.ts,
      },
    ];
    serialized = fits(compact);
  }

  if (!serialized) {
    compact = [];
    serialized = '[]';
  }

  return {
    messagesPayload: serialized,
    messageCount: compact.length,
  };
}

export function buildUserProfileCreatePayload<T>(
  params: { userId: string; displayName?: string | null },
  timestampValue: T
) {
  const userId = sanitizeFirestoreDocId(params.userId);
  const safeName =
    truncateUtf8Safe((params.displayName || 'SMFTA User').trim(), 80, 80) ||
    'SMFTA User';
  return {
    path: `users/${userId}`,
    userId,
    createData: {
      userId,
      displayName: safeName,
      testingBypass: false,
      testingAllowance: 0,
      createdAt: timestampValue,
      updatedAt: timestampValue,
    },
  };
}

export function buildConversationDocPayloads<T>(
  params: {
    userId: string;
    sessionId: string | number;
    title?: string;
    systemVersion: 'v1' | 'v2';
    modelId?: string;
    msgs: ChatMessage[];
  },
  timestampValue: T
) {
  const userId = sanitizeFirestoreDocId(params.userId);
  const conversationId = sanitizeFirestoreDocId(`conv_${params.sessionId}`);
  const safeTitle =
    truncateUtf8Safe(
      (params.title || 'Conversation').trim(),
      FIRESTORE_TITLE_MAX_CHARS,
      FIRESTORE_TITLE_MAX_CHARS
    ) || 'Conversation';
  const safeModelId =
    truncateUtf8Safe(
      (params.modelId || 'smfta-v5').trim(),
      FIRESTORE_MODEL_ID_MAX_CHARS,
      FIRESTORE_MODEL_ID_MAX_CHARS
    ) || 'smfta-v5';
  const safeVersion: 'v1' | 'v2' = params.systemVersion === 'v2' ? 'v2' : 'v1';
  const { messagesPayload, messageCount } = buildBoundedMessagesPayload(params.msgs);

  const updateData = {
    title: safeTitle,
    systemVersion: safeVersion,
    modelId: safeModelId,
    messagesPayload,
    messageCount,
    updatedAt: timestampValue,
  };

  return {
    path: `users/${userId}/conversations/${conversationId}`,
    userId,
    conversationId,
    createData: {
      userId,
      conversationId,
      ...updateData,
      createdAt: timestampValue,
    },
    updateData,
  };
}

export function buildSessionDocPayloads<T>(
  params: {
    userId: string;
    sessionId: string | number;
    title?: string;
    systemVersion: 'v1' | 'v2';
    modelId?: string;
  },
  timestampValue: T
) {
  const userId = sanitizeFirestoreDocId(params.userId);
  const cleanSessionId = sanitizeFirestoreDocId(`sess_${params.sessionId}`);
  const safeTitle =
    truncateUtf8Safe(
      (params.title || 'Conversation').trim(),
      FIRESTORE_TITLE_MAX_CHARS,
      FIRESTORE_TITLE_MAX_CHARS
    ) || 'Conversation';
  const safeModelId =
    truncateUtf8Safe(
      (params.modelId || 'smfta-v5').trim(),
      FIRESTORE_MODEL_ID_MAX_CHARS,
      FIRESTORE_MODEL_ID_MAX_CHARS
    ) || 'smfta-v5';
  const safeVersion: 'v1' | 'v2' = params.systemVersion === 'v2' ? 'v2' : 'v1';

  const updateData = {
    title: safeTitle,
    systemVersion: safeVersion,
    modelId: safeModelId,
    updatedAt: timestampValue,
  };

  return {
    path: `users/${userId}/sessions/${cleanSessionId}`,
    userId,
    sessionId: cleanSessionId,
    createData: {
      userId,
      sessionId: cleanSessionId,
      ...updateData,
      createdAt: timestampValue,
    },
    updateData,
  };
}

export function buildSessionMessageDocPayloads<T>(
  params: {
    userId: string;
    sessionId: string | number;
    messageId: string;
    role: 'user' | 'ai';
    text: string;
    modelId?: string;
  },
  timestampValue: T
) {
  const userId = sanitizeFirestoreDocId(params.userId);
  const cleanSessionId = sanitizeFirestoreDocId(`sess_${params.sessionId}`);
  const cleanMsgId = sanitizeFirestoreDocId(params.messageId);
  const cleanText = truncateUtf8Safe(
    String(params.text || '').trim(),
    FIRESTORE_SESSION_MSG_MAX_CHARS,
    FIRESTORE_SESSION_MSG_MAX_CHARS
  );
  const safeModelId =
    truncateUtf8Safe(
      (params.modelId || 'smfta-v5').trim(),
      FIRESTORE_MODEL_ID_MAX_CHARS,
      FIRESTORE_MODEL_ID_MAX_CHARS
    ) || 'smfta-v5';

  return {
    path: `users/${userId}/sessions/${cleanSessionId}/messages/${cleanMsgId}`,
    userId,
    sessionId: cleanSessionId,
    messageId: cleanMsgId,
    cleanText,
    createData: {
      userId,
      sessionId: cleanSessionId,
      messageId: cleanMsgId,
      role: (params.role === 'user' ? 'user' : 'ai') as 'user' | 'ai',
      text: cleanText,
      modelId: safeModelId,
      createdAt: timestampValue,
    },
    updateData: {
      text: cleanText,
      modelId: safeModelId,
    },
  };
}

export function buildMemoryDocPayloads<T>(
  params: {
    userId: string;
    memoryId: string;
    fact: string;
    topic?: string;
    sourceModel?: string;
  },
  timestampValue: T
) {
  const userId = sanitizeFirestoreDocId(params.userId);
  const memoryId = sanitizeFirestoreDocId(params.memoryId);
  const cleanFact = truncateUtf8Safe(
    String(params.fact || '').trim(),
    FIRESTORE_MEMORY_FACT_MAX_CHARS,
    FIRESTORE_MEMORY_FACT_MAX_CHARS
  );
  const safeTopic =
    truncateUtf8Safe((params.topic || 'general').trim(), 80, 80) || 'general';
  const safeModel =
    truncateUtf8Safe(
      (params.sourceModel || 'smfta-v5').trim(),
      FIRESTORE_MODEL_ID_MAX_CHARS,
      FIRESTORE_MODEL_ID_MAX_CHARS
    ) || 'smfta-v5';

  const updateData = {
    fact: cleanFact,
    topic: safeTopic,
    sourceModel: safeModel,
    updatedAt: timestampValue,
  };

  return {
    path: `users/${userId}/memories/${memoryId}`,
    userId,
    memoryId,
    cleanFact,
    createData: {
      userId,
      memoryId,
      ...updateData,
      createdAt: timestampValue,
    },
    updateData,
  };
}

export function buildFirestoreChatSyncSignature(
  session: Pick<ChatSession, 'title' | 'msgs'>
): string {
  const msgs = Array.isArray(session.msgs) ? session.msgs : [];
  const lastMsg = msgs[msgs.length - 1];
  return `${session.title}:${msgs.length}:${lastMsg?.id || ''}:${(lastMsg?.text || '').length}`;
}
