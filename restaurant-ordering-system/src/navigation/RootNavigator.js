// Web-only root navigator with deep linking and /admin branch.
import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';

import CustomerNavigator from './CustomerNavigator';
import AdminNavigator from './AdminNavigator';

function getLinkingPrefixes() {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return [window.location.origin];
  }
  return ['http://localhost:8081'];
}

const linking = {
  prefixes: getLinkingPrefixes(),
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
    const path = window.location.pathname || '';
    setIsAdmin(path.startsWith('/admin'));
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
