import React, { useState, useEffect, useCallback } from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useRestaurantContext } from '../context/RestaurantContext';

import MenuScreen from '../screens/customer/MenuScreen';
import CheckoutScreen from '../screens/customer/CheckoutScreen';
import ConfirmationScreen from '../screens/customer/ConfirmationScreen';
import MenuHeaderActions from '../components/MenuHeaderActions';
import CartDrawer from '../components/CartDrawer';

const Stack = createNativeStackNavigator();

function MenuScreenWithCart({ navigation, route }) {
  const [cartOpen, setCartOpen] = useState(false);

  const openCart = useCallback(() => setCartOpen(true), []);
  const closeCart = useCallback(() => setCartOpen(false), []);

  useEffect(() => {
    navigation.setOptions({
      headerRight: () => <MenuHeaderActions onOpenCart={openCart} />,
    });
  }, [navigation, openCart]);

  useEffect(() => {
    if (route.params?.openCart) {
      setCartOpen(true);
      navigation.setParams({ openCart: undefined });
    }
  }, [route.params?.openCart, navigation]);

  const handleCheckout = () => {
    setCartOpen(false);
    navigation.navigate('Checkout');
  };

  return (
    <>
      <MenuScreen />
      <CartDrawer
        visible={cartOpen}
        onClose={closeCart}
        onCheckout={handleCheckout}
      />
    </>
  );
}

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
        component={MenuScreenWithCart}
        options={{
          title: restaurant?.name || 'Menu',
        }}
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
