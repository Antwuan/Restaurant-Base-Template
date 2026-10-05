import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createStackNavigator } from '@react-navigation/stack';

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
import ResetPasswordScreen from '../screens/customer/ResetPasswordScreen';
import CookiesScreen from '../screens/customer/CookiesScreen';
import BookScreen from '../screens/customer/BookScreen';
import AppointmentConfirmationScreen from '../screens/customer/AppointmentConfirmationScreen';
import MyAppointmentsScreen from '../screens/customer/MyAppointmentsScreen';
import CustomerNavbar from '../components/CustomerNavbar';
import CartDrawer from '../components/CartDrawer';
import ViewCartBar from '../components/ViewCartBar';
import { useRestaurantContext } from '../context/RestaurantContext';
import { isAppointmentBusiness } from '../utils/businessType';
import { usePickupLocation } from '../context/PickupLocationContext';
import { useCartContext } from '../context/CartContext';
import { NavbarCollapseProvider } from '../context/NavbarCollapseContext';
import { useMobileBottomSheet } from '../components/BottomSheet';

// JS stack on web: native-stack keeps prior routes in document flow in static
// Expo exports, which stacked a second CustomerNavbar under Home.
const Stack =
  Platform.OS === 'web' ? createStackNavigator() : createNativeStackNavigator();

const ORDERING_ROUTES = new Set([
  'Menu',
  'Catering',
  'Rewards',
  'Hiring',
  'Checkout',
  'Confirmation',
  'OrderTracker',
]);

function useOrderingRedirect(navigation, routeName) {
  const { restaurant, loading } = useRestaurantContext();
  const blocked = !loading && isAppointmentBusiness(restaurant) && ORDERING_ROUTES.has(routeName);
  useEffect(() => {
    if (blocked) navigation.replace('Book');
  }, [blocked, navigation]);
  return blocked;
}

function ScreenChrome({
  navigation,
  route,
  currentRoute,
  withCart = false,
  withViewCart = false,
  children,
}) {
  const { restaurant } = useRestaurantContext();
  const appointment = isAppointmentBusiness(restaurant);
  const cartEnabled = withCart && !appointment;
  const [cartOpen, setCartOpen] = useState(false);
  const { hasSelection, needsChoice } = usePickupLocation();
  const { itemCount } = useCartContext();
  const mobileSheet = useMobileBottomSheet();

  const openCart = useCallback(() => setCartOpen(true), []);
  const closeCart = useCallback(() => setCartOpen(false), []);

  const showViewCartBar = cartEnabled && withViewCart && mobileSheet && itemCount > 0 && !cartOpen;

  useEffect(() => {
    if (withCart && route.params?.openCart) {
      setCartOpen(true);
      navigation.setParams({ openCart: undefined });
    }
  }, [withCart, route.params?.openCart, navigation]);

  const handleCheckout = () => {
    if (needsChoice || !hasSelection) return;
    setCartOpen(false);
    navigation.navigate('Checkout');
  };

  return (
    <View style={styles.screen}>
      <CustomerNavbar
        navigation={navigation}
        currentRoute={currentRoute}
        onOpenCart={cartEnabled ? openCart : undefined}
      />
      <View style={styles.body}>
        {children}
      </View>
      {showViewCartBar ? (
        <ViewCartBar itemCount={itemCount} onPress={openCart} />
      ) : null}
      {cartEnabled ? (
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
  const blocked = useOrderingRedirect(navigation, 'Menu');
  if (blocked) return null;
  return (
    <ScreenChrome navigation={navigation} route={route} currentRoute="Menu" withCart withViewCart>
      <MenuScreen />
    </ScreenChrome>
  );
}

function CheckoutScreenWithNav({ navigation, route }) {
  const blocked = useOrderingRedirect(navigation, 'Checkout');
  if (blocked) return null;
  return (
    <ScreenChrome navigation={navigation} route={route} currentRoute="Checkout">
      <CheckoutScreen navigation={navigation} />
    </ScreenChrome>
  );
}

function ConfirmationScreenWithNav({ navigation, route }) {
  const blocked = useOrderingRedirect(navigation, 'Confirmation');
  if (blocked) return null;
  return (
    <ScreenChrome navigation={navigation} route={route} currentRoute="Confirmation">
      <ConfirmationScreen navigation={navigation} route={route} />
    </ScreenChrome>
  );
}

function TrackerScreenWithNav({ navigation }) {
  const blocked = useOrderingRedirect(navigation, 'OrderTracker');
  if (blocked) return null;
  return (
    <View style={styles.screen}>
      <TrackerScreen navigation={navigation} />
    </View>
  );
}

function RewardsScreenWithNav({ navigation }) {
  const blocked = useOrderingRedirect(navigation, 'Rewards');
  if (blocked) return null;
  return (
    <View style={styles.screen}>
      <RewardsScreen navigation={navigation} />
    </View>
  );
}

function ProfileScreenWithNav({ navigation }) {
  return (
    <View style={styles.screen}>
      <ProfileScreen navigation={navigation} />
    </View>
  );
}

function HiringScreenWithNav({ navigation, route }) {
  const blocked = useOrderingRedirect(navigation, 'Hiring');
  if (blocked) return null;
  return (
    <ScreenChrome navigation={navigation} route={route} currentRoute="Hiring">
      <HiringScreen navigation={navigation} />
    </ScreenChrome>
  );
}

function CateringScreenWithNav({ navigation, route }) {
  const blocked = useOrderingRedirect(navigation, 'Catering');
  if (blocked) return null;
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

// Recovery links can land here from either storefront or /admin, so this screen
// renders without customer chrome.
function ResetPasswordScreenWithNav({ navigation, route }) {
  return (
    <View style={styles.screen}>
      <ResetPasswordScreen navigation={navigation} route={route} />
    </View>
  );
}

function BookScreenWithNav({ navigation, route }) {
  return (
    <ScreenChrome navigation={navigation} route={route} currentRoute="Book">
      <BookScreen navigation={navigation} />
    </ScreenChrome>
  );
}

function AppointmentConfirmationWithNav({ navigation, route }) {
  return (
    <ScreenChrome navigation={navigation} route={route} currentRoute="AppointmentConfirmation">
      <AppointmentConfirmationScreen navigation={navigation} route={route} />
    </ScreenChrome>
  );
}

function MyAppointmentsWithNav({ navigation, route }) {
  return (
    <ScreenChrome navigation={navigation} route={route} currentRoute="Appointments">
      <MyAppointmentsScreen navigation={navigation} />
    </ScreenChrome>
  );
}

function CookiesScreenWithNav({ navigation, route }) {
  return (
    <ScreenChrome navigation={navigation} route={route} currentRoute="Cookies">
      <CookiesScreen navigation={navigation} />
    </ScreenChrome>
  );
}

export default function CustomerNavigator() {
  return (
    <NavbarCollapseProvider>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          animationEnabled: Platform.OS === 'web' ? false : true,
          cardStyle: styles.stackContent,
          contentStyle: styles.stackContent,
        }}
      >
        <Stack.Screen name="Home" component={HomeScreenWithCart} />
        <Stack.Screen name="Book" component={BookScreenWithNav} />
        <Stack.Screen name="Appointments" component={MyAppointmentsWithNav} />
        <Stack.Screen name="AppointmentConfirmation" component={AppointmentConfirmationWithNav} />
        <Stack.Screen name="Menu" component={MenuScreenWithCart} />
        <Stack.Screen name="Catering" component={CateringScreenWithNav} />
        <Stack.Screen name="Rewards" component={RewardsScreenWithNav} />
        <Stack.Screen name="Profile" component={ProfileScreenWithNav} />
        <Stack.Screen name="Hiring" component={HiringScreenWithNav} />
        <Stack.Screen name="Checkout" component={CheckoutScreenWithNav} />
        <Stack.Screen name="Confirmation" component={ConfirmationScreenWithNav} />
        <Stack.Screen name="OrderTracker" component={TrackerScreenWithNav} />
        <Stack.Screen name="Review" component={ReviewScreenWithNav} />
        <Stack.Screen name="ResetPassword" component={ResetPasswordScreenWithNav} />
        <Stack.Screen name="Cookies" component={CookiesScreenWithNav} />
      </Stack.Navigator>
    </NavbarCollapseProvider>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    minHeight: '100%',
    position: 'relative',
    ...Platform.select({
      web: {
        height: '100%',
        maxHeight: '100%',
        overflow: 'hidden',
      },
    }),
  },
  body: {
    flex: 1,
    minHeight: 0,
  },
  stackContent: {
    flex: 1,
    ...Platform.select({
      web: { height: '100%', overflow: 'hidden' },
    }),
  },
});
