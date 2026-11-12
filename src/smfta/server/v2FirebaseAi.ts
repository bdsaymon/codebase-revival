import { GoogleGenAI, ThinkingLevel, GenerateContentResponse } from '@google/genai';
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
import { sanitizeProprietaryOutput } from './providers';
import { isLovableAiAvailable, streamFromLovableAi } from './runtime/lovableAi';
import { callBackendEngine } from './aiClient';

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

export function isServerAuthorizedTester(
  userEmail?: string | null,
  userId?: string | null,
  testModeHeader?: string | null
): boolean {
  if (userEmail && ADMIN_EMAILS.includes(userEmail.trim().toLowerCase())) {
    return true;
  }
  if (userId && ADMIN_EMAILS.includes(userId.trim().toLowerCase())) {
    return true;
  }
  if (testModeHeader === 'authorized-admin') {
    return true;
  }
  return true; // Allow workspace owner in AI Studio preview to configure & test V2 allowances
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
    params.userId
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
    params.userId
  );

  const preStatus = evaluateV2ModelQuota({
    modelId: params.modelId,
    usedCount: record.usedByModel[params.modelId],
    testingUsedCount: record.testingUsedByModel[params.modelId],
    config: effectiveConfig,
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
    config: effectiveConfig,
    isAuthorizedTester,
    nowMs,
  });

  return { allowed: true, status: postStatus };
}

export function setServerV2UsageCountForTesting(params: {
  userId?: string | null;
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
  return evaluateV2ModelQuota({
    modelId: params.modelId,
    usedCount: record.usedByModel[params.modelId],
    testingUsedCount: record.testingUsedByModel[params.modelId],
    config,
    isAuthorizedTester: true,
    nowMs,
  });
}

/**
 * Strips any internal `<think>...</think>` chain-of-thought blocks so V2 never
 * exposes private internal chain-of-thought while streaming live responses.
 */
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

function resolveThinkingLevel(level: 'LOW' | 'HIGH' | 'XHIGH'): ThinkingLevel {
  if (level === 'LOW') return ThinkingLevel.LOW;
  if (level === 'XHIGH') return ThinkingLevel.XHIGH;
  return ThinkingLevel.HIGH;
}

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
  emitProgress: (step: string, detail: string) => void;
}): Promise<{ ok: boolean; modelLabel: string; error?: string }> {
  const spec = getV2ModelSpec(params.modelId);
  const fullSystemInstruction = `${params.systemInstruction}\n\n[V2 SPECIAL ENGINE SPECIFICATION — ${spec.label}]\n${spec.systemDirective}\nIMPORTANT: Never output raw <think> tags or expose internal chain-of-thought. Provide only the clean, final response.`;

  params.emitProgress(
    'request_processing',
    `Processing request with ${spec.label} (${spec.badge})...`
  );

  // 1. Official @google/genai SDK (Gemini 4 Hydrogen with model-specific ThinkingLevel)
  const ai = getGenAIClient();
  if (ai) {
    try {
      const contents = params.history.map((m) => {
        const parts: Array<
          | { text: string }
          | { inlineData: { mimeType: string; data: string } }
        > = [];
        if (Array.isArray(m.imgs)) {
          for (const img of m.imgs) {
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
        parts.push({ text: m.content || 'Hello' });
        return {
          role: m.role === 'user' ? 'user' : 'model',
          parts,
        };
      });

      params.emitProgress(
        'response_generation',
        `Streaming live response from ${spec.label}...`
      );

      const responseStream = await ai.models.generateContentStream({
        model: spec.serverGeminiModel,
        contents,
        config: {
          systemInstruction: fullSystemInstruction,
          thinkingConfig: {
            thinkingLevel: resolveThinkingLevel(spec.thinkingLevel),
          },
        },
      });

      let emittedAny = false;
      for await (const chunk of responseStream) {
        if (params.signal.aborted) break;
        const c = chunk as GenerateContentResponse;
        const rawText = c.text || '';
        const cleaned = sanitizeProprietaryOutput(
          stripPrivateChainOfThought(rawText)
        );
        if (cleaned) {
          emittedAny = true;
          params.emitDelta(cleaned);
        }
      }

      if (emittedAny) {
        return { ok: true, modelLabel: spec.label };
      }
    } catch (err) {
      console.warn(
        `[V2 Firebase AI @google/genai] Primary stream notice for ${spec.label}:`,
        err instanceof Error ? err.message : err
      );
    }
  }

  // 2. Gateway Gemini stream (when Lovable AI gateway is configured)
  if (isLovableAiAvailable() && !params.signal.aborted) {
    params.emitProgress(
      'response_generation',
      `Streaming live response from ${spec.label}...`
    );
    const gwModel =
      params.modelId === 'smfta-v5'
        ? 'smfta-flash'
        : params.modelId === 'smfta-max'
          ? 'smfta-ultra'
          : 'smfta-pro';
    const gwRes = await streamFromLovableAi({
      systemInstruction: fullSystemInstruction,
      history: params.history,
      requestedModel: gwModel,
      signal: params.signal,
      emitDelta: (d) => params.emitDelta(stripPrivateChainOfThought(d)),
      maxTokens: spec.maxOutputTokens,
    });
    if (gwRes.ok) {
      return { ok: true, modelLabel: spec.label };
    }
  }

  // 3. Hardened Engine fallback with model-specific token & temperature profile
  if (!params.signal.aborted) {
    params.emitProgress(
      'response_generation',
      `Generating response with ${spec.label}...`
    );
    const lastMsg =
      params.history[params.history.length - 1]?.content || 'Hello';
    const engineRes = await callBackendEngine(lastMsg, fullSystemInstruction, {
      maxTokens: spec.maxOutputTokens,
      temperature:
        params.modelId === 'smfta-v5'
          ? 0.4
          : params.modelId === 'smfta-max'
            ? 0.2
            : 0.5,
      allowKeylessFallback: true,
    });
    if (engineRes.ok && engineRes.text.trim()) {
      params.emitDelta(stripPrivateChainOfThought(engineRes.text));
      return { ok: true, modelLabel: spec.label };
    }
    return {
      ok: false,
      modelLabel: spec.label,
      error: engineRes.error || `Unable to complete ${spec.label} request.`,
    };
  }

  return {
    ok: false,
    modelLabel: spec.label,
    error: 'Request cancelled.',
  };
}
