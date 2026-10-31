/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Supabase project URL, e.g. https://xyz.supabase.co */
  readonly VITE_SUPABASE_URL?: string;
  /** Public anon/publishable key — safe to ship in the browser, RLS protects data. */
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
