// Admin navigator. Shows the sidebar-based AdminLayout for authenticated staff
// and falls back to the admin LoginScreen when there is no admin session.
import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useRestaurantContext } from '../context/RestaurantContext';
import { isStaffForRestaurant, markAdminSession } from '../services/authService';
import { useTheme } from '../theme';
import AdminLayout from '../components/admin/AdminLayout';
import LoginScreen from '../screens/admin/LoginScreen';

const AdminNavigator = () => {
  const { user, loading, roleLoading } = useAuth();
  const { restaurant, loading: restaurantLoading } = useRestaurantContext();
  const { theme } = useTheme();
  const [staffForRestaurant, setStaffForRestaurant] = useState(false);
  const [tenantCheckLoading, setTenantCheckLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    if (!user?.id || !restaurant?.id) {
      setStaffForRestaurant(false);
      setTenantCheckLoading(false);
      return undefined;
    }

    setStaffForRestaurant(false);
    setTenantCheckLoading(true);
    isStaffForRestaurant(user.id, restaurant.id).then((ok) => {
      if (!cancelled) {
        if (ok) markAdminSession();
        setStaffForRestaurant(ok);
        setTenantCheckLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [user?.id, restaurant?.id]);

  // Wait for session, restaurant, and tenant staff check before Login vs Layout.
  // isStaff is "staff anywhere" — do not open the dash on that alone.
  if (loading || roleLoading || restaurantLoading || !restaurant || tenantCheckLoading) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: theme.colors.background,
        }}
      >
        <ActivityIndicator size="large" color={theme.colors.brand} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      {staffForRestaurant ? <AdminLayout /> : <LoginScreen />}
    </View>
  );
};

export default AdminNavigator;
