// Admin login screen using AuthContext's `useAuth` hook. Handles email/password
// sign-in, password recovery, loading and error states, and lets AuthContext
// control post-login navigation/redirects.
import React, { useState } from 'react';
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
import { useAuth } from '../../context/AuthContext';
import { useRestaurantContext } from '../../context/RestaurantContext';
import { useTheme } from '../../theme';
import { isStaffForRestaurant } from '../../services/authService';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LoginScreen({ navigation }) {
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState(null);
  const [canResendConfirmation, setCanResendConfirmation] = useState(false);
  const { signIn, signOut, resetPasswordForEmail, resendSignupEmail } = useAuth();
  const { restaurant, adminLoginError, setAdminLoginError } = useRestaurantContext();
  const { theme } = useTheme();
  const brandColor = theme.colors.brand;

  const notAdminMessage = `This account is not an admin for ${restaurant?.name || 'this restaurant'}.`;
  // One banner slot: the context-level "not an admin" message wins over local copy.
  const banner = adminLoginError ? { type: 'error', text: adminLoginError } : notice;

  const clearMessages = () => {
    if (adminLoginError) setAdminLoginError(null);
    setNotice(null);
    setCanResendConfirmation(false);
  };

  const handleEmailChange = (value) => {
    setEmail(value);
    clearMessages();
  };

  const handlePasswordChange = (value) => {
    setPassword(value);
    clearMessages();
  };

  const switchMode = (nextMode) => {
    setMode(nextMode);
    setPassword('');
    clearMessages();
  };

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      setNotice({ type: 'error', text: 'Enter your email and password.' });
      return;
    }

    clearMessages();
    setLoading(true);
    try {
      const data = await signIn(email.trim(), password);
      const userId = data?.user?.id;
      if (userId) {
        const staffHere = await isStaffForRestaurant(userId, restaurant?.id);
        if (!staffHere) {
          setAdminLoginError(notAdminMessage);
          await signOut();
          return;
        }
      }
    } catch (error) {
      setNotice({ type: 'error', text: error.message || 'Sign in failed. Please try again.' });
      if (error.code === 'email_not_confirmed') setCanResendConfirmation(true);
    } finally {
      setLoading(false);
    }
  };

  const handleSendResetLink = async () => {
    const trimmedEmail = email.trim();
    if (!EMAIL_RE.test(trimmedEmail)) {
      setNotice({ type: 'error', text: 'Enter a valid email address.' });
      return;
    }

    clearMessages();
    setLoading(true);
    try {
      await resetPasswordForEmail(trimmedEmail);
      setNotice({
        type: 'info',
        text: 'If an account exists for that email, we sent a reset link. Check your inbox and spam folder.',
      });
    } catch (error) {
      setNotice({
        type: 'error',
        text: error.message || 'Could not send the reset email. Please try again.',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleResendConfirmation = async () => {
    const trimmedEmail = email.trim();
    if (!EMAIL_RE.test(trimmedEmail)) {
      setNotice({ type: 'error', text: 'Enter a valid email address.' });
      return;
    }

    setLoading(true);
    try {
      await resendSignupEmail(trimmedEmail);
      setCanResendConfirmation(false);
      setNotice({
        type: 'info',
        text: 'We sent a new confirmation link. Check your inbox and spam folder.',
      });
    } catch (error) {
      setNotice({
        type: 'error',
        text: error.message || 'Could not resend the confirmation email. Please try again.',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={[styles.card, { borderTopColor: brandColor }]}>
        <Text style={styles.title}>{mode === 'forgot' ? 'Reset Password' : 'Admin Login'}</Text>
        <Text style={[styles.subtitle, banner && styles.subtitleWithBanner]}>
          {mode === 'forgot'
            ? 'Enter your admin email and we will send you a link to set a new password.'
            : 'Sign in to manage your restaurant'}
        </Text>

        {banner ? (
          <View style={[styles.errorBanner, banner.type === 'info' && styles.infoBanner]}>
            <Text style={[styles.errorBannerText, banner.type === 'info' && styles.infoBannerText]}>
              {banner.text}
            </Text>
          </View>
        ) : null}

        {canResendConfirmation ? (
          <TouchableOpacity
            style={styles.resendLink}
            onPress={handleResendConfirmation}
            disabled={loading}
          >
            <Text style={[styles.resendText, { color: brandColor }]}>Resend confirmation email</Text>
          </TouchableOpacity>
        ) : null}

        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor="#999"
          value={email}
          onChangeText={handleEmailChange}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
        />

        {mode === 'signin' ? (
          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor="#999"
            value={password}
            onChangeText={handlePasswordChange}
            secureTextEntry
          />
        ) : null}

        <TouchableOpacity
          style={[styles.button, { backgroundColor: brandColor }, loading && styles.buttonDisabled]}
          onPress={mode === 'signin' ? handleLogin : handleSendResetLink}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color={theme.colors.brandText || '#fff'} />
          ) : (
            <Text style={styles.buttonText}>
              {mode === 'signin' ? 'Sign In' : 'Send reset link'}
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.forgotLink}
          onPress={() => switchMode(mode === 'signin' ? 'forgot' : 'signin')}
          disabled={loading}
        >
          <Text style={[styles.forgotText, { color: brandColor }]}>
            {mode === 'signin' ? 'Forgot Password?' : 'Back to sign in'}
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f0f4f8',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 32,
    borderTopWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 28,
  },
  subtitleWithBanner: {
    marginBottom: 12,
  },
  errorBanner: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  errorBannerText: {
    color: '#b91c1c',
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
  },
  infoBanner: {
    backgroundColor: '#f8f8f8',
    borderColor: '#e0e0e0',
  },
  infoBannerText: {
    color: '#333',
    fontWeight: '500',
  },
  resendLink: {
    alignSelf: 'flex-start',
    marginTop: -8,
    marginBottom: 14,
  },
  resendText: {
    fontSize: 13,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  input: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    padding: 14,
    fontSize: 16,
    marginBottom: 14,
    color: '#111',
    backgroundColor: '#fafafa',
  },
  button: {
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginTop: 6,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  forgotLink: {
    marginTop: 16,
    alignItems: 'center',
  },
  forgotText: {
    fontSize: 14,
  },
});

