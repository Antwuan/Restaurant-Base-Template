/**
 * src/theme/index.js
 * Barrel export for the theme system.
 *
 * Import everything you need from one place:
 *
 *   import { ThemeProvider, useTheme, generateTheme, buildPaperTheme } from '../theme';
 */

export { ThemeProvider, useTheme } from './themeProvider';
export {
  generateTheme,
  generateScale,
  lighten,
  darken,
  hexToRgb,
  hexToRgba,
  getLuminance,
  getContrastText,
  neutral,
  semantic,
  DEFAULT_PRIMARY,
  DEFAULT_SECONDARY,
} from './colors';
export { buildPaperTheme } from './paperTheme';