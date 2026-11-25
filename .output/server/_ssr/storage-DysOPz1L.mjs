import { a as decryptKeyInMemory, c as getActiveDefaultProviderRegistry, d as redactSecrets, l as hasConfiguredMasterKey, n as ENGINE_DEFAULTS, o as encryptKeyAtRest, t as DEFAULT_SERVER_KEY_DAILY_CAP } from "./security-DUYHl2Kb.mjs";
import { t as DatabaseSync } from "./sqlite-vxxGym0h.mjs";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import dns from "node:dns/promises";
import net from "node:net";
//#region node_modules/.nitro/vite/services/ssr/assets/storage-DysOPz1L.js
var SUPPORTED_PROTOCOLS = /* @__PURE__ */ new Set([
	"openai_compatible",
	"gemini_native",
	"anthropic_native"
]);
/**
* CP4: Hop-by-hop and forbidden headers that custom providers may NEVER override.
*/
var FORBIDDEN_CUSTOM_HEADERS = /* @__PURE__ */ new Set([
	"host",
	"content-length",
	"transfer-encoding",
	"connection",
	"keep-alive",
	"upgrade",
	"proxy-authenticate",
	"proxy-authorization",
	"te",
	"trailer"
]);
/**
* Allowed custom header names in config allowlist (CP4).
*/
var DEFAULT_HEADER_ALLOWLIST = /* @__PURE__ */ new Set([
	"x-title",
	"http-referer",
	"referer",
	"x-organization",
	"x-project",
	"x-request-tag",
	"x-request-id",
	"x-client-name",
	"x-client-version",
	"anthropic-beta",
	"anthropic-version",
	"openai-organization",
	"openai-project"
]);
function isValidIanaTimezone(tz) {
	if (!tz || typeof tz !== "string") return false;
	try {
		Intl.DateTimeFormat(void 0, { timeZone: tz });
		return true;
	} catch {
		return false;
	}
}
function isValidResetTime(resetTime) {
	if (!/^\d{2}:\d{2}$/.test(resetTime)) return false;
	const [hh, mm] = resetTime.split(":").map(Number);
	return hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59;
}
function ipv4ToUint32(ip) {
	const parts = ip.split(".");
	if (parts.length !== 4) return null;
	let acc = 0;
	for (const p of parts) {
		if (!/^\d+$/.test(p)) return null;
		const n = Number(p);
		if (n < 0 || n > 255) return null;
		acc = (acc << 8 | n) >>> 0;
	}
	return acc >>> 0;
}
function inCidr4(ipNum, baseIp, prefixLen) {
	const baseNum = ipv4ToUint32(baseIp);
	if (baseNum === null) return false;
	const mask = prefixLen === 0 ? 0 : -1 << 32 - prefixLen >>> 0;
	return (ipNum & mask) >>> 0 === (baseNum & mask) >>> 0;
}
/**
* CP2: Checks whether an IPv4 address falls inside any rejected SSRF range:
* 0.0.0.0/8, 10.0.0.0/8, 100.64.0.0/10, 127.0.0.0/8, 169.254.0.0/16,
* 172.16.0.0/12, 192.168.0.0/16, 224.0.0.0/4, 240.0.0.0/4
*/
function isRejectedIpv4(ip) {
	const num = ipv4ToUint32(ip);
	if (num === null) return true;
	return inCidr4(num, "0.0.0.0", 8) || inCidr4(num, "10.0.0.0", 8) || inCidr4(num, "100.64.0.0", 10) || inCidr4(num, "127.0.0.0", 8) || inCidr4(num, "169.254.0.0", 16) || inCidr4(num, "172.16.0.0", 12) || inCidr4(num, "192.168.0.0", 16) || inCidr4(num, "224.0.0.0", 4) || inCidr4(num, "240.0.0.0", 4);
}
function expandIpv6ToBytes(ipRaw) {
	let working = ipRaw.replace(/^\[|\]$/g, "").split("%")[0].toLowerCase();
	const lastColon = working.lastIndexOf(":");
	if (lastColon !== -1 && working.slice(lastColon + 1).includes(".")) {
		const v4Num = ipv4ToUint32(working.slice(lastColon + 1));
		if (v4Num === null) return null;
		const hi = (v4Num >>> 16 & 65535).toString(16);
		const lo = (v4Num & 65535).toString(16);
		working = `${working.slice(0, lastColon)}:${hi}:${lo}`;
	}
	const doubleColonParts = working.split("::");
	if (doubleColonParts.length > 2) return null;
	const left = doubleColonParts[0] ? doubleColonParts[0].split(":").filter(Boolean) : [];
	const right = doubleColonParts.length === 2 && doubleColonParts[1] ? doubleColonParts[1].split(":").filter(Boolean) : [];
	const totalHextets = left.length + right.length;
	if (doubleColonParts.length === 1 && totalHextets !== 8) return null;
	if (doubleColonParts.length === 2 && totalHextets > 7) return null;
	const missing = 8 - totalHextets;
	const full = [
		...left,
		...doubleColonParts.length === 2 ? Array(missing).fill("0") : [],
		...right
	];
	if (full.length !== 8) return null;
	const bytes = /* @__PURE__ */ new Uint8Array(16);
	for (let i = 0; i < 8; i++) {
		if (!/^[0-9a-f]{1,4}$/.test(full[i])) return null;
		const val = parseInt(full[i], 16);
		bytes[i * 2] = val >> 8 & 255;
		bytes[i * 2 + 1] = val & 255;
	}
	return bytes;
}
/**
* CP2: Checks whether an IPv6 address falls inside any rejected SSRF range:
* ::/128, ::1/128, fc00::/7, fe80::/10, ff00::/8, or IPv4-mapped ::ffff:0:0/96
*/
function isRejectedIpv6(ip) {
	const bytes = expandIpv6ToBytes(ip);
	if (!bytes) return true;
	if (bytes.every((b) => b === 0)) return true;
	if (bytes.slice(0, 15).every((b) => b === 0) && bytes[15] === 1) return true;
	if (bytes.slice(0, 10).every((b) => b === 0) && bytes[10] === 255 && bytes[11] === 255) return isRejectedIpv4(`${bytes[12]}.${bytes[13]}.${bytes[14]}.${bytes[15]}`);
	if ((bytes[0] & 254) === 252) return true;
	if (bytes[0] === 254 && (bytes[1] & 192) === 128) return true;
	if (bytes[0] === 255) return true;
	return false;
}
/**
* CP2: Checks any literal IP address (v4 or v6) against SSRF rules.
*/
function isRejectedIpAddress(address) {
	const clean = (address || "").trim().replace(/^\[|\]$/g, "");
	if (!clean) return true;
	const family = net.isIP(clean);
	if (family === 4) return isRejectedIpv4(clean);
	if (family === 6) return isRejectedIpv6(clean);
	if (clean.includes(":")) return isRejectedIpv6(clean);
	return true;
}
var defaultDnsLookup = async (hostname) => {
	return dns.lookup(hostname, {
		all: true,
		verbatim: true
	});
};
/**
* CP2: SSRF guard checked on both the URL hostname and the actual resolved connection address(es)
* so DNS rebinding cannot bypass it.
*/
async function verifyConnectionTargetSafe(urlStr, options) {
	let parsed;
	try {
		parsed = new URL(urlStr);
	} catch {
		return {
			safe: false,
			reason: "Invalid URL syntax",
			resolvedAddresses: []
		};
	}
	if (parsed.username || parsed.password) return {
		safe: false,
		reason: "Credentials inside URLs are forbidden (PR2)",
		resolvedAddresses: []
	};
	const rawHost = parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase();
	const isLoopbackHost = rawHost === "localhost" || rawHost === "127.0.0.1" || rawHost === "::1";
	const allowLocalHttp = Boolean(options?.allowInsecureLocalhost) && isLoopbackHost;
	if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && allowLocalHttp)) return {
		safe: false,
		reason: `Disallowed protocol "${parsed.protocol}" (HTTPS required)`,
		resolvedAddresses: []
	};
	if (allowLocalHttp) return {
		safe: true,
		resolvedAddresses: [rawHost]
	};
	if (net.isIP(rawHost) !== 0 || rawHost.includes(":")) {
		if (isRejectedIpAddress(rawHost)) return {
			safe: false,
			reason: `SSRF guard rejected literal IP address: ${rawHost}`,
			resolvedAddresses: [rawHost]
		};
		return {
			safe: true,
			resolvedAddresses: [rawHost]
		};
	}
	if (rawHost === "localhost" || rawHost.endsWith(".localhost") || rawHost.endsWith(".internal")) return {
		safe: false,
		reason: `SSRF guard rejected local/internal hostname: ${rawHost}`,
		resolvedAddresses: []
	};
	const lookupFn = options?.dnsLookup || defaultDnsLookup;
	let records;
	try {
		records = await lookupFn(rawHost);
	} catch (err) {
		return {
			safe: false,
			reason: `DNS resolution failed for ${rawHost}: ${err instanceof Error ? err.message : "unknown"}`,
			resolvedAddresses: []
		};
	}
	if (!Array.isArray(records) || records.length === 0) return {
		safe: false,
		reason: `DNS resolution returned no addresses for ${rawHost}`,
		resolvedAddresses: []
	};
	const resolvedAddresses = [];
	for (const rec of records) {
		resolvedAddresses.push(rec.address);
		if (isRejectedIpAddress(rec.address)) return {
			safe: false,
			reason: `SSRF guard rejected resolved address ${rec.address} for host ${rawHost}`,
			resolvedAddresses
		};
	}
	return {
		safe: true,
		resolvedAddresses
	};
}
/**
* CP4: Validates and filters custom headers against the allowlist and hop-by-hop blocklist.
*/
function validateCustomHeaders(customHeaders, configAllowlist = DEFAULT_HEADER_ALLOWLIST) {
	const sanitized = {};
	const errors = [];
	if (!customHeaders) return {
		valid: true,
		sanitized,
		errors
	};
	for (const [rawName, rawValue] of Object.entries(customHeaders)) {
		const lowerName = rawName.trim().toLowerCase();
		if (!lowerName) continue;
		if (FORBIDDEN_CUSTOM_HEADERS.has(lowerName)) {
			errors.push(`Header "${rawName}" is a forbidden hop-by-hop/system header (CP4)`);
			continue;
		}
		if (!configAllowlist.has(lowerName)) {
			errors.push(`Header "${rawName}" is not in the custom header allowlist (CP4)`);
			continue;
		}
		sanitized[rawName.trim()] = String(rawValue);
	}
	return {
		valid: errors.length === 0,
		sanitized,
		errors
	};
}
/**
* PR2: Validates a single provider configuration entry.
*/
function validateProviderConfig(provider, options) {
	const errors = [];
	if (!provider || typeof provider !== "object") return {
		valid: false,
		errors: ["Provider config must be an object"]
	};
	const providerId = (provider.provider_id || "").trim();
	if (!providerId || !/^[a-zA-Z0-9_-]+$/.test(providerId)) errors.push("provider_id must be a non-empty alphanumeric/underscore/hyphen string");
	if (!SUPPORTED_PROTOCOLS.has(provider.protocol)) errors.push(`Unsupported protocol "${String(provider.protocol)}"`);
	let parsedUrl = null;
	try {
		parsedUrl = new URL(provider.base_url);
	} catch {
		errors.push(`Invalid base_url "${String(provider.base_url)}"`);
	}
	if (parsedUrl) {
		if (parsedUrl.username || parsedUrl.password) errors.push("Credentials inside base_url are forbidden (PR2)");
		const host = parsedUrl.hostname.replace(/^\[|\]$/g, "").toLowerCase();
		const isLocalhost = host === "localhost" || host === "127.0.0.1" || host === "::1";
		const allowHttp = Boolean(options?.allowInsecureLocalhost) && !provider.custom && isLocalhost;
		if (parsedUrl.protocol !== "https:" && !(parsedUrl.protocol === "http:" && allowHttp)) errors.push("base_url must use https:// (http:// allowed only for localhost when ALLOW_INSECURE_LOCALHOST=true and custom=false)");
		if (provider.custom) {
			if (net.isIP(host) !== 0 || host.includes(":")) {
				if (isRejectedIpAddress(host)) errors.push(`Custom provider base_url host "${host}" rejected by SSRF guard (CP2)`);
			} else if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal")) errors.push(`Custom provider base_url host "${host}" rejected by SSRF guard (CP2)`);
		}
	}
	const resolvedKeys = [];
	if (Array.isArray(provider.keys) && provider.keys.length > 0) for (const k of provider.keys) {
		if (!k.key_id || !k.key_env_var_name && !k.encrypted_key_ref) {
			errors.push(`Key entry "${k.key_id || "unknown"}" must specify key_env_var_name or encrypted_key_ref`);
			continue;
		}
		if (k.key_env_var_name && (/^(AIza|sk-|gsk_|cc_|csk-|nvapi-|ghp_)/.test(k.key_env_var_name) || !/^[A-Z0-9_]+$/.test(k.key_env_var_name))) errors.push(`key_env_var_name "${redactSecrets(k.key_env_var_name)}" looks like a raw secret or invalid env var name (PR4)`);
		resolvedKeys.push(k);
	}
	else if (provider.key_env_var_name) if (/^(AIza|sk-|gsk_|cc_|csk-|nvapi-|ghp_)/.test(provider.key_env_var_name) || !/^[A-Z0-9_]+$/.test(provider.key_env_var_name)) errors.push(`key_env_var_name "${redactSecrets(provider.key_env_var_name)}" looks like a raw secret or invalid env var name (PR4)`);
	else resolvedKeys.push({
		key_id: `${providerId}_key_1`,
		key_env_var_name: provider.key_env_var_name
	});
	else errors.push("Provider must specify key_env_var_name or non-empty keys list");
	if (!Array.isArray(provider.models) || provider.models.length === 0) errors.push("Provider must declare at least one model (PR2)");
	else {
		const seenModels = /* @__PURE__ */ new Set();
		for (const m of provider.models) {
			if (!m.model_id || typeof m.model_id !== "string") errors.push("Each model must have a non-empty model_id");
			else if (seenModels.has(m.model_id)) errors.push(`Duplicate model_id "${m.model_id}" in provider "${providerId}"`);
			else seenModels.add(m.model_id);
			if (!Number.isInteger(m.context_window) || m.context_window <= 0) errors.push(`Model "${m.model_id}" context_window must be a positive integer`);
			if (!Number.isInteger(m.max_output) || m.max_output <= 0) errors.push(`Model "${m.model_id}" max_output must be a positive integer`);
		}
	}
	for (const field of [
		"rpm",
		"rpd",
		"tpm",
		"tpd"
	]) {
		const val = provider[field];
		if (!Number.isInteger(val) || val <= 0) errors.push(`${field} must be a positive integer`);
	}
	if (!isValidIanaTimezone(provider.reset_timezone)) errors.push(`Invalid IANA reset_timezone "${String(provider.reset_timezone)}"`);
	if (!isValidResetTime(provider.reset_time)) errors.push(`Invalid reset_time "${String(provider.reset_time)}" (expected HH:MM)`);
	if (!Number.isInteger(provider.priority)) errors.push("priority must be an integer");
	if (provider.allowed_custom_headers) {
		const hdrCheck = validateCustomHeaders(provider.allowed_custom_headers);
		if (!hdrCheck.valid) errors.push(...hdrCheck.errors);
	}
	if (errors.length > 0) return {
		valid: false,
		errors
	};
	const configHash = crypto.createHash("sha256").update(JSON.stringify(provider)).digest("hex").slice(0, 16);
	return {
		valid: true,
		errors: [],
		validated: {
			...provider,
			enabled: provider.custom ? false : provider.enabled !== false,
			probed: !provider.custom,
			config_hash: configHash,
			resolved_keys: resolvedKeys
		}
	};
}
/**
* PR2: Validates a full registry configuration. Invalid providers are disabled and logged.
* Never applies a half-broken global structure.
*/
function validateRegistryConfig(config, options) {
	const allowInsecureLocalhost = options?.allowInsecureLocalhost ?? process.env.ALLOW_INSECURE_LOCALHOST === "true";
	const log = options?.logger || ((msg) => console.warn("[AI Config]", msg));
	const seenIds = /* @__PURE__ */ new Set();
	const validProviders = [];
	const disabledProviders = [];
	for (const p of config.providers || []) {
		const pid = (p?.provider_id || "").trim() || "unknown";
		if (seenIds.has(pid)) {
			const errMsg = `Duplicate provider_id "${pid}" (PR2)`;
			log(`Disabling provider "${pid}": ${errMsg}`);
			disabledProviders.push({
				provider_id: pid,
				errors: [errMsg]
			});
			continue;
		}
		seenIds.add(pid);
		const res = validateProviderConfig(p, { allowInsecureLocalhost });
		if (!res.valid || !res.validated) {
			log(`Disabling invalid provider "${pid}": ${redactSecrets(res.errors.join("; "))}`);
			disabledProviders.push({
				provider_id: pid,
				errors: res.errors
			});
			continue;
		}
		validProviders.push(res.validated);
	}
	return {
		validProviders,
		disabledProviders,
		configHash: crypto.createHash("sha256").update(JSON.stringify(validProviders.map((vp) => vp.config_hash))).digest("hex").slice(0, 16)
	};
}
ENGINE_DEFAULTS.UNKNOWN_RPM, ENGINE_DEFAULTS.UNKNOWN_RPD, ENGINE_DEFAULTS.UNKNOWN_TPM, ENGINE_DEFAULTS.UNKNOWN_TPD, ENGINE_DEFAULTS.UNKNOWN_RESET_TIMEZONE, ENGINE_DEFAULTS.UNKNOWN_RESET_TIME;
/**
* Default Owner Provider Registry Table (populated from existing codebase + Section 1 defaults for [FILL] values).
*/
var DEFAULT_ENGINE_REGISTRY_CONFIG = {
	global: {
		user_messages_per_minute: ENGINE_DEFAULTS.USER_RATE_LIMIT_PER_MINUTE,
		user_daily_message_cap: ENGINE_DEFAULTS.USER_DAILY_MESSAGE_CAP,
		daily_spend_cap_usd: ENGINE_DEFAULTS.DAILY_SPEND_CAP_USD,
		currency: "USD",
		overall_deadline_ms: ENGINE_DEFAULTS.OVERALL_DEADLINE_MS,
		per_attempt_timeout_ms: ENGINE_DEFAULTS.PER_ATTEMPT_TIMEOUT_MS
	},
	providers: getActiveDefaultProviderRegistry()
};
var _001_ai_engine_default = "-- Complete additive SQL migration for Hardened AI Engine (Sections 4, 6, 11, 12, 13, 14, 15)\n-- Rules: CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS only. No drops, deletes, or alterations.\n\nCREATE TABLE IF NOT EXISTS ai_encrypted_keys (\n  provider_id TEXT NOT NULL,\n  key_id TEXT NOT NULL,\n  iv_hex TEXT NOT NULL,\n  auth_tag_hex TEXT NOT NULL,\n  ciphertext_hex TEXT NOT NULL,\n  last4 TEXT NOT NULL,\n  created_at INTEGER NOT NULL,\n  updated_at INTEGER NOT NULL,\n  version INTEGER NOT NULL DEFAULT 1,\n  PRIMARY KEY (provider_id, key_id)\n);\n\nCREATE TABLE IF NOT EXISTS ai_key_states (\n  provider_id TEXT NOT NULL,\n  key_id TEXT NOT NULL,\n  state TEXT NOT NULL DEFAULT 'ACTIVE',\n  state_until INTEGER,\n  reason TEXT NOT NULL DEFAULT 'initialized',\n  consecutive_transient_failures INTEGER NOT NULL DEFAULT 0,\n  first_transient_failure_at INTEGER,\n  circuit_open_count INTEGER NOT NULL DEFAULT 0,\n  half_open_probe_in_flight INTEGER NOT NULL DEFAULT 0,\n  rate_limit_timestamps_json TEXT NOT NULL DEFAULT '[]',\n  last_used_at INTEGER NOT NULL DEFAULT 0,\n  last_error_class TEXT,\n  updated_at INTEGER NOT NULL,\n  version INTEGER NOT NULL DEFAULT 1,\n  PRIMARY KEY (provider_id, key_id)\n);\n\nCREATE TABLE IF NOT EXISTS ai_model_availability (\n  provider_id TEXT NOT NULL,\n  key_id TEXT NOT NULL,\n  model_id TEXT NOT NULL,\n  unavailable_until INTEGER,\n  unavailable_until_config_hash TEXT,\n  reason TEXT NOT NULL,\n  updated_at INTEGER NOT NULL,\n  version INTEGER NOT NULL DEFAULT 1,\n  PRIMARY KEY (provider_id, key_id, model_id)\n);\n\nCREATE TABLE IF NOT EXISTS ai_quota_reservations (\n  reservation_id TEXT PRIMARY KEY,\n  request_id TEXT NOT NULL,\n  provider_id TEXT NOT NULL,\n  key_id TEXT NOT NULL,\n  model_id TEXT NOT NULL,\n  created_at INTEGER NOT NULL,\n  period_window_start INTEGER NOT NULL,\n  period_window_end INTEGER NOT NULL,\n  tokens_reserved INTEGER NOT NULL,\n  tokens_actual INTEGER,\n  tokens_estimated INTEGER NOT NULL DEFAULT 1,\n  finalized INTEGER NOT NULL DEFAULT 0\n);\n\nCREATE INDEX IF NOT EXISTS idx_ai_quota_rolling\n  ON ai_quota_reservations (provider_id, key_id, model_id, created_at);\n\nCREATE INDEX IF NOT EXISTS idx_ai_quota_period\n  ON ai_quota_reservations (provider_id, key_id, model_id, period_window_start, period_window_end);\n\nCREATE TABLE IF NOT EXISTS ai_provider_reset_overrides (\n  provider_id TEXT NOT NULL,\n  key_id TEXT NOT NULL,\n  model_id TEXT NOT NULL,\n  window_type TEXT NOT NULL,\n  strict_remaining_requests INTEGER,\n  strict_remaining_tokens INTEGER,\n  reset_at INTEGER NOT NULL,\n  updated_at INTEGER NOT NULL,\n  PRIMARY KEY (provider_id, key_id, model_id, window_type)\n);\n\nCREATE TABLE IF NOT EXISTS ai_usage_records (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  request_id TEXT NOT NULL,\n  attempt_no INTEGER NOT NULL,\n  provider_id TEXT NOT NULL,\n  key_id TEXT NOT NULL,\n  model_id TEXT NOT NULL,\n  class TEXT NOT NULL,\n  http_status INTEGER,\n  latency_ms INTEGER NOT NULL,\n  input_tokens INTEGER NOT NULL,\n  output_tokens INTEGER NOT NULL,\n  tokens_estimated INTEGER NOT NULL DEFAULT 1,\n  cost_usd REAL NOT NULL DEFAULT 0,\n  created_at INTEGER NOT NULL\n);\n\nCREATE INDEX IF NOT EXISTS idx_ai_usage_created_at\n  ON ai_usage_records (created_at);\n\nCREATE INDEX IF NOT EXISTS idx_ai_usage_provider_created\n  ON ai_usage_records (provider_id, created_at);\n\nCREATE TABLE IF NOT EXISTS ai_pending_actions (\n  id TEXT PRIMARY KEY,\n  user_id TEXT NOT NULL,\n  conversation_id TEXT NOT NULL,\n  tool TEXT NOT NULL,\n  canonical_args TEXT NOT NULL,\n  args_hash TEXT NOT NULL,\n  preview_text TEXT NOT NULL,\n  code_hash TEXT NOT NULL,\n  target_id TEXT NOT NULL,\n  target_version INTEGER NOT NULL,\n  status TEXT NOT NULL DEFAULT 'pending',\n  expires_at INTEGER NOT NULL,\n  attempts_left INTEGER NOT NULL DEFAULT 5,\n  executing_started_at INTEGER,\n  created_at INTEGER NOT NULL,\n  updated_at INTEGER NOT NULL,\n  version INTEGER NOT NULL DEFAULT 1\n);\n\nCREATE INDEX IF NOT EXISTS idx_ai_pending_user_conv\n  ON ai_pending_actions (user_id, conversation_id, status);\n\nCREATE TABLE IF NOT EXISTS ai_audit_logs (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  event_type TEXT NOT NULL,\n  user_id TEXT,\n  conversation_id TEXT,\n  action_id TEXT,\n  provider_id TEXT,\n  key_id TEXT,\n  details_json TEXT NOT NULL,\n  created_at INTEGER NOT NULL\n);\n\nCREATE INDEX IF NOT EXISTS idx_ai_audit_created_at\n  ON ai_audit_logs (created_at);\n\nCREATE TABLE IF NOT EXISTS ai_kill_switches (\n  scope TEXT NOT NULL,\n  target_id TEXT NOT NULL,\n  killed INTEGER NOT NULL DEFAULT 0,\n  reason TEXT,\n  updated_at INTEGER NOT NULL,\n  version INTEGER NOT NULL DEFAULT 1,\n  PRIMARY KEY (scope, target_id)\n);\n\nCREATE TABLE IF NOT EXISTS ai_user_rate_limits (\n  user_id TEXT NOT NULL,\n  request_ts INTEGER NOT NULL\n);\n\nCREATE INDEX IF NOT EXISTS idx_ai_user_rate_ts\n  ON ai_user_rate_limits (user_id, request_ts);\n\nCREATE TABLE IF NOT EXISTS ai_stored_messages (\n  message_id TEXT PRIMARY KEY,\n  conversation_id TEXT NOT NULL,\n  user_id TEXT NOT NULL,\n  role TEXT NOT NULL,\n  content TEXT NOT NULL,\n  status TEXT NOT NULL,\n  created_at INTEGER NOT NULL,\n  updated_at INTEGER NOT NULL\n);\n\nCREATE TABLE IF NOT EXISTS ai_message_feedback (\n  message_id TEXT NOT NULL,\n  session_id TEXT NOT NULL,\n  user_id TEXT NOT NULL,\n  rating TEXT NOT NULL,\n  reason TEXT,\n  updated_at INTEGER NOT NULL,\n  PRIMARY KEY (message_id, user_id)\n);\n\n";
/**
* Section 13: PERSISTENCE AND CONCURRENCY (P1 - P4) & Phase 1.5, 2.7, 2.8
* Uses built-in Node.js SQLite (node:sqlite DatabaseSync) with WAL mode and
* BEGIN IMMEDIATE transactions + Compare-And-Set version checks.
*/
var CasConflictError = class extends Error {
	constructor(message) {
		super(message);
		this.name = "CasConflictError";
	}
};
function mapKeyStateToSimplified(state) {
	switch (state) {
		case "ACTIVE": return "usable";
		case "COOLDOWN": return "rate_limited";
		case "QUOTA_EXHAUSTED": return "no_credit";
		default: return "broken";
	}
}
var systemClock = { now: () => Date.now() };
var USAGE_RETENTION_MS = 2592e6;
var DAILY_PRUNE_INTERVAL_MS = 864e5;
var DurableStorage = class {
	db;
	dbPath;
	persistenceMode;
	inTransaction = false;
	clock;
	pruneTimer = null;
	constructor(options) {
		const opts = typeof options === "string" ? { dbPath: options } : options || {};
		this.clock = opts.clock || systemClock;
		const isServerlessRuntime = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NETLIFY);
		const resolvedPath = opts.dbPath || process.env.AI_ENGINE_DB_PATH || (isServerlessRuntime ? ":memory:" : ":memory:");
		this.dbPath = resolvedPath;
		hasConfiguredMasterKey();
		try {
			if (resolvedPath !== ":memory:") {
				const dir = path.dirname(resolvedPath);
				if (!fs.existsSync(dir)) fs.mkdirSync(dir, {
					recursive: true,
					mode: 448
				});
			}
			this.db = new DatabaseSync(resolvedPath);
			if (resolvedPath !== ":memory:") try {
				fs.chmodSync(resolvedPath, 384);
			} catch {}
			this.db.exec("PRAGMA busy_timeout = 5000;");
			this.db.exec("PRAGMA journal_mode = WAL;");
			this.db.exec("PRAGMA synchronous = NORMAL;");
			this.db.exec("PRAGMA foreign_keys = ON;");
			this.runMigrations();
			this.persistenceMode = resolvedPath === ":memory:" ? "memory" : "durable";
		} catch (err) {
			if (opts.dbPath || !isServerlessRuntime && process.env.ALLOW_MEMORY_DB_FALLBACK !== "true") throw err;
			this.dbPath = ":memory:";
			this.persistenceMode = "memory";
			this.db = new DatabaseSync(":memory:");
			this.db.exec("PRAGMA foreign_keys = ON;");
			this.runMigrations();
		}
		this.pruneOldUsageRecords();
		this.pruneTimer = setInterval(() => {
			try {
				this.pruneOldUsageRecords();
			} catch {}
		}, DAILY_PRUNE_INTERVAL_MS);
		if (typeof this.pruneTimer.unref === "function") this.pruneTimer.unref();
	}
	setClock(clock) {
		this.clock = clock;
	}
	now() {
		return this.clock.now();
	}
	runMigrations() {
		const sql = _001_ai_engine_default;
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
			this.db.exec("ALTER TABLE user_notes ADD COLUMN created_at INTEGER NOT NULL DEFAULT 0;");
		} catch {}
	}
	/**
	* P2: Runs a synchronous callback inside an atomic BEGIN IMMEDIATE transaction.
	* Supports nested calls safely via SAVEPOINT.
	*/
	transaction(fn) {
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
		this.db.exec("BEGIN IMMEDIATE");
		try {
			const result = fn();
			this.db.exec("COMMIT");
			return result;
		} catch (err) {
			try {
				this.db.exec("ROLLBACK");
			} catch {}
			throw err;
		} finally {
			this.inTransaction = false;
		}
	}
	runImmediateTransaction(fn) {
		return this.transaction(fn);
	}
	/**
	* Phase 2.8: Prunes usage records older than 30 days on startup and once per day.
	*/
	pruneOldUsageRecords(retentionMs = USAGE_RETENTION_MS) {
		const cutoff = this.now() - retentionMs;
		const res = this.db.prepare("DELETE FROM ai_usage_records WHERE created_at < ?").run(cutoff);
		return Number(res.changes || 0);
	}
	isKillSwitchEnabled() {
		const envVal = (process.env.AI_ENGINE_ENABLED || "").trim().toLowerCase();
		if (envVal === "false" || envVal === "0" || envVal === "off") return false;
		const row = this.db.prepare("SELECT meta_value FROM ai_engine_meta WHERE meta_key = ?").get("AI_ENGINE_ENABLED");
		if (row && (row.meta_value === "false" || row.meta_value === "0")) return false;
		return true;
	}
	setKillSwitchEnabled(enabled) {
		const now = this.now();
		this.db.prepare(`INSERT INTO ai_engine_meta (meta_key, meta_value, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(meta_key) DO UPDATE SET
           meta_value = excluded.meta_value,
           updated_at = excluded.updated_at`).run("AI_ENGINE_ENABLED", enabled ? "true" : "false", now);
	}
	getUtcDayString(timestampMs = this.now()) {
		return new Date(timestampMs).toISOString().slice(0, 10);
	}
	getServerKeyDailyCount(utcDay = this.getUtcDayString()) {
		const metaKey = `SERVER_KEY_DAILY_COUNT:${utcDay}`;
		const row = this.db.prepare("SELECT meta_value FROM ai_engine_meta WHERE meta_key = ?").get(metaKey);
		if (!row) return 0;
		const parsed = Number.parseInt(row.meta_value, 10);
		return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
	}
	incrementServerKeyDailyCount(utcDay = this.getUtcDayString()) {
		const metaKey = `SERVER_KEY_DAILY_COUNT:${utcDay}`;
		const now = this.now();
		return this.transaction(() => {
			const next = this.getServerKeyDailyCount(utcDay) + 1;
			this.db.prepare(`INSERT INTO ai_engine_meta (meta_key, meta_value, updated_at)
           VALUES (?, ?, ?)
           ON CONFLICT(meta_key) DO UPDATE SET
             meta_value = excluded.meta_value,
             updated_at = excluded.updated_at`).run(metaKey, String(next), now);
			return next;
		});
	}
	isServerKeyDailyCapReached(capOverride) {
		const envCapRaw = process.env.AI_SERVER_KEY_DAILY_CAP;
		const envCap = envCapRaw !== void 0 && envCapRaw.trim() !== "" ? Number.parseInt(envCapRaw.trim(), 10) : DEFAULT_SERVER_KEY_DAILY_CAP;
		const cap = capOverride !== void 0 ? capOverride : Number.isFinite(envCap) && envCap >= 0 ? envCap : DEFAULT_SERVER_KEY_DAILY_CAP;
		if (cap <= 0) return true;
		return this.getServerKeyDailyCount() >= cap;
	}
	/**
	* SEC2 & CP6: Encrypts and stores a key at rest using compare-and-set on version.
	*/
	storeEncryptedKey(providerId, keyId, plainKey, masterKeyOverride) {
		const enc = encryptKeyAtRest(plainKey, masterKeyOverride);
		const now = this.now();
		return this.transaction(() => {
			const existing = this.db.prepare("SELECT version FROM ai_encrypted_keys WHERE provider_id = ? AND key_id = ?").get(providerId, keyId);
			if (!existing) {
				this.db.prepare(`INSERT INTO ai_encrypted_keys
             (provider_id, key_id, iv_hex, auth_tag_hex, ciphertext_hex, last4, created_at, updated_at, version)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`).run(providerId, keyId, enc.iv_hex, enc.auth_tag_hex, enc.ciphertext_hex, enc.last4, now, now);
				return {
					last4: enc.last4,
					version: 1
				};
			}
			const nextVer = existing.version + 1;
			if (this.db.prepare(`UPDATE ai_encrypted_keys
           SET iv_hex = ?, auth_tag_hex = ?, ciphertext_hex = ?, last4 = ?, updated_at = ?, version = ?
           WHERE provider_id = ? AND key_id = ? AND version = ?`).run(enc.iv_hex, enc.auth_tag_hex, enc.ciphertext_hex, enc.last4, now, nextVer, providerId, keyId, existing.version).changes !== 1) throw new CasConflictError(`CAS conflict updating encrypted key ${providerId}/${keyId}`);
			return {
				last4: enc.last4,
				version: nextVer
			};
		});
	}
	/**
	* SEC2: Decrypts a stored key in memory only at call time.
	*/
	getDecryptedKey(providerId, keyId, masterKeyOverride) {
		const row = this.db.prepare(`SELECT provider_id, key_id, iv_hex, auth_tag_hex, ciphertext_hex, last4, version
         FROM ai_encrypted_keys WHERE provider_id = ? AND key_id = ?`).get(providerId, keyId);
		if (!row) return null;
		return decryptKeyInMemory(row, masterKeyOverride);
	}
	/**
	* SEC2: Returns only the last 4 characters of a stored key for UI display.
	*/
	getKeyLast4(providerId, keyId) {
		const row = this.db.prepare("SELECT last4 FROM ai_encrypted_keys WHERE provider_id = ? AND key_id = ?").get(providerId, keyId);
		return row ? row.last4 : null;
	}
	/**
	* Appends a redacted audit log entry.
	*/
	appendAuditLog(params) {
		const safeDetailsJson = redactSecrets(JSON.stringify(params.details));
		this.db.prepare(`INSERT INTO ai_audit_logs
         (event_type, user_id, conversation_id, action_id, provider_id, key_id, details_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(params.eventType, params.userId ?? null, params.conversationId ?? null, params.actionId ?? null, params.providerId ?? null, params.keyId ?? null, safeDetailsJson, this.now());
	}
	getAuditLogs(limit = 100) {
		return this.db.prepare(`SELECT id, event_type, user_id, conversation_id, action_id, provider_id, key_id, details_json, created_at
         FROM ai_audit_logs ORDER BY id DESC LIMIT ?`).all(limit).map((r) => ({
			id: r.id,
			event_type: r.event_type,
			user_id: r.user_id,
			conversation_id: r.conversation_id,
			action_id: r.action_id,
			provider_id: r.provider_id,
			key_id: r.key_id,
			details: JSON.parse(r.details_json || "{}"),
			created_at: r.created_at
		}));
	}
	/**
	* SEC4: Per-user rate limit (default 20 messages/minute + configurable daily cap).
	*/
	checkAndRecordUserRateLimit(userId, limits) {
		const perMinute = limits?.perMinute ?? ENGINE_DEFAULTS.USER_RATE_LIMIT_PER_MINUTE;
		const perDay = limits?.perDay ?? ENGINE_DEFAULTS.USER_DAILY_MESSAGE_CAP;
		const now = this.now();
		const oneMinAgo = now - 6e4;
		const oneDayAgo = now - 864e5;
		return this.transaction(() => {
			if (this.db.prepare("SELECT COUNT(*) as cnt FROM ai_user_rate_limits WHERE user_id = ? AND request_ts > ?").get(userId, oneMinAgo).cnt >= perMinute) return {
				allowed: false,
				reason: `Per-user minute limit (${perMinute}/min) exceeded`
			};
			if (this.db.prepare("SELECT COUNT(*) as cnt FROM ai_user_rate_limits WHERE user_id = ? AND request_ts > ?").get(userId, oneDayAgo).cnt >= perDay) return {
				allowed: false,
				reason: `Per-user daily cap (${perDay}/day) exceeded`
			};
			this.db.prepare("INSERT INTO ai_user_rate_limits (user_id, request_ts) VALUES (?, ?)").run(userId, now);
			return { allowed: true };
		});
	}
	/**
	* P4: Retention cleanup for usage records (default 90 days) and audit logs (default 365 days).
	*/
	purgeExpiredRecords(options) {
		const usageDays = options?.usageRetentionDays ?? ENGINE_DEFAULTS.USAGE_RETENTION_DAYS;
		const auditDays = options?.auditRetentionDays ?? ENGINE_DEFAULTS.AUDIT_RETENTION_DAYS;
		const now = this.now();
		const usageCutoff = now - usageDays * 24 * 60 * 60 * 1e3;
		const auditCutoff = now - auditDays * 24 * 60 * 60 * 1e3;
		return this.transaction(() => {
			const uInfo = this.db.prepare("DELETE FROM ai_usage_records WHERE created_at < ?").run(usageCutoff);
			const aInfo = this.db.prepare("DELETE FROM ai_audit_logs WHERE created_at < ?").run(auditCutoff);
			this.db.prepare("DELETE FROM ai_user_rate_limits WHERE request_ts < ?").run(now - 1728e5);
			return {
				deletedUsage: Number(uInfo.changes || 0),
				deletedAudit: Number(aInfo.changes || 0)
			};
		});
	}
	upsertPersistedNote(params) {
		const now = this.now();
		return this.transaction(() => {
			const existing = this.db.prepare("SELECT note_id, user_id, title, content, revision, created_at, updated_at FROM user_notes WHERE note_id = ?").get(params.noteId);
			if (existing) {
				if (existing.user_id !== params.userId) throw new Error("Forbidden: note belongs to another user");
				const nextRev = existing.revision + 1;
				this.db.prepare("UPDATE user_notes SET title = ?, content = ?, revision = ?, updated_at = ? WHERE note_id = ? AND user_id = ?").run(params.title, params.content, nextRev, now, params.noteId, params.userId);
				return {
					noteId: params.noteId,
					userId: params.userId,
					title: params.title,
					content: params.content,
					revision: nextRev,
					createdAt: existing.created_at,
					updatedAt: now
				};
			}
			this.db.prepare("INSERT INTO user_notes (note_id, user_id, title, content, revision, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)").run(params.noteId, params.userId, params.title, params.content, now, now);
			return {
				noteId: params.noteId,
				userId: params.userId,
				title: params.title,
				content: params.content,
				revision: 1,
				createdAt: now,
				updatedAt: now
			};
		});
	}
	getPersistedNote(noteId, userId) {
		const row = this.db.prepare("SELECT note_id, user_id, title, content, revision, created_at, updated_at FROM user_notes WHERE note_id = ? AND user_id = ?").get(noteId, userId);
		if (!row) return null;
		return {
			noteId: row.note_id,
			userId: row.user_id,
			title: row.title,
			content: row.content,
			revision: row.revision,
			createdAt: row.created_at,
			updatedAt: row.updated_at
		};
	}
	deletePersistedNote(noteId, userId) {
		const info = this.db.prepare("DELETE FROM user_notes WHERE note_id = ? AND user_id = ?").run(noteId, userId);
		return Number(info.changes || 0) > 0;
	}
	saveMessageFeedback(params) {
		const now = this.now();
		this.db.exec(`
      CREATE TABLE IF NOT EXISTS ai_message_feedback (
        message_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        rating TEXT NOT NULL,
        reason TEXT,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (message_id, user_id)
      );
    `);
		const cleanReason = params.reason ? String(params.reason).trim().slice(0, 500) : null;
		this.db.prepare(`INSERT INTO ai_message_feedback (message_id, session_id, user_id, rating, reason, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(message_id, user_id) DO UPDATE SET
           session_id = excluded.session_id,
           rating = excluded.rating,
           reason = excluded.reason,
           updated_at = excluded.updated_at`).run(String(params.messageId).slice(0, 120), String(params.sessionId || "").slice(0, 120), String(params.userId || "local").slice(0, 120), params.rating, cleanReason, now);
		return {
			messageId: params.messageId,
			rating: params.rating,
			...cleanReason ? { reason: cleanReason } : {},
			updatedAt: now
		};
	}
	close() {
		if (this.pruneTimer) {
			clearInterval(this.pruneTimer);
			this.pruneTimer = null;
		}
		try {
			this.db.close();
		} catch {}
	}
};
var sharedStorageInstance = null;
function getSharedStorage() {
	if (!sharedStorageInstance) sharedStorageInstance = new DurableStorage();
	return sharedStorageInstance;
}
//#endregion
export { mapKeyStateToSimplified as a, verifyConnectionTargetSafe as c, getSharedStorage as i, DEFAULT_ENGINE_REGISTRY_CONFIG as n, validateCustomHeaders as o, DurableStorage as r, validateRegistryConfig as s, CasConflictError as t };
