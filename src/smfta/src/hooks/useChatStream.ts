import { useCallback, useRef } from 'react';
import {
  classifyChatError,
  parseSseChunkBuffer,
  type ChatErrorCategory,
  type ParsedSseEvent,
} from '../services/chatStreamParser';

export interface SseStreamCallbacks {
  onEvent: (evt: ParsedSseEvent) => void;
  onError?: (info: { category: ChatErrorCategory; message: string; retryable: boolean }) => void;
}

export function useChatStreamController() {
  const abortRef = useRef<AbortController | null>(null);

  const stopStream = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  }, []);

  const streamEndpoint = useCallback(
    async (
      url: string,
      init: Omit<RequestInit, 'signal'>,
      callbacks: SseStreamCallbacks
    ): Promise<{ ok: boolean; aborted: boolean }> => {
      stopStream();
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      try {
        const res = await fetch(url, { ...init, signal: ctrl.signal });
        if (!res.ok) {
          const errJson = await res.json().catch(() => null);
          const msg =
            errJson?.error?.message ||
            errJson?.error ||
            errJson?.message ||
            `HTTP ${res.status}`;
          const errObj = Object.assign(new Error(msg), {
            code: errJson?.code || errJson?.errorCode,
            integrationRequired: Boolean(errJson?.integrationRequired),
          });
          throw errObj;
        }
        if (!res.body) {
          throw Object.assign(new Error('Empty response stream'), { code: 'EMPTY_RESPONSE' });
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunkStr = decoder.decode(value, { stream: true });
          const { events, remainingBuffer } = parseSseChunkBuffer(buffer, chunkStr);
          buffer = remainingBuffer;
          for (const evt of events) {
            if (evt.type === 'error' || evt.ok === false || evt.error) {
              throw Object.assign(
                new Error(evt.message || evt.error || evt.text || 'Stream error'),
                {
                  code: evt.code,
                  integrationRequired: Boolean(evt.integrationRequired),
                }
              );
            }
            callbacks.onEvent(evt);
          }
        }
        return { ok: true, aborted: false };
      } catch (err: unknown) {
        const classified = classifyChatError(err);
        if (classified.category === 'ABORTED') {
          return { ok: false, aborted: true };
        }
        callbacks.onError?.(classified);
        return { ok: false, aborted: false };
      } finally {
        if (abortRef.current === ctrl) {
          abortRef.current = null;
        }
      }
    },
    [stopStream]
  );

  return { abortRef, stopStream, streamEndpoint };
}
