import { GoogleGenAI, ThinkingLevel, type GenerateContentResponse } from '@google/genai';
import { resolveServerEnvGeminiKey } from '../keyResolver';

export type GeminiTextModelId =
  | 'gemini-4-hydrogen'
  | 'gemini-4-neon'
  | 'gemini-4-carbon'
  | 'gemini-3.1-flash-lite';

export interface GeminiModelCatalogEntry {
  id: GeminiTextModelId;
  label: string;
  tier: 'free' | 'paid';
  description: string;
  supportsTemperature: boolean;
  defaultThinkingLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  contextWindow: number;
  maxOutputTokens: number;
}

export const GEMINI_TEXT_MODELS: GeminiModelCatalogEntry[] = [
  {
    id: 'gemini-4-hydrogen',
    label: 'Gemini 4 Hydrogen',
    tier: 'free',
    description: 'Fast general intelligence, reasoning, UI & code artifacts',
    supportsTemperature: false,
    defaultThinkingLevel: 'MEDIUM',
    contextWindow: 1_000_000,
    maxOutputTokens: 32_768,
  },
  {
    id: 'gemini-3.1-flash-lite',
    label: 'Gemini 3.1 Flash Lite',
    tier: 'free',
    description: 'Ultra-fast lightweight model for quick tasks & summaries',
    supportsTemperature: true,
    defaultThinkingLevel: 'LOW',
    contextWindow: 256_000,
    maxOutputTokens: 16_384,
  },
  {
    id: 'gemini-4-neon',
    label: 'Gemini 4 Neon',
    tier: 'paid',
    description: 'Balanced high-precision model for complex engineering (requires paid key)',
    supportsTemperature: false,
    defaultThinkingLevel: 'MEDIUM',
    contextWindow: 1_000_000,
    maxOutputTokens: 32_768,
  },
  {
    id: 'gemini-4-carbon',
    label: 'Gemini 4 Carbon',
    tier: 'paid',
    description: 'Deep reasoning & architectural planning model (requires paid key)',
    supportsTemperature: false,
    defaultThinkingLevel: 'HIGH',
    contextWindow: 1_000_000,
    maxOutputTokens: 32_768,
  },
];

export const GEMINI_IMAGE_MODELS = [
  'gemini-3.1-flash-lite-image',
  'gemini-nano-banana-2.1',
] as const;

export function getServerGeminiApiKey(): string {
  return resolveServerEnvGeminiKey();
}

export function isGeminiConfigured(): boolean {
  return getServerGeminiApiKey().length > 0;
}

export function createGeminiClient(apiKeyOverride?: string): GoogleGenAI | null {
  const apiKey = (apiKeyOverride || getServerGeminiApiKey()).trim();
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export function isGemini4Family(modelId: string): boolean {
  return /gemini-4/i.test(String(modelId || ''));
}

// Short-lived upstream health cooldown so 503/stalled models fall back fast without blocking repeat turns
const MODEL_HEALTH_COOLDOWN_MS = 60_000;
const modelCooldownUntil = new Map<string, number>();

function isModelInCooldown(modelId: string): boolean {
  const until = modelCooldownUntil.get(modelId);
  if (!until) return false;
  if (Date.now() >= until) {
    modelCooldownUntil.delete(modelId);
    return false;
  }
  return true;
}

function markModelUnhealthy(modelId: string): void {
  modelCooldownUntil.set(modelId, Date.now() + MODEL_HEALTH_COOLDOWN_MS);
}

function markModelHealthy(modelId: string): void {
  modelCooldownUntil.delete(modelId);
}

export function normalizeActiveGeminiModel(requestedModel?: string): GeminiTextModelId | string {
  const raw = String(requestedModel || '').trim();
  const bare = raw.includes('/') ? raw.split('/').pop() || raw : raw;
  const lower = bare.toLowerCase();

  if (!lower) return 'gemini-3-flash-preview';

  // Map retired 1.5 / 2.0 aliases, unavailable 3.8-flash, and logical SMFTA tiers
  if (
    lower === 'gemini-2.0-flash' ||
    lower === 'gemini-1.5-flash' ||
    lower === 'gemini-1.5-pro' ||
    lower === 'gemini-pro' ||
    lower === 'gemini-3.8-flash'
  ) {
    return 'gemini-3-flash-preview';
  }
  if (
    lower === 'smfta-pro' ||
    lower === 'smfta-ultra' ||
    lower === 'smfta-v2-pro' ||
    lower === 'smfta-max'
  ) {
    return 'gemini-3-flash-preview';
  }
  if (lower === 'smfta-v5') {
    return 'gemini-3.5-flash-lite';
  }
  if (lower === 'gemini-2.5-flash-lite' || lower === 'smfta-flash') {
    return 'gemini-3.1-flash-lite';
  }

  return bare;
}

export function buildGeminiModelFallbackChain(requestedModel?: string): string[] {
  const raw = String(requestedModel || '').trim();
  const bare = raw.includes('/') ? raw.split('/').pop() || raw : raw;
  const lower = bare.toLowerCase();
  const primary = normalizeActiveGeminiModel(bare);

  let ordered: string[];
  if (
    lower === 'smfta-flash' ||
    lower === 'smfta-v5' ||
    primary === 'gemini-3.1-flash-lite' ||
    primary === 'gemini-3.5-flash-lite' ||
    primary === 'gemini-flash-lite-latest'
  ) {
    ordered = [
      primary,
      'gemini-3.1-flash-lite',
      'gemini-3.5-flash-lite',
      'gemini-3-flash-preview',
      'gemini-flash-lite-latest',
    ];
  } else if (
    lower === 'gemini-4-neon' ||
    lower === 'gemini-4-carbon' ||
    lower === 'smfta-ultra'
  ) {
    ordered = [
      primary,
      'gemini-3-flash-preview',
      'gemini-3.1-flash-lite',
      'gemini-3.5-flash-lite',
      'gemini-4-hydrogen',
    ];
  } else {
    ordered = [
      primary,
      'gemini-3-flash-preview',
      'gemini-3.1-flash-lite',
      'gemini-3.5-flash-lite',
      'gemini-flash-lite-latest',
    ];
  }

  const deduped = Array.from(new Set(ordered.filter(Boolean)));
  const healthy = deduped.filter((m) => !isModelInCooldown(m));
  const cooled = deduped.filter((m) => isModelInCooldown(m));
  return [...healthy, ...cooled];
}

export function resolveSafeThinkingLevel(
  modelId: string,
  thinkingMode?: 'off' | 'low' | 'medium' | 'high' | 'auto'
): ThinkingLevel | undefined {
  if (thinkingMode === 'off') return undefined;
  if (thinkingMode === 'low') return ThinkingLevel.LOW;
  if (thinkingMode === 'high') return ThinkingLevel.HIGH;
  if (thinkingMode === 'medium') return ThinkingLevel.MEDIUM ?? ThinkingLevel.LOW;
  // Auto default: MEDIUM for gemini-4 (avoids runaway latency), LOW for flash/preview
  return isGemini4Family(modelId)
    ? ThinkingLevel.MEDIUM ?? ThinkingLevel.LOW
    : ThinkingLevel.LOW;
}

export function buildGeminiRequestConfig(params: {
  modelId: string;
  systemInstruction?: string;
  maxOutputTokens?: number;
  temperature?: number;
  topP?: number;
  thinkingEnabled?: boolean;
  thinkingMode?: 'off' | 'low' | 'medium' | 'high' | 'auto';
  useSearchGrounding?: boolean;
  responseMimeType?: string;
  responseSchema?: Record<string, unknown>;
  abortSignal?: AbortSignal;
}): Record<string, unknown> {
  const modelLower = params.modelId.toLowerCase();
  const isG4 = isGemini4Family(modelLower);

  const cfg: Record<string, unknown> = {
    maxOutputTokens: Math.min(
      32_768,
      Math.max(256, Math.round(params.maxOutputTokens || 16_384))
    ),
  };

  if (params.systemInstruction?.trim()) {
    cfg.systemInstruction = params.systemInstruction.trim();
  }

  // Gemini 4 models strictly reject temperature, topP, topK, candidateCount, and thinkingBudget
  if (!isG4) {
    if (typeof params.temperature === 'number' && Number.isFinite(params.temperature)) {
      cfg.temperature = Math.min(2, Math.max(0, params.temperature));
    }
    if (typeof params.topP === 'number' && Number.isFinite(params.topP)) {
      cfg.topP = Math.min(1, Math.max(0.05, params.topP));
    }
  }

  const wantsThinking =
    params.thinkingEnabled !== false && params.thinkingMode !== 'off';

  if (wantsThinking) {
    const level = resolveSafeThinkingLevel(modelLower, params.thinkingMode);
    if (isG4 || /gemini-3/i.test(modelLower)) {
      cfg.thinkingConfig = {
        includeThoughts: true,
        ...(level ? { thinkingLevel: level } : {}),
      };
    } else if (/gemini-2\.5/i.test(modelLower)) {
      const budget =
        params.thinkingMode === 'low'
          ? 2048
          : params.thinkingMode === 'high'
          ? 12288
          : 4096;
      cfg.thinkingConfig = {
        includeThoughts: true,
        thinkingBudget: budget,
      };
    }
  } else if (isG4) {
    // Gemini 4 cannot fully disable thinking via MINIMAL; keep LOW with hidden thoughts
    cfg.thinkingConfig = {
      includeThoughts: false,
      thinkingLevel: ThinkingLevel.LOW,
    };
  }

  if (params.useSearchGrounding) {
    cfg.tools = [{ googleSearch: {} }];
  }
  if (params.responseMimeType) {
    cfg.responseMimeType = params.responseMimeType;
  }
  if (params.responseSchema) {
    cfg.responseSchema = params.responseSchema;
  }
  if (params.abortSignal) {
    cfg.abortSignal = params.abortSignal;
  }

  return cfg;
}

export interface GeminiHistoryTurn {
  role: string;
  content: string;
  imgs?: Array<{ mime: string; data: string }>;
}

export function toGeminiContents(history: GeminiHistoryTurn[]): Array<{
  role: 'user' | 'model';
  parts: Array<Record<string, unknown>>;
}> {
  const contents: Array<{
    role: 'user' | 'model';
    parts: Array<Record<string, unknown>>;
  }> = [];

  for (const m of history) {
    const role: 'user' | 'model' = m.role === 'user' ? 'user' : 'model';
    const parts: Array<Record<string, unknown>> = [];
    const txt = String(m.content || '').trim();
    if (txt) {
      parts.push({ text: txt });
    }
    if (Array.isArray(m.imgs)) {
      for (const im of m.imgs) {
        if (!im?.data) continue;
        const rawB64 = im.data.includes(',') ? im.data.split(',')[1] || '' : im.data;
        if (rawB64) {
          parts.push({
            inlineData: {
              mimeType: im.mime || 'image/jpeg',
              data: rawB64,
            },
          });
        }
      }
    }
    if (parts.length === 0) continue;
    const prev = contents[contents.length - 1];
    if (prev && prev.role === role) {
      prev.parts.push(...parts);
    } else {
      contents.push({ role, parts });
    }
  }

  return contents;
}

export interface ClassifiedGeminiError {
  code:
    | 'INTEGRATION_REQUIRED'
    | 'RATE_LIMITED'
    | 'NETWORK_ERROR'
    | 'EMPTY_RESPONSE'
    | 'AUTH_INVALID'
    | 'BAD_REQUEST'
    | 'ABORTED'
    | 'SERVER_ERROR';
  httpStatus: number;
  retryable: boolean;
  message: string;
}

export function unwrapGeminiErrorMessage(err: unknown): {
  cleanText: string;
  httpStatus: number;
} {
  const raw = err instanceof Error ? err.message : String(err || 'Unknown Gemini error');
  let httpStatus = Number(
    (err as { status?: number; httpStatus?: number; code?: number })?.status ||
      (err as { status?: number; httpStatus?: number; code?: number })?.httpStatus ||
      0
  );

  let current = raw.trim();
  for (let depth = 0; depth < 4; depth += 1) {
    if (!current.startsWith('{') && !current.startsWith('[')) break;
    try {
      const parsed = JSON.parse(current) as Record<string, unknown>;
      const nested =
        parsed && typeof parsed.error === 'object' && parsed.error !== null
          ? (parsed.error as Record<string, unknown>)
          : parsed;
      const code = Number(nested?.code || nested?.statusCode || 0);
      if (code >= 100 && !httpStatus) httpStatus = code;
      if (typeof nested?.message === 'string' && nested.message.trim()) {
        current = nested.message.trim();
        continue;
      }
      if (typeof parsed?.message === 'string' && parsed.message.trim()) {
        current = parsed.message.trim();
        continue;
      }
      break;
    } catch {
      break;
    }
  }

  const inlineCodeMatch = raw.match(/"code"\s*:\s*(\d{3})/) || raw.match(/\b(400|401|403|404|429|500|502|503|504)\b/);
  if (!httpStatus && inlineCodeMatch) {
    httpStatus = Number(inlineCodeMatch[1]);
  }
  const inlineMsgMatch = current.match(/"message"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)/);
  if (
    (current.startsWith('{') || current.includes('{\\n') || current.includes('"error":')) &&
    inlineMsgMatch?.[1]
  ) {
    current = inlineMsgMatch[1].replace(/\\n/g, ' ').replace(/\\"/g, '"').trim();
  }

  const cleanText = current.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
  return { cleanText, httpStatus };
}

export function classifyGeminiError(err: unknown): ClassifiedGeminiError {
  if (
    err instanceof Error &&
    (err.name === 'AbortError' || /\babort(?:ed)?\b|\bcancel(?:led)?\b/i.test(err.message))
  ) {
    return {
      code: 'ABORTED',
      httpStatus: 499,
      retryable: false,
      message: 'Generation stopped.',
    };
  }

  const raw = err instanceof Error ? err.message : String(err || 'Unknown Gemini error');
  const { cleanText, httpStatus: status } = unwrapGeminiErrorMessage(err);
  const haystack = `${raw} ${cleanText}`;

  if (status === 429 || /rate limit|quota|resource_exhausted|too many requests/i.test(haystack)) {
    return {
      code: 'RATE_LIMITED',
      httpStatus: 429,
      retryable: true,
      message:
        'Rate limit reached on Gemini API (HTTP 429). Please wait a moment and try again.',
    };
  }
  if (status === 401 || status === 403 || /api key|permission_denied|unauthenticated/i.test(haystack)) {
    return {
      code: 'INTEGRATION_REQUIRED',
      httpStatus: status || 403,
      retryable: false,
      message: `Integration required: Valid Gemini API access is needed (${cleanText.slice(0, 140)}).`,
    };
  }
  if (status === 400 || /invalid_argument/i.test(haystack)) {
    return {
      code: 'BAD_REQUEST',
      httpStatus: 400,
      retryable: false,
      message: `Gemini API rejected request parameters: ${cleanText.slice(0, 180)}`,
    };
  }
  if (/fetch failed|econn|enotfound|etimedout|network|socket|timed out|stalled/i.test(haystack)) {
    return {
      code: 'NETWORK_ERROR',
      httpStatus: 504,
      retryable: true,
      message: 'Connection to Gemini AI timed out. Please try again.',
    };
  }
  if (status === 503 || /unavailable|high demand|overloaded/i.test(haystack)) {
    return {
      code: 'SERVER_ERROR',
      httpStatus: 503,
      retryable: true,
      message: 'AI server is temporarily busy (HTTP 503). Please try again in a few seconds.',
    };
  }

  return {
    code: 'SERVER_ERROR',
    httpStatus: status || 502,
    retryable: status >= 500 || status === 404 || status === 0,
    message: (cleanText || 'Temporary AI service error. Please retry.').slice(0, 220),
  };
}

export interface StreamGeminiChatResult {
  ok: boolean;
  modelUsed: string;
  text: string;
  thinking: string;
  truncated: boolean;
  sources: Array<{ title: string; uri: string }>;
  error?: ClassifiedGeminiError;
}

const STREAM_FIRST_ANSWER_FAST_MS = 7_500;
const STREAM_FIRST_ANSWER_FINAL_MS = 28_000;
const STREAM_CHUNK_IDLE_MS = 18_000;

export async function streamGeminiChat(params: {
  model?: string;
  systemInstruction?: string;
  history: GeminiHistoryTurn[];
  maxOutputTokens?: number;
  temperature?: number;
  topP?: number;
  thinkingEnabled?: boolean;
  thinkingMode?: 'off' | 'low' | 'medium' | 'high' | 'auto';
  useSearchGrounding?: boolean;
  signal: AbortSignal;
  onThinking?: (chunk: string) => void;
  onDelta: (chunk: string) => void;
  apiKeyOverride?: string;
}): Promise<StreamGeminiChatResult> {
  const ai = createGeminiClient(params.apiKeyOverride);
  const candidates = buildGeminiModelFallbackChain(params.model);
  const primaryModel = candidates[0] || normalizeActiveGeminiModel(params.model);

  if (!ai) {
    return {
      ok: false,
      modelUsed: primaryModel,
      text: '',
      thinking: '',
      truncated: false,
      sources: [],
      error: {
        code: 'INTEGRATION_REQUIRED',
        httpStatus: 503,
        retryable: false,
        message:
          'Integration required: GEMINI_API_KEY is not configured on the server. Add GEMINI_API_KEY in server secrets or select an OpenAI/Claude provider with your own key in Settings.',
      },
    };
  }

  const contents = toGeminiContents(params.history);
  if (contents.length === 0) {
    return {
      ok: false,
      modelUsed: primaryModel,
      text: '',
      thinking: '',
      truncated: false,
      sources: [],
      error: {
        code: 'BAD_REQUEST',
        httpStatus: 400,
        retryable: false,
        message: 'Message must contain text or at least one attachment.',
      },
    };
  }

  let fullText = '';
  let fullThinking = '';
  let truncated = false;
  const sources: Array<{ title: string; uri: string }> = [];
  const seenUris = new Set<string>();
  let lastClassifiedError: ClassifiedGeminiError | undefined;

  for (let idx = 0; idx < candidates.length; idx += 1) {
    if (params.signal.aborted) break;

    const candidateModel = candidates[idx]!;
    const hasNext = idx < candidates.length - 1;

    const runAttempt = async (allowThinking: boolean, allowGrounding: boolean) => {
      const candidateCtrl = new AbortController();
      const onParentAbort = () => candidateCtrl.abort(params.signal.reason);
      params.signal.addEventListener('abort', onParentAbort, { once: true });

      let timedOutReason: string | null = null;
      let candidateText = '';

      const firstWaitMs = hasNext
        ? STREAM_FIRST_ANSWER_FAST_MS
        : STREAM_FIRST_ANSWER_FINAL_MS;
      const firstAnswerTimer = setTimeout(() => {
        if (!candidateText && !candidateCtrl.signal.aborted) {
          timedOutReason = `${candidateModel} timed out waiting for answer`;
          candidateCtrl.abort(new Error(timedOutReason));
        }
      }, firstWaitMs);

      let idleTimer: ReturnType<typeof setTimeout> | null = null;
      const armIdleTimer = () => {
        if (idleTimer) clearTimeout(idleTimer);
        idleTimer = setTimeout(() => {
          if (!candidateCtrl.signal.aborted) {
            timedOutReason = `${candidateModel} stream stalled mid-response`;
            candidateCtrl.abort(new Error(timedOutReason));
          }
        }, STREAM_CHUNK_IDLE_MS);
      };

      const config = buildGeminiRequestConfig({
        modelId: candidateModel,
        systemInstruction: params.systemInstruction,
        maxOutputTokens: params.maxOutputTokens,
        temperature: params.temperature,
        topP: params.topP,
        thinkingEnabled: allowThinking ? params.thinkingEnabled : false,
        thinkingMode: allowThinking ? params.thinkingMode : 'off',
        useSearchGrounding: allowGrounding ? params.useSearchGrounding : false,
        abortSignal: candidateCtrl.signal,
      });

      try {
        armIdleTimer();
        const stream = await ai.models.generateContentStream({
          model: candidateModel,
          contents,
          config,
        });

        for await (const chunk of stream as AsyncIterable<GenerateContentResponse>) {
          if (params.signal.aborted || candidateCtrl.signal.aborted) break;
          armIdleTimer();

          const cand = chunk.candidates?.[0];
          if (cand?.finishReason === 'MAX_TOKENS') {
            truncated = true;
          }

          const gm = (
            cand as
              | {
                  groundingMetadata?: {
                    groundingChunks?: Array<{ web?: { uri?: string; title?: string } }>;
                  };
                }
              | undefined
          )?.groundingMetadata;
          if (Array.isArray(gm?.groundingChunks)) {
            for (const gc of gm.groundingChunks) {
              const uri = gc?.web?.uri;
              if (uri && !seenUris.has(uri)) {
                seenUris.add(uri);
                sources.push({
                  title: gc?.web?.title || uri,
                  uri,
                });
              }
            }
          }

          const parts = cand?.content?.parts as
            | Array<{ text?: string; thought?: boolean }>
            | undefined;
          if (Array.isArray(parts) && parts.length > 0) {
            for (const part of parts) {
              if (typeof part?.text !== 'string' || !part.text) continue;
              if (part.thought === true) {
                fullThinking += part.text;
                params.onThinking?.(part.text);
              } else {
                if (!candidateText) clearTimeout(firstAnswerTimer);
                candidateText += part.text;
                fullText += part.text;
                params.onDelta(part.text);
              }
            }
          } else if (typeof chunk.text === 'string' && chunk.text) {
            if (!candidateText) clearTimeout(firstAnswerTimer);
            candidateText += chunk.text;
            fullText += chunk.text;
            params.onDelta(chunk.text);
          }
        }

        if (timedOutReason && !candidateText) {
          throw new Error(timedOutReason);
        }

        return { candidateText };
      } finally {
        clearTimeout(firstAnswerTimer);
        if (idleTimer) clearTimeout(idleTimer);
        params.signal.removeEventListener('abort', onParentAbort);
      }
    };

    try {
      let attemptRes: { candidateText: string };
      try {
        attemptRes = await runAttempt(true, true);
      } catch (innerErr) {
        if (params.signal.aborted) throw innerErr;
        const innerClassified = classifyGeminiError(innerErr);
        const rawErrStr = innerErr instanceof Error ? innerErr.message : String(innerErr || '');
        if (
          innerClassified.code === 'BAD_REQUEST' &&
          /thinking/i.test(rawErrStr)
        ) {
          attemptRes = await runAttempt(false, true);
        } else if (
          params.useSearchGrounding &&
          (innerClassified.code === 'BAD_REQUEST' || innerClassified.code === 'RATE_LIMITED')
        ) {
          attemptRes = await runAttempt(true, false);
        } else {
          throw innerErr;
        }
      }

      if (params.signal.aborted) {
        return {
          ok: fullText.trim().length > 0,
          modelUsed: candidateModel,
          text: fullText,
          thinking: fullThinking,
          truncated: false,
          sources,
          error:
            fullText.trim().length > 0
              ? undefined
              : {
                  code: 'ABORTED',
                  httpStatus: 499,
                  retryable: false,
                  message: 'Generation stopped.',
                },
        };
      }

      if (attemptRes.candidateText.trim()) {
        markModelHealthy(candidateModel);
        return {
          ok: true,
          modelUsed: candidateModel,
          text: fullText,
          thinking: fullThinking,
          truncated,
          sources,
        };
      }

      lastClassifiedError = {
        code: 'EMPTY_RESPONSE',
        httpStatus: 502,
        retryable: true,
        message: `Empty response returned by ${candidateModel}.`,
      };
      if (hasNext) continue;
    } catch (err: unknown) {
      if (params.signal.aborted) {
        return {
          ok: fullText.trim().length > 0,
          modelUsed: candidateModel,
          text: fullText,
          thinking: fullThinking,
          truncated: false,
          sources,
          error:
            fullText.trim().length > 0
              ? undefined
              : {
                  code: 'ABORTED',
                  httpStatus: 499,
                  retryable: false,
                  message: 'Generation stopped.',
                },
        };
      }

      // If mid-stream error happened AFTER partial text streamed, keep the streamed text cleanly
      if (fullText.trim().length > 0) {
        return {
          ok: true,
          modelUsed: candidateModel,
          text: fullText,
          thinking: fullThinking,
          truncated: true,
          sources,
        };
      }

      const rawErrStr = err instanceof Error ? err.message : String(err || '');
      const isTimeoutErr = /timed out|stalled/i.test(rawErrStr);
      const classified = isTimeoutErr
        ? {
            code: 'NETWORK_ERROR' as const,
            httpStatus: 504,
            retryable: true,
            message: `${candidateModel} timed out waiting for response.`,
          }
        : classifyGeminiError(err);

      lastClassifiedError = classified;
      if (classified.httpStatus >= 500 || classified.httpStatus === 404 || isTimeoutErr) {
        markModelUnhealthy(candidateModel);
      }

      const canFallback =
        hasNext &&
        (classified.retryable ||
          classified.httpStatus === 404 ||
          classified.httpStatus === 429 ||
          classified.httpStatus >= 500 ||
          isTimeoutErr);
      if (canFallback) {
        continue;
      }

      return {
        ok: false,
        modelUsed: candidateModel,
        text: '',
        thinking: fullThinking,
        truncated: false,
        sources,
        error: classified,
      };
    }
  }

  return {
    ok: false,
    modelUsed: candidates[candidates.length - 1] || primaryModel,
    text: '',
    thinking: fullThinking,
    truncated,
    sources,
    error: lastClassifiedError || {
      code: 'SERVER_ERROR',
      httpStatus: 503,
      retryable: true,
      message: 'AI service is temporarily busy. Please try again in a moment.',
    },
  };
}

export async function generateGeminiStructuredJson<T = Record<string, unknown>>(params: {
  model?: string;
  systemInstruction: string;
  prompt: string;
  schema: Record<string, unknown>;
  maxOutputTokens?: number;
  apiKeyOverride?: string;
}): Promise<{ ok: boolean; data?: T; error?: ClassifiedGeminiError }> {
  const ai = createGeminiClient(params.apiKeyOverride);
  const candidates = buildGeminiModelFallbackChain(params.model || 'gemini-3-flash-preview');
  if (!ai) {
    return {
      ok: false,
      error: {
        code: 'INTEGRATION_REQUIRED',
        httpStatus: 503,
        retryable: false,
        message: 'Integration required: Server GEMINI_API_KEY is missing.',
      },
    };
  }

  let lastError: ClassifiedGeminiError | undefined;

  for (let idx = 0; idx < candidates.length; idx += 1) {
    const modelId = candidates[idx]!;
    const hasNext = idx < candidates.length - 1;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(new Error(`${modelId} structured JSON timed out`)), hasNext ? 10_000 : 22_000);
    try {
      const config = buildGeminiRequestConfig({
        modelId,
        systemInstruction: params.systemInstruction,
        maxOutputTokens: params.maxOutputTokens || 4096,
        thinkingEnabled: false,
        responseMimeType: 'application/json',
        responseSchema: params.schema,
        abortSignal: ctrl.signal,
      });
      const resp = await ai.models.generateContent({
        model: modelId,
        contents: [{ role: 'user', parts: [{ text: params.prompt }] }],
        config,
      });
      const text = (resp.text || '').trim();
      if (!text) {
        lastError = {
          code: 'EMPTY_RESPONSE',
          httpStatus: 502,
          retryable: true,
          message: 'Model returned an empty JSON response.',
        };
        if (hasNext) continue;
        return { ok: false, error: lastError };
      }
      const parsed = JSON.parse(text) as T;
      markModelHealthy(modelId);
      return { ok: true, data: parsed };
    } catch (err: unknown) {
      const classified = classifyGeminiError(err);
      lastError = classified;
      if (classified.httpStatus >= 500 || classified.httpStatus === 404 || classified.httpStatus === 499) {
        markModelUnhealthy(modelId);
      }
      if (
        hasNext &&
        (classified.retryable ||
          classified.httpStatus === 404 ||
          classified.httpStatus === 499 ||
          classified.httpStatus >= 500)
      ) {
        continue;
      }
      return {
        ok: false,
        error: classified,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    ok: false,
    error: lastError || {
      code: 'SERVER_ERROR',
      httpStatus: 503,
      retryable: true,
      message: 'Structured JSON generation is temporarily busy. Please retry.',
    },
  };
}

export async function generateOrEditGeminiImage(params: {
  prompt: string;
  aspectRatio?: string;
  referenceImageBase64?: string;
  referenceImageMimeType?: string;
  model?: string;
}): Promise<{
  ok: boolean;
  url?: string;
  modelUsed?: string;
  error?: ClassifiedGeminiError;
}> {
  const ai = createGeminiClient();
  const modelId = params.model || 'gemini-3.1-flash-lite-image';
  if (!ai) {
    return {
      ok: false,
      error: {
        code: 'INTEGRATION_REQUIRED',
        httpStatus: 503,
        retryable: false,
        message:
          'Integration required: GEMINI_API_KEY is required on the server for Gemini Image Generation & Editing.',
      },
    };
  }

  try {
    const parts: Array<Record<string, unknown>> = [{ text: params.prompt }];
    if (params.referenceImageBase64) {
      const cleanB64 = params.referenceImageBase64.includes(',')
        ? params.referenceImageBase64.split(',')[1] || ''
        : params.referenceImageBase64;
      if (cleanB64) {
        parts.push({
          inlineData: {
            mimeType: params.referenceImageMimeType || 'image/png',
            data: cleanB64,
          },
        });
      }
    }

    const resp = await ai.models.generateContent({
      model: modelId,
      contents: [{ role: 'user', parts }],
      config: {
        responseModalities: ['IMAGE'],
        ...(params.aspectRatio ? { imageConfig: { aspectRatio: params.aspectRatio } } : {}),
      } as Record<string, unknown>,
    });

    const respParts = (resp.candidates?.[0]?.content?.parts || []) as Array<{
      inlineData?: { mimeType?: string; data?: string };
    }>;
    for (const part of respParts) {
      if (part?.inlineData?.data) {
        const mime = part.inlineData.mimeType || 'image/png';
        return {
          ok: true,
          url: `data:${mime};base64,${part.inlineData.data}`,
          modelUsed: modelId,
        };
      }
    }

    return {
      ok: false,
      error: {
        code: 'EMPTY_RESPONSE',
        httpStatus: 502,
        retryable: true,
        message: 'Gemini image model did not return an image payload.',
      },
    };
  } catch (err: unknown) {
    return {
      ok: false,
      error: classifyGeminiError(err),
    };
  }
}
