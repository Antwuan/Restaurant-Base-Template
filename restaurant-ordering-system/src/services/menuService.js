import { supabase } from '../config/supabase';

const _menuCache = {};

export function clearMenuCache(restaurantId) {
  if (restaurantId) {
    delete _menuCache[restaurantId];
  } else {
    Object.keys(_menuCache).forEach(k => delete _menuCache[k]);
  }
}

export async function getMenuCategories(restaurantId) {
  const { data, error } = await supabase
    .from('menu_categories')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('display_order', { ascending: true });

  if (error) throw error;
  return data;
}

export async function getMenuItems(restaurantId, categoryId = null) {
  let query = supabase
    .from('menu_items')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('display_order', { ascending: true });

  if (categoryId) {
    query = query.eq('category_id', categoryId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export function groupItemsByCategory(categories, items) {
  return categories.map(category => ({
    ...category,
    items: items.filter(item => item.category_id === category.id)
  }));
}

export async function getFullMenu(restaurantId) {
  if (_menuCache[restaurantId]) return _menuCache[restaurantId];

  const [categories, items] = await Promise.all([
    getMenuCategories(restaurantId),
    getMenuItems(restaurantId)
  ]);

  const grouped = groupItemsByCategory(categories, items);
  _menuCache[restaurantId] = grouped;
  return grouped;
}

export async function toggleItemAvailability(itemId, isAvailable) {
  const { data, error } = await supabase
    .from('menu_items')
    .update({ is_available: isAvailable })
    .eq('id', itemId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function createMenuItem(itemData) {
  const { data, error } = await supabase
    .from('menu_items')
    .insert(itemData)
    .select()
    .single();

  if (error) throw error;
  clearMenuCache(itemData.restaurant_id);
  return data;
}

export async function updateMenuItem(itemId, updates) {
  const { data, error } = await supabase
    .from('menu_items')
    .update(updates)
    .eq('id', itemId)
    .select()
    .single();

  if (error) throw error;
  if (updates.restaurant_id) clearMenuCache(updates.restaurant_id);
  return data;
}

export async function deleteMenuItem(itemId, restaurantId) {
  const { error } = await supabase
    .from('menu_items')
    .delete()
    .eq('id', itemId);

  if (error) throw error;
  clearMenuCache(restaurantId);
}