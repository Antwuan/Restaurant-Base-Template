import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '../config/supabase';
import * as customerService from '../services/customerService';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [customerProfile, setCustomerProfile] = useState(null);
  // Default false until staff lookup finishes — do not assume staff.
  const [isStaff, setIsStaff] = useState(false);
  // True while isStaffUser is in flight for a present user; false when resolved or no user.
  const [roleLoading, setRoleLoading] = useState(false);

  const applyUser = useCallback((nextUser) => {
    setUser(nextUser);
    if (nextUser) {
      // Mark role unresolved immediately so navigators don't flash LoginScreen
      // before the staff-lookup effect runs.
      setRoleLoading(true);
    } else {
      setCustomerProfile(null);
      setIsStaff(false);
      setRoleLoading(false);
    }
  }, []);

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
      applyUser(session?.user ?? null);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      applyUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, [applyUser]);

  /** True only when a restaurant_staff row exists for this auth user. False on null/error. */
  const isStaffUser = useCallback(async (userId) => {
    if (!userId) return false;
    try {
      const { data, error } = await supabase
        .from('restaurant_staff')
        .select('id, role')
        .eq('auth_user_id', userId)
        .maybeSingle();
      if (error || !data) return false;
      return true;
    } catch {
      return false;
    }
  }, []);

  // Resolve staff when the session user changes. Stay false until known.
  useEffect(() => {
    let cancelled = false;

    if (!user?.id) {
      setIsStaff(false);
      setRoleLoading(false);
      return undefined;
    }

    setIsStaff(false);
    setRoleLoading(true);
    isStaffUser(user.id).then((staff) => {
      if (!cancelled) {
        setIsStaff(staff);
        setRoleLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [user?.id, isStaffUser]);

  const signIn = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    if (data?.session) {
      await supabase.auth.setSession(data.session);
    }
    if (data?.user) {
      applyUser(data.user);
    }
    return data;
  };

  /** @param {string} email @param {string} password @param {{ restaurantId?: string }} [options] */
  const signUp = async (email, password, options = {}) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: options.restaurantId
          ? { restaurant_id: options.restaurantId }
          : undefined,
      },
    });
    if (error) throw error;
    // Ensure the client JWT is set before any RLS inserts (linkCustomer).
    if (data?.session) {
      await supabase.auth.setSession(data.session);
    }
    if (data?.user) {
      applyUser(data.user);
    }
    return data;
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    // Clear state immediately so UI switches to login without waiting for
    // the onAuthStateChange event (which can be delayed on web).
    applyUser(null);
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

  const linkCustomer = async (restaurantId, email, authUser) => {
    const userId = authUser?.id ?? user?.id;
    if (!userId) return null;

    const existing = await customerService.getCustomerProfile(
      restaurantId,
      userId,
    );
    if (existing) {
      setCustomerProfile(existing);
      return existing;
    }

    try {
      const created = await customerService.createCustomerProfile({
        restaurantId,
        authUserId: userId,
        email: email || authUser?.email || user?.email,
      });
      setCustomerProfile(created);
      return created;
    } catch {
      // RLS insert can fail without a session — fall back to service-role edge function
      const ensured = await customerService.ensureCustomerProfile({
        restaurantId,
        userId,
        email: email || authUser?.email || user?.email,
      });
      if (ensured) setCustomerProfile(ensured);
      return ensured;
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        roleLoading,
        customerProfile,
        isStaff,
        isCustomerAuthenticated: !!user && !isStaff && !roleLoading,
        isAdminAuthenticated: !!user && isStaff,
        signIn,
        signUp,
        signOut,
        getRestaurantForUser,
        isStaffUser,
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
