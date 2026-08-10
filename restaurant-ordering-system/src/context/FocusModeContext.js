import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useAuth } from './AuthContext';
import { useRestaurantContext } from './RestaurantContext';

const FocusModeContext = createContext(null);

export function FocusModeProvider({ children }) {
  const { user } = useAuth();
  const { restaurant } = useRestaurantContext();
  // In-memory only — clears on refresh / sign-out.
  const [sessionUnlocked, setSessionUnlocked] = useState(false);

  const enabled = !!restaurant?.focus_mode_enabled;
  const allowedTabs = useMemo(() => {
    const tabs = restaurant?.focus_mode_allowed_tabs;
    return Array.isArray(tabs) ? tabs : [];
  }, [restaurant?.focus_mode_allowed_tabs]);

  // Clear unlock when auth session ends (sign-out) or Focus Mode turns off.
  useEffect(() => {
    if (!user?.id || !enabled) {
      setSessionUnlocked(false);
    }
  }, [user?.id, enabled]);

  const isTabAllowed = useCallback(
    (key) => {
      if (!enabled || sessionUnlocked) return true;
      return allowedTabs.includes(key);
    },
    [enabled, sessionUnlocked, allowedTabs],
  );

  const canAccessSettingsFreely = useMemo(
    () => !enabled || sessionUnlocked || allowedTabs.includes('Settings'),
    [enabled, sessionUnlocked, allowedTabs],
  );

  const unlockSession = useCallback(() => {
    setSessionUnlocked(true);
  }, []);

  const lockSession = useCallback(() => {
    setSessionUnlocked(false);
  }, []);

  const value = useMemo(
    () => ({
      enabled,
      allowedTabs,
      sessionUnlocked,
      isTabAllowed,
      canAccessSettingsFreely,
      unlockSession,
      lockSession,
      pinHash: restaurant?.focus_pin_hash ?? null,
      restaurantId: restaurant?.id ?? null,
    }),
    [
      enabled,
      allowedTabs,
      sessionUnlocked,
      isTabAllowed,
      canAccessSettingsFreely,
      unlockSession,
      lockSession,
      restaurant?.focus_pin_hash,
      restaurant?.id,
    ],
  );

  return (
    <FocusModeContext.Provider value={value}>
      {children}
    </FocusModeContext.Provider>
  );
}

export function useFocusMode() {
  const ctx = useContext(FocusModeContext);
  if (!ctx) {
    throw new Error('useFocusMode must be used within a FocusModeProvider');
  }
  return ctx;
}
