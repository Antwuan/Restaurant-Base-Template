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
  return data?.profile || null;
}
