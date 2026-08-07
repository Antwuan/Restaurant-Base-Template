import { supabase } from '../config/supabase';
import { normalizeBenefitPayload } from './promoService';

function friendlyDbError(error, action) {
  if (!error) return `Could not ${action}`;
  const msg = error.message || '';
  const code = error.code || '';
  if (code === '42501' || /row-level security|permission denied/i.test(msg)) {
    return `Could not ${action}: permission denied (check you are signed in as staff).`;
  }
  if (code === '23514' || /check constraint|violates check/i.test(msg)) {
    return `Could not ${action}: invalid benefit fields for this type.`;
  }
  if (code === 'PGRST116' || /0 rows|Cannot coerce/i.test(msg)) {
    return `Could not ${action}: no matching row (it may have been deleted or you lack access).`;
  }
  if (/buy_quantity|get_quantity|benefit_type|column .* does not exist/i.test(msg)) {
    return `Could not ${action}: rewards schema is outdated. Run migration 20260806225739_offer_promo_benefit_types.sql then retry.`;
  }
  return msg || `Could not ${action}`;
}

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
    .select('*, menu_items:menu_item_id(id, name, price)')
    .eq('restaurant_id', restaurantId)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function createOffer(restaurantId, offer) {
  const benefit = offer.benefit_type ? normalizeBenefitPayload(offer) : {};
  const { data, error } = await supabase
    .from('reward_offers')
    .insert({
      restaurant_id: restaurantId,
      title: offer.title,
      description: offer.description ?? null,
      points_cost: offer.points_cost,
      is_active: offer.is_active ?? true,
      sort_order: offer.sort_order ?? 0,
      ...benefit,
    })
    .select()
    .single();
  if (error) throw new Error(friendlyDbError(error, 'create offer'));
  return data;
}

export async function updateOffer(offerId, updates) {
  const payload = { ...updates };
  if (payload.benefit_type != null) {
    Object.assign(payload, normalizeBenefitPayload(payload));
  }
  const { data, error } = await supabase
    .from('reward_offers')
    .update(payload)
    .eq('id', offerId)
    .select()
    .maybeSingle();
  if (error) throw new Error(friendlyDbError(error, 'update offer'));
  if (!data) throw new Error(friendlyDbError({ code: 'PGRST116' }, 'update offer'));
  return data;
}

export async function deleteOffer(offerId) {
  const { data, error } = await supabase
    .from('reward_offers')
    .delete()
    .eq('id', offerId)
    .select('id')
    .maybeSingle();
  if (error) throw new Error(friendlyDbError(error, 'delete offer'));
  if (!data) throw new Error(friendlyDbError({ code: 'PGRST116' }, 'delete offer'));
}

// ─── Points ───────────────────────────────────────────────────────────────────

/**
 * Awards points to a signed-in customer after a completed order.
 * Silently fails so it never blocks the order flow.
 */
export async function awardPoints({ restaurantId, authUserId, orderTotal, pointsPerDollar = 1 }) {
  try {
    const earned = Math.floor(orderTotal * pointsPerDollar);
    if (!earned || !authUserId || !restaurantId) return { pointsEarned: 0 };

    const { data: customer } = await supabase
      .from('restaurant_customers')
      .select('id, points_balance')
      .eq('restaurant_id', restaurantId)
      .eq('auth_user_id', authUserId)
      .maybeSingle();

    if (!customer) return { pointsEarned: 0 };

    const newBalance = (customer.points_balance || 0) + earned;
    await supabase
      .from('restaurant_customers')
      .update({ points_balance: newBalance })
      .eq('id', customer.id);

    return { pointsEarned: earned, pointsBalance: newBalance };
  } catch (e) {
    // Silently swallow — points should never break checkout
    console.warn('awardPoints failed:', e.message);
    return { pointsEarned: 0 };
  }
}

/**
 * Promo codes minted from reward-offer redemptions for the signed-in customer.
 * Relies on RLS policy promo_codes_select_own_issued.
 */
export async function getMyRewardCodes(restaurantId) {
  if (!restaurantId) return [];
  const { data, error } = await supabase
    .from('promo_codes')
    .select(
      'id, code, title, description, benefit_type, discount_value, redemption_count, max_redemptions, created_at, source_offer_id, issued_to_customer_id',
    )
    .eq('restaurant_id', restaurantId)
    .not('source_offer_id', 'is', null)
    .order('created_at', { ascending: false });
  if (error) throw error;
  // Hide fully redeemed one-time codes — do not show grayed-out "Used" rows.
  return (data || []).filter((row) => {
    if (row.max_redemptions == null) return true;
    return Number(row.redemption_count || 0) < Number(row.max_redemptions);
  });
}

/**
 * Redeems an offer via edge function (service role):
 * deducts points and mints a one-time checkout promo code.
 * Returns { code, promo, newBalance }.
 */
export async function redeemOffer({ restaurantId, offerId }) {
  const { data, error } = await supabase.functions.invoke('redeem-reward-offer', {
    body: { restaurantId, offerId },
  });

  if (error) {
    let message = data?.error || error.message || 'Could not redeem offer';
    try {
      const ctx = error.context;
      if (ctx && typeof ctx.json === 'function') {
        const payload = await ctx.json();
        if (payload?.error) message = payload.error;
      }
    } catch {
      // keep message
    }
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  if (!data?.code) throw new Error('Redeem succeeded but no code was returned');
  return data;
}
