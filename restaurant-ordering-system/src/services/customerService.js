import { supabase } from '../config/supabase';

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
  fullName = null,
  phone = null,
}) {
  const { data, error } = await supabase
    .from('restaurant_customers')
    .insert({
      restaurant_id: restaurantId,
      auth_user_id: authUserId,
      email,
      full_name: fullName,
      phone,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateCustomerProfile(customerId, updates) {
  const { data, error } = await supabase
    .from('restaurant_customers')
    .update(updates)
    .eq('id', customerId)
    .select()
    .single();

  if (error) throw error;
  return data;
}
