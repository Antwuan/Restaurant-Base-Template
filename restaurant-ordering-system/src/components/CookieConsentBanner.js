/**
 * CookieConsentBanner — first-visit notice pinned to the bottom of the app.
 *
 * Non-blocking: the wrapper is `box-none` so the page underneath stays
 * clickable. Web only, and only until a choice is recorded. Mounted as a
 * sibling of RootNavigator (see App.js), so it uses a plain location change
 * for the policy link rather than the navigator.
 */
import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useCookieConsent } from '../context/CookieConsentContext';
import { useRestaurantContext } from '../context/RestaurantContext';
import { useTheme } from '../theme';

const WIDE_BP = 900;

function goToPolicy() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  try {
    window.location.assign('/cookies');
  } catch {
    // popup / sandbox restrictions — the footer link still works
  }
}

export default function CookieConsentBanner() {
  const { bannerVisible, acceptAll, rejectNonEssential, openPreferences } =
    useCookieConsent();
  const { restaurant } = useRestaurantContext();
  const { theme } = useTheme();
  const { width } = useWindowDimensions();

  const anim = useRef(new Animated.Value(0)).current;
  const show = bannerVisible && Boolean(restaurant);

  useEffect(() => {
    if (!show) return;
    Animated.timing(anim, {
      toValue: 1,
      duration: 260,
      delay: 400,
      useNativeDriver: true,
    }).start();
  }, [show, anim]);

  if (!show) return null;

  const colors = theme.colors;
  const wide = width >= WIDE_BP;

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <Animated.View
        style={[
          styles.banner,
          wide && styles.bannerWide,
          {
            backgroundColor: colors.backgroundCard,
            borderColor: colors.border,
            opacity: anim,
            transform: [
              {
                translateY: anim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [24, 0],
                }),
              },
            ],
          },
        ]}
        accessibilityRole="alert"
      >
        <View style={styles.copy}>
          <View style={styles.headingRow}>
            <Ionicons name="shield-checkmark-outline" size={16} color={colors.brand} />
            <Text style={[styles.heading, { color: colors.textPrimary }]}>
              Your privacy
            </Text>
          </View>
          <Text style={[styles.body, { color: colors.textSecondary }]}>
            {restaurant?.name || 'This site'} stores a little information in your
            browser to keep you signed in, remember your cart and complete
            checkout safely. Optional storage is off until you say otherwise.{' '}
            <Text
              style={[styles.link, { color: colors.brand }]}
              onPress={goToPolicy}
              accessibilityRole="link"
            >
              Read the policy
            </Text>
          </Text>
        </View>

        <View style={[styles.actions, wide && styles.actionsWide]}>
          <TouchableOpacity
            style={[styles.ghostBtn, { borderColor: colors.border }]}
            onPress={openPreferences}
            activeOpacity={0.8}
            accessibilityRole="button"
          >
            <Text style={[styles.ghostBtnText, { color: colors.textSecondary }]}>
              Manage
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.ghostBtn, { borderColor: colors.border }]}
            onPress={rejectNonEssential}
            activeOpacity={0.8}
            accessibilityRole="button"
          >
            <Text style={[styles.ghostBtnText, { color: colors.textSecondary }]}>
              Reject non-essential
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: colors.brand }]}
            onPress={acceptAll}
            activeOpacity={0.85}
            accessibilityRole="button"
          >
            <Text style={styles.primaryBtnText}>Accept all</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: 12,
    alignItems: 'center',
    zIndex: 60,
    ...Platform.select({ android: { elevation: 60 } }),
  },
  banner: {
    width: '100%',
    maxWidth: 1040,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
    ...Platform.select({
      web: { boxShadow: '0 8px 32px rgba(0,0,0,0.18)' },
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.18,
        shadowRadius: 16,
      },
      android: { elevation: 12 },
    }),
  },
  bannerWide: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
  },
  copy: { flex: 1, minWidth: 0 },
  headingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  heading: { fontSize: 14, fontWeight: '800' },
  body: { fontSize: 12.5, lineHeight: 18 },
  link: {
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  actionsWide: { flexWrap: 'nowrap', flexShrink: 0 },
  ghostBtn: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  ghostBtnText: { fontSize: 12.5, fontWeight: '600' },
  primaryBtn: {
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  primaryBtnText: { color: '#fff', fontSize: 12.5, fontWeight: '700' },
});
