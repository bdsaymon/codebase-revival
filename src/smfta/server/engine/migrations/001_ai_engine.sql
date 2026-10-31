-- Complete additive SQL migration for Hardened AI Engine (Sections 4, 6, 11, 12, 13, 14, 15)
-- Rules: CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS only. No drops, deletes, or alterations.

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
