import React, { useRef, useState, useEffect } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  Animated,
  StyleSheet,
  Platform,
  AccessibilityInfo,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme';
import { itemRequiresCustomization } from '../utils/menuCustomization';

/**
 * Menu card layout:
 * - Bordered, rounded card with the image flush to the right edge.
 * - Left column: name, price, and description.
 * - Right column: full-height image with a white, rounded action button
 *   floating over the bottom-right corner (add or customize).
 * - Hover: card lifts (web shadow + translateY). Image subtly zooms.
 * - Press action: quick-add when no required modifiers; otherwise open customize.
 *   Spring pop only on successful quick-add.
 */
const CARD_HEIGHT_DEFAULT = 150;
const CARD_HEIGHT_CATERING = 180;
const MEDIA_WIDTH = '42%';

const MenuItem = ({ item, onAddToCart, onItemPress, variant = 'default' }) => {
  const { theme } = useTheme();
  const c = theme.colors;
  const isUnavailable = !item.is_available;
  const cardHeight = variant === 'catering' ? CARD_HEIGHT_CATERING : CARD_HEIGHT_DEFAULT;

  // Card hover / lift animation (web only)
  const cardShadowY = useRef(new Animated.Value(0)).current;
  const imageScale = useRef(new Animated.Value(1)).current;
  const [hovered, setHovered] = useState(false);

  // "+" → check feedback (fade, brand colors)
  const iconOpacity = useRef(new Animated.Value(1)).current;
  const [showAddedCheck, setShowAddedCheck] = useState(false);
  const addedResetTimer = useRef(null);

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

  const playAddedCheck = () => {
    clearTimeout(addedResetTimer.current);
    Animated.timing(iconOpacity, {
      toValue: 0,
      duration: 120,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished) return;
      setShowAddedCheck(true);
      Animated.timing(iconOpacity, {
        toValue: 1,
        duration: 140,
        useNativeDriver: true,
      }).start();
    });

    addedResetTimer.current = setTimeout(() => {
      Animated.timing(iconOpacity, {
        toValue: 0,
        duration: 120,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (!finished) return;
        setShowAddedCheck(false);
        Animated.timing(iconOpacity, {
          toValue: 1,
          duration: 140,
          useNativeDriver: true,
        }).start();
      });
    }, 900);
  };

  useEffect(() => () => clearTimeout(addedResetTimer.current), []);

  const handlePress = () => {
    if (isUnavailable) return;
    if (onItemPress) onItemPress(item);
    else if (onAddToCart) onAddToCart(item);
  };

  const handleAddPress = (e) => {
    if (e?.stopPropagation) e.stopPropagation();
    if (isUnavailable) return;

    // Required customizations must go through the modal — never bypass via "+".
    if (itemRequiresCustomization(item)) {
      if (onItemPress) onItemPress(item);
      else if (onAddToCart) onAddToCart(item);
      return;
    }

    playAddedCheck();
    if (onAddToCart) {
      onAddToCart(item);
      AccessibilityInfo.announceForAccessibility?.(`${item.name} added to cart`);
    } else if (onItemPress) onItemPress(item);
  };

  const needsCustomize = itemRequiresCustomization(item);

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
        style={[
          styles.card,
          {
            minHeight: cardHeight,
            borderColor: c.border,
            backgroundColor: c.backgroundCard || '#fff',
          },
          isUnavailable && styles.cardUnavailable,
        ]}
        accessibilityLabel={`${item.name}, $${Number(item.price ?? 0).toFixed(2)}${
          isUnavailable ? ', unavailable' : needsCustomize ? ', options available' : ''
        }`}
        accessibilityHint={
          isUnavailable
            ? undefined
            : needsCustomize
              ? 'Opens customization options'
              : 'Opens item details'
        }
        {...webHoverProps}
      >
        {/* Left: text info */}
        <View style={styles.info}>
          <Text
            style={[styles.name, { color: c.textPrimary }, isUnavailable && styles.textMuted]}
            numberOfLines={2}
          >
            {item.name}
          </Text>
          <Text
            style={[styles.price, { color: c.textPrimary }, isUnavailable && styles.textMuted]}
          >
            ${Number(item.price ?? 0).toFixed(2)}
          </Text>
          {item.description ? (
            <Text
              style={[
                styles.description,
                { color: c.textSecondary },
                isUnavailable && styles.textMuted,
              ]}
              numberOfLines={variant === 'catering' ? 4 : 3}
            >
              {item.description}
            </Text>
          ) : null}
          {isUnavailable && (
            <View style={[styles.unavailablePill, { backgroundColor: c.backgroundSunken }]}>
              <Text style={[styles.unavailablePillText, { color: c.textSecondary }]}>
                Unavailable
              </Text>
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
                  { minHeight: cardHeight, backgroundColor: c.backgroundSunken },
                  isUnavailable && styles.imageUnavailable,
                  { transform: [{ scale: imageScale }] },
                ]}
                resizeMode="cover"
                accessibilityIgnoresInvertColors
              />
            ) : (
              <View
                style={[
                  styles.image,
                  { minHeight: cardHeight, backgroundColor: c.backgroundSunken },
                  styles.imagePlaceholder,
                ]}
              >
                <Ionicons name="restaurant-outline" size={28} color={c.textDisabled} />
              </View>
            )}
          </View>

          {!isUnavailable && (
            <View
              style={[
                styles.addButton,
                showAddedCheck && {
                  backgroundColor: c.brand,
                  borderColor: c.brand,
                },
              ]}
            >
              <TouchableOpacity
                onPress={handleAddPress}
                accessibilityLabel={
                  needsCustomize
                    ? `Choose options for ${item.name}`
                    : `Add ${item.name} to cart`
                }
                accessibilityHint={
                  needsCustomize
                    ? 'Opens the item so you can pick required options'
                    : 'Adds this item to your cart'
                }
                accessibilityRole="button"
                activeOpacity={0.8}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                style={styles.addButtonHit}
              >
                <Animated.View style={{ opacity: iconOpacity }}>
                  <Ionicons
                    name={
                      showAddedCheck
                        ? 'checkmark'
                        : needsCustomize
                          ? 'options-outline'
                          : 'add'
                    }
                    size={needsCustomize && !showAddedCheck ? 18 : 22}
                    color={showAddedCheck ? (c.brandText || '#fff') : c.textPrimary}
                  />
                </Animated.View>
              </TouchableOpacity>
            </View>
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
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
    ...Platform.select({
      web: { boxShadow: '0 2px 8px rgba(0,0,0,0.22)' },
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.22, shadowRadius: 5 },
      android: { elevation: 4 },
    }),
  },
  addButtonHit: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  textMuted: {
    color: '#aaa',
  },
});

export default MenuItem;
