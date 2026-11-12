/**
 * V2 – Special (Firebase AI System) Model Catalog, Capabilities, and
 * Saudi Arabia (Asia/Riyadh, UTC+3) Daily Quota Engine.
 *
 * Keeps V1 – Natural (SMFTA Flash, SMFTA Pro, SMFTA Ultra) 100% untouched
 * while providing independent routing, capabilities, and daily quota logic
 * for V2 – Special (SMFTA V5, SMFTA Pro, SMFTA Max).
 */

export type V2ModelId = 'smfta-v5' | 'smfta-v2-pro' | 'smfta-max';

export interface V2ModelSpec {
  id: V2ModelId;
  /** UI display name (never exposes internal Google/Gemini model IDs). */
  label: string;
  badge: string;
  desc: string;
  defaultDailyLimit: number;
  /** Server-side @google/genai model alias. */
  serverGeminiModel: string;
  /** Client-side Firebase AI Logic (firebase/ai) model ID. */
  firebaseAiModel: string;
  thinkingLevel: 'LOW' | 'HIGH' | 'XHIGH';
  maxOutputTokens: number;
  contextWindow: number;
  capabilities: string[];
  systemDirective: string;
}

export const V2_SPECIAL_MODELS: V2ModelSpec[] = [
  {
    id: 'smfta-v5',
    label: 'SMFTA V5',
    badge: 'Fast · Everyday',
    desc: 'Prioritizes speed, low latency, and everyday tasks',
    defaultDailyLimit: 100,
    serverGeminiModel: 'gemini-4-hydrogen',
    firebaseAiModel: 'gemini-2.5-flash-lite',
    thinkingLevel: 'LOW',
    maxOutputTokens: 2048,
    contextWindow: 256_000,
    capabilities: [
      'High-Speed Everyday Tasks',
      'Real-Time Streaming',
      'Firestore Memory Sync',
    ],
    systemDirective:
      'You are operating as SMFTA V5 (V2 Special Fast Engine). Prioritize speed, crisp clarity, and immediate practical answers for everyday tasks. Keep explanations concise and action-oriented unless asked for length.',
  },
  {
    id: 'smfta-v2-pro',
    label: 'SMFTA Pro',
    badge: 'Reasoning · Complex',
    desc: 'Handles advanced reasoning, coding, and complex tasks',
    defaultDailyLimit: 40,
    serverGeminiModel: 'gemini-4-hydrogen',
    firebaseAiModel: 'gemini-2.5-flash',
    thinkingLevel: 'HIGH',
    maxOutputTokens: 4096,
    contextWindow: 512_000,
    capabilities: [
      'Advanced Multi-Step Reasoning',
      'Complex Coding & Architecture',
      'Firestore Memory Sync',
      'Real-Time Streaming',
    ],
    systemDirective:
      'You are operating as SMFTA Pro (V2 Special Reasoning Engine). Handle advanced reasoning, structured problem-solving, and complex engineering tasks with rigorous accuracy, clear trade-offs, and complete working code.',
  },
  {
    id: 'smfta-max',
    label: 'SMFTA Max',
    badge: 'Deep Analysis · Max',
    desc: 'Prioritizes deeper analysis and demanding multi-step tasks',
    defaultDailyLimit: 15,
    serverGeminiModel: 'gemini-4-hydrogen',
    firebaseAiModel: 'gemini-2.5-pro',
    thinkingLevel: 'XHIGH',
    maxOutputTokens: 8192,
    contextWindow: 1_000_000,
    capabilities: [
      'Deepest Analytical Synthesis',
      'Demanding Research & Verification',
      'Firestore Memory Sync',
      'Real-Time Streaming',
    ],
    systemDirective:
      'You are operating as SMFTA Max (V2 Special Deep-Analysis Engine). Prioritize exhaustive analysis, edge-case verification, first-principles reasoning, and comprehensive depth for the most demanding tasks.',
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

  const isTestingBypass = Boolean(
    params.isAuthorizedTester && cleanCfg.testingBypassEnabled
  );
  const testingAllowance = cleanCfg.testingAllowance;
  const testingRemaining = Math.max(0, testingAllowance - testingUsed);

  const remaining = Math.max(0, limit - used);
  const percentUsed =
    limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 100;
  const warningThreshold = Math.ceil(limit * V2_WARNING_THRESHOLD_RATIO);

  const isWarning = !isTestingBypass && used >= warningThreshold && used < limit;
  const isBlocked = isTestingBypass
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

  const statusText = isTestingBypass
    ? `Testing Mode · ${testingRemaining}/${testingAllowance} test reqs left (Normal quota ${used}/${limit} untouched)`
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
