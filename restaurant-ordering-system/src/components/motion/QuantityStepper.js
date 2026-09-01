/**
 * QuantityStepper
 * Plus/minus control with a rolling AnimatedDialNumber.
 * Variants: cart (branded circles), modal (boxed footer), compact (inline).
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme';
import AnimatedDialNumber from './AnimatedDialNumber';

const VARIANT = {
  cart: {
    height: 22,
    dialWidth: 28,
    fontSize: 16,
  },
  modal: {
    height: 22,
    dialWidth: 36,
    fontSize: 16,
  },
  compact: {
    height: 18,
    dialWidth: 22,
    fontSize: 13,
  },
};

export default function QuantityStepper({
  value,
  onIncrease,
  onDecrease,
  variant = 'cart',
  min,
  max,
  color,
  decreaseLabel = 'Decrease quantity',
  increaseLabel = 'Increase quantity',
  style,
}) {
  const { theme } = useTheme();
  const brand = color || theme.colors.brand;
  const metrics = VARIANT[variant] || VARIANT.cart;
  const atMin = min != null && value <= min;
  const atMax = max != null && value >= max;

  const dial = (
    <AnimatedDialNumber
      value={value}
      height={metrics.height}
      style={{ width: metrics.dialWidth }}
      textStyle={{ fontSize: metrics.fontSize, fontWeight: '700', color: '#111' }}
    />
  );

  if (variant === 'modal') {
    return (
      <View style={[styles.modalWrap, style]}>
        <TouchableOpacity
          style={[styles.modalBtn, atMin && styles.modalBtnDisabled]}
          onPress={onDecrease}
          disabled={atMin}
          accessibilityLabel={decreaseLabel}
          accessibilityRole="button"
          accessibilityState={{ disabled: atMin }}
          hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
        >
          <Ionicons name="remove" size={20} color={atMin ? '#ccc' : '#333'} />
        </TouchableOpacity>
        {dial}
        <TouchableOpacity
          style={[styles.modalBtn, atMax && styles.modalBtnDisabled]}
          onPress={onIncrease}
          disabled={atMax}
          accessibilityLabel={increaseLabel}
          accessibilityRole="button"
          accessibilityState={{ disabled: atMax }}
          hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
        >
          <Ionicons name="add" size={20} color={atMax ? '#ccc' : '#333'} />
        </TouchableOpacity>
      </View>
    );
  }

  if (variant === 'compact') {
    return (
      <View style={[styles.compactWrap, style]}>
        <TouchableOpacity
          style={[styles.compactBtn, atMin && styles.compactBtnDisabled]}
          onPress={onDecrease}
          disabled={atMin}
          accessibilityLabel={decreaseLabel}
          accessibilityRole="button"
          accessibilityState={{ disabled: atMin }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="remove" size={14} color={atMin ? '#ccc' : '#555'} />
        </TouchableOpacity>
        {dial}
        <TouchableOpacity
          style={[styles.compactBtn, atMax && styles.compactBtnDisabled]}
          onPress={onIncrease}
          disabled={atMax}
          accessibilityLabel={increaseLabel}
          accessibilityRole="button"
          accessibilityState={{ disabled: atMax }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="add" size={14} color={atMax ? '#ccc' : '#555'} />
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.cartWrap, style]}>
      <TouchableOpacity
        onPress={onDecrease}
        disabled={atMin}
        style={[
          styles.cartBtn,
          { borderColor: atMin ? '#e5e7eb' : brand },
        ]}
        accessibilityRole="button"
        accessibilityLabel={decreaseLabel}
        accessibilityState={{ disabled: atMin }}
        hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
      >
        <Text style={[styles.cartBtnText, { color: atMin ? '#9ca3af' : brand }]}>−</Text>
      </TouchableOpacity>
      {dial}
      <TouchableOpacity
        onPress={onIncrease}
        disabled={atMax}
        style={[
          styles.cartBtn,
          {
            backgroundColor: atMax ? '#e5e7eb' : brand,
            borderColor: atMax ? '#e5e7eb' : brand,
          },
        ]}
        accessibilityRole="button"
        accessibilityLabel={increaseLabel}
        accessibilityState={{ disabled: atMax }}
        hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
      >
        <Text style={[styles.cartBtnText, { color: atMax ? '#9ca3af' : '#fff' }]}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  cartWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexShrink: 0,
  },
  cartBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cartBtnText: {
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 20,
  },

  modalWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    overflow: 'hidden',
    flexShrink: 0,
  },
  modalBtn: {
    width: 40,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  modalBtnDisabled: {
    backgroundColor: '#fafafa',
  },

  compactWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 0,
  },
  compactBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#ddd',
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactBtnDisabled: {
    borderColor: '#eee',
  },
});
