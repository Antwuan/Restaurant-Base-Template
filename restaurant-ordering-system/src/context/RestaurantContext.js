import React, { createContext, useContext, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { supabase } from '../config/supabase';

const RestaurantContext = createContext(null);

/**
 * Resolves the restaurant identifier from:
 * - Web: window.location.hostname (e.g. "myrestaurant.com" or "slug.yourplatform.com")
 * - Mobile: EXPO_PUBLIC_RESTAURANT_SLUG env variable set per app config
 */
const resolveRestaurantIdentifier = () => {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    // Strip www. prefix if present
    return hostname.replace(/^www\./, '');
  }
  // Mobile: use env variable set per restaurant build
  return process.env.EXPO_PUBLIC_RESTAURANT_SLUG || null;
};

const fetchRestaurant = async (identifier) => {
  if (!identifier) return null;

  // First try matching by custom domain (web)
  if (Platform.OS === 'web' && identifier.includes('.')) {
    const { data, error } = await supabase
      .from('restaurants')
      .select('*')
      .eq('domain', identifier)
      .single();

    if (!error && data) return data;
  }

  // Fallback: match by slug
  const { data, error } = await supabase
    .from('restaurants')
    .select('*')
    .eq('slug', identifier)
    .single();

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
      const data = await fetchRestaurant(identifier);
      setRestaurant(data);
    } catch (err) {
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
