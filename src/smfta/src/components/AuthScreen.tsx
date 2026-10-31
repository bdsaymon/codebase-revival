/**
 * AuthScreen — Claude-style, distraction-free account gate.
 *
 * Handles Sign In, Create Account, Forgot Password, the PASSWORD_RECOVERY
 * "choose a new password" flow, email-confirmation resend and Google OAuth.
 * Every failure is translated by friendlyAuthError() into clear guidance.
 */
import React, { useState } from 'react';
import {
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
  Sparkles,
  User as UserIcon,
  ArrowLeft,
  CheckCircle2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { friendlyAuthError } from '../utils/authErrors';
import { APP_VERSION } from '../version';

type Mode = 'signin' | 'signup' | 'forgot' | 'done';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const AuthScreen: React.FC = () => {
  const auth = useAuth();
  const [mode, setMode] = useState<Mode>('signin');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingEmail, setPendingEmail] = useState('');

  const resetMessages = () => {
    setError(null);
    setNotice(null);
  };

  const validate = (): string | null => {
    if (!EMAIL_RE.test(email.trim())) return 'সঠিক ইমেইল ঠিকানা লিখুন। (Enter a valid email address.)';
    if (mode !== 'forgot' && password.length < 6) {
      return 'পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে।';
    }
    if (mode === 'signup' && !displayName.trim()) {
      return 'আপনার নাম লিখুন।';
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    resetMessages();
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    try {
      if (mode === 'signin') {
        await auth.signIn(email, password);
        // onAuthStateChange swaps the view automatically on success.
      } else if (mode === 'signup') {
        const result = await auth.signUp(email, password, displayName);
        if (result.needsConfirmation) {
          setPendingEmail(result.email);
          setMode('done');
          setNotice(
            'Account তৈরি হয়েছে। ইনবক্সে confirmation link-এ ক্লিক করে Sign In করুন।'
          );
        }
        // Auto-confirmed projects sign the user in immediately.
      } else if (mode === 'forgot') {
        await auth.resetPassword(email);
        setPendingEmail(email.trim());
        setMode('done');
        setNotice(
          'পাসওয়ার্ড reset link ইমেইলে পাঠানো হয়েছে। লিংকে ক্লিক করে নতুন পাসওয়ার্ড সেট করুন।'
        );
      }
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleResend = async () => {
    if (!pendingEmail) return;
    setBusy(true);
    resetMessages();
    try {
      await auth.resendConfirmation(pendingEmail);
      setNotice('Confirmation email আবার পাঠানো হয়েছে। ইনবক্স (ও Spam) দেখুন।');
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleGoogle = async () => {
    resetMessages();
    setBusy(true);
    try {
      await auth.signInWithGoogle();
      // Browser redirects to Google; no state cleanup needed.
    } catch (err) {
      setError(friendlyAuthError(err));
      setBusy(false);
    }
  };

  // ── Password recovery (landed from the reset email link) ─────────────────
  if (auth.recoveryMode) {
    return <RecoveryCard busy={busy} setBusy={setBusy} setError={setError} />;
  }

  const heading =
    mode === 'signin'
      ? 'Welcome back'
      : mode === 'signup'
      ? 'Create your account'
      : mode === 'forgot'
      ? 'Reset your password'
      : 'Check your email';

  return (
    <div className="auth-screen" data-testid="auth-screen">
      <form className="auth-card" onSubmit={handleSubmit} noValidate>
        <div className="auth-brand">
          <span className="auth-brand-icon">
            <Sparkles className="w-5 h-5" />
          </span>
          <div>
            <strong>SMFTA AI Pro</strong>
            <span>Your private AI workspace</span>
          </div>
        </div>

        <h1 className="auth-title">{heading}</h1>
        <p className="auth-subtitle">
          {mode === 'signin'
            ? 'Sign in to continue to your chats and settings.'
            : mode === 'signup'
            ? 'One account keeps your chats and settings in sync across devices.'
            : mode === 'forgot'
            ? 'Enter your email and we will send you a reset link.'
            : `We sent a link to ${pendingEmail || 'your email'}.`}
        </p>

        {error && (
          <div className="auth-alert error" role="alert">
            {error}
          </div>
        )}
        {notice && (
          <div className="auth-alert success" role="status">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{notice}</span>
          </div>
        )}

        {mode !== 'done' && (
          <>
            {mode === 'signup' && (
              <label className="auth-field">
                <span>Name</span>
                <div className="auth-input-wrap">
                  <UserIcon className="w-4 h-4" />
                  <input
                    type="text"
                    autoComplete="name"
                    placeholder="Your name"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    maxLength={80}
                  />
                </div>
              </label>
            )}

            <label className="auth-field">
              <span>Email</span>
              <div className="auth-input-wrap">
                <Mail className="w-4 h-4" />
                <input
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  maxLength={160}
                  autoFocus={mode !== 'signup'}
                />
              </div>
            </label>

            {mode !== 'forgot' && (
              <label className="auth-field">
                <span>Password</span>
                <div className="auth-input-wrap">
                  <Lock className="w-4 h-4" />
                  <input
                    type={showPw ? 'text' : 'password'}
                    autoComplete={
                      mode === 'signup' ? 'new-password' : 'current-password'
                    }
                    placeholder="At least 6 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    maxLength={200}
                  />
                  <button
                    type="button"
                    className="auth-eye"
                    onClick={() => setShowPw((v) => !v)}
                    aria-label={showPw ? 'Hide password' : 'Show password'}
                  >
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </label>
            )}

            <button type="submit" className="auth-submit" disabled={busy}>
              {busy ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : mode === 'signin' ? (
                'Sign in'
              ) : mode === 'signup' ? (
                'Create account'
              ) : (
                'Send reset link'
              )}
            </button>

            {mode === 'signin' && (
              <button
                type="button"
                className="auth-link"
                onClick={() => {
                  resetMessages();
                  setMode('forgot');
                }}
              >
                Forgot password?
              </button>
            )}

            {(mode === 'forgot' || mode === 'signin') && (
              <button
                type="button"
                className="auth-back"
                onClick={() => {
                  resetMessages();
                  setMode('signin');
                }}
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Back to sign in
              </button>
            )}
          </>
        )}

        {mode === 'done' && (
          <div className="auth-done-actions">
            <button
              type="button"
              className="auth-secondary"
              onClick={handleResend}
              disabled={busy}
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Resend email'}
            </button>
            <button
              type="button"
              className="auth-secondary"
              onClick={() => {
                resetMessages();
                setMode('signin');
              }}
            >
              Back to sign in
            </button>
          </div>
        )}

        {mode !== 'done' && (
          <>
            <div className="auth-divider"><span>or</span></div>
            <button
              type="button"
              className="auth-google"
              onClick={handleGoogle}
              disabled={busy}
            >
              <GoogleGlyph />
              Continue with Google
            </button>
          </>
        )}

        <p className="auth-switch">
          {mode === 'signin' ? (
            <>
              New to SMFTA AI Pro?{' '}
              <button
                type="button"
                onClick={() => {
                  resetMessages();
                  setMode('signup');
                }}
              >
                Create an account
              </button>
            </>
          ) : (
            mode === 'signup' && (
              <>
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => {
                    resetMessages();
                  setMode('signin');
                  }}
                >
                  Sign in
                </button>
              </>
            )
          )}
        </p>

        <span className="auth-version">v{APP_VERSION} · Secured by Supabase</span>
      </form>
    </div>
  );
};

/** Card shown while processing the #access_token recovery hash. */
const RecoveryCard: React.FC<{
  busy: boolean;
  setBusy: (v: boolean) => void;
  setError: (v: string | null) => void;
}> = ({ busy, setBusy, setError }) => {
  const auth = useAuth();
  const [pw1, setPw1] = useState('');
  const [pw2, setPw2] = useState('');
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (pw1.length < 6) {
      setError('নতুন পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে।');
      return;
    }
    if (pw1 !== pw2) {
      setError('দুইটি পাসওয়ার্ড মিলছে না।');
      return;
    }
    setBusy(true);
    try {
      await auth.updatePassword(pw1);
      setDone(true);
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-screen">
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-brand">
          <span className="auth-brand-icon">
            <Lock className="w-5 h-5" />
          </span>
          <div>
            <strong>SMFTA AI Pro</strong>
            <span>Password recovery</span>
          </div>
        </div>
        <h1 className="auth-title">{done ? 'Password updated' : 'Set a new password'}</h1>
        <p className="auth-subtitle">
          {done
            ? 'Your password has been changed. You can now continue with the new password.'
            : 'Choose a strong password you do not use anywhere else.'}
        </p>
        {!done && (
          <>
            <label className="auth-field">
              <span>New password</span>
              <div className="auth-input-wrap">
                <Lock className="w-4 h-4" />
                <input
                  type="password"
                  autoComplete="new-password"
                  value={pw1}
                  onChange={(e) => setPw1(e.target.value)}
                  placeholder="At least 6 characters"
                />
              </div>
            </label>
            <label className="auth-field">
              <span>Confirm new password</span>
              <div className="auth-input-wrap">
                <Lock className="w-4 h-4" />
                <input
                  type="password"
                  autoComplete="new-password"
                  value={pw2}
                  onChange={(e) => setPw2(e.target.value)}
                  placeholder="Repeat password"
                />
              </div>
            </label>
            <button type="submit" className="auth-submit" disabled={busy}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Update password'}
            </button>
            <button
              type="button"
              className="auth-back"
              onClick={() => auth.exitRecoveryMode()}
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back to sign in
            </button>
          </>
        )}
      </form>
    </div>
  );
};

const GoogleGlyph: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
    <path
      fill="#FFC107"
      d="M43.6 20.5H42V20H24v8h11.3C33.7 32.4 29.3 35.5 24 35.5c-6.4 0-11.5-5.1-11.5-11.5S17.6 12.5 24 12.5c2.9 0 5.6 1.1 7.6 2.9l5.7-5.7C33.8 6.5 29.1 4.5 24 4.5 13.2 4.5 4.5 13.2 4.5 24S13.2 43.5 24 43.5 43.5 34.8 43.5 24c0-1.2-.1-2.3-.4-3.5z"
    />
    <path
      fill="#FF3D00"
      d="M6.3 14.1l6.6 4.8C14.7 15.1 19 12.5 24 12.5c2.9 0 5.6 1.1 7.6 2.9l5.7-5.7C33.8 6.5 29.1 4.5 24 4.5 16.3 4.5 9.7 8.9 6.3 14.1z"
    />
    <path
      fill="#4CAF50"
      d="M24 43.5c5 0 9.6-1.9 13-5.1l-6-5.1c-2 1.5-4.5 2.4-7 2.4-5.3 0-9.7-3.1-11.3-7.6l-6.5 5C9.5 39.1 16.2 43.5 24 43.5z"
    />
    <path
      fill="#1976D2"
      d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.4l6 5.1c-.4.4 6.3-4.6 6.3-14.5 0-1.2-.1-2.3-.4-3.5z"
    />
  </svg>
);

export default AuthScreen;
