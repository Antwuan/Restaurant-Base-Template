/**
 * CookieConsentContext — consent state for the browser storage this site uses.
 *
 * The app has no HTTP cookies: the Supabase session, cart, pickup location and
 * checkout state all live in localStorage / sessionStorage. Privacy law treats
 * those as "similar technologies", so we ask once and remember the answer.
 *
 * The record is stored under CONSENT_STORAGE_KEY as:
 *   { version, essential: true, preferences: bool, marketing: bool, updatedAt }
 *
 * Essential storage is never optional — declining only turns off the optional
 * buckets. See CookiesScreen for the full key-by-key inventory.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import { Platform } from 'react-native';

export const CONSENT_STORAGE_KEY = 'restaurant_cookie_consent';

/** Bump when the categories change so visitors are asked again. */
export const CONSENT_VERSION = 1;

/**
 * Optional keys we own and remove when the matching bucket is declined.
 * Essential keys (auth, cart, pickup, checkout, slug/host guards) stay put.
 */
const PREFERENCE_KEYS = ['admin_dark_mode'];
const MARKETING_KEYS = []; // no tracking / pixel storage today

const isWebRuntime = () => Platform.OS === 'web' && typeof window !== 'undefined';

function readStoredConsent() {
  try {
    if (!isWebRuntime() || typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(CONSENT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    if (parsed.version !== CONSENT_VERSION) return null;
    return {
      version: CONSENT_VERSION,
      essential: true,
      preferences: parsed.preferences === true,
      marketing: parsed.marketing === true,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : null,
    };
  } catch {
    return null;
  }
}

function persistConsent(record) {
  try {
    if (!isWebRuntime() || typeof localStorage === 'undefined') return;
    localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(record));
  } catch {
    // quota / private mode — the banner will simply ask again next visit
  }
}

function removeKeys(keys) {
  if (!keys.length) return;
  try {
    if (!isWebRuntime() || typeof localStorage === 'undefined') return;
    keys.forEach((key) => localStorage.removeItem(key));
  } catch {
    // ignore storage errors
  }
}

const CookieConsentContext = createContext(null);

export function CookieConsentProvider({ children }) {
  // Read synchronously so the banner never flashes for a returning visitor.
  const [consent, setConsent] = useState(readStoredConsent);
  const [preferencesOpen, setPreferencesOpen] = useState(false);

  const commit = useCallback((preferences, marketing) => {
    const record = {
      version: CONSENT_VERSION,
      essential: true,
      preferences: preferences === true,
      marketing: marketing === true,
      updatedAt: new Date().toISOString(),
    };
    persistConsent(record);
    if (!record.preferences) removeKeys(PREFERENCE_KEYS);
    if (!record.marketing) removeKeys(MARKETING_KEYS);
    setConsent(record);
    setPreferencesOpen(false);
  }, []);

  const acceptAll = useCallback(() => commit(true, true), [commit]);
  const rejectNonEssential = useCallback(() => commit(false, false), [commit]);
  const savePreferences = useCallback(
    ({ preferences, marketing } = {}) => commit(preferences, marketing),
    [commit],
  );

  const openPreferences = useCallback(() => setPreferencesOpen(true), []);
  const closePreferences = useCallback(() => setPreferencesOpen(false), []);

  const value = useMemo(() => {
    const hasConsented = consent !== null;
    return {
      consent,
      hasConsented,
      /** Banner is web-only and shows until a choice is recorded. */
      bannerVisible: isWebRuntime() && !hasConsented,
      allowsPreferences: consent?.preferences === true,
      allowsMarketing: consent?.marketing === true,
      preferencesOpen,
      openPreferences,
      closePreferences,
      acceptAll,
      rejectNonEssential,
      savePreferences,
    };
  }, [
    consent,
    preferencesOpen,
    openPreferences,
    closePreferences,
    acceptAll,
    rejectNonEssential,
    savePreferences,
  ]);

  return (
    <CookieConsentContext.Provider value={value}>
      {children}
    </CookieConsentContext.Provider>
  );
}

const noop = () => {};

const FALLBACK_VALUE = {
  consent: null,
  hasConsented: false,
  bannerVisible: false,
  allowsPreferences: false,
  allowsMarketing: false,
  preferencesOpen: false,
  openPreferences: noop,
  closePreferences: noop,
  acceptAll: noop,
  rejectNonEssential: noop,
  savePreferences: noop,
};

/**
 * useCookieConsent
 * Safe outside the provider (returns a no-op shape) so footers and legal
 * pages can link to preferences without depending on mount order.
 */
export function useCookieConsent() {
  return useContext(CookieConsentContext) || FALLBACK_VALUE;
}

export default CookieConsentProvider;
