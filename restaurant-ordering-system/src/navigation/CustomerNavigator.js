import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import HomeScreen from '../screens/customer/HomeScreen';
import MenuScreen from '../screens/customer/MenuScreen';
import CheckoutScreen from '../screens/customer/CheckoutScreen';
import ConfirmationScreen from '../screens/customer/ConfirmationScreen';
import TrackerScreen from '../screens/customer/TrackerScreen';
import RewardsScreen from '../screens/customer/RewardsScreen';
import ProfileScreen from '../screens/customer/ProfileScreen';
import HiringScreen from '../screens/customer/HiringScreen';
import CateringScreen from '../screens/customer/CateringScreen';
import ReviewScreen from '../screens/customer/ReviewScreen';
import CustomerNavbar from '../components/CustomerNavbar';
import CartDrawer from '../components/CartDrawer';
import { usePickupLocation } from '../context/PickupLocationContext';

const Stack = createNativeStackNavigator();

/**
 * One chrome shell per customer route so native-stack web can't leave a second
 * sticky navbar in document flow from another mounted screen.
 */
function ScreenChrome({
  navigation,
  route,
  currentRoute,
  withCart = false,
  children,
}) {
  const isFocused = useIsFocused();
  const [cartOpen, setCartOpen] = useState(false);
  const { hasSelection, needsChoice } = usePickupLocation();

  const openCart = useCallback(() => setCartOpen(true), []);
  const closeCart = useCallback(() => setCartOpen(false), []);

  useEffect(() => {
    if (withCart && route.params?.openCart) {
      setCartOpen(true);
      navigation.setParams({ openCart: undefined });
    }
  }, [withCart, route.params?.openCart, navigation]);

  useEffect(() => {
    if (!isFocused) setCartOpen(false);
  }, [isFocused]);

  const handleCheckout = () => {
    if (needsChoice || !hasSelection) return;
    setCartOpen(false);
    navigation.navigate('Checkout');
  };

  return (
    <View style={styles.screen}>
      {isFocused ? (
        <CustomerNavbar
          navigation={navigation}
          currentRoute={currentRoute}
          onOpenCart={withCart ? openCart : undefined}
        />
      ) : null}
      <View style={styles.body}>{children}</View>
      {withCart && isFocused ? (
        <CartDrawer
          visible={cartOpen}
          onClose={closeCart}
          onCheckout={handleCheckout}
        />
      ) : null}
    </View>
  );
}

function HomeScreenWithCart({ navigation, route }) {
  return (
    <ScreenChrome navigation={navigation} route={route} currentRoute="Home" withCart>
      <HomeScreen navigation={navigation} />
    </ScreenChrome>
  );
}

function MenuScreenWithCart({ navigation, route }) {
  return (
    <ScreenChrome navigation={navigation} route={route} currentRoute="Menu" withCart>
      <MenuScreen />
    </ScreenChrome>
  );
}

function CheckoutScreenWithNav({ navigation, route }) {
  return (
    <ScreenChrome navigation={navigation} route={route} currentRoute="Checkout">
      <CheckoutScreen navigation={navigation} />
    </ScreenChrome>
  );
}

function ConfirmationScreenWithNav({ navigation, route }) {
  return (
    <ScreenChrome navigation={navigation} route={route} currentRoute="Confirmation">
      <ConfirmationScreen navigation={navigation} route={route} />
    </ScreenChrome>
  );
}

function TrackerScreenWithNav({ navigation, route }) {
  return (
    <View style={styles.screen}>
      <TrackerScreen navigation={navigation} />
    </View>
  );
}

function RewardsScreenWithNav({ navigation, route }) {
  return (
    <View style={styles.screen}>
      <RewardsScreen navigation={navigation} />
    </View>
  );
}

function ProfileScreenWithNav({ navigation, route }) {
  return (
    <View style={styles.screen}>
      <ProfileScreen navigation={navigation} />
    </View>
  );
}

function HiringScreenWithNav({ navigation, route }) {
  return (
    <ScreenChrome navigation={navigation} route={route} currentRoute="Hiring">
      <HiringScreen navigation={navigation} />
    </ScreenChrome>
  );
}

function CateringScreenWithNav({ navigation, route }) {
  return (
    <ScreenChrome navigation={navigation} route={route} currentRoute="Catering">
      <CateringScreen navigation={navigation} route={route} />
    </ScreenChrome>
  );
}

function ReviewScreenWithNav({ navigation, route }) {
  return (
    <View style={styles.screen}>
      <ReviewScreen navigation={navigation} route={route} />
    </View>
  );
}

export default function CustomerNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        animation: 'fade',
        contentStyle: styles.stackContent,
      }}
    >
      <Stack.Screen name="Home" component={HomeScreenWithCart} />
      <Stack.Screen name="Menu" component={MenuScreenWithCart} />
      <Stack.Screen name="Catering" component={CateringScreenWithNav} />
      <Stack.Screen name="Rewards" component={RewardsScreenWithNav} />
      <Stack.Screen name="Profile" component={ProfileScreenWithNav} />
      <Stack.Screen name="Hiring" component={HiringScreenWithNav} />
      <Stack.Screen name="Checkout" component={CheckoutScreenWithNav} />
      <Stack.Screen name="Confirmation" component={ConfirmationScreenWithNav} />
      <Stack.Screen name="OrderTracker" component={TrackerScreenWithNav} />
      <Stack.Screen name="Review" component={ReviewScreenWithNav} />
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    minHeight: '100%',
  },
  body: {
    flex: 1,
  },
  stackContent: {
    flex: 1,
  },
});
