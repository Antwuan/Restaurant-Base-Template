// Admin settings screen. Lets staff edit restaurant contact info, toggle
// accepting orders, switch dark theme, contact support, and sign out.
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Switch,
  ScrollView,
  Alert,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { useRestaurantContext } from '../../context/RestaurantContext';
import { useTheme } from '../../theme';
import * as restaurantService from '../../services/restaurantService';
import { confirmAsync } from '../../utils/confirm';

export default function SettingsScreen() {
  const { signOut } = useAuth();
  const { restaurant, refreshRestaurant } = useRestaurantContext();
  const { theme, isDarkMode, setDarkMode } = useTheme();

  const [phone, setPhone] = useState(restaurant?.phone ?? '');
  const [address, setAddress] = useState(restaurant?.address ?? '');
  const [acceptingOrders, setAcceptingOrders] = useState(
    restaurant?.is_accepting_orders ?? true,
  );
  const [saving, setSaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const handleSave = async () => {
    if (!restaurant?.id) return;

    setSaving(true);
    try {
      await restaurantService.updateRestaurant(restaurant.id, {
        phone,
        address,
        is_accepting_orders: acceptingOrders,
      });
      await refreshRestaurant();
      Alert.alert('Saved', 'Restaurant settings updated successfully.');
    } catch (e) {
      Alert.alert('Error', 'Could not save settings. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleSignOut = async () => {
    const confirmed = await confirmAsync({
      title: 'Sign Out',
      message: 'Are you sure you want to sign out?',
      confirmText: 'Sign Out',
    });
    if (!confirmed) return;

    setSigningOut(true);
    try {
      await signOut();
    } catch (e) {
      Alert.alert('Error', 'Could not sign out.');
      setSigningOut(false);
    }
  };

  const handleContactSupport = () => {
    Linking.openURL('mailto:support@yourdomain.com');
  };

  const c = theme.colors;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: c.background }]}
      contentContainerStyle={styles.content}
    >
      {/* Restaurant Info */}
      <View style={[styles.section, { backgroundColor: c.backgroundCard, borderColor: c.border }]}>
        <Text style={[styles.sectionTitle, { color: c.textSecondary }]}>Restaurant Info</Text>

        <View style={styles.field}>
          <Text style={[styles.label, { color: c.textSecondary }]}>Phone Number</Text>
          <TextInput
            style={[
              styles.input,
              {
                color: c.textPrimary,
                backgroundColor: c.backgroundSunken,
                borderColor: c.border,
              },
            ]}
            value={phone}
            onChangeText={setPhone}
            placeholder="(555) 000-0000"
            placeholderTextColor={c.textDisabled}
            keyboardType="phone-pad"
          />
        </View>

        <View style={styles.field}>
          <Text style={[styles.label, { color: c.textSecondary }]}>Address</Text>
          <TextInput
            style={[
              styles.input,
              styles.inputMultiline,
              {
                color: c.textPrimary,
                backgroundColor: c.backgroundSunken,
                borderColor: c.border,
              },
            ]}
            value={address}
            onChangeText={setAddress}
            placeholder="123 Main St, City, State"
            placeholderTextColor={c.textDisabled}
            multiline
            numberOfLines={2}
          />
        </View>

        <TouchableOpacity
          style={[styles.saveBtn, { backgroundColor: c.brand }, saving && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.saveBtnText}>Save Changes</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Appearance */}
      <View style={[styles.section, { backgroundColor: c.backgroundCard, borderColor: c.border }]}>
        <Text style={[styles.sectionTitle, { color: c.textSecondary }]}>Appearance</Text>

        <View style={styles.row}>
          <View>
            <Text style={[styles.rowLabel, { color: c.textPrimary }]}>Dark Theme</Text>
            <Text style={[styles.rowSub, { color: c.textSecondary }]}>
              {isDarkMode ? 'Dark mode is on' : 'Light mode is on'}
            </Text>
          </View>
          <Switch
            value={isDarkMode}
            onValueChange={setDarkMode}
            trackColor={{ true: c.brand, false: '#ccc' }}
          />
        </View>
      </View>

      {/* Order Settings */}
      <View style={[styles.section, { backgroundColor: c.backgroundCard, borderColor: c.border }]}>
        <Text style={[styles.sectionTitle, { color: c.textSecondary }]}>Order Settings</Text>

        <View style={styles.row}>
          <View>
            <Text style={[styles.rowLabel, { color: c.textPrimary }]}>Accepting Orders</Text>
            <Text style={[styles.rowSub, { color: c.textSecondary }]}>
              {acceptingOrders
                ? 'Customers can place orders'
                : 'Orders are paused'}
            </Text>
          </View>
          <Switch
            value={acceptingOrders}
            onValueChange={setAcceptingOrders}
            trackColor={{ true: '#34C759', false: '#ccc' }}
          />
        </View>
      </View>

      {/* Account */}
      <View style={[styles.section, { backgroundColor: c.backgroundCard, borderColor: c.border }]}>
        <Text style={[styles.sectionTitle, { color: c.textSecondary }]}>Account</Text>

        <TouchableOpacity style={styles.linkRow} onPress={handleContactSupport}>
          <Text style={[styles.linkText, { color: c.brand }]}>Contact Support</Text>
          <Text style={[styles.chevron, { color: c.textDisabled }]}>›</Text>
        </TouchableOpacity>

        <View style={[styles.divider, { backgroundColor: c.border }]} />

        <TouchableOpacity
          style={[styles.signOutBtn, signingOut && { opacity: 0.6 }]}
          onPress={handleSignOut}
          disabled={signingOut}
        >
          {signingOut ? (
            <ActivityIndicator color="#FF3B30" />
          ) : (
            <Text style={styles.signOutText}>Sign Out</Text>
          )}
        </TouchableOpacity>
      </View>

      <Text style={[styles.version, { color: c.textDisabled }]}>
        v1.0.0 — {restaurant?.name}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 60,
  },
  section: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 14,
  },
  field: {
    marginBottom: 14,
  },
  label: {
    fontSize: 13,
    marginBottom: 6,
    fontWeight: '500',
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
  },
  inputMultiline: {
    height: 64,
    textAlignVertical: 'top',
  },
  saveBtn: {
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  saveBtnDisabled: {
    opacity: 0.55,
  },
  saveBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  rowLabel: {
    fontSize: 15,
    fontWeight: '500',
  },
  rowSub: {
    fontSize: 12,
    marginTop: 2,
  },
  linkRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  linkText: {
    fontSize: 15,
  },
  chevron: {
    fontSize: 20,
  },
  divider: {
    height: 1,
    marginVertical: 4,
  },
  signOutBtn: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  signOutText: {
    color: '#FF3B30',
    fontSize: 15,
    fontWeight: '600',
  },
  version: {
    textAlign: 'center',
    fontSize: 12,
    marginTop: 8,
  },
});
