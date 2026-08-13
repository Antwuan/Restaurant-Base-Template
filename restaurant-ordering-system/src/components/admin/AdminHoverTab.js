/**
 * AdminHoverTab — slight web hover using the restaurant brand color.
 * Inactive tabs fade in a brandLight wash; active tabs stay as provided.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Platform, StyleSheet, TouchableOpacity, View } from 'react-native';

const HOVER_MS = 140;

export default function AdminHoverTab({
  isActive = false,
  disabled = false,
  onPress,
  style,
  contentStyle,
  children,
  brandLight,
  washRadius = 8,
  activeOpacity = 0.75,
  ...rest
}) {
  const hover = useRef(new Animated.Value(0)).current;
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    if (isActive || disabled) {
      hover.setValue(0);
      setHovered(false);
    }
  }, [isActive, disabled, hover]);

  const animateTo = (to, nextHovered) => {
    setHovered(nextHovered);
    Animated.timing(hover, {
      toValue: to,
      duration: HOVER_MS,
      useNativeDriver: true,
    }).start();
  };

  const webHover =
    Platform.OS === 'web' && !disabled && !isActive
      ? {
          onMouseEnter: () => animateTo(1, true),
          onMouseLeave: () => animateTo(0, false),
        }
      : {};

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={activeOpacity}
      accessibilityRole="tab"
      accessibilityState={{ selected: isActive, disabled }}
      {...webHover}
      {...rest}
      style={[
        styles.root,
        Platform.OS === 'web' && { cursor: disabled ? 'default' : 'pointer' },
        style,
      ]}
    >
      {!isActive && !disabled && brandLight ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.wash,
            {
              borderRadius: washRadius,
              backgroundColor: brandLight,
              opacity: hover.interpolate({
                inputRange: [0, 1],
                outputRange: [0, 0.9],
              }),
            },
          ]}
        />
      ) : null}
      <View style={[styles.content, contentStyle]}>
        {typeof children === 'function' ? children({ hovered: hovered && !isActive }) : children}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'relative',
    overflow: 'hidden',
  },
  wash: {
    ...StyleSheet.absoluteFillObject,
  },
  content: {
    position: 'relative',
    zIndex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
});
