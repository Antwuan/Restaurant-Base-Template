import React, { createContext, useContext, useMemo, useState, useCallback, useEffect } from 'react';
import { Platform } from 'react-native';
import { generateTheme } from './colors';

const ThemeContext = createContext(null);

const DARK_MODE_KEY = 'admin_dark_mode';

function readStoredDarkMode() {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      return localStorage.getItem(DARK_MODE_KEY) === 'true';
    }
  } catch {
    // ignore storage errors
  }
  return false;
}

function persistDarkMode(enabled) {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      localStorage.setItem(DARK_MODE_KEY, enabled ? 'true' : 'false');
    }
  } catch {
    // ignore storage errors
  }
}

// Dark theme only applies to the admin dashboard. Customer-facing pages
// always render in light theme regardless of the admin's dark mode setting.
function isAdminArea() {
  try {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      return window.location.pathname.startsWith('/admin');
    }
  } catch {
    // ignore
  }
  return false;
}

export const ThemeProvider = ({ restaurant, children }) => {
  const [isDarkMode, setIsDarkMode] = useState(readStoredDarkMode);

  useEffect(() => {
    persistDarkMode(isDarkMode);
  }, [isDarkMode]);

  const setDarkMode = useCallback((enabled) => {
    setIsDarkMode(!!enabled);
  }, []);

  const toggleDarkMode = useCallback(() => {
    setIsDarkMode((prev) => !prev);
  }, []);

  const theme = useMemo(() => {
    const darkAllowed = isAdminArea();
    return generateTheme({
      primaryColor: restaurant?.primary_color || '#007AFF',
      secondaryColor: restaurant?.secondary_color || '#5856D6',
      restaurantName: restaurant?.name || 'Restaurant',
      logoUrl: restaurant?.logo_url || null,
      mode: isDarkMode && darkAllowed ? 'dark' : 'light',
    });
  }, [
    restaurant?.primary_color,
    restaurant?.secondary_color,
    restaurant?.name,
    restaurant?.logo_url,
    isDarkMode,
  ]);

  const value = useMemo(
    () => ({
      theme,
      restaurant,
      isDarkMode,
      setDarkMode,
      toggleDarkMode,
    }),
    [theme, restaurant, isDarkMode, setDarkMode, toggleDarkMode],
  );

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};

/**
 * useTheme
 * Returns the current theme + restaurant. Must be used inside <ThemeProvider>.
 */
export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

export default ThemeProvider;
