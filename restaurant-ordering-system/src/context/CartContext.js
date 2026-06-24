import React, { createContext, useContext } from 'react';
import { useCart } from '../hooks/useCart';

const CartContext = createContext(null);

export function CartProvider({ children, restaurantId }) {
  const cart = useCart(restaurantId);
  return <CartContext.Provider value={cart}>{children}</CartContext.Provider>;
}

export function useCartContext() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCartContext must be used inside <CartProvider>');
  return ctx;
}
