import crypto from 'node:crypto';
import { ENGINE_DEFAULTS } from './defaults';
import { DurableStorage } from './storage';

/**
 * Section 6: QUOTA LEDGER (L1 - L7)
 */

export interface PeriodWindow {
  startMs: number;
  endMs: number;
}

export interface QuotaLimits {
  rpm: number;
  rpd: number;
  tpm: number;
  tpd: number;
  reset_timezone: string;
  reset_time: string;
}

export interface EffectiveQuotaLimits {
  effectiveRpm: number;
  effectiveRpd: number;
  effectiveTpm: number;
  effectiveTpd: number;
}

/**
 * Section 1: Safety margin — every limit is used at 90 percent, rounded down.
 */
export function computeEffectiveLimits(limits: Pick<QuotaLimits, 'rpm' | 'rpd' | 'tpm' | 'tpd'>): EffectiveQuotaLimits {
  return {
    effectiveRpm: Math.floor(limits.rpm * ENGINE_DEFAULTS.SAFETY_MARGIN_RATIO),
    effectiveRpd: Math.floor(limits.rpd * ENGINE_DEFAULTS.SAFETY_MARGIN_RATIO),
    effectiveTpm: Math.floor(limits.tpm * ENGINE_DEFAULTS.SAFETY_MARGIN_RATIO),
    effectiveTpd: Math.floor(limits.tpd * ENGINE_DEFAULTS.SAFETY_MARGIN_RATIO),
  };
}

function getZonedDateParts(
  epochMs: number,
  timeZone: string
): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
} {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const parts = formatter.formatToParts(new Date(epochMs));
  const map: Record<string, number> = {};
  for (const p of parts) {
    if (p.type !== 'literal') {
      map[p.type] = Number(p.value);
    }
  }
  return {
    year: map.year,
    month: map.month,
    day: map.day,
    hour: map.hour === 24 ? 0 : map.hour,
    minute: map.minute,
    second: map.second,
  };
}

/**
 * Converts a local wall-clock date/time in a given IANA timezone to exact UTC epoch milliseconds.
 */
export function zonedWallTimeToEpochMs(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string
): number {
  const targetUtcGuess = Date.UTC(year, month - 1, day, hour, minute, second, 0);
  let guess = targetUtcGuess;

  // Iterate twice to converge across any DST boundary
  for (let i = 0; i < 3; i++) {
    const actual = getZonedDateParts(guess, timeZone);
    const actualAsUtc = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
      actual.second,
      0
    );
    const diff = targetUtcGuess - actualAsUtc;
    if (diff === 0) break;
    guess += diff;
  }
  return guess;
}

/**
 * L5: Computes the current daily reset period window [startMs, endMs) in the given IANA timezone
 * and HH:MM reset time. Boundary second itself belongs to the NEW period window (nowMs >= boundary).
 */
export function getCurrentPeriodWindow(
  nowMs: number,
  resetTimezone: string = ENGINE_DEFAULTS.UNKNOWN_RESET_TIMEZONE,
  resetTime: string = ENGINE_DEFAULTS.UNKNOWN_RESET_TIME
): PeriodWindow {
  const [resetHour, resetMinute] = resetTime.split(':').map(Number);
  const zonedNow = getZonedDateParts(nowMs, resetTimezone);

  const todayBoundaryMs = zonedWallTimeToEpochMs(
    zonedNow.year,
    zonedNow.month,
    zonedNow.day,
    resetHour,
    resetMinute,
    0,
    resetTimezone
  );

  if (nowMs >= todayBoundaryMs) {
    // Next boundary is tomorrow's calendar date in that timezone
    const tomorrowUtcRef = Date.UTC(zonedNow.year, zonedNow.month - 1, zonedNow.day + 1, 12, 0, 0);
    const tomorrowDate = new Date(tomorrowUtcRef);
    const nextBoundaryMs = zonedWallTimeToEpochMs(
      tomorrowDate.getUTCFullYear(),
      tomorrowDate.getUTCMonth() + 1,
      tomorrowDate.getUTCDate(),
      resetHour,
      resetMinute,
      0,
      resetTimezone
    );
    return { startMs: todayBoundaryMs, endMs: nextBoundaryMs };
  } else {
    // Current window started yesterday in that timezone
    const yesterdayUtcRef = Date.UTC(zonedNow.year, zonedNow.month - 1, zonedNow.day - 1, 12, 0, 0);
    const yesterdayDate = new Date(yesterdayUtcRef);
    const prevBoundaryMs = zonedWallTimeToEpochMs(
      yesterdayDate.getUTCFullYear(),
      yesterdayDate.getUTCMonth() + 1,
      yesterdayDate.getUTCDate(),
      resetHour,
      resetMinute,
      0,
      resetTimezone
    );
    return { startMs: prevBoundaryMs, endMs: todayBoundaryMs };
  }
}

export interface QuotaReservationResult {
  allowed: boolean;
  reservationId?: string;
  reason?: string;
  exhaustedWindow?: 'minute' | 'day';
  resetAtMs?: number;
}

export class QuotaLedger {
  constructor(private readonly storage: DurableStorage) {}

  /**
   * L2 & L3: Atomically checks and reserves 1 request and (estimatedInputTokens + maxOutputTokens)
   * against both the rolling 60-second window and the daily period window.
   */
  public reserveQuota(params: {
    requestId: string;
    providerId: string;
    keyId: string;
    modelId: string;
    estimatedInputTokens: number;
    maxOutputTokens: number;
    limits: QuotaLimits;
  }): QuotaReservationResult {
    const now = this.storage.now();
    const rollingStart = now - 60_000;
    const period = getCurrentPeriodWindow(
      now,
      params.limits.reset_timezone,
      params.limits.reset_time
    );
    const effective = computeEffectiveLimits(params.limits);
    const tokensNeeded = Math.max(
      1,
      Math.ceil(params.estimatedInputTokens) + Math.ceil(params.maxOutputTokens)
    );

    return this.storage.transaction(() => {
      // Check L5 provider reset overrides (which may only make a limit stricter)
      const overrides = this.storage.db
        .prepare(
          `SELECT window_type, strict_remaining_requests, strict_remaining_tokens, reset_at
           FROM ai_provider_reset_overrides
           WHERE provider_id = ? AND key_id = ? AND model_id = ? AND reset_at > ?`
        )
        .all(params.providerId, params.keyId, params.modelId, now) as Array<{
        window_type: string;
        strict_remaining_requests: number | null;
        strict_remaining_tokens: number | null;
        reset_at: number;
      }>;

      for (const ov of overrides) {
        if (
          ov.strict_remaining_requests !== null &&
          ov.strict_remaining_requests < 1
        ) {
          return {
            allowed: false,
            reason: `Strict provider header request limit exhausted (${ov.window_type})`,
            exhaustedWindow: ov.window_type === 'day' ? 'day' : 'minute',
            resetAtMs: ov.reset_at,
          };
        }
        if (
          ov.strict_remaining_tokens !== null &&
          ov.strict_remaining_tokens < tokensNeeded
        ) {
          return {
            allowed: false,
            reason: `Strict provider header token limit exhausted (${ov.window_type})`,
            exhaustedWindow: ov.window_type === 'day' ? 'day' : 'minute',
            resetAtMs: ov.reset_at,
          };
        }
      }

      // Rolling 60-second window usage
      const rollingRow = this.storage.db
        .prepare(
          `SELECT
             COUNT(*) AS req_count,
             COALESCE(SUM(COALESCE(tokens_actual, tokens_reserved)), 0) AS token_sum
           FROM ai_quota_reservations
           WHERE provider_id = ? AND key_id = ? AND model_id = ?
             AND created_at > ? AND created_at <= ?`
        )
        .get(
          params.providerId,
          params.keyId,
          params.modelId,
          rollingStart,
          now
        ) as { req_count: number; token_sum: number };

      if (rollingRow.req_count + 1 > effective.effectiveRpm) {
        return {
          allowed: false,
          reason: `RPM limit reached (${rollingRow.req_count}/${effective.effectiveRpm})`,
          exhaustedWindow: 'minute',
          resetAtMs: now + 60_000,
        };
      }

      if (rollingRow.token_sum + tokensNeeded > effective.effectiveTpm) {
        return {
          allowed: false,
          reason: `TPM limit reached (${rollingRow.token_sum + tokensNeeded}/${effective.effectiveTpm})`,
          exhaustedWindow: 'minute',
          resetAtMs: now + 60_000,
        };
      }

      // Period (daily) window usage [period.startMs, period.endMs)
      const periodRow = this.storage.db
        .prepare(
          `SELECT
             COUNT(*) AS req_count,
             COALESCE(SUM(COALESCE(tokens_actual, tokens_reserved)), 0) AS token_sum
           FROM ai_quota_reservations
           WHERE provider_id = ? AND key_id = ? AND model_id = ?
             AND created_at >= ? AND created_at < ?`
        )
        .get(
          params.providerId,
          params.keyId,
          params.modelId,
          period.startMs,
          period.endMs
        ) as { req_count: number; token_sum: number };

      if (periodRow.req_count + 1 > effective.effectiveRpd) {
        return {
          allowed: false,
          reason: `RPD limit reached (${periodRow.req_count}/${effective.effectiveRpd})`,
          exhaustedWindow: 'day',
          resetAtMs: period.endMs,
        };
      }

      if (periodRow.token_sum + tokensNeeded > effective.effectiveTpd) {
        return {
          allowed: false,
          reason: `TPD limit reached (${periodRow.token_sum + tokensNeeded}/${effective.effectiveTpd})`,
          exhaustedWindow: 'day',
          resetAtMs: period.endMs,
        };
      }

      const reservationId = crypto.randomUUID();
      this.storage.db
        .prepare(
          `INSERT INTO ai_quota_reservations
           (reservation_id, request_id, provider_id, key_id, model_id, created_at, period_window_start, period_window_end, tokens_reserved, tokens_actual, tokens_estimated, finalized)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 1, 0)`
        )
        .run(
          reservationId,
          params.requestId,
          params.providerId,
          params.keyId,
          params.modelId,
          now,
          period.startMs,
          period.endMs,
          tokensNeeded
        );

      // Decrement any active strict overrides
      for (const ov of overrides) {
        this.storage.db
          .prepare(
            `UPDATE ai_provider_reset_overrides
             SET strict_remaining_requests = CASE WHEN strict_remaining_requests IS NOT NULL THEN MAX(0, strict_remaining_requests - 1) ELSE NULL END,
                 strict_remaining_tokens = CASE WHEN strict_remaining_tokens IS NOT NULL THEN MAX(0, strict_remaining_tokens - ?) ELSE NULL END,
                 updated_at = ?
             WHERE provider_id = ? AND key_id = ? AND model_id = ? AND window_type = ?`
          )
          .run(
            tokensNeeded,
            now,
            params.providerId,
            params.keyId,
            params.modelId,
            ov.window_type
          );
      }

      return {
        allowed: true,
        reservationId,
      };
    });
  }

  /**
   * L4: Replaces the token reservation with actual usage after the response.
   * If usage is missing, keeps the estimate and marks it estimated (tokens_estimated = 1).
   */
  public finalizeReservation(params: {
    reservationId: string;
    actualInputTokens?: number | null;
    actualOutputTokens?: number | null;
  }): { totalTokens: number; estimated: boolean } {
    return this.storage.transaction(() => {
      const row = this.storage.db
        .prepare(
          'SELECT tokens_reserved FROM ai_quota_reservations WHERE reservation_id = ?'
        )
        .get(params.reservationId) as { tokens_reserved: number } | undefined;

      if (!row) {
        return { totalTokens: 0, estimated: true };
      }

      const hasActual =
        typeof params.actualInputTokens === 'number' &&
        params.actualInputTokens >= 0 &&
        typeof params.actualOutputTokens === 'number' &&
        params.actualOutputTokens >= 0;

      if (hasActual) {
        const actualTotal =
          Math.ceil(params.actualInputTokens!) +
          Math.ceil(params.actualOutputTokens!);
        this.storage.db
          .prepare(
            `UPDATE ai_quota_reservations
             SET tokens_actual = ?, tokens_estimated = 0, finalized = 1
             WHERE reservation_id = ?`
          )
          .run(actualTotal, params.reservationId);
        return { totalTokens: actualTotal, estimated: false };
      } else {
        this.storage.db
          .prepare(
            `UPDATE ai_quota_reservations
             SET tokens_actual = NULL, tokens_estimated = 1, finalized = 1
             WHERE reservation_id = ?`
          )
          .run(params.reservationId);
        return { totalTokens: row.tokens_reserved, estimated: true };
      }
    });
  }

  /**
   * L5: Applies a provider reset/remaining header. May only make a limit STRICTER, never looser.
   */
  public applyProviderHeaderLimits(params: {
    providerId: string;
    keyId: string;
    modelId: string;
    windowType: 'minute' | 'day';
    headerRemainingRequests?: number;
    headerRemainingTokens?: number;
    headerResetAtMs?: number;
    limits: QuotaLimits;
  }): void {
    const now = this.storage.now();
    const status = this.getRemainingQuota(
      params.providerId,
      params.keyId,
      params.modelId,
      params.limits
    );

    const currentRemReq =
      params.windowType === 'minute'
        ? status.remainingRpm
        : status.remainingRpd;
    const currentRemTok =
      params.windowType === 'minute'
        ? status.remainingTpm
        : status.remainingTpd;
    const defaultResetAt =
      params.windowType === 'minute' ? now + 60_000 : status.periodEndMs;

    // L5: Only tighten if header reports FEWER remaining requests/tokens or a LATER reset time
    const stricterReq =
      typeof params.headerRemainingRequests === 'number' &&
      params.headerRemainingRequests < currentRemReq
        ? Math.max(0, Math.floor(params.headerRemainingRequests))
        : null;

    const stricterTok =
      typeof params.headerRemainingTokens === 'number' &&
      params.headerRemainingTokens < currentRemTok
        ? Math.max(0, Math.floor(params.headerRemainingTokens))
        : null;

    const stricterResetAt =
      typeof params.headerResetAtMs === 'number' &&
      params.headerResetAtMs > defaultResetAt
        ? params.headerResetAtMs
        : defaultResetAt;

    if (stricterReq === null && stricterTok === null) {
      return;
    }

    this.storage.transaction(() => {
      this.storage.db
        .prepare(
          `INSERT INTO ai_provider_reset_overrides
           (provider_id, key_id, model_id, window_type, strict_remaining_requests, strict_remaining_tokens, reset_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(provider_id, key_id, model_id, window_type)
           DO UPDATE SET
             strict_remaining_requests = CASE
               WHEN excluded.strict_remaining_requests IS NOT NULL AND (ai_provider_reset_overrides.strict_remaining_requests IS NULL OR excluded.strict_remaining_requests < ai_provider_reset_overrides.strict_remaining_requests)
               THEN excluded.strict_remaining_requests
               ELSE ai_provider_reset_overrides.strict_remaining_requests
             END,
             strict_remaining_tokens = CASE
               WHEN excluded.strict_remaining_tokens IS NOT NULL AND (ai_provider_reset_overrides.strict_remaining_tokens IS NULL OR excluded.strict_remaining_tokens < ai_provider_reset_overrides.strict_remaining_tokens)
               THEN excluded.strict_remaining_tokens
               ELSE ai_provider_reset_overrides.strict_remaining_tokens
             END,
             reset_at = MAX(ai_provider_reset_overrides.reset_at, excluded.reset_at),
             updated_at = excluded.updated_at`
        )
        .run(
          params.providerId,
          params.keyId,
          params.modelId,
          params.windowType,
          stricterReq,
          stricterTok,
          stricterResetAt,
          now
        );
    });
  }

  /**
   * Returns remaining effective quota for health reporting (H1) and inspection.
   */
  public getRemainingQuota(
    providerId: string,
    keyId: string,
    modelId: string,
    limits: QuotaLimits
  ): {
    remainingRpm: number;
    remainingRpd: number;
    remainingTpm: number;
    remainingTpd: number;
    periodStartMs: number;
    periodEndMs: number;
  } {
    const now = this.storage.now();
    const rollingStart = now - 60_000;
    const period = getCurrentPeriodWindow(
      now,
      limits.reset_timezone,
      limits.reset_time
    );
    const effective = computeEffectiveLimits(limits);

    const rollingRow = this.storage.db
      .prepare(
        `SELECT
           COUNT(*) AS req_count,
           COALESCE(SUM(COALESCE(tokens_actual, tokens_reserved)), 0) AS token_sum
         FROM ai_quota_reservations
         WHERE provider_id = ? AND key_id = ? AND model_id = ?
           AND created_at > ? AND created_at <= ?`
      )
      .get(providerId, keyId, modelId, rollingStart, now) as {
      req_count: number;
      token_sum: number;
    };

    const periodRow = this.storage.db
      .prepare(
        `SELECT
           COUNT(*) AS req_count,
           COALESCE(SUM(COALESCE(tokens_actual, tokens_reserved)), 0) AS token_sum
         FROM ai_quota_reservations
         WHERE provider_id = ? AND key_id = ? AND model_id = ?
           AND created_at >= ? AND created_at < ?`
      )
      .get(providerId, keyId, modelId, period.startMs, period.endMs) as {
      req_count: number;
      token_sum: number;
    };

    let remRpm = Math.max(0, effective.effectiveRpm - rollingRow.req_count);
    let remTpm = Math.max(0, effective.effectiveTpm - rollingRow.token_sum);
    let remRpd = Math.max(0, effective.effectiveRpd - periodRow.req_count);
    let remTpd = Math.max(0, effective.effectiveTpd - periodRow.token_sum);

    const overrides = this.storage.db
      .prepare(
        `SELECT window_type, strict_remaining_requests, strict_remaining_tokens
         FROM ai_provider_reset_overrides
         WHERE provider_id = ? AND key_id = ? AND model_id = ? AND reset_at > ?`
      )
      .all(providerId, keyId, modelId, now) as Array<{
      window_type: string;
      strict_remaining_requests: number | null;
      strict_remaining_tokens: number | null;
    }>;

    for (const ov of overrides) {
      if (ov.window_type === 'minute') {
        if (ov.strict_remaining_requests !== null) {
          remRpm = Math.min(remRpm, ov.strict_remaining_requests);
        }
        if (ov.strict_remaining_tokens !== null) {
          remTpm = Math.min(remTpm, ov.strict_remaining_tokens);
        }
      } else if (ov.window_type === 'day') {
        if (ov.strict_remaining_requests !== null) {
          remRpd = Math.min(remRpd, ov.strict_remaining_requests);
        }
        if (ov.strict_remaining_tokens !== null) {
          remTpd = Math.min(remTpd, ov.strict_remaining_tokens);
        }
      }
    }

    return {
      remainingRpm: remRpm,
      remainingRpd: remRpd,
      remainingTpm: remTpm,
      remainingTpd: remTpd,
      periodStartMs: period.startMs,
      periodEndMs: period.endMs,
    };
  }
}
