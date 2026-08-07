import React, { useState, useEffect } from 'react';
import {
  View,
  TouchableOpacity,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useRestaurantContext } from '../context/RestaurantContext';
import { useCartContext } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import CustomerSignInModal from './CustomerSignInModal';

const ACCOUNT_MENU = [
  { label: 'Profile', route: 'Profile', icon: 'person-outline' },
  { label: 'Rewards', route: 'Rewards', icon: 'gift-outline' },
  { label: 'Orders', route: 'OrderTracker', icon: 'receipt-outline' },
];

export default function MenuHeaderActions({ onOpenCart }) {
  const navigation = useNavigation();
  const { restaurant } = useRestaurantContext();
  const { itemCount } = useCartContext();
  const {
    customerProfile,
    refreshCustomerProfile,
    isCustomerAuthenticated,
    signOut,
  } = useAuth();
  const [signInVisible, setSignInVisible] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    if (isCustomerAuthenticated && restaurant?.id) {
      refreshCustomerProfile(restaurant.id);
    }
  }, [isCustomerAuthenticated, restaurant?.id, refreshCustomerProfile]);

  const isSignedIn = isCustomerAuthenticated;
  const points = customerProfile?.points_balance ?? 0;

  const handleAccountPress = () => {
    if (isSignedIn) {
      setAccountMenuOpen((open) => !open);
      return;
    }
    setSignInVisible(true);
  };

  const handleNav = (route) => {
    setAccountMenuOpen(false);
    navigation.navigate(route);
  };

  const handleLogOut = async () => {
    setSigningOut(true);
    try {
      setAccountMenuOpen(false);
      await signOut();
      navigation.navigate('Home');
    } catch {
      // ignore
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <View style={styles.row}>
      <TouchableOpacity
        style={[styles.pointsPill, isSignedIn && styles.pointsPillActive]}
        onPress={handleAccountPress}
        accessibilityLabel={isSignedIn ? `${points} points, open account menu` : 'Sign in'}
        activeOpacity={0.75}
      >
        <Ionicons
          name={isSignedIn ? 'gift' : 'person-outline'}
          size={16}
          color="#fff"
          style={{ marginRight: 4 }}
        />
        <Text style={styles.pointsPillText}>
          {isSignedIn ? `${points} pts` : 'Sign in'}
        </Text>
        {isSignedIn ? (
          <Ionicons
            name={accountMenuOpen ? 'chevron-up' : 'chevron-down'}
            size={14}
            color="#fff"
            style={{ marginLeft: 3 }}
          />
        ) : null}
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.cartBtn}
        onPress={onOpenCart}
        accessibilityLabel="Open cart"
      >
        <Ionicons name="cart-outline" size={24} color="#fff" />
        {itemCount > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>
              {itemCount > 99 ? '99+' : itemCount}
            </Text>
          </View>
        )}
      </TouchableOpacity>

      {accountMenuOpen && isSignedIn ? (
        <Modal
          visible
          transparent
          animationType="fade"
          onRequestClose={() => setAccountMenuOpen(false)}
        >
          <Pressable style={styles.dropdownBackdrop} onPress={() => setAccountMenuOpen(false)}>
            <View style={styles.dropdownAnchor}>
              <Pressable style={styles.dropdown} onPress={(e) => e.stopPropagation?.()}>
                {ACCOUNT_MENU.map((item) => (
                  <TouchableOpacity
                    key={item.route}
                    style={styles.dropdownItem}
                    onPress={() => handleNav(item.route)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name={item.icon} size={18} color="#333" style={{ marginRight: 10 }} />
                    <Text style={styles.dropdownItemText}>{item.label}</Text>
                  </TouchableOpacity>
                ))}
                <View style={styles.dropdownDivider} />
                <TouchableOpacity
                  style={styles.dropdownItem}
                  onPress={handleLogOut}
                  disabled={signingOut}
                  activeOpacity={0.7}
                >
                  <Ionicons name="log-out-outline" size={18} color="#c0392b" style={{ marginRight: 10 }} />
                  <Text style={[styles.dropdownItemText, { color: '#c0392b' }]}>
                    {signingOut ? 'Signing out…' : 'Log out'}
                  </Text>
                </TouchableOpacity>
              </Pressable>
            </View>
          </Pressable>
        </Modal>
      ) : null}

      <CustomerSignInModal
        visible={signInVisible}
        onClose={() => setSignInVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 8,
    gap: 4,
  },
  pointsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  pointsPillActive: {
    borderColor: 'rgba(255,255,255,0.85)',
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  pointsPillText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  cartBtn: {
    padding: 8,
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: 2,
    right: 2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#FF3B30',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  dropdownBackdrop: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  dropdownAnchor: {
    position: 'absolute',
    top: 56,
    right: 48,
  },
  dropdown: {
    minWidth: 200,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 6,
    ...Platform.select({
      web: { boxShadow: '0 8px 28px rgba(0,0,0,0.18)' },
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.18,
        shadowRadius: 12,
      },
      android: { elevation: 8 },
    }),
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  dropdownItemText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#222',
  },
  dropdownDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#e5e5e5',
    marginVertical: 4,
  },
});
