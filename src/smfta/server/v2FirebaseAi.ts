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
import { supabaseAdmin } from '../../integrations/supabase/client.server';
import type { Json } from '../../integrations/supabase/types';
import {
  continuationDirective,
  createIdleWatchdog,
  mergeContinuationText,
} from '../src/utils/streamGuard';
import { resolveServerEnvGeminiKey } from './keyResolver';

interface UserDailyUsageRecord {
  dateRiyadh: string;
  usedByModel: Record<V2ModelId, number>;
  testingUsedByModel: Record<V2ModelId, number>;
}

const serverV2UsageStore = new Map<string, UserDailyUsageRecord>();
const serverV2ConfigStore = new Map<string, V2QuotaConfig>();

export interface V2QuotaDbAdapter {
  getUsage(userId: string, dateRiyadh: string): Promise<UserDailyUsageRecord | null>;
  upsertUsage(userId: string, record: UserDailyUsageRecord): Promise<void>;
  getConfig(userId: string): Promise<V2QuotaConfig | null>;
  upsertConfig(userId: string, config: V2QuotaConfig): Promise<void>;
}

let customV2DbAdapter: V2QuotaDbAdapter | null = null;

export function configureV2DbAdapterForTesting(adapter: V2QuotaDbAdapter | null): void {
  customV2DbAdapter = adapter;
}

export function isSupabaseV2Configured(): boolean {
  return Boolean(
    (process.env.SUPABASE_URL || '').trim() &&
      (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  );
}

export function clearServerV2MemoryStoreForTesting(): void {
  serverV2UsageStore.clear();
  serverV2ConfigStore.clear();
}

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

function createEmptyUsageRecord(dateRiyadh: string): UserDailyUsageRecord {
  return {
    dateRiyadh,
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
}

function sanitizeUsageCounts(
  raw: unknown
): Record<V2ModelId, number> {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    'smfta-v5': Math.max(0, Math.floor(Number(obj['smfta-v5']) || 0)),
    'smfta-v2-pro': Math.max(0, Math.floor(Number(obj['smfta-v2-pro']) || 0)),
    'smfta-max': Math.max(0, Math.floor(Number(obj['smfta-max']) || 0)),
  };
}

export async function getServerV2UserRecord(
  userId?: string | null,
  nowMs: number = Date.now()
): Promise<UserDailyUsageRecord> {
  const key = normalizeUserKey(userId);
  const todayRiyadh = getRiyadhDateKey(nowMs);

  if (customV2DbAdapter) {
    const existing = await customV2DbAdapter.getUsage(key, todayRiyadh);
    if (existing && existing.dateRiyadh === todayRiyadh) {
      const normalized: UserDailyUsageRecord = {
        dateRiyadh: todayRiyadh,
        usedByModel: sanitizeUsageCounts(existing.usedByModel),
        testingUsedByModel: sanitizeUsageCounts(existing.testingUsedByModel),
      };
      serverV2UsageStore.set(key, normalized);
      return normalized;
    }
    const fresh = createEmptyUsageRecord(todayRiyadh);
    await customV2DbAdapter.upsertUsage(key, fresh);
    serverV2UsageStore.set(key, fresh);
    return fresh;
  }

  if (isSupabaseV2Configured()) {
    try {
      const { data, error } = await supabaseAdmin
        .from('smfta_v2_usage')
        .select('*')
        .eq('user_id', key)
        .eq('date_riyadh', todayRiyadh)
        .maybeSingle();

      if (!error && data) {
        const record: UserDailyUsageRecord = {
          dateRiyadh: String(data.date_riyadh || todayRiyadh),
          usedByModel: sanitizeUsageCounts(data.used_by_model),
          testingUsedByModel: sanitizeUsageCounts(data.testing_used_by_model),
        };
        serverV2UsageStore.set(key, record);
        return record;
      }
      if (!error && !data) {
        const fresh = createEmptyUsageRecord(todayRiyadh);
        const { error: upsertErr } = await supabaseAdmin.from('smfta_v2_usage').upsert(
          {
            user_id: key,
            date_riyadh: todayRiyadh,
            used_by_model: fresh.usedByModel,
            testing_used_by_model: fresh.testingUsedByModel,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,date_riyadh' }
        );
        if (upsertErr) {
          console.warn('[v2FirebaseAi] smfta_v2_usage upsert warning:', upsertErr.message);
        }
        serverV2UsageStore.set(key, fresh);
        return fresh;
      }
      if (error) {
        console.warn('[v2FirebaseAi] smfta_v2_usage select warning:', error.message);
      }
    } catch (err) {
      console.warn(
        '[v2FirebaseAi] Supabase smfta_v2_usage fallback:',
        err instanceof Error ? err.message : String(err)
      );
    }
  }

  const existing = serverV2UsageStore.get(key);
  if (!existing || existing.dateRiyadh !== todayRiyadh) {
    const fresh = createEmptyUsageRecord(todayRiyadh);
    serverV2UsageStore.set(key, fresh);
    return fresh;
  }
  return existing;
}

async function saveServerV2UserRecord(key: string, record: UserDailyUsageRecord): Promise<void> {
  serverV2UsageStore.set(key, record);
  if (customV2DbAdapter) {
    await customV2DbAdapter.upsertUsage(key, record);
    return;
  }
  if (!isSupabaseV2Configured()) return;
  try {
    const { error } = await supabaseAdmin.from('smfta_v2_usage').upsert(
      {
        user_id: key,
        date_riyadh: record.dateRiyadh,
        used_by_model: record.usedByModel,
        testing_used_by_model: record.testingUsedByModel,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,date_riyadh' }
    );
    if (error) {
      console.warn('[v2FirebaseAi] smfta_v2_usage save warning:', error.message);
    }
  } catch (err) {
    console.warn(
      '[v2FirebaseAi] Supabase smfta_v2_usage save fallback:',
      err instanceof Error ? err.message : String(err)
    );
  }
}

export async function getServerV2QuotaConfig(userId?: string | null): Promise<V2QuotaConfig> {
  const key = normalizeUserKey(userId);
  if (customV2DbAdapter) {
    const existing = await customV2DbAdapter.getConfig(key);
    if (existing) {
      const cfg = sanitizeV2QuotaConfig(existing);
      serverV2ConfigStore.set(key, cfg);
      return cfg;
    }
  } else if (isSupabaseV2Configured()) {
    try {
      const { data, error } = await supabaseAdmin
        .from('smfta_v2_quota_config')
        .select('*')
        .eq('user_id', key)
        .maybeSingle();

      if (!error && data && data.config_json) {
        const cfg = sanitizeV2QuotaConfig(data.config_json as Partial<V2QuotaConfig>);
        serverV2ConfigStore.set(key, cfg);
        return cfg;
      }
      if (error) {
        console.warn('[v2FirebaseAi] smfta_v2_quota_config select warning:', error.message);
      }
    } catch (err) {
      console.warn(
        '[v2FirebaseAi] Supabase smfta_v2_quota_config read fallback:',
        err instanceof Error ? err.message : String(err)
      );
    }
  }

  return (
    serverV2ConfigStore.get(key) || {
      ...DEFAULT_V2_QUOTA_CONFIG,
    }
  );
}

export async function updateServerV2QuotaConfig(
  userId: string | null | undefined,
  patch: Partial<V2QuotaConfig>
): Promise<V2QuotaConfig> {
  const key = normalizeUserKey(userId);
  const current = await getServerV2QuotaConfig(key);
  const updated = sanitizeV2QuotaConfig({ ...current, ...patch });
  serverV2ConfigStore.set(key, updated);
  if (customV2DbAdapter) {
    await customV2DbAdapter.upsertConfig(key, updated);
    return updated;
  }
  if (isSupabaseV2Configured()) {
    try {
      const { error } = await supabaseAdmin.from('smfta_v2_quota_config').upsert(
        {
          user_id: key,
          config_json: updated as unknown as Json,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      );
      if (error) {
        console.warn('[v2FirebaseAi] smfta_v2_quota_config upsert warning:', error.message);
      }
    } catch (err) {
      console.warn(
        '[v2FirebaseAi] Supabase smfta_v2_quota_config upsert fallback:',
        err instanceof Error ? err.message : String(err)
      );
    }
  }
  return updated;
}

export async function getAllV2ModelStatusesForUser(params: {
  userId?: string | null;
  userEmail?: string | null;
  emailVerified?: boolean;
  configOverride?: Partial<V2QuotaConfig> | null;
  nowMs?: number;
}): Promise<{
  dateRiyadh: string;
  resetInfo: ReturnType<typeof getNextRiyadhResetInfo>;
  config: V2QuotaConfig;
  isAuthorizedTester: boolean;
  models: Record<V2ModelId, V2ModelQuotaStatus>;
}> {
  const nowMs = params.nowMs ?? Date.now();
  const record = await getServerV2UserRecord(params.userId, nowMs);
  const baseConfig = await getServerV2QuotaConfig(params.userId);
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

export async function checkAndConsumeServerV2Quota(params: {
  userId?: string | null;
  userEmail?: string | null;
  emailVerified?: boolean;
  modelId: V2ModelId;
  configOverride?: Partial<V2QuotaConfig> | null;
  nowMs?: number;
}): Promise<{
  allowed: boolean;
  status: V2ModelQuotaStatus;
}> {
  const nowMs = params.nowMs ?? Date.now();
  const record = await getServerV2UserRecord(params.userId, nowMs);
  const baseConfig = await getServerV2QuotaConfig(params.userId);
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

  await saveServerV2UserRecord(normalizeUserKey(params.userId), record);

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

export async function setServerV2UsageCountForTesting(params: {
  userId?: string | null;
  userEmail?: string | null;
  modelId: V2ModelId;
  usedCount: number;
  testingUsedCount?: number;
  nowMs?: number;
}): Promise<V2ModelQuotaStatus> {
  const nowMs = params.nowMs ?? Date.now();
  const record = await getServerV2UserRecord(params.userId, nowMs);
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
  await saveServerV2UserRecord(normalizeUserKey(params.userId), record);

  const config = await getServerV2QuotaConfig(params.userId);
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

export function getV2GeminiApiKey(): string {
  return resolveServerEnvGeminiKey();
}

function getGenAIClient(apiKeyOverride?: string): GoogleGenAI | null {
  const apiKey = (apiKeyOverride || getV2GeminiApiKey()).trim();
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
  level: 'MINIMAL' | 'LOW' | 'MEDIUM' | 'HIGH'
): ThinkingLevel {
  if (level === 'MINIMAL') return ThinkingLevel.MINIMAL;
  if (level === 'LOW') return ThinkingLevel.LOW;
  if (level === 'MEDIUM') return ThinkingLevel.MEDIUM ?? ThinkingLevel.LOW;
  return ThinkingLevel.HIGH;
}

function resolveEffortToThinkingLevel(
  effort: 'low' | 'medium' | 'high' | undefined,
  fallback: 'MINIMAL' | 'LOW' | 'MEDIUM' | 'HIGH'
): ThinkingLevel {
  if (effort === 'low') return ThinkingLevel.LOW;
  if (effort === 'medium') return ThinkingLevel.MEDIUM ?? ThinkingLevel.LOW;
  if (effort === 'high') return ThinkingLevel.HIGH;
  return resolveThinkingLevel(fallback);
}

export function buildV2GenAiRequestConfig(params: {
  modelName: string;
  spec: ReturnType<typeof getV2ModelSpec>;
  fullSystemInstruction: string;
  thinkingEnabled?: boolean;
  thinkingEffort?: 'off' | 'low' | 'medium' | 'high';
  webSearch?: boolean;
  maxOutputTokensOverride?: number;
}): Record<string, unknown> {
  const normalized = params.modelName.trim().toLowerCase();
  const isHydrogen = normalized.includes('gemini-4');
  const isFlash38 = normalized.includes('gemini-3.8');
  const allowThinking = params.thinkingEnabled !== false && params.thinkingEffort !== 'off';
  const resolvedMaxOutputTokens =
    typeof params.maxOutputTokensOverride === 'number' && params.maxOutputTokensOverride > 0
      ? Math.round(params.maxOutputTokensOverride)
      : params.spec.maxOutputTokens;
  const useSearch =
    typeof params.webSearch === 'boolean'
      ? params.webSearch
      : Boolean(params.spec.useSearchGrounding);
  const effort =
    params.thinkingEffort === 'low' ||
    params.thinkingEffort === 'medium' ||
    params.thinkingEffort === 'high'
      ? params.thinkingEffort
      : undefined;

  if (isHydrogen) {
    // gemini-4-hydrogen: rejects temperature/topP/topK and MINIMAL thinkingLevel;
    // thinks HIGH by default so always set MEDIUM explicitly unless higher/lower requested.
    const cfg: Record<string, unknown> = {
      systemInstruction: params.fullSystemInstruction,
      maxOutputTokens:
        typeof params.maxOutputTokensOverride === 'number' && params.maxOutputTokensOverride > 0
          ? resolvedMaxOutputTokens
          : Math.max(16_384, params.spec.maxOutputTokens),
    };
    const requestedLevel = effort
      ? resolveEffortToThinkingLevel(effort, 'MEDIUM')
      : ThinkingLevel.MEDIUM ?? ThinkingLevel.LOW;
    const safeHydrogenLevel =
      requestedLevel === ThinkingLevel.MINIMAL
        ? (ThinkingLevel.MEDIUM ?? ThinkingLevel.LOW)
        : requestedLevel;
    cfg.thinkingConfig = {
      includeThoughts: allowThinking,
      thinkingLevel: safeHydrogenLevel,
    };
    if (useSearch) {
      cfg.tools = [{ googleSearch: {} }];
    }
    return cfg;
  }

  const isGemini25 = normalized.includes('gemini-2.5');
  if (isGemini25) {
    const cfg: Record<string, unknown> = {
      systemInstruction: params.fullSystemInstruction,
      temperature: params.spec.temperature,
      maxOutputTokens: resolvedMaxOutputTokens,
    };
    if (allowThinking) {
      const budgetMap: Record<'MINIMAL' | 'LOW' | 'MEDIUM' | 'HIGH', number> = {
        MINIMAL: 1024,
        LOW: 2048,
        MEDIUM: 4096,
        HIGH: 12288,
      };
      const effKey =
        effort === 'low'
          ? 'LOW'
          : effort === 'medium'
            ? 'MEDIUM'
            : effort === 'high'
              ? 'HIGH'
              : params.spec.thinkingLevel;
      cfg.thinkingConfig = {
        includeThoughts: true,
        thinkingBudget: budgetMap[effKey],
      };
    }
    if (useSearch) {
      cfg.tools = [{ googleSearch: {} }];
    }
    return cfg;
  }

  const defaultLevel =
    params.spec.thinkingLevel === 'MINIMAL' && isFlash38
      ? ThinkingLevel.LOW
      : resolveThinkingLevel(params.spec.thinkingLevel);
  const resolvedLevel = effort
    ? resolveEffortToThinkingLevel(effort, params.spec.thinkingLevel)
    : defaultLevel;
  const finalLevel =
    resolvedLevel === ThinkingLevel.MINIMAL && isFlash38
      ? ThinkingLevel.LOW
      : resolvedLevel;

  const cfg: Record<string, unknown> = {
    systemInstruction: params.fullSystemInstruction,
    temperature: params.spec.temperature,
    maxOutputTokens: resolvedMaxOutputTokens,
  };
  if (allowThinking) {
    cfg.thinkingConfig = {
      includeThoughts: true,
      thinkingLevel: finalLevel,
    };
  }
  if (useSearch) {
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
 * Formats chat history strictly for Gemini `contents`:
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

export interface ParsedV2Error {
  message: string;
  httpStatus?: number;
  isTransient503: boolean;
  isRateLimit: boolean;
}

/**
 * Recursively unwraps nested JSON error payloads emitted by @google/genai
 * so users never see raw escaped JSON dumps in the chat UI.
 */
export function extractCleanV2ErrorMessage(err: unknown): ParsedV2Error {
  const raw = err instanceof Error ? err.message : String(err ?? '');
  let httpStatus = Number(
    (err as { status?: number; httpStatus?: number; code?: number })?.status ||
      (err as { status?: number; httpStatus?: number; code?: number })
        ?.httpStatus ||
      0
  );

  let current = raw.trim();
  for (let depth = 0; depth < 3; depth += 1) {
    if (!current.startsWith('{') && !current.startsWith('[')) break;
    try {
      const parsed = JSON.parse(current) as Record<string, unknown>;
      const nestedErr =
        parsed && typeof parsed.error === 'object' && parsed.error !== null
          ? (parsed.error as Record<string, unknown>)
          : parsed;
      const code = Number(nestedErr?.code || nestedErr?.statusCode || 0);
      if (code > 0 && !httpStatus) httpStatus = code;
      if (typeof nestedErr?.message === 'string' && nestedErr.message.trim()) {
        current = nestedErr.message.trim();
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

  const inlineCodeMatch = raw.match(/"code"\s*:\s*(\d{3})/);
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

  const lower = `${raw} ${current}`.toLowerCase();
  const isRateLimit =
    httpStatus === 429 ||
    lower.includes('429') ||
    lower.includes('resource_exhausted') ||
    lower.includes('too many requests') ||
    lower.includes('rate limit');

  const isTransient503 =
    !isRateLimit &&
    (httpStatus === 503 ||
      httpStatus === 502 ||
      httpStatus === 504 ||
      httpStatus === 500 ||
      lower.includes('503') ||
      lower.includes('unavailable') ||
      lower.includes('high demand') ||
      lower.includes('overloaded') ||
      lower.includes('timeout') ||
      lower.includes('temporarily'));

  const cleanText = current
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 220);

  return {
    message: cleanText || 'Service temporarily unavailable.',
    httpStatus: httpStatus || undefined,
    isTransient503,
    isRateLimit,
  };
}

export function isTransientV2UpstreamError(err: unknown): boolean {
  const parsed = extractCleanV2ErrorMessage(err);
  if (parsed.isRateLimit) return false;
  if (parsed.httpStatus === 401 || parsed.httpStatus === 403 || parsed.httpStatus === 400) {
    return false;
  }
  if (parsed.isTransient503) return true;
  if (parsed.httpStatus === 404) return true;
  const lower = parsed.message.toLowerCase();
  return lower.includes('not found') || lower.includes('not supported');
}

const V2_COOLDOWN_MS = 60_000;
const v2ModelCooldownUntil = new Map<string, number>();

function isV2ModelInCooldown(model: string): boolean {
  const until = v2ModelCooldownUntil.get(model);
  if (!until) return false;
  if (Date.now() >= until) {
    v2ModelCooldownUntil.delete(model);
    return false;
  }
  return true;
}

function markV2ModelUnhealthy(model: string): void {
  v2ModelCooldownUntil.set(model, Date.now() + V2_COOLDOWN_MS);
}

function markV2ModelHealthy(model: string): void {
  v2ModelCooldownUntil.delete(model);
}

/**
 * Downward-only single-pass V2 server model chain:
 * - smfta-v5: gemini-3.5-flash-lite -> gemini-3.1-flash-lite -> gemini-flash-lite-latest -> gemini-3-flash-preview
 * - smfta-v2-pro: gemini-3.8-flash -> gemini-3-flash-preview -> gemini-3.1-flash-lite -> gemini-flash-lite-latest
 * - smfta-max: gemini-4-hydrogen -> gemini-3.8-flash -> gemini-3.1-flash-lite -> gemini-3-flash-preview
 */
export function getV2ServerFallbackModels(modelId: V2ModelId): string[] {
  const spec = getV2ModelSpec(modelId);
  const primary = spec.serverGeminiModel;
  const raw =
    modelId === 'smfta-v5'
      ? Array.from(
          new Set([
            primary,
            'gemini-3.1-flash-lite',
            'gemini-flash-lite-latest',
            'gemini-3-flash-preview',
          ])
        )
      : modelId === 'smfta-v2-pro'
        ? Array.from(
            new Set([
              primary,
              'gemini-3-flash-preview',
              'gemini-3.1-flash-lite',
              'gemini-flash-lite-latest',
            ])
          )
        : Array.from(
            new Set([
              primary,
              'gemini-3.8-flash',
              'gemini-3.1-flash-lite',
              'gemini-3-flash-preview',
            ])
          );
  const healthy = raw.filter((m) => !isV2ModelInCooldown(m));
  const cooled = raw.filter((m) => isV2ModelInCooldown(m));
  return [...healthy, ...cooled];
}

export interface V2GenAiStreamClientLike {
  models: {
    generateContentStream: (args: {
      model: string;
      contents: GeminiContentTurn[];
      config: Record<string, unknown>;
    }) => Promise<AsyncIterable<GenerateContentResponse>>;
    list?: () => Promise<AsyncIterable<{ name?: string; displayName?: string; supportedGenerationMethods?: string[] }>>;
  };
}

export interface V2StreamResult {
  ok: boolean;
  modelLabel: string;
  modelUsed?: string;
  fallbackUsed?: boolean;
  fallbackNotice?: string;
  httpStatus?: number;
  errorCode?: 'V2_RATE_LIMITED' | 'V2_AI_UNAVAILABLE' | 'V2_BAD_REQUEST';
  sources?: Array<{ title: string; uri: string }>;
  error?: string;
  truncated?: boolean;
  resumedAfterDrop?: boolean;
}

const V2_FIRST_ANSWER_FAST_MS = 7_500;
const V2_FIRST_ANSWER_FINAL_MS = 28_000;
const V2_CHUNK_IDLE_MS = 18_000;

/**
 * Single-route V2 Gemini streaming handler:
 * - Bounded downward-only fallback (never heavier, never V1)
 * - Per-candidate abortSignal + first-answer & idle watchdogs so thinking never hangs
 * - Tracks thinking vs answer text separately so thinking-only streams retry/fallback
 * - Resumes dropped mid-answer streams from tail without duplicating text
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
  webSearch?: boolean;
  thinkingEnabled?: boolean;
  thinkingEffort?: 'off' | 'low' | 'medium' | 'high';
  emitThinking?: (chunk: string) => void;
  emitDelta: (delta: string) => void;
  genAiClientOverride?: V2GenAiStreamClientLike | null;
  firstAnswerTimeoutMs?: number;
  idleChunkTimeoutMs?: number;
  liveVoiceMode?: boolean;
  maxOutputTokensOverride?: number;
  apiKeyOverride?: string;
}): Promise<V2StreamResult> {
  const spec = getV2ModelSpec(params.modelId);
  const ai =
    params.genAiClientOverride !== undefined
      ? params.genAiClientOverride
      : (getGenAIClient(params.apiKeyOverride) as unknown as V2GenAiStreamClientLike | null);

  if (!ai) {
    return {
      ok: false,
      modelLabel: spec.label,
      errorCode: 'V2_AI_UNAVAILABLE',
      error: `${spec.label} requires the server GEMINI_API_KEY configured in Settings > Secrets.`,
    };
  }

  const baseContents = formatGeminiContents(params.history);
  if (baseContents.length === 0) {
    return {
      ok: false,
      modelLabel: spec.label,
      httpStatus: 422,
      errorCode: 'V2_BAD_REQUEST',
      error: 'Message must contain text or at least one image.',
    };
  }

  const fullSystemInstruction = params.liveVoiceMode
    ? `${params.systemInstruction}\n\n${MASTER_PROFILE_PROMPT_BASELINE}\n\n[V2 LIVE VOICE — ${spec.label}]\nRespond like a crisp, helpful human in 1 to 2 very short spoken sentences (under 45 words total unless the user explicitly asked for details). Mirror the user's language (clear Bengali for Bengali prompts). Never output markdown, code blocks, or <think> tags.`
    : `${params.systemInstruction}\n\n${MASTER_PROFILE_PROMPT_BASELINE}\n\n[V2 SPECIAL ENGINE — ${spec.label}]\n${spec.systemDirective}\nWhen the user requests large writing, detailed information, UI/web designs, builds, or code updates, produce the full, complete, production-ready result with zero truncation or placeholders. Mirror the user's language (default to clear Bengali for Bengali prompts). Never output raw <think> tags inside the answer. Provide only the clean, final answer.`;

  const baseChain = getV2ServerFallbackModels(params.modelId);
  // Section 4: smfta-v5 stays on gemini-3.5-flash-lite with one backoff retry if needed
  const attemptsPlan =
    baseChain.length === 1 ? [baseChain[0]!, baseChain[0]!] : baseChain;

  let lastError: unknown = null;
  let sharedAnswerAccumulator = '';
  let resumedAfterDrop = false;
  const collectedSources: Array<{ title: string; uri: string }> = [];
  const seenUris = new Set<string>();

  for (let i = 0; i < attemptsPlan.length; i += 1) {
    if (params.signal.aborted) {
      return {
        ok: false,
        modelLabel: spec.label,
        error: 'Request cancelled.',
      };
    }

    const candidateModel = attemptsPlan[i]!;
    const hasNextCandidate = i < attemptsPlan.length - 1;
    const isSameModelRetry = i > 0 && attemptsPlan[i - 1] === candidateModel;

    if (isSameModelRetry) {
      await new Promise((r) => setTimeout(r, 350));
      if (params.signal.aborted) {
        return { ok: false, modelLabel: spec.label, error: 'Request cancelled.' };
      }
    }

    const isContinuationPass = sharedAnswerAccumulator.trim().length > 0;
    const turnContents: GeminiContentTurn[] = isContinuationPass
      ? [
          ...baseContents,
          { role: 'model', parts: [{ text: sharedAnswerAccumulator.slice(-3000) }] },
          { role: 'user', parts: [{ text: continuationDirective(sharedAnswerAccumulator) }] },
        ]
      : baseContents;

    let activeTimedOutReason: string | null = null;
    const runCandidate = async (allowTools: boolean) => {
      const candidateCtrl = new AbortController();
      const onParentAbort = () => candidateCtrl.abort(params.signal.reason);
      params.signal.addEventListener('abort', onParentAbort, { once: true });

      const effectiveAllowTools =
        allowTools &&
        (typeof params.webSearch === 'boolean'
          ? params.webSearch
          : Boolean(spec.useSearchGrounding));
      const config = buildV2GenAiRequestConfig({
        modelName: candidateModel,
        spec,
        fullSystemInstruction,
        thinkingEnabled: params.thinkingEnabled,
        thinkingEffort: params.thinkingEffort,
        webSearch: effectiveAllowTools,
        maxOutputTokensOverride: params.maxOutputTokensOverride,
      });
      config.abortSignal = candidateCtrl.signal;

      const firstWaitMs =
        params.firstAnswerTimeoutMs ??
        (hasNextCandidate ? V2_FIRST_ANSWER_FAST_MS : V2_FIRST_ANSWER_FINAL_MS);
      const idleMs = params.idleChunkTimeoutMs ?? V2_CHUNK_IDLE_MS;

      let candidateAnswerText = '';
      let emittedThinking = false;
      let isTruncated = false;
      let timedOutReason: string | null = null;
      let resumeRawBuffer = '';

      const firstAnswerTimer = setTimeout(() => {
        if (!candidateAnswerText && !candidateCtrl.signal.aborted) {
          timedOutReason = `${candidateModel} timed out waiting for answer tokens`;
          activeTimedOutReason = timedOutReason;
          candidateCtrl.abort(new Error(timedOutReason));
        }
      }, firstWaitMs);

      const chunkWatchdog = createIdleWatchdog(() => {
        if (!candidateCtrl.signal.aborted) {
          timedOutReason = `${candidateModel} stream stalled mid-response`;
          activeTimedOutReason = timedOutReason;
          candidateCtrl.abort(new Error(timedOutReason));
        }
      }, idleMs);

      const forwardAnswerChunk = (rawChunk: string) => {
        const cleaned = sanitizeProprietaryOutput(
          stripPrivateChainOfThought(rawChunk)
        );
        if (!cleaned) return;
        if (!candidateAnswerText) {
          clearTimeout(firstAnswerTimer);
        }
        chunkWatchdog.arm();
        candidateAnswerText += cleaned;
        if (isContinuationPass) {
          resumeRawBuffer += cleaned;
          const merged = mergeContinuationText(sharedAnswerAccumulator, resumeRawBuffer);
          if (merged.deltaToAppend) {
            sharedAnswerAccumulator += merged.deltaToAppend;
            params.emitDelta(merged.deltaToAppend);
            resumeRawBuffer = '';
          }
        } else {
          sharedAnswerAccumulator += cleaned;
          params.emitDelta(cleaned);
        }
      };

      try {
        chunkWatchdog.arm();
        let responseStream: AsyncIterable<GenerateContentResponse>;
        try {
          responseStream = await ai.models.generateContentStream({
            model: candidateModel,
            contents: turnContents,
            config,
          });
        } catch (streamErr) {
          if (config.thinkingConfig && !candidateCtrl.signal.aborted && !params.signal.aborted) {
            const fallbackConfig = { ...config };
            delete fallbackConfig.thinkingConfig;
            responseStream = await ai.models.generateContentStream({
              model: candidateModel,
              contents: turnContents,
              config: fallbackConfig,
            });
          } else {
            throw streamErr;
          }
        }

        for await (const chunk of responseStream) {
          if (params.signal.aborted || candidateCtrl.signal.aborted) break;
          chunkWatchdog.arm();
          const c = chunk as GenerateContentResponse;
          const cand0 = c.candidates?.[0];
          const fr = String(cand0?.finishReason || '').toUpperCase();
          if (fr === 'MAX_TOKENS' || fr === 'LENGTH') {
            isTruncated = true;
          }
          const groundingChunks = cand0?.groundingMetadata?.groundingChunks;
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

          const parts = cand0?.content?.parts as
            | Array<{ text?: string; thought?: boolean }>
            | undefined;
          if (Array.isArray(parts) && parts.length > 0) {
            for (const part of parts) {
              const pText = typeof part.text === 'string' ? part.text : '';
              if (!pText) continue;
              if (part.thought === true) {
                if (params.thinkingEnabled !== false && params.thinkingEffort !== 'off') {
                  emittedThinking = true;
                  params.emitThinking?.(pText);
                }
              } else {
                forwardAnswerChunk(pText);
              }
            }
          } else {
            const rawText = c.text || '';
            if (rawText) {
              forwardAnswerChunk(rawText);
            }
          }
        }

        if (isContinuationPass && resumeRawBuffer) {
          const merged = mergeContinuationText(sharedAnswerAccumulator, resumeRawBuffer);
          if (merged.deltaToAppend) {
            sharedAnswerAccumulator += merged.deltaToAppend;
            params.emitDelta(merged.deltaToAppend);
          }
        }

        if (timedOutReason && !candidateAnswerText) {
          throw new Error(timedOutReason);
        }

        return {
          emittedAnswer: candidateAnswerText.trim().length > 0,
          emittedThinking,
          truncated: isTruncated,
          droppedMidStream: Boolean(timedOutReason && candidateAnswerText.length > 0),
        };
      } finally {
        clearTimeout(firstAnswerTimer);
        chunkWatchdog.disarm();
        params.signal.removeEventListener('abort', onParentAbort);
      }
    };

    try {
      let attemptRes: {
        emittedAnswer: boolean;
        emittedThinking: boolean;
        truncated: boolean;
        droppedMidStream: boolean;
      };
      try {
        attemptRes = await runCandidate(true);
      } catch (innerErr) {
        if (params.signal.aborted) throw innerErr;
        if (activeTimedOutReason) throw new Error(activeTimedOutReason);
        const innerParsed = extractCleanV2ErrorMessage(innerErr);
        if (
          spec.useSearchGrounding &&
          (innerParsed.httpStatus === 400 || innerParsed.isRateLimit)
        ) {
          attemptRes = await runCandidate(false);
        } else {
          throw innerErr;
        }
      }

      if (attemptRes.droppedMidStream && sharedAnswerAccumulator.trim() && hasNextCandidate) {
        resumedAfterDrop = true;
        continue;
      }

      if (attemptRes.emittedAnswer || params.signal.aborted) {
        if (attemptRes.emittedAnswer) {
          markV2ModelHealthy(candidateModel);
        }
        const primaryModel = spec.serverGeminiModel;
        const fallbackUsed = candidateModel !== primaryModel;
        return {
          ok: true,
          modelLabel: spec.label,
          modelUsed: candidateModel,
          fallbackUsed,
          fallbackNotice: fallbackUsed
            ? `Switched from ${primaryModel} to ${candidateModel}`
            : undefined,
          sources: collectedSources.length > 0 ? collectedSources : undefined,
          truncated: attemptRes.truncated,
          resumedAfterDrop: isContinuationPass || resumedAfterDrop,
        };
      }

      lastError = new Error(
        attemptRes.emittedThinking
          ? `${candidateModel} produced thinking without final answer text.`
          : `${candidateModel} returned an empty response.`
      );
      if (hasNextCandidate) continue;
    } catch (err) {
      if (params.signal.aborted) {
        return {
          ok: false,
          modelLabel: spec.label,
          error: 'Request cancelled.',
        };
      }

      // If mid-stream error happened AFTER emitting partial answer, mark resumedAfterDrop & continue downward
      if (sharedAnswerAccumulator.trim().length > 0) {
        resumedAfterDrop = true;
        lastError = activeTimedOutReason ? new Error(activeTimedOutReason) : err;
        if (hasNextCandidate) {
          continue;
        }
        return {
          ok: true,
          modelLabel: spec.label,
          modelUsed: candidateModel,
          fallbackUsed: candidateModel !== spec.serverGeminiModel,
          truncated: true,
          resumedAfterDrop: true,
          sources: collectedSources.length > 0 ? collectedSources : undefined,
        };
      }

      lastError = activeTimedOutReason ? new Error(activeTimedOutReason) : err;
      const errParsed = extractCleanV2ErrorMessage(lastError);
      const isTimeoutErr =
        activeTimedOutReason !== null || /timed out|stalled/i.test(errParsed.message);
      if (errParsed.isTransient503 || errParsed.httpStatus === 404 || isTimeoutErr) {
        markV2ModelUnhealthy(candidateModel);
      }
      if (
        hasNextCandidate &&
        (isTimeoutErr ||
          isTransientV2UpstreamError(lastError) ||
          errParsed.isRateLimit ||
          errParsed.httpStatus === 400 ||
          errParsed.httpStatus === 404 ||
          /aborted|abort/i.test(errParsed.message))
      ) {
        continue;
      }
      break;
    }
  }

  const parsed = extractCleanV2ErrorMessage(lastError);
  if (parsed.isRateLimit) {
    return {
      ok: false,
      modelLabel: spec.label,
      httpStatus: 429,
      errorCode: 'V2_RATE_LIMITED',
      error: `${spec.label} এই মুহূর্তে রেট লিমিটে পৌঁছেছে (429)। অনুগ্রহ করে কিছুক্ষণ পর আবার চেষ্টা করুন।`,
    };
  }

  if (parsed.isTransient503) {
    return {
      ok: false,
      modelLabel: spec.label,
      httpStatus: parsed.httpStatus || 503,
      errorCode: 'V2_AI_UNAVAILABLE',
      error: `${spec.label} এই মুহূর্তে অতিরিক্ত চাপের কারণে সাময়িকভাবে সাড়া দিতে পারছে না (${parsed.httpStatus || 503})। অনুগ্রহ করে কয়েক সেকেন্ড পর Retry করুন।`,
    };
  }

  return {
    ok: false,
    modelLabel: spec.label,
    httpStatus: parsed.httpStatus,
    errorCode: 'V2_AI_UNAVAILABLE',
    error: `${spec.label} অনুরোধ সম্পন্ন করতে পারেনি: ${parsed.message}`,
  };
}

export async function listLiveGeminiModels(): Promise<{
  ok: boolean;
  models: string[];
  checkedTargets: Record<string, boolean>;
  error?: string;
}> {
  const apiKey = getV2GeminiApiKey();
  if (!apiKey) {
    return {
      ok: false,
      models: [],
      checkedTargets: {
        'gemini-3.5-flash-lite': false,
        'gemini-3.8-flash': false,
        'gemini-4-hydrogen': false,
        'gemini-embedding-001': false,
        'gemini-nano-banana-2.1': false,
        'gemini-3.8-live': false,
      },
      error: 'GEMINI_API_KEY is missing from server runtime environment.',
    };
  }

  const found = new Set<string>();
  try {
    const ai = getGenAIClient();
    if (ai) {
      const listResp = await ai.models.list();
      for await (const m of listResp) {
        if (m?.name) {
          found.add(String(m.name).replace(/^models\//, ''));
        }
      }
    }
  } catch (sdkErr) {
    // Fall back to direct REST models listing
    try {
      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?pageSize=200`,
        {
          headers: { 'x-goog-api-key': apiKey },
        }
      );
      if (resp.ok) {
        const json = (await resp.json()) as { models?: Array<{ name?: string }> };
        for (const m of json.models || []) {
          if (m?.name) {
            found.add(String(m.name).replace(/^models\//, ''));
          }
        }
      } else {
        const errTxt = await resp.text().catch(() => '');
        return {
          ok: false,
          models: [],
          checkedTargets: {
            'gemini-3.5-flash-lite': false,
            'gemini-3.8-flash': false,
            'gemini-4-hydrogen': false,
            'gemini-embedding-001': false,
            'gemini-nano-banana-2.1': false,
            'gemini-3.8-live': false,
          },
          error: `ListModels HTTP ${resp.status}: ${errTxt.slice(0, 180)}`,
        };
      }
    } catch {
      return {
        ok: false,
        models: [],
        checkedTargets: {
          'gemini-3.5-flash-lite': false,
          'gemini-3.8-flash': false,
          'gemini-4-hydrogen': false,
          'gemini-embedding-001': false,
          'gemini-nano-banana-2.1': false,
          'gemini-3.8-live': false,
        },
        error: sdkErr instanceof Error ? sdkErr.message : String(sdkErr),
      };
    }
  }

  const models = Array.from(found).sort();
  return {
    ok: true,
    models,
    checkedTargets: {
      'gemini-3.5-flash-lite': found.has('gemini-3.5-flash-lite'),
      'gemini-3.8-flash': found.has('gemini-3.8-flash'),
      'gemini-4-hydrogen': found.has('gemini-4-hydrogen'),
      'gemini-embedding-001': found.has('gemini-embedding-001'),
      'gemini-nano-banana-2.1': found.has('gemini-nano-banana-2.1'),
      'gemini-3.8-live': Array.from(found).some((n) => n.includes('3.8-live')),
    },
  };
}

