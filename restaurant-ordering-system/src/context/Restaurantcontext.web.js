/**
 * RestaurantContext.web.js
 *
 * Web-only override. React Native Web will prefer this file over
 * RestaurantContext.js when bundling for the browser because of the
 * .web.js extension resolution order configured in webpack.config.js.
 *
 * On web we detect the restaurant by:
 *   1. window.location.hostname  →  matches restaurants.domain column
 *   2. ?restaurant=<slug> query param  →  fallback for local dev
 *   3. /<slug> URL path prefix        →  future multi-tenant subdirectory support
 */

import React, { createContext, useContext, useEffect, useState } from 'react';
import { restaurantService } from '../services/restaurantService';

const RestaurantContext = createContext(null);

/**
 * Derive a restaurant identifier from the current browser URL.
 * Returns { type: 'domain' | 'slug', value: string } or null.
 */
function getRestaurantIdentifierFromURL() {
  if (typeof window === 'undefined') return null;

  const hostname = window.location.hostname;
  const params = new URLSearchParams(window.location.search);
  const slugParam = params.get('restaurant');

  // 1. Explicit query param — used during local development
  //    e.g. http://localhost:19006?restaurant=pizza-palace
  if (slugParam) {
    return { type: 'slug', value: slugParam };
  }

  // 2. Production custom domain
  //    e.g. pizzapalace.com  or  order.pizzapalace.com
  const isLocalhost =
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname.startsWith('192.168.') ||
    hostname.endsWith('.local');

  if (!isLocalhost) {
    return { type: 'domain', value: hostname };
  }

  // 3. Path-based slug for local multi-tenant testing
  //    e.g. http://localhost:19006/pizza-palace/menu
  const pathSegments = window.location.pathname.split('/').filter(Boolean);
  if (pathSegments.length > 0 && pathSegments[0] !== 'admin') {
    return { type: 'slug', value: pathSegments[0] };
  }

  return null;
}

export function RestaurantProvider({ children }) {
  const [restaurant, setRestaurant] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadRestaurant = async () => {
    setLoading(true);
    setError(null);

    try {
      const identifier = getRestaurantIdentifierFromURL();

      if (!identifier) {
        // No identifier found — could be the platform root URL.
        // Set a sensible error so the UI can render a "not found" state.
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
      } else {
        setRestaurant(data);

        // Dynamically update <meta name="theme-color"> to match the restaurant brand
        const themeColorMeta = document.querySelector('meta[name="theme-color"]');
        if (themeColorMeta && data.primary_color) {
          themeColorMeta.setAttribute('content', data.primary_color);
        }

        // Update the page title
        if (data.name) {
          document.title = `${data.name} — Order Online`;
        }
      }
    } catch (err) {
      console.error('[RestaurantContext.web] Failed to load restaurant:', err);
      setError(err.message || 'Failed to load restaurant.');
      setRestaurant(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRestaurant();
    // Re-run if the URL changes (e.g. the user navigates to a different slug)
    window.addEventListener('popstate', loadRestaurant);
    return () => window.removeEventListener('popstate', loadRestaurant);
  }, []);

  return (
    <RestaurantContext.Provider
      value={{ restaurant, loading, error, refetch: loadRestaurant }}
    >
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