import React, { useState } from 'react';
import { Eye, EyeOff, KeyRound, Lock, ShieldCheck, User, X } from 'lucide-react';
import {
  SimpleEntryCredentials,
  saveSimpleEntryCredentials,
  verifySimpleEntryLogin,
} from '../utils/simpleEntryAuth';

export interface SimpleEntryModalProps {
  isOpen: boolean;
  storedCredentials: SimpleEntryCredentials | null;
  defaultName?: string;
  isLockedGate?: boolean;
  onSuccess: (creds: SimpleEntryCredentials, rawPassword?: string) => void;
  onClose?: () => void;
}

export const SimpleEntryModal: React.FC<SimpleEntryModalProps> = ({
  isOpen,
  storedCredentials,
  defaultName = '',
  isLockedGate = false,
  onSuccess,
  onClose,
}) => {
  const initialName =
    storedCredentials?.name ||
    (defaultName && defaultName !== 'SAYMON HASAN' ? defaultName : '');
  const [name, setName] = useState(initialName);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const res = verifySimpleEntryLogin(storedCredentials, name, password);
    if (!res.ok || !res.credentials) {
      setError(res.error || 'নাম এবং পাসওয়ার্ড সঠিকভাবে দিন');
      return;
    }
    onSuccess(res.credentials, password.trim());
  };

  const handleResetAndCreateNew = () => {
    const cleanName = name.trim();
    const cleanPass = password.trim();
    if (!cleanName || !cleanPass) {
      setError('নতুনভাবে প্রবেশ করতে নাম এবং পাসওয়ার্ড দুটোই লিখুন');
      return;
    }
    const fresh = saveSimpleEntryCredentials(cleanName, cleanPass);
    setError(null);
    onSuccess(fresh, cleanPass);
  };

  return (
    <div
      data-testid="simple-entry-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4"
    >
      <div
        className="w-full max-w-[400px] rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-2xl text-[var(--ink)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] inline-flex items-center justify-center text-[var(--primary)] shrink-0">
              <KeyRound className="w-4 h-4" />
            </span>
            <div>
              <h2 className="text-[16px] font-semibold tracking-tight text-[var(--ink)]">
                {storedCredentials
                  ? 'স্বাগতম — নাম ও পাসওয়ার্ড দিন'
                  : 'দ্রুত প্রবেশ (No Signup Required)'}
              </h2>
              <p className="text-[12px] text-[var(--ink-dim)] mt-0.5">
                কোনো ইমেইল বা রেজিস্ট্রেশন ছাড়াই শুধু নাম ও পাসওয়ার্ড দিয়ে সব ফিচার ব্যবহার করুন
              </p>
            </div>
          </div>
          {!isLockedGate && onClose && (
            <button
              type="button"
              data-testid="simple-entry-close-btn"
              onClick={onClose}
              className="w-7 h-7 rounded-lg inline-flex items-center justify-center text-[var(--ink-dim)] hover:text-[var(--ink)] hover:bg-[var(--surface-2)] cursor-pointer"
              aria-label="Close entry dialog"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <label
              htmlFor="simple-entry-name"
              className="block text-[12.5px] font-medium text-[var(--ink)] mb-1.5"
            >
              আপনার নাম (Your Name)
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-[var(--ink-dim)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="simple-entry-name"
                type="text"
                data-testid="simple-entry-name-input"
                autoFocus
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="যেমন: Rahat / আপনার নাম"
                maxLength={80}
                className="w-full h-10 pl-9 pr-3 rounded-xl bg-[var(--bg)] border border-[var(--border)] text-[13.5px] text-[var(--ink)] placeholder:text-[var(--ink-dim)] outline-none focus:border-[var(--primary)]"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="simple-entry-password"
              className="block text-[12.5px] font-medium text-[var(--ink)] mb-1.5"
            >
              পাসওয়ার্ড (Password)
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-[var(--ink-dim)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="simple-entry-password"
                type={showPassword ? 'text' : 'password'}
                data-testid="simple-entry-password-input"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="আপনার গোপন পাসওয়ার্ড দিন"
                maxLength={80}
                className="w-full h-10 pl-9 pr-9 rounded-xl bg-[var(--bg)] border border-[var(--border)] text-[13.5px] text-[var(--ink)] placeholder:text-[var(--ink-dim)] outline-none focus:border-[var(--primary)]"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="w-7 h-7 rounded-lg inline-flex items-center justify-center text-[var(--ink-dim)] hover:text-[var(--ink)] absolute right-1.5 top-1/2 -translate-y-1/2 cursor-pointer"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? (
                  <EyeOff className="w-3.5 h-3.5" />
                ) : (
                  <Eye className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          </div>

          {error && (
            <div
              data-testid="simple-entry-error"
              className="rounded-xl border border-rose-500/35 bg-rose-500/10 px-3 py-2 text-xs text-rose-400"
            >
              <div>{error}</div>
              {storedCredentials && name.trim() && password.trim() && (
                <button
                  type="button"
                  data-testid="simple-entry-overwrite-btn"
                  onClick={handleResetAndCreateNew}
                  className="mt-1.5 underline font-semibold text-rose-300 hover:text-white cursor-pointer"
                >
                  এই নতুন পাসওয়ার্ডটি সেট করে প্রবেশ করুন →
                </button>
              )}
            </div>
          )}

          <div className="pt-1 flex items-center gap-2">
            <button
              type="submit"
              data-testid="simple-entry-submit-btn"
              className="flex-1 h-10 rounded-xl bg-[var(--primary)] text-white text-[13.5px] font-semibold inline-flex items-center justify-center gap-2 hover:opacity-95 transition-opacity cursor-pointer"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>প্রবেশ করুন (Enter Workspace)</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
