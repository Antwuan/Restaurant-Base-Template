/**
 * ScrollReveal
 * Fades + slides children into view when the element scrolls into the
 * browser viewport (web: IntersectionObserver). On native it fires
 * immediately on mount.
 *
 * Props:
 *   delay    — extra delay after entering viewport (ms, default 0)
 *   duration — animation duration (ms, default 550)
 *   fromY    — initial Y offset (px, default 28)
 *   style    — style forwarded to the animated wrapper
 */
import React, { useRef, useEffect, useCallback } from 'react';
import { Animated, Platform } from 'react-native';

export default function ScrollReveal({
  children,
  delay = 0,
  duration = 550,
  fromY = 28,
  style,
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(fromY)).current;
  const animatedRef = useRef(null);
  const revealed = useRef(false);

  const reveal = useCallback(() => {
    if (revealed.current) return;
    revealed.current = true;
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
  }, [opacity, translateY, duration, delay]);

  useEffect(() => {
    if (Platform.OS !== 'web') {
      reveal();
      return undefined;
    }

    // On web, use IntersectionObserver to trigger when visible.
    // react-native-web exposes the DOM node through the ref.
    let observer;
    const el = animatedRef.current;

    if (el && typeof IntersectionObserver !== 'undefined') {
      observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            reveal();
          }
        },
        { threshold: 0.12 },
      );
      observer.observe(el);
    } else {
      // Fallback: just reveal immediately
      reveal();
    }

    return () => {
      if (observer) observer.disconnect();
    };
  }, [reveal]);

  return (
    <Animated.View
      ref={animatedRef}
      style={[{ opacity, transform: [{ translateY }] }, style]}
    >
      {children}
    </Animated.View>
  );
}
