/**
 * App.js
 * Root of the app. Wires together all Phase 6 providers.
 *
 * Dependency order (outermost → innermost):
 *   SafeAreaProvider
 *     NavigationContainer
 *       RestaurantContext  ← loads restaurant from DB
 *         ThemeProvider    ← derives theme from restaurant colors
 *           PaperProvider  ← Paper uses our brand theme
 *             AuthContext
 *               RootNavigator
 */

import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { PaperProvider } from 'react-native-paper';

import { RestaurantProvider, useRestaurantContext } from './src/context/RestaurantContext';
import { AuthProvider } from './src/context/AuthContext';
import { ThemeProvider, buildPaperTheme, useTheme } from './src/theme';
import RootNavigator from './src/navigation/RootNavigator';

// ─── Inner shell ──────────────────────────────────────────────────────────────
// Separated so it can consume RestaurantContext before building the Paper theme.

const ThemedApp = () => {
  const { restaurant, loading } = useRestaurantContext();

  // Don't render until we know the restaurant — prevents a flash of
  // default brand colors before the real ones load.
  if (loading) {
    // Replace with your actual SplashScreen or a skeleton if preferred.
    return null;
  }

  return (
    // ThemeProvider derives our internal theme from the restaurant's colors.
    <ThemeProvider restaurant={restaurant}>
      <PaperAdapter>
        <AuthProvider>
          <NavigationContainer>
            <RootNavigator />
          </NavigationContainer>
        </AuthProvider>
      </PaperAdapter>
    </ThemeProvider>
  );
};

const PaperAdapter = ({ children }) => {
  const { theme } = useTheme();
  const paperTheme = buildPaperTheme(theme);

  return (
    <PaperProvider theme={paperTheme}>
      {children}
    </PaperProvider>
  );
};

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <SafeAreaProvider>
      <RestaurantProvider>
        <ThemedApp />
      </RestaurantProvider>
    </SafeAreaProvider>
  );
}