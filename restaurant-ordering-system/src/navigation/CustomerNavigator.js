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
import CustomerNavbar from '../components/CustomerNavbar';
import CartDrawer from '../components/CartDrawer';
import ViewCartBar from '../components/ViewCartBar';
import { usePickupLocation } from '../context/PickupLocationContext';
import { useCartContext } from '../context/CartContext';
import { NavbarCollapseProvider } from '../context/NavbarCollapseContext';
import { useMobileBottomSheet } from '../components/BottomSheet';

// JS stack on web: native-stack keeps prior routes in document flow in static
// Expo exports, which stacked a second CustomerNavbar under Home.
const Stack =
  Platform.OS === 'web' ? createStackNavigator() : createNativeStackNavigator();

function ScreenChrome({
  navigation,
  route,
  currentRoute,
  withCart = false,
  withViewCart = false,
  children,
}) {
  const [cartOpen, setCartOpen] = useState(false);
  const { hasSelection, needsChoice } = usePickupLocation();
  const { itemCount } = useCartContext();
  const mobileSheet = useMobileBottomSheet();

  const openCart = useCallback(() => setCartOpen(true), []);
  const closeCart = useCallback(() => setCartOpen(false), []);

  const showViewCartBar = withViewCart && mobileSheet && itemCount > 0 && !cartOpen;

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
        onOpenCart={withCart ? openCart : undefined}
      />
      <View style={styles.body}>
        {children}
      </View>
      {showViewCartBar ? (
        <ViewCartBar itemCount={itemCount} onPress={openCart} />
      ) : null}
      {withCart ? (
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
    <ScreenChrome navigation={navigation} route={route} currentRoute="Menu" withCart withViewCart>
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

function TrackerScreenWithNav({ navigation }) {
  return (
    <View style={styles.screen}>
      <TrackerScreen navigation={navigation} />
    </View>
  );
}

function RewardsScreenWithNav({ navigation }) {
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

// Recovery links can land here from either storefront or /admin, so this screen
// renders without customer chrome.
function ResetPasswordScreenWithNav({ navigation, route }) {
  return (
    <View style={styles.screen}>
      <ResetPasswordScreen navigation={navigation} route={route} />
    </View>
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
