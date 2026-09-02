import React from 'react';
import { Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { useTheme } from '../theme';

/** Space screens reserve in scroll content so the last items are not covered. */
export const VIEW_CART_BAR_PADDING = 96;

export default function ViewCartBar({ itemCount, onPress }) {
  const { theme } = useTheme();
  const count = Number(itemCount) || 0;
  const label = `View cart · ${count} ${count === 1 ? 'Item' : 'Items'}`;

  return (
    <TouchableOpacity
      style={[styles.button, { backgroundColor: theme.colors.brand }]}
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text style={[styles.label, { color: theme.colors.brandText || '#fff' }]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: Platform.OS === 'ios' ? 34 : 16,
    zIndex: 40,
    minHeight: 48,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      web: {
        bottom: 'max(16px, env(safe-area-inset-bottom, 0px))',
        boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
      },
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.22,
        shadowRadius: 8,
      },
      android: { elevation: 8 },
    }),
  },
  label: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
