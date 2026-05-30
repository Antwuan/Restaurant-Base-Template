import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '../config/supabase';
import * as customerService from '../services/customerService';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [customerProfile, setCustomerProfile] = useState(null);

  const refreshCustomerProfile = useCallback(async (restaurantId) => {
    if (!restaurantId || !user?.id) {
      setCustomerProfile(null);
      return null;
    }

    try {
      const profile = await customerService.getCustomerProfile(
        restaurantId,
        user.id,
      );
      setCustomerProfile(profile);
      return profile;
    } catch {
      setCustomerProfile(null);
      return null;
    }
  }, [user?.id]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (!session?.user) {
        setCustomerProfile(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  };

  const signUp = async (email, password) => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
    if (data?.user) {
      setUser(data.user);
    }
    return data;
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    setCustomerProfile(null);
  };

  const getRestaurantForUser = async (userId) => {
    const { data, error } = await supabase
      .from('restaurant_staff')
      .select('restaurant_id, role, restaurants(*)')
      .eq('auth_user_id', userId)
      .single();

    if (error) throw error;
    return data;
  };

  const getCustomerProfile = async (restaurantId) => {
    if (!user?.id) return null;
    return customerService.getCustomerProfile(restaurantId, user.id);
  };

  const linkCustomer = async (restaurantId, email) => {
    if (!user?.id) return null;

    const existing = await customerService.getCustomerProfile(
      restaurantId,
      user.id,
    );
    if (existing) {
      setCustomerProfile(existing);
      return existing;
    }

    const created = await customerService.createCustomerProfile({
      restaurantId,
      authUserId: user.id,
      email: email || user.email,
    });
    setCustomerProfile(created);
    return created;
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        customerProfile,
        signIn,
        signUp,
        signOut,
        getRestaurantForUser,
        getCustomerProfile,
        linkCustomer,
        refreshCustomerProfile,
        isAuthenticated: !!user,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
