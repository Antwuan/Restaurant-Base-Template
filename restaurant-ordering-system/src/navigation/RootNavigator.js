// Root navigator with deep linking. Chooses between customer and admin flows
// based on the URL path on web (/admin => admin tabs), and defaults to the
// customer view on native platforms.
import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, Platform } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';

import CustomerNavigator from './CustomerNavigator';
import AdminNavigator from './AdminNavigator';

const linking = {
  prefixes: ['restaurantapp://', 'https://yourapp.com'],
  config: {
    screens: {
      Admin: 'admin',
      Menu: 'menu',
      Cart: 'cart',
      Checkout: 'checkout',
      Confirmation: 'confirmation',
    },
  },
};

const RootNavigator = () => {
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (Platform.OS === 'web') {
      const path = window.location.pathname || '';
      setIsAdmin(path.startsWith('/admin'));
    } else {
      setIsAdmin(false);
    }
    setIsLoading(false);
  }, []);

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return (
    <NavigationContainer linking={linking}>
      {isAdmin ? <AdminNavigator /> : <CustomerNavigator />}
    </NavigationContainer>
  );
};

export default RootNavigator;

