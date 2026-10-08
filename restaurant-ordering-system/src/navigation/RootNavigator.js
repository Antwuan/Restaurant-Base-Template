// Web-only root navigator with deep linking and /admin branch.
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer, getStateFromPath as defaultGetStateFromPath } from '@react-navigation/native';

import CustomerNavigator from './CustomerNavigator';
import AdminNavigator from './AdminNavigator';
import { useAuth } from '../context/AuthContext';
import { hasAdminSession, clearAdminSession } from '../services/authService';

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

function readIsResetRoute() {
  if (typeof window === 'undefined') return false;
  return (window.location.pathname || '').startsWith('/reset-password');
}

function useAdminPath() {
  const [isAdmin, setIsAdmin] = useState(readIsAdminRoute);

  useEffect(() => {
    const sync = () => setIsAdmin(readIsAdminRoute());
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);

  return isAdmin;
}

const linking = {
  prefixes: getLinkingPrefixes(),
  config: {
    screens: {
      Admin: 'admin',
      Home: { path: '' },
      Book: 'book',
      Appointments: 'appointments',
      AppointmentConfirmation: {
        path: 'booking',
        parse: {
          appointmentId: (value) => value || '',
        },
      },
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
  const isAdmin = useAdminPath();
  const { signOut } = useAuth();
  const signOutRef = useRef(signOut);
  signOutRef.current = signOut;
  const [clearingAdmin, setClearingAdmin] = useState(() => (
    !readIsAdminRoute() && !readIsResetRoute() && hasAdminSession()
  ));

  // An admin session belongs to /admin. Opening the storefront, or going back
  // to it, ends that session. Password-reset links keep theirs so the new
  // password can be saved.
  useEffect(() => {
    if (isAdmin || readIsResetRoute() || !hasAdminSession()) return undefined;
    let cancelled = false;
    setClearingAdmin(true);
    clearAdminSession();
    Promise.resolve(signOutRef.current()).finally(() => {
      if (!cancelled) setClearingAdmin(false);
    });
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  if (clearingAdmin || (!isAdmin && !readIsResetRoute() && hasAdminSession())) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#9ca3af" />
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
