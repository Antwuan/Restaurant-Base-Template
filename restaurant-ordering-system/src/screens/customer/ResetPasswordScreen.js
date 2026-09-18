// Landing screen for Supabase password-recovery links (/reset-password).
// Rendered without customer chrome — the link can be opened from the storefront
// or from /admin, so this screen offers both exits after a successful reset.
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useRestaurantContext } from '../../context/RestaurantContext';
import { useTheme } from '../../theme';

const MIN_PASSWORD_LENGTH = 6;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// supabase-js strips the recovery tokens from the URL as soon as it consumes
// them, so snapshot the URL at module load — by mount time it can be clean.
const INITIAL_HASH = typeof window !== 'undefined' ? window.location.hash || '' : '';
const INITIAL_SEARCH = typeof window !== 'undefined' ? window.location.search || '' : '';
// How long to wait for the PASSWORD_RECOVERY event before calling the link dead.
const VERIFY_TIMEOUT_MS = 6000;

function paramsFrom(fragment) {
  return new URLSearchParams(String(fragment || '').replace(/^[#?]/, ''));
}

/** Recovery tokens / Supabase error params, from the URL as it first looked. */
function readLinkState() {
  const sources = [
    INITIAL_HASH,
    INITIAL_SEARCH,
    typeof window !== 'undefined' ? window.location.hash || '' : '',
    typeof window !== 'undefined' ? window.location.search || '' : '',
  ];

  let hasToken = false;
  let errorCode = null;

  sources.forEach((source) => {
    const params = paramsFrom(source);
    if (params.get('access_token') || params.get('token_hash') || params.get('code')) {
      hasToken = true;
    }
    const linkError = params.get('error_code') || params.get('error');
    if (linkError) errorCode = linkError;
  });

  return { hasToken, errorCode };
}

function linkErrorMessage(errorCode) {
  if (errorCode === 'otp_expired') {
    return 'This reset link expired or was already used.';
  }
  return 'This reset link is not valid anymore.';
}

export default function ResetPasswordScreen({ navigation }) {
  const { theme } = useTheme();
  const { restaurant } = useRestaurantContext();
  const {
    user,
    loading: authLoading,
    isStaff,
    passwordRecovery,
    updatePassword,
    resetPasswordForEmail,
  } = useAuth();

  // verifying → ready (recovery session present) | invalid (no/expired link) | done
  const [status, setStatus] = useState('verifying');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resendEmail, setResendEmail] = useState('');
  const [errors, setErrors] = useState({});
  const [notice, setNotice] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const brandColor = theme.colors.brand;
  const colors = theme.colors;

  useEffect(() => {
    if (status !== 'verifying') return undefined;

    const { hasToken, errorCode } = readLinkState();
    if (errorCode) {
      setNotice({ type: 'error', text: linkErrorMessage(errorCode) });
      setStatus('invalid');
      return undefined;
    }

    if (passwordRecovery || user) {
      setStatus('ready');
      return undefined;
    }

    // Wait for the initial getSession() before deciding there is no session.
    if (authLoading) return undefined;

    if (!hasToken) {
      setNotice({
        type: 'error',
        text: 'Open the reset link from your email to continue.',
      });
      setStatus('invalid');
      return undefined;
    }

    // Cleanup below cancels this as soon as a recovery session shows up.
    const timer = setTimeout(() => {
      setNotice({ type: 'error', text: linkErrorMessage(null) });
      setStatus('invalid');
    }, VERIFY_TIMEOUT_MS);

    return () => clearTimeout(timer);
  }, [status, passwordRecovery, user, authLoading]);

  const validate = () => {
    const errs = {};
    if (!password) {
      errs.password = 'Enter a new password';
    } else if (password.length < MIN_PASSWORD_LENGTH) {
      errs.password = `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
    }
    if (!confirmPassword) {
      errs.confirmPassword = 'Confirm your new password';
    } else if (confirmPassword !== password) {
      errs.confirmPassword = 'Passwords do not match';
    }
    return errs;
  };

  const handleSave = async () => {
    const validationErrors = validate();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    setErrors({});
    setNotice(null);

    setSubmitting(true);
    try {
      await updatePassword(password);
      setPassword('');
      setConfirmPassword('');
      setStatus('done');
    } catch (error) {
      setNotice({
        type: 'error',
        text: error.message || 'Could not update your password. Please try again.',
      });
      if (error.code === 'expired_link' || error.code === 'session_missing') {
        setStatus('invalid');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleRequestNewLink = async () => {
    const trimmedEmail = resendEmail.trim();
    if (!EMAIL_RE.test(trimmedEmail)) {
      setErrors({ resendEmail: 'Enter a valid email address' });
      return;
    }
    setErrors({});
    setNotice(null);

    setSubmitting(true);
    try {
      await resetPasswordForEmail(trimmedEmail);
      setNotice({
        type: 'info',
        text: 'If an account exists for that email, we sent a new reset link. Check your inbox and spam folder.',
      });
    } catch (error) {
      setNotice({
        type: 'error',
        text: error.message || 'Could not send the reset email. Please try again.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const goHome = () => {
    if (navigation?.navigate) navigation.navigate('Home');
    else if (typeof window !== 'undefined') window.location.assign('/');
  };

  const goAdminLogin = () => {
    if (typeof window !== 'undefined') window.location.assign('/admin');
  };

  const heading =
    status === 'done'
      ? 'Password updated'
      : status === 'invalid'
        ? 'Reset your password'
        : 'Set a new password';

  const subheading = () => {
    if (status === 'done') return 'Your new password is ready to use.';
    if (status === 'invalid') {
      return 'Reset links can only be used once and expire quickly. Enter your email to get a new one.';
    }
    if (status === 'verifying') return 'Checking your reset link…';
    return user?.email
      ? `Choose a new password for ${user.email}.`
      : `Choose a new password for your ${restaurant?.name || 'restaurant'} account.`;
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View
        style={[
          styles.card,
          { backgroundColor: colors.backgroundCard, borderTopColor: brandColor },
        ]}
      >
        <Text style={[styles.title, { color: colors.textPrimary }]}>{heading}</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{subheading()}</Text>

        {notice ? (
          <View
            style={[
              styles.banner,
              notice.type === 'error'
                ? { backgroundColor: colors.errorLight, borderColor: colors.error }
                : { backgroundColor: colors.infoLight, borderColor: colors.info },
            ]}
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
          >
            <Ionicons
              name={notice.type === 'error' ? 'warning-outline' : 'information-circle-outline'}
              size={18}
              color={notice.type === 'error' ? colors.errorText : colors.infoText}
            />
            <Text
              style={[
                styles.bannerText,
                { color: notice.type === 'error' ? colors.errorText : colors.infoText },
              ]}
            >
              {notice.text}
            </Text>
          </View>
        ) : null}

        {status === 'verifying' ? (
          <ActivityIndicator style={styles.spinner} color={brandColor} />
        ) : null}

        {status === 'ready' ? (
          <>
            <TextInput
              style={[
                styles.input,
                {
                  borderColor: errors.password ? colors.error : colors.border,
                  color: colors.textPrimary,
                  backgroundColor: colors.backgroundSunken,
                },
              ]}
              placeholder="New password"
              placeholderTextColor={colors.textDisabled}
              value={password}
              onChangeText={(value) => {
                setPassword(value);
                setErrors({});
              }}
              secureTextEntry
              autoComplete="new-password"
              textContentType="newPassword"
            />
            {errors.password ? (
              <Text style={[styles.errorText, { color: colors.error }]}>{errors.password}</Text>
            ) : null}

            <TextInput
              style={[
                styles.input,
                {
                  borderColor: errors.confirmPassword ? colors.error : colors.border,
                  color: colors.textPrimary,
                  backgroundColor: colors.backgroundSunken,
                },
              ]}
              placeholder="Confirm new password"
              placeholderTextColor={colors.textDisabled}
              value={confirmPassword}
              onChangeText={(value) => {
                setConfirmPassword(value);
                setErrors({});
              }}
              secureTextEntry
              autoComplete="new-password"
              textContentType="newPassword"
            />
            {errors.confirmPassword ? (
              <Text style={[styles.errorText, { color: colors.error }]}>{errors.confirmPassword}</Text>
            ) : null}

            <TouchableOpacity
              style={[styles.button, { backgroundColor: brandColor }, submitting && styles.buttonDisabled]}
              onPress={handleSave}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color={colors.brandText || '#fff'} />
              ) : (
                <Text style={[styles.buttonText, { color: colors.brandText || '#fff' }]}>
                  Save new password
                </Text>
              )}
            </TouchableOpacity>
          </>
        ) : null}

        {status === 'invalid' ? (
          <>
            <TextInput
              style={[
                styles.input,
                {
                  borderColor: errors.resendEmail ? colors.error : colors.border,
                  color: colors.textPrimary,
                  backgroundColor: colors.backgroundSunken,
                },
              ]}
              placeholder="Email"
              placeholderTextColor={colors.textDisabled}
              value={resendEmail}
              onChangeText={(value) => {
                setResendEmail(value);
                setErrors({});
              }}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              textContentType="emailAddress"
            />
            {errors.resendEmail ? (
              <Text style={[styles.errorText, { color: colors.error }]}>{errors.resendEmail}</Text>
            ) : null}

            <TouchableOpacity
              style={[styles.button, { backgroundColor: brandColor }, submitting && styles.buttonDisabled]}
              onPress={handleRequestNewLink}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color={colors.brandText || '#fff'} />
              ) : (
                <Text style={[styles.buttonText, { color: colors.brandText || '#fff' }]}>
                  Send a new link
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={styles.link} onPress={goHome}>
              <Text style={[styles.linkText, { color: brandColor }]}>Back to home</Text>
            </TouchableOpacity>
          </>
        ) : null}

        {status === 'done' ? (
          <>
            <TouchableOpacity
              style={[styles.button, { backgroundColor: brandColor }]}
              onPress={goHome}
            >
              <Text style={[styles.buttonText, { color: colors.brandText || '#fff' }]}>
                Continue to {restaurant?.name || 'home'}
              </Text>
            </TouchableOpacity>

            {isStaff ? (
              <TouchableOpacity style={styles.link} onPress={goAdminLogin}>
                <Text style={[styles.linkText, { color: brandColor }]}>Go to admin login</Text>
              </TouchableOpacity>
            ) : null}
          </>
        ) : null}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 440,
    borderRadius: 16,
    padding: 32,
    borderTopWidth: 4,
    ...Platform.select({
      web: { boxShadow: '0 8px 40px rgba(0,0,0,0.12)' },
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.12,
        shadowRadius: 16,
      },
      android: { elevation: 6 },
    }),
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 22,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  bannerText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  spinner: {
    marginVertical: 12,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    fontSize: 15,
    marginBottom: 4,
  },
  errorText: {
    fontSize: 12,
    marginTop: 2,
    marginBottom: 6,
  },
  button: {
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 12,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '700',
  },
  link: {
    marginTop: 16,
    alignItems: 'center',
  },
  linkText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
