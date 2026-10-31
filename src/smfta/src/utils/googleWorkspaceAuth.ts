import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import { GOOGLE_WORKSPACE_SCOPES, storeEncryptedProviderSession } from './cloudVault';

function getFirebaseAuth() {
  const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  return getAuth(app);
}

export interface GoogleWorkspaceOAuthPopupResult {
  ok: boolean;
  account?: string;
  expiresAt?: number;
  error?: string;
}

/**
 * Launches the official Google OAuth 2.0 Sign-In & Consent screen via Firebase Auth,
 * requests the least-privilege Google Drive, Docs, and Sheets scopes, and stores
 * the resulting access token encrypted on the backend server without exposing or
 * persisting raw tokens in localStorage.
 */
export async function authorizeGoogleWorkspaceWithPopup(): Promise<GoogleWorkspaceOAuthPopupResult> {
  try {
    const auth = getFirebaseAuth();
    const provider = new GoogleAuthProvider();
    for (const scope of GOOGLE_WORKSPACE_SCOPES) {
      provider.addScope(scope);
    }
    provider.setCustomParameters({
      prompt: 'consent',
      include_granted_scopes: 'true',
    });

    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    const accessToken = credential?.accessToken || '';

    if (!accessToken) {
      return {
        ok: false,
        error: 'Google authorization completed, but no OAuth access token was returned.',
      };
    }

    const account = result.user.email || result.user.displayName || 'Google Account';
    const sessionRes = await storeEncryptedProviderSession({
      provider: 'google',
      accessToken,
      expiresIn: 3600,
      account,
    });

    if (!sessionRes.ok) {
      return {
        ok: false,
        error: 'Failed to store encrypted Google OAuth token on backend server.',
      };
    }

    return {
      ok: true,
      account,
      expiresAt: Date.now() + 3600 * 1000,
    };
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code || '';
    const msg = err instanceof Error ? err.message : 'Google OAuth authorization failed.';
    if (
      code === 'auth/popup-closed-by-user' ||
      code === 'auth/cancelled-popup-request' ||
      /closed|cancel/i.test(msg)
    ) {
      return {
        ok: false,
        error: 'Google authorization was cancelled before completion. Click Connect to retry.',
      };
    }
    return {
      ok: false,
      error: msg,
    };
  }
}
