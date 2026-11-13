/**
 * Cloud workspace sync for SMFTA AI Pro.
 *
 * Data model (all tables are RLS-protected, owner-only):
 * - smfta_user_state     → one private JSON document per account
 * - smfta_chat_sessions  → one row per conversation; the whole message thread
 *                          lives inside `data`, so deleting a conversation
 *                          deletes every message atomically.
 *
 * API secrets never leave the device: settings.externalKeys and every
 * SavedProviderProfile.externalKeys are stripped before upload and the
 * browser AES-GCM keystore remains the only at-rest home for keys.
 *
 * The merge/strip helpers are pure functions (unit-tested); the Supabase
 * calls take the client as a parameter so they stay easy to mock.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  AppSettings,
  ChatSession,
  NotebookNote,
  SavedProviderProfile,
  SelfUpdateWidget,
  UserProfile,
} from '../types';
import { sanitizeSettings } from './settings';
import { normalizeProviderProfile } from './providers';
import type { AutonomyLevel, SelfSkill } from './selfEngine';

export const SESSION_TABLE = 'smfta_chat_sessions';
export const STATE_TABLE = 'smfta_user_state';
export const PROFILE_TABLE = 'smfta_profiles';

/** A single conversation row as stored in Supabase. */
export interface CloudSessionRow {
  session_id: number;
  title: string;
  title_source: string | null;
  pinned: boolean;
  draft: string | null;
  data: ChatSession;
  updated_at?: string;
}

/** The per-user state document. */
export interface CloudStatePayload {
  settings: Record<string, unknown>;
  memory: string[];
  saved_profiles: SavedProviderProfile[];
  notes: NotebookNote[];
  widgets: SelfUpdateWidget[];
  skills: SelfSkill[];
  autonomy: AutonomyLevel | null;
  custom_prompts?: Array<Record<string, unknown>>;
  active_project?: Record<string, unknown> | null;
  workspace?: Record<string, unknown> | null;
  connections?: Record<string, unknown> | null;
}

export interface CloudStateRow extends CloudStatePayload {
  updated_at?: string;
}

export type SyncStatus = 'saved' | 'too_large' | 'error';
export const PENDING_SYNC_QUEUE_KEY = 'smfta_pending_sync_queue';
export const DELETED_CHATS_KEY = 'smfta_deleted_chat_ids';

export function loadDeletedChatIds(): number[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(DELETED_CHATS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is number => typeof id === 'number' && Number.isFinite(id));
  } catch {
    return [];
  }
}

export function saveDeletedChatIds(ids: number[]): number[] {
  const unique = Array.from(
    new Set((ids || []).filter((id) => typeof id === 'number' && Number.isFinite(id)))
  ).slice(-500);
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(DELETED_CHATS_KEY, JSON.stringify(unique));
    } catch {
      // ignore storage quota errors
    }
  }
  return unique;
}

export function markChatDeleted(sessionId: number): number[] {
  const current = loadDeletedChatIds();
  return saveDeletedChatIds([...current, sessionId]);
}

export function clearDeletedChatTombstone(sessionId: number): number[] {
  const current = loadDeletedChatIds();
  return saveDeletedChatIds(current.filter((id) => id !== sessionId));
}

/** A session is worth persisting once it has messages or a user title. */
export function isPersistableSession(session: ChatSession): boolean {
  return (
    Array.isArray(session.msgs) &&
    (session.msgs.length > 0 || session.titleSource === 'user')
  );
}

/** Cheap change signature used to skip identical session upserts. */
export function sessionVersion(session: ChatSession): string {
  const last = session.msgs[session.msgs.length - 1];
  const ctxKey = session.serviceContext?.updatedAt
    ? `:${session.serviceContext.updatedAt}`
    : '';
  const sumKey = session.conversationSummary
    ? `:${session.conversationSummary.length}`
    : '';
  return [
    session.title,
    session.titleSource || '',
    session.pinned ? '1' : '0',
    session.draft || '',
    session.msgs.length,
    `${last ? `${last.id}:${last.ts}:${(last.text || '').length}` : 'empty'}${ctxKey}${sumKey}`,
  ].join('|');
}

function lastActivityTs(session: ChatSession): number {
  for (let i = session.msgs.length - 1; i >= 0; i -= 1) {
    if (session.msgs[i]?.ts) return session.msgs[i].ts;
  }
  return session.id;
}

/** Remove the live API key from settings before they touch the network. */
export function stripSettingsSecrets(settings: AppSettings): AppSettings {
  return { ...settings, externalKeys: '' };
}

/** Remove per-profile API keys; keep all non-secret configuration. */
export function stripProfileSecrets(
  profiles: SavedProviderProfile[]
): SavedProviderProfile[] {
  return (profiles || []).map((p) => ({ ...p, externalKeys: '' }));
}

/**
 * Re-attach device-local encrypted/plain keys to cloud profiles by id.
 * Cloud metadata (models, verification, base URL) always wins; only the
 * secret field is restored from local storage.
 */
export function mergeProviderProfiles(
  cloudProfiles: SavedProviderProfile[],
  localProfiles: SavedProviderProfile[]
): SavedProviderProfile[] {
  const localById = new Map(localProfiles.map((p) => [p.id, p]));
  const seen = new Set<string>();
  const merged: SavedProviderProfile[] = [];
  for (const cloud of cloudProfiles) {
    seen.add(cloud.id);
    const local = localById.get(cloud.id);
    // Normalise legacy built-in profiles so fabricated vendor model ids can
    // never re-enter through a cloud snapshot.
    merged.push(
      normalizeProviderProfile({
        ...cloud,
        externalKeys: local?.externalKeys || '',
      })
    );
  }
  for (const local of localProfiles) {
    if (!seen.has(local.id)) merged.push(normalizeProviderProfile(local));
  }
  return merged;
}

/**
 * Merge cloud conversations with the local workspace.
 * - ids only in the cloud → added
 * - ids only on the device → kept (they will be uploaded afterwards)
 * - shared ids → the copy with the most recent activity wins
 * The always-present empty "New Chat" scratch session is dropped.
 */
export function mergeSessions(
  local: ChatSession[],
  cloudRows: CloudSessionRow[],
  deletedIds: number[] = []
): ChatSession[] {
  const deletedSet = new Set(deletedIds);
  const byId = new Map<number, ChatSession>();
  for (const session of local) {
    if (deletedSet.has(session.id)) continue;
    if (!isPersistableSession(session)) continue;
    byId.set(session.id, session);
  }
  for (const row of cloudRows) {
    if (deletedSet.has(row.session_id)) continue;
    const cloudSession: ChatSession = { ...row.data, id: row.session_id };
    const existing = byId.get(cloudSession.id);
    if (!existing) {
      byId.set(cloudSession.id, cloudSession);
      continue;
    }
    const cloudTs = row.updated_at
      ? Date.parse(row.updated_at) || 0
      : lastActivityTs(cloudSession);
    if (cloudTs >= lastActivityTs(existing)) {
      byId.set(cloudSession.id, cloudSession);
    }
  }
  return [...byId.values()].sort((a, b) => {
    if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
    return lastActivityTs(b) - lastActivityTs(a);
  });
}

/** True when the account has no cloud data at all (first login migration). */
export function isCloudEmpty(
  state: CloudStateRow | null,
  sessions: CloudSessionRow[]
): boolean {
  if (sessions.length > 0) return false;
  if (!state) return true;
  const settings = state.settings || {};
  return Object.keys(settings).length === 0;
}

/** Sanitize a cloud settings document back into a valid AppSettings. */
export function parseCloudSettings(raw: unknown): AppSettings {
  return sanitizeSettings(raw || {});
}

// ── Supabase data access ───────────────────────────────────────────────────

async function fetchRow<T>(
  client: SupabaseClient,
  table: string,
  userId: string
): Promise<T | null> {
  const { data, error } = await client
    .from(table)
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return (data as T) ?? null;
}

export async function fetchCloudState(
  client: SupabaseClient,
  userId: string
): Promise<CloudStateRow | null> {
  const row = await fetchRow<Record<string, unknown>>(
    client,
    STATE_TABLE,
    userId
  );
  if (!row) return null;
  return {
    settings: (row.settings as Record<string, unknown>) || {},
    memory: Array.isArray(row.memory) ? (row.memory as string[]) : [],
    saved_profiles: Array.isArray(row.saved_profiles)
      ? (row.saved_profiles as SavedProviderProfile[])
      : [],
    notes: Array.isArray(row.notes) ? (row.notes as NotebookNote[]) : [],
    widgets: Array.isArray(row.widgets)
      ? (row.widgets as SelfUpdateWidget[])
      : [],
    skills: Array.isArray(row.skills) ? (row.skills as SelfSkill[]) : [],
    autonomy: (row.autonomy as AutonomyLevel | null) ?? null,
    custom_prompts: Array.isArray(row.custom_prompts)
      ? (row.custom_prompts as Array<Record<string, unknown>>)
      : undefined,
    active_project: (row.active_project as Record<string, unknown>) || undefined,
    workspace: (row.workspace as Record<string, unknown>) || undefined,
    connections: (row.connections as Record<string, unknown>) || undefined,
    updated_at: row.updated_at as string | undefined,
  };
}

export function enqueueOfflineSync(item: {
  type: 'state' | 'session' | 'delete_session' | 'clear_sessions';
  userId: string;
  payload: unknown;
  sessionId?: number;
}): void {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem(PENDING_SYNC_QUEUE_KEY);
    const list: unknown[] = raw ? JSON.parse(raw) : [];
    list.push({ ...item, timestamp: Date.now() });
    localStorage.setItem(
      PENDING_SYNC_QUEUE_KEY,
      JSON.stringify(list.slice(-50))
    );
  } catch {
    // quota exceeded or disabled
  }
}

import { getSupabase } from './supabaseClient';

export async function flushOfflineSyncQueue(
  client?: SupabaseClient | null
): Promise<number> {
  if (typeof window === 'undefined') return 0;
  const sb = client || getSupabase();
  if (!sb) return 0;
  try {
    const raw = localStorage.getItem(PENDING_SYNC_QUEUE_KEY);
    if (!raw) return 0;
    const list: Array<{
      type: 'state' | 'session' | 'delete_session' | 'clear_sessions';
      userId: string;
      payload: unknown;
      sessionId?: number;
    }> = JSON.parse(raw);
    if (!Array.isArray(list) || list.length === 0) return 0;

    let flushed = 0;
    for (const item of list) {
      try {
        if (item.type === 'state') {
          await saveCloudState(sb, item.userId, item.payload as CloudStatePayload);
          flushed += 1;
        } else if (item.type === 'session') {
          await upsertCloudSession(sb, item.userId, item.payload as ChatSession);
          flushed += 1;
        } else if (item.type === 'delete_session' && typeof item.sessionId === 'number') {
          await deleteCloudSession(sb, item.userId, item.sessionId);
          flushed += 1;
        } else if (item.type === 'clear_sessions') {
          await clearCloudChatSessions(sb, item.userId);
          flushed += 1;
        }
      } catch {
        // Stop on first failure to preserve order
        break;
      }
    }

    const remaining = list.slice(flushed);
    if (remaining.length > 0) {
      localStorage.setItem(PENDING_SYNC_QUEUE_KEY, JSON.stringify(remaining));
    } else {
      localStorage.removeItem(PENDING_SYNC_QUEUE_KEY);
    }
    return flushed;
  } catch {
    return 0;
  }
}

export function stripWorkspaceSecrets(
  workspace?: Record<string, unknown> | null
): Record<string, unknown> | undefined {
  if (!workspace || typeof workspace !== 'object') return undefined;
  const copy: Record<string, unknown> = { ...workspace };
  if (Array.isArray(copy.mcpServers)) {
    copy.mcpServers = (copy.mcpServers as Array<Record<string, unknown>>).map((s) => ({
      ...s,
      authSecret: '',
    }));
  }
  if (Array.isArray(copy.dbConnections)) {
    copy.dbConnections = (copy.dbConnections as Array<Record<string, unknown>>).map((d) => ({
      ...d,
      secret: '',
    }));
  }
  return copy;
}

export async function saveCloudState(
  client: SupabaseClient,
  userId: string,
  payload: CloudStatePayload
): Promise<SyncStatus> {
  const safePayload: CloudStatePayload = {
    ...payload,
    settings: stripSettingsSecrets(
      (payload.settings || {}) as unknown as AppSettings
    ) as unknown as Record<string, unknown>,
    saved_profiles: Array.isArray(payload.saved_profiles)
      ? stripProfileSecrets(payload.saved_profiles)
      : [],
    workspace: stripWorkspaceSecrets(payload.workspace) ?? payload.workspace,
    // Never send raw auth tokens from connections to cloud database
    connections: payload.connections
      ? {
          driveConnected: Boolean((payload.connections as Record<string, { connected?: boolean }>).drive?.connected),
          githubConnected: Boolean((payload.connections as Record<string, { connected?: boolean }>).github?.connected),
          supabaseConnected: Boolean((payload.connections as Record<string, { connected?: boolean }>).supabase?.connected),
          vercelConnected: Boolean((payload.connections as Record<string, { connected?: boolean }>).vercel?.connected),
        }
      : undefined,
  };
  const body = JSON.stringify(safePayload);
  // Stay well under typical gateway/PostgREST payload limits.
  if (body.length > 1_800_000) return 'too_large';
  try {
    const { error } = await client
      .from(STATE_TABLE)
      .upsert({ user_id: userId, ...safePayload }, { onConflict: 'user_id' });
    if (error) throw error;
    return 'saved';
  } catch (err) {
    enqueueOfflineSync({ type: 'state', userId, payload });
    throw err;
  }
}

export async function fetchCloudSessions(
  client: SupabaseClient,
  userId: string
): Promise<CloudSessionRow[]> {
  const { data, error } = await client
    .from(SESSION_TABLE)
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data as CloudSessionRow[]) || [];
}

export async function upsertCloudSession(
  client: SupabaseClient,
  userId: string,
  session: ChatSession
): Promise<SyncStatus> {
  if (!isPersistableSession(session)) return 'saved';
  const body = JSON.stringify(session);
  if (body.length > 1_800_000) return 'too_large';
  try {
    const { error } = await client.from(SESSION_TABLE).upsert(
      {
        user_id: userId,
        session_id: session.id,
        title: session.title.slice(0, 200) || 'New Chat',
        title_source: session.titleSource || null,
        pinned: Boolean(session.pinned),
        draft: session.draft || null,
        data: session,
      },
      { onConflict: 'user_id,session_id' }
    );
    if (error) throw error;
    return 'saved';
  } catch (err) {
    enqueueOfflineSync({ type: 'session', userId, payload: session, sessionId: session.id });
    throw err;
  }
}

export async function deleteCloudSession(
  client: SupabaseClient,
  userId: string,
  sessionId: number
): Promise<void> {
  try {
    const { error } = await client
      .from(SESSION_TABLE)
      .delete()
      .eq('user_id', userId)
      .eq('session_id', sessionId);
    if (error) throw error;
  } catch (err) {
    enqueueOfflineSync({ type: 'delete_session', userId, payload: null, sessionId });
    throw err;
  }
}

export async function clearCloudChatSessions(
  client: SupabaseClient,
  userId: string
): Promise<void> {
  try {
    const { error } = await client
      .from(SESSION_TABLE)
      .delete()
      .eq('user_id', userId);
    if (error) throw error;
  } catch (err) {
    enqueueOfflineSync({ type: 'clear_sessions', userId, payload: null });
    throw err;
  }
}

export async function saveCloudProfile(
  client: SupabaseClient,
  userId: string,
  profile: UserProfile,
  email: string | undefined,
  avatarDataUrl?: string
): Promise<void> {
  const { error } = await client
    .from(PROFILE_TABLE)
    .upsert(
      {
        id: userId,
        email: email || null,
        display_name: profile.name,
        avatar_data_url: avatarDataUrl || null,
      },
      { onConflict: 'id' }
    );
  if (error) throw error;
}

/** Wipe every cloud row owned by this account (used by "Clear all data"). */
export async function wipeCloudWorkspace(
  client: SupabaseClient,
  userId: string
): Promise<void> {
  const delSessions = client
    .from(SESSION_TABLE)
    .delete()
    .eq('user_id', userId);
  const resetState = client
    .from(STATE_TABLE)
    .upsert(
      {
        user_id: userId,
        settings: {},
        memory: [],
        saved_profiles: [],
        notes: [],
        widgets: [],
        skills: [],
        autonomy: null,
        workspace: {},
      },
      { onConflict: 'user_id' }
    );
  const [s, r] = await Promise.all([delSessions, resetState]);
  if (s.error) throw s.error;
  if (r.error) throw r.error;
}

