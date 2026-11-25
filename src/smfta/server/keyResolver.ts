import crypto from 'node:crypto';
import type { Request } from './runtime/express';

export type GeminiKeySource =
  | 'header:x-gemini-key'
  | 'header:x-api-key'
  | 'header:authorization'
  | 'body:geminiApiKey'
  | 'body:apiKey'
  | 'body:externalKeys.gemini'
  | 'body:externalKeys'
  | 'env:GEMINI_API_KEY'
  | 'env:AI_MASTER_KEY'
  | 'env:VITE_GEMINI_API_KEY'
  | 'env:GOOGLE_API_KEY'
  | 'env:API_KEY'
  | 'none';

export interface ResolvedGeminiKeyResult {
  apiKey: string;
  source: GeminiKeySource;
  sealedDetected: boolean;
  errorCode?: 'KEY_DECRYPT_FAILED';
  errorBn?: string;
}

const SEALED_PREFIX = 'enc:v1:';
const SEALED_PBKDF2_SALT = 'smfta-keystore-v1';

/**
 * Splits a string/array of API keys separated by newlines, commas, or semicolons,
 * stripping surrounding quotes and whitespace.
 */
export function extractApiKeyList(raw: unknown): string[] {
  const parts: string[] = [];
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (typeof item === 'string') parts.push(item);
    }
  } else if (typeof raw === 'string') {
    parts.push(raw);
  }
  const out: string[] = [];
  for (const chunk of parts) {
    for (const piece of chunk.split(/[\n,;]+/)) {
      const clean = piece.trim().replace(/^["']+|["']+$/g, '').trim();
      if (clean) out.push(clean);
    }
  }
  return out;
}

export function isSealedCiphertext(value: string): boolean {
  return String(value || '').trim().startsWith(SEALED_PREFIX);
}

/**
 * Decrypts client-sealed `enc:v1:<iv_b64>:<ct_b64>` tokens when a symmetric
 * server keystore secret (`SMFTA_KEYSTORE_SECRET` / `KEY_ENCRYPTION_SECRET`) is set.
 * Raw plaintext keys are sanitized and returned immediately.
 */
export function decryptKeyPayloadIfSupported(rawInput: string): {
  ok: boolean;
  key: string;
  sealedDetected: boolean;
  errorCode?: 'KEY_DECRYPT_FAILED';
  errorBn?: string;
} {
  const clean = String(rawInput || '').trim().replace(/^["']+|["']+$/g, '').trim();
  if (!clean) {
    return { ok: false, key: '', sealedDetected: false };
  }
  if (!isSealedCiphertext(clean)) {
    return { ok: true, key: clean, sealedDetected: false };
  }

  const secret = (
    process.env.SMFTA_KEYSTORE_SECRET ||
    process.env.KEY_ENCRYPTION_SECRET ||
    ''
  ).trim();
  if (!secret) {
    return {
      ok: false,
      key: '',
      sealedDetected: true,
      errorCode: 'KEY_DECRYPT_FAILED',
      errorBn:
        'এই ব্রাউজারে সেভ করা এনক্রিপ্টেড API কী ডিক্রিপ্ট করা যায়নি। অনুগ্রহ করে Settings → Custom Providers থেকে আপনার API Key পুনরায় সেভ করুন।',
    };
  }

  try {
    const rest = clean.slice(SEALED_PREFIX.length);
    const sepIdx = rest.indexOf(':');
    if (sepIdx <= 0) {
      throw new Error('Malformed sealed token');
    }
    const iv = Buffer.from(rest.slice(0, sepIdx), 'base64');
    const cipherAndTag = Buffer.from(rest.slice(sepIdx + 1), 'base64');
    if (iv.length < 12 || cipherAndTag.length <= 16) {
      throw new Error('Invalid AES-GCM payload');
    }
    const authTag = cipherAndTag.subarray(cipherAndTag.length - 16);
    const ciphertext = cipherAndTag.subarray(0, cipherAndTag.length - 16);
    const derivedKey = crypto.pbkdf2Sync(secret, SEALED_PBKDF2_SALT, 100_000, 32, 'sha256');
    const decipher = crypto.createDecipheriv('aes-256-gcm', derivedKey, iv);
    decipher.setAuthTag(authTag);
    const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8').trim();
    if (!plain) {
      throw new Error('Empty decrypted key');
    }
    return { ok: true, key: plain, sealedDetected: true };
  } catch {
    return {
      ok: false,
      key: '',
      sealedDetected: true,
      errorCode: 'KEY_DECRYPT_FAILED',
      errorBn:
        'এনক্রিপ্টেড API কী পড়া যায়নি (KEY_DECRYPT_FAILED)। Settings → Custom Providers থেকে সঠিক কী পুনরায় দিন।',
    };
  }
}

function readHeaderValue(
  headers: Record<string, string | string[] | undefined> | undefined,
  name: string
): string {
  if (!headers) return '';
  const direct = headers[name] ?? headers[name.toLowerCase()];
  if (Array.isArray(direct)) return String(direct[0] || '').trim();
  return typeof direct === 'string' ? direct.trim() : '';
}

function isLikelyNonGeminiThirdPartyKey(k: string): boolean {
  const clean = k.trim();
  if (!clean) return false;
  return /^(sk-|gsk_|nvapi-|ghp_|github_pat_|xai-|csk-|fw_|pplx-|hf_|cc_)/i.test(clean);
}

/**
 * Universal API Key Detection Chain (Vercel Serverless + Local Express compatible):
 * 1. Headers: `x-gemini-key`, `x-api-key`, `authorization` (Bearer)
 * 2. Body: `req.body.geminiApiKey`, `req.body.apiKey`, `req.body.externalKeys.gemini`, `req.body.externalKeys`
 * 3. Server Env: `GEMINI_API_KEY`, `AI_MASTER_KEY`, `VITE_GEMINI_API_KEY`, `GOOGLE_API_KEY`, `API_KEY`
 */
export function resolveGeminiApiKey(req?: Pick<Request, 'headers' | 'body'> | null): ResolvedGeminiKeyResult {
  const headers = req?.headers as Record<string, string | string[] | undefined> | undefined;
  const body = (req?.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;

  let sealedDetected = false;
  let sealedErrorCode: 'KEY_DECRYPT_FAILED' | undefined;
  let sealedErrorBn: string | undefined;

  const tryCandidate = (rawVal: string, source: GeminiKeySource, requireGeminiPrefix = false): ResolvedGeminiKeyResult | null => {
    for (const candidate of extractApiKeyList(rawVal)) {
      const dec = decryptKeyPayloadIfSupported(candidate);
      if (dec.sealedDetected && !dec.ok) {
        sealedDetected = true;
        sealedErrorCode = dec.errorCode;
        sealedErrorBn = dec.errorBn;
        continue;
      }
      if (!dec.ok || !dec.key) continue;
      if (requireGeminiPrefix) {
        if (isLikelyNonGeminiThirdPartyKey(dec.key)) continue;
        if (!dec.key.startsWith('AIza')) continue;
      } else if (isLikelyNonGeminiThirdPartyKey(dec.key)) {
        continue;
      }
      return {
        apiKey: dec.key,
        source,
        sealedDetected,
      };
    }
    return null;
  };

  // 1. Headers: x-gemini-key -> x-api-key -> authorization Bearer
  const xGeminiKey = readHeaderValue(headers, 'x-gemini-key');
  if (xGeminiKey) {
    const res = tryCandidate(xGeminiKey, 'header:x-gemini-key');
    if (res) return res;
  }

  const xApiKey = readHeaderValue(headers, 'x-api-key');
  if (xApiKey) {
    const res = tryCandidate(xApiKey, 'header:x-api-key');
    if (res) return res;
  }

  const authHeader = readHeaderValue(headers, 'authorization');
  if (/^Bearer\s+/i.test(authHeader)) {
    const bearerToken = authHeader.replace(/^Bearer\s+/i, '').trim();
    const res = tryCandidate(bearerToken, 'header:authorization');
    if (res) return res;
  }

  // 2. Body payloads: geminiApiKey -> apiKey -> externalKeys.gemini -> externalKeys
  if (typeof body.geminiApiKey === 'string' && body.geminiApiKey.trim()) {
    const res = tryCandidate(body.geminiApiKey, 'body:geminiApiKey');
    if (res) return res;
  }

  if (typeof body.apiKey === 'string' && body.apiKey.trim()) {
    const res = tryCandidate(body.apiKey, 'body:apiKey');
    if (res) return res;
  }

  const extKeys = body.externalKeys;
  if (extKeys && typeof extKeys === 'object' && !Array.isArray(extKeys)) {
    const nestedGem = (extKeys as Record<string, unknown>).gemini;
    if (typeof nestedGem === 'string' && nestedGem.trim()) {
      const res = tryCandidate(nestedGem, 'body:externalKeys.gemini');
      if (res) return res;
    }
  } else if (typeof extKeys === 'string' || Array.isArray(extKeys)) {
    const list = extractApiKeyList(extKeys);
    for (const item of list) {
      const res = tryCandidate(item, 'body:externalKeys', true);
      if (res) return res;
    }
  }

  // 3. Server environment fallback chain
  const envChain: Array<[string | undefined, GeminiKeySource]> = [
    [process.env.GEMINI_API_KEY, 'env:GEMINI_API_KEY'],
    [process.env.AI_MASTER_KEY, 'env:AI_MASTER_KEY'],
    [process.env.VITE_GEMINI_API_KEY, 'env:VITE_GEMINI_API_KEY'],
    [process.env.GOOGLE_API_KEY, 'env:GOOGLE_API_KEY'],
    [process.env.API_KEY, 'env:API_KEY'],
  ];

  for (const [envVal, source] of envChain) {
    if (typeof envVal === 'string' && envVal.trim()) {
      const res = tryCandidate(envVal, source);
      if (res) return res;
    }
  }

  return {
    apiKey: '',
    source: 'none',
    sealedDetected,
    ...(sealedErrorCode ? { errorCode: sealedErrorCode, errorBn: sealedErrorBn } : {}),
  };
}

/**
 * Convenience helper for server modules without an active HTTP request.
 */
export function resolveServerEnvGeminiKey(): string {
  return resolveGeminiApiKey(null).apiKey;
}
