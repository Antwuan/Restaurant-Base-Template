// =============================================================================
// FILE: src/components/RestaurantHeader.js
// Phase 7: Customer app – restaurant brand header
// =============================================================================

import React from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  Linking,
  Platform,
} from 'react-native';
import { useTheme } from '../theme';

/**
 * Reads restaurant data from the ThemeProvider context,
 * or accepts an explicit `restaurant` prop as override.
 */
const RestaurantHeader = ({ restaurant: restaurantProp }) => {
  const { theme, restaurant: themeRestaurant } = useTheme();
  const restaurant = restaurantProp || themeRestaurant;

  if (!restaurant) return null;

  const handleCallPress = () => {
    if (restaurant.phone) {
      Linking.openURL(`tel:${restaurant.phone}`);
    }
  };

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: theme.colors.brand },
      ]}
    >
      <View className="inner" style={styles.inner}>
        {/* Logo */}
        {restaurant.logo_url ? (
          <Image
            source={{ uri: restaurant.logo_url }}
            style={styles.logo}
            resizeMode="contain"
            accessibilityLabel={`${restaurant.name} logo`}
          />
        ) : (
          <View style={styles.logoPlaceholder}>
            <Text style={styles.logoInitial}>
              {restaurant.name?.charAt(0).toUpperCase()}
            </Text>
          </View>
        )}

        {/* Text info */}
        <View style={styles.textBlock}>
          <Text style={styles.name} numberOfLines={1}>
            {restaurant.name}
          </Text>
          {restaurant.address ? (
            <Text style={styles.address} numberOfLines={1}>
              📍 {restaurant.address}
            </Text>
          ) : null}
          {restaurant.phone ? (
            <TouchableOpacity onPress={handleCallPress} accessibilityRole="button">
              <Text style={styles.phone}>
                📞 {restaurant.phone}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {/* Closed / not accepting orders banner */}
      {!restaurant.is_accepting_orders && (
        <View style={styles.closedBanner}>
          <Text style={styles.closedText}>
            ⚠️ Currently not accepting orders
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingTop: Platform.OS === 'ios' ? 0 : 8,
    paddingBottom: 12,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  logo: {
    width: 56,
    height: 56,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginRight: 12,
  },
  logoPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.25)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  logoInitial: {
    fontSize: 28,
    fontWeight: '800',
    color: '#fff',
  },
  textBlock: {
    flex: 1,
  },
  name: {
    fontSize: 20,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 2,
  },
  address: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
    marginBottom: 2,
  },
  phone: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.9)',
    fontWeight: '500',
    textDecorationLine: 'underline',
  },
  closedBanner: {
    backgroundColor: 'rgba(0,0,0,0.25)',
    marginTop: 10,
    paddingVertical: 6,
    paddingHorizontal: 16,
  },
  closedText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
});

export default RestaurantHeader;

