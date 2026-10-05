/**
 * Customer Profile — Details (first/last/phone/email/marketing) + reward codes.
 * Sign out lives in the navbar account dropdown.
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  useWindowDimensions,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useRestaurantContext } from '../../context/RestaurantContext';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../theme';
import CustomerNavbar from '../../components/CustomerNavbar';
import CustomerSignInModal from '../../components/CustomerSignInModal';
import RewardCodesList from '../../components/RewardCodesList';
import { isAppointmentBusiness } from '../../utils/businessType';
import * as customerService from '../../services/customerService';
import * as rewardsService from '../../services/rewardsService';
import { syncMarketingContact } from '../../services/emailApi';

const DESKTOP_BP = 768;

function YesNoToggle({ value, onChange, brandColor }) {
  return (
    <View style={styles.yesNoRow}>
      {[
        { label: 'Yes', val: true },
        { label: 'No', val: false },
      ].map(({ label, val }) => {
        const active = value === val;
        return (
          <TouchableOpacity
            key={label}
            style={[
              styles.yesNoBtn,
              active && { backgroundColor: brandColor, borderColor: brandColor },
            ]}
            onPress={() => onChange(val)}
            activeOpacity={0.85}
          >
            <Text style={[styles.yesNoText, active && styles.yesNoTextActive]}>
              {label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export default function ProfileScreen({ navigation }) {
  const { restaurant } = useRestaurantContext();
  const {
    user,
    customerProfile,
    refreshCustomerProfile,
    patchCustomerProfile,
    isCustomerAuthenticated,
  } = useAuth();
  const { theme } = useTheme();
  const { width } = useWindowDimensions();
  const isDesktop = width >= DESKTOP_BP;
  const brandColor = theme.colors.brand;

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [marketingOptIn, setMarketingOptIn] = useState(true);
  const [saving, setSaving] = useState(false);
  const [codes, setCodes] = useState([]);
  const [loadingCodes, setLoadingCodes] = useState(false);
  const [signInVisible, setSignInVisible] = useState(false);

  useEffect(() => {
    setFirstName(customerProfile?.first_name || '');
    setLastName(customerProfile?.last_name || '');
    setPhone(customerProfile?.phone || '');
    setMarketingOptIn(customerProfile?.marketing_opt_in !== false);
  }, [
    customerProfile?.id,
    customerProfile?.first_name,
    customerProfile?.last_name,
    customerProfile?.phone,
    customerProfile?.marketing_opt_in,
  ]);

  const loadCodes = useCallback(async () => {
    if (!restaurant?.id || !isCustomerAuthenticated) {
      setCodes([]);
      return;
    }
    setLoadingCodes(true);
    try {
      const data = await rewardsService.getMyRewardCodes(restaurant.id);
      setCodes(data);
    } catch {
      setCodes([]);
    } finally {
      setLoadingCodes(false);
    }
  }, [restaurant?.id, isCustomerAuthenticated]);

  useFocusEffect(
    useCallback(() => {
      if (!isCustomerAuthenticated) {
        setSignInVisible(true);
        return undefined;
      }
      if (restaurant?.id) {
        refreshCustomerProfile(restaurant.id);
        if (!isAppointmentBusiness(restaurant)) loadCodes();
      }
      return undefined;
    }, [isCustomerAuthenticated, restaurant?.id, refreshCustomerProfile, loadCodes]),
  );

  const handleSave = async () => {
    if (!customerProfile?.id) {
      Alert.alert('Error', 'No profile loaded. Please sign in again.');
      return;
    }
    const trimmedFirst = firstName.trim();
    const trimmedLast = lastName.trim();
    const trimmedPhone = phone.trim();
    if (!trimmedFirst) {
      Alert.alert('First name required', 'Please enter your first name.');
      return;
    }
    if (!trimmedPhone) {
      Alert.alert('Phone required', 'Please enter your phone number.');
      return;
    }

    const displayName = customerService.composeDisplayName(trimmedFirst, trimmedLast);
    const updates = {
      first_name: trimmedFirst,
      last_name: trimmedLast || null,
      phone: trimmedPhone,
      marketing_opt_in: marketingOptIn,
    };
    if (marketingOptIn && !customerProfile?.marketing_opt_in) {
      updates.marketing_opt_in_at = new Date().toISOString();
    }

    setSaving(true);
    try {
      const updated = await customerService.updateCustomerProfile(customerProfile.id, updates);
      patchCustomerProfile({
        first_name: updated.first_name,
        last_name: updated.last_name,
        phone: updated.phone,
        marketing_opt_in: updated.marketing_opt_in,
        marketing_opt_in_at: updated.marketing_opt_in_at,
      });

      const email = customerProfile?.email || user?.email;
      if (marketingOptIn && email && restaurant?.id) {
        syncMarketingContact({
          restaurantId: restaurant.id,
          email,
          fullName: displayName,
          phone: trimmedPhone,
          marketingOptIn: true,
        }).catch(() => {});
      }

      Alert.alert('Saved', 'Your profile was updated.');
    } catch (e) {
      Alert.alert('Error', e.message || 'Could not save profile.');
    } finally {
      setSaving(false);
    }
  };

  const email = customerProfile?.email || user?.email || '';

  const c = {
    background: '#fff',
    textPrimary: '#111',
    textSecondary: '#666',
    border: '#e3e8ee',
  };

  return (
    <View style={[styles.root, { backgroundColor: c.background }]}>
      <CustomerNavbar navigation={navigation} currentRoute="Profile" />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, isDesktop && styles.contentDesktop]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {!isCustomerAuthenticated ? (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: c.textPrimary }]}>Sign in required</Text>
            <Text style={{ color: c.textSecondary, marginBottom: 16, lineHeight: 20 }}>
              Sign in to view and edit your profile.
            </Text>
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: brandColor }]}
              onPress={() => setSignInVisible(true)}
            >
              <Text style={styles.primaryBtnText}>Sign in</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <View style={[styles.detailsSection, isDesktop && styles.detailsSectionDesktop]}>
              <View style={[styles.detailsLeft, isDesktop && styles.detailsLeftDesktop]}>
                <Text style={[styles.detailsHeading, { color: c.textPrimary }]}>Details</Text>
                <Text style={[styles.detailsSub, { color: c.textSecondary }]}>
                  Keep your contact info up to date for orders and rewards.
                </Text>
              </View>

              <View style={[styles.detailsRight, isDesktop && styles.detailsRightDesktop]}>
                <Text style={styles.label}>Email</Text>
                <View style={[styles.readOnly, { borderColor: c.border }]}>
                  <Text style={styles.readOnlyText}>{email || '—'}</Text>
                </View>

                <View style={[styles.nameRow, !isDesktop && styles.nameRowStack]}>
                  <View style={styles.nameField}>
                    <Text style={styles.label}>First name</Text>
                    <TextInput
                      style={[styles.input, { borderColor: c.border }]}
                      value={firstName}
                      onChangeText={setFirstName}
                      placeholder="First name"
                      placeholderTextColor="#999"
                      autoCapitalize="words"
                      autoComplete="given-name"
                      textContentType="givenName"
                    />
                  </View>
                  <View style={styles.nameField}>
                    <Text style={styles.label}>Last name</Text>
                    <TextInput
                      style={[styles.input, { borderColor: c.border }]}
                      value={lastName}
                      onChangeText={setLastName}
                      placeholder="Last name"
                      placeholderTextColor="#999"
                      autoCapitalize="words"
                      autoComplete="family-name"
                      textContentType="familyName"
                    />
                  </View>
                </View>

                <Text style={styles.label}>Phone</Text>
                <TextInput
                  style={[styles.input, { borderColor: c.border }]}
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="Phone number"
                  placeholderTextColor="#999"
                  keyboardType="phone-pad"
                  autoComplete="tel"
                  textContentType="telephoneNumber"
                />

                <Text style={styles.label}>Email me deals &amp; updates</Text>
                <YesNoToggle
                  value={marketingOptIn}
                  onChange={setMarketingOptIn}
                  brandColor={brandColor}
                />

                <TouchableOpacity
                  style={[styles.primaryBtn, { backgroundColor: brandColor }, saving && styles.btnDisabled]}
                  onPress={handleSave}
                  disabled={saving}
                  activeOpacity={0.85}
                >
                  {saving ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.primaryBtnText}>Save</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>

            {isAppointmentBusiness(restaurant) ? null : (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: c.textPrimary }]}>My reward codes</Text>
              <RewardCodesList
                codes={codes}
                loading={loadingCodes}
                brandColor={brandColor}
              />
            </View>
            )}
          </>
        )}
      </ScrollView>

      <CustomerSignInModal
        visible={signInVisible}
        onClose={async () => {
          setSignInVisible(false);
          if (restaurant?.id) {
            await refreshCustomerProfile(restaurant.id);
            loadCodes();
          }
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flex: 1 },
  content: { paddingBottom: 60 },
  contentDesktop: { maxWidth: 880, alignSelf: 'center', width: '100%' },

  detailsSection: {
    padding: 20,
    paddingTop: 28,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e8ecf0',
  },
  detailsSectionDesktop: {
    flexDirection: 'row',
    gap: 40,
    paddingHorizontal: 28,
    paddingVertical: 36,
  },
  detailsLeft: { marginBottom: 20 },
  detailsLeftDesktop: { flex: 0.38, marginBottom: 0, paddingTop: 4 },
  detailsRight: { flex: 1 },
  detailsRightDesktop: { flex: 0.62 },
  detailsHeading: { fontSize: 26, fontWeight: '800', marginBottom: 8 },
  detailsSub: { fontSize: 14, lineHeight: 21, maxWidth: 280 },

  section: { padding: 20 },
  sectionTitle: { fontSize: 18, fontWeight: '800', marginBottom: 14 },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: '#444',
    marginBottom: 6,
    marginTop: 4,
  },
  nameRow: { flexDirection: 'row', gap: 12 },
  nameRowStack: { flexDirection: 'column', gap: 0 },
  nameField: { flex: 1 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    fontSize: 15,
    color: '#111',
    backgroundColor: '#fafafa',
    marginBottom: 12,
  },
  readOnly: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    backgroundColor: '#f3f4f6',
    marginBottom: 16,
  },
  readOnlyText: { fontSize: 15, color: '#555' },

  yesNoRow: { flexDirection: 'row', gap: 10, marginBottom: 16, marginTop: 2 },
  yesNoBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e3e8ee',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#fafafa',
  },
  yesNoText: { fontSize: 14, fontWeight: '700', color: '#555' },
  yesNoTextActive: { color: '#fff' },

  primaryBtn: {
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  btnDisabled: { opacity: 0.6 },
});
