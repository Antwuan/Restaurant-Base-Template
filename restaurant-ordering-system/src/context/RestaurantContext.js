import React, { createContext, useContext, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { supabase } from '../config/supabase';

const RestaurantContext = createContext(null);

/**
 * Resolves the restaurant identifier using this priority order:
 *
 * WEB:
 *   1. ?restaurant=<slug> query param  — dev convenience / override
 *   2. EXPO_PUBLIC_RESTAURANT_SLUG env — local dev default (set in .env.development)
 *   3. window.location.hostname        — production (e.g. "order.pizzapalace.com")
 *
 * NATIVE:
 *   4. EXPO_PUBLIC_RESTAURANT_SLUG env — set per restaurant build in app.config.js
 */
const resolveRestaurantIdentifier = () => {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    // 1. Query param override — works on any environment
    //    Usage: localhost:8081?restaurant=pizza-palace
    const params = new URLSearchParams(window.location.search);
    const slugParam = params.get('restaurant');
    if (slugParam) return slugParam;

    const hostname = window.location.hostname;

    // 2. Local dev fallback — avoids needing the query param every time
    if (hostname === 'localhost' || hostname.startsWith('127.')) {
      return process.env.EXPO_PUBLIC_RESTAURANT_SLUG || null;
    }

    // 3. Production — match hostname against restaurants.domain in Supabase
    return hostname.replace(/^www\./, '');
  }

  // 4. Native builds — set EXPO_PUBLIC_RESTAURANT_SLUG per restaurant in app.config.js
  return process.env.EXPO_PUBLIC_RESTAURANT_SLUG || null;
};

const fetchRestaurant = async (identifier) => {
  // #region agent log
  console.log('[agent-log] fetchRestaurant called with identifier:', JSON.stringify(identifier), 'type:', typeof identifier);
  // #endregion
  if (!identifier) return null;

  // Try matching by custom domain first (production web)
  if (Platform.OS === 'web' && identifier.includes('.')) {
    // #region agent log
    console.log('[agent-log] fetchRestaurant trying DOMAIN match for', identifier);
    // #endregion
    const { data, error } = await supabase
      .from('restaurants')
      .select('*')
      .eq('domain', identifier)
      .single();

    // #region agent log
    console.log('[agent-log] DOMAIN query result', {hasData:!!data, errorCode:error?.code, errorMessage:error?.message, errorDetails:error?.details, errorHint:error?.hint, status:error?.status});
    // #endregion
    if (!error && data) return data;
  }

  // Fallback: match by slug
  // #region agent log
  console.log('[agent-log] fetchRestaurant trying SLUG match for', identifier);
  // #endregion
  const { data, error } = await supabase
    .from('restaurants')
    .select('*')
    .eq('slug', identifier)
    .single();

  // #region agent log
  console.log('[agent-log] SLUG query result', {hasData:!!data, errorCode:error?.code, errorMessage:error?.message, errorDetails:error?.details, errorHint:error?.hint, status:error?.status});
  // #endregion
  if (error) throw error;
  return data;
};

export const RestaurantProvider = ({ children }) => {
  const [restaurant, setRestaurant] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadRestaurant = async () => {
    try {
      setLoading(true);
      setError(null);
      const identifier = resolveRestaurantIdentifier();
      // #region agent log
      console.log('[agent-log] loadRestaurant resolved identifier:', JSON.stringify(identifier), 'hostname:', typeof window !== 'undefined' ? window.location.hostname : '(no window)', 'search:', typeof window !== 'undefined' ? window.location.search : '(no window)', 'envSlug:', process.env.EXPO_PUBLIC_RESTAURANT_SLUG || '(unset)');
      // #endregion
      const data = await fetchRestaurant(identifier);
      // #region agent log
      console.log('[agent-log] loadRestaurant fetchRestaurant returned:', data ? 'restaurant ' + (data.slug || data.id) : '(null)');
      // #endregion
      setRestaurant(data);
    } catch (err) {
      // #region agent log
      console.error('[agent-log] loadRestaurant caught error:', {message:err?.message, code:err?.code, details:err?.details, hint:err?.hint, status:err?.status, name:err?.name});
      // #endregion
      console.error('Failed to load restaurant:', err);
      setError(err.message || 'Failed to load restaurant');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRestaurant();
  }, []);

  return (
    <RestaurantContext.Provider
      value={{
        restaurant,
        loading,
        error,
        refresh: loadRestaurant,
      }}
    >
      {children}
    </RestaurantContext.Provider>
  );
};

export const useRestaurantContext = () => {
  const context = useContext(RestaurantContext);
  if (!context) {
    throw new Error('useRestaurantContext must be used within a RestaurantProvider');
  }
  return context;
};
