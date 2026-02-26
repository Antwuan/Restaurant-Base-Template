// Admin settings screen. Lets staff edit restaurant contact info, toggle
// accepting orders, contact support, and securely sign out via AuthContext.
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
import * as restaurantService from '../../services/restaurantService';

export default function SettingsScreen() {
  const { signOut } = useAuth();
  const { restaurant, refreshRestaurant } = useRestaurantContext();

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

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          setSigningOut(true);
          try {
            await signOut();
          } catch (e) {
            Alert.alert('Error', 'Could not sign out.');
            setSigningOut(false);
          }
        },
      },
    ]);
  };

  const handleContactSupport = () => {
    Linking.openURL('mailto:support@yourdomain.com');
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Restaurant Info */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Restaurant Info</Text>

        <View style={styles.field}>
          <Text style={styles.label}>Phone Number</Text>
          <TextInput
            style={styles.input}
            value={phone}
            onChangeText={setPhone}
            placeholder="(555) 000-0000"
            keyboardType="phone-pad"
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Address</Text>
          <TextInput
            style={[styles.input, styles.inputMultiline]}
            value={address}
            onChangeText={setAddress}
            placeholder="123 Main St, City, State"
            multiline
            numberOfLines={2}
          />
        </View>

        <TouchableOpacity
          style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
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

      {/* Order Settings */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Order Settings</Text>

        <View style={styles.row}>
          <View>
            <Text style={styles.rowLabel}>Accepting Orders</Text>
            <Text style={styles.rowSub}>
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
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account</Text>

        <TouchableOpacity style={styles.linkRow} onPress={handleContactSupport}>
          <Text style={styles.linkText}>Contact Support</Text>
          <Text style={styles.chevron}>›</Text>
        </TouchableOpacity>

        <View style={styles.divider} />

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

      <Text style={styles.version}>v1.0.0 — {restaurant?.name}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  content: {
    padding: 16,
    paddingBottom: 60,
  },
  section: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#999',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 14,
  },
  field: {
    marginBottom: 14,
  },
  label: {
    fontSize: 13,
    color: '#666',
    marginBottom: 6,
    fontWeight: '500',
  },
  input: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    color: '#111',
    backgroundColor: '#fafafa',
  },
  inputMultiline: {
    height: 64,
    textAlignVertical: 'top',
  },
  saveBtn: {
    backgroundColor: '#007AFF',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  saveBtnDisabled: {
    backgroundColor: '#a0c4ff',
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
    color: '#111',
    fontWeight: '500',
  },
  rowSub: {
    fontSize: 12,
    color: '#999',
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
    color: '#007AFF',
  },
  chevron: {
    fontSize: 20,
    color: '#ccc',
  },
  divider: {
    height: 1,
    backgroundColor: '#f0f0f0',
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
    color: '#ccc',
    marginTop: 8,
  },
});

