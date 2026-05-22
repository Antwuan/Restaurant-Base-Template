// =============================================================================
// FILE: src/components/MenuItem.js
// Phase 7: Customer app – individual menu item card
// =============================================================================

import React, { useRef } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Platform,
} from 'react-native';
import { useTheme } from '../theme';

const MenuItem = ({ item, onAddToCart }) => {
  const { theme } = useTheme();
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.96,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      friction: 4,
      useNativeDriver: true,
    }).start();
  };

  const isUnavailable = !item.is_available;

  return (
    <Animated.View style={[styles.wrapper, { transform: [{ scale: scaleAnim }] }]}>
      <TouchableOpacity
        activeOpacity={isUnavailable ? 1 : 0.9}
        onPressIn={!isUnavailable ? handlePressIn : undefined}
        onPressOut={!isUnavailable ? handlePressOut : undefined}
        onPress={!isUnavailable ? () => onAddToCart(item) : undefined}
        style={[
          styles.card,
          isUnavailable && styles.cardUnavailable,
        ]}
        accessibilityLabel={`${item.name}, $${Number(item.price ?? 0).toFixed(2)}${isUnavailable ? ', unavailable' : ''}`}
      >
        {/* Image */}
        <View style={styles.imageContainer}>
          {item.image_url ? (
            <Image
              source={{ uri: item.image_url }}
              style={[styles.image, isUnavailable && styles.imageUnavailable]}
              resizeMode="cover"
            />
          ) : (
            <View
              style={[
                styles.imagePlaceholder,
                { backgroundColor: theme.colors.backgroundSunken },
              ]}
            >
              <Text style={styles.imagePlaceholderText}>🍽</Text>
            </View>
          )}
          {isUnavailable && (
            <View style={styles.unavailableBadge}>
              <Text style={styles.unavailableBadgeText}>Unavailable</Text>
            </View>
          )}
        </View>

        {/* Info */}
        <View style={styles.info}>
          <Text
            style={[styles.name, isUnavailable && styles.textMuted]}
            numberOfLines={2}
          >
            {item.name}
          </Text>
          {item.description ? (
            <Text
              style={[styles.description, isUnavailable && styles.textMuted]}
              numberOfLines={2}
            >
              {item.description}
            </Text>
          ) : null}

          <View style={styles.footer}>
            <Text style={[styles.price, isUnavailable && styles.textMuted]}>
              ${Number(item.price ?? 0).toFixed(2)}
            </Text>
            {!isUnavailable && (
              <TouchableOpacity
                style={[
                  styles.addButton,
                  { backgroundColor: theme.colors.brand },
                ]}
                onPress={() => onAddToCart(item)}
                accessibilityLabel={`Add ${item.name} to cart`}
              >
                <Text style={styles.addButtonText}>+ Add</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    marginHorizontal: 16,
    marginVertical: 6,
  },
  card: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
      },
      android: { elevation: 3 },
      web: { boxShadow: '0 2px 8px rgba(0,0,0,0.08)' },
    }),
  },
  cardUnavailable: {
    opacity: 0.55,
  },
  imageContainer: {
    width: 100,
    height: 100,
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  imageUnavailable: {
    opacity: 0.5,
  },
  imagePlaceholder: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imagePlaceholderText: {
    fontSize: 32,
  },
  unavailableBadge: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  unavailableBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
  },
  info: {
    flex: 1,
    padding: 12,
    justifyContent: 'space-between',
  },
  name: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  description: {
    fontSize: 13,
    color: '#666',
    lineHeight: 18,
    flex: 1,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  price: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  addButton: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  textMuted: {
    color: '#aaa',
  },
});

export default MenuItem;

