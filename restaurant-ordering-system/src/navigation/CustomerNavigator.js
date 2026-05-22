import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useRestaurantContext } from '../context/RestaurantContext';

import MenuScreen from '../screens/customer/MenuScreen';
import CartScreen from '../screens/customer/CartScreen';
import CheckoutScreen from '../screens/customer/CheckoutScreen';
import ConfirmationScreen from '../screens/customer/ConfirmationScreen';

const Stack = createNativeStackNavigator();

export default function CustomerNavigator() {
  const { restaurant } = useRestaurantContext();
  const primaryColor = restaurant?.primary_color || '#007AFF';

  return (
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
          headerBackVisible: false,
        }}
      />
    </Stack.Navigator>
  );
}
