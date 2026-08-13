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
import CustomerNavbar from '../components/CustomerNavbar';
import CartDrawer from '../components/CartDrawer';
import { usePickupLocation } from '../context/PickupLocationContext';

// JS stack on web: native-stack keeps prior routes in document flow in static
// Expo exports, which stacked a second CustomerNavbar under Home.
const Stack =
  Platform.OS === 'web' ? createStackNavigator() : createNativeStackNavigator();

function ScreenChrome({
  navigation,
  route,
  currentRoute,
  withCart = false,
  children,
}) {
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

  // #region agent log
  useEffect(() => {
    fetch('http://127.0.0.1:7261/ingest/be8b971d-14d5-4da3-b2c6-a65e02c108c0',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'9a6c7c'},body:JSON.stringify({sessionId:'9a6c7c',runId:'post-fix',hypothesisId:'A',location:'CustomerNavigator.js:ScreenChrome',message:'ScreenChrome mounted with navbar',data:{currentRoute,withCart:!!withCart,path:typeof window!=='undefined'?window.location.pathname:null},timestamp:Date.now()})}).catch(()=>{});
  }, [currentRoute, withCart]);
  // #endregion

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
      <View style={styles.body}>{children}</View>
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

export default function CustomerNavigator() {
  return (
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
