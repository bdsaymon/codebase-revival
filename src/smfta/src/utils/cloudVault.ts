/**
 * SMFTA AI Pro — Cloud Vault 💾
 *
 * Real Google Drive + GitHub connections so the assistant can push its own
 * notes, code and backups straight into the user's own accounts.
 *
 * Everything here runs 100 % in the browser:
 *   • Google Drive  → OAuth 2.0 token (Google Identity Services) or a pasted
 *                     access token, then Drive REST v3 multipart upload.
 *   • GitHub        → Personal Access Token + repository/branch, then the
 *                     Contents API (base64 commit) and the Git Data API.
 *
 * Credentials never leave the device: they are stored in localStorage exactly
 * like the existing provider API keys, and are only sent to googleapis.com /
 * api.github.com (or through our own server relay when the browser blocks CORS).
 */

import { NotebookNote } from '../types';

export const VAULT_LS_KEY = 'smfta_vault_connections';
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
export const GOOGLE_WORKSPACE_SCOPES: readonly string[] = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/documents',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
];
const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
const GITHUB_API = 'https://api.github.com';
const GIS_SRC = 'https://accounts.google.com/gsi/client';

export type IntegrationProviderId = 'google' | 'github' | 'supabase' | 'vercel';

export type IntegrationConnectionStatus =
  | 'not_connected'
  | 'connecting'
  | 'connected'
  | 'permission_required'
  | 'expired'
  | 'connection_expired'
  | 'error'
  | 'connection_error';

export interface PermissionCheckItem {
  id: string;
  label: string;
  required: boolean;
  granted: boolean;
  detail: string;
}

export interface ProviderVerificationResult {
  ok: boolean;
  provider: IntegrationProviderId;
  status: IntegrationConnectionStatus;
  account: string;
  accountMeta?: Record<string, unknown>;
  grantedScopes: string[];
  missingScopes: string[];
  grantedPermissions?: string[];
  missingPermissions?: string[];
  permissions: PermissionCheckItem[];
  availableServices: string[];
  requiresReauth?: boolean;
  message: string;
  error?: string;
  verifiedAt: number;
}

/**
 * All Drive/GitHub traffic goes through this wrapper so a dead network can
 * never freeze the chat (25 s hard timeout with a friendly bangla error).
 */
async function vaultFetch(
  url: string,
  init: RequestInit = {},
  timeoutMs = 25_000
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(
        'নেটওয়ার্ক টাইমআউট (২৫ সেকেন্ড) — ইন্টারনেট সংযোগ ও টোকেন পরীক্ষা করুন।'
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export interface DriveConnection {
  connected: boolean;
  /** OAuth Web Client ID from the user's own Google Cloud project (optional). */
  clientId: string;
  accessToken: string;
  /** Epoch ms when the short-lived access token dies (0 = unknown/never). */
  expiresAt?: number;
  account?: string;
  folderId: string;
  folderName: string;
  /** "doc" → converted Google Doc, "markdown" → plain .md file. */
  saveMode: 'doc' | 'markdown';
  autoSync: boolean;
  lastSyncAt?: number;
  lastError?: string;
  status?: IntegrationConnectionStatus;
  permissions?: PermissionCheckItem[];
  permissionChecks?: PermissionCheckItem[];
  grantedScopes?: string[];
  missingScopes?: string[];
  availableServices?: string[];
}

export interface GithubConnection {
  connected: boolean;
  token: string;
  owner: string;
  repo: string;
  branch: string;
  path: string;
  account?: string;
  autoSync: boolean;
  lastSyncAt?: number;
  lastCommitUrl: string;
  lastError?: string;
  status?: IntegrationConnectionStatus;
  permissions?: PermissionCheckItem[];
  permissionChecks?: PermissionCheckItem[];
  grantedScopes?: string[];
  grantedPermissions?: string[];
  missingPermissions?: string[];
  availableServices?: string[];
}

export interface SupabaseConnection {
  connected: boolean;
  projectUrl: string;
  apiKey?: string;
  anonKey?: string;
  serviceRoleKey?: string;
  projectRef?: string;
  account?: string;
  autoSync?: boolean;
  lastSyncAt?: number;
  lastError?: string;
  managementToken?: string;
  status?: IntegrationConnectionStatus;
  permissions?: PermissionCheckItem[];
  permissionChecks?: PermissionCheckItem[];
  grantedScopes?: string[];
  grantedPermissions?: string[];
  missingPermissions?: string[];
  availableServices?: string[];
}

export interface VercelConnection {
  connected: boolean;
  token: string;
  projectId?: string;
  teamId?: string;
  account?: string;
  autoSync?: boolean;
  lastSyncAt?: number;
  lastError?: string;
  status?: IntegrationConnectionStatus;
  permissions?: PermissionCheckItem[];
  permissionChecks?: PermissionCheckItem[];
  grantedScopes?: string[];
  grantedPermissions?: string[];
  missingPermissions?: string[];
  availableServices?: string[];
}

export interface IntegrationAuditLog {
  id: string;
  provider: 'google' | 'github' | 'supabase' | 'vercel';
  action: string;
  target: string;
  timestamp: number;
  status: 'success' | 'failed' | 'confirmed' | 'requires_confirmation';
  account?: string;
  permissions?: string[];
  apiEndpoint?: string;
  detail?: string;
}

export type IntegrationAuditLogItem = IntegrationAuditLog;

export interface VaultConnections {
  drive: DriveConnection;
  github: GithubConnection;
  supabase?: SupabaseConnection;
  vercel?: VercelConnection;
  auditLogs?: IntegrationAuditLog[];
}

export interface CloudPushResult {
  ok: boolean;
  provider: 'drive' | 'github' | 'local';
  message: string;
  url?: string;
  fileId?: string;
  path?: string;
}

export const DEFAULT_VAULT_CONNECTIONS: VaultConnections = {
  drive: {
    connected: false,
    clientId: '',
    accessToken: '',
    expiresAt: 0,
    account: '',
    folderId: '',
    folderName: 'SMFTA AI Pro',
    saveMode: 'doc',
    autoSync: false,
    lastSyncAt: 0,
    lastError: '',
  },
  github: {
    connected: false,
    token: '',
    owner: '',
    repo: '',
    branch: 'main',
    path: 'smfta-notes',
    account: '',
    autoSync: false,
    lastSyncAt: 0,
    lastCommitUrl: '',
    lastError: '',
  },
  supabase: {
    connected: false,
    projectUrl: '',
    apiKey: '',
    anonKey: '',
    serviceRoleKey: '',
    account: '',
    autoSync: false,
    lastSyncAt: 0,
    lastError: '',
  },
  vercel: {
    connected: false,
    token: '',
    projectId: '',
    teamId: '',
    account: '',
    autoSync: false,
    lastSyncAt: 0,
    lastError: '',
  },
  auditLogs: [],
};

const str = (v: unknown, fallback = '') => (typeof v === 'string' ? v : fallback);
const bool = (v: unknown, fallback = false) =>
  typeof v === 'boolean' ? v : fallback;
const num = (v: unknown, fallback = 0) =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;
const strArr = (v: unknown): string[] | undefined =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : undefined;

/** Keeps an old / hand-edited localStorage blob from breaking the vault. */
export function sanitizeVaultConnections(input: unknown): VaultConnections {
  const raw = (input && typeof input === 'object' ? input : {}) as Record<
    string,
    unknown
  >;
  const d = (raw.drive && typeof raw.drive === 'object' ? raw.drive : {}) as Record<
    string,
    unknown
  >;
  const g = (
    raw.github && typeof raw.github === 'object' ? raw.github : {}
  ) as Record<string, unknown>;
  const s = (
    raw.supabase && typeof raw.supabase === 'object' ? raw.supabase : {}
  ) as Record<string, unknown>;
  const v = (
    raw.vercel && typeof raw.vercel === 'object' ? raw.vercel : {}
  ) as Record<string, unknown>;

  const drive: DriveConnection = {
    connected: bool(d.connected),
    clientId: str(d.clientId).trim().slice(0, 300),
    accessToken: str(d.accessToken).trim().slice(0, 4000),
    expiresAt: num(d.expiresAt),
    account: str(d.account).slice(0, 200),
    folderId: str(d.folderId).trim().slice(0, 200),
    folderName: str(d.folderName, 'SMFTA AI Pro').slice(0, 120) || 'SMFTA AI Pro',
    saveMode: d.saveMode === 'markdown' ? 'markdown' : 'doc',
    autoSync: bool(d.autoSync),
    lastSyncAt: num(d.lastSyncAt),
    lastError: str(d.lastError).slice(0, 400),
    ...(typeof d.status === 'string' ? { status: d.status as IntegrationConnectionStatus } : {}),
    ...(strArr(d.grantedScopes) ? { grantedScopes: strArr(d.grantedScopes) } : {}),
    ...(strArr(d.missingScopes) ? { missingScopes: strArr(d.missingScopes) } : {}),
    ...(strArr(d.availableServices) ? { availableServices: strArr(d.availableServices) } : {}),
    ...(Array.isArray(d.permissions) ? { permissions: d.permissions as PermissionCheckItem[] } : {}),
    ...(Array.isArray(d.permissionChecks) ? { permissionChecks: d.permissionChecks as PermissionCheckItem[] } : {}),
  };

  const branch = str(g.branch, 'main').trim().replace(/^\/+/, '').slice(0, 120) || 'main';
  const github: GithubConnection = {
    connected: bool(g.connected),
    token: str(g.token).trim().slice(0, 4000),
    owner: str(g.owner).trim().slice(0, 100),
    repo: str(g.repo).trim().slice(0, 150),
    branch,
    path: str(g.path, 'smfta-notes')
      .trim()
      .replace(/^\/+|\/+$/g, '')
      .slice(0, 300),
    account: str(g.account).slice(0, 200),
    autoSync: bool(g.autoSync),
    lastSyncAt: num(g.lastSyncAt),
    lastCommitUrl: str(g.lastCommitUrl).slice(0, 500),
    lastError: str(g.lastError).slice(0, 400),
    ...(typeof g.status === 'string' ? { status: g.status as IntegrationConnectionStatus } : {}),
    ...(strArr(g.grantedPermissions) ? { grantedPermissions: strArr(g.grantedPermissions) } : {}),
    ...(strArr(g.missingPermissions) ? { missingPermissions: strArr(g.missingPermissions) } : {}),
    ...(strArr(g.availableServices) ? { availableServices: strArr(g.availableServices) } : {}),
    ...(Array.isArray(g.permissions) ? { permissions: g.permissions as PermissionCheckItem[] } : {}),
    ...(Array.isArray(g.permissionChecks) ? { permissionChecks: g.permissionChecks as PermissionCheckItem[] } : {}),
  };

  const apiKey = str(s.apiKey || s.serviceRoleKey || s.anonKey).trim().slice(0, 4000);
  const supabase: SupabaseConnection = {
    connected: bool(s.connected),
    projectUrl: str(s.projectUrl).trim().slice(0, 500),
    apiKey,
    anonKey: str(s.anonKey || s.apiKey).trim().slice(0, 4000),
    serviceRoleKey: str(s.serviceRoleKey).trim().slice(0, 4000),
    projectRef: str(s.projectRef).trim().slice(0, 200),
    managementToken: str(s.managementToken).trim().slice(0, 4000),
    account: str(s.account).slice(0, 200),
    autoSync: bool(s.autoSync),
    lastSyncAt: num(s.lastSyncAt),
    lastError: str(s.lastError).slice(0, 400),
    ...(typeof s.status === 'string' ? { status: s.status as IntegrationConnectionStatus } : {}),
    ...(strArr(s.grantedPermissions) ? { grantedPermissions: strArr(s.grantedPermissions) } : {}),
    ...(strArr(s.missingPermissions) ? { missingPermissions: strArr(s.missingPermissions) } : {}),
    ...(strArr(s.availableServices) ? { availableServices: strArr(s.availableServices) } : {}),
    ...(Array.isArray(s.permissions) ? { permissions: s.permissions as PermissionCheckItem[] } : {}),
    ...(Array.isArray(s.permissionChecks) ? { permissionChecks: s.permissionChecks as PermissionCheckItem[] } : {}),
  };

  const vercel: VercelConnection = {
    connected: bool(v.connected),
    token: str(v.token).trim().slice(0, 4000),
    projectId: str(v.projectId).trim().slice(0, 200),
    teamId: str(v.teamId).trim().slice(0, 200),
    account: str(v.account).slice(0, 200),
    autoSync: bool(v.autoSync),
    lastSyncAt: num(v.lastSyncAt),
    lastError: str(v.lastError).slice(0, 400),
    ...(typeof v.status === 'string' ? { status: v.status as IntegrationConnectionStatus } : {}),
    ...(strArr(v.grantedPermissions) ? { grantedPermissions: strArr(v.grantedPermissions) } : {}),
    ...(strArr(v.missingPermissions) ? { missingPermissions: strArr(v.missingPermissions) } : {}),
    ...(strArr(v.availableServices) ? { availableServices: strArr(v.availableServices) } : {}),
    ...(Array.isArray(v.permissions) ? { permissions: v.permissions as PermissionCheckItem[] } : {}),
    ...(Array.isArray(v.permissionChecks) ? { permissionChecks: v.permissionChecks as PermissionCheckItem[] } : {}),
  };

  const auditLogs = Array.isArray(raw.auditLogs)
    ? (raw.auditLogs as IntegrationAuditLog[]).slice(-50)
    : [];

  return { drive, github, supabase, vercel, auditLogs };
}

export function loadVaultConnections(): VaultConnections {
  try {
    const raw = localStorage.getItem(VAULT_LS_KEY);
    if (!raw) return sanitizeVaultConnections({});
    return sanitizeVaultConnections(JSON.parse(raw));
  } catch {
    return sanitizeVaultConnections({});
  }
}

export function persistVaultConnections(conns: VaultConnections): void {
  try {
    localStorage.setItem(VAULT_LS_KEY, JSON.stringify(conns));
  } catch {
    // Ignore quota errors — the UI still works with in-memory state.
  }
}

/** `ghp_abcd…wxyz` style masking for on-screen display. */
export function maskToken(token: string): string {
  const t = (token || '').trim();
  if (!t) return '';
  if (t.length <= 8) return '•'.repeat(t.length);
  return `${t.slice(0, 4)}${'•'.repeat(Math.min(12, t.length - 8))}${t.slice(-4)}`;
}

export function driveTokenFresh(conn: DriveConnection): boolean {
  if (!conn.accessToken) return false;
  if (!conn.expiresAt) return true;
  return conn.expiresAt - Date.now() > 45_000;
}

export function driveReady(conn: DriveConnection): boolean {
  return Boolean(conn.connected && (conn.clientId || driveTokenFresh(conn)));
}

export function githubReady(conn: GithubConnection): boolean {
  return Boolean(conn.connected && conn.token && conn.owner && conn.repo);
}

export function parseRepoSlug(slug: string): { owner: string; repo: string } {
  const clean = (slug || '')
    .trim()
    .replace(/^https?:\/\/github\.com\//i, '')
    .replace(/\.git$/i, '')
    .replace(/\/+$/, '');
  const [owner = '', repo = ''] = clean.split('/');
  return { owner: owner.trim(), repo: repo.trim() };
}

export function isValidRepoSlug(slug: string): boolean {
  const { owner, repo } = parseRepoSlug(slug);
  return Boolean(owner && repo && /^[\w.-]+$/.test(owner) && /^[\w.-]+$/.test(repo));
}

// ─────────────────────────────────────────────────────────────────────────────
// Google Drive
// ─────────────────────────────────────────────────────────────────────────────

type GisTokenResponse = {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

type GisWindow = Window & {
  google?: {
    accounts?: {
      oauth2?: {
        initTokenClient: (cfg: {
          client_id: string;
          scope: string;
          prompt?: string;
          callback: (resp: GisTokenResponse) => void;
          error_callback?: (err: { message?: string; type?: string }) => void;
        }) => { requestAccessToken: (opts?: { prompt?: string }) => void };
      };
    };
  };
};

let gisLoader: Promise<void> | null = null;

function loadGoogleIdentityServices(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Google Sign-In is browser-only.'));
  }
  const w = window as GisWindow;
  if (w.google?.accounts?.oauth2) return Promise.resolve();
  if (gisLoader) return gisLoader;

  gisLoader = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${GIS_SRC}"]`
    );
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () =>
        reject(new Error('Google Identity Services load failed.'))
      );
      return;
    }
    const script = document.createElement('script');
    script.src = GIS_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () =>
      reject(
        new Error(
          'Google Sign-In স্ক্রিপ্ট লোড হয়নি — ইন্টারনেট সংযোগ পরীক্ষা করুন।'
        )
      );
    document.head.appendChild(script);
  });
  return gisLoader;
}

/**
 * Opens Google's OAuth consent popup and returns a fresh short-lived access
 * token. Requires the user's own OAuth Web Client ID (free in Google Cloud).
 */
export async function requestGoogleDriveToken(
  clientId: string
): Promise<{ accessToken: string; expiresAt: number }> {
  const id = (clientId || '').trim();
  if (!id) {
    throw new Error(
      'OAuth Client ID প্রয়োজন (Google Cloud → APIs & Services → Credentials)।'
    );
  }
  await loadGoogleIdentityServices();
  const oauth2 = (window as GisWindow).google?.accounts?.oauth2;
  if (!oauth2) throw new Error('Google Identity Services পাওয়া যায়নি।');

  return new Promise((resolve, reject) => {
    let settled = false;
    const client = oauth2.initTokenClient({
      client_id: id,
      scope: GOOGLE_WORKSPACE_SCOPES.join(' '),
      prompt: 'consent',
      callback: (resp) => {
        settled = true;
        if (resp?.access_token) {
          resolve({
            accessToken: resp.access_token,
            expiresAt: Date.now() + (resp.expires_in || 3600) * 1000,
          });
        } else {
          reject(
            new Error(
              resp?.error_description || resp?.error || 'Google অনুমতি দেওয়া হয়নি।'
            )
          );
        }
      },
      error_callback: (err) => {
        if (!settled) {
          reject(new Error(err?.message || 'Google সাইন-ইন বাতিল হয়েছে।'));
        }
      },
    });
    client.requestAccessToken({ prompt: 'consent' });
  });
}

function driveHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

async function driveError(res: Response): Promise<string> {
  const text = await res.text().catch(() => '');
  try {
    const j = JSON.parse(text) as { error?: { message?: string } };
    if (j?.error?.message) return j.error.message;
  } catch {
    /* not json */
  }
  if (res.status === 401) {
    return 'টোকেনের মেয়াদ শেষ বা অনুমতি নেই (401)। আবার কানেক্ট করুন।';
  }
  if (res.status === 403) {
    return 'Google Drive অনুমতি প্রত্যাখ্যান করেছে (403) — Drive API চালু আছে কিনা দেখুন।';
  }
  return `Google Drive error ${res.status}: ${text.slice(0, 200)}`;
}

/** Verifies the token and fetches the account e-mail / display name. */
export async function verifyDriveToken(token: string): Promise<{
  ok: boolean;
  message: string;
  account?: string;
  email?: string;
}> {
  try {
    const res = await vaultFetch(`${DRIVE_API}/about?fields=user(displayName,emailAddress)`, {
      headers: driveHeaders(token),
    });
    if (!res.ok) return { ok: false, message: await driveError(res) };
    const j = (await res.json()) as {
      user?: { displayName?: string; emailAddress?: string };
    };
    const account = j?.user?.emailAddress || j?.user?.displayName || 'Google Account';
    return { ok: true, message: `Connected as ${account}`, account, email: account };
  } catch (err: unknown) {
    return {
      ok: false,
      message:
        err instanceof Error
          ? err.message
          : 'Could not reach Google Drive',
    };
  }
}

export async function verifySupabaseConnection(
  url: string,
  key: string
): Promise<{ ok: boolean; message: string; account?: string }> {
  const cleanUrl = (url || '').trim().replace(/\/+$/, '');
  const cleanKey = (key || '').trim();
  if (!cleanUrl || !cleanKey) {
    return { ok: false, message: 'Supabase URL and API Key are required' };
  }
  try {
    const res = await vaultFetch(`${cleanUrl}/rest/v1/`, {
      headers: {
        apikey: cleanKey,
        Authorization: `Bearer ${cleanKey}`,
      },
    });
    if (res.ok || res.status === 404) {
      const host = new URL(cleanUrl).hostname;
      return { ok: true, message: `Connected to Supabase project (${host})`, account: host };
    }
    return { ok: false, message: `Supabase returned HTTP ${res.status}` };
  } catch (err: unknown) {
    return {
      ok: false,
      message: err instanceof Error ? `Could not reach Supabase: ${err.message}` : 'Network error reaching Supabase',
    };
  }
}

export async function verifyVercelToken(
  token: string,
  teamId?: string
): Promise<{ ok: boolean; message: string; account?: string }> {
  const cleanToken = (token || '').trim();
  if (!cleanToken) {
    return { ok: false, message: 'Vercel API token is required' };
  }
  try {
    const url = teamId
      ? `https://api.vercel.com/v2/user?teamId=${encodeURIComponent(teamId)}`
      : 'https://api.vercel.com/v2/user';
    const res = await vaultFetch(url, {
      headers: {
        Authorization: `Bearer ${cleanToken}`,
      },
    });
    if (!res.ok) {
      return { ok: false, message: `Vercel authorization failed (HTTP ${res.status})` };
    }
    const data = (await res.json()) as { user?: { username?: string; email?: string } };
    const account = data?.user?.username || data?.user?.email || 'Vercel User';
    return { ok: true, message: `Connected as ${account}`, account };
  } catch (err: unknown) {
    return {
      ok: false,
      message: err instanceof Error ? `Could not reach Vercel: ${err.message}` : 'Network error reaching Vercel',
    };
  }
}

async function ensureDriveFolderById(
  token: string,
  folderName: string,
  knownId?: string
): Promise<string> {
  if (knownId) return knownId;
  const name = (folderName || 'SMFTA AI Pro').replace(/'/g, "\\'");
  const q = encodeURIComponent(
    `name = '${name}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
  );
  const listRes = await vaultFetch(`${DRIVE_API}/files?q=${q}&fields=files(id,name)&pageSize=1`, {
    headers: driveHeaders(token),
  });
  if (listRes.ok) {
    const j = (await listRes.json()) as { files?: Array<{ id?: string }> };
    const found = j?.files?.[0]?.id;
    if (found) return found;
  }
  const createRes = await vaultFetch(`${DRIVE_API}/files`, {
    method: 'POST',
    headers: { ...driveHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: folderName || 'SMFTA AI Pro',
      mimeType: 'application/vnd.google-apps.folder',
    }),
  });
  if (!createRes.ok) return '';
  const created = (await createRes.json()) as { id?: string };
  return created?.id || '';
}

export async function ensureDriveFolder(
  connOrToken: DriveConnection | string,
  folderName?: string,
  knownId?: string
): Promise<any> {
  if (typeof connOrToken === 'string') {
    return ensureDriveFolderById(connOrToken, folderName || 'SMFTA AI Pro', knownId);
  }
  const conn = connOrToken;
  if (!conn.accessToken) {
    return { ok: false, message: 'Google Drive কানেক্ট করা নেই।' };
  }
  const folderId = await ensureDriveFolderById(
    conn.accessToken,
    conn.folderName || 'SMFTA AI Pro',
    conn.folderId
  );
  if (!folderId) {
    return { ok: false, message: 'Google Drive ফোল্ডার তৈরি করা যায়নি।' };
  }
  return {
    ok: true,
    folderId,
    message: `✅ Drive ফোল্ডার প্রস্তুত: ${conn.folderName || 'SMFTA AI Pro'}`,
  };
}

export interface DriveFileInfo {
  id: string;
  name: string;
  webViewLink?: string;
  modifiedTime?: string;
  mimeType?: string;
}

/** Uploads markdown text as either a converted Google Doc or a plain .md file. */
export async function driveUploadText(
  token: string,
  opts: {
    title: string;
    content: string;
    saveMode?: 'doc' | 'markdown';
    folderId?: string;
    overwriteFileId?: string;
  }
): Promise<DriveFileInfo> {
  const title = (opts.title || 'Untitled note').slice(0, 200);
  const asDoc = (opts.saveMode || 'doc') === 'doc';
  const metadata: Record<string, unknown> = {
    name: asDoc ? title : `${title.replace(/[\\/:*?"<>|]/g, '-')}.md`,
  };
  if (asDoc) metadata.mimeType = 'application/vnd.google-apps.document';
  if (opts.folderId && !opts.overwriteFileId) metadata.parents = [opts.folderId];

  const boundary = '-------smfta' + Math.random().toString(36).slice(2);
  const body =
    `--${boundary}\r\n` +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) +
    '\r\n' +
    `--${boundary}\r\n` +
    'Content-Type: text/markdown; charset=UTF-8\r\n\r\n' +
    (opts.content || '') +
    '\r\n' +
    `--${boundary}--`;

  const url = opts.overwriteFileId
    ? `${DRIVE_UPLOAD_API}/files/${encodeURIComponent(
        opts.overwriteFileId
      )}?uploadType=multipart&fields=id,name,webViewLink`
    : `${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id,name,webViewLink`;

  const res = await vaultFetch(url, {
    method: opts.overwriteFileId ? 'PATCH' : 'POST',
    headers: {
      ...driveHeaders(token),
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body,
  });
  if (!res.ok) throw new Error(await driveError(res));
  const j = (await res.json()) as DriveFileInfo;
  if (!j?.id) throw new Error('Drive আপলোড সম্পন্ন হয়নি (id পাওয়া যায়নি)।');
  return {
    id: j.id,
    name: j.name || metadata.name?.toString() || title,
    webViewLink:
      j.webViewLink ||
      `https://docs.google.com/document/d/${j.id}/edit`,
    mimeType: asDoc
      ? 'application/vnd.google-apps.document'
      : 'text/markdown',
  };
}

export async function driveListRecent(
  token: string,
  folderId?: string
): Promise<DriveFileInfo[]> {
  const parts = ['trashed = false'];
  if (folderId) parts.push(`'${folderId}' in parents`);
  const q = encodeURIComponent(parts.join(' and '));
  const res = await vaultFetch(
    `${DRIVE_API}/files?q=${q}&orderBy=modifiedTime desc&pageSize=25&fields=files(id,name,webViewLink,modifiedTime,mimeType)`,
    { headers: driveHeaders(token) }
  );
  if (!res.ok) throw new Error(await driveError(res));
  const j = (await res.json()) as { files?: DriveFileInfo[] };
  return j?.files || [];
}

// ─────────────────────────────────────────────────────────────────────────────
// GitHub
// ─────────────────────────────────────────────────────────────────────────────

export function githubHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${(token || '').trim()}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

async function githubError(res: Response): Promise<string> {
  const text = await res.text().catch(() => '');
  try {
    const j = JSON.parse(text) as { message?: string };
    if (j?.message) return j.message;
  } catch {
    /* not json */
  }
  if (res.status === 401) return 'GitHub টোকেন অবৈধ বা মেয়াদোত্তীর্ণ (401)।';
  if (res.status === 404)
    return 'রিপো/ব্রাঞ্চ পাওয়া যায়নি (404) — নাম, অ্যাক্সেস ও ব্রাঞ্চ চেক করুন।';
  if (res.status === 403)
    return 'GitHub অনুমতি প্রত্যাখ্যান করেছে (403) — token-এ repo scope আছে কিনা দেখুন।';
  return `GitHub error ${res.status}: ${text.slice(0, 200)}`;
}

export async function verifyGithubToken(token: string): Promise<{
  ok: boolean;
  message: string;
  login?: string;
}> {
  try {
    const res = await vaultFetch(`${GITHUB_API}/user`, { headers: githubHeaders(token) });
    if (!res.ok) return { ok: false, message: await githubError(res) };
    const j = (await res.json()) as { login?: string; name?: string };
    const login = j?.login || j?.name || 'github-user';
    return { ok: true, message: `Connected as @${login}`, login };
  } catch (err: unknown) {
    return {
      ok: false,
      message:
        err instanceof Error
          ? `GitHub-এ পৌঁছানো যায়নি: ${err.message}`
          : 'GitHub-এ পৌঁছানো যায়নি।',
    };
  }
}

/**
 * Creates the repository automatically when it does not exist yet, so
 * "Connect GitHub" never dead-ends on a 404.
 */
export async function githubEnsureRepo(
  token: string,
  owner: string,
  repo: string
): Promise<{ ok: boolean; created: boolean; message: string }> {
  try {
    const res = await vaultFetch(`${GITHUB_API}/repos/${owner}/${repo}`, {
      headers: githubHeaders(token),
    });
    if (res.ok) return { ok: true, created: false, message: 'রিপো পাওয়া গেছে।' };
    if (res.status !== 404) {
      return { ok: false, created: false, message: await githubError(res) };
    }
    const createRes = await vaultFetch(`${GITHUB_API}/user/repos`, {
      method: 'POST',
      headers: { ...githubHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: repo,
        private: true,
        auto_init: true,
        description: 'SMFTA AI Pro — notes & code vault',
      }),
    });
    if (!createRes.ok) {
      const msg = await githubError(createRes);
      const me = await verifyGithubToken(token);
      if (me.ok && me.login && me.login.toLowerCase() !== owner.toLowerCase()) {
        return {
          ok: false,
          created: false,
          message: `${msg} — টোকেনটি @${me.login} এর, কিন্তু রিপো owner "${owner}"। owner "${me.login}" দিন অথবা নিজে রিপোটি তৈরি করুন।`,
        };
      }
      return { ok: false, created: false, message: msg };
    }
    // auto_init needs a moment before the first commit can be created
    await new Promise((r) => setTimeout(r, 1200));
    return {
      ok: true,
      created: true,
      message: '✅ নতুন রিপো তৈরি হয়েছে (private, auto-init)।',
    };
  } catch (err: unknown) {
    return {
      ok: false,
      created: false,
      message: err instanceof Error ? err.message : 'GitHub রিপো তৈরি ব্যর্থ।',
    };
  }
}

export async function githubRepoInfo(
  token: string,
  owner: string,
  repo: string,
  branch: string
): Promise<{ ok: boolean; message: string; defaultBranch?: string }> {
  try {
    const res = await vaultFetch(`${GITHUB_API}/repos/${owner}/${repo}`, {
      headers: githubHeaders(token),
    });
    if (!res.ok) return { ok: false, message: await githubError(res) };
    const j = (await res.json()) as { full_name?: string; default_branch?: string };

    const branchRes = await vaultFetch(
      `${GITHUB_API}/repos/${owner}/${repo}/branches/${encodeURIComponent(branch)}`,
      { headers: githubHeaders(token) }
    );
    if (!branchRes.ok) {
      return {
        ok: false,
        message: `রিপো পাওয়া গেছে (${j?.full_name}) কিন্তু "${branch}" ব্রাঞ্চ নেই।`,
        defaultBranch: j?.default_branch,
      };
    }
    return {
      ok: true,
      message: `✅ ${j?.full_name} · ${branch}`,
      defaultBranch: j?.default_branch,
    };
  } catch (err: unknown) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'GitHub যাচাই ব্যর্থ হয়েছে।',
    };
  }
}

function utf8ToBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary);
}

function base64ToUtf8(b64: string): string {
  const binary = atob((b64 || '').replace(/\s/g, ''));
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function joinRepoPath(base: string, file: string): string {
  const cleanBase = (base || '').trim().replace(/^\/+|\/+$/g, '');
  const cleanFile = (file || '').trim().replace(/^\/+/, '');
  return cleanBase ? `${cleanBase}/${cleanFile}` : cleanFile;
}

export interface GithubCommitResult {
  ok: boolean;
  path: string;
  url?: string;
  htmlUrl?: string;
  message: string;
  sha?: string;
}

async function githubFileSha(
  token: string,
  owner: string,
  repo: string,
  path: string,
  branch: string
): Promise<string | undefined> {
  const res = await vaultFetch(
    `${GITHUB_API}/repos/${owner}/${repo}/contents/${encodeURI(
      path
    )}?ref=${encodeURIComponent(branch)}`,
    { headers: githubHeaders(token) }
  );
  if (!res.ok) return undefined;
  const j = (await res.json()) as { sha?: string };
  return j?.sha;
}

/** Creates or updates a single file on a branch (one commit per call). */
export async function githubPutFile(
  conn: GithubConnection,
  filePath: string,
  content: string,
  message: string
): Promise<GithubCommitResult> {
  const path = joinRepoPath(conn.path, filePath);
  if (!conn.token || !conn.owner || !conn.repo) {
    return { ok: false, path, message: 'GitHub কানেকশন সম্পূর্ণ নয়।' };
  }
  try {
    const sha = await githubFileSha(
      conn.token,
      conn.owner,
      conn.repo,
      path,
      conn.branch
    );
    const res = await vaultFetch(
      `${GITHUB_API}/repos/${conn.owner}/${conn.repo}/contents/${encodeURI(path)}`,
      {
        method: 'PUT',
        headers: { ...githubHeaders(conn.token), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          content: utf8ToBase64(content),
          branch: conn.branch,
          ...(sha ? { sha } : {}),
        }),
      }
    );
    if (!res.ok) {
      return { ok: false, path, message: await githubError(res) };
    }
    const j = (await res.json()) as {
      content?: { html_url?: string };
      commit?: { sha?: string; html_url?: string };
    };
    return {
      ok: true,
      path,
      sha: j?.commit?.sha,
      htmlUrl: j?.content?.html_url || j?.commit?.html_url,
      url: j?.commit?.html_url || j?.content?.html_url,
      message: `✅ Committed to ${conn.owner}/${conn.repo} · ${path}`,
    };
  } catch (err: unknown) {
    return {
      ok: false,
      path,
      message: err instanceof Error ? err.message : 'GitHub commit ব্যর্থ হয়েছে।',
    };
  }
}

export interface GithubFileEntry {
  name: string;
  path: string;
  sha: string;
  size: number;
  type: string;
  downloadUrl?: string;
}

export async function githubListDir(
  conn: GithubConnection,
  dirPath = ''
): Promise<{ ok: boolean; files: GithubFileEntry[]; message: string }> {
  const path = joinRepoPath(conn.path, dirPath);
  try {
    const res = await vaultFetch(
      `${GITHUB_API}/repos/${conn.owner}/${conn.repo}/contents/${encodeURI(
        path
      )}?ref=${encodeURIComponent(conn.branch)}`,
      { headers: githubHeaders(conn.token) }
    );
    if (res.status === 404) {
      return { ok: true, files: [], message: 'ফোল্ডার এখনো তৈরি হয়নি (প্রথম commit-এ তৈরি হবে)।' };
    }
    if (!res.ok) return { ok: false, files: [], message: await githubError(res) };
    const j = (await res.json()) as unknown;
    const list = Array.isArray(j) ? (j as GithubFileEntry[]) : [];
    return {
      ok: true,
      files: list.map((f) => ({
        name: f.name,
        path: f.path,
        sha: f.sha,
        size: f.size,
        type: f.type,
        downloadUrl: f.downloadUrl,
      })),
      message: `${list.length} file(s) in ${path || '/'}`,
    };
  } catch (err: unknown) {
    return {
      ok: false,
      files: [],
      message: err instanceof Error ? err.message : 'GitHub ফাইল তালিকা ব্যর্থ।',
    };
  }
}

export async function githubGetFile(
  conn: GithubConnection,
  filePath: string
): Promise<{ ok: boolean; content: string; message: string }> {
  const path = joinRepoPath(conn.path, filePath);
  try {
    const res = await vaultFetch(
      `${GITHUB_API}/repos/${conn.owner}/${conn.repo}/contents/${encodeURI(
        path
      )}?ref=${encodeURIComponent(conn.branch)}`,
      { headers: githubHeaders(conn.token) }
    );
    if (!res.ok) return { ok: false, content: '', message: await githubError(res) };
    const j = (await res.json()) as { content?: string; encoding?: string };
    const content =
      j?.encoding === 'base64' ? base64ToUtf8(j.content || '') : j?.content || '';
    return { ok: true, content, message: `Loaded ${path}` };
  } catch (err: unknown) {
    return {
      ok: false,
      content: '',
      message: err instanceof Error ? err.message : 'GitHub ফাইল পড়া যায়নি।',
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Notebook ⇄ cloud helpers
// ─────────────────────────────────────────────────────────────────────────────

export function slugifyTitle(title: string, fallback = 'note'): string {
  const slug = (title || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return slug || fallback;
}

export function noteToMarkdown(note: NotebookNote): string {
  const lines: string[] = [];
  lines.push(`# ${note.title || 'Untitled note'}`);
  lines.push('');
  lines.push(`<!-- SMFTA AI Pro · note ${note.id} · ${new Date(note.updatedAt).toISOString()} -->`);
  if (note.tags?.length) {
    lines.push(`**Tags:** ${note.tags.join(', ')}`);
    lines.push('');
  }
  lines.push(note.content || '');
  return lines.join('\n');
}

export function noteFileName(note: NotebookNote): string {
  const custom = (note.filename || '').replace(/[\\/]/g, '-').replace(/\.\./g, '').trim();
  if (custom) return custom.slice(0, 80);
  return `${slugifyTitle(note.title)}.md`;
}

/** Pushes one note to the connected Google Drive account. */
export async function pushNoteToDrive(
  conn: DriveConnection,
  note: NotebookNote
): Promise<CloudPushResult> {
  const token = conn.accessToken;
  if (!token) {
    return {
      ok: false,
      provider: 'drive',
      message: 'Google Drive কানেক্ট করা নেই — Connections থেকে সাইন-ইন করুন।',
    };
  }
  try {
    const folderId =
      conn.folderId || (await ensureDriveFolder(token, conn.folderName));
    const file = await driveUploadText(token, {
      title: note.title || 'Untitled note',
      content: noteToMarkdown(note),
      saveMode: conn.saveMode,
      folderId,
      overwriteFileId: conn.saveMode === 'markdown' ? note.driveFileId : undefined,
    });
    return {
      ok: true,
      provider: 'drive',
      message: `☁️ Saved to Google Drive — ${file.name}`,
      url: file.webViewLink,
      fileId: file.id,
    };
  } catch (err: unknown) {
    return {
      ok: false,
      provider: 'drive',
      message:
        err instanceof Error ? err.message : 'Google Drive-এ সেভ করা যায়নি।',
    };
  }
}

/** Commits one note as markdown into the connected GitHub repository. */
export async function pushNoteToGithub(
  conn: GithubConnection,
  note: NotebookNote
): Promise<CloudPushResult> {
  if (!githubReady(conn)) {
    return {
      ok: false,
      provider: 'github',
      message: 'GitHub কানেক্ট করা নেই — Connections থেকে টোকেন ও রিপো দিন।',
    };
  }
  const fileName = noteFileName(note);
  const res = await githubPutFile(
    conn,
    fileName,
    noteToMarkdown(note),
    `docs(notes): ${note.title || fileName} — via SMFTA AI Pro`
  );
  return {
    ok: res.ok,
    provider: 'github',
    message: res.ok ? `🐙 Committed — ${res.path}` : res.message,
    url: res.htmlUrl || res.url,
    path: res.path,
  };
}

/** Pushes every given note to the target cloud account. */
export async function pushAllNotes(
  conns: VaultConnections,
  notes: NotebookNote[],
  target: 'drive' | 'github'
): Promise<{ pushed: number; failed: number; message: string }> {
  let pushed = 0;
  let failed = 0;
  const errors: string[] = [];
  for (const note of notes) {
    const res =
      target === 'drive'
        ? await pushNoteToDrive(conns.drive, note)
        : await pushNoteToGithub(conns.github, note);
    if (res.ok) pushed += 1;
    else {
      failed += 1;
      if (errors.length < 2) errors.push(res.message);
    }
  }
  const label = target === 'drive' ? 'Google Drive' : 'GitHub';
  return {
    pushed,
    failed,
    message:
      failed === 0
        ? `✅ ${pushed} note(s) synced to ${label}`
        : `⚠️ ${pushed} synced · ${failed} failed to ${label}${
            errors.length ? ` — ${errors[0]}` : ''
          }`,
  };
}

/** One-click full backup (settings + memory + notebook) into a repo. */
export async function backupWorkspaceToGithub(
  conn: GithubConnection,
  snapshot: Record<string, unknown>
): Promise<GithubCommitResult> {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return githubPutFile(
    conn,
    `backups/smfta-backup-${stamp}.json`,
    JSON.stringify(snapshot, null, 2),
    `chore(backup): SMFTA AI Pro snapshot ${stamp}`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Extended Google Drive & GitHub Integrations (v19.1.0)
// ─────────────────────────────────────────────────────────────────────────────

export interface DriveContentResult {
  ok: boolean;
  content: string;
  name: string;
  mimeType: string;
  message: string;
}

export async function driveGetFile(
  token: string,
  fileId: string
): Promise<DriveContentResult> {
  try {
    const metaRes = await vaultFetch(`${DRIVE_API}/files/${fileId}?fields=id,name,mimeType`, {
      headers: driveHeaders(token),
    });
    if (!metaRes.ok) return { ok: false, content: '', name: '', mimeType: '', message: await driveError(metaRes) };
    const meta = (await metaRes.json()) as { name: string; mimeType: string };

    const contentRes = await vaultFetch(`${DRIVE_API}/files/${fileId}?alt=media`, {
      headers: driveHeaders(token),
    });
    if (!contentRes.ok) return { ok: false, content: '', name: meta.name, mimeType: meta.mimeType, message: await driveError(contentRes) };
    const text = await contentRes.text();
    return { ok: true, content: text, name: meta.name, mimeType: meta.mimeType, message: `Loaded ${meta.name}` };
  } catch (err: unknown) {
    return {
      ok: false,
      content: '',
      name: '',
      mimeType: '',
      message: err instanceof Error ? err.message : 'Google Drive ফাইল রিড ব্যর্থ।',
    };
  }
}

export async function driveUpdateFile(
  token: string,
  fileId: string,
  content: string,
  mimeType = 'text/plain'
): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await vaultFetch(
      `${DRIVE_UPLOAD_API}/files/${fileId}?uploadType=media`,
      {
        method: 'PATCH',
        headers: {
          ...driveHeaders(token),
          'Content-Type': mimeType,
        },
        body: content,
      }
    );
    if (!res.ok) return { ok: false, message: await driveError(res) };
    return { ok: true, message: 'Google Drive ফাইল আপডেট সম্পন্ন হয়েছে।' };
  } catch (err: unknown) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'Google Drive আপডেট ব্যর্থ।',
    };
  }
}

export interface GithubRepoItem {
  id: number;
  name: string;
  fullName: string;
  private: boolean;
  htmlUrl: string;
  description: string;
  defaultBranch: string;
}

export async function githubListRepos(
  token: string
): Promise<{ ok: boolean; repos: GithubRepoItem[]; message: string }> {
  try {
    const res = await vaultFetch(`${GITHUB_API}/user/repos?sort=updated&per_page=30`, {
      headers: githubHeaders(token),
    });
    if (!res.ok) return { ok: false, repos: [], message: await githubError(res) };
    const list = (await res.json()) as any[];
    return {
      ok: true,
      repos: list.map((r) => ({
        id: r.id,
        name: r.name,
        fullName: r.full_name,
        private: r.private,
        htmlUrl: r.html_url,
        description: r.description || '',
        defaultBranch: r.default_branch || 'main',
      })),
      message: `${list.length} repositories loaded.`,
    };
  } catch (err: unknown) {
    return {
      ok: false,
      repos: [],
      message: err instanceof Error ? err.message : 'GitHub রিপোজিটরি লোড ব্যর্থ।',
    };
  }
}

export async function githubCreateBranch(
  conn: GithubConnection,
  newBranchName: string,
  baseBranch?: string
): Promise<{ ok: boolean; branch: string; message: string }> {
  const base = baseBranch || conn.branch || 'main';
  try {
    // 1. Get base branch SHA
    const refRes = await vaultFetch(
      `${GITHUB_API}/repos/${conn.owner}/${conn.repo}/git/ref/heads/${encodeURIComponent(base)}`,
      { headers: githubHeaders(conn.token) }
    );
    if (!refRes.ok) return { ok: false, branch: '', message: await githubError(refRes) };
    const refData = (await refRes.json()) as { object?: { sha?: string } };
    const sha = refData?.object?.sha;
    if (!sha) return { ok: false, branch: '', message: `Base branch "${base}" SHA পাওয়া যায়নি।` };

    // 2. Create new branch ref
    const createRes = await vaultFetch(
      `${GITHUB_API}/repos/${conn.owner}/${conn.repo}/git/refs`,
      {
        method: 'POST',
        headers: { ...githubHeaders(conn.token), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ref: `refs/heads/${newBranchName}`,
          sha,
        }),
      }
    );
    if (!createRes.ok) return { ok: false, branch: '', message: await githubError(createRes) };
    return { ok: true, branch: newBranchName, message: `✅ নতুন ব্রাঞ্চ "${newBranchName}" তৈরি হয়েছে (${base} থেকে)।` };
  } catch (err: unknown) {
    return {
      ok: false,
      branch: '',
      message: err instanceof Error ? err.message : 'GitHub ব্রাঞ্চ তৈরি ব্যর্থ।',
    };
  }
}

export interface GithubPullRequestResult {
  ok: boolean;
  number?: number;
  url?: string;
  htmlUrl?: string;
  title?: string;
  message: string;
}

export async function githubCreatePullRequest(
  conn: GithubConnection,
  title: string,
  headBranch: string,
  baseBranch?: string,
  body?: string
): Promise<GithubPullRequestResult> {
  const base = baseBranch || conn.branch || 'main';
  try {
    const res = await vaultFetch(`${GITHUB_API}/repos/${conn.owner}/${conn.repo}/pulls`, {
      method: 'POST',
      headers: { ...githubHeaders(conn.token), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        head: headBranch,
        base,
        body: body || 'Automated Pull Request generated by SMFTA AI Pro Full-Stack Platform.',
      }),
    });
    if (!res.ok) return { ok: false, message: await githubError(res) };
    const j = (await res.json()) as { number?: number; html_url?: string; title?: string };
    return {
      ok: true,
      number: j.number,
      htmlUrl: j.html_url,
      url: j.html_url,
      title: j.title,
      message: `✅ Pull Request #${j.number} তৈরি হয়েছে: "${title}"`,
    };
  } catch (err: unknown) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'GitHub Pull Request তৈরি ব্যর্থ।',
    };
  }
}

export interface GithubIssueItem {
  id: number;
  number: number;
  title: string;
  state: string;
  htmlUrl: string;
  body: string;
}

export async function githubListIssues(
  conn: GithubConnection,
  state: 'open' | 'closed' | 'all' = 'open'
): Promise<{ ok: boolean; issues: GithubIssueItem[]; message: string }> {
  try {
    const res = await vaultFetch(
      `${GITHUB_API}/repos/${conn.owner}/${conn.repo}/issues?state=${state}&per_page=20`,
      { headers: githubHeaders(conn.token) }
    );
    if (!res.ok) return { ok: false, issues: [], message: await githubError(res) };
    const list = (await res.json()) as any[];
    return {
      ok: true,
      issues: list.map((item) => ({
        id: item.id,
        number: item.number,
        title: item.title,
        state: item.state,
        htmlUrl: item.html_url,
        body: item.body || '',
      })),
      message: `${list.length} issue(s) loaded.`,
    };
  } catch (err: unknown) {
    return {
      ok: false,
      issues: [],
      message: err instanceof Error ? err.message : 'GitHub Issues লোড ব্যর্থ।',
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// v19.0.0 — Complete OAuth Engine, Granular Permission Verification & Real Service Access
// ─────────────────────────────────────────────────────────────────────────────

export async function verifyGithubConnection(conn: GithubConnection): Promise<{
  ok: boolean;
  message: string;
  account?: string;
}> {
  if (!conn.token?.trim()) {
    return { ok: false, message: 'GitHub Token প্রয়োজন।' };
  }
  const userRes = await verifyGithubToken(conn.token);
  if (!userRes.ok) {
    return { ok: false, message: userRes.message };
  }
  if (conn.owner && conn.repo) {
    const repoRes = await githubRepoInfo(
      conn.token,
      conn.owner,
      conn.repo,
      conn.branch || 'main'
    );
    return {
      ok: repoRes.ok,
      message: repoRes.message,
      account: userRes.login,
    };
  }
  return {
    ok: true,
    message: userRes.message,
    account: userRes.login,
  };
}

export async function pushNotesToGithub(
  conn: GithubConnection,
  notes: NotebookNote[]
): Promise<{ ok: boolean; pushed: number; failed: number; message: string }> {
  const res = await pushAllNotes(
    { ...DEFAULT_VAULT_CONNECTIONS, github: conn },
    notes,
    'github'
  );
  return { ok: res.failed === 0, ...res };
}

export async function pullNotesFromGithub(
  conn: GithubConnection
): Promise<{ ok: boolean; notes?: NotebookNote[]; message: string }> {
  if (!githubReady(conn)) {
    return { ok: false, message: 'GitHub কানেকশন সম্পূর্ণ নয়।' };
  }
  const list = await githubListDir(conn, '');
  if (!list.ok) return { ok: false, message: list.message };
  const mdFiles = list.files.filter((f) => f.type === 'file' && /\.md$/i.test(f.name));
  const imported: NotebookNote[] = [];
  for (const f of mdFiles.slice(0, 30)) {
    const rel = conn.path && f.path.startsWith(`${conn.path}/`)
      ? f.path.slice(conn.path.length + 1)
      : f.name;
    const fileRes = await githubGetFile(conn, rel);
    if (fileRes.ok) {
      imported.push({
        id: `gh-${f.sha || f.name}`,
        title: f.name.replace(/\.md$/i, ''),
        content: fileRes.content,
        tags: ['github'],
        pinned: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        filename: f.name,
      });
    }
  }
  return {
    ok: true,
    notes: imported,
    message: `✅ ${imported.length} note(s) imported from GitHub (${conn.owner}/${conn.repo})`,
  };
}

export async function pushNotesToDrive(
  conn: DriveConnection,
  notes: NotebookNote[]
): Promise<{ ok: boolean; pushed: number; failed: number; message: string }> {
  const res = await pushAllNotes(
    { ...DEFAULT_VAULT_CONNECTIONS, drive: conn },
    notes,
    'drive'
  );
  return { ok: res.failed === 0, ...res };
}

export async function pullNotesFromDrive(
  conn: DriveConnection
): Promise<{ ok: boolean; notes?: NotebookNote[]; message: string }> {
  if (!conn.accessToken) {
    return { ok: false, message: 'Google Drive টোকেন নেই।' };
  }
  try {
    const files = await driveListRecent(conn.accessToken, conn.folderId || undefined);
    const imported: NotebookNote[] = [];
    for (const f of files.slice(0, 20)) {
      const contentRes = await driveGetFile(conn.accessToken, f.id);
      if (contentRes.ok) {
        imported.push({
          id: `gd-${f.id}`,
          title: f.name.replace(/\.md$/i, ''),
          content: contentRes.content,
          tags: ['drive'],
          pinned: false,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          driveFileId: f.id,
        });
      }
    }
    return {
      ok: true,
      notes: imported,
      message: `✅ ${imported.length} file(s) imported from Google Drive`,
    };
  } catch (err: unknown) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'Google Drive থেকে নোট আনা যায়নি।',
    };
  }
}

/**
 * Computes accurate 6-state connection status:
 * - 'not_connected'
 * - 'connecting'
 * - 'connected' (ONLY when connected and all required permissions are verified)
 * - 'permission_required' (when connected or authenticated, but required scopes/repo permissions are missing)
 * - 'connection_expired' | 'expired' (when token has expired or HTTP 401 was reported)
 * - 'connection_error' | 'error' (when lastError indicates network/API error)
 */
export function resolveConnectionStatus(
  provider: IntegrationProviderId,
  conns: VaultConnections,
  isConnecting = false
): IntegrationConnectionStatus {
  if (isConnecting) return 'connecting';

  if (provider === 'google') {
    const d = conns.drive;
    if (d.expiresAt && d.expiresAt > 0 && d.expiresAt <= Date.now()) {
      return 'connection_expired';
    }
    if (d.status && d.status !== 'not_connected') {
      return d.status;
    }
    if (d.lastError && /401|expired|মেয়াদ/i.test(d.lastError)) return 'connection_expired';
    if (d.lastError) return 'connection_error';
    if (!d.connected && !d.accessToken && !d.clientId) return 'not_connected';
    if (d.missingScopes && d.missingScopes.length > 0) return 'permission_required';
    const checks = d.permissionChecks || d.permissions;
    if (checks && checks.some((p) => p.required && !p.granted)) {
      return 'permission_required';
    }
    if (d.connected) return 'connected';
    return 'permission_required';
  }

  if (provider === 'github') {
    const g = conns.github;
    if (g.status && g.status !== 'not_connected') return g.status;
    if (g.lastError && /401|expired|অবৈধ/i.test(g.lastError)) return 'connection_expired';
    if (g.lastError && /403|permission|scope/i.test(g.lastError)) return 'permission_required';
    if (g.lastError) return 'connection_error';
    if (!g.connected && !g.token) return 'not_connected';
    if (g.missingPermissions && g.missingPermissions.length > 0) {
      return 'permission_required';
    }
    const checks = g.permissionChecks || g.permissions;
    if (checks && checks.some((p) => p.required && !p.granted)) {
      return 'permission_required';
    }
    if (g.connected && (!g.owner || !g.repo)) {
      return 'permission_required';
    }
    if (g.connected) return 'connected';
    return 'not_connected';
  }

  if (provider === 'supabase') {
    const s = conns.supabase;
    if (!s) return 'not_connected';
    if (s.status && s.status !== 'not_connected') return s.status;
    if (s.lastError && /401|403|invalid/i.test(s.lastError)) return 'connection_expired';
    if (s.lastError) return 'connection_error';
    const key = s.apiKey || s.serviceRoleKey || s.anonKey;
    if (!s.connected && !s.projectUrl && !key && !s.managementToken) return 'not_connected';
    if (s.missingPermissions && s.missingPermissions.length > 0) {
      return 'permission_required';
    }
    const checks = s.permissionChecks || s.permissions;
    if (checks && checks.some((p) => p.required && !p.granted)) {
      return 'permission_required';
    }
    if (s.connected) return 'connected';
    if (s.projectUrl || key || s.managementToken) return 'permission_required';
    return 'not_connected';
  }

  if (provider === 'vercel') {
    const v = conns.vercel;
    if (!v) return 'not_connected';
    if (v.status && v.status !== 'not_connected') return v.status;
    if (v.lastError && /401|403/i.test(v.lastError)) return 'connection_expired';
    if (v.lastError) return 'connection_error';
    if (!v.connected && !v.token) return 'not_connected';
    if (v.missingPermissions && v.missingPermissions.length > 0) {
      return 'permission_required';
    }
    const checks = v.permissionChecks || v.permissions;
    if (checks && checks.some((p) => p.required && !p.granted)) {
      return 'permission_required';
    }
    if (v.connected) return 'connected';
    return 'not_connected';
  }

  return 'not_connected';
}

export function formatConnectionStatusLabel(status: IntegrationConnectionStatus): string {
  switch (status) {
    case 'connected':
      return 'Connected';
    case 'connecting':
      return 'Connecting';
    case 'permission_required':
      return 'Permission Required';
    case 'expired':
    case 'connection_expired':
      return 'Connection Expired';
    case 'error':
    case 'connection_error':
      return 'Connection Error';
    case 'not_connected':
    default:
      return 'Not Connected';
  }
}

export async function verifyProviderPermissions(
  providerOrParams:
    | IntegrationProviderId
    | {
        provider: IntegrationProviderId;
        token?: string;
        owner?: string;
        repo?: string;
        branch?: string;
        projectId?: string;
        projectUrl?: string;
        anonKey?: string;
        serviceRoleKey?: string;
        supabaseUrl?: string;
        supabaseKey?: string;
        managementToken?: string;
        teamId?: string;
      },
  opts?: {
    token?: string;
    owner?: string;
    repo?: string;
    branch?: string;
    projectId?: string;
    projectUrl?: string;
    anonKey?: string;
    serviceRoleKey?: string;
    supabaseUrl?: string;
    supabaseKey?: string;
    managementToken?: string;
    teamId?: string;
  }
): Promise<ProviderVerificationResult> {
  const payload =
    typeof providerOrParams === 'string'
      ? {
          provider: providerOrParams,
          ...opts,
          supabaseUrl: opts?.supabaseUrl || opts?.projectUrl,
          supabaseKey: opts?.supabaseKey || opts?.serviceRoleKey || opts?.anonKey,
        }
      : {
          ...providerOrParams,
          supabaseUrl: providerOrParams.supabaseUrl || providerOrParams.projectUrl,
          supabaseKey:
            providerOrParams.supabaseKey ||
            providerOrParams.serviceRoleKey ||
            providerOrParams.anonKey,
        };

  try {
    const res = await vaultFetch('/api/integrations/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = (await res.json()) as ProviderVerificationResult;
    return data;
  } catch (err: unknown) {
    return {
      ok: false,
      provider: payload.provider,
      status: 'connection_error',
      account: '',
      grantedScopes: [],
      missingScopes: [],
      permissions: [],
      availableServices: [],
      message: err instanceof Error ? err.message : 'Verification request failed',
      error: err instanceof Error ? err.message : 'Verification request failed',
      verifiedAt: Date.now(),
    };
  }
}

export async function executeIntegrationAction<T = Record<string, unknown>>(params: {
  provider: IntegrationProviderId;
  action: string;
  target?: string;
  payload?: Record<string, unknown>;
  confirmed?: boolean;
  token?: string;
  supabaseUrl?: string;
  supabaseKey?: string;
}): Promise<
  T & {
    ok: boolean;
    data?: any;
    requiresConfirmation?: boolean;
    requiresReauth?: boolean;
    error?: string;
    message?: string;
  }
> {
  try {
    const res = await vaultFetch('/api/integrations/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    const data = await res.json();
    return {
      ...data,
      data: data?.data !== undefined ? data.data : data,
    };
  } catch (err: unknown) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Integration action failed',
    } as any;
  }
}

export interface OAuthConfigStatusResponse {
  ok: boolean;
  redirectUri: string;
  callbackUrl?: string;
  providers: Record<
    IntegrationProviderId,
    {
      clientIdConfigured: boolean;
      clientSecretConfigured: boolean;
      oauthFlowReady: boolean;
      storedTokenLast4: string | null;
      requiredEnvVars: string[];
      callbackUrl?: string;
      scopes?: string[];
    }
  >;
}

export async function fetchOAuthConfigStatus(): Promise<OAuthConfigStatusResponse | null> {
  try {
    const res = await vaultFetch('/api/oauth/config-status');
    if (!res.ok) return null;
    return (await res.json()) as OAuthConfigStatusResponse;
  } catch {
    return null;
  }
}

export async function storeEncryptedProviderSession(params: {
  provider: IntegrationProviderId;
  token?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
  account?: string;
}): Promise<{ ok: boolean; last4?: string }> {
  try {
    const res = await vaultFetch('/api/oauth/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...params,
        token: params.token || params.accessToken || '',
      }),
    });
    return await res.json();
  } catch {
    return { ok: false };
  }
}

export async function disconnectProviderSession(
  provider: IntegrationProviderId,
  account?: string
): Promise<boolean> {
  try {
    const res = await vaultFetch('/api/oauth/disconnect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, account }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function fetchIntegrationAuditLogs(limit = 50): Promise<IntegrationAuditLog[]> {
  try {
    const res = await vaultFetch(`/api/integrations/audit-log?limit=${encodeURIComponent(String(limit))}`);
    if (!res.ok) return [];
    const data = (await res.json()) as { ok?: boolean; logs?: IntegrationAuditLog[] };
    return Array.isArray(data.logs) ? data.logs : [];
  } catch {
    return [];
  }
}

/**
 * Inspects a user chat message and automatically fetches live service data from
 * connected GitHub, Vercel, Supabase, or Google accounts so the AI can analyze
 * real repositories, deployments, databases, and Drive documents — including
 * when the user asks a follow-up question in an ongoing conversation or selects
 * a service/repository/project/table/file from the Chatbox Connected Services Toolbar.
 */
export async function buildLiveIntegrationContextForPrompt(
  rawPrompt: string,
  connections: VaultConnections,
  conversationServiceContext?: {
    activeService?: 'github' | 'vercel' | 'supabase' | 'google' | null;
    github?: { owner: string; repo: string; branch: string; selectedFiles?: string[] };
    vercel?: { projectId: string; projectName?: string; teamId?: string };
    supabase?: { projectRef?: string; projectName?: string; selectedTable?: string };
    google?: { selectedFileId?: string; selectedFileName?: string; selectedMimeType?: string };
  }
): Promise<string> {
  const q = (rawPrompt || '').trim();
  if (!q || q.length < 2) return '';

  const blocks: string[] = [];
  const activeSvc = conversationServiceContext?.activeService || null;

  const mentionsGithub =
    activeSvc === 'github' ||
    Boolean(conversationServiceContext?.github?.owner && conversationServiceContext?.github?.repo) ||
    /(?:github|গিটহাব|repo|repository|রিপোজিটরি|রিপো|commit|কমিট|pull\s*request|\bpr\b|branch|ব্রাঞ্চ|আমার\s+project|আমার\s+প্রজেক্ট|এই\s+bug|বাগ\s+ঠিক|source\s*code|সোর্স\s*কোড|login\s*system|লগইন\s*সিস্টেম|দেখতে\s+পাচ্ছি\s+না)/i.test(
      q
    );
  const mentionsVercel =
    activeSvc === 'vercel' ||
    Boolean(conversationServiceContext?.vercel?.projectId) ||
    /(?:vercel|ভার্সেল|deploy|deployment|ডিপ্লয়|ডিপ্লয়মেন্ট|build\s*log|বিল্ড\s*লগ|production|preview|website.*পরীক্ষা|ওয়েবসাইট.*পরীক্ষা|ওয়েবসাইট.*পরীক্ষা)/i.test(
      q
    );
  const mentionsSupabase =
    activeSvc === 'supabase' ||
    Boolean(conversationServiceContext?.supabase?.selectedTable || conversationServiceContext?.supabase?.projectRef) ||
    /(?:supabase|সুপাবেস|database|ডাটাবেস|ডেটাবেস|table|টেবিল|schema|স্কিমা|migration|মাইগ্রেশন|sql|query|কোয়েরি)/i.test(
      q
    );
  const mentionsGoogle =
    activeSvc === 'google' ||
    Boolean(conversationServiceContext?.google?.selectedFileId) ||
    /(?:google\s*drive|গুগল\s*ড্রাইভ|google\s*doc|গুগল\s*ডক|google\s*sheet|গুগল\s*শিট|spreadsheet|স্প্রেডশিট|ড্রাইভের\s*ফাইল)/i.test(
      q
    );

  // 1. Live GitHub Context
  const ghConnected = Boolean(connections.github?.connected || connections.github?.token);
  if (mentionsGithub && ghConnected) {
    const gh = connections.github;
    const owner = conversationServiceContext?.github?.owner || gh.owner;
    const repo = conversationServiceContext?.github?.repo || gh.repo;
    const branch = conversationServiceContext?.github?.branch || gh.branch || 'main';
    const explicitSelectedFiles = conversationServiceContext?.github?.selectedFiles || [];

    try {
      if (owner && repo) {
        const filesRes = await executeIntegrationAction<{ files?: Array<any>; items?: Array<any> }>({
          provider: 'github',
          action: 'search_files',
          token: gh.token,
          payload: { owner, repo, branch, query: '' },
        });
        const commitsRes = await executeIntegrationAction<{ commits?: Array<any> }>({
          provider: 'github',
          action: 'list_commits',
          token: gh.token,
          payload: { owner, repo, branch },
        });
        const rawFiles = filesRes.data?.files || filesRes.files || filesRes.data?.items || [];
        const fileList: string[] = rawFiles.slice(0, 45).map((f: any) => String(f.path || f.name || ''));
        const recentCommits = (commitsRes.data?.commits || commitsRes.commits || [])
          .slice(0, 5)
          .map(
            (c: any) =>
              `- ${String(c.sha || '').slice(0, 7)}: ${c.commit?.message?.split('\n')[0] || c.message || ''} (${c.commit?.author?.name || c.author || ''})`
          );

        // Prioritize files explicitly selected in the Chatbox Toolbar, then files matching the user query
        const matchedFiles = fileList.filter(
          (p) =>
            q.toLowerCase().includes(p.toLowerCase()) ||
            (/login|auth|লগইন/i.test(q) && /auth|login|session|user/i.test(p)) ||
            /^(package\.json|readme\.md|src\/app\.tsx|src\/main\.tsx|index\.html|server\.ts)$/i.test(p)
        );
        const priorityFiles = Array.from(new Set([...explicitSelectedFiles, ...matchedFiles])).slice(0, 4);

        const fileSnippets: string[] = [];
        for (const fp of priorityFiles) {
          if (!fp) continue;
          const fRes = await executeIntegrationAction<{ path?: string; content?: string; file?: { path: string; content: string } }>({
            provider: 'github',
            action: 'read_file',
            token: gh.token,
            payload: { owner, repo, branch, path: fp },
          });
          const content = fRes.data?.content || fRes.content || fRes.file?.content;
          const resolvedPath = fRes.data?.path || fRes.path || fRes.file?.path || fp;
          if (fRes.ok && content) {
            fileSnippets.push(
              `--- FILE: ${resolvedPath} ---\n${String(content).slice(0, 3500)}`
            );
          }
        }

        blocks.push(
          `[LIVE GITHUB INTEGRATION — CONNECTED REPOSITORY: ${owner}/${repo}@${branch} (Account: ${gh.account || 'verified'})]\n` +
            (explicitSelectedFiles.length
              ? `User-Selected Files in Chatbox: ${explicitSelectedFiles.join(', ')}\n`
              : '') +
            `Repository Files (${fileList.length} shown):\n${fileList.join(', ')}\n` +
            `Recent Commits:\n${recentCommits.join('\n') || 'None'}\n` +
            (fileSnippets.length ? `\nLive Source Code Read:\n${fileSnippets.join('\n\n')}\n` : '') +
            `SAFETY RULE: You have read access to analyze this live GitHub repository. Before performing any File Update, Commit, Branch Creation, PR Merge, or File Delete, you MUST present the proposed change and ask for explicit user confirmation.`
        );
      } else {
        const reposRes = await executeIntegrationAction<{ repos?: Array<any> }>({
          provider: 'github',
          action: 'list_repos',
          token: gh.token,
          payload: { perPage: 15 },
        });
        const repos = reposRes.data?.repos || reposRes.repos || [];
        const repoNames = repos.map(
          (r: any) => `- ${r.full_name} (${r.private ? 'private' : 'public'}, default_branch: ${r.default_branch})`
        );
        blocks.push(
          `[LIVE GITHUB INTEGRATION — CONNECTED ACCOUNT: ${gh.account || 'verified'}]\nAccessible Repositories:\n${repoNames.join('\n') || 'No repositories returned'}`
        );
      }
    } catch {
      // Ignore network error during context enrichment
    }
  }

  // 2. Live Vercel Context
  const vcConnected = Boolean(connections.vercel?.connected || connections.vercel?.token);
  if (mentionsVercel && vcConnected && connections.vercel) {
    const vc = connections.vercel;
    const selectedProjectId = conversationServiceContext?.vercel?.projectId || vc.projectId;
    try {
      const [projRes, depRes] = await Promise.all([
        executeIntegrationAction<{ projects?: Array<any> }>({
          provider: 'vercel',
          action: 'list_projects',
          token: vc.token,
          payload: { teamId: vc.teamId },
        }),
        executeIntegrationAction<{ deployments?: Array<any> }>({
          provider: 'vercel',
          action: 'list_deployments',
          token: vc.token,
          payload: { projectId: selectedProjectId || undefined, teamId: vc.teamId },
        }),
      ]);
      const projects = projRes.data?.projects || projRes.projects || [];
      const deployments = depRes.data?.deployments || depRes.deployments || [];
      const projLines = projects.slice(0, 10).map(
        (p: any) => `- ${p.name} (framework: ${p.framework || 'custom'}, id: ${p.id})`
      );
      const depLines = deployments.slice(0, 8).map(
        (d: any) =>
          `- ${d.name} · state: ${d.state || d.readyState} · target: ${d.target || 'preview'} · url: https://${d.url} ${
            d.errorMessage ? `· ERROR: ${d.errorMessage}` : ''
          }`
      );
      blocks.push(
        `[LIVE VERCEL INTEGRATION — CONNECTED ACCOUNT: ${vc.account || 'verified'}${
          selectedProjectId ? ` · Active Project: ${conversationServiceContext?.vercel?.projectName || selectedProjectId}` : ''
        }]\n` +
          `Vercel Projects:\n${projLines.join('\n') || 'No projects found'}\n` +
          `Recent Deployments:\n${depLines.join('\n') || 'No deployments found'}\n` +
          `SAFETY RULE: Production deployments require explicit user confirmation before execution. Never expose raw secret environment variables.`
      );
    } catch {
      // Ignore
    }
  }

  // 3. Live Supabase Context
  const sb = connections.supabase;
  const sbConnected = Boolean(
    sb?.connected || sb?.projectUrl || sb?.anonKey || sb?.serviceRoleKey || sb?.managementToken
  );
  if (mentionsSupabase && sbConnected && sb) {
    try {
      const schemaRes = await executeIntegrationAction<{
        tables?: Array<{
          name: string;
          columns: Array<{ name: string; type: string; isPrimaryKey?: boolean }>;
          relationships?: Array<{ column: string; referencesTable: string; referencesColumn: string }>;
        }>;
      }>({
        provider: 'supabase',
        action: 'inspect_schema',
        token: sb.managementToken,
        payload: {
          projectUrl: sb.projectUrl,
          anonKey: sb.anonKey,
          serviceRoleKey: sb.serviceRoleKey,
          projectRef: conversationServiceContext?.supabase?.projectRef || sb.projectRef,
        },
      });
      const tables = schemaRes.data?.tables || schemaRes.tables || [];
      if (schemaRes.ok && Array.isArray(tables)) {
        const tableSummaries = tables.map((t: any) => {
          const cols = (t.columns || [])
            .map((c: { name: string; type: string; isPrimaryKey?: boolean }) => `${c.name}:${c.type}${c.isPrimaryKey ? '(PK)' : ''}`)
            .join(', ');
          return `- public.${t.name}: [${cols}]`;
        });
        blocks.push(
          `[LIVE SUPABASE DATABASE INTEGRATION — PROJECT: ${sb.account || sb.projectUrl || 'Connected Supabase'}${
            conversationServiceContext?.supabase?.selectedTable
              ? ` · Active Table: public.${conversationServiceContext.supabase.selectedTable}`
              : ''
          }]\n` +
            `Live Database Tables & Columns (${tables.length}):\n${tableSummaries.join('\n')}\n` +
            `SAFETY RULE: Core tables (smfta_profiles, smfta_user_state, smfta_chat_sessions) must remain intact. Any CREATE/ALTER TABLE migration or data write/delete requires explicit user confirmation before execution.`
        );
      }
    } catch {
      // Ignore
    }
  }

  // 4. Live Google Workspace Context
  const gd = connections.drive;
  const gdConnected = Boolean(gd?.connected || gd?.accessToken);
  if (mentionsGoogle && gdConnected && gd) {
    try {
      const filesRes = await executeIntegrationAction<{ files?: Array<any> }>({
        provider: 'google',
        action: 'list_drive_files',
        token: gd.accessToken,
        payload: {},
      });
      const files = filesRes.data?.files || filesRes.files || [];
      if (filesRes.ok && Array.isArray(files)) {
        const fileLines = files.slice(0, 15).map(
          (f: any) => `- ${f.name} (id: ${f.id}, type: ${f.mimeType})`
        );
        blocks.push(
          `[LIVE GOOGLE DRIVE / DOCS / SHEETS INTEGRATION — ACCOUNT: ${gd.account || 'verified'}${
            conversationServiceContext?.google?.selectedFileName
              ? ` · Selected Document: ${conversationServiceContext.google.selectedFileName} (${conversationServiceContext.google.selectedFileId})`
              : ''
          }]\n` +
            `Recent Google Drive Files:\n${fileLines.join('\n') || 'No files found'}`
        );
      }
    } catch {
      // Ignore
    }
  }

  return blocks.join('\n\n');
}


