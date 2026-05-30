import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ScrollView,
} from 'react-native';
import { useRestaurantContext } from '../context/RestaurantContext';
import { useAuth } from '../context/AuthContext';

export default function CustomerSignInModal({ visible, onClose }) {
  const { restaurant } = useRestaurantContext();
  const {
    user,
    customerProfile,
    signIn,
    signUp,
    signOut,
    linkCustomer,
    getRestaurantForUser,
    refreshCustomerProfile,
  } = useAuth();

  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (visible && restaurant?.id) {
      refreshCustomerProfile(restaurant.id);
    }
  }, [visible, restaurant?.id, refreshCustomerProfile]);

  const handleStaffBlock = async () => {
    try {
      await getRestaurantForUser(user.id);
      return true;
    } catch {
      return false;
    }
  };

  const handleSignIn = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please enter your email and password.');
      return;
    }

    setLoading(true);
    try {
      const { user: signedInUser } = await signIn(email, password);

      const isStaff = await getRestaurantForUser(signedInUser.id).then(() => true).catch(() => false);
      if (isStaff) {
        await signOut();
        Alert.alert(
          'Staff account',
          'This email is registered for admin access. Please sign in at /admin instead.',
        );
        return;
      }

      const profile = await linkCustomer(restaurant.id, email);
      if (!profile) {
        await signOut();
        Alert.alert(
          'No account',
          'No customer account exists for this restaurant. Create an account first.',
        );
        return;
      }

      onClose();
    } catch (error) {
      Alert.alert('Sign in failed', error.message || 'Invalid email or password.');
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please enter your email and password.');
      return;
    }

    if (password.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters.');
      return;
    }

    setLoading(true);
    try {
      const result = await signUp(email, password);
      const signedInUser = result?.user;

      if (!signedInUser) {
        Alert.alert(
          'Check your email',
          'We sent a confirmation link. Confirm your email, then sign in.',
        );
        return;
      }

      const isStaff = await getRestaurantForUser(signedInUser.id).then(() => true).catch(() => false);
      if (isStaff) {
        await signOut();
        Alert.alert(
          'Staff account',
          'This email is already used for admin access. Use /admin to sign in.',
        );
        return;
      }

      await linkCustomer(restaurant.id, email);
      onClose();
    } catch (error) {
      Alert.alert('Sign up failed', error.message || 'Could not create account.');
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    setLoading(true);
    try {
      await signOut();
      onClose();
    } catch (error) {
      Alert.alert('Error', error.message || 'Could not sign out.');
    } finally {
      setLoading(false);
    }
  };

  const signedInAsCustomer = user && customerProfile;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.card}>
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={styles.title}>
              {signedInAsCustomer ? 'Your account' : 'Customer account'}
            </Text>
            <Text style={styles.subtitle}>
              {restaurant?.name
                ? `Sign in to order from ${restaurant.name}`
                : 'Sign in or create an account'}
            </Text>

            {signedInAsCustomer ? (
              <View>
                <Text style={styles.signedInEmail}>{customerProfile.email}</Text>
                <TouchableOpacity
                  style={[styles.button, loading && styles.buttonDisabled]}
                  onPress={handleSignOut}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.buttonText}>Sign out</Text>
                  )}
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <View style={styles.tabs}>
                  <TouchableOpacity
                    style={[styles.tab, mode === 'signin' && styles.tabActive]}
                    onPress={() => setMode('signin')}
                  >
                    <Text
                      style={[
                        styles.tabText,
                        mode === 'signin' && styles.tabTextActive,
                      ]}
                    >
                      Sign in
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.tab, mode === 'signup' && styles.tabActive]}
                    onPress={() => setMode('signup')}
                  >
                    <Text
                      style={[
                        styles.tabText,
                        mode === 'signup' && styles.tabTextActive,
                      ]}
                    >
                      Create account
                    </Text>
                  </TouchableOpacity>
                </View>

                <TextInput
                  style={styles.input}
                  placeholder="Email"
                  placeholderTextColor="#999"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />

                <TextInput
                  style={styles.input}
                  placeholder="Password"
                  placeholderTextColor="#999"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                />

                <TouchableOpacity
                  style={[styles.button, loading && styles.buttonDisabled]}
                  onPress={mode === 'signin' ? handleSignIn : handleSignUp}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.buttonText}>
                      {mode === 'signin' ? 'Sign in' : 'Create account'}
                    </Text>
                  )}
                </TouchableOpacity>
              </>
            )}

            <TouchableOpacity style={styles.cancelLink} onPress={onClose}>
              <Text style={styles.cancelText}>Close</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 28,
    maxWidth: 420,
    width: '100%',
    alignSelf: 'center',
    maxHeight: '90%',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 20,
  },
  signedInEmail: {
    fontSize: 16,
    color: '#333',
    marginBottom: 16,
  },
  tabs: {
    flexDirection: 'row',
    marginBottom: 16,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
    padding: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 6,
  },
  tabActive: {
    backgroundColor: '#fff',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  tabTextActive: {
    color: '#007AFF',
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
    backgroundColor: '#007AFF',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginTop: 6,
  },
  buttonDisabled: {
    backgroundColor: '#a0c4ff',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  cancelLink: {
    marginTop: 16,
    alignItems: 'center',
  },
  cancelText: {
    color: '#666',
    fontSize: 14,
  },
});
