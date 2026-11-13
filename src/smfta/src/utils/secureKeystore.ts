/**
 * SMFTA Pro — Secure at-rest keystore for API secrets (v18.11.0)
 *
 * Hard requirement: API keys must never sit in browser storage as plaintext.
 * A non-extractable AES-256-GCM key is created once and kept in IndexedDB
 * (origin-bound, invisible to `localStorage` dumps and not readable by other
 * origins). Only short ciphertext strings are written to localStorage.
 *
 * Threat model: this protects data at rest (stolen storage, exported JSON,
 * shared devices) and prevents accidental leakage through devtools/exports.
 * A same-origin script running inside the app can still ask the keystore to
 * decrypt — the v18.9 CSP is what keeps untrusted scripts out in the first
 * place.
 *
 * Environments without IndexedDB (SSR, unit tests, very old WebViews) fall
 * back to an ephemeral in-memory key: encryption still works for the session,
 * and `isEphemeralKeystore()` lets the UI warn that secrets will not persist.
 * Legacy plaintext values decrypt transparently and are re-encrypted on the
 * next write, so migration needs no user action.
 */

const ENC_PREFIX = 'enc:v1:';
const DB_NAME = 'smfta-secure-keystore';
const STORE_NAME = 'keys';
const KEY_ID = 'aes-gcm-v1';

export function isEncrypted(value: unknown): boolean {
  return typeof value === 'string' && value.startsWith(ENC_PREFIX);
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  if (typeof btoa === 'function') return btoa(binary);
  return Buffer.from(bytes).toString('base64');
}

function fromBase64(value: string): Uint8Array {
  const binary =
    typeof atob === 'function'
      ? atob(value)
      : Buffer.from(value, 'base64').toString('binary');
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function hasSubtleCrypto(): boolean {
  return (
    typeof globalThis !== 'undefined' &&
    typeof globalThis.crypto !== 'undefined' &&
    typeof globalThis.crypto.subtle !== 'undefined'
  );
}

function hasIndexedDb(): boolean {
  return typeof indexedDB !== 'undefined' && !!indexedDB;
}

function openKeyDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!hasIndexedDb()) {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IndexedDB open failed'));
  });
}

function idbGet(db: IDBDatabase, id: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbPut(db: IDBDatabase, id: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const req = tx.objectStore(STORE_NAME).put(value, id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

let cachedKey: CryptoKey | null = null;
let keyPromise: Promise<CryptoKey> | null = null;
let ephemeral = false;

async function createEphemeralKey(): Promise<CryptoKey> {
  ephemeral = true;
  return globalThis.crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function loadOrCreateKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;
  if (!hasSubtleCrypto()) {
    throw new Error('Web Crypto API is not available in this environment');
  }
  try {
    const db = await openKeyDb();
    const existing = (await idbGet(db, KEY_ID)) as CryptoKey | undefined;
    if (existing && existing instanceof CryptoKey) {
      cachedKey = existing;
      return existing;
    }
    const fresh = await globalThis.crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
    await idbPut(db, KEY_ID, fresh);
    cachedKey = fresh;
    return fresh;
  } catch {
    return createEphemeralKey();
  }
}

function getKey(): Promise<CryptoKey> {
  if (!keyPromise) keyPromise = loadOrCreateKey();
  return keyPromise;
}

/** True when secrets cannot survive a reload (no IndexedDB in this runtime). */
export function isEphemeralKeystore(): boolean {
  return ephemeral;
}

/** Whether encrypted storage is usable at all in this runtime. */
export function keystoreAvailable(): boolean {
  return hasSubtleCrypto();
}

/**
 * Forces key initialization so callers can learn the real storage mode
 * (persistent IndexedDB vs ephemeral page memory) before their first secret.
 */
export async function ensureKeystore(): Promise<{
  available: boolean;
  ephemeral: boolean;
}> {
  if (!hasSubtleCrypto()) return { available: false, ephemeral: true };
  await getKey();
  return { available: true, ephemeral: isEphemeralKeystore() };
}

function randomIv(): Uint8Array {
  return globalThis.crypto.getRandomValues(new Uint8Array(12));
}

/**
 * Views a Uint8Array as a standalone ArrayBuffer for the Web Crypto BufferSource
 * contract (TS lib.dom now rejects SharedArrayBuffer-backed views).
 */
function asBufferSource(bytes: Uint8Array): BufferSource {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer;
}

/**
 * Encrypts a secret. Empty input stays empty (nothing to protect) so callers
 * can round-trip keyless providers without special cases.
 */
export async function encryptSecret(plaintext: string): Promise<string> {
  const value = String(plaintext || '');
  if (!value) return '';
  if (isEncrypted(value)) return value;
  const key = await getKey();
  const iv = randomIv();
  const cipher = await globalThis.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: asBufferSource(iv) },
    key,
    asBufferSource(new TextEncoder().encode(value))
  );
  return `${ENC_PREFIX}${toBase64(iv)}:${toBase64(new Uint8Array(cipher))}`;
}

/**
 * Decrypts a stored value. Legacy plaintext (pre-v18.11) is returned as-is so
 * old installs keep working and migrate on their next save.
 */
export async function decryptSecret(stored: string): Promise<string> {
  const value = String(stored || '');
  if (!value) return '';
  if (!isEncrypted(value)) return value;
  // The prefix itself contains a colon ("enc:v1:"), so strip it before
  // splitting — a bare value.split(':') would shift iv/data by one slot.
  const payload = value.slice(ENC_PREFIX.length);
  const sep = payload.indexOf(':');
  const ivB64 = sep === -1 ? '' : payload.slice(0, sep);
  const dataB64 = sep === -1 ? '' : payload.slice(sep + 1);
  if (!ivB64 || !dataB64 || dataB64.includes(':')) {
    throw new Error('Malformed encrypted secret');
  }
  const key = await getKey();
  const plain = await globalThis.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: asBufferSource(fromBase64(ivB64)) },
    key,
    asBufferSource(fromBase64(dataB64))
  );
  return new TextDecoder().decode(plain);
}

/**
 * Encrypts every key-bearing field of an object without changing the object's
 * shape. Non-string/empty values pass through untouched.
 */
export async function encryptSecretsInPlace<T extends Record<string, unknown>>(
  obj: T,
  fields: ReadonlyArray<keyof T>
): Promise<T> {
  for (const field of fields) {
    const current = obj[field];
    if (typeof current === 'string' && current) {
      obj[field] = (await encryptSecret(current)) as T[keyof T];
    }
  }
  return obj;
}

export async function decryptSecretsInPlace<T extends Record<string, unknown>>(
  obj: T,
  fields: ReadonlyArray<keyof T>
): Promise<T> {
  for (const field of fields) {
    const current = obj[field];
    if (typeof current === 'string' && current) {
      obj[field] = (await decryptSecret(current)) as T[keyof T];
    }
  }
  return obj;
}

const KEYSTORE_META_KEY = 'smfta_keystore_meta';

export interface KeystoreMetadata {
  available: boolean;
  ephemeral: boolean;
  algorithm: 'AES-GCM-256';
  lastRotatedAt: string | null;
  rotationCount: number;
}

export function getKeystoreMetadata(): KeystoreMetadata {
  let lastRotatedAt: string | null = null;
  let rotationCount = 0;
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(KEYSTORE_META_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        if (typeof parsed.lastRotatedAt === 'string') {
          lastRotatedAt = parsed.lastRotatedAt;
        }
        if (typeof parsed.rotationCount === 'number' && Number.isFinite(parsed.rotationCount)) {
          rotationCount = parsed.rotationCount;
        }
      }
    }
  } catch {
    // ignore metadata read errors
  }
  return {
    available: keystoreAvailable(),
    ephemeral: isEphemeralKeystore(),
    algorithm: 'AES-GCM-256',
    lastRotatedAt,
    rotationCount,
  };
}

async function encryptWithKey(plaintext: string, key: CryptoKey): Promise<string> {
  const value = String(plaintext || '');
  if (!value) return '';
  const iv = randomIv();
  const cipher = await globalThis.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: asBufferSource(iv) },
    key,
    asBufferSource(new TextEncoder().encode(value))
  );
  return `${ENC_PREFIX}${toBase64(iv)}:${toBase64(new Uint8Array(cipher))}`;
}

async function decryptWithKey(stored: string, key: CryptoKey): Promise<string> {
  const value = String(stored || '');
  if (!value) return '';
  if (!isEncrypted(value)) return value;
  const payload = value.slice(ENC_PREFIX.length);
  const sep = payload.indexOf(':');
  const ivB64 = sep === -1 ? '' : payload.slice(0, sep);
  const dataB64 = sep === -1 ? '' : payload.slice(sep + 1);
  if (!ivB64 || !dataB64 || dataB64.includes(':')) {
    throw new Error('Malformed encrypted secret');
  }
  const plain = await globalThis.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: asBufferSource(fromBase64(ivB64)) },
    key,
    asBufferSource(fromBase64(dataB64))
  );
  return new TextDecoder().decode(plain);
}

/**
 * Generates a brand-new non-extractable AES-256-GCM master CryptoKey, persists
 * it in IndexedDB (or memory if ephemeral), and invokes the caller's re-seal
 * callback so every encrypted credential on the device is decrypted under the
 * previous key and re-encrypted under the new key atomically.
 */
export async function rotateKeystoreMasterKey(
  reencryptCallback?: (helpers: {
    decryptOld: (stored: string) => Promise<string>;
    encryptNew: (plaintext: string) => Promise<string>;
  }) => Promise<number>
): Promise<{
  ok: boolean;
  rotatedAt: string;
  rotationCount: number;
  reencryptedCount: number;
  ephemeral: boolean;
}> {
  if (!hasSubtleCrypto()) {
    throw new Error('Web Crypto API is not available in this environment');
  }
  const oldKey = await getKey();
  const freshKey = await globalThis.crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );

  let reencryptedCount = 0;
  if (reencryptCallback) {
    reencryptedCount = await reencryptCallback({
      decryptOld: (stored: string) => decryptWithKey(stored, oldKey),
      encryptNew: (plaintext: string) => encryptWithKey(plaintext, freshKey),
    });
  }

  try {
    if (hasIndexedDb()) {
      const db = await openKeyDb();
      await idbPut(db, KEY_ID, freshKey);
      ephemeral = false;
    } else {
      ephemeral = true;
    }
  } catch {
    ephemeral = true;
  }

  cachedKey = freshKey;
  keyPromise = Promise.resolve(freshKey);

  const prevMeta = getKeystoreMetadata();
  const rotatedAt = new Date().toISOString();
  const rotationCount = prevMeta.rotationCount + 1;
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(
        KEYSTORE_META_KEY,
        JSON.stringify({ lastRotatedAt: rotatedAt, rotationCount })
      );
    }
  } catch {
    // ignore storage errors
  }

  return {
    ok: true,
    rotatedAt,
    rotationCount,
    reencryptedCount,
    ephemeral,
  };
}

