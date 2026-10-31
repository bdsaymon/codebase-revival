import dns from 'node:dns/promises';
import net from 'node:net';
import crypto from 'node:crypto';
import { ENGINE_DEFAULTS, getActiveDefaultProviderRegistry } from './defaults';
import { redactSecrets } from './security';

/**
 * Sections 2 & 3: PROVIDER REGISTRY AND CONFIG (PR1-PR4) & CUSTOM PROVIDERS (CP1-CP7)
 */

export type SupportedProtocol =
  | 'openai_compatible'
  | 'gemini_native'
  | 'anthropic_native';

export const SUPPORTED_PROTOCOLS: ReadonlySet<SupportedProtocol> = new Set([
  'openai_compatible',
  'gemini_native',
  'anthropic_native',
]);

export interface ModelConfig {
  model_id: string;
  context_window: number;
  max_output: number;
  tools: boolean;
  json: boolean;
  stream: boolean;
  input_price_per_1k?: number;
  output_price_per_1k?: number;
}

export interface KeyPoolEntryConfig {
  key_id: string;
  key_env_var_name?: string;
  encrypted_key_ref?: string;
}

export interface ProviderConfig {
  provider_id: string;
  protocol: SupportedProtocol;
  base_url: string;
  key_env_var_name?: string;
  keys?: KeyPoolEntryConfig[];
  models: ModelConfig[];
  rpm: number;
  rpd: number;
  tpm: number;
  tpd: number;
  reset_timezone: string;
  reset_time: string;
  priority: number;
  custom: boolean;
  enabled?: boolean;
  auth_header_name?: string;
  auth_header_format?: 'Bearer' | 'raw';
  allowed_custom_headers?: Record<string, string>;
  custom_headers?: Record<string, string>;
  notes?: string;
}

export interface GlobalEngineSettings {
  user_messages_per_minute: number;
  user_daily_message_cap: number;
  daily_spend_cap_usd: number;
  currency: 'USD';
  overall_deadline_ms: number;
  per_attempt_timeout_ms: number;
}

export interface EngineRegistryConfig {
  global: GlobalEngineSettings;
  providers: ProviderConfig[];
}

export interface ValidatedProvider extends ProviderConfig {
  enabled: boolean;
  probed: boolean;
  config_hash: string;
  resolved_keys: KeyPoolEntryConfig[];
  is_client_supplied?: boolean;
}

export interface ConfigValidationReport {
  validProviders: ValidatedProvider[];
  disabledProviders: Array<{ provider_id: string; errors: string[] }>;
  configHash: string;
}

/**
 * CP4: Hop-by-hop and forbidden headers that custom providers may NEVER override.
 */
const FORBIDDEN_CUSTOM_HEADERS = new Set([
  'host',
  'content-length',
  'transfer-encoding',
  'connection',
  'keep-alive',
  'upgrade',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
]);

/**
 * Allowed custom header names in config allowlist (CP4).
 */
const DEFAULT_HEADER_ALLOWLIST = new Set([
  'x-title',
  'http-referer',
  'referer',
  'x-organization',
  'x-project',
  'x-request-tag',
  'x-request-id',
  'x-client-name',
  'x-client-version',
  'anthropic-beta',
  'anthropic-version',
  'openai-organization',
  'openai-project',
]);

export function isValidIanaTimezone(tz: string): boolean {
  if (!tz || typeof tz !== 'string') return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function isValidResetTime(resetTime: string): boolean {
  if (!/^\d{2}:\d{2}$/.test(resetTime)) return false;
  const [hh, mm] = resetTime.split(':').map(Number);
  return hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59;
}

function ipv4ToUint32(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let acc = 0;
  for (const p of parts) {
    if (!/^\d+$/.test(p)) return null;
    const n = Number(p);
    if (n < 0 || n > 255) return null;
    acc = ((acc << 8) | n) >>> 0;
  }
  return acc >>> 0;
}

function inCidr4(ipNum: number, baseIp: string, prefixLen: number): boolean {
  const baseNum = ipv4ToUint32(baseIp);
  if (baseNum === null) return false;
  const mask = prefixLen === 0 ? 0 : (~0 << (32 - prefixLen)) >>> 0;
  return (ipNum & mask) >>> 0 === (baseNum & mask) >>> 0;
}

/**
 * CP2: Checks whether an IPv4 address falls inside any rejected SSRF range:
 * 0.0.0.0/8, 10.0.0.0/8, 100.64.0.0/10, 127.0.0.0/8, 169.254.0.0/16,
 * 172.16.0.0/12, 192.168.0.0/16, 224.0.0.0/4, 240.0.0.0/4
 */
export function isRejectedIpv4(ip: string): boolean {
  const num = ipv4ToUint32(ip);
  if (num === null) return true;
  return (
    inCidr4(num, '0.0.0.0', 8) ||
    inCidr4(num, '10.0.0.0', 8) ||
    inCidr4(num, '100.64.0.0', 10) ||
    inCidr4(num, '127.0.0.0', 8) ||
    inCidr4(num, '169.254.0.0', 16) ||
    inCidr4(num, '172.16.0.0', 12) ||
    inCidr4(num, '192.168.0.0', 16) ||
    inCidr4(num, '224.0.0.0', 4) ||
    inCidr4(num, '240.0.0.0', 4)
  );
}

function expandIpv6ToBytes(ipRaw: string): Uint8Array | null {
  const ip = ipRaw.replace(/^\[|\]$/g, '').split('%')[0].toLowerCase();

  // Check if there is an embedded dotted-quad IPv4 suffix (e.g. ::ffff:127.0.0.1)
  let working = ip;
  const lastColon = working.lastIndexOf(':');
  if (lastColon !== -1 && working.slice(lastColon + 1).includes('.')) {
    const v4Part = working.slice(lastColon + 1);
    const v4Num = ipv4ToUint32(v4Part);
    if (v4Num === null) return null;
    const hi = ((v4Num >>> 16) & 0xffff).toString(16);
    const lo = (v4Num & 0xffff).toString(16);
    working = `${working.slice(0, lastColon)}:${hi}:${lo}`;
  }

  const doubleColonParts = working.split('::');
  if (doubleColonParts.length > 2) return null;

  const left = doubleColonParts[0]
    ? doubleColonParts[0].split(':').filter(Boolean)
    : [];
  const right =
    doubleColonParts.length === 2 && doubleColonParts[1]
      ? doubleColonParts[1].split(':').filter(Boolean)
      : [];

  const totalHextets = left.length + right.length;
  if (doubleColonParts.length === 1 && totalHextets !== 8) return null;
  if (doubleColonParts.length === 2 && totalHextets > 7) return null;

  const missing = 8 - totalHextets;
  const full = [
    ...left,
    ...(doubleColonParts.length === 2 ? Array(missing).fill('0') : []),
    ...right,
  ];
  if (full.length !== 8) return null;

  const bytes = new Uint8Array(16);
  for (let i = 0; i < 8; i++) {
    if (!/^[0-9a-f]{1,4}$/.test(full[i])) return null;
    const val = parseInt(full[i], 16);
    bytes[i * 2] = (val >> 8) & 0xff;
    bytes[i * 2 + 1] = val & 0xff;
  }
  return bytes;
}

/**
 * CP2: Checks whether an IPv6 address falls inside any rejected SSRF range:
 * ::/128, ::1/128, fc00::/7, fe80::/10, ff00::/8, or IPv4-mapped ::ffff:0:0/96
 */
export function isRejectedIpv6(ip: string): boolean {
  const bytes = expandIpv6ToBytes(ip);
  if (!bytes) return true;

  // ::/128 (all zeros)
  const isAllZero = bytes.every((b) => b === 0);
  if (isAllZero) return true;

  // ::1/128 (loopback)
  const isLoopback =
    bytes.slice(0, 15).every((b) => b === 0) && bytes[15] === 1;
  if (isLoopback) return true;

  // IPv4-mapped IPv6 ::ffff:0:0/96 (first 10 bytes 0, bytes 10 & 11 = 0xff)
  const isIpv4Mapped =
    bytes.slice(0, 10).every((b) => b === 0) &&
    bytes[10] === 0xff &&
    bytes[11] === 0xff;
  if (isIpv4Mapped) {
    const v4Str = `${bytes[12]}.${bytes[13]}.${bytes[14]}.${bytes[15]}`;
    return isRejectedIpv4(v4Str);
  }

  // fc00::/7 (Unique Local Address: 0xfc or 0xfd in byte 0)
  if ((bytes[0] & 0xfe) === 0xfc) return true;

  // fe80::/10 (Link-local: byte 0 === 0xfe and top 2 bits of byte 1 === 10 -> 0x80..0xbf)
  if (bytes[0] === 0xfe && (bytes[1] & 0xc0) === 0x80) return true;

  // ff00::/8 (Multicast: byte 0 === 0xff)
  if (bytes[0] === 0xff) return true;

  return false;
}

export function isBlockedIpAddress(ip: string): boolean {
  const clean = ip.replace(/^\[|\]$/g, '').trim();
  const ver = net.isIP(clean);
  if (ver === 4) return isRejectedIpv4(clean);
  if (ver === 6) return isRejectedIpv6(clean);
  return true;
}

/**
 * CP2: Checks any literal IP address (v4 or v6) against SSRF rules.
 */
export function isRejectedIpAddress(address: string): boolean {
  const clean = (address || '').trim().replace(/^\[|\]$/g, '');
  if (!clean) return true;
  const family = net.isIP(clean);
  if (family === 4) return isRejectedIpv4(clean);
  if (family === 6) return isRejectedIpv6(clean);
  if (clean.includes(':')) return isRejectedIpv6(clean);
  return true;
}

export type DnsLookupFn = (
  hostname: string
) => Promise<Array<{ address: string; family: number }>>;

const defaultDnsLookup: DnsLookupFn = async (hostname: string) => {
  return dns.lookup(hostname, { all: true, verbatim: true });
};

/**
 * CP2: SSRF guard checked on both the URL hostname and the actual resolved connection address(es)
 * so DNS rebinding cannot bypass it.
 */
export async function verifyConnectionTargetSafe(
  urlStr: string,
  options?: {
    isCustomProvider: boolean;
    allowInsecureLocalhost?: boolean;
    dnsLookup?: DnsLookupFn;
  }
): Promise<{ safe: boolean; reason?: string; resolvedAddresses: string[] }> {
  let parsed: URL;
  try {
    parsed = new URL(urlStr);
  } catch {
    return { safe: false, reason: 'Invalid URL syntax', resolvedAddresses: [] };
  }

  if (parsed.username || parsed.password) {
    return {
      safe: false,
      reason: 'Credentials inside URLs are forbidden (PR2)',
      resolvedAddresses: [],
    };
  }

  const rawHost = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  const isLoopbackHost =
    rawHost === 'localhost' || rawHost === '127.0.0.1' || rawHost === '::1';
  const allowLocalHttp =
    Boolean(options?.allowInsecureLocalhost) && isLoopbackHost;

  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && allowLocalHttp)) {
    return {
      safe: false,
      reason: `Disallowed protocol "${parsed.protocol}" (HTTPS required)`,
      resolvedAddresses: [],
    };
  }

  if (allowLocalHttp) {
    return { safe: true, resolvedAddresses: [rawHost] };
  }

  // If hostname is already an IP literal, validate directly
  if (net.isIP(rawHost) !== 0 || rawHost.includes(':')) {
    if (isRejectedIpAddress(rawHost)) {
      return {
        safe: false,
        reason: `SSRF guard rejected literal IP address: ${rawHost}`,
        resolvedAddresses: [rawHost],
      };
    }
    return { safe: true, resolvedAddresses: [rawHost] };
  }

  if (rawHost === 'localhost' || rawHost.endsWith('.localhost') || rawHost.endsWith('.internal')) {
    return {
      safe: false,
      reason: `SSRF guard rejected local/internal hostname: ${rawHost}`,
      resolvedAddresses: [],
    };
  }

  const lookupFn = options?.dnsLookup || defaultDnsLookup;
  let records: Array<{ address: string; family: number }>;
  try {
    records = await lookupFn(rawHost);
  } catch (err: unknown) {
    return {
      safe: false,
      reason: `DNS resolution failed for ${rawHost}: ${err instanceof Error ? err.message : 'unknown'}`,
      resolvedAddresses: [],
    };
  }

  if (!Array.isArray(records) || records.length === 0) {
    return {
      safe: false,
      reason: `DNS resolution returned no addresses for ${rawHost}`,
      resolvedAddresses: [],
    };
  }

  const resolvedAddresses: string[] = [];
  for (const rec of records) {
    resolvedAddresses.push(rec.address);
    if (isRejectedIpAddress(rec.address)) {
      return {
        safe: false,
        reason: `SSRF guard rejected resolved address ${rec.address} for host ${rawHost}`,
        resolvedAddresses,
      };
    }
  }

  return { safe: true, resolvedAddresses };
}

/**
 * CP4: Validates and filters custom headers against the allowlist and hop-by-hop blocklist.
 */
export function validateCustomHeaders(
  customHeaders?: Record<string, string>,
  configAllowlist: ReadonlySet<string> = DEFAULT_HEADER_ALLOWLIST
): { valid: boolean; sanitized: Record<string, string>; errors: string[] } {
  const sanitized: Record<string, string> = {};
  const errors: string[] = [];
  if (!customHeaders) {
    return { valid: true, sanitized, errors };
  }

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
    errors,
  };
}

/**
 * PR2: Validates a single provider configuration entry.
 */
export function validateProviderConfig(
  provider: ProviderConfig,
  options?: { allowInsecureLocalhost?: boolean }
): { valid: boolean; errors: string[]; validated?: ValidatedProvider } {
  const errors: string[] = [];

  if (!provider || typeof provider !== 'object') {
    return { valid: false, errors: ['Provider config must be an object'] };
  }

  const providerId = (provider.provider_id || '').trim();
  if (!providerId || !/^[a-zA-Z0-9_-]+$/.test(providerId)) {
    errors.push('provider_id must be a non-empty alphanumeric/underscore/hyphen string');
  }

  if (!SUPPORTED_PROTOCOLS.has(provider.protocol)) {
    errors.push(`Unsupported protocol "${String(provider.protocol)}"`);
  }

  // URL validation
  let parsedUrl: URL | null = null;
  try {
    parsedUrl = new URL(provider.base_url);
  } catch {
    errors.push(`Invalid base_url "${String(provider.base_url)}"`);
  }

  if (parsedUrl) {
    if (parsedUrl.username || parsedUrl.password) {
      errors.push('Credentials inside base_url are forbidden (PR2)');
    }
    const host = parsedUrl.hostname.replace(/^\[|\]$/g, '').toLowerCase();
    const isLocalhost = host === 'localhost' || host === '127.0.0.1' || host === '::1';
    const allowHttp =
      Boolean(options?.allowInsecureLocalhost) && !provider.custom && isLocalhost;

    if (parsedUrl.protocol !== 'https:' && !(parsedUrl.protocol === 'http:' && allowHttp)) {
      errors.push('base_url must use https:// (http:// allowed only for localhost when ALLOW_INSECURE_LOCALHOST=true and custom=false)');
    }

    if (provider.custom) {
      if (net.isIP(host) !== 0 || host.includes(':')) {
        if (isRejectedIpAddress(host)) {
          errors.push(`Custom provider base_url host "${host}" rejected by SSRF guard (CP2)`);
        }
      } else if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal')) {
        errors.push(`Custom provider base_url host "${host}" rejected by SSRF guard (CP2)`);
      }
    }
  }

  // PR4: Keys must never be raw key values inside config
  const resolvedKeys: KeyPoolEntryConfig[] = [];
  if (Array.isArray(provider.keys) && provider.keys.length > 0) {
    for (const k of provider.keys) {
      if (!k.key_id || (!k.key_env_var_name && !k.encrypted_key_ref)) {
        errors.push(`Key entry "${k.key_id || 'unknown'}" must specify key_env_var_name or encrypted_key_ref`);
        continue;
      }
      if (
        k.key_env_var_name &&
        (/^(AIza|sk-|gsk_|cc_|csk-|nvapi-|ghp_)/.test(k.key_env_var_name) ||
          !/^[A-Z0-9_]+$/.test(k.key_env_var_name))
      ) {
        errors.push(`key_env_var_name "${ redactSecrets(k.key_env_var_name) }" looks like a raw secret or invalid env var name (PR4)`);
      }
      resolvedKeys.push(k);
    }
  } else if (provider.key_env_var_name) {
    if (
      /^(AIza|sk-|gsk_|cc_|csk-|nvapi-|ghp_)/.test(provider.key_env_var_name) ||
      !/^[A-Z0-9_]+$/.test(provider.key_env_var_name)
    ) {
      errors.push(`key_env_var_name "${redactSecrets(provider.key_env_var_name)}" looks like a raw secret or invalid env var name (PR4)`);
    } else {
      resolvedKeys.push({
        key_id: `${providerId}_key_1`,
        key_env_var_name: provider.key_env_var_name,
      });
    }
  } else {
    errors.push('Provider must specify key_env_var_name or non-empty keys list');
  }

  // Models check
  if (!Array.isArray(provider.models) || provider.models.length === 0) {
    errors.push('Provider must declare at least one model (PR2)');
  } else {
    const seenModels = new Set<string>();
    for (const m of provider.models) {
      if (!m.model_id || typeof m.model_id !== 'string') {
        errors.push('Each model must have a non-empty model_id');
      } else if (seenModels.has(m.model_id)) {
        errors.push(`Duplicate model_id "${m.model_id}" in provider "${providerId}"`);
      } else {
        seenModels.add(m.model_id);
      }
      if (!Number.isInteger(m.context_window) || m.context_window <= 0) {
        errors.push(`Model "${m.model_id}" context_window must be a positive integer`);
      }
      if (!Number.isInteger(m.max_output) || m.max_output <= 0) {
        errors.push(`Model "${m.model_id}" max_output must be a positive integer`);
      }
    }
  }

  // Limits must be positive integers
  for (const field of ['rpm', 'rpd', 'tpm', 'tpd'] as const) {
    const val = provider[field];
    if (!Number.isInteger(val) || val <= 0) {
      errors.push(`${field} must be a positive integer`);
    }
  }

  if (!isValidIanaTimezone(provider.reset_timezone)) {
    errors.push(`Invalid IANA reset_timezone "${String(provider.reset_timezone)}"`);
  }

  if (!isValidResetTime(provider.reset_time)) {
    errors.push(`Invalid reset_time "${String(provider.reset_time)}" (expected HH:MM)`);
  }

  if (!Number.isInteger(provider.priority)) {
    errors.push('priority must be an integer');
  }

  if (provider.allowed_custom_headers) {
    const hdrCheck = validateCustomHeaders(provider.allowed_custom_headers);
    if (!hdrCheck.valid) {
      errors.push(...hdrCheck.errors);
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  const configHash = crypto
    .createHash('sha256')
    .update(JSON.stringify(provider))
    .digest('hex')
    .slice(0, 16);

  return {
    valid: true,
    errors: [],
    validated: {
      ...provider,
      // CP5: Custom providers start disabled (probed = false) until probe succeeds
      enabled: provider.custom ? false : provider.enabled !== false,
      probed: !provider.custom,
      config_hash: configHash,
      resolved_keys: resolvedKeys,
    },
  };
}

/**
 * PR2: Validates a full registry configuration. Invalid providers are disabled and logged.
 * Never applies a half-broken global structure.
 */
export function validateRegistryConfig(
  config: EngineRegistryConfig,
  options?: { allowInsecureLocalhost?: boolean; logger?: (msg: string) => void }
): ConfigValidationReport {
  const allowInsecureLocalhost =
    options?.allowInsecureLocalhost ??
    process.env.ALLOW_INSECURE_LOCALHOST === 'true';
  const log = options?.logger || ((msg: string) => console.warn('[AI Config]', msg));

  const seenIds = new Set<string>();
  const validProviders: ValidatedProvider[] = [];
  const disabledProviders: Array<{ provider_id: string; errors: string[] }> = [];

  for (const p of config.providers || []) {
    const pid = (p?.provider_id || '').trim() || 'unknown';
    if (seenIds.has(pid)) {
      const errMsg = `Duplicate provider_id "${pid}" (PR2)`;
      log(`Disabling provider "${pid}": ${errMsg}`);
      disabledProviders.push({ provider_id: pid, errors: [errMsg] });
      continue;
    }
    seenIds.add(pid);

    const res = validateProviderConfig(p, { allowInsecureLocalhost });
    if (!res.valid || !res.validated) {
      log(
        `Disabling invalid provider "${pid}": ${redactSecrets(res.errors.join('; '))}`
      );
      disabledProviders.push({ provider_id: pid, errors: res.errors });
      continue;
    }
    validProviders.push(res.validated);
  }

  const configHash = crypto
    .createHash('sha256')
    .update(JSON.stringify(validProviders.map((vp) => vp.config_hash)))
    .digest('hex')
    .slice(0, 16);

  return {
    validProviders,
    disabledProviders,
    configHash,
  };
}

/**
 * CP7: Documented example custom provider entry, clearly marked as an example (disabled by default).
 */
export const EXAMPLE_CUSTOM_PROVIDER_ENTRY: ProviderConfig = {
  provider_id: 'example_custom_openai_gateway',
  protocol: 'openai_compatible',
  base_url: 'https://gateway.example.com/v1/chat/completions',
  key_env_var_name: 'EXAMPLE_CUSTOM_GATEWAY_API_KEY',
  models: [
    {
      model_id: 'gpt-4o-mini',
      context_window: 128_000,
      max_output: 4_096,
      tools: true,
      json: true,
      stream: true,
    },
  ],
  rpm: ENGINE_DEFAULTS.UNKNOWN_RPM,
  rpd: ENGINE_DEFAULTS.UNKNOWN_RPD,
  tpm: ENGINE_DEFAULTS.UNKNOWN_TPM,
  tpd: ENGINE_DEFAULTS.UNKNOWN_TPD,
  reset_timezone: ENGINE_DEFAULTS.UNKNOWN_RESET_TIMEZONE,
  reset_time: ENGINE_DEFAULTS.UNKNOWN_RESET_TIME,
  priority: 100,
  custom: true,
  enabled: false,
  auth_header_name: 'Authorization',
  auth_header_format: 'Bearer',
  allowed_custom_headers: {
    'X-Title': 'SMFTA AI Pro',
  },
  notes: 'EXAMPLE ONLY (CP7) — Replace base_url and set EXAMPLE_CUSTOM_GATEWAY_API_KEY in environment, then run probe.',
};

/**
 * Default Owner Provider Registry Table (populated from existing codebase + Section 1 defaults for [FILL] values).
 */
export const DEFAULT_ENGINE_REGISTRY_CONFIG: EngineRegistryConfig = {
  global: {
    user_messages_per_minute: ENGINE_DEFAULTS.USER_RATE_LIMIT_PER_MINUTE,
    user_daily_message_cap: ENGINE_DEFAULTS.USER_DAILY_MESSAGE_CAP,
    daily_spend_cap_usd: ENGINE_DEFAULTS.DAILY_SPEND_CAP_USD,
    currency: 'USD',
    overall_deadline_ms: ENGINE_DEFAULTS.OVERALL_DEADLINE_MS,
    per_attempt_timeout_ms: ENGINE_DEFAULTS.PER_ATTEMPT_TIMEOUT_MS,
  },
  providers: getActiveDefaultProviderRegistry(),
};
