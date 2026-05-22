import { useState, useEffect, useCallback } from 'react';
import * as menuService from '../services/menuService';

export const useMenu = (restaurantId) => {
  const [categories, setCategories] = useState([]);
  const [menuByCategory, setMenuByCategory] = useState({});
  const [allItems, setAllItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadMenu = useCallback(async () => {
    if (!restaurantId) {
      setLoading(false);
      setError(null);
      setCategories([]);
      setMenuByCategory({});
      setAllItems([]);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const [fetchedCategories, fetchedItems] = await Promise.all([
        menuService.getMenuCategories(restaurantId),
        menuService.getMenuItems(restaurantId),
      ]);

      const grouped = fetchedCategories.reduce((acc, category) => {
        acc[category.id] = {
          ...category,
          items: fetchedItems.filter(
            (item) => item.category_id === category.id && item.is_available
          ),
        };
        return acc;
      }, {});

      setCategories(fetchedCategories);
      setMenuByCategory(grouped);
      setAllItems(fetchedItems);
    } catch (err) {
      setError(err.message || 'Failed to load menu');
    } finally {
      setLoading(false);
    }
  }, [restaurantId]);

  useEffect(() => {
    loadMenu();
  }, [loadMenu]);

  const categoriesWithItems = categories.filter(
    (cat) => menuByCategory[cat.id]?.items?.length > 0
  );

  return {
    categories,
    categoriesWithItems,
    menuByCategory,
    allItems,
    loading,
    error,
    refetch: loadMenu,
  };
};
