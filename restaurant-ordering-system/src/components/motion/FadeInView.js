/**
 * FadeInView
 * Fades + slides a view upward on mount.
 *
 * Props:
 *   delay    — ms before animation starts (default 0)
 *   duration — ms for the animation (default 420)
 *   fromY    — initial translateY offset in px (default 22)
 *   style    — extra styles for the Animated.View wrapper
 */
import React, { useRef, useEffect } from 'react';
import { Animated } from 'react-native';

export default function FadeInView({
  children,
  delay = 0,
  duration = 420,
  fromY = 22,
  style,
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(fromY)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration,
        delay,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration,
        delay,
        useNativeDriver: true,
      }),
    ]).start();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Animated.View style={[{ opacity, transform: [{ translateY }] }, style]}>
      {children}
    </Animated.View>
  );
}
