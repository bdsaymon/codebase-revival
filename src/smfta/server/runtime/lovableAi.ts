/**
 * Built-in engine path for the keyless SMFTA models, served through the
 * Lovable AI Gateway (no user key). The old free third-party endpoint stays
 * as the fallback when this path is unavailable.
 */

import {
  continuationDirective,
  mergeContinuationText,
  createIdleWatchdog,
} from '../../src/utils/streamGuard';

const GATEWAY_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions';
const LOVABLE_IDLE_TIMEOUT_MS = 22_000;

const MODEL_MAP: Record<string, string> = {
  'smfta-flash': 'google/gemini-3.1-flash-lite',
  'smfta-pro': 'google/gemini-3.8-flash',
  'smfta-ultra': 'google/gemini-3.8-flash',
};
const DEFAULT_MODEL = 'google/gemini-3.8-flash';

export function resolveBuiltinGatewayModel(requested?: string | null): string {
  const key = String(requested || '').trim().toLowerCase();
  return MODEL_MAP[key] || DEFAULT_MODEL;
}

export function isLovableAiAvailable(): boolean {
  return Boolean((process.env.LOVABLE_API_KEY || '').trim());
}

function toGatewayRole(role: string): 'user' | 'assistant' {
  return role === 'assistant' || role === 'model' || role === 'ai' ? 'assistant' : 'user';
}

type GatewayMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string | Array<
    { type: 'text'; text: string } |
    { type: 'image_url'; image_url: { url: string } }
  >;
};

export interface LovableStreamParams {
  systemInstruction: string;
  history: Array<{ role: string; content: string; imgs?: Array<{ mime: string; data: string }> }>;
  requestedModel?: string | null;
  model?: string | null;
  signal?: AbortSignal;
  emitDelta: (delta: string) => void;
  emitThinking?: (thinking: string) => void;
  maxTokens?: number;
  temperature?: number;
  thinkingEffort?: 'off' | 'low' | 'medium' | 'high';
  endpointUrl?: string;
  fetchImpl?: typeof fetch;
}

async function runSingleLovablePass(params: {
  url: string;
  apiKey: string;
  model: string;
  messages: GatewayMessage[];
  signal: AbortSignal;
  maxTokens?: number;
  temperature?: number;
  thinkingEffort?: 'off' | 'low' | 'medium' | 'high';
  onChunkText: (chunk: string) => void;
  onThinking?: (thinking: string) => void;
  fetchImpl?: typeof fetch;
}): Promise<{
  ok: boolean;
  status?: number;
  truncated: boolean;
  droppedMidStream: boolean;
  receivedAnswerText: string;
  errorBody?: string;
}> {
  const passCtrl = new AbortController();
  const onParentAbort = () => passCtrl.abort(params.signal.reason);
  if (params.signal.aborted) {
    return { ok: false, truncated: false, droppedMidStream: false, receivedAnswerText: '' };
  }
  params.signal.addEventListener('abort', onParentAbort, { once: true });

  let idleTimedOut = false;
  const watchdog = createIdleWatchdog(() => {
    idleTimedOut = true;
    passCtrl.abort(new Error('LovableIdleTimeout'));
  }, LOVABLE_IDLE_TIMEOUT_MS);

  let receivedAnswerText = '';
  let isTruncated = false;
  let sawDoneMarker = false;

  try {
    watchdog.arm();
    const fetcher = params.fetchImpl || fetch;
    const res = await fetcher(params.url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: params.model,
        messages: params.messages,
        stream: true,
        ...(params.maxTokens ? { max_tokens: Math.min(params.maxTokens, 32768) } : {}),
        ...(typeof params.temperature === 'number' ? { temperature: params.temperature } : {}),
        ...(params.thinkingEffort && params.thinkingEffort !== 'off'
          ? { reasoning_effort: params.thinkingEffort }
          : {}),
      }),
      signal: passCtrl.signal,
    });

    if (!res.ok || !res.body) {
      const errorBody = await res.text().catch(() => '');
      return {
        ok: false,
        status: res.status,
        truncated: false,
        droppedMidStream: false,
        receivedAnswerText: '',
        errorBody,
      };
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let finished = false;

    while (!finished) {
      const { done, value } = await reader.read();
      if (done) break;
      watchdog.arm();
      buffer += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf('\n')) !== -1) {
        let line = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 1);
        if (line.endsWith('\r')) line = line.slice(0, -1);
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') {
          sawDoneMarker = true;
          finished = true;
          break;
        }
        try {
          const parsed = JSON.parse(data) as {
            choices?: Array<{
              finish_reason?: string | null;
              delta?: {
                content?: string;
                reasoning_content?: string;
                reasoning?: string;
                thinking?: string;
              };
            }>;
          };
          const choice0 = parsed.choices?.[0];
          const fr = String(choice0?.finish_reason || '').toLowerCase();
          if (fr === 'length' || fr === 'max_tokens') {
            isTruncated = true;
          }
          const deltaObj = choice0?.delta;
          const reasoning =
            deltaObj?.reasoning_content || deltaObj?.reasoning || deltaObj?.thinking;
          if (reasoning && params.onThinking) {
            params.onThinking(reasoning);
          }
          const delta = deltaObj?.content;
          if (delta) {
            receivedAnswerText += delta;
            params.onChunkText(delta);
          }
        } catch {
          // partial JSON split across chunks: put it back and wait for more
          buffer = line + '\n' + buffer;
          break;
        }
      }
    }

    const droppedMidStream =
      !params.signal.aborted &&
      !sawDoneMarker &&
      !isTruncated &&
      (idleTimedOut || receivedAnswerText.length > 0);

    return {
      ok: receivedAnswerText.length > 0,
      status: res.status,
      truncated: isTruncated,
      droppedMidStream,
      receivedAnswerText,
    };
  } catch (err) {
    const droppedMidStream =
      !params.signal.aborted &&
      (idleTimedOut || receivedAnswerText.length > 0);
    return {
      ok: receivedAnswerText.length > 0,
      truncated: isTruncated,
      droppedMidStream,
      receivedAnswerText,
      errorBody: err instanceof Error ? err.message : String(err),
    };
  } finally {
    watchdog.disarm();
    params.signal.removeEventListener('abort', onParentAbort);
  }
}

export async function streamFromLovableAi(
  params: LovableStreamParams
): Promise<{
  ok: boolean;
  model: string;
  status?: number;
  truncated?: boolean;
  resumedAfterDrop?: boolean;
  fallbackNotice?: string;
}> {
  const apiKey = (process.env.LOVABLE_API_KEY || '').trim();
  const requestedOrDirect = params.requestedModel || params.model;
  const primaryModel =
    requestedOrDirect && requestedOrDirect.includes('/')
      ? requestedOrDirect.trim()
      : resolveBuiltinGatewayModel(requestedOrDirect);
  if (!apiKey) return { ok: false, model: primaryModel };

  const parentSignal = params.signal || new AbortController().signal;
  const gatewayUrl = params.endpointUrl || GATEWAY_URL;
  const baseMessages: GatewayMessage[] = [
    ...(params.systemInstruction
      ? [{ role: 'system' as const, content: params.systemInstruction }]
      : []),
    ...params.history.flatMap((m): GatewayMessage[] => {
      const role = toGatewayRole(m.role);
      const images = role === 'user' ? m.imgs?.filter((image) => image.data) : undefined;
      if (images?.length) {
        return [{ role, content: [
          { type: 'text', text: m.content.trim() || 'Analyze the attached image.' },
          ...images.map((image) => ({
            type: 'image_url' as const,
            image_url: { url: image.data.startsWith('data:')
              ? image.data : `data:${image.mime};base64,${image.data}` },
          })),
        ] }];
      }
      return m.content.trim() ? [{ role, content: m.content }] : [];
    }),
  ];

  let activeModel = primaryModel;
  let fallbackNotice: string | undefined;
  let totalEmittedText = '';
  let resumedAfterDrop = false;

  const firstPass = await runSingleLovablePass({
    url: gatewayUrl,
    apiKey,
    model: activeModel,
    messages: baseMessages,
    signal: parentSignal,
    maxTokens: params.maxTokens,
    temperature: params.temperature,
    thinkingEffort: params.thinkingEffort,
    fetchImpl: params.fetchImpl,
    onChunkText: (chunk) => {
      totalEmittedText += chunk;
      params.emitDelta(chunk);
    },
    onThinking: params.emitThinking,
  });

  // If gateway rejects google/gemini-3.1-flash-lite, fall back to google/gemini-3.8-flash per Section 1A
  if (
    !firstPass.ok &&
    !totalEmittedText &&
    activeModel === 'google/gemini-3.1-flash-lite' &&
    !parentSignal.aborted &&
    (firstPass.status === 400 ||
      firstPass.status === 404 ||
      firstPass.status === 422 ||
      /not found|unsupported|invalid model|unknown model/i.test(firstPass.errorBody || ''))
  ) {
    activeModel = DEFAULT_MODEL;
    fallbackNotice = `Switched from google/gemini-3.1-flash-lite to ${DEFAULT_MODEL}`;
    const secondTry = await runSingleLovablePass({
      url: gatewayUrl,
      apiKey,
      model: activeModel,
      messages: baseMessages,
      signal: parentSignal,
      maxTokens: params.maxTokens,
      temperature: params.temperature,
      thinkingEffort: params.thinkingEffort,
      fetchImpl: params.fetchImpl,
      onChunkText: (chunk) => {
        totalEmittedText += chunk;
        params.emitDelta(chunk);
      },
      onThinking: params.emitThinking,
    });
    if (!secondTry.ok) {
      return {
        ok: false,
        model: activeModel,
        status: secondTry.status,
        truncated: secondTry.truncated,
        fallbackNotice,
      };
    }
    firstPass.ok = secondTry.ok;
    firstPass.status = secondTry.status;
    firstPass.truncated = secondTry.truncated;
    firstPass.droppedMidStream = secondTry.droppedMidStream;
  }

  let finalTruncated = firstPass.truncated;

  // If stream dropped mid-answer after emitting partial text, resume once from tail without duplicating
  if (
    totalEmittedText.length > 0 &&
    firstPass.droppedMidStream &&
    !parentSignal.aborted
  ) {
    resumedAfterDrop = true;
    const baseText = totalEmittedText;
    let resumeRawBuffer = '';
    const resumePass = await runSingleLovablePass({
      url: gatewayUrl,
      apiKey,
      model: activeModel,
      messages: [
        ...baseMessages,
        { role: 'assistant', content: baseText.slice(-3000) },
        { role: 'user', content: continuationDirective(baseText) },
      ],
      signal: parentSignal,
      maxTokens: params.maxTokens,
      temperature: params.temperature,
      thinkingEffort: params.thinkingEffort,
      fetchImpl: params.fetchImpl,
      onChunkText: (chunk) => {
        resumeRawBuffer += chunk;
        const merged = mergeContinuationText(totalEmittedText, resumeRawBuffer);
        if (merged.deltaToAppend) {
          totalEmittedText += merged.deltaToAppend;
          params.emitDelta(merged.deltaToAppend);
          resumeRawBuffer = '';
        }
      },
      onThinking: params.emitThinking,
    });
    if (resumeRawBuffer) {
      const merged = mergeContinuationText(totalEmittedText, resumeRawBuffer);
      if (merged.deltaToAppend) {
        totalEmittedText += merged.deltaToAppend;
        params.emitDelta(merged.deltaToAppend);
      }
    }
    finalTruncated = resumePass.truncated;
  }

  return {
    ok: totalEmittedText.length > 0,
    model: activeModel,
    status: firstPass.status,
    truncated: finalTruncated,
    resumedAfterDrop,
    fallbackNotice,
  };
}

