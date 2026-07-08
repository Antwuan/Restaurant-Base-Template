import React, { useState, useEffect, useCallback } from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import HomeScreen from '../screens/customer/HomeScreen';
import MenuScreen from '../screens/customer/MenuScreen';
import CheckoutScreen from '../screens/customer/CheckoutScreen';
import ConfirmationScreen from '../screens/customer/ConfirmationScreen';
import TrackerScreen from '../screens/customer/TrackerScreen';
import CustomerNavbar from '../components/CustomerNavbar';
import CartDrawer from '../components/CartDrawer';

const Stack = createNativeStackNavigator();

function MenuScreenWithCart({ navigation, route }) {
  const [cartOpen, setCartOpen] = useState(false);

  const openCart = useCallback(() => setCartOpen(true), []);
  const closeCart = useCallback(() => setCartOpen(false), []);

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
      <CustomerNavbar navigation={navigation} currentRoute="Menu" onOpenCart={openCart} />
      <MenuScreen />
      <CartDrawer
        visible={cartOpen}
        onClose={closeCart}
        onCheckout={handleCheckout}
      />
    </>
  );
}

function CheckoutScreenWithNav({ navigation }) {
  return (
    <>
      <CustomerNavbar navigation={navigation} currentRoute="Checkout" />
      <CheckoutScreen navigation={navigation} />
    </>
  );
}

function ConfirmationScreenWithNav({ navigation, route }) {
  return (
    <>
      <CustomerNavbar navigation={navigation} currentRoute="Confirmation" />
      <ConfirmationScreen navigation={navigation} route={route} />
    </>
  );
}

function TrackerScreenWithNav({ navigation }) {
  return <TrackerScreen navigation={navigation} />;
}

export default function CustomerNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen name="Home" component={HomeScreen} />
      <Stack.Screen name="Menu" component={MenuScreenWithCart} />
      <Stack.Screen name="Checkout" component={CheckoutScreenWithNav} />
      <Stack.Screen
        name="Confirmation"
        component={ConfirmationScreenWithNav}
      />
      <Stack.Screen name="OrderTracker" component={TrackerScreenWithNav} />
    </Stack.Navigator>
  );
}
