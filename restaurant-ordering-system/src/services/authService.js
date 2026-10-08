import { supabase } from '../config/supabase';

/** "45 seconds" / "15 minutes" — keeps a 15 minute lockout readable. */
function formatWait(seconds) {
  const total = Math.max(1, Math.ceil(Number(seconds) || 0));
  if (total < 60) return `${total} ${total === 1 ? 'second' : 'seconds'}`;
  const minutes = Math.ceil(total / 60);
  return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
}

/**
 * Single place that turns a Supabase auth error into copy we are willing to
 * show a customer. Returns an Error so callers can `throw mapAuthError(...)`
 * and UI can branch on the stable `code` (e.g. to offer "resend confirmation").
 *
 * Also handles the `auth-signin` edge function's 429, which arrives as a
 * `retry_after` in seconds rather than inside the message text. Rate-limit
 * errors carry `retryAfter` so screens can run a countdown.
 *
 * @param {unknown} error raw Supabase error
 * @param {'signin'|'signup'|'reset'|'update'|'resend'} [context]
 * @returns {Error & { code: string }}
 */
export function mapAuthError(error, context = 'signin') {
  const raw = String(error?.message || '');
  const supabaseCode = String(error?.code || '');
  const status = Number(error?.status || 0);
  const retryAfter = Math.max(0, Math.ceil(Number(error?.retry_after ?? error?.retryAfter ?? 0)));
  const emailContext = context === 'signup' || context === 'reset' || context === 'resend';

  const build = (code, message) => {
    const mapped = new Error(message);
    mapped.code = code;
    mapped.cause = error;
    return mapped;
  };

  if (supabaseCode === 'invalid_credentials' || /invalid login credentials/i.test(raw)) {
    return build('invalid_credentials', 'Incorrect email or password.');
  }

  if (supabaseCode === 'email_not_confirmed' || /email not confirmed/i.test(raw)) {
    return build('email_not_confirmed', 'Confirm your email, then sign in.');
  }

  if (
    status === 429 ||
    supabaseCode === 'rate_limited' ||
    retryAfter > 0 ||
    /rate limit/i.test(raw) ||
    /you can only request this after/i.test(raw) ||
    /^over_/.test(supabaseCode)
  ) {
    const seconds = retryAfter > 0 ? retryAfter : Number(raw.match(/after (\d+) seconds?/i)?.[1] || 0);
    if (seconds > 0) {
      const wait = formatWait(seconds);
      const mapped = build(
        'rate_limited',
        emailContext
          ? `Please wait ${wait} before requesting another email.`
          : `Too many attempts. Try again in ${wait}.`,
      );
      mapped.retryAfter = seconds;
      return mapped;
    }
    const mapped = build(
      'rate_limited',
      emailContext
        ? 'Too many emails were requested. Wait a few minutes, then try again.'
        : 'Too many sign-in attempts. Wait a few minutes, then try again.',
    );
    mapped.retryAfter = 0;
    return mapped;
  }

  if (supabaseCode === 'user_already_exists' || /user already registered/i.test(raw)) {
    return build('user_exists', 'This email is already registered. Sign in or reset your password.');
  }

  if (supabaseCode === 'weak_password' || /password should be at least/i.test(raw)) {
    return build('weak_password', 'Password must be at least 6 characters.');
  }

  if (supabaseCode === 'same_password' || /should be different from the old password/i.test(raw)) {
    return build('same_password', 'Choose a password you have not used before.');
  }

  if (
    supabaseCode === 'otp_expired' ||
    /(token|link).*(expired|invalid)/i.test(raw) ||
    /invalid or has expired/i.test(raw)
  ) {
    return build('expired_link', 'This link expired or was already used. Request a new one.');
  }

  if (supabaseCode === 'session_not_found' || /auth session missing/i.test(raw)) {
    return build('session_missing', 'Your reset link is no longer valid. Request a new one.');
  }

  if (/invalid email/i.test(raw) || /unable to validate email/i.test(raw)) {
    return build('invalid_email', 'Enter a valid email address.');
  }

  if (/failed to fetch|network ?error|load failed/i.test(raw)) {
    return build('network', 'Network error. Check your connection and try again.');
  }

  const fallback = {
    signin: 'Sign in failed. Please try again.',
    signup: 'Could not create your account. Please try again.',
    reset: 'Could not send the reset email. Please try again.',
    update: 'Could not update your password. Please try again.',
    resend: 'Could not resend the confirmation email. Please try again.',
  }[context] || 'Something went wrong. Please try again.';

  return build('unknown', fallback);
}

/** Absolute URL Supabase should send recovery links back to. */
export function getPasswordResetRedirectTo() {
  if (typeof window === 'undefined' || !window.location?.origin) return undefined;
  return `${window.location.origin}/reset-password`;
}

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw mapAuthError(error, 'signin');
  return data.user;
}

/**
 * Sends a password recovery email. Supabase intentionally succeeds for unknown
 * addresses, so callers must show neutral "if an account exists" copy.
 * @param {string} email
 */
export async function resetPasswordForEmail(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(String(email || '').trim(), {
    redirectTo: getPasswordResetRedirectTo(),
  });
  if (error) throw mapAuthError(error, 'reset');
  return true;
}

/**
 * Sets a new password for the current session (recovery session included).
 * @param {string} newPassword
 */
export async function updatePassword(newPassword) {
  const { data, error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw mapAuthError(error, 'update');
  return data?.user ?? null;
}

/** Re-sends the sign-up confirmation email for an unconfirmed account. */
export async function resendSignupEmail(email) {
  const emailRedirectTo =
    typeof window !== 'undefined' && window.location?.origin ? window.location.origin : undefined;
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email: String(email || '').trim(),
    options: { emailRedirectTo },
  });
  if (error) throw mapAuthError(error, 'resend');
  return true;
}

const ADMIN_SESSION_KEY = 'ordering_admin_session';

/** Remember that this browser signed into the admin dashboard. */
export function markAdminSession() {
  try {
    localStorage.setItem(ADMIN_SESSION_KEY, '1');
  } catch {
    // storage unavailable
  }
}

export function clearAdminSession() {
  try {
    localStorage.removeItem(ADMIN_SESSION_KEY);
  } catch {
    // storage unavailable
  }
}

export function hasAdminSession() {
  try {
    return localStorage.getItem(ADMIN_SESSION_KEY) === '1';
  } catch {
    return false;
  }
}

export async function signOut() {
  clearAdminSession();
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

/** True when this auth user has a restaurant_staff row for this restaurant. */
export async function isStaffForRestaurant(userId, restaurantId) {
  if (!userId || !restaurantId) return false;
  const { data, error } = await supabase
    .from('restaurant_staff')
    .select('id')
    .eq('auth_user_id', userId)
    .eq('restaurant_id', restaurantId)
    .maybeSingle();

  if (error || !data) return false;
  return true;
}

/**
 * Staff row for this user. Pass restaurantId when the account is linked to
 * more than one business — a single-row lookup fails in that case.
 */
export async function getRestaurantForUser(userId, restaurantId) {
  let query = supabase
    .from('restaurant_staff')
    .select(`
      role,
      restaurant_id,
      restaurants (*)
    `)
    .eq('auth_user_id', userId);

  if (restaurantId) query = query.eq('restaurant_id', restaurantId);

  const { data, error } = await query.limit(1);
  if (error) throw error;

  const row = data?.[0];
  if (!row) throw new Error('No restaurant found for this account.');

  return {
    role: row.role,
    restaurant: row.restaurants,
    restaurant_id: row.restaurant_id,
  };
}

export function onAuthStateChange(callback) {
  const { data: { subscription } } = supabase.auth.onAuthStateChange(
    (event, session) => callback(event, session?.user ?? null)
  );

  return () => subscription.unsubscribe();
}