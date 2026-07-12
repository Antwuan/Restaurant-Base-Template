import { supabase } from '../config/supabase';

const _menuCache = {};

export function clearMenuCache(restaurantId) {
  if (restaurantId) {
    delete _menuCache[restaurantId];
  } else {
    Object.keys(_menuCache).forEach(k => delete _menuCache[k]);
  }
}

// ── Categories ────────────────────────────────────────────────────────────────

export async function getMenuCategories(restaurantId, menuType = null) {
  let query = supabase
    .from('menu_categories')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('display_order', { ascending: true });

  if (menuType) {
    query = query.eq('menu_type', menuType);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function createCategory({ restaurant_id, name, menu_type = 'regular', display_order }) {
  const { data: existing } = await supabase
    .from('menu_categories')
    .select('display_order')
    .eq('restaurant_id', restaurant_id)
    .eq('menu_type', menu_type)
    .order('display_order', { ascending: false })
    .limit(1)
    .single();

  const nextOrder = display_order ?? ((existing?.display_order ?? -1) + 1);

  const { data, error } = await supabase
    .from('menu_categories')
    .insert({ restaurant_id, name, menu_type, display_order: nextOrder })
    .select()
    .single();

  if (error) throw error;
  clearMenuCache(restaurant_id);
  return data;
}

export async function updateCategory(id, updates) {
  const { data, error } = await supabase
    .from('menu_categories')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  if (updates.restaurant_id) clearMenuCache(updates.restaurant_id);
  return data;
}

export async function deleteCategory(id, restaurantId) {
  // Prevent deletion if the category still has items
  const { count, error: countError } = await supabase
    .from('menu_items')
    .select('id', { count: 'exact', head: true })
    .eq('category_id', id);

  if (countError) throw countError;
  if (count > 0) {
    throw new Error(`Cannot delete a category that still has ${count} item${count !== 1 ? 's' : ''}. Move or delete the items first.`);
  }

  const { error } = await supabase
    .from('menu_categories')
    .delete()
    .eq('id', id);

  if (error) throw error;
  clearMenuCache(restaurantId);
}

export async function reorderCategories(restaurantId, orderedIds) {
  const updates = orderedIds.map((id, index) =>
    supabase.from('menu_categories').update({ display_order: index }).eq('id', id)
  );
  await Promise.all(updates);
  clearMenuCache(restaurantId);
}

// ── Items ─────────────────────────────────────────────────────────────────────

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

export async function reorderMenuItems(restaurantId, orderedIds) {
  const updates = orderedIds.map((id, index) =>
    supabase.from('menu_items').update({ display_order: index }).eq('id', id)
  );
  await Promise.all(updates);
  clearMenuCache(restaurantId);
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
