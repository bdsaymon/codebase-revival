/**
 * Application-wide Supabase Auth context.
 *
 * - Session persistence and auto-refresh are handled by supabase-js itself
 *   (localStorage token storage), so reloads keep the user signed in.
 * - When Supabase is not configured (unit tests, offline/APK builds) the
 *   provider runs in `local` mode and renders children immediately.
 * - `recoveryMode` flips on while the user lands from a password-reset link
 *   so the UI can show the "choose a new password" form.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { getSupabase, isSupabaseConfigured } from '../utils/supabaseClient';

export interface SignUpResult {
  /** True when the user must click an email link before they can sign in. */
  needsConfirmation: boolean;
  email: string;
}

interface AuthContextValue {
  /** False when no Supabase env is present — app runs in local-only mode. */
  configured: boolean;
  session: Session | null;
  user: User | null;
  /** True until the first session restore attempt has completed. */
  loading: boolean;
  /** True while a PASSWORD_RECOVERY hash is being processed. */
  recoveryMode: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (
    email: string,
    password: string,
    displayName: string
  ) => Promise<SignUpResult>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  updatePassword: (newPassword: string) => Promise<void>;
  resendConfirmation: (email: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  exitRecoveryMode: () => void;
}

/**
 * Local-mode default used when no provider is mounted (SSR smoke tests,
 * standalone embeds). Every method is an inert no-op and `configured` is
 * false, so consumers behave exactly like the pre-auth build.
 */
const localModeAuth: AuthContextValue = {
  configured: false,
  session: null,
  user: null,
  loading: false,
  recoveryMode: false,
  signIn: async () => undefined,
  signUp: async () => ({ needsConfirmation: false, email: '' }),
  signOut: async () => undefined,
  resetPassword: async () => undefined,
  updatePassword: async () => undefined,
  resendConfirmation: async () => undefined,
  signInWithGoogle: async () => undefined,
  exitRecoveryMode: () => undefined,
};

const AuthContext = createContext<AuthContextValue>(localModeAuth);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const configured = useMemo(() => isSupabaseConfigured(), []);
  const client = useMemo(() => (configured ? getSupabase() : null), [configured]);

  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(configured);
  const [recoveryMode, setRecoveryMode] = useState(false);
  const recoveryHandled = useRef(false);

  useEffect(() => {
    if (!client) return;
    let active = true;

    const init = async () => {
      const { data } = await client.auth.getSession();
      if (!active) return;
      setSession(data.session);
      setUser(data.session?.user ?? null);
      setLoading(false);
    };
    init();

    const { data: sub } = client.auth.onAuthStateChange((event, next) => {
      if (!active) return;
      setSession(next);
      setUser(next?.user ?? null);
      if (event === 'PASSWORD_RECOVERY' && !recoveryHandled.current) {
        recoveryHandled.current = true;
        setRecoveryMode(true);
      }
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        setLoading(false);
      }
      if (event === 'SIGNED_OUT') {
        setRecoveryMode(false);
        recoveryHandled.current = false;
      }
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [client]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      if (!client) throw new Error('Authentication is not configured.');
      const { error } = await client.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;
    },
    [client]
  );

  const signUp = useCallback(
    async (email: string, password: string, displayName: string) => {
      if (!client) throw new Error('Authentication is not configured.');
      const origin =
        typeof window !== 'undefined' ? window.location.origin : '/';
      const { data, error } = await client.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: { display_name: displayName.trim() || email.split('@')[0] },
          emailRedirectTo: `${origin}/`,
        },
      });
      if (error) throw error;
      const needsConfirmation = !data.session && Boolean(data.user);
      return {
        needsConfirmation,
        email: data.user?.email || email,
      };
    },
    [client]
  );

  const signOut = useCallback(async () => {
    if (!client) return;
    const { error } = await client.auth.signOut();
    if (error) throw error;
  }, [client]);

  const resetPassword = useCallback(
    async (email: string) => {
      if (!client) throw new Error('Authentication is not configured.');
      const origin =
        typeof window !== 'undefined' ? window.location.origin : '/';
      const { error } = await client.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${origin}/`,
      });
      if (error) throw error;
    },
    [client]
  );

  const updatePassword = useCallback(
    async (newPassword: string) => {
      if (!client) throw new Error('Authentication is not configured.');
      const { error } = await client.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setRecoveryMode(false);
    },
    [client]
  );

  const resendConfirmation = useCallback(
    async (email: string) => {
      if (!client) throw new Error('Authentication is not configured.');
      const origin =
        typeof window !== 'undefined' ? window.location.origin : '/';
      const { error } = await client.auth.resend({
        type: 'signup',
        email: email.trim(),
        options: { emailRedirectTo: `${origin}/` },
      });
      if (error) throw error;
    },
    [client]
  );

  const signInWithGoogle = useCallback(async () => {
    if (!client) throw new Error('Authentication is not configured.');
    const origin =
      typeof window !== 'undefined' ? window.location.origin : '/';
    const { error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${origin}/` },
    });
    if (error) throw error;
  }, [client]);

  const exitRecoveryMode = useCallback(() => setRecoveryMode(false), []);

  const value: AuthContextValue = {
    configured,
    session,
    user,
    loading,
    recoveryMode,
    signIn,
    signUp,
    signOut,
    resetPassword,
    updatePassword,
    resendConfirmation,
    signInWithGoogle,
    exitRecoveryMode,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
