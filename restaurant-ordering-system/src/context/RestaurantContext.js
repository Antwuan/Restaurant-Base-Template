/**
 * RestaurantContext — web-only restaurant resolution.
 *
 * Priority:
 *   1. ?restaurant=<slug>
 *   2. sessionStorage restaurant_slug (localhost / *.vercel.app only)
 *   3. EXPO_PUBLIC_RESTAURANT_SLUG on localhost / *.vercel.app
 *   4. First URL path segment (not a reserved app route)
 *   5. Hostname → restaurants.domain (custom domains only; not *.vercel.app)
 *
 * Custom-domain lookup matches www and apex. If the restaurant already
 * resolved on the current hostname, we do not JS-redirect (CDN owns that).
 * A sessionStorage loop guard still blocks a JWT-origin bounce from looping.
 */

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { restaurantService } from '../services/restaurantService';
import { useAuth } from './AuthContext';
import { isStaffForRestaurant } from '../services/authService';
import { writeBrandCache } from '../theme/brandCache';
import { isAppointmentBusiness } from '../utils/businessType';

const RestaurantContext = createContext(null);

const SESSION_SLUG_KEY = 'restaurant_slug';
const CANONICAL_REDIRECT_GUARD_KEY = 'canonical_host_redirect';

const RESERVED_PATH_SEGMENTS = new Set([
  'home',
  'menu',
  'cart',
  'checkout',
  'confirmation',
  'catering',
  'rewards',
  'hiring',
  'tracker',
  'review',
  'admin',
  'reset-password',
  'cookies',
  'book',
  'appointments',
  'booking',
]);

function isLocalhost(hostname) {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname.startsWith('192.168.') ||
    hostname.endsWith('.local')
  );
}

function isVercelHost(hostname) {
  return hostname === 'vercel.app' || hostname.endsWith('.vercel.app');
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

  // sessionStorage / env slugs are preview-only. On a custom host, domain
  // lookup must win so a leftover slug cannot override restaurants.domain.
  if (isLocalhost(hostname) || isVercelHost(hostname)) {
    try {
      const stored = sessionStorage.getItem(SESSION_SLUG_KEY);
      if (stored) {
        return { type: 'slug', value: stored };
      }
    } catch {
      // sessionStorage unavailable
    }

    const envSlug = process.env.EXPO_PUBLIC_RESTAURANT_SLUG;
    if (envSlug) {
      return { type: 'slug', value: envSlug };
    }
  }

  const pathSegments = window.location.pathname.split('/').filter(Boolean);
  const first = pathSegments[0];
  if (first && !RESERVED_PATH_SEGMENTS.has(first)) {
    return { type: 'slug', value: first };
  }

  // Custom domains only — *.vercel.app is not stored in restaurants.domain
  if (!isLocalhost(hostname) && !isVercelHost(hostname)) {
    return { type: 'domain', value: hostname };
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

/** Hostname from restaurants.domain (may include protocol or path). */
function parseCanonicalHostname(domain) {
  if (!domain || typeof domain !== 'string') return null;
  let host = domain.trim().toLowerCase();
  host = host.replace(/^https?:\/\//, '');
  host = host.replace(/\/.*$/, '');
  host = host.replace(/:\d+$/, '');
  return host || null;
}

/**
 * Auth JWT lives in localStorage keyed by origin. www vs apex are different
 * origins, so a slug-based load may still bounce to restaurants.domain.
 * Only www ↔ apex of the same host; never localhost / *.vercel.app.
 * Guarded: if this origin already redirected once, stay put (CDN may own
 * the opposite www/apex hop and would otherwise loop).
 */
function redirectToCanonicalHost(canonicalDomain) {
  if (typeof window === 'undefined') return false;
  const canonical = parseCanonicalHostname(canonicalDomain);
  const current = window.location.hostname.toLowerCase();
  if (!canonical || current === canonical) return false;
  if (isLocalhost(current) || isVercelHost(current)) return false;

  const currentApex = current.replace(/^www\./, '');
  const canonicalApex = canonical.replace(/^www\./, '');
  if (currentApex !== canonicalApex) return false;

  try {
    if (sessionStorage.getItem(CANONICAL_REDIRECT_GUARD_KEY)) {
      return false;
    }
    sessionStorage.setItem(CANONICAL_REDIRECT_GUARD_KEY, currentApex);
  } catch {
    // Cannot persist a loop guard — skip the bounce rather than risk a reload loop.
    return false;
  }

  const next = new URL(window.location.href);
  next.hostname = canonical;
  window.location.replace(next.toString());
  return true;
}

function isAdminPath() {
  return typeof window !== 'undefined' && window.location.pathname.startsWith('/admin');
}

export function RestaurantProvider({ children }) {
  const { user, signOut, loading: authLoading } = useAuth();
  const [restaurant, setRestaurant] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [adminLoginError, setAdminLoginError] = useState(null);
  const restaurantRef = useRef(restaurant);
  restaurantRef.current = restaurant;

  const loadRestaurant = useCallback(async () => {
    // Keep the storefront mounted after first paint; a refetch must not
    // flip loading back to true and remount RootNavigator.
    if (!restaurantRef.current) {
      setLoading(true);
    }
    setError(null);

    try {
      // Admin routes: wait for session restore so we don't flash "restaurant not
      // found" / wrong slug resolution before staff auth is available.
      if (isAdminPath() && authLoading) {
        return;
      }

      const identifier = getRestaurantIdentifierFromURL();

      if (!identifier) {
        setError(
          'No restaurant identifier found. Open your custom domain, or add ?restaurant=your-slug to the URL.',
        );
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

      // Domain lookup already succeeded on this hostname (www or apex). Do not
      // JS-redirect — hosting/CDN owns www ↔ apex. Slug loads may still bounce
      // for JWT origin, with a sessionStorage loop guard.
      if (identifier.type !== 'domain' && data.domain && redirectToCanonicalHost(data.domain)) {
        return;
      }

      setRestaurant(data);
      if (identifier.type === 'slug') {
        persistSlug(identifier.value);
      }

      writeBrandCache({
        primary: data.primary_color,
        name: data.name,
        businessType: isAppointmentBusiness(data) ? 'appointment' : 'restaurant',
      });

      const themeColorMeta = document.querySelector('meta[name="theme-color"]');
      if (themeColorMeta && data.primary_color) {
        themeColorMeta.setAttribute('content', data.primary_color);
      }
      if (data.name) {
        document.title = isAppointmentBusiness(data)
          ? `${data.name} — Book`
          : `${data.name} — Order Online`;
      }

      // Domain/slug always wins. Staff-anywhere sessions that are not staff
      // for this restaurant are signed out; LoginScreen stays branded here.
      if (isAdminPath() && user?.id) {
        const staffHere = await isStaffForRestaurant(user.id, data.id);
        if (!staffHere) {
          // Set before signOut so the banner survives LoginScreen unmount
          // while roleLoading is true (Alert.alert is a no-op on web).
          setAdminLoginError(
            `This account is not an admin for ${data.name || 'this restaurant'}.`,
          );
          await signOut();
        } else {
          setAdminLoginError(null);
        }
      }
    } catch (err) {
      console.error('[RestaurantContext] Failed to load restaurant:', err);
      setError(err.message || 'Failed to load restaurant.');
      setRestaurant(null);
    } finally {
      // Keep the app spinner up while auth session is still restoring on /admin.
      if (!(isAdminPath() && authLoading)) {
        setLoading(false);
      }
    }
    // signOut is intentionally omitted: AuthContext does not memoize it.
  }, [user?.id, authLoading]);

  useEffect(() => {
    loadRestaurant();
    window.addEventListener('popstate', loadRestaurant);
    return () => window.removeEventListener('popstate', loadRestaurant);
  }, [loadRestaurant]);

  // Silently apply a partial update to the local restaurant state without
  // triggering a full reload (avoids flashing the app-wide loading spinner).
  const patchRestaurant = useCallback((updates) => {
    setRestaurant((prev) => (prev ? { ...prev, ...updates } : prev));
  }, []);

  const contextValue = {
    restaurant,
    loading,
    error,
    adminLoginError,
    setAdminLoginError,
    refetch: loadRestaurant,
    refreshRestaurant: loadRestaurant,
    patchRestaurant,
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
