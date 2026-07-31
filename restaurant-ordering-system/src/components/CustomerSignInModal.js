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
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRestaurantContext } from '../context/RestaurantContext';
import { useAuth } from '../context/AuthContext';
import { confirmAsync } from '../utils/confirm';
import { syncMarketingContact } from '../services/emailApi';
import * as customerService from '../services/customerService';

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
  const [marketingOptIn, setMarketingOptIn] = useState(false);
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

      const profile = await linkCustomer(restaurant.id, email);

      if (marketingOptIn && profile?.id) {
        try {
          await customerService.updateCustomerProfile(profile.id, {
            marketing_opt_in: true,
            marketing_opt_in_at: new Date().toISOString(),
          });
          await syncMarketingContact({
            restaurantId: restaurant.id,
            email,
            marketingOptIn: true,
          });
        } catch {
          // Non-blocking — account still created
        }
      }

      onClose();
    } catch (error) {
      Alert.alert('Sign up failed', error.message || 'Could not create account.');
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    const confirmed = await confirmAsync({
      title: 'Sign Out',
      message: 'Are you sure you want to sign out?',
      confirmText: 'Sign Out',
    });
    if (!confirmed) return;
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

  const brandColor = restaurant?.brand_color || '#007AFF';

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Dim backdrop — tap to close */}
        <Pressable style={styles.backdrop} onPress={onClose} />

        {/* Floating card */}
        <View style={styles.card}>
          {/* Close button */}
          <TouchableOpacity style={styles.closeBtn} onPress={onClose} hitSlop={8}>
            <Ionicons name="close" size={18} color="#555" />
          </TouchableOpacity>

          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Text style={styles.title}>
              {signedInAsCustomer ? 'Your account' : 'Customer account'}
            </Text>
            <Text style={styles.subtitle}>
              {restaurant?.name
                ? `Sign in to order from ${restaurant.name}`
                : 'Sign in or create an account'}
            </Text>

            {signedInAsCustomer ? (
              <View style={{ gap: 14 }}>
                <View style={styles.signedInRow}>
                  <Ionicons name="person-circle-outline" size={20} color="#777" />
                  <Text style={styles.signedInEmail}>{customerProfile.email}</Text>
                </View>
                <TouchableOpacity
                  style={[styles.button, { backgroundColor: '#111' }, loading && styles.buttonDisabled]}
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

                {mode === 'signup' ? (
                  <TouchableOpacity
                    style={styles.optInRow}
                    onPress={() => setMarketingOptIn((v) => !v)}
                    activeOpacity={0.7}
                  >
                    <View style={[
                      styles.checkbox,
                      marketingOptIn && { backgroundColor: brandColor, borderColor: brandColor },
                    ]}>
                      {marketingOptIn ? <Text style={styles.checkmark}>✓</Text> : null}
                    </View>
                    <Text style={styles.optInText}>Email me deals &amp; updates</Text>
                  </TouchableOpacity>
                ) : null}

                <TouchableOpacity
                  style={[styles.button, { backgroundColor: brandColor }, loading && styles.buttonDisabled]}
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
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 48,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 28,
    maxWidth: 460,
    width: '100%',
    maxHeight: '90%',
    ...Platform.select({
      web: { boxShadow: '0 8px 40px rgba(0,0,0,0.22)' },
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 16 },
      android: { elevation: 12 },
    }),
  },
  closeBtn: {
    position: 'absolute',
    top: 14,
    right: 14,
    zIndex: 10,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(0,0,0,0.07)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111',
    marginBottom: 4,
    paddingRight: 36,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 22,
    lineHeight: 20,
  },
  signedInRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#f8f8f8',
    borderRadius: 10,
    padding: 12,
  },
  signedInEmail: {
    fontSize: 15,
    color: '#333',
    flex: 1,
  },
  tabs: {
    flexDirection: 'row',
    marginBottom: 18,
    borderRadius: 10,
    backgroundColor: '#f0f0f0',
    padding: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 9,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabActive: {
    backgroundColor: '#fff',
    ...Platform.select({
      web: { boxShadow: '0 1px 4px rgba(0,0,0,0.08)' },
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4 },
      android: { elevation: 2 },
    }),
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#888',
  },
  tabTextActive: {
    color: '#111',
  },
  input: {
    borderWidth: 1,
    borderColor: '#e5e5e5',
    borderRadius: 10,
    padding: 14,
    fontSize: 15,
    marginBottom: 12,
    color: '#111',
    backgroundColor: '#fafafa',
  },
  button: {
    borderRadius: 12,
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
    fontWeight: '700',
  },
  optInRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
    marginTop: 2,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: '#ccc',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkmark: { color: '#fff', fontSize: 12, fontWeight: '700' },
  optInText: { fontSize: 14, color: '#333', flex: 1 },
});
