/**
 * Cloud client bootstrap — backed by the project's Lovable Cloud backend.
 * Every table is locked behind Row Level Security, so the publishable key
 * cannot read another user's rows.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

export const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL || '').trim();
export const SUPABASE_ANON_KEY = (
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || ''
).trim();

/** True when the cloud backend is available. */
export function isSupabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

/** Returns the shared client or `null` when the backend is not configured. */
export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  return supabase as unknown as SupabaseClient;
}
