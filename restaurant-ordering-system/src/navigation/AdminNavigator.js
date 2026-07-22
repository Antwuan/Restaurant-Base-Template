// Admin navigator. Shows the sidebar-based AdminLayout for authenticated staff
// and falls back to the admin LoginScreen when there is no active user.
import React from 'react';
import { View } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../theme';
import AdminLayout from '../components/admin/AdminLayout';
import LoginScreen from '../screens/admin/LoginScreen';

const AdminNavigator = () => {
  const { user } = useAuth();
  const { theme } = useTheme();

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      {user ? <AdminLayout /> : <LoginScreen />}
    </View>
  );
};

export default AdminNavigator;
