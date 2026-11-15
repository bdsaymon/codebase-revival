/**
 * V2 – Special (Firebase AI System) Model Catalog, Capabilities, and
 * Saudi Arabia (Asia/Riyadh, UTC+3) Daily Quota Engine.
 *
 * Keeps V1 – Natural (SMFTA Flash, SMFTA Pro, SMFTA Ultra) 100% untouched
 * while providing independent routing, capabilities, and daily quota logic
 * for V2 – Special (SMFTA V5, SMFTA Pro, SMFTA Max).
 */

import { FILE_ARTIFACT_SYSTEM_DIRECTIVE } from './fileArtifacts';
import { buildCreatorAndSecurityDirective } from './creatorIdentity';

export type V2ModelId = 'smfta-v5' | 'smfta-v2-pro' | 'smfta-max';

export interface V2ModelSpec {
  id: V2ModelId;
  /** UI display name (never exposes internal Google/Gemini model IDs). */
  label: string;
  badge: string;
  desc: string;
  defaultDailyLimit: number;
  /** Direct server-side @google/genai lightweight model ID. */
  serverGeminiModel: string;
  /** Direct client-side Firebase AI Logic (firebase/ai) lightweight model ID. */
  firebaseAiModel: string;
  temperature: number;
  thinkingLevel: 'MINIMAL' | 'LOW' | 'MEDIUM' | 'HIGH';
  maxOutputTokens: number;
  contextWindow: number;
  useSearchGrounding: boolean;
  capabilities: string[];
  systemDirective: string;
}

export const V2_SPECIAL_MODELS: V2ModelSpec[] = [
  {
    id: 'smfta-v5',
    label: 'SMFTA V5',
    badge: 'Fast · Everyday · Voice',
    desc: 'Fast everyday Q&A, smart chat & bilingual voice',
    defaultDailyLimit: 100,
    serverGeminiModel: 'gemini-3.5-flash-lite',
    firebaseAiModel: 'gemini-3.5-flash-lite',
    temperature: 0.7,
    thinkingLevel: 'MINIMAL',
    maxOutputTokens: 8192,
    contextWindow: 256_000,
    useSearchGrounding: false,
    capabilities: [
      'Fast Everyday Responses',
      'Bilingual Voice Interaction',
      'Firestore Memory Sync',
      'Real-Time Streaming',
    ],
    systemDirective:
      `You are operating as SMFTA V5 (V2 Special Fast Engine). Provide clear, helpful, complete answers in the user's language. When asked for detailed information, long writing, UI/web design, or code updates, provide complete, full-length results without truncating.\n\n${buildCreatorAndSecurityDirective('SMFTA V5')}\n\n${FILE_ARTIFACT_SYSTEM_DIRECTIVE}`,
  },
  {
    id: 'smfta-v2-pro',
    label: 'SMFTA Pro',
    badge: 'Coding · Structured',
    desc: 'Coding, architecture & structured problem-solving',
    defaultDailyLimit: 40,
    serverGeminiModel: 'gemini-3.8-flash',
    firebaseAiModel: 'gemini-3.8-flash',
    temperature: 0.4,
    thinkingLevel: 'LOW',
    maxOutputTokens: 16384,
    contextWindow: 512_000,
    useSearchGrounding: false,
    capabilities: [
      'Programming & Architecture',
      'Structured Technical Output',
      'Problem Solving',
      'Firestore Memory Sync',
    ],
    systemDirective:
      `You are operating as SMFTA Pro (V2 Special Technical Engine). Focus on programming accuracy, full UI/web design, complete code updates without placeholders, structured explanations, and clean production-ready implementations.\n\n${buildCreatorAndSecurityDirective('SMFTA Pro')}\n\n${FILE_ARTIFACT_SYSTEM_DIRECTIVE}`,
  },
  {
    id: 'smfta-max',
    label: 'SMFTA Max',
    badge: 'Deep Analysis · Search',
    desc: 'Deep multi-step analysis & search-grounded answers',
    defaultDailyLimit: 15,
    serverGeminiModel: 'gemini-4-hydrogen',
    firebaseAiModel: 'gemini-4-hydrogen',
    temperature: 0.2,
    thinkingLevel: 'MEDIUM',
    maxOutputTokens: 32768,
    contextWindow: 1_000_000,
    useSearchGrounding: true,
    capabilities: [
      'Deep Multi-Step Analysis',
      'Search-Grounded Answers',
      'Complex Task Decomposition',
      'Firestore Memory Sync',
    ],
    systemDirective:
      `You are operating as SMFTA Max (V2 Special Deep-Analysis Engine). Prioritize comprehensive analytical depth, complete large-scale designs and code implementations, extensive writing, grounded factual accuracy, and well-structured detail for demanding tasks.\n\n${buildCreatorAndSecurityDirective('SMFTA Max')}\n\n${FILE_ARTIFACT_SYSTEM_DIRECTIVE}`,
  },
];

export const V2_MODEL_IDS: V2ModelId[] = V2_SPECIAL_MODELS.map((m) => m.id);

export const DEFAULT_V2_LIMITS: Record<V2ModelId, number> = {
  'smfta-v5': 100,
  'smfta-v2-pro': 40,
  'smfta-max': 15,
};

export const V2_WARNING_THRESHOLD_RATIO = 0.8; // 80% warning threshold
export const DEFAULT_TESTING_ALLOWANCE = 500;
export const ADMIN_EMAILS = ['msftashop@gmail.com'];

export function isV2ModelId(model?: string | null): model is V2ModelId {
  const m = (model || '').trim().toLowerCase();
  return m === 'smfta-v5' || m === 'smfta-v2-pro' || m === 'smfta-max';
}

export function getV2ModelSpec(model?: string | null): V2ModelSpec {
  const m = (model || '').trim().toLowerCase();
  return (
    V2_SPECIAL_MODELS.find((spec) => spec.id === m) || V2_SPECIAL_MODELS[0]
  );
}

export function getV2ModelLabel(model?: string | null): string {
  return getV2ModelSpec(model).label;
}

export const V2_FLASH_FIRST_ORDER: Record<V2ModelId, number> = {
  'smfta-v5': 0,
  'smfta-v2-pro': 1,
  'smfta-max': 2,
};

export function sortV2ModelsFlashFirst<T extends { id: string }>(models: readonly T[]): T[] {
  return [...models].sort(
    (a, b) =>
      (V2_FLASH_FIRST_ORDER[a.id as V2ModelId] ?? 9) -
      (V2_FLASH_FIRST_ORDER[b.id as V2ModelId] ?? 9)
  );
}

/**
 * Returns the current date string (YYYY-MM-DD) in Saudi Arabia time (Asia/Riyadh, UTC+3).
 * Asia/Riyadh is permanently UTC+03:00 with no Daylight Saving Time.
 */
export function getRiyadhDateKey(nowMs: number = Date.now()): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Riyadh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const formatted = formatter.format(new Date(nowMs));
    if (/^\d{4}-\d{2}-\d{2}$/.test(formatted)) {
      return formatted;
    }
  } catch {
    // Fallback to exact UTC+3 offset math
  }
  const riyadhOffsetMs = 3 * 60 * 60 * 1000;
  const riyadhDate = new Date(nowMs + riyadhOffsetMs);
  const y = riyadhDate.getUTCFullYear();
  const m = String(riyadhDate.getUTCMonth() + 1).padStart(2, '0');
  const d = String(riyadhDate.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Computes the next daily quota reset timestamp at 00:00:00 Asia/Riyadh (21:00:00 UTC).
 */
export function getNextRiyadhResetInfo(nowMs: number = Date.now()): {
  dateRiyadh: string;
  nextResetIso: string;
  msUntilReset: number;
  hoursUntilReset: number;
  minutesUntilReset: number;
  label: string;
} {
  const riyadhOffsetMs = 3 * 60 * 60 * 1000;
  const riyadhNow = new Date(nowMs + riyadhOffsetMs);
  const nextRiyadhMidnightUtcMs =
    Date.UTC(
      riyadhNow.getUTCFullYear(),
      riyadhNow.getUTCMonth(),
      riyadhNow.getUTCDate() + 1,
      0,
      0,
      0,
      0
    ) - riyadhOffsetMs;

  const msUntilReset = Math.max(0, nextRiyadhMidnightUtcMs - nowMs);
  const totalMinutes = Math.ceil(msUntilReset / 60_000);
  const hoursUntilReset = Math.floor(totalMinutes / 60);
  const minutesUntilReset = totalMinutes % 60;

  return {
    dateRiyadh: getRiyadhDateKey(nowMs),
    nextResetIso: new Date(nextRiyadhMidnightUtcMs).toISOString(),
    msUntilReset,
    hoursUntilReset,
    minutesUntilReset,
    label: `${hoursUntilReset}h ${minutesUntilReset}m (00:00 Asia/Riyadh)`,
  };
}

export interface V2QuotaConfig {
  v5Limit: number;
  proLimit: number;
  maxLimit: number;
  testingAllowance: number;
  testingBypassEnabled: boolean;
}

export const DEFAULT_V2_QUOTA_CONFIG: V2QuotaConfig = {
  v5Limit: DEFAULT_V2_LIMITS['smfta-v5'],
  proLimit: DEFAULT_V2_LIMITS['smfta-v2-pro'],
  maxLimit: DEFAULT_V2_LIMITS['smfta-max'],
  testingAllowance: DEFAULT_TESTING_ALLOWANCE,
  testingBypassEnabled: false,
};

export function sanitizeV2QuotaConfig(
  raw?: Partial<V2QuotaConfig> | null
): V2QuotaConfig {
  const clamp = (val: unknown, fallback: number, min = 1, max = 10_000) => {
    const n = Number(val);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, Math.round(n)));
  };
  return {
    v5Limit: clamp(raw?.v5Limit, DEFAULT_V2_LIMITS['smfta-v5']),
    proLimit: clamp(raw?.proLimit, DEFAULT_V2_LIMITS['smfta-v2-pro']),
    maxLimit: clamp(raw?.maxLimit, DEFAULT_V2_LIMITS['smfta-max']),
    testingAllowance: clamp(
      raw?.testingAllowance,
      DEFAULT_TESTING_ALLOWANCE,
      0,
      10_000
    ),
    testingBypassEnabled: Boolean(raw?.testingBypassEnabled),
  };
}

export function getConfiguredLimitForModel(
  modelId: V2ModelId,
  config?: Partial<V2QuotaConfig> | null
): number {
  const clean = sanitizeV2QuotaConfig(config);
  if (modelId === 'smfta-v5') return clean.v5Limit;
  if (modelId === 'smfta-v2-pro') return clean.proLimit;
  return clean.maxLimit;
}

export interface V2ModelQuotaStatus {
  modelId: V2ModelId;
  label: string;
  dateRiyadh: string;
  used: number;
  limit: number;
  remaining: number;
  percentUsed: number;
  warningThreshold: number;
  isWarning: boolean;
  isBlocked: boolean;
  isTestingBypass: boolean;
  isUnlimited?: boolean;
  testingUsed: number;
  testingAllowance: number;
  testingRemaining: number;
  statusText: string;
  warningMessage: string | null;
  blockedMessage: string | null;
}

export function evaluateV2ModelQuota(params: {
  modelId: V2ModelId;
  usedCount: number;
  testingUsedCount?: number;
  config?: Partial<V2QuotaConfig> | null;
  isAuthorizedTester?: boolean;
  nowMs?: number;
}): V2ModelQuotaStatus {
  const spec = getV2ModelSpec(params.modelId);
  const cleanCfg = sanitizeV2QuotaConfig(params.config);
  const limit = getConfiguredLimitForModel(params.modelId, cleanCfg);
  const used = Math.max(0, Math.floor(Number(params.usedCount) || 0));
  const testingUsed = Math.max(
    0,
    Math.floor(Number(params.testingUsedCount) || 0)
  );
  const dateRiyadh = getRiyadhDateKey(params.nowMs);
  const resetInfo = getNextRiyadhResetInfo(params.nowMs);

  const isUnlimitedAdmin = Boolean(params.isAuthorizedTester);
  const isTestingBypass =
    isUnlimitedAdmin ||
    Boolean(params.isAuthorizedTester && cleanCfg.testingBypassEnabled);
  const testingAllowance = isUnlimitedAdmin ? 0 : cleanCfg.testingAllowance;
  const testingRemaining = isUnlimitedAdmin
    ? 999_999
    : Math.max(0, testingAllowance - testingUsed);

  const remaining = isUnlimitedAdmin ? 999_999 : Math.max(0, limit - used);
  const percentUsed = isUnlimitedAdmin
    ? 0
    : limit > 0
      ? Math.min(100, Math.round((used / limit) * 100))
      : 100;
  const warningThreshold = Math.ceil(limit * V2_WARNING_THRESHOLD_RATIO);

  const isWarning =
    !isUnlimitedAdmin && !isTestingBypass && used >= warningThreshold && used < limit;
  const isBlocked = isUnlimitedAdmin
    ? false
    : isTestingBypass
      ? testingAllowance > 0 && testingUsed >= testingAllowance
      : used >= limit;

  let warningMessage: string | null = null;
  if (isWarning) {
    warningMessage = `⚠️ ${spec.label} daily usage is at ${percentUsed}% (${used}/${limit} used, ${remaining} left). Resets in ${resetInfo.label}.`;
  }

  let blockedMessage: string | null = null;
  if (isBlocked) {
    blockedMessage = isTestingBypass
      ? `⛔ Testing allowance reached for ${spec.label} (${testingUsed}/${testingAllowance}). Increase testing allowance or wait for reset in ${resetInfo.label}.`
      : `⛔ Daily limit reached for ${spec.label} (${used}/${limit} requests used today). Quota resets at midnight Saudi Arabia time in ${resetInfo.label}.`;
  }

  const statusText = isUnlimitedAdmin
    ? 'Admin · Unlimited (Zero daily limit)'
    : isTestingBypass
      ? `Testing Mode · ${testingRemaining}/${testingAllowance} test reqs left`
      : `${remaining}/${limit} left today`;

  return {
    modelId: params.modelId,
    label: spec.label,
    dateRiyadh,
    used,
    limit,
    remaining,
    percentUsed,
    warningThreshold,
    isWarning,
    isBlocked,
    isTestingBypass,
    isUnlimited: isUnlimitedAdmin,
    testingUsed,
    testingAllowance,
    testingRemaining,
    statusText,
    warningMessage,
    blockedMessage,
  };
}

export function buildFirestoreUsageDocId(
  dateRiyadh: string,
  modelId: V2ModelId
): string {
  const safeDate = dateRiyadh.replace(/[^0-9-]/g, '').slice(0, 10);
  return `${safeDate}_${modelId}`;
}
