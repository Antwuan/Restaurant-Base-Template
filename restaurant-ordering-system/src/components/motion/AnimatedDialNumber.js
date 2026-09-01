/**
 * AnimatedDialNumber
 * Rolling quantity: outgoing value slides out, incoming slides in (~200ms).
 * Increase rolls up; decrease rolls down. Instant swap when reduced motion is on.
 */
import React, { useRef, useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, Text, StyleSheet, View } from 'react-native';

const DURATION = 200;
const EASE = Easing.bezier(0.16, 1, 0.3, 1);

export default function AnimatedDialNumber({
  value,
  style,
  textStyle,
  height = 22,
}) {
  const [outgoing, setOutgoing] = useState(null);
  const [incoming, setIncoming] = useState(value);
  const [dir, setDir] = useState(1);
  const progress = useRef(new Animated.Value(1)).current;
  const prevValue = useRef(value);
  const animGen = useRef(0);
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
    if (prevValue.current === value) return;
    const oldVal = prevValue.current;
    const increased = value > oldVal;
    prevValue.current = value;

    if (reduceMotion) {
      animGen.current += 1;
      progress.stopAnimation();
      progress.setValue(1);
      setOutgoing(null);
      setIncoming(value);
      return;
    }

    const thisGen = ++animGen.current;
    setDir(increased ? 1 : -1);
    setOutgoing(oldVal);
    setIncoming(value);
    progress.stopAnimation();
    progress.setValue(0);
    Animated.timing(progress, {
      toValue: 1,
      duration: DURATION,
      easing: EASE,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished && animGen.current === thisGen) {
        setOutgoing(null);
      }
    });
  }, [value, reduceMotion, progress]);

  const outgoingY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -dir * height],
  });
  const outgoingOpacity = progress.interpolate({
    inputRange: [0, 0.85, 1],
    outputRange: [1, 0.15, 0],
  });
  const incomingY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [dir * height, 0],
  });
  const incomingOpacity = progress.interpolate({
    inputRange: [0, 0.2, 1],
    outputRange: [0, 0.85, 1],
  });

  const rolling = outgoing != null;
  const text = [styles.text, textStyle, { lineHeight: height }];

  return (
    <View
      style={[styles.clip, { height }, style]}
      accessibilityLabel={`Quantity ${incoming}`}
      accessibilityLiveRegion="polite"
    >
      {rolling ? (
        <>
          <Animated.View
            pointerEvents="none"
            style={[
              styles.slot,
              { transform: [{ translateY: outgoingY }], opacity: outgoingOpacity },
            ]}
          >
            <Text style={text}>{outgoing}</Text>
          </Animated.View>
          <Animated.View
            pointerEvents="none"
            style={[
              styles.slot,
              { transform: [{ translateY: incomingY }], opacity: incomingOpacity },
            ]}
          >
            <Text style={text}>{incoming}</Text>
          </Animated.View>
        </>
      ) : (
        <Text style={text}>{incoming}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  clip: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    ...Platform.select({
      web: { overflowY: 'hidden', overflowX: 'hidden' },
    }),
  },
  slot: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontWeight: '700',
    color: '#111',
    textAlign: 'center',
  },
});
