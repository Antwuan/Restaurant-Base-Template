/**
 * AnimatedBadge
 * A numeric badge that bounces whenever its `value` prop changes.
 * Drop-in replacement for the static badge in the cart button.
 *
 * Props:
 *   value     — number to display (hidden when 0 / falsy)
 *   style     — extra style for the badge container
 *   textStyle — extra style for the badge text
 */
import React, { useRef, useEffect } from 'react';
import { Animated, Text, StyleSheet } from 'react-native';

export default function AnimatedBadge({ value, style, textStyle }) {
  const scale = useRef(new Animated.Value(value ? 1 : 0)).current;
  const prevValue = useRef(value);

  useEffect(() => {
    if (!value) {
      // Shrink badge out
      Animated.spring(scale, {
        toValue: 0,
        useNativeDriver: true,
        tension: 300,
        friction: 18,
      }).start();
      prevValue.current = value;
      return;
    }

    if (value !== prevValue.current) {
      prevValue.current = value;
      // Pop bounce
      Animated.sequence([
        Animated.spring(scale, {
          toValue: 1.45,
          useNativeDriver: true,
          tension: 400,
          friction: 8,
        }),
        Animated.spring(scale, {
          toValue: 1,
          useNativeDriver: true,
          tension: 300,
          friction: 12,
        }),
      ]).start();
    } else if (prevValue.current === undefined || prevValue.current === 0) {
      // First appearance
      Animated.spring(scale, {
        toValue: 1,
        useNativeDriver: true,
        tension: 300,
        friction: 14,
      }).start();
    }
  }, [value, scale]);

  return (
    <Animated.View
      style={[styles.badge, style, { transform: [{ scale }] }]}
      pointerEvents="none"
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
