import React, { useEffect, useState } from 'react';
import { Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { useTheme } from '../theme';

/** Space screens reserve in scroll content so the last items are not covered. */
export const VIEW_CART_BAR_PADDING = 96;

const BASE_GAP = 16;

function useVisualViewportBottomGap() {
  const [gap, setGap] = useState(BASE_GAP);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return undefined;

    const sync = () => {
      const vv = window.visualViewport;
      const covered = vv
        ? Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop))
        : 0;
      setGap(BASE_GAP + covered);
    };

    sync();
    const vv = window.visualViewport;
    window.addEventListener('resize', sync);
    vv?.addEventListener('resize', sync);
    vv?.addEventListener('scroll', sync);
    return () => {
      window.removeEventListener('resize', sync);
      vv?.removeEventListener('resize', sync);
      vv?.removeEventListener('scroll', sync);
    };
  }, []);

  return gap;
}

function getViewCartHost() {
  if (typeof document === 'undefined') return null;
  let host = document.getElementById('view-cart-host');
  if (host) return host;
  host = document.createElement('div');
  host.id = 'view-cart-host';
  host.style.cssText =
    'position:fixed;left:0;right:0;top:0;bottom:0;pointer-events:none;z-index:200;overflow:visible;';
  document.body.appendChild(host);
  return host;
}

function portalToBody(node) {
  if (Platform.OS !== 'web') return node;
  const host = getViewCartHost();
  if (!host) return node;
  const { createPortal } = require('react-dom');
  return createPortal(node, host);
}

export default function ViewCartBar({ itemCount, onPress }) {
  const { theme } = useTheme();
  const bottomGap = useVisualViewportBottomGap();
  const count = Number(itemCount) || 0;
  const label = `View cart · ${count} ${count === 1 ? 'Item' : 'Items'}`;

  const button = (
    <TouchableOpacity
      style={[
        styles.button,
        { backgroundColor: theme.colors.brand },
        Platform.OS === 'web'
          ? { bottom: `calc(${bottomGap}px + env(safe-area-inset-bottom, 0px))` }
          : null,
      ]}
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

  return portalToBody(button);
}

const styles = StyleSheet.create({
  button: {
    position: Platform.OS === 'web' ? 'fixed' : 'absolute',
    left: 16,
    right: 16,
    bottom: Platform.OS === 'ios' ? 34 : 16,
    zIndex: 200,
    minHeight: 48,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      web: {
        boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
        touchAction: 'manipulation',
        pointerEvents: 'auto',
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
