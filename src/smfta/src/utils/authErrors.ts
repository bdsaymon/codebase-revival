/**
 * Maps Supabase GoTrue error codes/messages to clear, bilingual guidance.
 * Pure function so every branch is unit-testable without a network.
 */
export interface AuthErrorLike {
  name?: string;
  message?: string;
  status?: number;
  code?: string;
}

export function friendlyAuthError(error: unknown): string {
  if (!error) return 'Unknown authentication error.';
  const e = error as AuthErrorLike;
  const raw = `${e.code || ''} ${e.message || ''}`.toLowerCase();

  if (
    raw.includes('invalid_credentials') ||
    raw.includes('invalid login credentials')
  ) {
    return 'ভুল ইমেইল বা পাসওয়ার্ড — আবার চেষ্টা করুন। (Invalid login credentials.)';
  }
  if (raw.includes('email_not_confirmed') || raw.includes('email not confirmed')) {
    return 'ইমেইল এখনো নিশ্চিত হয়নি। ইনবক্সে confirmation link-এ ক্লিক করুন, অথবা নিচে resend করুন।';
  }
  if (raw.includes('user_already_exists') || raw.includes('already registered')) {
    return 'এই ইমেইল দিয়ে আগেই account তৈরি হয়েছে — Sign In করুন।';
  }
  if (
    raw.includes('over_email_send_rate_limit') ||
    raw.includes('rate limit') ||
    raw.includes('too many requests')
  ) {
    return 'খুব বেশি অনুরোধ পাঠানো হয়েছে। কিছুক্ষণ অপেক্ষা করে আবার চেষ্টা করুন। (Email rate limit)';
  }
  if (
    raw.includes('weak_password') ||
    raw.includes('password should be at least')
  ) {
    return 'পাসওয়ার্ড দুর্বল — কমপক্ষে ৬ অক্ষর, সংখ্যা ও চিহ্ন মিশিয়ে নিন।';
  }
  if (
    raw.includes('signup_disabled') ||
    raw.includes('signups not allowed')
  ) {
    return 'নতুন sign up আপাতত বন্ধ আছে। অ্যাডমিনের সাথে যোগাযোগ করুন।';
  }
  if (raw.includes('same_password')) {
    return 'নতুন পাসওয়ার্ড আগেরটার থেকে আলাদা হতে হবে।';
  }
  if (raw.includes('network') || raw.includes('failed to fetch')) {
    return 'নেটওয়ার্ক সংযোগ বিচ্ছিন্ন — ইন্টারনেট যাচাই করে আবার চেষ্টা করুন।';
  }
  if (e.status === 401 || raw.includes('jwt') || raw.includes('token')) {
    return 'Session মেয়াদ শেষ — আবার লগইন করুন।';
  }
  // Fall back to the provider's own message when it is readable.
  const message = (e.message || 'Authentication failed.').trim();
  return message.length > 220 ? `${message.slice(0, 217)}…` : message;
}
