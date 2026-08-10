import { supabase } from '../config/supabase';

/** Sentinel id for the restaurant's main store (restaurants.address). Not a DB uuid. */
export const MAIN_PICKUP_LOCATION_ID = 'main';

function normalizeAddress(address) {
  return String(address || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/** Virtual pickup option sourced from restaurants.name + restaurants.address. */
export function buildMainPickupOption(restaurant) {
  if (!restaurant) return null;
  const address = String(restaurant.address || '').trim();
  const name = String(restaurant.name || '').trim() || 'Main store';
  if (!address && !restaurant.name) return null;
  return {
    id: MAIN_PICKUP_LOCATION_ID,
    restaurant_id: restaurant.id || null,
    name,
    address,
    is_main: true,
    is_active: true,
    sort_order: -1,
  };
}

/**
 * Customer-facing pickup options:
 * always main store first, then active restaurant_locations that are not
 * duplicates of the main address.
 */
export function buildPickupOptions(restaurant, locationRows = []) {
  const main = buildMainPickupOption(restaurant);
  const mainAddr = normalizeAddress(main?.address);
  const extras = (locationRows || []).filter((loc) => {
    if (!loc?.id) return false;
    if (!mainAddr) return true;
    return normalizeAddress(loc.address) !== mainAddr;
  });
  const options = [];
  if (main) options.push(main);
  options.push(...extras);
  return options;
}

/** Convert UI selection to a DB uuid (or null for main store). */
export function toPersistablePickupLocationId(locationOrId) {
  if (locationOrId == null) return null;
  if (typeof locationOrId === 'object') {
    if (locationOrId.is_main) return null;
    const id = locationOrId.id;
    if (!id || id === MAIN_PICKUP_LOCATION_ID) return null;
    return id;
  }
  if (locationOrId === MAIN_PICKUP_LOCATION_ID) return null;
  return locationOrId;
}

export function isMainPickupLocationId(id) {
  return id == null || id === MAIN_PICKUP_LOCATION_ID;
}

/** localStorage key for guest / cache of selected pickup UI id. */
export function pickupLocationStorageKey(restaurantId) {
  return restaurantId ? `pickup_location_${restaurantId}` : 'pickup_location';
}

export function readStoredPickupLocationId(restaurantId) {
  try {
    if (typeof localStorage === 'undefined' || !restaurantId) return null;
    return localStorage.getItem(pickupLocationStorageKey(restaurantId)) || null;
  } catch {
    return null;
  }
}

export function writeStoredPickupLocationId(restaurantId, locationId) {
  try {
    if (typeof localStorage === 'undefined' || !restaurantId) return;
    const key = pickupLocationStorageKey(restaurantId);
    if (locationId == null) localStorage.removeItem(key);
    else localStorage.setItem(key, String(locationId));
  } catch {
    // Storage might be full or unavailable
  }
}

/**
 * Map restaurant_customers preference columns → UI location id ('main' | uuid).
 * Returns null when the customer has never chosen a location.
 */
export function selectionFromCustomerPreference(profile) {
  if (!profile || profile.preferred_pickup_is_main == null) return null;
  if (profile.preferred_pickup_is_main) return MAIN_PICKUP_LOCATION_ID;
  return profile.preferred_pickup_location_id || null;
}

/** Map UI location id → restaurant_customers preference columns. */
export function customerPreferenceFromSelection(locationOrId) {
  if (locationOrId == null) {
    return { preferred_pickup_is_main: null, preferred_pickup_location_id: null };
  }
  if (typeof locationOrId === 'object') {
    if (locationOrId.is_main || locationOrId.id === MAIN_PICKUP_LOCATION_ID) {
      return { preferred_pickup_is_main: true, preferred_pickup_location_id: null };
    }
    return {
      preferred_pickup_is_main: false,
      preferred_pickup_location_id: locationOrId.id || null,
    };
  }
  if (locationOrId === MAIN_PICKUP_LOCATION_ID) {
    return { preferred_pickup_is_main: true, preferred_pickup_location_id: null };
  }
  return {
    preferred_pickup_is_main: false,
    preferred_pickup_location_id: locationOrId,
  };
}

/** Active locations for customer checkout (public RLS). */
export async function listActiveLocations(restaurantId) {
  if (!restaurantId) return [];
  const { data, error } = await supabase
    .from('restaurant_locations')
    .select('id, restaurant_id, name, address, sort_order, is_active')
    .eq('restaurant_id', restaurantId)
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

/**
 * Active DB locations plus the virtual main store option.
 * Use this for Checkout / Catering pickers.
 */
export async function listPickupOptions(restaurant) {
  if (!restaurant?.id) return buildPickupOptions(restaurant, []);
  const rows = await listActiveLocations(restaurant.id);
  return buildPickupOptions(restaurant, rows);
}

/** All locations for admin settings (includes inactive). */
export async function listLocations(restaurantId) {
  if (!restaurantId) return [];
  const { data, error } = await supabase
    .from('restaurant_locations')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function createLocation(restaurantId, { name, address, sort_order = 0, is_active = true }) {
  const { data, error } = await supabase
    .from('restaurant_locations')
    .insert({
      restaurant_id: restaurantId,
      name: (name || '').trim() || 'Location',
      address: (address || '').trim(),
      sort_order,
      is_active,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateLocation(id, updates) {
  const payload = {};
  if (updates.name != null) payload.name = String(updates.name).trim();
  if (updates.address != null) payload.address = String(updates.address).trim();
  if (updates.sort_order != null) payload.sort_order = updates.sort_order;
  if (updates.is_active != null) payload.is_active = updates.is_active;

  const { data, error } = await supabase
    .from('restaurant_locations')
    .update(payload)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteLocation(id) {
  const { error } = await supabase
    .from('restaurant_locations')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

/** Swap sort_order between two locations (simple reorder). */
export async function reorderLocations(a, b) {
  if (!a?.id || !b?.id) return;
  const aOrder = a.sort_order ?? 0;
  const bOrder = b.sort_order ?? 0;
  await updateLocation(a.id, { sort_order: bOrder });
  await updateLocation(b.id, { sort_order: aOrder });
}
