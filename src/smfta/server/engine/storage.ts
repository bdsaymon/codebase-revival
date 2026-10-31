import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from '../runtime/sqlite';
import { DEFAULT_SERVER_KEY_DAILY_CAP, ENGINE_DEFAULTS } from './defaults';
import {
  decryptKeyInMemory,
  encryptKeyAtRest,
  hasConfiguredMasterKey,
  redactSecrets,
  type EncryptedKeyRecord,
} from './security';

/**
 * Section 13: PERSISTENCE AND CONCURRENCY (P1 - P4) & Phase 1.5, 2.7, 2.8
 * Uses built-in Node.js SQLite (node:sqlite DatabaseSync) with WAL mode and
 * BEGIN IMMEDIATE transactions + Compare-And-Set version checks.
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class CasConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CasConflictError';
  }
}

export type KeyPoolState =
  | 'ACTIVE'
  | 'COOLDOWN'
  | 'QUOTA_EXHAUSTED'
  | 'CIRCUIT_OPEN'
  | 'INVALID'
  | 'DISABLED';

export type SimplifiedKeyStatus =
  | 'usable'
  | 'rate_limited'
  | 'no_credit'
  | 'broken';

export function mapKeyStateToSimplified(state: KeyPoolState): SimplifiedKeyStatus {
  switch (state) {
    case 'ACTIVE':
      return 'usable';
    case 'COOLDOWN':
      return 'rate_limited';
    case 'QUOTA_EXHAUSTED':
      return 'no_credit';
    case 'CIRCUIT_OPEN':
    case 'INVALID':
    case 'DISABLED':
    default:
      return 'broken';
  }
}

export interface Clock {
  now(): number;
}

export const systemClock: Clock = {
  now: () => Date.now(),
};

export const USAGE_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000; // 30 days
const DAILY_PRUNE_INTERVAL_MS = 24 * 60 * 60 * 1_000; // 24 hours

export type PersistenceMode = 'durable' | 'memory' | 'failed';

export interface PersistedNoteRecord {
  noteId: string;
  userId: string;
  title: string;
  content: string;
  revision: number;
  createdAt: number;
  updatedAt: number;
}

export class DurableStorage {
  public readonly db: DatabaseSync;
  public readonly dbPath: string;
  public readonly persistenceMode: PersistenceMode;
  private inTransaction = false;
  public clock: Clock;
  private pruneTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    options?:
      | string
      | { dbPath?: string; clock?: Clock; masterKeyHex?: string }
  ) {
    const opts =
      typeof options === 'string' ? { dbPath: options } : options || {};
    this.clock = opts.clock || systemClock;
    const isServerlessRuntime = Boolean(
      process.env.VERCEL ||
        process.env.AWS_LAMBDA_FUNCTION_NAME ||
        process.env.NETLIFY
    );
    const resolvedPath =
      opts.dbPath ||
      process.env.AI_ENGINE_DB_PATH ||
      // Edge runtime: engine state lives in memory per server instance
      // (equivalent to the source's ephemeral /tmp serverless database).
      (isServerlessRuntime ? ':memory:' : ':memory:');
    this.dbPath = resolvedPath;

    // Trigger startup check for AI_MASTER_KEY once (Phase 2.7)
    hasConfiguredMasterKey();

    try {
      if (resolvedPath !== ':memory:') {
        const dir = path.dirname(resolvedPath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
        }
      }
      this.db = new DatabaseSync(resolvedPath);
      if (resolvedPath !== ':memory:') {
        try {
          fs.chmodSync(resolvedPath, 0o600);
        } catch {
          // Ignore on filesystems that do not support POSIX chmod
        }
      }
      this.db.exec('PRAGMA busy_timeout = 5000;');
      this.db.exec('PRAGMA journal_mode = WAL;');
      this.db.exec('PRAGMA synchronous = NORMAL;');
      this.db.exec('PRAGMA foreign_keys = ON;');
      this.runMigrations();
      this.persistenceMode = resolvedPath === ':memory:' ? 'memory' : 'durable';
    } catch (err) {
      if (
        opts.dbPath ||
        (process.env.NODE_ENV === 'production' &&
          !isServerlessRuntime &&
          process.env.ALLOW_MEMORY_DB_FALLBACK !== 'true')
      ) {
        throw err;
      }
      this.dbPath = ':memory:';
      this.persistenceMode = 'memory';
      this.db = new DatabaseSync(':memory:');
      this.db.exec('PRAGMA foreign_keys = ON;');
      this.runMigrations();
    }

    this.pruneOldUsageRecords();
    this.pruneTimer = setInterval(() => {
      try {
        this.pruneOldUsageRecords();
      } catch {
        // Ignore background prune errors
      }
    }, DAILY_PRUNE_INTERVAL_MS);
    if (typeof this.pruneTimer.unref === 'function') {
      this.pruneTimer.unref();
    }
  }

  public setClock(clock: Clock): void {
    this.clock = clock;
  }

  public now(): number {
    return this.clock.now();
  }

  private runMigrations(): void {
    const migrationPath = path.join(__dirname, 'migrations', '001_ai_engine.sql');
    const sql = fs.existsSync(migrationPath)
      ? fs.readFileSync(migrationPath, 'utf8')
      : `
CREATE TABLE IF NOT EXISTS ai_encrypted_keys (
  provider_id TEXT NOT NULL,
  key_id TEXT NOT NULL,
  iv_hex TEXT NOT NULL,
  auth_tag_hex TEXT NOT NULL,
  ciphertext_hex TEXT NOT NULL,
  last4 TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (provider_id, key_id)
);
CREATE TABLE IF NOT EXISTS ai_key_states (
  provider_id TEXT NOT NULL,
  key_id TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'ACTIVE',
  state_until INTEGER,
  reason TEXT NOT NULL DEFAULT 'initialized',
  consecutive_transient_failures INTEGER NOT NULL DEFAULT 0,
  first_transient_failure_at INTEGER,
  circuit_open_count INTEGER NOT NULL DEFAULT 0,
  half_open_probe_in_flight INTEGER NOT NULL DEFAULT 0,
  rate_limit_timestamps_json TEXT NOT NULL DEFAULT '[]',
  last_used_at INTEGER NOT NULL DEFAULT 0,
  last_error_class TEXT,
  updated_at INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (provider_id, key_id)
);
CREATE TABLE IF NOT EXISTS ai_model_availability (
  provider_id TEXT NOT NULL,
  key_id TEXT NOT NULL,
  model_id TEXT NOT NULL,
  unavailable_until INTEGER,
  unavailable_until_config_hash TEXT,
  reason TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (provider_id, key_id, model_id)
);
CREATE TABLE IF NOT EXISTS ai_quota_reservations (
  reservation_id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  key_id TEXT NOT NULL,
  model_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  period_window_start INTEGER NOT NULL,
  period_window_end INTEGER NOT NULL,
  tokens_reserved INTEGER NOT NULL,
  tokens_actual INTEGER,
  tokens_estimated INTEGER NOT NULL DEFAULT 1,
  finalized INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_ai_quota_rolling
  ON ai_quota_reservations (provider_id, key_id, model_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ai_quota_period
  ON ai_quota_reservations (provider_id, key_id, model_id, period_window_start, period_window_end);
CREATE TABLE IF NOT EXISTS ai_provider_reset_overrides (
  provider_id TEXT NOT NULL,
  key_id TEXT NOT NULL,
  model_id TEXT NOT NULL,
  window_type TEXT NOT NULL,
  strict_remaining_requests INTEGER,
  strict_remaining_tokens INTEGER,
  reset_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (provider_id, key_id, model_id, window_type)
);
CREATE TABLE IF NOT EXISTS ai_usage_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id TEXT NOT NULL,
  attempt_no INTEGER NOT NULL,
  provider_id TEXT NOT NULL,
  key_id TEXT NOT NULL,
  model_id TEXT NOT NULL,
  class TEXT NOT NULL,
  http_status INTEGER,
  latency_ms INTEGER NOT NULL,
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  tokens_estimated INTEGER NOT NULL DEFAULT 1,
  cost_usd REAL NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ai_usage_created_at
  ON ai_usage_records (created_at);
CREATE INDEX IF NOT EXISTS idx_ai_usage_provider_created
  ON ai_usage_records (provider_id, created_at);
CREATE TABLE IF NOT EXISTS ai_pending_actions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  tool TEXT NOT NULL,
  canonical_args TEXT NOT NULL,
  args_hash TEXT NOT NULL,
  preview_text TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  target_id TEXT NOT NULL,
  target_version INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  expires_at INTEGER NOT NULL,
  attempts_left INTEGER NOT NULL DEFAULT 5,
  executing_started_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_ai_pending_user_conv
  ON ai_pending_actions (user_id, conversation_id, status);
CREATE TABLE IF NOT EXISTS ai_audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL,
  user_id TEXT,
  conversation_id TEXT,
  action_id TEXT,
  provider_id TEXT,
  key_id TEXT,
  details_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ai_audit_created_at
  ON ai_audit_logs (created_at);
CREATE TABLE IF NOT EXISTS ai_kill_switches (
  scope TEXT NOT NULL,
  target_id TEXT NOT NULL,
  killed INTEGER NOT NULL DEFAULT 0,
  reason TEXT,
  updated_at INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (scope, target_id)
);
CREATE TABLE IF NOT EXISTS ai_user_rate_limits (
  user_id TEXT NOT NULL,
  request_ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ai_user_rate_ts
  ON ai_user_rate_limits (user_id, request_ts);
CREATE TABLE IF NOT EXISTS ai_stored_messages (
  message_id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
`;
    this.db.exec(sql);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ai_engine_meta (
        meta_key TEXT PRIMARY KEY,
        meta_value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS user_notes (
        note_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        revision INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL
      );
    `);
    try {
      this.db.exec(
        'ALTER TABLE user_notes ADD COLUMN created_at INTEGER NOT NULL DEFAULT 0;'
      );
    } catch {
      // Column already exists
    }
  }

  /**
   * P2: Runs a synchronous callback inside an atomic BEGIN IMMEDIATE transaction.
   * Supports nested calls safely via SAVEPOINT.
   */
  public transaction<T>(fn: () => T): T {
    if (this.inTransaction) {
      const sp = `sp_${Math.random().toString(36).slice(2, 10)}`;
      this.db.exec(`SAVEPOINT ${sp}`);
      try {
        const result = fn();
        this.db.exec(`RELEASE SAVEPOINT ${sp}`);
        return result;
      } catch (err) {
        this.db.exec(`ROLLBACK TO SAVEPOINT ${sp}`);
        this.db.exec(`RELEASE SAVEPOINT ${sp}`);
        throw err;
      }
    }

    this.inTransaction = true;
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      this.db.exec('COMMIT');
      return result;
    } catch (err) {
      try {
        this.db.exec('ROLLBACK');
      } catch {
        // Ignore rollback failure if already rolled back
      }
      throw err;
    } finally {
      this.inTransaction = false;
    }
  }

  public runImmediateTransaction<T>(fn: () => T): T {
    return this.transaction(fn);
  }

  /**
   * Phase 2.8: Prunes usage records older than 30 days on startup and once per day.
   */
  public pruneOldUsageRecords(retentionMs = USAGE_RETENTION_MS): number {
    const cutoff = this.now() - retentionMs;
    const res = this.db
      .prepare('DELETE FROM ai_usage_records WHERE created_at < ?')
      .run(cutoff);
    return Number(res.changes || 0);
  }

  public isKillSwitchEnabled(): boolean {
    const envVal = (process.env.AI_ENGINE_ENABLED || '').trim().toLowerCase();
    if (envVal === 'false' || envVal === '0' || envVal === 'off') {
      return false;
    }
    const row = this.db
      .prepare('SELECT meta_value FROM ai_engine_meta WHERE meta_key = ?')
      .get('AI_ENGINE_ENABLED') as { meta_value: string } | undefined;
    if (row && (row.meta_value === 'false' || row.meta_value === '0')) {
      return false;
    }
    return true;
  }

  public setKillSwitchEnabled(enabled: boolean): void {
    const now = this.now();
    this.db
      .prepare(
        `INSERT INTO ai_engine_meta (meta_key, meta_value, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(meta_key) DO UPDATE SET
           meta_value = excluded.meta_value,
           updated_at = excluded.updated_at`
      )
      .run('AI_ENGINE_ENABLED', enabled ? 'true' : 'false', now);
  }

  public getUtcDayString(timestampMs = this.now()): string {
    return new Date(timestampMs).toISOString().slice(0, 10);
  }

  public getServerKeyDailyCount(utcDay = this.getUtcDayString()): number {
    const metaKey = `SERVER_KEY_DAILY_COUNT:${utcDay}`;
    const row = this.db
      .prepare('SELECT meta_value FROM ai_engine_meta WHERE meta_key = ?')
      .get(metaKey) as { meta_value: string } | undefined;
    if (!row) return 0;
    const parsed = Number.parseInt(row.meta_value, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  }

  public incrementServerKeyDailyCount(utcDay = this.getUtcDayString()): number {
    const metaKey = `SERVER_KEY_DAILY_COUNT:${utcDay}`;
    const now = this.now();
    return this.transaction(() => {
      const current = this.getServerKeyDailyCount(utcDay);
      const next = current + 1;
      this.db
        .prepare(
          `INSERT INTO ai_engine_meta (meta_key, meta_value, updated_at)
           VALUES (?, ?, ?)
           ON CONFLICT(meta_key) DO UPDATE SET
             meta_value = excluded.meta_value,
             updated_at = excluded.updated_at`
        )
        .run(metaKey, String(next), now);
      return next;
    });
  }

  public isServerKeyDailyCapReached(capOverride?: number): boolean {
    const envCapRaw = process.env.AI_SERVER_KEY_DAILY_CAP;
    const envCap =
      envCapRaw !== undefined && envCapRaw.trim() !== ''
        ? Number.parseInt(envCapRaw.trim(), 10)
        : DEFAULT_SERVER_KEY_DAILY_CAP;
    const cap =
      capOverride !== undefined
        ? capOverride
        : Number.isFinite(envCap) && envCap >= 0
        ? envCap
        : DEFAULT_SERVER_KEY_DAILY_CAP;
    if (cap <= 0) return true;
    const used = this.getServerKeyDailyCount();
    return used >= cap;
  }

  /**
   * SEC2 & CP6: Encrypts and stores a key at rest using compare-and-set on version.
   */
  public storeEncryptedKey(
    providerId: string,
    keyId: string,
    plainKey: string,
    masterKeyOverride?: string
  ): { last4: string; version: number } {
    const enc = encryptKeyAtRest(plainKey, masterKeyOverride);
    const now = this.now();

    return this.transaction(() => {
      const existing = this.db
        .prepare(
          'SELECT version FROM ai_encrypted_keys WHERE provider_id = ? AND key_id = ?'
        )
        .get(providerId, keyId) as { version: number } | undefined;

      if (!existing) {
        this.db
          .prepare(
            `INSERT INTO ai_encrypted_keys
             (provider_id, key_id, iv_hex, auth_tag_hex, ciphertext_hex, last4, created_at, updated_at, version)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`
          )
          .run(
            providerId,
            keyId,
            enc.iv_hex,
            enc.auth_tag_hex,
            enc.ciphertext_hex,
            enc.last4,
            now,
            now
          );
        return { last4: enc.last4, version: 1 };
      }

      const nextVer = existing.version + 1;
      const info = this.db
        .prepare(
          `UPDATE ai_encrypted_keys
           SET iv_hex = ?, auth_tag_hex = ?, ciphertext_hex = ?, last4 = ?, updated_at = ?, version = ?
           WHERE provider_id = ? AND key_id = ? AND version = ?`
        )
        .run(
          enc.iv_hex,
          enc.auth_tag_hex,
          enc.ciphertext_hex,
          enc.last4,
          now,
          nextVer,
          providerId,
          keyId,
          existing.version
        );

      if (info.changes !== 1) {
        throw new CasConflictError(
          `CAS conflict updating encrypted key ${providerId}/${keyId}`
        );
      }

      return { last4: enc.last4, version: nextVer };
    });
  }

  /**
   * SEC2: Decrypts a stored key in memory only at call time.
   */
  public getDecryptedKey(
    providerId: string,
    keyId: string,
    masterKeyOverride?: string
  ): string | null {
    const row = this.db
      .prepare(
        `SELECT provider_id, key_id, iv_hex, auth_tag_hex, ciphertext_hex, last4, version
         FROM ai_encrypted_keys WHERE provider_id = ? AND key_id = ?`
      )
      .get(providerId, keyId) as EncryptedKeyRecord | undefined;
    if (!row) return null;
    return decryptKeyInMemory(row, masterKeyOverride);
  }

  /**
   * SEC2: Returns only the last 4 characters of a stored key for UI display.
   */
  public getKeyLast4(providerId: string, keyId: string): string | null {
    const row = this.db
      .prepare(
        'SELECT last4 FROM ai_encrypted_keys WHERE provider_id = ? AND key_id = ?'
      )
      .get(providerId, keyId) as { last4: string } | undefined;
    return row ? row.last4 : null;
  }

  /**
   * Appends a redacted audit log entry.
   */
  public appendAuditLog(params: {
    eventType: string;
    userId?: string;
    conversationId?: string;
    actionId?: string;
    providerId?: string;
    keyId?: string;
    details: Record<string, unknown>;
  }): void {
    const safeDetailsJson = redactSecrets(JSON.stringify(params.details));
    this.db
      .prepare(
        `INSERT INTO ai_audit_logs
         (event_type, user_id, conversation_id, action_id, provider_id, key_id, details_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        params.eventType,
        params.userId ?? null,
        params.conversationId ?? null,
        params.actionId ?? null,
        params.providerId ?? null,
        params.keyId ?? null,
        safeDetailsJson,
        this.now()
      );
  }

  public getAuditLogs(limit = 100): Array<{
    id: number;
    event_type: string;
    user_id: string | null;
    conversation_id: string | null;
    action_id: string | null;
    provider_id: string | null;
    key_id: string | null;
    details: Record<string, unknown>;
    created_at: number;
  }> {
    const rows = this.db
      .prepare(
        `SELECT id, event_type, user_id, conversation_id, action_id, provider_id, key_id, details_json, created_at
         FROM ai_audit_logs ORDER BY id DESC LIMIT ?`
      )
      .all(limit) as Array<{
      id: number;
      event_type: string;
      user_id: string | null;
      conversation_id: string | null;
      action_id: string | null;
      provider_id: string | null;
      key_id: string | null;
      details_json: string;
      created_at: number;
    }>;

    return rows.map((r) => ({
      id: r.id,
      event_type: r.event_type,
      user_id: r.user_id,
      conversation_id: r.conversation_id,
      action_id: r.action_id,
      provider_id: r.provider_id,
      key_id: r.key_id,
      details: JSON.parse(r.details_json || '{}'),
      created_at: r.created_at,
    }));
  }

  /**
   * SEC4: Per-user rate limit (default 20 messages/minute + configurable daily cap).
   */
  public checkAndRecordUserRateLimit(
    userId: string,
    limits?: { perMinute?: number; perDay?: number }
  ): { allowed: boolean; reason?: string } {
    const perMinute =
      limits?.perMinute ?? ENGINE_DEFAULTS.USER_RATE_LIMIT_PER_MINUTE;
    const perDay = limits?.perDay ?? ENGINE_DEFAULTS.USER_DAILY_MESSAGE_CAP;
    const now = this.now();
    const oneMinAgo = now - 60_000;
    const oneDayAgo = now - 24 * 60 * 60 * 1_000;

    return this.transaction(() => {
      const minRow = this.db
        .prepare(
          'SELECT COUNT(*) as cnt FROM ai_user_rate_limits WHERE user_id = ? AND request_ts > ?'
        )
        .get(userId, oneMinAgo) as { cnt: number };

      if (minRow.cnt >= perMinute) {
        return {
          allowed: false,
          reason: `Per-user minute limit (${perMinute}/min) exceeded`,
        };
      }

      const dayRow = this.db
        .prepare(
          'SELECT COUNT(*) as cnt FROM ai_user_rate_limits WHERE user_id = ? AND request_ts > ?'
        )
        .get(userId, oneDayAgo) as { cnt: number };

      if (dayRow.cnt >= perDay) {
        return {
          allowed: false,
          reason: `Per-user daily cap (${perDay}/day) exceeded`,
        };
      }

      this.db
        .prepare(
          'INSERT INTO ai_user_rate_limits (user_id, request_ts) VALUES (?, ?)'
        )
        .run(userId, now);

      return { allowed: true };
    });
  }

  /**
   * P4: Retention cleanup for usage records (default 90 days) and audit logs (default 365 days).
   */
  public purgeExpiredRecords(options?: {
    usageRetentionDays?: number;
    auditRetentionDays?: number;
  }): { deletedUsage: number; deletedAudit: number } {
    const usageDays =
      options?.usageRetentionDays ?? ENGINE_DEFAULTS.USAGE_RETENTION_DAYS;
    const auditDays =
      options?.auditRetentionDays ?? ENGINE_DEFAULTS.AUDIT_RETENTION_DAYS;
    const now = this.now();
    const usageCutoff = now - usageDays * 24 * 60 * 60 * 1_000;
    const auditCutoff = now - auditDays * 24 * 60 * 60 * 1_000;

    return this.transaction(() => {
      const uInfo = this.db
        .prepare('DELETE FROM ai_usage_records WHERE created_at < ?')
        .run(usageCutoff);
      const aInfo = this.db
        .prepare('DELETE FROM ai_audit_logs WHERE created_at < ?')
        .run(auditCutoff);
      this.db
        .prepare('DELETE FROM ai_user_rate_limits WHERE request_ts < ?')
        .run(now - 2 * 24 * 60 * 60 * 1_000);

      return {
        deletedUsage: Number(uInfo.changes || 0),
        deletedAudit: Number(aInfo.changes || 0),
      };
    });
  }

  public upsertPersistedNote(params: {
    noteId: string;
    userId: string;
    title: string;
    content: string;
  }): PersistedNoteRecord {
    const now = this.now();
    return this.transaction(() => {
      const existing = this.db
        .prepare(
          'SELECT note_id, user_id, title, content, revision, created_at, updated_at FROM user_notes WHERE note_id = ?'
        )
        .get(params.noteId) as
        | {
            note_id: string;
            user_id: string;
            title: string;
            content: string;
            revision: number;
            created_at: number;
            updated_at: number;
          }
        | undefined;

      if (existing) {
        if (existing.user_id !== params.userId) {
          throw new Error('Forbidden: note belongs to another user');
        }
        const nextRev = existing.revision + 1;
        this.db
          .prepare(
            'UPDATE user_notes SET title = ?, content = ?, revision = ?, updated_at = ? WHERE note_id = ? AND user_id = ?'
          )
          .run(
            params.title,
            params.content,
            nextRev,
            now,
            params.noteId,
            params.userId
          );
        return {
          noteId: params.noteId,
          userId: params.userId,
          title: params.title,
          content: params.content,
          revision: nextRev,
          createdAt: existing.created_at,
          updatedAt: now,
        };
      }

      this.db
        .prepare(
          'INSERT INTO user_notes (note_id, user_id, title, content, revision, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)'
        )
        .run(
          params.noteId,
          params.userId,
          params.title,
          params.content,
          now,
          now
        );
      return {
        noteId: params.noteId,
        userId: params.userId,
        title: params.title,
        content: params.content,
        revision: 1,
        createdAt: now,
        updatedAt: now,
      };
    });
  }

  public getPersistedNote(
    noteId: string,
    userId: string
  ): PersistedNoteRecord | null {
    const row = this.db
      .prepare(
        'SELECT note_id, user_id, title, content, revision, created_at, updated_at FROM user_notes WHERE note_id = ? AND user_id = ?'
      )
      .get(noteId, userId) as
      | {
          note_id: string;
          user_id: string;
          title: string;
          content: string;
          revision: number;
          created_at: number;
          updated_at: number;
        }
      | undefined;
    if (!row) return null;
    return {
      noteId: row.note_id,
      userId: row.user_id,
      title: row.title,
      content: row.content,
      revision: row.revision,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  public deletePersistedNote(noteId: string, userId: string): boolean {
    const info = this.db
      .prepare('DELETE FROM user_notes WHERE note_id = ? AND user_id = ?')
      .run(noteId, userId);
    return Number(info.changes || 0) > 0;
  }

  public close(): void {
    if (this.pruneTimer) {
      clearInterval(this.pruneTimer);
      this.pruneTimer = null;
    }
    try {
      this.db.close();
    } catch {
      // Ignore already closed
    }
  }
}

let sharedStorageInstance: DurableStorage | null = null;

export function getSharedStorage(): DurableStorage {
  if (!sharedStorageInstance) {
    sharedStorageInstance = new DurableStorage();
  }
  return sharedStorageInstance;
}
