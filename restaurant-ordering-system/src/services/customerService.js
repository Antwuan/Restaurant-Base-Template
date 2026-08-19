import { supabase } from '../config/supabase';

export function composeDisplayName(firstName, lastName) {
  return [firstName, lastName].filter((p) => p && String(p).trim()).map((p) => String(p).trim()).join(' ');
}

export async function getCustomerProfile(restaurantId, authUserId) {
  const { data, error } = await supabase
    .from('restaurant_customers')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .eq('auth_user_id', authUserId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function createCustomerProfile({
  restaurantId,
  authUserId,
  email,
  firstName = null,
  lastName = null,
  phone = null,
  marketingOptIn = null,
}) {
  const first = firstName?.trim() || null;
  const last = lastName?.trim() || null;

  const row = {
    restaurant_id: restaurantId,
    auth_user_id: authUserId,
    email,
    first_name: first,
    last_name: last,
    phone,
  };
  if (marketingOptIn === true) {
    row.marketing_opt_in = true;
    row.marketing_opt_in_at = new Date().toISOString();
  } else if (marketingOptIn === false) {
    row.marketing_opt_in = false;
  }

  const { data, error } = await supabase
    .from('restaurant_customers')
    .insert(row)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateCustomerProfile(customerId, updates) {
  const payload = { ...updates };
  delete payload.full_name;

  const { data, error } = await supabase
    .from('restaurant_customers')
    .update(payload)
    .eq('id', customerId)
    .select()
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    throw new Error('Could not update profile (no row updated). Check you are signed in.');
  }
  return data;
}

/** Persist preferred pickup location for a signed-in customer. */
export async function updatePreferredPickupLocation(customerId, preference) {
  if (!customerId) throw new Error('customerId is required');
  return updateCustomerProfile(customerId, {
    preferred_pickup_is_main: preference?.preferred_pickup_is_main ?? null,
    preferred_pickup_location_id: preference?.preferred_pickup_location_id ?? null,
  });
}

/**
 * Service-role edge function — works without a client JWT (email-confirm signup).
 */
export async function ensureCustomerProfile({
  restaurantId,
  userId,
  email,
  firstName = null,
  lastName = null,
  phone = null,
  marketingOptIn = null,
}) {
  const { data, error } = await supabase.functions.invoke('ensure-customer-profile', {
    body: {
      restaurantId,
      userId,
      email,
      firstName,
      lastName,
      phone,
      marketingOptIn,
    },
  });
  if (error) {
    throw new Error(data?.error || error.message || 'ensure-customer-profile failed');
  }
  if (data?.error) {
    throw new Error(data.error);
  }
  const profile = data?.profile || null;
  if (profile && restaurantId) {
    const { data: sessionData } = await supabase.auth.getSession();
    if (sessionData?.session) {
      await attachGuestOrdersToCustomer(restaurantId);
    }
  }
  return profile;
}

/**
 * Best-effort: attach unmatched guest orders (same email + restaurant, last 30 days)
 * to the signed-in customer. Requires an authenticated session; no-ops otherwise.
 */
export async function attachGuestOrdersToCustomer(restaurantId) {
  if (!restaurantId) return 0;
  try {
    const { data, error } = await supabase.rpc('attach_guest_orders_to_customer', {
      p_restaurant_id: restaurantId,
    });
    if (error) {
      console.warn('[orders] attach guest orders failed:', error.message);
      return 0;
    }
    return typeof data === 'number' ? data : 0;
  } catch (err) {
    console.warn('[orders] attach guest orders failed:', err?.message || err);
    return 0;
  }
}
