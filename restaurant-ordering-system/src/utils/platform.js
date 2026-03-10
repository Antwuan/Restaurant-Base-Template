/**
 * src/utils/platform.js
 *
 * Centralised platform-detection helpers.
 * Import these instead of scattering Platform.OS checks through components.
 */

import { Platform, Dimensions } from 'react-native';

// ─── Basic platform booleans ──────────────────────────────────────────────────

export const isWeb = Platform.OS === 'web';
export const isIOS = Platform.OS === 'ios';
export const isAndroid = Platform.OS === 'android';
export const isMobile = isIOS || isAndroid;

// ─── Responsive breakpoints (web) ────────────────────────────────────────────

const BREAKPOINTS = {
  sm: 480,
  md: 768,
  lg: 1024,
  xl: 1280,
};

/**
 * Returns the current window width.
 * On native this updates when the device rotates.
 */
export function getWindowWidth() {
  return Dimensions.get('window').width;
}

export function isSmallScreen() {
  return getWindowWidth() < BREAKPOINTS.md;
}

export function isMediumScreen() {
  const w = getWindowWidth();
  return w >= BREAKPOINTS.md && w < BREAKPOINTS.lg;
}

export function isLargeScreen() {
  return getWindowWidth() >= BREAKPOINTS.lg;
}

// ─── Platform.select shortcuts ────────────────────────────────────────────────

/**
 * A thin wrapper around Platform.select that fills in a sensible default.
 *
 * Usage:
 *   const shadowStyle = select({
 *     web: { boxShadow: '0 2px 8px rgba(0,0,0,0.15)' },
 *     native: { elevation: 4 },
 *   });
 */
export function select(options) {
  return Platform.select({
    ...options,
    default: options.native ?? options.default ?? {},
  });
}

// ─── Web-only helpers ─────────────────────────────────────────────────────────

/**
 * Returns the current browser hostname, or null on native.
 * Useful for restaurant domain detection.
 */
export function getHostname() {
  if (!isWeb || typeof window === 'undefined') return null;
  return window.location.hostname;
}

/**
 * Returns a URLSearchParams instance for the current URL, or null on native.
 */
export function getSearchParams() {
  if (!isWeb || typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search);
}

// ─── Styles that differ per platform ─────────────────────────────────────────

/**
 * Cross-platform shadow style.
 * On web, uses CSS box-shadow. On native, uses elevation + shadowColor.
 */
export function shadowStyle(elevation = 4) {
  if (isWeb) {
    const blur = elevation * 2;
    const spread = elevation * 0.5;
    return { boxShadow: `0 ${elevation}px ${blur}px ${spread}px rgba(0,0,0,0.10)` };
  }
  return {
    elevation,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: elevation / 2 },
    shadowOpacity: 0.15,
    shadowRadius: elevation,
  };
}

/**
 * On web, <Text> inside a flex container can overflow.
 * This prevents that by adding a userSelect:none / overflow:hidden guard.
 */
export const webTextOverflowFix = isWeb
  ? { overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }
  : {};