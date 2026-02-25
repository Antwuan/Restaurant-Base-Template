import React, { createContext, useContext, useMemo } from 'react';
import { generateTheme } from './colors';

const ThemeContext = createContext(null);

export const ThemeProvider = ({ restaurant, children }) => {
  const theme = useMemo(() => {
    return generateTheme({
      primaryColor: restaurant?.primary_color || '#007AFF',
      secondaryColor: restaurant?.secondary_color || '#5856D6',
      restaurantName: restaurant?.name || 'Restaurant',
      logoUrl: restaurant?.logo_url || null,
    });
  }, [
    restaurant?.primary_color,
    restaurant?.secondary_color,
    restaurant?.name,
    restaurant?.logo_url,
  ]);

  const value = useMemo(
    () => ({
      theme,
      restaurant,
    }),
    [theme, restaurant],
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