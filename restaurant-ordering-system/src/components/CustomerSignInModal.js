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
import { syncMarketingContact } from '../services/emailApi';
import * as customerService from '../services/customerService';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 6;
const STAFF_WARNING =
  'This email is registered for admin access. Please sign in at /admin instead.';

export default function CustomerSignInModal({ visible, onClose }) {
  const { restaurant } = useRestaurantContext();
  const {
    user,
    customerProfile,
    signIn,
    signUp,
    signOut,
    linkCustomer,
    isStaffUser,
    refreshCustomerProfile,
    isCustomerAuthenticated,
  } = useAuth();

  const [mode, setMode] = useState('signin');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [marketingOptIn, setMarketingOptIn] = useState(true);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [staffWarning, setStaffWarning] = useState(false);
  const [confirmingSignOut, setConfirmingSignOut] = useState(false);

  useEffect(() => {
    if (visible && restaurant?.id) {
      refreshCustomerProfile(restaurant.id);
    }
  }, [visible, restaurant?.id, refreshCustomerProfile]);

  useEffect(() => {
    if (!visible) {
      setFirstName('');
      setLastName('');
      setPhone('');
      setEmail('');
      setPassword('');
      setConfirmPassword('');
      setMarketingOptIn(true);
      setErrors({});
      setTouched({});
      setMode('signin');
      setLoading(false);
      setStaffWarning(false);
      setConfirmingSignOut(false);
    }
  }, [visible]);

  const clearFieldError = (field) => {
    setErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const validate = (forMode = mode) => {
    const errs = {};
    const trimmedEmail = email.trim();

    if (forMode === 'signup') {
      if (!firstName.trim()) {
        errs.firstName = 'First name is required';
      }
      if (!lastName.trim()) {
        errs.lastName = 'Last name is required';
      }
      if (!phone.trim()) {
        errs.phone = 'Phone is required';
      }
    }

    if (!trimmedEmail) {
      errs.email = 'Email is required';
    } else if (!EMAIL_RE.test(trimmedEmail)) {
      errs.email = 'Enter a valid email address';
    }

    if (!password) {
      errs.password = 'Password is required';
    } else if (forMode === 'signup' && password.length < MIN_PASSWORD_LENGTH) {
      errs.password = `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
    }

    if (forMode === 'signup') {
      if (!confirmPassword) {
        errs.confirmPassword = 'Confirm your password';
      } else if (confirmPassword !== password) {
        errs.confirmPassword = 'Passwords do not match';
      }
    }

    return errs;
  };

  const handleFirstNameChange = (value) => {
    setFirstName(value);
    if (touched.firstName) clearFieldError('firstName');
  };

  const handleLastNameChange = (value) => {
    setLastName(value);
    if (touched.lastName) clearFieldError('lastName');
  };

  const handlePhoneChange = (value) => {
    setPhone(value);
    if (touched.phone) clearFieldError('phone');
  };

  const handleEmailChange = (value) => {
    setEmail(value);
    setStaffWarning(false);
    if (touched.email) clearFieldError('email');
  };

  const handlePasswordChange = (value) => {
    setPassword(value);
    setStaffWarning(false);
    if (touched.password) clearFieldError('password');
    if (touched.confirmPassword && confirmPassword && value === confirmPassword) {
      clearFieldError('confirmPassword');
    }
  };

  const handleConfirmPasswordChange = (value) => {
    setConfirmPassword(value);
    if (touched.confirmPassword) clearFieldError('confirmPassword');
  };

  const handleBlur = (field) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
    const fieldErrors = validate();
    setErrors((prev) => {
      const next = { ...prev };
      if (fieldErrors[field]) next[field] = fieldErrors[field];
      else delete next[field];
      return next;
    });
  };

  const switchMode = (nextMode) => {
    setMode(nextMode);
    setErrors({});
    setTouched({});
    setConfirmPassword('');
    setStaffWarning(false);
    if (nextMode === 'signin') {
      setFirstName('');
      setLastName('');
      setPhone('');
    }
  };

  const showStaffWarning = () => {
    setStaffWarning(true);
    Alert.alert('Staff account', STAFF_WARNING);
  };

  const handleSignIn = async () => {
    if (!restaurant?.id) {
      Alert.alert('Error', 'Restaurant is still loading. Please try again in a moment.');
      return;
    }

    const validationErrors = validate('signin');
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      setTouched({ email: true, password: true });
      return;
    }
    setErrors({});
    setStaffWarning(false);

    setLoading(true);
    try {
      const result = await signIn(email.trim(), password);
      const signedInUser = result?.user;

      if (!signedInUser) {
        Alert.alert('Sign in failed', 'Could not sign in. Please try again.');
        return;
      }

      const isStaff = await isStaffUser(signedInUser.id);
      if (isStaff) {
        await signOut();
        showStaffWarning();
        return;
      }

      let profile;
      try {
        profile = await linkCustomer(restaurant.id, email.trim(), signedInUser);
      } catch (linkError) {
        Alert.alert(
          'Sign in failed',
          linkError.message || 'Could not load your customer profile.',
        );
        return;
      }

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
    if (!restaurant?.id) {
      Alert.alert('Error', 'Restaurant is still loading. Please try again in a moment.');
      return;
    }

    const validationErrors = validate('signup');
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      setTouched({
        firstName: true,
        lastName: true,
        phone: true,
        email: true,
        password: true,
        confirmPassword: true,
      });
      return;
    }
    setErrors({});
    setStaffWarning(false);

    const trimmedFirst = firstName.trim();
    const trimmedLast = lastName.trim();
    const trimmedName = [trimmedFirst, trimmedLast].filter(Boolean).join(' ');
    const trimmedPhone = phone.trim();

    setLoading(true);
    try {
      const result = await signUp(email.trim(), password, { restaurantId: restaurant.id });
      const signedInUser = result?.user;

      if (!signedInUser) {
        Alert.alert(
          'Check your email',
          'We sent a confirmation link. Confirm your email, then sign in.',
        );
        return;
      }

      // Fake / duplicate signup response (confirm-email enabled, user already exists)
      if (!result.session && Array.isArray(signedInUser.identities) && signedInUser.identities.length === 0) {
        Alert.alert(
          'Account exists',
          'This email is already registered. Confirm your email if needed, then sign in.',
        );
        switchMode('signin');
        return;
      }

      // Only check staff when a session was created (user is actually signed in)
      if (result.session) {
        const isStaff = await isStaffUser(signedInUser.id);
        if (isStaff) {
          await signOut();
          showStaffWarning();
          return;
        }
      }

      // With email confirmation there is often no JWT, so RLS insert cannot run.
      // Always create the customer row via service-role edge function.
      let profile = null;
      try {
        profile = await customerService.ensureCustomerProfile({
          restaurantId: restaurant.id,
          userId: signedInUser.id,
          email: email.trim(),
          firstName: trimmedFirst,
          lastName: trimmedLast,
          phone: trimmedPhone,
          marketingOptIn,
        });
      } catch {
        // Fallback when a session exists (RLS insert)
        if (result.session) {
          try {
            profile = await linkCustomer(restaurant.id, email.trim(), signedInUser, {
              firstName: trimmedFirst,
              lastName: trimmedLast,
              phone: trimmedPhone,
              marketingOptIn,
            });
          } catch {
            // handled below
          }
        }
      }

      if (!result.session) {
        Alert.alert(
          'Confirm your email',
          profile
            ? 'We created your account. Confirm the link we emailed you, then sign in.'
            : 'We created your login. Confirm the email link, then sign in to finish setting up your customer profile.',
        );
        switchMode('signin');
        return;
      }

      if (!profile) {
        profile = await refreshCustomerProfile(restaurant.id);
      }

      if (!profile) {
        await signOut();
        Alert.alert(
          'Account setup failed',
          'Could not create your customer profile. Please try signing in after a moment.',
        );
        return;
      }

      if (marketingOptIn && profile?.id) {
        try {
          await syncMarketingContact({
            restaurantId: restaurant.id,
            email: email.trim(),
            fullName: trimmedName,
            phone: trimmedPhone,
            marketingOptIn: true,
          });
        } catch {
          // Non-blocking — account still created
        }
      }

      onClose();
    } catch (error) {
      const msg = String(error?.message || '');
      if (/rate limit/i.test(msg)) {
        Alert.alert(
          'Sign up temporarily blocked',
          'Too many confirmation emails were sent. Wait a few minutes, then try again.',
        );
      } else {
        Alert.alert('Sign up failed', msg || 'Could not create account.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmSignOut = async () => {
    setLoading(true);
    try {
      await signOut();
      setConfirmingSignOut(false);
      onClose();
    } catch (error) {
      Alert.alert('Error', error.message || 'Could not sign out.');
    } finally {
      setLoading(false);
    }
  };

  const signedInAsCustomer = isCustomerAuthenticated;
  const brandColor = restaurant?.brand_color || '#007AFF';
  const displayEmail = customerProfile?.email || user?.email || '';

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
              {signedInAsCustomer
                ? confirmingSignOut
                  ? 'Are you sure you want to sign out?'
                  : 'Manage your account or sign out below.'
                : restaurant?.name
                  ? `Sign in to order from ${restaurant.name}`
                  : 'Sign in or create an account'}
            </Text>

            {signedInAsCustomer ? (
              <View style={{ gap: 14 }}>
                <View style={styles.signedInRow}>
                  <Ionicons name="person-circle-outline" size={20} color="#777" />
                  <Text style={styles.signedInEmail}>{displayEmail}</Text>
                </View>
                {confirmingSignOut ? (
                  <View style={styles.signOutActions}>
                    <TouchableOpacity
                      style={[
                        styles.button,
                        styles.cancelButton,
                        styles.signOutActionBtn,
                        loading && styles.buttonDisabled,
                      ]}
                      onPress={() => setConfirmingSignOut(false)}
                      disabled={loading}
                    >
                      <Text style={styles.cancelButtonText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.button,
                        styles.signOutButton,
                        styles.signOutActionBtn,
                        loading && styles.buttonDisabled,
                      ]}
                      onPress={handleConfirmSignOut}
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
                  <TouchableOpacity
                    style={[styles.button, styles.signOutButton, loading && styles.buttonDisabled]}
                    onPress={() => setConfirmingSignOut(true)}
                    disabled={loading}
                  >
                    <Text style={styles.buttonText}>Sign out</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              <>
                <View style={styles.tabs}>
                  <TouchableOpacity
                    style={[styles.tab, mode === 'signin' && styles.tabActive]}
                    onPress={() => switchMode('signin')}
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
                    onPress={() => switchMode('signup')}
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

                {staffWarning ? (
                  <View style={styles.warningBanner}>
                    <Ionicons name="warning-outline" size={18} color="#9a3412" />
                    <Text style={styles.warningText}>{STAFF_WARNING}</Text>
                  </View>
                ) : null}

                {mode === 'signup' ? (
                  <>
                    <View style={styles.nameRow}>
                      <View style={styles.nameField}>
                        <TextInput
                          style={[styles.input, errors.firstName && styles.inputError]}
                          placeholder="First name"
                          placeholderTextColor="#999"
                          value={firstName}
                          onChangeText={handleFirstNameChange}
                          onBlur={() => handleBlur('firstName')}
                          autoCapitalize="words"
                          autoComplete="given-name"
                          textContentType="givenName"
                        />
                        {errors.firstName ? <Text style={styles.errorText}>{errors.firstName}</Text> : null}
                      </View>
                      <View style={styles.nameField}>
                        <TextInput
                          style={[styles.input, errors.lastName && styles.inputError]}
                          placeholder="Last name"
                          placeholderTextColor="#999"
                          value={lastName}
                          onChangeText={handleLastNameChange}
                          onBlur={() => handleBlur('lastName')}
                          autoCapitalize="words"
                          autoComplete="family-name"
                          textContentType="familyName"
                        />
                        {errors.lastName ? <Text style={styles.errorText}>{errors.lastName}</Text> : null}
                      </View>
                    </View>

                    <TextInput
                      style={[styles.input, errors.phone && styles.inputError]}
                      placeholder="Phone"
                      placeholderTextColor="#999"
                      value={phone}
                      onChangeText={handlePhoneChange}
                      onBlur={() => handleBlur('phone')}
                      keyboardType="phone-pad"
                      autoComplete="tel"
                      textContentType="telephoneNumber"
                    />
                    {errors.phone ? <Text style={styles.errorText}>{errors.phone}</Text> : null}
                  </>
                ) : null}

                <TextInput
                  style={[styles.input, errors.email && styles.inputError]}
                  placeholder="Email"
                  placeholderTextColor="#999"
                  value={email}
                  onChangeText={handleEmailChange}
                  onBlur={() => handleBlur('email')}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  textContentType="emailAddress"
                />
                {errors.email ? <Text style={styles.errorText}>{errors.email}</Text> : null}

                <TextInput
                  style={[styles.input, errors.password && styles.inputError]}
                  placeholder="Password"
                  placeholderTextColor="#999"
                  value={password}
                  onChangeText={handlePasswordChange}
                  onBlur={() => handleBlur('password')}
                  secureTextEntry
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  textContentType={mode === 'signup' ? 'newPassword' : 'password'}
                />
                {errors.password ? <Text style={styles.errorText}>{errors.password}</Text> : null}

                {mode === 'signup' ? (
                  <>
                    <TextInput
                      style={[styles.input, errors.confirmPassword && styles.inputError]}
                      placeholder="Confirm password"
                      placeholderTextColor="#999"
                      value={confirmPassword}
                      onChangeText={handleConfirmPasswordChange}
                      onBlur={() => handleBlur('confirmPassword')}
                      secureTextEntry
                      autoComplete="new-password"
                      textContentType="newPassword"
                    />
                    {errors.confirmPassword ? (
                      <Text style={styles.errorText}>{errors.confirmPassword}</Text>
                    ) : null}

                    <Text style={styles.optInLabel}>Email me deals &amp; updates</Text>
                    <View style={styles.yesNoRow}>
                      {[
                        { label: 'Yes', val: true },
                        { label: 'No', val: false },
                      ].map(({ label, val }) => {
                        const active = marketingOptIn === val;
                        return (
                          <TouchableOpacity
                            key={label}
                            style={[
                              styles.yesNoBtn,
                              active && { backgroundColor: brandColor, borderColor: brandColor },
                            ]}
                            onPress={() => setMarketingOptIn(val)}
                            activeOpacity={0.85}
                          >
                            <Text style={[styles.yesNoText, active && styles.yesNoTextActive]}>
                              {label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </>
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
  signOutActions: {
    flexDirection: 'row',
    gap: 10,
  },
  signOutActionBtn: {
    flex: 1,
  },
  signOutButton: {
    backgroundColor: '#FF3B30',
  },
  cancelButton: {
    backgroundColor: '#f0f0f0',
  },
  cancelButtonText: {
    color: '#333',
    fontSize: 16,
    fontWeight: '700',
  },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#fff7ed',
    borderWidth: 1,
    borderColor: '#fdba74',
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
  },
  warningText: {
    flex: 1,
    fontSize: 13,
    color: '#9a3412',
    lineHeight: 18,
    fontWeight: '600',
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
    marginBottom: 4,
    color: '#111',
    backgroundColor: '#fafafa',
  },
  inputError: {
    borderColor: '#c0392b',
    backgroundColor: '#fff8f7',
  },
  errorText: {
    fontSize: 12,
    color: '#c0392b',
    marginBottom: 10,
    marginTop: 2,
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
  nameRow: {
    flexDirection: 'row',
    gap: 10,
  },
  nameField: {
    flex: 1,
  },
  optInLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#444',
    marginTop: 8,
    marginBottom: 8,
  },
  yesNoRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  yesNoBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e5e5e5',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#fafafa',
  },
  yesNoText: { fontSize: 14, fontWeight: '700', color: '#555' },
  yesNoTextActive: { color: '#fff' },
});
