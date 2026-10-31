import crypto from 'node:crypto';
import type { IncomingMessage } from 'node:http';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string;
      requestId?: string;
    }
  }
}
import { PROMPT_INJECTION_GUARD_BLOCK } from './defaults';

const SENSITIVE_HEADER_NAMES = new Set([
  'authorization',
  'x-api-key',
  'api-key',
  'x-goog-api-key',
  'proxy-authorization',
  'cookie',
  'set-cookie',
]);

const URL_QUERY_SECRET_REGEX =
  /([?&](?:key|api_key|apikey|token|access_token|secret|signature)=)([^&#\s"']+)/gi;

const RAW_SECRET_PATTERNS: RegExp[] = [
  /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}\b/gi,
  /\bsk-(?:proj-|ant-|or-|live-|test-|svcacct-)?[A-Za-z0-9_-]{8,}\b/g,
  /\bAIza[0-9A-Za-z_-]{8,}\b/g,
  /\bgsk_[A-Za-z0-9_-]{8,}\b/g,
  /\bnvapi-[A-Za-z0-9_-]{8,}\b/g,
  /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{8,}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{8,}\b/g,
  /\bcc_[A-Za-z0-9_-]{8,}\b/g,
  /\bcsk-[A-Za-z0-9_-]{8,}\b/g,
  /\bxai-[A-Za-z0-9_-]{8,}\b/g,
  /\bfw_[A-Za-z0-9_-]{8,}\b/g,
  /\bpplx-[A-Za-z0-9_-]{8,}\b/g,
  /\bhf_[A-Za-z0-9_-]{8,}\b/g,
  /\bFAKE_TEST_KEY_[A-Za-z0-9_-]{2,}\b/g,
  /("(?:api[_-]?key|secret|token|authorization|password|client_secret)"\s*:\s*")([^"]+)(")/gi,
];

/** Session cookie lifetime: 6 hours, matching the server-side UID session TTL. */
export const SESSION_COOKIE_MAX_AGE_SEC = 6 * 60 * 60;

const EMAIL_PII_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
const PHONE_PII_REGEX = /(?:\+?\d{1,3}[\s.-]?)?(?:\(\d{2,4}\)|\d{2,4})[\s.-]?\d{3,4}[\s.-]?\d{4}\b/g;

export function redactSecrets(input: string, extraKeys?: string[]): string {
  if (!input) return '';
  let out = String(input);
  if (Array.isArray(extraKeys)) {
    for (const k of extraKeys) {
      if (k && k.trim().length >= 4) {
        out = out.split(k.trim()).join('[redacted]');
      }
    }
  }
  out = out.replace(URL_QUERY_SECRET_REGEX, '$1[redacted]');
  for (const pattern of RAW_SECRET_PATTERNS) {
    out = out.replace(pattern, (_match, g1, _g2, g3) => {
      if (g1 && g3) {
        return `${g1}[redacted]${g3}`;
      }
      return '[redacted]';
    });
  }
  return out;
}

export function redactHeaders(
  headers: Record<string, string | string[] | undefined>
): Record<string, string> {
  const safe: Record<string, string> = {};
  for (const [key, val] of Object.entries(headers || {})) {
    const lower = key.toLowerCase();
    if (SENSITIVE_HEADER_NAMES.has(lower)) {
      safe[key] = '[redacted]';
    } else if (Array.isArray(val)) {
      safe[key] = redactSecrets(val.join(', '));
    } else if (typeof val === 'string') {
      safe[key] = redactSecrets(val);
    }
  }
  return safe;
}

export function redactPersonalData(
  input: string,
  options?: { allowEmail?: boolean; allowPhone?: boolean }
): string {
  if (!input) return '';
  let out = redactSecrets(input);
  if (!options?.allowEmail) {
    out = out.replace(EMAIL_PII_REGEX, '[REDACTED_EMAIL]');
  }
  if (!options?.allowPhone) {
    out = out.replace(PHONE_PII_REGEX, '[REDACTED_PHONE]');
  }
  return out;
}

let loggedMissingMasterKeyWarning = false;

export function hasConfiguredMasterKey(explicitHexKey?: string): boolean {
  const hex = (explicitHexKey || process.env.AI_MASTER_KEY || '').trim();
  return /^[0-9a-fA-F]{64}$/.test(hex);
}

export function getMasterKeyBuffer(explicitHexKey?: string): Buffer {
  const hex = (explicitHexKey || process.env.AI_MASTER_KEY || '').trim();
  if (/^[0-9a-fA-F]{64}$/.test(hex)) {
    return Buffer.from(hex, 'hex');
  }
  if (!loggedMissingMasterKeyWarning && !explicitHexKey) {
    loggedMissingMasterKeyWarning = true;
    console.warn(
      '[SMFTA Security] AI_MASTER_KEY is not set (expected 64 hex chars). User-supplied keys will be kept in request memory only.'
    );
  }
  const seed = hex || 'smfta-ephemeral-dev-master-key-do-not-use-in-prod';
  return crypto.createHash('sha256').update(seed).digest();
}

export interface EncryptedKeyPayload {
  ciphertext_hex: string;
  iv_hex: string;
  auth_tag_hex: string;
  last4: string;
}

export type EncryptedKeyRecord = EncryptedKeyPayload;

export function encryptKeyAtRest(
  plaintextKey: string,
  explicitMasterKeyHex?: string
): EncryptedKeyPayload {
  const trimmed = plaintextKey.trim();
  if (!trimmed) {
    throw new Error('Cannot encrypt an empty API key');
  }
  const masterKey = getMasterKeyBuffer(explicitMasterKeyHex);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', masterKey, iv);
  const encrypted = Buffer.concat([
    cipher.update(trimmed, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  const last4 = trimmed.length >= 4 ? trimmed.slice(-4) : trimmed;

  return {
    ciphertext_hex: encrypted.toString('hex'),
    iv_hex: iv.toString('hex'),
    auth_tag_hex: authTag.toString('hex'),
    last4,
  };
}

export function decryptKeyInMemory(
  payload: EncryptedKeyPayload,
  explicitMasterKeyHex?: string
): string {
  const masterKey = getMasterKeyBuffer(explicitMasterKeyHex);
  const iv = Buffer.from(payload.iv_hex, 'hex');
  if (iv.length !== 12) {
    throw new Error('Invalid AES-256-GCM IV length; expected 12 bytes');
  }
  const authTag = Buffer.from(payload.auth_tag_hex, 'hex');
  if (authTag.length !== 16) {
    throw new Error('Invalid AES-256-GCM auth tag length; expected 16 bytes');
  }
  const ciphertext = Buffer.from(payload.ciphertext_hex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', masterKey, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

export function formatKeyLast4(last4: string): string {
  const clean = (last4 || '').slice(-4);
  return `••••${clean || '****'}`;
}

export function buildPromptInjectionGuard(baseSystemInstruction = ''): string {
  const trimmed = (baseSystemInstruction || '').trim();
  if (!trimmed) return PROMPT_INJECTION_GUARD_BLOCK;
  if (trimmed.includes(PROMPT_INJECTION_GUARD_BLOCK)) return trimmed;
  return `${PROMPT_INJECTION_GUARD_BLOCK}\n\n${trimmed}`;
}

export interface AuthVerificationResult {
  authenticated: boolean;
  statusCode: 200 | 401 | 503;
  userId: string;
  reason?: string;
}

export function timingSafeTokenEqual(provided: string, expected: string): boolean {
  if (!provided || !expected) return false;
  const bufA = Buffer.from(provided, 'utf8');
  const bufB = Buffer.from(expected, 'utf8');
  if (bufA.length !== bufB.length) {
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

export function verifyRequestAuth(
  req: Pick<IncomingMessage, 'headers' | 'socket'>,
  expectedToken?: string
): AuthVerificationResult {
  const requiredToken = (
    expectedToken ??
    process.env.AI_ENGINE_AUTH_TOKEN ??
    ''
  ).trim();
  const headers = req.headers || {};

  if (!requiredToken) {
    return {
      authenticated: false,
      statusCode: 503,
      userId: 'unconfigured',
      reason: 'AI_ENGINE_AUTH_TOKEN is not configured on the server',
    };
  }

  const authHeader =
    typeof headers.authorization === 'string' ? headers.authorization : '';
  const bearerToken = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : '';
  const customToken =
    typeof headers['x-engine-auth'] === 'string'
      ? headers['x-engine-auth'].trim()
      : '';

  const provided = bearerToken || customToken;
  if (!provided || !timingSafeTokenEqual(provided, requiredToken)) {
    return {
      authenticated: false,
      statusCode: 401,
      userId: 'unauthorized',
      reason: 'Missing or invalid server authentication token',
    };
  }

  const explicitUser =
    typeof headers['x-user-id'] === 'string' && headers['x-user-id'].trim()
      ? headers['x-user-id'].trim().slice(0, 64)
      : 'authenticated-user';

  return {
    authenticated: true,
    statusCode: 200,
    userId: explicitUser,
  };
}

export function requireEngineAuthMiddleware(expectedToken?: string) {
  return (
    req: IncomingMessage & { userId?: string },
    res: {
      status: (code: number) => { json: (body: unknown) => void };
    },
    next: () => void
  ) => {
    const auth = verifyRequestAuth(req, expectedToken);
    if (!auth.authenticated) {
      res.status(auth.statusCode).json({
        ok: false,
        error: auth.reason || 'Unauthorized',
      });
      return;
    }
    req.userId = auth.userId;
    next();
  };
}

export function signSessionToken(rawUserId: string): string {
  const cleanUser = (rawUserId || '').trim().slice(0, 64) || crypto.randomUUID();
  const key = getMasterKeyBuffer();
  const sig = crypto
    .createHmac('sha256', key)
    .update(`smfta-session:${cleanUser}`)
    .digest('hex')
    .slice(0, 32);
  return `${cleanUser}.${sig}`;
}

export function verifySignedSessionToken(token?: string): string | null {
  if (!token || typeof token !== 'string') return null;
  const dotIdx = token.lastIndexOf('.');
  if (dotIdx <= 0) return null;
  const userId = token.slice(0, dotIdx);
  const sig = token.slice(dotIdx + 1);
  if (!userId || !sig) return null;
  const key = getMasterKeyBuffer();
  const expectedSig = crypto
    .createHmac('sha256', key)
    .update(`smfta-session:${userId}`)
    .digest('hex')
    .slice(0, 32);
  if (!timingSafeTokenEqual(sig, expectedSig)) return null;
  return userId;
}

function parseCookieValue(cookieHeader: string | undefined, name: string): string {
  if (!cookieHeader) return '';
  const parts = cookieHeader.split(';');
  for (const part of parts) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) {
      return decodeURIComponent(rest.join('='));
    }
  }
  return '';
}

/**
 * Centralized API authentication & identity isolation middleware (P0-01):
 * - When `AI_ENGINE_AUTH_TOKEN` (or `REQUIRE_API_AUTH=true`) is configured,
 *   requests to protected API routes MUST supply a valid Bearer / X-Engine-Auth token
 *   or a server-signed HttpOnly session cookie (`smfta_sid`).
 * - Derives `req.userId` exclusively from verified server credentials or an
 *   HMAC-signed session cookie (never trusting raw client `sessionId` or `x-user-id`
 *   to impersonate another user's signed session).
 */
export function createApiIdentityMiddleware(options?: {
  requireExplicitToken?: boolean;
  expectedToken?: string;
}) {
  return (
    req: IncomingMessage & {
      userId?: string;
      path?: string;
      url?: string;
      body?: Record<string, unknown>;
    },
    res: {
      status: (code: number) => { json: (body: unknown) => void };
      setHeader?: (name: string, value: string) => void;
    },
    next: () => void
  ) => {
    const reqPath = String(req.path || req.url || '');
    if (reqPath === '/health' || reqPath.startsWith('/health?')) {
      next();
      return;
    }

    const configuredToken = (
      options?.expectedToken ??
      process.env.AI_ENGINE_AUTH_TOKEN ??
      ''
    ).trim();
    const enforceStrictToken =
      Boolean(options?.requireExplicitToken) ||
      Boolean(configuredToken) ||
      process.env.REQUIRE_API_AUTH === 'true';

    const cookieHeader =
      typeof req.headers?.cookie === 'string' ? req.headers.cookie : '';
    const cookieToken = parseCookieValue(cookieHeader, 'smfta_sid');
    const verifiedCookieUser = verifySignedSessionToken(cookieToken);

    if (enforceStrictToken) {
      const auth = verifyRequestAuth(req, configuredToken);
      if (auth.authenticated) {
        req.userId = auth.userId;
        next();
        return;
      }
      if (verifiedCookieUser && !configuredToken) {
        req.userId = verifiedCookieUser;
        next();
        return;
      }
      res.status(auth.statusCode).json({
        ok: false,
        error: auth.reason || 'Unauthorized',
      });
      return;
    }

    if (verifiedCookieUser) {
      req.userId = verifiedCookieUser;
      next();
      return;
    }

    // Issue a server-signed session identity so the browser session has a
    // cryptographic ownership binding without trusting arbitrary client user IDs.
    const socketAddr =
      (req.socket && req.socket.remoteAddress) || '127.0.0.1';
    const ua =
      typeof req.headers?.['user-agent'] === 'string'
        ? req.headers['user-agent']
        : 'local-client';
    const derivedHash = crypto
      .createHmac('sha256', getMasterKeyBuffer())
      .update(`anon-session:${socketAddr}:${ua}`)
      .digest('hex')
      .slice(0, 24);
    const freshUserId = `usr_${derivedHash}`;
    const signed = signSessionToken(freshUserId);
    // v18.9.0: harden the session cookie — bounded Max-Age, Secure on HTTPS,
    // always HttpOnly + SameSite=Lax so it is never exposed to JavaScript or
    // sent on cross-site POSTs.
    const forwardedProto = req.headers?.['x-forwarded-proto'];
    const protoValue = Array.isArray(forwardedProto)
      ? forwardedProto[0]
      : forwardedProto;
    const isHttps =
      Boolean((req.socket as { encrypted?: boolean } | undefined)?.encrypted) ||
      (typeof protoValue === 'string' &&
        protoValue.split(',')[0].trim() === 'https');
    const cookieParts = [
      `smfta_sid=${encodeURIComponent(signed)}`,
      'Path=/',
      'HttpOnly',
      'SameSite=Lax',
      `Max-Age=${SESSION_COOKIE_MAX_AGE_SEC}`,
    ];
    if (isHttps) {
      cookieParts.push('Secure');
    }
    res.setHeader?.('Set-Cookie', cookieParts.join('; '));
    req.userId = freshUserId;
    next();
  };
}

