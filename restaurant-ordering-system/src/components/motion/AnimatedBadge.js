/**
 * AnimatedBadge
 * Numeric badge that pops when `value` increases — cart add acknowledgment.
 * Respects reduced motion (opacity/visibility only, no bounce).
 */
import React, { useRef, useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Text, StyleSheet } from 'react-native';

export default function AnimatedBadge({ value, style, textStyle, color }) {
  const scale = useRef(new Animated.Value(value ? 1 : 0)).current;
  const prevValue = useRef(value);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled?.().then((enabled) => {
      if (mounted) setReduceMotion(!!enabled);
    });
    const sub = AccessibilityInfo.addEventListener?.(
      'reduceMotionChanged',
      (enabled) => setReduceMotion(!!enabled),
    );
    return () => {
      mounted = false;
      sub?.remove?.();
    };
  }, []);

  useEffect(() => {
    if (!value) {
      if (reduceMotion) {
        scale.setValue(0);
      } else {
        Animated.timing(scale, {
          toValue: 0,
          duration: 120,
          useNativeDriver: true,
        }).start();
      }
      prevValue.current = value;
      return;
    }

    const increased = value > (prevValue.current || 0);
    const appeared = !prevValue.current;
    prevValue.current = value;

    if (reduceMotion) {
      scale.setValue(1);
      return;
    }

    if (increased || appeared) {
      // Ops-safe pop: short overshoot, settles under ~200ms
      scale.setValue(appeared ? 0.6 : 1);
      Animated.sequence([
        Animated.timing(scale, {
          toValue: 1.28,
          duration: 110,
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 1,
          duration: 140,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      scale.setValue(1);
    }
  }, [value, scale, reduceMotion]);

  if (!value && reduceMotion) return null;

  return (
    <Animated.View
      style={[
        styles.badge,
        color ? { backgroundColor: color } : null,
        style,
        { transform: [{ scale }] },
      ]}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Text style={[styles.text, textStyle]}>
        {value > 99 ? '99+' : value}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
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
  text: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
});
