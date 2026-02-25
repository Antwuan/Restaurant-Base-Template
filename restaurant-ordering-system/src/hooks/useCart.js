import { useState, useEffect, useCallback } from 'react';

const CART_STORAGE_KEY = 'restaurant_cart';
const TAX_RATE = 0.08; // 8% — make this configurable per restaurant later

const loadCartFromStorage = () => {
  try {
    const saved = localStorage.getItem(CART_STORAGE_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
};

export const useCart = (restaurantId) => {
  const [items, setItems] = useState(() => loadCartFromStorage());

  // Persist to localStorage on every change
  useEffect(() => {
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
    } catch {
      // Storage might be full or unavailable
    }
  }, [items]);

  // Clear cart if restaurant changes (prevents cross-restaurant contamination)
  useEffect(() => {
    if (restaurantId) {
      const saved = loadCartFromStorage();
      if (saved.length > 0 && saved[0]?.restaurantId !== restaurantId) {
        setItems([]);
      }
    }
  }, [restaurantId]);

  const addItem = useCallback((menuItem, quantity = 1, specialInstructions = '') => {
    setItems((prev) => {
      const existing = prev.find(
        (i) => i.id === menuItem.id && i.specialInstructions === specialInstructions
      );

      if (existing) {
        return prev.map((i) =>
          i.id === menuItem.id && i.specialInstructions === specialInstructions
            ? { ...i, quantity: i.quantity + quantity }
            : i
        );
      }

      return [
        ...prev,
        {
          id: menuItem.id,
          name: menuItem.name,
          price: menuItem.price,
          quantity,
          specialInstructions,
          restaurantId,
        },
      ];
    });
  }, [restaurantId]);

  const removeItem = useCallback((itemId, specialInstructions = '') => {
    setItems((prev) =>
      prev.filter(
        (i) => !(i.id === itemId && i.specialInstructions === specialInstructions)
      )
    );
  }, []);

  const updateQuantity = useCallback((itemId, quantity, specialInstructions = '') => {
    if (quantity <= 0) {
      removeItem(itemId, specialInstructions);
      return;
    }
    setItems((prev) =>
      prev.map((i) =>
        i.id === itemId && i.specialInstructions === specialInstructions
          ? { ...i, quantity }
          : i
      )
    );
  }, [removeItem]);

  const clearCart = useCallback(() => {
    setItems([]);
  }, []);

  // Derived values
  const itemCount = items.reduce((sum, i) => sum + i.quantity, 0);
  const subtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const tax = subtotal * TAX_RATE;
  const total = subtotal + tax;

  return {
    items,
    itemCount,
    subtotal,
    tax,
    total,
    addItem,
    removeItem,
    updateQuantity,
    clearCart,
  };
};