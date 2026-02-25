/**
 * paperTheme.js
 * Adapts our internal theme (from generateTheme) into the shape that
 * React Native Paper's <PaperProvider theme={...}> expects.
 *
 * Usage:
 *   import { buildPaperTheme } from './paperTheme';
 *   const paperTheme = buildPaperTheme(theme);
 *   <PaperProvider theme={paperTheme}>...</PaperProvider>
 */

import { MD3LightTheme } from 'react-native-paper';

/**
 * buildPaperTheme(theme)
 *
 * @param {object} theme - The full theme object returned by generateTheme()
 * @returns {object} - A React Native Paper MD3 theme object
 */
export const buildPaperTheme = (theme) => {
  const { colors } = theme;

  return {
    ...MD3LightTheme,

    // ── MD3 color scheme mapping
    colors: {
      ...MD3LightTheme.colors,

      // ── Primary
      primary:           colors.brand,
      onPrimary:         colors.brandText,
      primaryContainer:  colors.brandLight,
      onPrimaryContainer: colors.brandDark,

      // ── Secondary
      secondary:           colors.accent,
      onSecondary:         colors.accentText,
      secondaryContainer:  colors.accentLight,
      onSecondaryContainer: colors.accentDark,

      // ── Tertiary (reuse secondary shades)
      tertiary:           colors.accent,
      onTertiary:         colors.accentText,
      tertiaryContainer:  colors.secondary[50],
      onTertiaryContainer: colors.secondary[800],

      // ── Error
      error:          colors.error,
      onError:        '#ffffff',
      errorContainer: colors.errorLight,
      onErrorContainer: colors.errorText,

      // ── Backgrounds / surfaces
      background:         colors.background,
      onBackground:       colors.textPrimary,
      surface:            colors.backgroundCard,
      onSurface:          colors.textPrimary,
      surfaceVariant:     colors.backgroundSunken,
      onSurfaceVariant:   colors.textSecondary,

      // ── Outline
      outline:            colors.border,
      outlineVariant:     colors.borderStrong,

      // ── Inverse
      inverseSurface:     colors.neutral[800],
      inverseOnSurface:   colors.neutral[50],
      inversePrimary:     colors.primary[200],

      // ── Shadow / scrim
      shadow:             '#000000',
      scrim:              '#000000',

      // ── Elevation
      elevation: {
        level0: 'transparent',
        level1: colors.backgroundCard,
        level2: colors.neutral[50],
        level3: colors.neutral[100],
        level4: colors.neutral[100],
        level5: colors.neutral[200],
      },
    },

    // ── Custom component overrides
    // These tweak Paper's default component styles to align with our brand.
    // See: https://callstack.github.io/react-native-paper/docs/guides/theming
    fonts: MD3LightTheme.fonts,

    // Expose our full theme on the Paper theme object so custom components
    // can access spacing, shadows, etc. via Paper's useTheme() if needed.
    custom: theme,
  };
};

export default buildPaperTheme;