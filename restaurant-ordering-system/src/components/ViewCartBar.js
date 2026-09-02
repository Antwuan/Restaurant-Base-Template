import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { useTheme } from '../theme';

/** Space ScreenChrome reserves above this bar so Menu/Catering scroll content is not covered. */
export const VIEW_CART_BAR_PADDING = 96;

export default function ViewCartBar({ itemCount, onPress }) {
  const { theme } = useTheme();
  const count = Number(itemCount) || 0;
  const label = `View cart · ${count} ${count === 1 ? 'Item' : 'Items'}`;

  return (
    <View style={styles.bar} pointerEvents="box-none">
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
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 40,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: Platform.OS === 'ios' ? 34 : 16,
    backgroundColor: 'transparent',
    ...Platform.select({
      web: {
        paddingBottom: 'max(16px, env(safe-area-inset-bottom, 0px))',
      },
    }),
  },
  button: {
    minHeight: 48,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      web: {
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
