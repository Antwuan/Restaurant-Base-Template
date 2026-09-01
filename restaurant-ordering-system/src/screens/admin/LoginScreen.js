// Admin login screen using AuthContext's `useAuth` hook. Handles email/password
// sign-in, loading and error states, and lets AuthContext control post-login
// navigation/redirects.
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
  Alert,
} from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { useRestaurantContext } from '../../context/RestaurantContext';
import { useTheme } from '../../theme';
import { isStaffForRestaurant } from '../../services/authService';

function showAlert(title, message) {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.alert(message ? `${title}\n\n${message}` : title);
    return;
  }
  Alert.alert(title, message);
}

export default function LoginScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { signIn, signOut } = useAuth();
  const { restaurant, adminLoginError, setAdminLoginError } = useRestaurantContext();
  const { theme } = useTheme();
  const brandColor = theme.colors.brand;

  const notAdminMessage = `This account is not an admin for ${restaurant?.name || 'this restaurant'}.`;

  const handleEmailChange = (value) => {
    setEmail(value);
    if (adminLoginError) setAdminLoginError(null);
  };

  const handlePasswordChange = (value) => {
    setPassword(value);
    if (adminLoginError) setAdminLoginError(null);
  };

  const handleLogin = async () => {
    if (!email || !password) {
      showAlert('Error', 'Please enter your email and password.');
      return;
    }

    setLoading(true);
    try {
      const data = await signIn(email, password);
      const userId = data?.user?.id;
      if (userId) {
        const staffHere = await isStaffForRestaurant(userId, restaurant?.id);
        if (!staffHere) {
          setAdminLoginError(notAdminMessage);
          await signOut();
          showAlert('Not an admin account', notAdminMessage);
          return;
        }
      }
    } catch (error) {
      showAlert(
        'Login Failed',
        error.message || 'Invalid email or password. Please try again.',
      );
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
        <Text style={styles.title}>Admin Login</Text>
        <Text style={[styles.subtitle, adminLoginError && styles.subtitleWithBanner]}>
          Sign in to manage your restaurant
        </Text>

        {adminLoginError ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorBannerText}>{adminLoginError}</Text>
          </View>
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

        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor="#999"
          value={password}
          onChangeText={handlePasswordChange}
          secureTextEntry
        />

        <TouchableOpacity
          style={[styles.button, { backgroundColor: brandColor }, loading && styles.buttonDisabled]}
          onPress={handleLogin}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color={theme.colors.brandText || '#fff'} />
          ) : (
            <Text style={styles.buttonText}>Sign In</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.forgotLink}>
          <Text style={[styles.forgotText, { color: brandColor }]}>Forgot Password?</Text>
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

