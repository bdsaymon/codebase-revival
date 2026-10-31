import { ENGINE_DEFAULTS } from './defaults';
import { getCurrentPeriodWindow } from './ledger';
import {
  CasConflictError,
  DurableStorage,
  mapKeyStateToSimplified,
  type Clock,
  type SimplifiedKeyStatus,
} from './storage';

/**
 * Section 4: KEY POOL STATES (K1 - K8) & Phase 2.5 ephemeral key pool
 * States per (provider_id, key_id):
 * ACTIVE (usable), COOLDOWN (rate_limited), QUOTA_EXHAUSTED (no_credit),
 * CIRCUIT_OPEN (broken), INVALID (broken), DISABLED (broken)
 */

export type KeyStateName =
  | 'ACTIVE'
  | 'COOLDOWN'
  | 'QUOTA_EXHAUSTED'
  | 'CIRCUIT_OPEN'
  | 'INVALID'
  | 'DISABLED';

export type KeyPoolState = KeyStateName;

export interface KeyStateRecord {
  provider_id: string;
  key_id: string;
  state: KeyStateName;
  simplified_status: SimplifiedKeyStatus;
  state_until: number | null;
  reason: string;
  consecutive_transient_failures: number;
  first_transient_failure_at: number | null;
  circuit_open_count: number;
  half_open_probe_in_flight: number;
  rate_limit_timestamps: number[];
  last_used_at: number;
  last_error_class: string | null;
  updated_at: number;
  version: number;
}

export type KeyPoolRecord = KeyStateRecord;

interface RawKeyStateRow {
  provider_id: string;
  key_id: string;
  state: KeyStateName;
  state_until: number | null;
  reason: string;
  consecutive_transient_failures: number;
  first_transient_failure_at: number | null;
  circuit_open_count: number;
  half_open_probe_in_flight: number;
  rate_limit_timestamps_json: string;
  last_used_at: number;
  last_error_class: string | null;
  updated_at: number;
  version: number;
}

function parseRow(row: RawKeyStateRow): KeyStateRecord {
  let timestamps: number[] = [];
  try {
    const parsed = JSON.parse(row.rate_limit_timestamps_json || '[]');
    if (Array.isArray(parsed)) {
      timestamps = parsed.filter((n): n is number => typeof n === 'number');
    }
  } catch {
    timestamps = [];
  }
  return {
    provider_id: row.provider_id,
    key_id: row.key_id,
    state: row.state,
    simplified_status: mapKeyStateToSimplified(row.state),
    state_until: row.state_until,
    reason: row.reason,
    consecutive_transient_failures: row.consecutive_transient_failures,
    first_transient_failure_at: row.first_transient_failure_at,
    circuit_open_count: row.circuit_open_count,
    half_open_probe_in_flight: row.half_open_probe_in_flight,
    rate_limit_timestamps: timestamps,
    last_used_at: row.last_used_at,
    last_error_class: row.last_error_class,
    updated_at: row.updated_at,
    version: row.version,
  };
}

export class KeyPoolManager {
  private readonly storage: DurableStorage;

  constructor(storage?: DurableStorage | null, options?: { clock?: Clock }) {
    this.storage =
      storage || new DurableStorage({ dbPath: ':memory:', clock: options?.clock });
  }

  /**
   * Phase 2.5: Creates an ephemeral in-memory KeyPoolManager for user-supplied keys
   * that is discarded when the request ends and never written to disk.
   */
  public static createEphemeral(
    clock?: Clock | (() => number)
  ): KeyPoolManager {
    const normalizedClock: Clock | undefined =
      typeof clock === 'function'
        ? { now: clock }
        : clock;
    return new KeyPoolManager(
      new DurableStorage({ dbPath: ':memory:', clock: normalizedClock })
    );
  }

  public ensureKeyInitialized(providerId: string, keyId: string): KeyStateRecord {
    const now = this.storage.now();
    return this.storage.transaction(() => {
      const existing = this.storage.db
        .prepare(
          'SELECT * FROM ai_key_states WHERE provider_id = ? AND key_id = ?'
        )
        .get(providerId, keyId) as RawKeyStateRow | undefined;

      if (existing) {
        return this.refreshExpiredStateInTx(parseRow(existing));
      }

      this.storage.db
        .prepare(
          `INSERT INTO ai_key_states
           (provider_id, key_id, state, state_until, reason, consecutive_transient_failures,
            first_transient_failure_at, circuit_open_count, half_open_probe_in_flight,
            rate_limit_timestamps_json, last_used_at, last_error_class, updated_at, version)
           VALUES (?, ?, 'ACTIVE', NULL, 'initialized', 0, NULL, 0, 0, '[]', 0, NULL, ?, 1)`
        )
        .run(providerId, keyId, now);

      const inserted = this.storage.db
        .prepare(
          'SELECT * FROM ai_key_states WHERE provider_id = ? AND key_id = ?'
        )
        .get(providerId, keyId) as unknown as RawKeyStateRow;

      return parseRow(inserted);
    });
  }

  /**
   * K8: Updates a key state row using strict Compare-And-Set on `version`.
   * Throws CasConflictError if the expectedVersion no longer matches.
   */
  public casUpdateKeyState(
    providerId: string,
    keyId: string,
    expectedVersion: number,
    patch: {
      state: KeyStateName;
      state_until: number | null;
      reason: string;
      consecutive_transient_failures?: number;
      first_transient_failure_at?: number | null;
      circuit_open_count?: number;
      half_open_probe_in_flight?: number;
      rate_limit_timestamps?: number[];
      last_used_at?: number;
      last_error_class?: string | null;
    }
  ): KeyStateRecord {
    const now = this.storage.now();
    return this.storage.transaction(() => {
      const currentRaw = this.storage.db
        .prepare(
          'SELECT * FROM ai_key_states WHERE provider_id = ? AND key_id = ?'
        )
        .get(providerId, keyId) as RawKeyStateRow | undefined;

      if (!currentRaw) {
        throw new CasConflictError(`Key ${providerId}/${keyId} not found`);
      }

      if (currentRaw.version !== expectedVersion) {
        throw new CasConflictError(
          `CAS version mismatch for ${providerId}/${keyId}: expected ${expectedVersion}, found ${currentRaw.version}`
        );
      }

      const current = parseRow(currentRaw);
      const nextVersion = expectedVersion + 1;
      const nextConsecutive =
        patch.consecutive_transient_failures !== undefined
          ? patch.consecutive_transient_failures
          : current.consecutive_transient_failures;
      const nextFirstFail =
        patch.first_transient_failure_at !== undefined
          ? patch.first_transient_failure_at
          : current.first_transient_failure_at;
      const nextCircuitCount =
        patch.circuit_open_count !== undefined
          ? patch.circuit_open_count
          : current.circuit_open_count;
      const nextProbe =
        patch.half_open_probe_in_flight !== undefined
          ? patch.half_open_probe_in_flight
          : current.half_open_probe_in_flight;
      const nextRlTimestamps =
        patch.rate_limit_timestamps !== undefined
          ? patch.rate_limit_timestamps
          : current.rate_limit_timestamps;
      const nextLastUsed =
        patch.last_used_at !== undefined
          ? patch.last_used_at
          : current.last_used_at;
      const nextLastError =
        patch.last_error_class !== undefined
          ? patch.last_error_class
          : current.last_error_class;

      const info = this.storage.db
        .prepare(
          `UPDATE ai_key_states
           SET state = ?,
               state_until = ?,
               reason = ?,
               consecutive_transient_failures = ?,
               first_transient_failure_at = ?,
               circuit_open_count = ?,
               half_open_probe_in_flight = ?,
               rate_limit_timestamps_json = ?,
               last_used_at = ?,
               last_error_class = ?,
               updated_at = ?,
               version = ?
           WHERE provider_id = ? AND key_id = ? AND version = ?`
        )
        .run(
          patch.state,
          patch.state_until,
          patch.reason,
          nextConsecutive,
          nextFirstFail,
          nextCircuitCount,
          nextProbe,
          JSON.stringify(nextRlTimestamps),
          nextLastUsed,
          nextLastError,
          now,
          nextVersion,
          providerId,
          keyId,
          expectedVersion
        );

      if (info.changes !== 1) {
        throw new CasConflictError(
          `CAS update failed for ${providerId}/${keyId} at version ${expectedVersion}`
        );
      }

      if (
        current.state !== patch.state ||
        current.state_until !== patch.state_until
      ) {
        this.storage.appendAuditLog({
          eventType: 'KEY_STATE_TRANSITION',
          providerId,
          keyId,
          details: {
            old_state: current.state,
            old_until: current.state_until,
            new_state: patch.state,
            new_until: patch.state_until,
            reason: patch.reason,
            version: nextVersion,
          },
        });
      }

      const updatedRaw = this.storage.db
        .prepare(
          'SELECT * FROM ai_key_states WHERE provider_id = ? AND key_id = ?'
        )
        .get(providerId, keyId) as unknown as RawKeyStateRow;

      return parseRow(updatedRaw);
    });
  }

  private refreshExpiredStateInTx(record: KeyStateRecord): KeyStateRecord {
    const now = this.storage.now();
    if (
      (record.state === 'COOLDOWN' || record.state === 'QUOTA_EXHAUSTED') &&
      record.state_until !== null &&
      now >= record.state_until
    ) {
      return this.casUpdateKeyState(
        record.provider_id,
        record.key_id,
        record.version,
        {
          state: 'ACTIVE',
          state_until: null,
          reason: `${record.state.toLowerCase()}_expired`,
        }
      );
    }
    return record;
  }

  public getKeyState(providerId: string, keyId: string): KeyStateRecord {
    return this.ensureKeyInitialized(providerId, keyId);
  }

  public isKeyEligible(providerId: string, keyId: string): boolean {
    const now = this.storage.now();
    const rec = this.ensureKeyInitialized(providerId, keyId);
    if (rec.state === 'ACTIVE') return true;
    if (
      rec.state === 'CIRCUIT_OPEN' &&
      rec.state_until !== null &&
      now >= rec.state_until &&
      rec.half_open_probe_in_flight === 0
    ) {
      return true;
    }
    return false;
  }

  public acquireEligibilityForAttempt(
    providerId: string,
    keyId: string
  ): { eligible: boolean; isHalfOpenProbe: boolean; state: KeyStateRecord } {
    const now = this.storage.now();
    return this.storage.transaction(() => {
      const rec = this.ensureKeyInitialized(providerId, keyId);

      if (rec.state === 'ACTIVE') {
        const touched = this.casUpdateKeyState(
          providerId,
          keyId,
          rec.version,
          {
            state: 'ACTIVE',
            state_until: null,
            reason: rec.reason,
            last_used_at: now,
          }
        );
        return { eligible: true, isHalfOpenProbe: false, state: touched };
      }

      if (
        rec.state === 'CIRCUIT_OPEN' &&
        rec.state_until !== null &&
        now >= rec.state_until &&
        rec.half_open_probe_in_flight === 0
      ) {
        const probing = this.casUpdateKeyState(
          providerId,
          keyId,
          rec.version,
          {
            state: 'CIRCUIT_OPEN',
            state_until: rec.state_until,
            reason: 'half_open_probe_in_flight',
            half_open_probe_in_flight: 1,
            last_used_at: now,
          }
        );
        return { eligible: true, isHalfOpenProbe: true, state: probing };
      }

      return { eligible: false, isHalfOpenProbe: false, state: rec };
    });
  }

  public acquireHalfOpenProbe(providerId: string, keyId: string): boolean {
    const res = this.acquireEligibilityForAttempt(providerId, keyId);
    return res.eligible && res.isHalfOpenProbe;
  }

  public touchLastUsed(providerId: string, keyId: string): void {
    const now = this.storage.now();
    this.storage.transaction(() => {
      const rec = this.ensureKeyInitialized(providerId, keyId);
      this.casUpdateKeyState(providerId, keyId, rec.version, {
        state: rec.state,
        state_until: rec.state_until,
        reason: rec.reason,
        last_used_at: now,
      });
    });
  }

  public recordSuccess(providerId: string, keyId: string): KeyStateRecord {
    const now = this.storage.now();
    return this.storage.transaction(() => {
      const rec = this.ensureKeyInitialized(providerId, keyId);
      if (rec.state === 'INVALID' || rec.state === 'DISABLED') {
        return rec;
      }
      return this.casUpdateKeyState(providerId, keyId, rec.version, {
        state: 'ACTIVE',
        state_until: null,
        reason:
          rec.state === 'CIRCUIT_OPEN'
            ? 'half_open_probe_succeeded'
            : 'request_succeeded',
        consecutive_transient_failures: 0,
        first_transient_failure_at: null,
        circuit_open_count: 0,
        half_open_probe_in_flight: 0,
        last_used_at: now,
      });
    });
  }

  public recordRateLimited(params: {
    providerId: string;
    keyId: string;
    retryAfterTimestampMs?: number | null;
    retryAfterMs?: number | null;
    resetTimezone?: string;
    resetTime?: string;
    reason?: string;
  }): KeyStateRecord {
    const now = this.storage.now();
    return this.storage.transaction(() => {
      const rec = this.ensureKeyInitialized(params.providerId, params.keyId);
      if (rec.state === 'INVALID' || rec.state === 'DISABLED') {
        return rec;
      }

      const tenMinAgo = now - ENGINE_DEFAULTS.RATE_LIMIT_ESCALATION_WINDOW_MS;
      const recentEvents = [
        ...rec.rate_limit_timestamps.filter((ts) => ts > tenMinAgo),
        now,
      ];

      if (recentEvents.length >= ENGINE_DEFAULTS.RATE_LIMIT_ESCALATION_COUNT) {
        const period = getCurrentPeriodWindow(
          now,
          params.resetTimezone || ENGINE_DEFAULTS.UNKNOWN_RESET_TIMEZONE,
          params.resetTime || ENGINE_DEFAULTS.UNKNOWN_RESET_TIME
        );
        const targetUntil = Math.max(rec.state_until ?? 0, period.endMs);
        return this.casUpdateKeyState(
          params.providerId,
          params.keyId,
          rec.version,
          {
            state: 'QUOTA_EXHAUSTED',
            state_until: targetUntil,
            reason: 'escalated_after_3_rate_limits_in_10m',
            half_open_probe_in_flight: 0,
            rate_limit_timestamps: recentEvents,
            last_error_class: 'RATE_LIMITED',
          }
        );
      }

      const retryTarget =
        params.retryAfterTimestampMs != null
          ? params.retryAfterTimestampMs
          : params.retryAfterMs != null
          ? now + params.retryAfterMs
          : 0;
      const minCooldownEnd = now + ENGINE_DEFAULTS.RATE_LIMIT_MIN_COOLDOWN_MS;
      const currentCooldownEnd = rec.state_until ?? 0;
      const nextUntil = Math.max(
        currentCooldownEnd,
        retryTarget,
        minCooldownEnd
      );

      return this.casUpdateKeyState(
        params.providerId,
        params.keyId,
        rec.version,
        {
          state: 'COOLDOWN',
          state_until: nextUntil,
          reason: params.reason || 'rate_limited_cooldown',
          half_open_probe_in_flight: 0,
          rate_limit_timestamps: recentEvents,
          last_error_class: 'RATE_LIMITED',
        }
      );
    });
  }

  public recordQuotaExhausted(params: {
    providerId: string;
    keyId: string;
    exhaustedWindowEndMs?: number;
    resetTimezone?: string;
    resetTime?: string;
    reason?: string;
  }): KeyStateRecord {
    const now = this.storage.now();
    return this.storage.transaction(() => {
      const rec = this.ensureKeyInitialized(params.providerId, params.keyId);
      if (rec.state === 'INVALID' || rec.state === 'DISABLED') {
        return rec;
      }

      const period = getCurrentPeriodWindow(
        now,
        params.resetTimezone || ENGINE_DEFAULTS.UNKNOWN_RESET_TIMEZONE,
        params.resetTime || ENGINE_DEFAULTS.UNKNOWN_RESET_TIME
      );
      const boundaryMs = params.exhaustedWindowEndMs ?? period.endMs;
      const nextUntil = Math.max(rec.state_until ?? 0, boundaryMs);

      return this.casUpdateKeyState(
        params.providerId,
        params.keyId,
        rec.version,
        {
          state: 'QUOTA_EXHAUSTED',
          state_until: nextUntil,
          reason: params.reason || 'quota_exhausted_until_reset_boundary',
          half_open_probe_in_flight: 0,
          last_error_class: 'QUOTA_EXHAUSTED',
        }
      );
    });
  }

  public recordTransientFailure(
    providerId: string,
    keyId: string,
    errorClass = 'TRANSIENT'
  ): KeyStateRecord {
    const now = this.storage.now();
    return this.storage.transaction(() => {
      const rec = this.ensureKeyInitialized(providerId, keyId);
      if (rec.state === 'INVALID' || rec.state === 'DISABLED') {
        return rec;
      }

      if (rec.state === 'CIRCUIT_OPEN') {
        const nextOpenCount = rec.circuit_open_count + 1;
        const openDuration = Math.min(
          ENGINE_DEFAULTS.CIRCUIT_BREAKER_MAX_OPEN_MS,
          ENGINE_DEFAULTS.CIRCUIT_BREAKER_INITIAL_OPEN_MS *
            Math.pow(2, nextOpenCount - 1)
        );
        return this.casUpdateKeyState(providerId, keyId, rec.version, {
          state: 'CIRCUIT_OPEN',
          state_until: now + openDuration,
          reason: `half_open_probe_failed_${errorClass.toLowerCase()}`,
          circuit_open_count: nextOpenCount,
          half_open_probe_in_flight: 0,
          last_error_class: errorClass,
        });
      }

      const withinWindow =
        rec.first_transient_failure_at !== null &&
        now - rec.first_transient_failure_at <=
          ENGINE_DEFAULTS.CIRCUIT_BREAKER_WINDOW_MS;

      const firstFailureAt = withinWindow ? rec.first_transient_failure_at! : now;
      const consecutiveCount = withinWindow
        ? rec.consecutive_transient_failures + 1
        : 1;

      if (
        consecutiveCount >= ENGINE_DEFAULTS.CIRCUIT_BREAKER_FAILURE_THRESHOLD
      ) {
        const nextOpenCount = rec.circuit_open_count + 1;
        const openDuration = Math.min(
          ENGINE_DEFAULTS.CIRCUIT_BREAKER_MAX_OPEN_MS,
          ENGINE_DEFAULTS.CIRCUIT_BREAKER_INITIAL_OPEN_MS *
            Math.pow(2, nextOpenCount - 1)
        );
        return this.casUpdateKeyState(providerId, keyId, rec.version, {
          state: 'CIRCUIT_OPEN',
          state_until: now + openDuration,
          reason: `three_consecutive_transient_failures_${errorClass.toLowerCase()}`,
          consecutive_transient_failures: consecutiveCount,
          first_transient_failure_at: firstFailureAt,
          circuit_open_count: nextOpenCount,
          half_open_probe_in_flight: 0,
          last_error_class: errorClass,
        });
      }

      return this.casUpdateKeyState(providerId, keyId, rec.version, {
        state: rec.state,
        state_until: rec.state_until,
        reason: rec.reason,
        consecutive_transient_failures: consecutiveCount,
        first_transient_failure_at: firstFailureAt,
        last_error_class: errorClass,
      });
    });
  }

  public recordAuthInvalid(
    providerId: string,
    keyId: string,
    reason = 'auth_invalid_key'
  ): KeyStateRecord {
    return this.storage.transaction(() => {
      const rec = this.ensureKeyInitialized(providerId, keyId);
      if (rec.state === 'DISABLED') {
        return rec;
      }
      return this.casUpdateKeyState(providerId, keyId, rec.version, {
        state: 'INVALID',
        state_until: null,
        reason,
        half_open_probe_in_flight: 0,
        last_error_class: 'AUTH_INVALID',
      });
    });
  }

  public ownerRotateKeyAndActivateAfterProbe(
    providerId: string,
    keyId: string,
    newPlainKey: string,
    probeSucceeded: boolean,
    masterKeyOverride?: string
  ): KeyStateRecord {
    return this.storage.transaction(() => {
      this.storage.storeEncryptedKey(
        providerId,
        keyId,
        newPlainKey,
        masterKeyOverride
      );
      const rec = this.ensureKeyInitialized(providerId, keyId);
      if (!probeSucceeded) {
        return this.casUpdateKeyState(providerId, keyId, rec.version, {
          state: 'INVALID',
          state_until: null,
          reason: 'owner_key_rotation_probe_failed',
        });
      }
      return this.casUpdateKeyState(providerId, keyId, rec.version, {
        state: 'ACTIVE',
        state_until: null,
        reason: 'owner_key_rotated_and_probed',
        consecutive_transient_failures: 0,
        first_transient_failure_at: null,
        circuit_open_count: 0,
        half_open_probe_in_flight: 0,
        rate_limit_timestamps: [],
        last_error_class: null,
      });
    });
  }

  public ownerRotateKeyAndRecover(
    providerId: string,
    keyId: string,
    probePassed: boolean
  ): KeyStateRecord {
    return this.storage.transaction(() => {
      const rec = this.ensureKeyInitialized(providerId, keyId);
      if (!probePassed) {
        return this.casUpdateKeyState(providerId, keyId, rec.version, {
          state: 'INVALID',
          state_until: null,
          reason: 'owner_key_rotation_probe_failed',
        });
      }
      return this.casUpdateKeyState(providerId, keyId, rec.version, {
        state: 'ACTIVE',
        state_until: null,
        reason: 'owner_key_rotated_and_probed',
        consecutive_transient_failures: 0,
        first_transient_failure_at: null,
        circuit_open_count: 0,
        half_open_probe_in_flight: 0,
        rate_limit_timestamps: [],
        last_error_class: null,
      });
    });
  }

  public ownerSetKeyDisabled(
    providerId: string,
    keyId: string,
    disabled: boolean,
    reason = disabled ? 'owner_disabled' : 'owner_reenabled'
  ): KeyStateRecord {
    return this.storage.transaction(() => {
      const rec = this.ensureKeyInitialized(providerId, keyId);
      return this.casUpdateKeyState(providerId, keyId, rec.version, {
        state: disabled ? 'DISABLED' : 'ACTIVE',
        state_until: null,
        reason,
        consecutive_transient_failures: 0,
        first_transient_failure_at: null,
        half_open_probe_in_flight: 0,
      });
    });
  }

  public setOwnerDisabled(
    providerId: string,
    keyId: string,
    disabled: boolean,
    reason?: string
  ): KeyStateRecord {
    return this.ownerSetKeyDisabled(providerId, keyId, disabled, reason);
  }

  public markModelUnavailableForKey(params: {
    providerId: string;
    keyId: string;
    modelId: string;
    durationMs?: number;
    configHash?: string;
    reason: string;
  }): void {
    const now = this.storage.now();
    const until =
      typeof params.durationMs === 'number' ? now + params.durationMs : null;

    this.storage.transaction(() => {
      this.storage.db
        .prepare(
          `INSERT INTO ai_model_availability
           (provider_id, key_id, model_id, unavailable_until, unavailable_until_config_hash, reason, updated_at, version)
           VALUES (?, ?, ?, ?, ?, ?, ?, 1)
           ON CONFLICT(provider_id, key_id, model_id)
           DO UPDATE SET
             unavailable_until = excluded.unavailable_until,
             unavailable_until_config_hash = excluded.unavailable_until_config_hash,
             reason = excluded.reason,
             updated_at = excluded.updated_at,
             version = ai_model_availability.version + 1`
        )
        .run(
          params.providerId,
          params.keyId,
          params.modelId,
          until,
          params.configHash ?? null,
          params.reason,
          now
        );

      this.storage.appendAuditLog({
        eventType: 'MODEL_UNAVAILABLE_FOR_KEY',
        providerId: params.providerId,
        keyId: params.keyId,
        details: {
          model_id: params.modelId,
          unavailable_until: until,
          config_hash: params.configHash ?? null,
          reason: params.reason,
        },
      });
    });
  }

  public isModelAvailableForKey(
    providerId: string,
    keyId: string,
    modelId: string,
    currentConfigHash: string
  ): boolean {
    const now = this.storage.now();
    const row = this.storage.db
      .prepare(
        `SELECT unavailable_until, unavailable_until_config_hash
         FROM ai_model_availability
         WHERE provider_id = ? AND key_id = ? AND model_id = ?`
      )
      .get(providerId, keyId, modelId) as
      | {
          unavailable_until: number | null;
          unavailable_until_config_hash: string | null;
        }
      | undefined;

    if (!row) return true;

    if (row.unavailable_until !== null) {
      return now >= row.unavailable_until;
    }

    if (row.unavailable_until_config_hash !== null) {
      return row.unavailable_until_config_hash !== currentConfigHash;
    }

    return true;
  }

  public listKeysForProvider(providerId: string): KeyStateRecord[] {
    const rows = this.storage.db
      .prepare(
        `SELECT * FROM ai_key_states WHERE provider_id = ? ORDER BY key_id ASC`
      )
      .all(providerId) as unknown as RawKeyStateRow[];
    return rows.map((r) => this.getKeyState(r.provider_id, r.key_id));
  }
}
