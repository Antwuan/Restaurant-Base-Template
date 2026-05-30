// Admin bottom tab navigator. Shows Orders, Menu editor, Promo carousel, and Settings tabs
// for authenticated staff, and falls back to the admin LoginScreen when
// there is no active user in AuthContext.
import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../theme';
import { useAuth } from '../context/AuthContext';

import LoginScreen from '../screens/admin/LoginScreen';
import OrdersScreen from '../screens/admin/OrdersScreen';
import MenuEditorScreen from '../screens/admin/MenuEditorScreen';
import CarouselEditorScreen from '../screens/admin/CarouselEditorScreen';
import SettingsScreen from '../screens/admin/SettingsScreen';

const Tab = createBottomTabNavigator();

const AdminNavigator = () => {
  const { theme } = useTheme();
  const { user } = useAuth();

  if (!user) {
    return <LoginScreen />;
  }

  return (
    <Tab.Navigator
      initialRouteName="Orders"
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName;

          if (route.name === 'Orders') {
            iconName = focused ? 'receipt' : 'receipt-outline';
          } else if (route.name === 'MenuEditor') {
            iconName = focused ? 'restaurant' : 'restaurant-outline';
          } else if (route.name === 'Promo') {
            iconName = focused ? 'images' : 'images-outline';
          } else if (route.name === 'Settings') {
            iconName = focused ? 'settings' : 'settings-outline';
          }

          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: theme.colors.brand,
        tabBarInactiveTintColor: '#8e8e93',
        tabBarStyle: {
          backgroundColor: '#fff',
          borderTopColor: '#e0e0e0',
        },
        headerStyle: {
          backgroundColor: theme.colors.brand,
        },
        headerTintColor: '#fff',
        headerTitleStyle: {
          fontWeight: '600',
        },
      })}
    >
      <Tab.Screen
        name="Orders"
        component={OrdersScreen}
        options={{ title: 'Orders' }}
      />
      <Tab.Screen
        name="MenuEditor"
        component={MenuEditorScreen}
        options={{ title: 'Menu', tabBarLabel: 'Menu' }}
      />
      <Tab.Screen
        name="Promo"
        component={CarouselEditorScreen}
        options={{ title: 'Promo Carousel', tabBarLabel: 'Promo' }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ title: 'Settings' }}
      />
    </Tab.Navigator>
  );
};

export default AdminNavigator;
