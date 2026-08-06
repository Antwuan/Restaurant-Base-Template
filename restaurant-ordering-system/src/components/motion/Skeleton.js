/**
 * Skeleton
 * A shimmering placeholder block used while content is loading.
 *
 * Props:
 *   width        — numeric or '100%' (default '100%')
 *   height       — number (default 20)
 *   borderRadius — number (default 8)
 *   style        — extra style
 */
import React, { useRef, useEffect } from 'react';
import { Animated } from 'react-native';

export default function Skeleton({
  width = '100%',
  height = 20,
  borderRadius = 8,
  style,
}) {
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.timing(shimmer, {
          toValue: 0,
          duration: 900,
          useNativeDriver: true,
        }),
      ]),
    ).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const opacity = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: [0.35, 0.75],
  });

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius,
          backgroundColor: '#e5e7eb',
          opacity,
        },
        style,
      ]}
    />
  );
}
