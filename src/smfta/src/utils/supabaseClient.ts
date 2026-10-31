/**
 * Supabase client bootstrap.
 *
 * The anon/publishable key is designed to be public: every table is locked
 * behind Row Level Security, so a leaked anon key cannot read another user's
 * rows. The service-role key must NEVER be imported by frontend code and is
 * not referenced anywhere in `src/`.
 *
 * When the two VITE_ env vars are absent the app keeps working in its
 * original local-only mode (used by unit tests and offline/APK builds).
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL || '').trim();
export const SUPABASE_ANON_KEY = (
  import.meta.env.VITE_SUPABASE_ANON_KEY || ''
).trim();

/** True only when both public client variables are present. */
export function isSupabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

let client: SupabaseClient | null = null;

/** Returns the shared client or `null` when Supabase is not configured. */
export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // Handles OAuth callbacks and the #access_token recovery hash.
        detectSessionInUrl: true,
        storageKey: 'smfta-auth-token',
        flowType: 'pkce',
      },
    });
  }
  return client;
}
