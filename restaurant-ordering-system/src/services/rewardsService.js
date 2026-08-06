import { supabase } from '../config/supabase';

// ─── Offers ──────────────────────────────────────────────────────────────────

export async function getActiveOffers(restaurantId) {
  const { data, error } = await supabase
    .from('reward_offers')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .eq('is_active', true)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function getAllOffers(restaurantId) {
  const { data, error } = await supabase
    .from('reward_offers')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function createOffer(restaurantId, offer) {
  const { data, error } = await supabase
    .from('reward_offers')
    .insert({ restaurant_id: restaurantId, ...offer })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateOffer(offerId, updates) {
  const { data, error } = await supabase
    .from('reward_offers')
    .update(updates)
    .eq('id', offerId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteOffer(offerId) {
  const { error } = await supabase
    .from('reward_offers')
    .delete()
    .eq('id', offerId);
  if (error) throw error;
}

// ─── Points ───────────────────────────────────────────────────────────────────

/**
 * Awards points to a signed-in customer after a completed order.
 * Silently fails so it never blocks the order flow.
 */
export async function awardPoints({ restaurantId, authUserId, orderTotal, pointsPerDollar = 1 }) {
  try {
    const earned = Math.floor(orderTotal * pointsPerDollar);
    if (!earned || !authUserId || !restaurantId) return;

    const { data: customer } = await supabase
      .from('restaurant_customers')
      .select('id, points_balance')
      .eq('restaurant_id', restaurantId)
      .eq('auth_user_id', authUserId)
      .maybeSingle();

    if (!customer) return;

    await supabase
      .from('restaurant_customers')
      .update({ points_balance: (customer.points_balance || 0) + earned })
      .eq('id', customer.id);
  } catch (e) {
    // Silently swallow — points should never break checkout
    console.warn('awardPoints failed:', e.message);
  }
}

/**
 * Redeems an offer for a customer:
 *  1. Checks the customer has enough points
 *  2. Deducts points_cost from balance
 *  3. Inserts a reward_redemption record
 * Returns the updated customer record.
 */
export async function redeemOffer({ restaurantId, customerId, offerId, pointsCost }) {
  // 1. Fetch current balance
  const { data: customer, error: fetchErr } = await supabase
    .from('restaurant_customers')
    .select('id, points_balance')
    .eq('id', customerId)
    .single();
  if (fetchErr) throw fetchErr;
  if ((customer.points_balance || 0) < pointsCost) {
    throw new Error('Not enough points to redeem this offer.');
  }

  // 2. Deduct points
  const newBalance = customer.points_balance - pointsCost;
  const { data: updated, error: updateErr } = await supabase
    .from('restaurant_customers')
    .update({ points_balance: newBalance })
    .eq('id', customerId)
    .select()
    .single();
  if (updateErr) throw updateErr;

  // 3. Record redemption
  await supabase.from('reward_redemptions').insert({
    restaurant_id: restaurantId,
    customer_id: customerId,
    offer_id: offerId,
    points_spent: pointsCost,
  });

  return updated;
}
