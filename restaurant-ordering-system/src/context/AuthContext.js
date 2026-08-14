import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
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
      if (ensured) setCustomerProfile(ensured);
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
        // Do not gate on roleLoading: isStaff stays false until the staff lookup
        // finishes, so a restored customer session can show Profile immediately.
        // AdminNavigator already waits on roleLoading before choosing Login vs Layout.
        isCustomerAuthenticated: !!user && !isStaff,
        isAdminAuthenticated: !!user && isStaff,
        signIn,
        signUp,
        signOut,
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
