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

  // #region agent log
  try {
    console.log('[agent-log] RootNavigator.js:47 INNER NavigationContainer about to render', {isAdmin,isLoading});
    fetch('http://127.0.0.1:7261/ingest/be8b971d-14d5-4da3-b2c6-a65e02c108c0',{method:'POST',headers:{'Content-Type':'text/plain'},body:JSON.stringify({sessionId:'8a29dc',hypothesisId:'A',location:'RootNavigator.js:47',message:'INNER NavigationContainer about to render in RootNavigator',data:{isAdmin,isLoading,platform:Platform.OS},timestamp:Date.now()})}).catch(()=>{});
  } catch(_) {}
  // #endregion

  return (
    <NavigationContainer linking={linking}>
      {isAdmin ? <AdminNavigator /> : <CustomerNavigator />}
    </NavigationContainer>
  );
};

export default RootNavigator;

