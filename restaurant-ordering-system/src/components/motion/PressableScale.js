/**
 * PressableScale
 * Wraps any pressable content with a spring scale-down on press
 * and a subtle CSS translateY lift on web hover.
 *
 * Props:
 *   onPress    — press handler
 *   scale      — target scale when pressed (default 0.96)
 *   hoverStyle — extra web style applied on hover (object, optional)
 *   style      — style for the inner Animated.View
 *   rest       — forwarded to TouchableOpacity
 */
import React, { useRef, useState } from 'react';
import { Animated, TouchableOpacity, Platform } from 'react-native';

export default function PressableScale({
  children,
  onPress,
  scale = 0.96,
  style,
  hoverStyle,
  ...rest
}) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const [hovered, setHovered] = useState(false);

  const animateTo = (toValue) => {
    Animated.spring(scaleAnim, {
      toValue,
      useNativeDriver: true,
      tension: 300,
      friction: 20,
    }).start();
  };

  const handlePressIn = () => animateTo(scale);
  const handlePressOut = () => animateTo(1);

  const webHoverProps =
    Platform.OS === 'web'
      ? {
          onMouseEnter: () => setHovered(true),
          onMouseLeave: () => {
            setHovered(false);
            animateTo(1);
          },
        }
      : {};

  const hoverCombined =
    hovered && hoverStyle ? hoverStyle : undefined;

  return (
    <TouchableOpacity
      activeOpacity={1}
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      {...webHoverProps}
      {...rest}
    >
      <Animated.View
        style={[{ transform: [{ scale: scaleAnim }] }, style, hoverCombined]}
      >
        {children}
      </Animated.View>
    </TouchableOpacity>
  );
}
