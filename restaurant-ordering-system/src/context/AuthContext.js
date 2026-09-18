import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../config/supabase';
import * as customerService from '../services/customerService';
import * as authService from '../services/authService';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [customerProfile, setCustomerProfile] = useState(null);
  // Default false until staff lookup finishes — do not assume staff.
  const [isStaff, setIsStaff] = useState(false);
  // True while isStaffUser is in flight for a present user; false when resolved or no user.
  const [roleLoading, setRoleLoading] = useState(false);
  // Set when Supabase parses a recovery link out of the URL. ResetPasswordScreen
  // uses it to tell "arrived from an email link" from "opened /reset-password".
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  // Track auth user id so same-user events (e.g. TOKEN_REFRESHED) do not
  // flip roleLoading — AdminNavigator would otherwise stick on the spinner.
  const userIdRef = useRef(null);

  const applyUser = useCallback((nextUser) => {
    const nextId = nextUser?.id ?? null;
    const prevId = userIdRef.current;
    userIdRef.current = nextId;

    setUser(nextUser);

    // Only reset role/profile state when the auth identity actually changes.
    if (nextId === prevId) return;

    if (nextUser) {
      // Mark role unresolved immediately so navigators don't flash LoginScreen
      // before the staff-lookup effect runs.
      setCustomerProfile(null);
      setIsStaff(false);
      setRoleLoading(true);
    } else {
      setCustomerProfile(null);
      setIsStaff(false);
      setRoleLoading(false);
    }
  }, []);

  const refreshCustomerProfile = useCallback(async (restaurantId) => {
    // Only clear when there is no user/restaurant — keep last good profile on fetch errors.
    if (!restaurantId || !user?.id) {
      setCustomerProfile(null);
      return null;
    }

    try {
      const profile = await customerService.getCustomerProfile(
        restaurantId,
        user.id,
      );
      // Never overwrite a good balance with null (race / brief miss shows 0 pts).
      if (profile) {
        setCustomerProfile(profile);
      } else {
        setCustomerProfile((prev) => {
          if (prev && prev.restaurant_id === restaurantId) return prev;
          return null;
        });
      }
      return profile;
    } catch {
      return null;
    }
  }, [user?.id]);

  /** Merge fields into the in-memory customer profile (e.g. points after redeem). */
  const patchCustomerProfile = useCallback((patch) => {
    if (!patch || typeof patch !== 'object') return;
    setCustomerProfile((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      applyUser(session?.user ?? null);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') setPasswordRecovery(true);
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
        .limit(1);
      if (error || !(data?.length > 0)) return false;
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
    if (error) throw authService.mapAuthError(error, 'signin');
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
    const emailRedirectTo =
      typeof window !== 'undefined' ? window.location.origin : undefined;
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo,
        data: options.restaurantId
          ? { restaurant_id: options.restaurantId }
          : undefined,
      },
    });
    if (error) throw authService.mapAuthError(error, 'signup');
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
    setPasswordRecovery(false);
    applyUser(null);
  };

  /** Emails a recovery link pointing at /reset-password. Never reveals whether the account exists. */
  const resetPasswordForEmail = (email) => authService.resetPasswordForEmail(email);

  /** Re-sends the sign-up confirmation email for an unconfirmed account. */
  const resendSignupEmail = (email) => authService.resendSignupEmail(email);

  /** Sets a new password on the current (usually recovery) session. */
  const updatePassword = async (newPassword) => {
    const updatedUser = await authService.updatePassword(newPassword);
    setPasswordRecovery(false);
    if (updatedUser) applyUser(updatedUser);
    return updatedUser;
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

  const linkCustomer = useCallback(async (restaurantId, email, authUser, extras = {}) => {
    const userId = authUser?.id ?? user?.id;
    if (!userId) return null;
    const firstName = extras.firstName ?? null;
    const lastName = extras.lastName ?? null;
    const phone = extras.phone ?? null;
    const marketingOptIn =
      typeof extras.marketingOptIn === 'boolean' ? extras.marketingOptIn : null;

    const existing = await customerService.getCustomerProfile(
      restaurantId,
      userId,
    );
    if (existing) {
      await customerService.attachGuestOrdersToCustomer(restaurantId);
      setCustomerProfile(existing);
      return existing;
    }

    try {
      const created = await customerService.createCustomerProfile({
        restaurantId,
        authUserId: userId,
        email: email || authUser?.email || user?.email,
        firstName,
        lastName,
        phone,
        marketingOptIn,
      });
      await customerService.attachGuestOrdersToCustomer(restaurantId);
      setCustomerProfile(created);
      return created;
    } catch {
      // RLS insert can fail without a session — fall back to service-role edge function
      const ensured = await customerService.ensureCustomerProfile({
        restaurantId,
        userId,
        email: email || authUser?.email || user?.email,
        firstName,
        lastName,
        phone,
        marketingOptIn,
      });
      if (ensured) {
        await customerService.attachGuestOrdersToCustomer(restaurantId);
        setCustomerProfile(ensured);
      }
      return ensured;
    }
  }, [user?.id, user?.email]);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        roleLoading,
        customerProfile,
        isStaff,
        // Customer storefront auth is session-based; staff status does not
        // block customer UI. AdminNavigator still waits on roleLoading.
        isCustomerAuthenticated: !!user,
        isAdminAuthenticated: !!user && isStaff,
        signIn,
        signUp,
        signOut,
        resetPasswordForEmail,
        resendSignupEmail,
        updatePassword,
        passwordRecovery,
        getRestaurantForUser,
        isStaffUser,
        getCustomerProfile,
        linkCustomer,
        refreshCustomerProfile,
        patchCustomerProfile,
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
