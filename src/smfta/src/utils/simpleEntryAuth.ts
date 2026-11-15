/**
 * SMFTA AI Pro — Simple Name + Password Entry & Local Identity Engine
 *
 * Allows any user to enter and use all features immediately with just a Name
 * and Password (no email registration, OTP, or OAuth login walls required).
 * Also generates a deterministic local user ID from the profile so V2 quotas,
 * chat sessions, memory, and settings persist reliably for that user.
 */

export interface SimpleEntryCredentials {
  name: string;
  passwordHash: string;
  userId: string;
  createdAt: number;
  updatedAt: number;
}

export const SIMPLE_ENTRY_STORAGE_KEY = 'smfta_simple_entry_v1';
export const SIMPLE_ENTRY_UNLOCKED_SESSION_KEY = 'smfta_simple_entry_unlocked_v1';

/**
 * Deterministic, fast non-crypto hash for local password verification and
 * stable userId generation (works synchronously in all browsers and Node tests).
 */
export function hashSimpleSecret(input: string): string {
  const clean = String(input || '');
  if (!clean) return '';
  let h1 = 0xdeadbeef ^ clean.length;
  let h2 = 0x41c6ce57 ^ clean.length;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 =
    Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^
    Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 =
    Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^
    Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const combined =
    (h2 >>> 0).toString(16).padStart(8, '0') +
    (h1 >>> 0).toString(16).padStart(8, '0');
  return `sh1_${combined}`;
}

/**
 * Builds a stable, URL-safe local user ID from the user's name and password hash
 * so server-side V2 quota and memory routes can scope to this user without Firebase Auth.
 */
export function deriveSimpleUserId(name: string, passwordHash = ''): string {
  const cleanName = String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u0980-\u09ff]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 28);
  const seed = `${cleanName || 'user'}:${passwordHash || 'open'}`;
  const digest = hashSimpleSecret(seed).replace(/^sh1_/, '').slice(0, 12);
  const asciiSlug = cleanName.replace(/[^\x20-\x7E]/g, '').replace(/[^a-z0-9-]/g, '');
  return `local_${asciiSlug ? `${asciiSlug}_` : ''}${digest}`;
}

export function loadSimpleEntryCredentials(
  storage: Pick<Storage, 'getItem'> | null = typeof window !== 'undefined'
    ? window.localStorage
    : null
): SimpleEntryCredentials | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(SIMPLE_ENTRY_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SimpleEntryCredentials>;
    const name = typeof parsed?.name === 'string' ? parsed.name.trim() : '';
    if (!name) return null;
    const passwordHash =
      typeof parsed?.passwordHash === 'string' ? parsed.passwordHash : '';
    const userId =
      typeof parsed?.userId === 'string' && parsed.userId.trim()
        ? parsed.userId.trim()
        : deriveSimpleUserId(name, passwordHash);
    return {
      name,
      passwordHash,
      userId,
      createdAt:
        typeof parsed?.createdAt === 'number' ? parsed.createdAt : Date.now(),
      updatedAt:
        typeof parsed?.updatedAt === 'number' ? parsed.updatedAt : Date.now(),
    };
  } catch {
    return null;
  }
}

export function saveSimpleEntryCredentials(
  name: string,
  plainPassword: string,
  storage: Pick<Storage, 'getItem' | 'setItem'> | null = typeof window !== 'undefined'
    ? window.localStorage
    : null
): SimpleEntryCredentials {
  const cleanName = String(name || '').trim().slice(0, 80) || 'SMFTA User';
  const cleanPass = String(plainPassword || '').trim();
  const existing = loadSimpleEntryCredentials(storage);
  const passwordHash = cleanPass
    ? hashSimpleSecret(cleanPass)
    : existing?.passwordHash || '';
  const now = Date.now();
  const next: SimpleEntryCredentials = {
    name: cleanName,
    passwordHash,
    userId: deriveSimpleUserId(cleanName, passwordHash),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
  if (storage) {
    try {
      storage.setItem(SIMPLE_ENTRY_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Ignore storage quota errors
    }
  }
  return next;
}

export function verifySimpleEntryLogin(
  stored: SimpleEntryCredentials | null,
  inputName: string,
  inputPassword: string
): { ok: boolean; error?: string; credentials?: SimpleEntryCredentials } {
  const cleanName = String(inputName || '').trim();
  const cleanPass = String(inputPassword || '').trim();

  if (!cleanName) {
    return { ok: false, error: 'অনুগ্রহ করে আপনার নাম লিখুন (Please enter your name)' };
  }
  if (!cleanPass) {
    return {
      ok: false,
      error: 'অনুগ্রহ করে একটি পাসওয়ার্ড দিন (Please enter your password)',
    };
  }

  // First-time setup or same name/password update
  if (!stored || !stored.passwordHash) {
    const created = saveSimpleEntryCredentials(cleanName, cleanPass);
    return { ok: true, credentials: created };
  }

  // If the stored profile has a password hash and the user enters the same name, check password
  const candidateHash = hashSimpleSecret(cleanPass);
  if (
    stored.name.toLowerCase() === cleanName.toLowerCase() &&
    stored.passwordHash &&
    stored.passwordHash !== candidateHash
  ) {
    return {
      ok: false,
      error: 'পাসওয়ার্ড মেলেনি — সঠিক পাসওয়ার্ড দিন অথবা নতুন নাম ব্যবহার করুন',
    };
  }

  // Either password matched or user entered a new profile name + password
  const updated = saveSimpleEntryCredentials(cleanName, cleanPass);
  return { ok: true, credentials: updated };
}

export function clearSimpleEntryCredentials(
  storage: Pick<Storage, 'removeItem'> | null = typeof window !== 'undefined'
    ? window.localStorage
    : null
): void {
  if (!storage) return;
  try {
    storage.removeItem(SIMPLE_ENTRY_STORAGE_KEY);
  } catch {
    // ignore
  }
}

