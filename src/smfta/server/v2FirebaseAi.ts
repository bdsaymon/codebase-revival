import {
  GoogleGenAI,
  ThinkingLevel,
  GenerateContentResponse,
} from '@google/genai';
import {
  V2ModelId,
  V2_MODEL_IDS,
  getV2ModelSpec,
  getRiyadhDateKey,
  getNextRiyadhResetInfo,
  evaluateV2ModelQuota,
  sanitizeV2QuotaConfig,
  DEFAULT_V2_QUOTA_CONFIG,
  V2QuotaConfig,
  V2ModelQuotaStatus,
  ADMIN_EMAILS,
} from '../src/utils/v2UsageLimits';
import { MASTER_PROFILE_PROMPT_BASELINE } from '../src/utils/memoryBank';
import { sanitizeProprietaryOutput } from './providers';

interface UserDailyUsageRecord {
  dateRiyadh: string;
  usedByModel: Record<V2ModelId, number>;
  testingUsedByModel: Record<V2ModelId, number>;
}

const serverV2UsageStore = new Map<string, UserDailyUsageRecord>();
const serverV2ConfigStore = new Map<string, V2QuotaConfig>();

function normalizeUserKey(userId?: string | null): string {
  const clean = String(userId || 'default-user')
    .trim()
    .replace(/[^a-zA-Z0-9_@.-]/g, '_')
    .slice(0, 128);
  return clean || 'default-user';
}

function getAllowedAdminEmails(): string[] {
  const fromEnv = (process.env.V2_ADMIN_EMAILS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return Array.from(new Set([...ADMIN_EMAILS, ...fromEnv]));
}

/**
 * Strictly checks verified admin/testing identities on the server.
 */
export function isServerAuthorizedTester(
  userEmail?: string | null,
  userId?: string | null,
  emailVerified?: boolean
): boolean {
  const allowed = getAllowedAdminEmails();
  if (userEmail) {
    const cleanEmail = userEmail.trim().toLowerCase();
    if (allowed.includes(cleanEmail) && emailVerified !== false) {
      return true;
    }
  }
  if (userId) {
    const cleanUid = userId.trim().toLowerCase();
    if (allowed.includes(cleanUid)) {
      return true;
    }
  }
  return false;
}

export function getServerV2UserRecord(
  userId?: string | null,
  nowMs: number = Date.now()
): UserDailyUsageRecord {
  const key = normalizeUserKey(userId);
  const todayRiyadh = getRiyadhDateKey(nowMs);
  const existing = serverV2UsageStore.get(key);

  if (!existing || existing.dateRiyadh !== todayRiyadh) {
    const fresh: UserDailyUsageRecord = {
      dateRiyadh: todayRiyadh,
      usedByModel: {
        'smfta-v5': 0,
        'smfta-v2-pro': 0,
        'smfta-max': 0,
      },
      testingUsedByModel: {
        'smfta-v5': 0,
        'smfta-v2-pro': 0,
        'smfta-max': 0,
      },
    };
    serverV2UsageStore.set(key, fresh);
    return fresh;
  }
  return existing;
}

export function getServerV2QuotaConfig(userId?: string | null): V2QuotaConfig {
  const key = normalizeUserKey(userId);
  return (
    serverV2ConfigStore.get(key) || {
      ...DEFAULT_V2_QUOTA_CONFIG,
    }
  );
}

export function updateServerV2QuotaConfig(
  userId: string | null | undefined,
  patch: Partial<V2QuotaConfig>
): V2QuotaConfig {
  const key = normalizeUserKey(userId);
  const current = getServerV2QuotaConfig(key);
  const updated = sanitizeV2QuotaConfig({ ...current, ...patch });
  serverV2ConfigStore.set(key, updated);
  return updated;
}

export function getAllV2ModelStatusesForUser(params: {
  userId?: string | null;
  userEmail?: string | null;
  emailVerified?: boolean;
  configOverride?: Partial<V2QuotaConfig> | null;
  nowMs?: number;
}): {
  dateRiyadh: string;
  resetInfo: ReturnType<typeof getNextRiyadhResetInfo>;
  config: V2QuotaConfig;
  isAuthorizedTester: boolean;
  models: Record<V2ModelId, V2ModelQuotaStatus>;
} {
  const nowMs = params.nowMs ?? Date.now();
  const record = getServerV2UserRecord(params.userId, nowMs);
  const baseConfig = getServerV2QuotaConfig(params.userId);
  const effectiveConfig = params.configOverride
    ? sanitizeV2QuotaConfig({ ...baseConfig, ...params.configOverride })
    : baseConfig;
  const isAuthorizedTester = isServerAuthorizedTester(
    params.userEmail,
    params.userId,
    params.emailVerified
  );

  const models = {} as Record<V2ModelId, V2ModelQuotaStatus>;
  for (const modelId of V2_MODEL_IDS) {
    models[modelId] = evaluateV2ModelQuota({
      modelId,
      usedCount: record.usedByModel[modelId],
      testingUsedCount: record.testingUsedByModel[modelId],
      config: effectiveConfig,
      isAuthorizedTester,
      nowMs,
    });
  }

  return {
    dateRiyadh: record.dateRiyadh,
    resetInfo: getNextRiyadhResetInfo(nowMs),
    config: effectiveConfig,
    isAuthorizedTester,
    models,
  };
}

export function checkAndConsumeServerV2Quota(params: {
  userId?: string | null;
  userEmail?: string | null;
  emailVerified?: boolean;
  modelId: V2ModelId;
  configOverride?: Partial<V2QuotaConfig> | null;
  nowMs?: number;
}): {
  allowed: boolean;
  status: V2ModelQuotaStatus;
} {
  const nowMs = params.nowMs ?? Date.now();
  const record = getServerV2UserRecord(params.userId, nowMs);
  const baseConfig = getServerV2QuotaConfig(params.userId);
  const effectiveConfig = params.configOverride
    ? sanitizeV2QuotaConfig({ ...baseConfig, ...params.configOverride })
    : baseConfig;
  const isAuthorizedTester = isServerAuthorizedTester(
    params.userEmail,
    params.userId,
    params.emailVerified
  );

  const sanitizedCfg = isAuthorizedTester
    ? effectiveConfig
    : { ...effectiveConfig, testingBypassEnabled: false };

  const preStatus = evaluateV2ModelQuota({
    modelId: params.modelId,
    usedCount: record.usedByModel[params.modelId],
    testingUsedCount: record.testingUsedByModel[params.modelId],
    config: sanitizedCfg,
    isAuthorizedTester,
    nowMs,
  });

  if (preStatus.isBlocked) {
    return { allowed: false, status: preStatus };
  }

  if (preStatus.isTestingBypass) {
    record.testingUsedByModel[params.modelId] += 1;
  } else {
    record.usedByModel[params.modelId] += 1;
  }

  const postStatus = evaluateV2ModelQuota({
    modelId: params.modelId,
    usedCount: record.usedByModel[params.modelId],
    testingUsedCount: record.testingUsedByModel[params.modelId],
    config: sanitizedCfg,
    isAuthorizedTester,
    nowMs,
  });

  return { allowed: true, status: postStatus };
}

export function setServerV2UsageCountForTesting(params: {
  userId?: string | null;
  userEmail?: string | null;
  modelId: V2ModelId;
  usedCount: number;
  testingUsedCount?: number;
  nowMs?: number;
}): V2ModelQuotaStatus {
  const nowMs = params.nowMs ?? Date.now();
  const record = getServerV2UserRecord(params.userId, nowMs);
  record.usedByModel[params.modelId] = Math.max(
    0,
    Math.floor(Number(params.usedCount) || 0)
  );
  if (typeof params.testingUsedCount === 'number') {
    record.testingUsedByModel[params.modelId] = Math.max(
      0,
      Math.floor(params.testingUsedCount)
    );
  }
  const config = getServerV2QuotaConfig(params.userId);
  const isAuthorizedTester = isServerAuthorizedTester(
    params.userEmail,
    params.userId
  );
  return evaluateV2ModelQuota({
    modelId: params.modelId,
    usedCount: record.usedByModel[params.modelId],
    testingUsedCount: record.testingUsedByModel[params.modelId],
    config,
    isAuthorizedTester,
    nowMs,
  });
}

export function stripPrivateChainOfThought(text: string): string {
  if (!text) return '';
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/^<think>[\s\S]*$/gi, '');
}

function getGenAIClient(): GoogleGenAI | null {
  const apiKey = (
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.API_KEY ||
    ''
  ).trim();
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

function resolveThinkingLevel(
  level: 'MINIMAL' | 'LOW' | 'HIGH'
): ThinkingLevel {
  if (level === 'MINIMAL') return ThinkingLevel.MINIMAL;
  if (level === 'LOW') return ThinkingLevel.LOW;
  return ThinkingLevel.HIGH;
}

export function buildV2GenAiRequestConfig(params: {
  modelName: string;
  spec: ReturnType<typeof getV2ModelSpec>;
  fullSystemInstruction: string;
}): Record<string, unknown> {
  const normalized = params.modelName.trim().toLowerCase();
  const isHydrogen = normalized === 'gemini-4-hydrogen';

  if (isHydrogen) {
    const cfg: Record<string, unknown> = {
      systemInstruction: params.fullSystemInstruction,
      thinkingConfig: {
        thinkingLevel:
          params.spec.thinkingLevel === 'MINIMAL'
            ? ThinkingLevel.LOW
            : resolveThinkingLevel(params.spec.thinkingLevel),
      },
    };
    if (params.spec.useSearchGrounding) {
      cfg.tools = [{ googleSearch: {} }];
    }
    return cfg;
  }

  const cfg: Record<string, unknown> = {
    systemInstruction: params.fullSystemInstruction,
    temperature: params.spec.temperature,
    maxOutputTokens: params.spec.maxOutputTokens,
    thinkingConfig: {
      thinkingLevel: resolveThinkingLevel(params.spec.thinkingLevel),
    },
  };
  if (params.spec.useSearchGrounding) {
    cfg.tools = [{ googleSearch: {} }];
  }
  return cfg;
}

export type GeminiContentPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } };

export interface GeminiContentTurn {
  role: 'user' | 'model';
  parts: GeminiContentPart[];
}

/**
 * Formats chat history strictly for Gemini / Firebase AI Logic `contents`:
 * - Strips empty text items so no empty `parts` or blank turns are ever sent
 * - Ensures leading turns are `user`
 * - Merges consecutive same-role turns so turn alternation is always valid
 */
export function formatGeminiContents(
  history: Array<{
    role: string;
    content?: string;
    text?: string;
    imgs?: Array<{ mime: string; data: string }>;
  }>
): GeminiContentTurn[] {
  const turns: GeminiContentTurn[] = [];

  for (const item of history) {
    const role: 'user' | 'model' =
      item.role === 'user' ? 'user' : 'model';
    const parts: GeminiContentPart[] = [];

    if (Array.isArray(item.imgs)) {
      for (const img of item.imgs) {
        if (img?.data && img?.mime) {
          parts.push({
            inlineData: {
              mimeType: img.mime,
              data: img.data,
            },
          });
        }
      }
    }

    const txt = String(item.content ?? item.text ?? '').trim();
    if (txt) {
      parts.push({ text: txt });
    }

    if (parts.length === 0) continue;

    // Gemini conversations must begin with a user turn
    if (turns.length === 0 && role !== 'user') continue;

    const prev = turns[turns.length - 1];
    if (prev && prev.role === role) {
      prev.parts.push(...parts);
    } else {
      turns.push({ role, parts });
    }
  }

  return turns;
}

function isRateLimitError(err: unknown): boolean {
  if (!err) return false;
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  const status = Number(
    (err as { status?: number; httpStatus?: number; code?: number })?.status ||
      (err as { status?: number; httpStatus?: number; code?: number })
        ?.httpStatus ||
      0
  );
  return (
    status === 429 ||
    msg.includes('429') ||
    msg.includes('resource_exhausted') ||
    msg.includes('too many requests') ||
    msg.includes('rate limit')
  );
}

/**
 * Simple, direct single-pass V2 Firebase AI / Gemini streaming handler.
 * Zero retry loops and zero V1 mixing so rate limits are never amplified.
 */
export async function streamV2FirebaseModel(params: {
  modelId: V2ModelId;
  systemInstruction: string;
  history: Array<{
    role: string;
    content: string;
    imgs?: Array<{ mime: string; data: string }>;
  }>;
  signal: AbortSignal;
  emitDelta: (delta: string) => void;
}): Promise<{
  ok: boolean;
  modelLabel: string;
  httpStatus?: number;
  errorCode?: 'V2_RATE_LIMITED' | 'V2_AI_UNAVAILABLE' | 'V2_BAD_REQUEST';
  sources?: Array<{ title: string; uri: string }>;
  error?: string;
}> {
  const spec = getV2ModelSpec(params.modelId);
  const ai = getGenAIClient();

  if (!ai) {
    return {
      ok: false,
      modelLabel: spec.label,
      errorCode: 'V2_AI_UNAVAILABLE',
      error: `${spec.label} requires the server GEMINI_API_KEY configured in Settings > Secrets.`,
    };
  }

  const contents = formatGeminiContents(params.history);
  if (contents.length === 0) {
    return {
      ok: false,
      modelLabel: spec.label,
      httpStatus: 422,
      errorCode: 'V2_BAD_REQUEST',
      error: 'Message must contain text or at least one image.',
    };
  }

  const fullSystemInstruction = `${params.systemInstruction}\n\n${MASTER_PROFILE_PROMPT_BASELINE}\n\n[V2 SPECIAL ENGINE — ${spec.label}]\n${spec.systemDirective}\nTarget maximum length guidance: keep answer balanced within roughly ${spec.maxOutputTokens} tokens.\nIMPORTANT: Never output code or code blocks unless the user explicitly asks for code. Always reply in simple, direct Bengali unless asked otherwise. Never output raw <think> tags or expose internal chain-of-thought. Provide only the clean, final answer.`;

  const config = buildV2GenAiRequestConfig({
    modelName: spec.serverGeminiModel,
    spec,
    fullSystemInstruction,
  });

  try {
    const responseStream = await ai.models.generateContentStream({
      model: spec.serverGeminiModel,
      contents,
      config,
    });

    let emittedAny = false;
    const collectedSources: Array<{ title: string; uri: string }> = [];
    const seenUris = new Set<string>();

    for await (const chunk of responseStream) {
      if (params.signal.aborted) break;
      const c = chunk as GenerateContentResponse;
      const groundingChunks =
        c.candidates?.[0]?.groundingMetadata?.groundingChunks;
      if (Array.isArray(groundingChunks)) {
        for (const gc of groundingChunks) {
          const web = gc?.web;
          if (web?.uri && !seenUris.has(web.uri)) {
            seenUris.add(web.uri);
            collectedSources.push({
              title: web.title || web.uri,
              uri: web.uri,
            });
          }
        }
      }

      const rawText = c.text || '';
      const cleaned = sanitizeProprietaryOutput(
        stripPrivateChainOfThought(rawText)
      );
      if (cleaned) {
        emittedAny = true;
        params.emitDelta(cleaned);
      }
    }

    if (!emittedAny && !params.signal.aborted) {
      return {
        ok: false,
        modelLabel: spec.label,
        errorCode: 'V2_AI_UNAVAILABLE',
        error: `${spec.label} returned an empty response. Please try again.`,
      };
    }

    return {
      ok: true,
      modelLabel: spec.label,
      sources: collectedSources.length > 0 ? collectedSources : undefined,
    };
  } catch (err) {
    if (params.signal.aborted) {
      return {
        ok: false,
        modelLabel: spec.label,
        error: 'Request cancelled.',
      };
    }

    if (isRateLimitError(err)) {
      return {
        ok: false,
        modelLabel: spec.label,
        httpStatus: 429,
        errorCode: 'V2_RATE_LIMITED',
        error: `${spec.label} rate limit reached temporarily (429 Too Many Requests). Please wait a moment and try again.`,
      };
    }

    const rawMsg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      modelLabel: spec.label,
      errorCode: 'V2_AI_UNAVAILABLE',
      error: `${spec.label} request failed: ${rawMsg.slice(0, 180)}`,
    };
  }
}
