// Admin navigator. Shows the sidebar-based AdminLayout for authenticated staff
// and falls back to the admin LoginScreen when there is no active user.
import React from 'react';
import { useAuth } from '../context/AuthContext';
import AdminLayout from '../components/admin/AdminLayout';
import LoginScreen from '../screens/admin/LoginScreen';

const AdminNavigator = () => {
  const { user } = useAuth();

  if (!user) {
    return <LoginScreen />;
  }

  return <AdminLayout />;
};

export default AdminNavigator;
