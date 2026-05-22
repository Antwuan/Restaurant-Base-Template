/**
 * RestaurantContext — web-only restaurant resolution.
 *
 * Priority:
 *   1. ?restaurant=<slug>
 *   2. sessionStorage restaurant_slug (survives /menu navigation)
 *   3. EXPO_PUBLIC_RESTAURANT_SLUG on localhost
 *   4. First URL path segment (not a reserved app route)
 *   5. Hostname → restaurants.domain (non-localhost)
 */

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { restaurantService } from '../services/restaurantService';

const RestaurantContext = createContext(null);

const SESSION_SLUG_KEY = 'restaurant_slug';

const RESERVED_PATH_SEGMENTS = new Set([
  'menu',
  'cart',
  'checkout',
  'confirmation',
  'admin',
]);

function isLocalhost(hostname) {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname.startsWith('192.168.') ||
    hostname.endsWith('.local')
  );
}

/**
 * @returns {{ type: 'slug' | 'domain', value: string } | null}
 */
function getRestaurantIdentifierFromURL() {
  if (typeof window === 'undefined') return null;

  const hostname = window.location.hostname;
  const params = new URLSearchParams(window.location.search);
  const slugParam = params.get('restaurant');

  if (slugParam) {
    return { type: 'slug', value: slugParam };
  }

  try {
    const stored = sessionStorage.getItem(SESSION_SLUG_KEY);
    if (stored) {
      return { type: 'slug', value: stored };
    }
  } catch {
    // sessionStorage unavailable
  }

  if (isLocalhost(hostname)) {
    const envSlug = process.env.EXPO_PUBLIC_RESTAURANT_SLUG;
    if (envSlug) {
      return { type: 'slug', value: envSlug };
    }
  } else {
    return { type: 'domain', value: hostname.replace(/^www\./, '') };
  }

  const pathSegments = window.location.pathname.split('/').filter(Boolean);
  const first = pathSegments[0];
  if (first && !RESERVED_PATH_SEGMENTS.has(first)) {
    return { type: 'slug', value: first };
  }

  return null;
}

function persistSlug(slug) {
  try {
    sessionStorage.setItem(SESSION_SLUG_KEY, slug);
  } catch {
    // ignore
  }
}

export function RestaurantProvider({ children }) {
  const [restaurant, setRestaurant] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadRestaurant = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const identifier = getRestaurantIdentifierFromURL();

      if (!identifier) {
        setError('No restaurant identifier found in URL.');
        setRestaurant(null);
        return;
      }

      let data;
      if (identifier.type === 'domain') {
        data = await restaurantService.getRestaurantByDomain(identifier.value);
      } else {
        data = await restaurantService.getRestaurantBySlug(identifier.value);
      }

      if (!data) {
        setError(`Restaurant not found (${identifier.type}: ${identifier.value})`);
        setRestaurant(null);
        return;
      }

      setRestaurant(data);
      if (identifier.type === 'slug') {
        persistSlug(identifier.value);
      }

      const themeColorMeta = document.querySelector('meta[name="theme-color"]');
      if (themeColorMeta && data.primary_color) {
        themeColorMeta.setAttribute('content', data.primary_color);
      }
      if (data.name) {
        document.title = `${data.name} — Order Online`;
      }
    } catch (err) {
      console.error('[RestaurantContext] Failed to load restaurant:', err);
      setError(err.message || 'Failed to load restaurant.');
      setRestaurant(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRestaurant();
    window.addEventListener('popstate', loadRestaurant);
    return () => window.removeEventListener('popstate', loadRestaurant);
  }, [loadRestaurant]);

  const contextValue = {
    restaurant,
    loading,
    error,
    refetch: loadRestaurant,
    refreshRestaurant: loadRestaurant,
  };

  return (
    <RestaurantContext.Provider value={contextValue}>
      {children}
    </RestaurantContext.Provider>
  );
}

export function useRestaurantContext() {
  const ctx = useContext(RestaurantContext);
  if (!ctx) {
    throw new Error('useRestaurantContext must be used inside <RestaurantProvider>');
  }
  return ctx;
}

export default RestaurantContext;
