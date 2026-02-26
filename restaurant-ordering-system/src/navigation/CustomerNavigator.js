// src/navigation/CustomerNavigator.js
// Updated for Phase 13: Wrap with StripeProvider

import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StripeProvider } from '@stripe/stripe-react-native';
import { useRestaurantContext } from '../context/RestaurantContext';

import MenuScreen from '../screens/customer/MenuScreen';
import CartScreen from '../screens/customer/CartScreen';
import CheckoutScreen from '../screens/customer/CheckoutScreen';
import ConfirmationScreen from '../screens/customer/ConfirmationScreen';

const Stack = createNativeStackNavigator();

const STRIPE_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY || '';

export default function CustomerNavigator() {
  const { restaurant } = useRestaurantContext();
  const primaryColor = restaurant?.primary_color || '#007AFF';

  return (
    // StripeProvider must wrap any screen that uses Stripe (CardField, useStripe, etc.)
    <StripeProvider
      publishableKey={STRIPE_PUBLISHABLE_KEY}
      merchantIdentifier="merchant.com.yourcompany.restaurantordering" // Required for Apple Pay
    >
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: primaryColor },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: '600' },
        }}
      >
        <Stack.Screen
          name="Menu"
          component={MenuScreen}
          options={{ title: restaurant?.name || 'Menu' }}
        />
        <Stack.Screen
          name="Cart"
          component={CartScreen}
          options={{ title: 'Your Cart' }}
        />
        <Stack.Screen
          name="Checkout"
          component={CheckoutScreen}
          options={{ title: 'Checkout' }}
        />
        <Stack.Screen
          name="Confirmation"
          component={ConfirmationScreen}
          options={{
            title: 'Order Confirmed',
            headerBackVisible: false, // Prevent going back after order placed
          }}
        />
      </Stack.Navigator>
    </StripeProvider>
  );
}


// ─── .env additions needed for Phase 13 ────────────────────────────────────
//
// EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
// EXPO_PUBLIC_BACKEND_URL=https://<your-project>.supabase.co/functions/v1
//
// Supabase Edge Function secrets (set via Supabase dashboard or CLI):
//   supabase secrets set STRIPE_SECRET_KEY=sk_test_...
//   supabase secrets set SUPABASE_SERVICE_ROLE_KEY=...
//
// ────────────────────────────────────────────────────────────────────────────


// ─── Stripe test cards ───────────────────────────────────────────────────────
//
// ✅ Success:           4242 4242 4242 4242
// ❌ Declined:          4000 0000 0000 0002
// 💸 Insufficient funds: 4000 0000 0000 9995
// 🔐 3D Secure required: 4000 0025 0000 3155
//
// Use any future expiry (e.g. 12/34) and any 3-digit CVC.
// ────────────────────────────────────────────────────────────────────────────