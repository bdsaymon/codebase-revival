import type { TelemetryRequestLog } from '../types';

export const TELEMETRY_LOG_KEY = 'smfta_request_logs';
const MAX_TELEMETRY_LOGS = 80;

/**
 * Strips API keys, Bearer tokens, and auth parameters before logging.
 */
export function redactSecretStrings(text: string): string {
  return String(text || '')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED]')
    .replace(/(sk-[A-Za-z0-9_-]{8,}|AIza[A-Za-z0-9_-]{12,}|gsk_[A-Za-z0-9_-]{10,}|ghp_[A-Za-z0-9_-]{10,})/g, '[REDACTED_KEY]');
}

export function loadTelemetryLogs(): TelemetryRequestLog[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(TELEMETRY_LOG_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as TelemetryRequestLog[]) : [];
  } catch {
    return [];
  }
}

export function appendTelemetryLog(
  entry: Omit<TelemetryRequestLog, 'id' | 'timestamp'>,
  optOut = false
): TelemetryRequestLog[] {
  const existing = loadTelemetryLogs();
  if (optOut) return existing;
  const nextEntry: TelemetryRequestLog = {
    ...entry,
    errorMessage: entry.errorMessage ? redactSecretStrings(entry.errorMessage).slice(0, 240) : undefined,
    id: `req-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: Date.now(),
  };
  const updated = [nextEntry, ...existing].slice(0, MAX_TELEMETRY_LOGS);
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(TELEMETRY_LOG_KEY, JSON.stringify(updated));
    }
  } catch {
    // ignore storage quota errors
  }
  return updated;
}

export function clearTelemetryLogs(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(TELEMETRY_LOG_KEY);
  } catch {
    // ignore
  }
}

export interface AggregatedTelemetryStats {
  totalRequests: number;
  successCount: number;
  errorCount: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  avgLatencyMs: number | null;
}

export function aggregateTelemetryStats(logs: TelemetryRequestLog[]): AggregatedTelemetryStats {
  if (!logs || logs.length === 0) {
    return {
      totalRequests: 0,
      successCount: 0,
      errorCount: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      avgLatencyMs: null,
    };
  }
  let successCount = 0;
  let errorCount = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let latencySum = 0;
  let latencyCount = 0;

  for (const log of logs) {
    if (log.status === 'success') successCount += 1;
    else if (log.status === 'error') errorCount += 1;
    if (typeof log.inputTokens === 'number' && Number.isFinite(log.inputTokens)) {
      totalInputTokens += log.inputTokens;
    }
    if (typeof log.outputTokens === 'number' && Number.isFinite(log.outputTokens)) {
      totalOutputTokens += log.outputTokens;
    }
    if (typeof log.latencyMs === 'number' && Number.isFinite(log.latencyMs) && log.latencyMs > 0) {
      latencySum += log.latencyMs;
      latencyCount += 1;
    }
  }

  return {
    totalRequests: logs.length,
    successCount,
    errorCount,
    totalInputTokens,
    totalOutputTokens,
    avgLatencyMs: latencyCount > 0 ? Math.round(latencySum / latencyCount) : null,
  };
}
