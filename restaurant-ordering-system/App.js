import React from 'react';
import { Provider as PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { View, ActivityIndicator, Text, StyleSheet, Platform } from 'react-native';

import { RestaurantProvider, useRestaurantContext } from './src/context/RestaurantContext';
import { AuthProvider } from './src/context/AuthContext';
import { CartProvider } from './src/context/CartContext';
import { PickupLocationProvider } from './src/context/PickupLocationContext';
import { ThemeProvider, useTheme, buildPaperTheme } from './src/theme';
import RootNavigator from './src/navigation/RootNavigator';
import { GlobalConfirmModal } from './src/components/ConfirmModal';

// Inner app wrapper that has access to theme + restaurant context
const AppContent = () => {
  const { restaurant, loading, error } = useRestaurantContext();
  const { theme } = useTheme();
  const paperTheme = buildPaperTheme(theme);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  if (error || !restaurant) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>
          {error || 'Restaurant not found.'}
        </Text>
        <Text style={styles.errorSub}>
          {typeof window !== 'undefined' && window.location.pathname.startsWith('/admin')
            ? 'Your admin account must be linked in the restaurant_staff table. See supabase/migrations/20260612_admin_rls.sql.'
            : 'Please check the URL or contact support.'}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <PaperProvider theme={paperTheme}>
        <CartProvider restaurantId={restaurant?.id}>
          <PickupLocationProvider>
            <RootNavigator />
            <GlobalConfirmModal />
          </PickupLocationProvider>
        </CartProvider>
      </PaperProvider>
    </View>
  );
};

// Theme-aware wrapper (needs restaurant from context)
const ThemedApp = () => {
  const { restaurant } = useRestaurantContext();

  return (
    <ThemeProvider restaurant={restaurant}>
      <AppContent />
    </ThemeProvider>
  );
};

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <RestaurantProvider>
          <ThemedApp />
        </RestaurantProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    ...Platform.select({
      web: { minHeight: '100vh' },
    }),
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 20,
  },
  errorText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  errorSub: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
  },
});