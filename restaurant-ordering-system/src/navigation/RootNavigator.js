// Web-only root navigator with deep linking and /admin branch.
import React from 'react';
import { NavigationContainer, getStateFromPath as defaultGetStateFromPath } from '@react-navigation/native';

import CustomerNavigator from './CustomerNavigator';
import AdminNavigator from './AdminNavigator';

function getLinkingPrefixes() {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return [window.location.origin];
  }
  return ['http://localhost:8081'];
}

function readIsAdminRoute() {
  if (typeof window === 'undefined') return false;
  return (window.location.pathname || '').startsWith('/admin');
}

const linking = {
  prefixes: getLinkingPrefixes(),
  config: {
    screens: {
      Admin: 'admin',
      Home: { path: '' },
      Book: 'book',
      Appointments: 'appointments',
      AppointmentConfirmation: 'booking',
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
      ResetPassword: 'reset-password',
      Cookies: 'cookies',
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
  const isAdmin = readIsAdminRoute();

  return (
    <NavigationContainer linking={linking} style={{ flex: 1 }}>
      {isAdmin ? <AdminNavigator /> : <CustomerNavigator />}
    </NavigationContainer>
  );
};

export default RootNavigator;
