import { useState, useEffect, useCallback, useRef } from 'react';

const LEGACY_CART_KEY = 'restaurant_cart';
const REGULAR_CART_KEY = 'restaurant_cart_regular';
const CATERING_CART_KEY = 'restaurant_cart_catering';
const TAX_RATE = 0.08; // 8% — make this configurable per restaurant later

const normalizeMenuType = (menuType) =>
  menuType === 'catering' ? 'catering' : 'regular';

function modifiersKey(selectedModifiers) {
  if (!selectedModifiers?.length) return '';
  return selectedModifiers
    .map((m) => m.optionId)
    .filter(Boolean)
    .sort()
    .join(',');
}

function lineMatches(a, itemId, specialInstructions, selectedModifiers) {
  return (
    a.id === itemId &&
    a.specialInstructions === specialInstructions &&
    modifiersKey(a.selectedModifiers) === modifiersKey(selectedModifiers)
  );
}

function normalizeCartItems(parsed) {
  if (!Array.isArray(parsed)) return [];
  return parsed.map((item) => ({
    ...item,
    menuType: normalizeMenuType(item.menuType),
    selectedModifiers: Array.isArray(item.selectedModifiers) ? item.selectedModifiers : [],
  }));
}

function loadCartKey(key) {
  try {
    const saved = localStorage.getItem(key);
    if (!saved) return [];
    return normalizeCartItems(JSON.parse(saved));
  } catch {
    return [];
  }
}

/** One-time migrate legacy single cart into split keys. */
function migrateLegacyCart() {
  try {
    const legacy = localStorage.getItem(LEGACY_CART_KEY);
    if (!legacy) return;
    const parsed = normalizeCartItems(JSON.parse(legacy));
    if (!parsed.length) {
      localStorage.removeItem(LEGACY_CART_KEY);
      return;
    }

    const hasRegular = !!localStorage.getItem(REGULAR_CART_KEY);
    const hasCatering = !!localStorage.getItem(CATERING_CART_KEY);
    if (!hasRegular && !hasCatering) {
      const regular = parsed.filter((i) => normalizeMenuType(i.menuType) === 'regular');
      const catering = parsed.filter((i) => normalizeMenuType(i.menuType) === 'catering');
      localStorage.setItem(REGULAR_CART_KEY, JSON.stringify(regular));
      localStorage.setItem(CATERING_CART_KEY, JSON.stringify(catering));
    }
    localStorage.removeItem(LEGACY_CART_KEY);
  } catch {
    // ignore migration errors
  }
}

function loadInitialCarts() {
  migrateLegacyCart();
  return {
    regular: loadCartKey(REGULAR_CART_KEY),
    catering: loadCartKey(CATERING_CART_KEY),
  };
}

function computeTotals(items) {
  const itemCount = items.reduce((sum, i) => sum + i.quantity, 0);
  const subtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const tax = subtotal * TAX_RATE;
  const total = subtotal + tax;
  return { itemCount, subtotal, tax, total };
}

export const useCart = (restaurantId) => {
  const initial = useRef(null);
  if (!initial.current) initial.current = loadInitialCarts();

  const [regularItems, setRegularItems] = useState(() => initial.current.regular);
  const [cateringItems, setCateringItems] = useState(() => initial.current.catering);

  const regularRef = useRef(regularItems);
  const cateringRef = useRef(cateringItems);
  regularRef.current = regularItems;
  cateringRef.current = cateringItems;

  useEffect(() => {
    try {
      localStorage.setItem(REGULAR_CART_KEY, JSON.stringify(regularItems));
    } catch {
      // Storage might be full or unavailable
    }
  }, [regularItems]);

  useEffect(() => {
    try {
      localStorage.setItem(CATERING_CART_KEY, JSON.stringify(cateringItems));
    } catch {
      // Storage might be full or unavailable
    }
  }, [cateringItems]);

  // Clear carts if restaurant changes
  useEffect(() => {
    if (!restaurantId) return;
    const clearIfWrongRestaurant = (items, setItems) => {
      if (items.length > 0 && items[0]?.restaurantId !== restaurantId) {
        setItems([]);
      }
    };
    clearIfWrongRestaurant(regularRef.current, setRegularItems);
    clearIfWrongRestaurant(cateringRef.current, setCateringItems);
  }, [restaurantId]);

  const getSetter = useCallback((menuType) => {
    return normalizeMenuType(menuType) === 'catering' ? setCateringItems : setRegularItems;
  }, []);

  const appendOrMergeItem = useCallback(
    (prev, menuItem, quantity, specialInstructions, menuType, selectedModifiers = [], unitPrice) => {
      const type = normalizeMenuType(menuType);
      const mods = Array.isArray(selectedModifiers) ? selectedModifiers : [];
      const price = unitPrice != null ? unitPrice : menuItem.price;

      const existing = prev.find((i) =>
        lineMatches(i, menuItem.id, specialInstructions, mods)
      );

      if (existing) {
        return prev.map((i) =>
          lineMatches(i, menuItem.id, specialInstructions, mods)
            ? { ...i, quantity: i.quantity + quantity, menuType: type, price }
            : i
        );
      }

      return [
        ...prev,
        {
          id: menuItem.id,
          name: menuItem.name,
          price,
          quantity,
          specialInstructions,
          restaurantId,
          menuType: type,
          selectedModifiers: mods,
        },
      ];
    },
    [restaurantId]
  );

  const addItem = useCallback(
    (
      menuItem,
      quantity = 1,
      specialInstructions = '',
      menuType = 'regular',
      selectedModifiers = [],
      unitPrice
    ) => {
      const type = normalizeMenuType(menuType);
      const setItems = getSetter(type);
      setItems((current) =>
        appendOrMergeItem(
          current,
          menuItem,
          quantity,
          specialInstructions,
          type,
          selectedModifiers,
          unitPrice
        )
      );
    },
    [appendOrMergeItem, getSetter]
  );

  const removeItem = useCallback(
    (itemId, specialInstructions = '', menuType = 'regular', selectedModifiers = []) => {
      const setItems = getSetter(menuType);
      setItems((prev) =>
        prev.filter((i) => !lineMatches(i, itemId, specialInstructions, selectedModifiers))
      );
    },
    [getSetter]
  );

  const updateQuantity = useCallback(
    (itemId, quantity, specialInstructions = '', menuType = 'regular', selectedModifiers = []) => {
      if (quantity <= 0) {
        removeItem(itemId, specialInstructions, menuType, selectedModifiers);
        return;
      }
      const setItems = getSetter(menuType);
      setItems((prev) =>
        prev.map((i) =>
          lineMatches(i, itemId, specialInstructions, selectedModifiers)
            ? { ...i, quantity }
            : i
        )
      );
    },
    [getSetter, removeItem]
  );

  const clearCart = useCallback(
    (menuType = 'regular') => {
      getSetter(menuType)([]);
    },
    [getSetter]
  );

  const getCart = useCallback(
    (menuType = 'regular') => {
      const type = normalizeMenuType(menuType);
      const items = type === 'catering' ? cateringItems : regularItems;
      return {
        items,
        menuType: type,
        ...computeTotals(items),
      };
    },
    [regularItems, cateringItems]
  );

  const regularTotals = computeTotals(regularItems);
  const cateringTotals = computeTotals(cateringItems);

  return {
    // Regular cart (navbar, drawer, checkout)
    items: regularItems,
    itemCount: regularTotals.itemCount,
    subtotal: regularTotals.subtotal,
    tax: regularTotals.tax,
    total: regularTotals.total,
    cartMenuType: regularItems.length ? 'regular' : null,

    // Catering cart
    cateringItems,
    cateringItemCount: cateringTotals.itemCount,
    cateringSubtotal: cateringTotals.subtotal,
    cateringTax: cateringTotals.tax,
    cateringTotal: cateringTotals.total,

    getCart,
    addItem,
    removeItem,
    updateQuantity,
    clearCart,
  };
};
