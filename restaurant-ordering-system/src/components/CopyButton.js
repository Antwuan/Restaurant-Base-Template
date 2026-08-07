import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as promoService from '../services/promoService';

/**
 * Reactive copy control (Modern UI CopyButton pattern):
 * square button, press scale, crossfade between copy / check icons.
 *
 * @param {{
 *   value: string,
 *   brandColor?: string,
 *   size?: number,
 *   delay?: number,
 *   style?: object,
 *   accessibilityLabel?: string,
 * }} props
 */
export default function CopyButton({
  value,
  brandColor = '#007AFF',
  size = 18,
  delay = 2000,
  style,
  accessibilityLabel,
}) {
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const timerRef = useRef(null);

  const pressScale = useRef(new Animated.Value(1)).current;
  const fade = useRef(new Animated.Value(0)).current; // 0 = copy, 1 = check
  const iconPop = useRef(new Animated.Value(1)).current;

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, {
        toValue: copied ? 1 : 0,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.timing(iconPop, {
          toValue: 0.72,
          duration: 90,
          useNativeDriver: true,
        }),
        Animated.spring(iconPop, {
          toValue: 1,
          friction: 5,
          tension: 220,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, [copied, fade, iconPop]);

  const animatePressIn = () => {
    Animated.spring(pressScale, {
      toValue: 0.9,
      useNativeDriver: true,
      speed: 50,
      bounciness: 0,
    }).start();
  };

  const animatePressOut = () => {
    Animated.spring(pressScale, {
      toValue: 1,
      useNativeDriver: true,
      friction: 5,
      tension: 200,
    }).start();
  };

  const handleCopy = async () => {
    const text = String(value || '');
    if (!text || busy || copied) return;

    setBusy(true);
    try {
      await promoService.copyTextToClipboard(text);
      setCopied(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), delay);
    } catch {
      Alert.alert('Copy failed', 'Could not copy. Please select the text manually.');
    } finally {
      setBusy(false);
    }
  };

  const copyOpacity = fade.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0],
  });
  const checkOpacity = fade;

  return (
    <Pressable
      onPress={handleCopy}
      onPressIn={animatePressIn}
      onPressOut={animatePressOut}
      disabled={busy}
      accessibilityLabel={
        accessibilityLabel
        || (copied ? 'Copied' : `Copy ${textPreview(value)}`)
      }
      accessibilityRole="button"
      accessibilityState={{ busy, selected: copied }}
    >
      <Animated.View
        style={[
          styles.btn,
          {
            borderColor: copied ? '#16a34a' : brandColor,
            backgroundColor: copied ? 'rgba(22,163,74,0.10)' : 'transparent',
            transform: [{ scale: pressScale }],
          },
          style,
        ]}
      >
        {busy ? (
          <ActivityIndicator size="small" color={brandColor} />
        ) : (
          <View style={styles.iconStack}>
            <Animated.View
              style={[
                styles.iconLayer,
                {
                  opacity: copyOpacity,
                  transform: [{ scale: iconPop }],
                },
              ]}
              pointerEvents="none"
            >
              <Ionicons name="copy-outline" size={size} color={brandColor} />
            </Animated.View>
            <Animated.View
              style={[
                styles.iconLayer,
                {
                  opacity: checkOpacity,
                  transform: [{ scale: iconPop }],
                },
              ]}
              pointerEvents="none"
            >
              <Ionicons name="checkmark" size={size} color="#16a34a" />
            </Animated.View>
          </View>
        )}
      </Animated.View>
    </Pressable>
  );
}

function textPreview(value) {
  const s = String(value || '').trim();
  if (!s) return 'text';
  return s.length > 24 ? `${s.slice(0, 24)}…` : s;
}

const styles = StyleSheet.create({
  btn: {
    width: 40,
    height: 40,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconStack: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconLayer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
