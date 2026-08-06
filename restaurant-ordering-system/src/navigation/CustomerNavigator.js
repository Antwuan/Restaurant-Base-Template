import React, { useState, useEffect, useCallback } from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import HomeScreen from '../screens/customer/HomeScreen';
import MenuScreen from '../screens/customer/MenuScreen';
import CheckoutScreen from '../screens/customer/CheckoutScreen';
import ConfirmationScreen from '../screens/customer/ConfirmationScreen';
import TrackerScreen from '../screens/customer/TrackerScreen';
import RewardsScreen from '../screens/customer/RewardsScreen';
import HiringScreen from '../screens/customer/HiringScreen';
import CateringScreen from '../screens/customer/CateringScreen';
import ReviewScreen from '../screens/customer/ReviewScreen';
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

function RewardsScreenWithNav({ navigation }) {
  return <RewardsScreen navigation={navigation} />;
}

function HiringScreenWithNav({ navigation }) {
  return (
    <>
      <CustomerNavbar navigation={navigation} currentRoute="Hiring" />
      <HiringScreen navigation={navigation} />
    </>
  );
}

function CateringScreenWithNav({ navigation, route }) {
  return (
    <>
      <CustomerNavbar navigation={navigation} currentRoute="Catering" />
      <CateringScreen navigation={navigation} route={route} />
    </>
  );
}

function ReviewScreenWithNav({ navigation, route }) {
  return <ReviewScreen navigation={navigation} route={route} />;
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
      <Stack.Screen name="Catering" component={CateringScreenWithNav} />
      <Stack.Screen name="Rewards" component={RewardsScreenWithNav} />
      <Stack.Screen name="Hiring" component={HiringScreenWithNav} />
      <Stack.Screen name="Checkout" component={CheckoutScreenWithNav} />
      <Stack.Screen
        name="Confirmation"
        component={ConfirmationScreenWithNav}
      />
      <Stack.Screen name="OrderTracker" component={TrackerScreenWithNav} />
      <Stack.Screen name="Review" component={ReviewScreenWithNav} />
    </Stack.Navigator>
  );
}
