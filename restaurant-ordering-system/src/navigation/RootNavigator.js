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
      Catering: 'catering',
      Rewards: 'rewards',
      Hiring: 'hiring',
      Checkout: 'checkout',
      Confirmation: 'confirmation',
      OrderTracker: 'tracker',
      Review: {
        path: 'review',
        parse: {
          token: (value) => value || '',
        },
      },
    },
  },
  getStateFromPath(path, options) {
    const raw = path || '';
    const clean = raw.replace(/^\//, '').split('?')[0];
    if (clean === 'cart') {
      return {
        routes: [{ name: 'Menu', params: { openCart: true } }],
      };
    }
    if (clean === '' || clean === 'home') {
      return { routes: [{ name: 'Home' }] };
    }
    if (clean === 'review') {
      const qs = raw.includes('?') ? raw.slice(raw.indexOf('?') + 1) : '';
      const params = new URLSearchParams(qs);
      return {
        routes: [{ name: 'Review', params: { token: params.get('token') || '' } }],
      };
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
