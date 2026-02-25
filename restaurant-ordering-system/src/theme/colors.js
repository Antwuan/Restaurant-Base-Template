/**
 * colors.js
 * Core color palette + utilities for generating full theme from brand colors.
 *
 * generateTheme(options) is the main export used by ThemeProvider.
 */

// ─── Defaults ────────────────────────────────────────────────────────────────

export const DEFAULT_PRIMARY = '#007AFF';
export const DEFAULT_SECONDARY = '#5856D6';

// ─── Hex <-> RGB helpers ──────────────────────────────────────────────────────

/**
 * Converts a hex color string to an { r, g, b } object.
 * Accepts 3-char or 6-char hex with or without '#'.
 */
export const hexToRgb = (hex) => {
  const clean = hex.replace('#', '');
  const full = clean.length === 3
    ? clean.split('').map((c) => c + c).join('')
    : clean;
  const num = parseInt(full, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
};

/**
 * Converts r, g, b integers to a hex string (with leading #).
 */
export const rgbToHex = (r, g, b) => {
  return (
    '#' +
    [r, g, b]
      .map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0'))
      .join('')
  );
};

/**
 * Returns an rgba() CSS string.
 */
export const hexToRgba = (hex, alpha = 1) => {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

// ─── Color manipulation ───────────────────────────────────────────────────────

/**
 * Lightens a hex color by mixing it with white.
 * amount: 0 (original) → 1 (white)
 */
export const lighten = (hex, amount) => {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHex(
    r + (255 - r) * amount,
    g + (255 - g) * amount,
    b + (255 - b) * amount,
  );
};

/**
 * Darkens a hex color by mixing it with black.
 * amount: 0 (original) → 1 (black)
 */
export const darken = (hex, amount) => {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHex(r * (1 - amount), g * (1 - amount), b * (1 - amount));
};

/**
 * Returns perceived luminance (0 = black, 1 = white).
 * Used to decide whether text on a color should be black or white.
 */
export const getLuminance = (hex) => {
  const { r, g, b } = hexToRgb(hex);
  const toLinear = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
};

/**
 * Returns '#fff' or '#000' depending on which gives better contrast
 * against the provided background color.
 */
export const getContrastText = (backgroundColor) => {
  return getLuminance(backgroundColor) > 0.4 ? '#000000' : '#ffffff';
};

// ─── Palette generator ────────────────────────────────────────────────────────

/**
 * Generates a 9-stop scale from a single base color.
 * Keys: 50, 100, 200, 300, 400, 500 (base), 600, 700, 800, 900
 */
export const generateScale = (hex) => ({
  50:  lighten(hex, 0.92),
  100: lighten(hex, 0.80),
  200: lighten(hex, 0.60),
  300: lighten(hex, 0.40),
  400: lighten(hex, 0.20),
  500: hex,
  600: darken(hex, 0.15),
  700: darken(hex, 0.30),
  800: darken(hex, 0.45),
  900: darken(hex, 0.60),
});

// ─── Neutral palette (static) ─────────────────────────────────────────────────

export const neutral = {
  0:   '#ffffff',
  50:  '#f9f9f9',
  100: '#f0f0f0',
  200: '#e0e0e0',
  300: '#c8c8c8',
  400: '#a0a0a0',
  500: '#737373',
  600: '#525252',
  700: '#3d3d3d',
  800: '#262626',
  900: '#171717',
  1000: '#000000',
};

// ─── Semantic colors (static) ─────────────────────────────────────────────────

export const semantic = {
  success:  '#22c55e',
  warning:  '#f59e0b',
  error:    '#ef4444',
  info:     '#3b82f6',

  successLight:  '#dcfce7',
  warningLight:  '#fef3c7',
  errorLight:    '#fee2e2',
  infoLight:     '#dbeafe',

  successText:   '#15803d',
  warningText:   '#92400e',
  errorText:     '#b91c1c',
  infoText:      '#1d4ed8',
};

// ─── Full theme generator ─────────────────────────────────────────────────────

/**
 * generateTheme({ primaryColor, secondaryColor, restaurantName, logoUrl })
 *
 * Returns a complete theme object consumed by ThemeProvider, useTheme,
 * and the React Native Paper adapter (paperTheme.js).
 */
export const generateTheme = ({
  primaryColor = DEFAULT_PRIMARY,
  secondaryColor = DEFAULT_SECONDARY,
  restaurantName = 'Restaurant',
  logoUrl = null,
}) => {
  const primary = generateScale(primaryColor);
  const secondary = generateScale(secondaryColor);

  return {
    // ── Brand identity
    restaurant: {
      name: restaurantName,
      logoUrl,
    },

    // ── Color scales
    colors: {
      primary,
      secondary,
      neutral,
      semantic,

      // ── Convenience aliases (most commonly used in components)
      brand: primaryColor,
      brandLight: primary[100],
      brandDark: primary[700],
      brandText: getContrastText(primaryColor),

      accent: secondaryColor,
      accentLight: secondary[100],
      accentDark: secondary[700],
      accentText: getContrastText(secondaryColor),

      // ── Backgrounds
      background:       neutral[50],
      backgroundCard:   neutral[0],
      backgroundSunken: neutral[100],

      // ── Borders
      border:       neutral[200],
      borderStrong: neutral[300],

      // ── Text
      textPrimary:   neutral[900],
      textSecondary: neutral[500],
      textDisabled:  neutral[400],
      textInverse:   neutral[0],

      // ── Semantic
      ...semantic,
    },

    // ── Spacing scale (base-8)
    spacing: {
      0:   0,
      1:   4,
      2:   8,
      3:   12,
      4:   16,
      5:   20,
      6:   24,
      8:   32,
      10:  40,
      12:  48,
      16:  64,
      20:  80,
      24:  96,
    },

    // ── Typography
    typography: {
      fontFamily: {
        sans:  'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        mono:  '"SF Mono", "Fira Mono", "Cascadia Code", monospace',
      },
      fontSize: {
        xs:   12,
        sm:   14,
        base: 16,
        lg:   18,
        xl:   20,
        '2xl': 24,
        '3xl': 30,
        '4xl': 36,
      },
      fontWeight: {
        normal:   '400',
        medium:   '500',
        semibold: '600',
        bold:     '700',
      },
      lineHeight: {
        tight:  1.25,
        normal: 1.5,
        loose:  1.75,
      },
    },

    // ── Border radius
    radius: {
      sm:   4,
      md:   8,
      lg:   12,
      xl:   16,
      full: 9999,
    },

    // ── Shadows
    shadows: {
      sm:  '0 1px 3px rgba(0,0,0,0.08)',
      md:  '0 4px 12px rgba(0,0,0,0.10)',
      lg:  '0 8px 24px rgba(0,0,0,0.12)',
      xl:  '0 16px 48px rgba(0,0,0,0.16)',
    },

    // ── Helper functions (available wherever theme is used)
    utils: {
      hexToRgb,
      hexToRgba,
      lighten,
      darken,
      getLuminance,
      getContrastText,
    },
  };
};

export default generateTheme;