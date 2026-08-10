import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  Animated,
  StyleSheet,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme';

/**
 * Menu card layout:
 * - Bordered, rounded card with the image flush to the right edge.
 * - Left column: name, price, and a brand-colored description.
 * - Right column: full-height image with a white, rounded "+" button
 *   floating over the bottom-right corner.
 * - Hover: card lifts (web shadow + translateY). Image subtly zooms.
 * - Press "+": spring pop + brief success pulse on the button.
 */
const CARD_HEIGHT_DEFAULT = 150;
const CARD_HEIGHT_CATERING = 180;
const MEDIA_WIDTH = '42%';

const MenuItem = ({ item, onAddToCart, onItemPress, index = 0, variant = 'default' }) => {
  const { theme } = useTheme();
  const isUnavailable = !item.is_available;
  const cardHeight = variant === 'catering' ? CARD_HEIGHT_CATERING : CARD_HEIGHT_DEFAULT;

  // Card hover / lift animation (web only)
  const cardShadowY = useRef(new Animated.Value(0)).current;
  const imageScale = useRef(new Animated.Value(1)).current;
  const [hovered, setHovered] = useState(false);

  // "+" button press pop
  const addBtnScale = useRef(new Animated.Value(1)).current;

  const animateHoverIn = () => {
    setHovered(true);
    Animated.parallel([
      Animated.spring(cardShadowY, { toValue: 1, useNativeDriver: true, tension: 200, friction: 18 }),
      Animated.spring(imageScale, { toValue: 1.05, useNativeDriver: true, tension: 200, friction: 18 }),
    ]).start();
  };

  const animateHoverOut = () => {
    setHovered(false);
    Animated.parallel([
      Animated.spring(cardShadowY, { toValue: 0, useNativeDriver: true, tension: 200, friction: 18 }),
      Animated.spring(imageScale, { toValue: 1, useNativeDriver: true, tension: 200, friction: 18 }),
    ]).start();
  };

  const popAddButton = () => {
    Animated.sequence([
      Animated.spring(addBtnScale, {
        toValue: 1.35,
        useNativeDriver: true,
        tension: 400,
        friction: 8,
      }),
      Animated.spring(addBtnScale, {
        toValue: 1,
        useNativeDriver: true,
        tension: 300,
        friction: 12,
      }),
    ]).start();
  };

  const handlePress = () => {
    if (isUnavailable) return;
    if (onItemPress) onItemPress(item);
    else if (onAddToCart) onAddToCart(item);
  };

  const handleAddPress = (e) => {
    if (e?.stopPropagation) e.stopPropagation();
    if (isUnavailable) return;
    popAddButton();
    if (onAddToCart) onAddToCart(item);
    else if (onItemPress) onItemPress(item);
  };

  const cardTranslateY = cardShadowY.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -3],
  });

  const webHoverProps =
    Platform.OS === 'web' && !isUnavailable
      ? {
          onMouseEnter: animateHoverIn,
          onMouseLeave: animateHoverOut,
        }
      : {};

  const hoveredBoxShadow =
    Platform.OS === 'web'
      ? hovered
        ? '0 8px 24px rgba(0,0,0,0.14)'
        : '0 1px 4px rgba(0,0,0,0.06)'
      : undefined;

  return (
    <Animated.View
      style={[
        styles.cardWrap,
        { transform: [{ translateY: cardTranslateY }] },
        Platform.OS === 'web' && { boxShadow: hoveredBoxShadow },
      ]}
    >
      <TouchableOpacity
        activeOpacity={isUnavailable ? 1 : 0.88}
        onPress={handlePress}
        style={[styles.card, { minHeight: cardHeight }, isUnavailable && styles.cardUnavailable]}
        accessibilityLabel={`${item.name}, $${Number(item.price ?? 0).toFixed(2)}${isUnavailable ? ', unavailable' : ''}`}
        {...webHoverProps}
      >
        {/* Left: text info */}
        <View style={styles.info}>
          <Text style={[styles.name, isUnavailable && styles.textMuted]} numberOfLines={2}>
            {item.name}
          </Text>
          <Text style={[styles.price, isUnavailable && styles.textMuted]}>
            ${Number(item.price ?? 0).toFixed(2)}
          </Text>
          {item.description ? (
            <Text
              style={[styles.description, { color: theme.colors.brand }, isUnavailable && styles.textMuted]}
              numberOfLines={variant === 'catering' ? 4 : 3}
            >
              {item.description}
            </Text>
          ) : null}
          {isUnavailable && (
            <View style={styles.unavailablePill}>
              <Text style={styles.unavailablePillText}>Unavailable</Text>
            </View>
          )}
        </View>

        {/* Right: full-height image with floating add button */}
        <View style={styles.media}>
          <View style={[styles.imageClip, { minHeight: cardHeight }]}>
            {item.image_url ? (
              <Animated.Image
                source={{ uri: item.image_url }}
                style={[
                  styles.image,
                  { minHeight: cardHeight },
                  isUnavailable && styles.imageUnavailable,
                  { transform: [{ scale: imageScale }] },
                ]}
                resizeMode="cover"
              />
            ) : (
              <View style={[styles.image, { minHeight: cardHeight }, styles.imagePlaceholder]}>
                <Ionicons name="restaurant-outline" size={28} color="#cbd5e1" />
              </View>
            )}
          </View>

          {!isUnavailable && (
            <Animated.View style={[styles.addButton, { transform: [{ scale: addBtnScale }] }]}>
              <TouchableOpacity
                onPress={handleAddPress}
                accessibilityLabel={`Add ${item.name} to cart`}
                activeOpacity={0.8}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              >
                <Ionicons name="add" size={22} color="#1a1a1a" />
              </TouchableOpacity>
            </Animated.View>
          )}
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  cardWrap: {
    borderRadius: 16,
    // Base shadow (overridden on web via boxShadow)
    ...Platform.select({
      web: { boxShadow: '0 1px 4px rgba(0,0,0,0.06)', transition: 'box-shadow 0.2s ease' },
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4 },
      android: { elevation: 1 },
    }),
  },
  card: {
    flexDirection: 'row',
    alignItems: 'stretch',
    minHeight: CARD_HEIGHT_DEFAULT,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#ececec',
    backgroundColor: '#fff',
    overflow: 'hidden',
  },
  cardUnavailable: {
    opacity: 0.6,
  },
  info: {
    flex: 1,
    paddingVertical: 18,
    paddingHorizontal: 18,
    justifyContent: 'flex-start',
  },
  name: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111',
    lineHeight: 22,
  },
  price: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111',
    marginTop: 2,
  },
  description: {
    fontSize: 13,
    lineHeight: 19,
    marginTop: 10,
    fontWeight: '500',
  },
  unavailablePill: {
    alignSelf: 'flex-start',
    backgroundColor: '#f3f4f6',
    borderRadius: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
    marginTop: 8,
  },
  unavailablePillText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#888',
  },
  media: {
    width: MEDIA_WIDTH,
    maxWidth: 220,
    position: 'relative',
  },
  imageClip: {
    width: '100%',
    height: '100%',
    minHeight: CARD_HEIGHT_DEFAULT,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
    minHeight: CARD_HEIGHT_DEFAULT,
    backgroundColor: '#f3f4f6',
  },
  imageUnavailable: {
    opacity: 0.5,
  },
  imagePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButton: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    ...Platform.select({
      web: { boxShadow: '0 2px 8px rgba(0,0,0,0.22)' },
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.22, shadowRadius: 5 },
      android: { elevation: 4 },
    }),
  },
  textMuted: {
    color: '#aaa',
  },
});

export default MenuItem;
