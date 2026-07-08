// Web-only root navigator with deep linking and /admin branch.
import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { NavigationContainer, getStateFromPath as defaultGetStateFromPath } from '@react-navigation/native';

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
      Home: { path: '' },
      Menu: {
        path: 'menu',
        parse: {
          openCart: (value) => value === 'true' || value === '1' || value === true,
        },
      },
      Checkout: 'checkout',
      Confirmation: 'confirmation',
      OrderTracker: 'tracker',
    },
  },
  getStateFromPath(path, options) {
    const clean = (path || '').replace(/^\//, '').split('?')[0];
    if (clean === 'cart') {
      return {
        routes: [{ name: 'Menu', params: { openCart: true } }],
      };
    }
    if (clean === '' || clean === 'home') {
      return { routes: [{ name: 'Home' }] };
    }
    return defaultGetStateFromPath(path, options);
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
    <NavigationContainer linking={linking} style={{ flex: 1 }}>
      {isAdmin ? <AdminNavigator /> : <CustomerNavigator />}
    </NavigationContainer>
  );
};

export default RootNavigator;
