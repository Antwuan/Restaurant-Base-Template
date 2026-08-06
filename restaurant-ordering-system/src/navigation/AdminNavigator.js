// Admin navigator. Shows the sidebar-based AdminLayout for authenticated staff
// and falls back to the admin LoginScreen when there is no admin session.
import React from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../theme';
import AdminLayout from '../components/admin/AdminLayout';
import LoginScreen from '../screens/admin/LoginScreen';

const AdminNavigator = () => {
  const { isAdminAuthenticated, loading, roleLoading } = useAuth();
  const { theme } = useTheme();

  // Wait for session restore and staff-role lookup before choosing Login vs Layout.
  // isStaff starts false while resolving — do not treat that as logged out.
  if (loading || roleLoading) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: theme.colors.background,
        }}
      >
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      {isAdminAuthenticated ? <AdminLayout /> : <LoginScreen />}
    </View>
  );
};

export default AdminNavigator;
