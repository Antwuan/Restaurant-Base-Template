import React, { useState, useEffect } from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRestaurantContext } from '../context/RestaurantContext';
import { useCartContext } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import CustomerSignInModal from './CustomerSignInModal';

export default function MenuHeaderActions({ onOpenCart }) {
  const { restaurant } = useRestaurantContext();
  const { itemCount } = useCartContext();
  const { user, customerProfile, refreshCustomerProfile } = useAuth();
  const [signInVisible, setSignInVisible] = useState(false);

  useEffect(() => {
    if (restaurant?.id) {
      refreshCustomerProfile(restaurant.id);
    }
  }, [user?.id, restaurant?.id, refreshCustomerProfile]);

  const accountLabel = user && customerProfile
    ? 'Account'
    : 'Sign in';

  return (
    <View style={styles.row}>
      <TouchableOpacity
        style={styles.signInBtn}
        onPress={() => setSignInVisible(true)}
      >
        <Text style={styles.signInText}>{accountLabel}</Text>
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
  signInBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  signInText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
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
});
