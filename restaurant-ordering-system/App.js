import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { Provider as PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { View, ActivityIndicator, Text, StyleSheet } from 'react-native';

import { RestaurantProvider, useRestaurantContext } from './src/context/RestaurantContext';
import { AuthProvider } from './src/context/AuthContext';
import { ThemeProvider, useTheme, buildPaperTheme } from './src/theme';
import RootNavigator from './src/navigation/RootNavigator';

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
        <Text style={styles.errorText}>Restaurant not found.</Text>
        <Text style={styles.errorSub}>Please check the URL or contact support.</Text>
      </View>
    );
  }

  return (
    <PaperProvider theme={paperTheme}>
      <NavigationContainer>
        <RootNavigator />
      </NavigationContainer>
    </PaperProvider>
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