/**
 * Redeem a reward offer: deduct points and mint a one-time promo code.
 *
 * POST { restaurantId, offerId }
 * Auth: Bearer JWT required (customer).
 * Returns { code, promo, newBalance }
 */
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function generatePromoCode(length = 8) {
  let code = '';
  for (let i = 0; i < length; i += 1) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

function createServiceClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  try {
    const authHeader = req.headers.get('Authorization') || '';
    const bearer = authHeader.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || '';
    if (!bearer) {
      return jsonResponse({ error: 'Authorization required' }, 401);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${bearer}` } },
    });
    const { data: authData, error: authErr } = await userClient.auth.getUser();
    if (authErr || !authData?.user) {
      return jsonResponse({ error: 'Invalid authorization' }, 401);
    }
    const authUserId = authData.user.id;

    const body = await req.json();
    const restaurantId = String(body.restaurantId || '').trim();
    const offerId = String(body.offerId || '').trim();
    if (!restaurantId) return jsonResponse({ error: 'restaurantId is required' }, 400);
    if (!offerId) return jsonResponse({ error: 'offerId is required' }, 400);

    const supabase = createServiceClient();

    const { data: customer, error: custErr } = await supabase
      .from('restaurant_customers')
      .select('id, points_balance, restaurant_id, auth_user_id')
      .eq('restaurant_id', restaurantId)
      .eq('auth_user_id', authUserId)
      .maybeSingle();

    if (custErr) {
      console.error('redeem-reward-offer customer lookup:', custErr);
      return jsonResponse({ error: 'Could not load customer profile' }, 500);
    }
    if (!customer) {
      return jsonResponse({ error: 'Customer profile not found for this restaurant' }, 404);
    }

    const { data: offer, error: offerErr } = await supabase
      .from('reward_offers')
      .select(
        'id, restaurant_id, title, description, points_cost, is_active, benefit_type, discount_value, menu_item_id, buy_quantity, get_quantity',
      )
      .eq('id', offerId)
      .eq('restaurant_id', restaurantId)
      .maybeSingle();

    if (offerErr) {
      console.error('redeem-reward-offer offer lookup:', offerErr);
      return jsonResponse({ error: 'Could not load offer' }, 500);
    }
    if (!offer || !offer.is_active) {
      return jsonResponse({ error: 'Offer not found or inactive' }, 404);
    }
    if (!offer.benefit_type) {
      return jsonResponse({
        error: 'This offer is not configured for checkout redemption yet. Please contact the restaurant.',
      }, 400);
    }

    const pointsCost = Number(offer.points_cost) || 0;
    const balance = Number(customer.points_balance) || 0;
    if (pointsCost <= 0) {
      return jsonResponse({ error: 'Offer is misconfigured' }, 500);
    }
    if (balance < pointsCost) {
      return jsonResponse({ error: 'Not enough points to redeem this offer.' }, 400);
    }

    const newBalance = balance - pointsCost;
    const { data: deducted, error: deductErr } = await supabase
      .from('restaurant_customers')
      .update({ points_balance: newBalance })
      .eq('id', customer.id)
      .eq('points_balance', balance) // optimistic lock
      .select('points_balance')
      .maybeSingle();

    if (deductErr) {
      console.error('redeem-reward-offer deduct:', deductErr);
      return jsonResponse({ error: 'Could not deduct points' }, 500);
    }
    if (!deducted) {
      return jsonResponse({ error: 'Not enough points to redeem this offer.' }, 400);
    }

    const { data: redemption, error: redErr } = await supabase
      .from('reward_redemptions')
      .insert({
        restaurant_id: restaurantId,
        customer_id: customer.id,
        offer_id: offer.id,
        points_spent: pointsCost,
      })
      .select('id')
      .single();

    if (redErr || !redemption) {
      console.error('redeem-reward-offer redemption:', redErr);
      await supabase
        .from('restaurant_customers')
        .update({ points_balance: balance })
        .eq('id', customer.id);
      return jsonResponse({ error: 'Could not record redemption' }, 500);
    }

    const promoPayload = {
      restaurant_id: restaurantId,
      code: generatePromoCode(),
      title: offer.title,
      description: offer.description,
      benefit_type: offer.benefit_type,
      discount_value: offer.discount_value,
      menu_item_id: offer.menu_item_id,
      buy_quantity: offer.buy_quantity,
      get_quantity: offer.get_quantity,
      max_redemptions: 1,
      is_active: true,
      source_offer_id: offer.id,
      issued_to_customer_id: customer.id,
    };

    let promo = null;
    let lastPromoErr = null;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const tryPayload = { ...promoPayload, code: attempt === 0 ? promoPayload.code : generatePromoCode() };
      const { data, error } = await supabase
        .from('promo_codes')
        .insert(tryPayload)
        .select(
          'id, code, title, description, benefit_type, discount_value, menu_item_id, buy_quantity, get_quantity, max_redemptions',
        )
        .single();
      if (!error && data) {
        promo = data;
        break;
      }
      lastPromoErr = error;
      // Unique violation on code — retry
      if (error?.code !== '23505') break;
    }

    if (!promo) {
      console.error('redeem-reward-offer mint promo:', lastPromoErr);
      await supabase.from('reward_redemptions').delete().eq('id', redemption.id);
      await supabase
        .from('restaurant_customers')
        .update({ points_balance: balance })
        .eq('id', customer.id);
      return jsonResponse({ error: 'Could not create checkout code' }, 500);
    }

    await supabase
      .from('reward_redemptions')
      .update({ promo_code_id: promo.id })
      .eq('id', redemption.id);

    return jsonResponse({
      code: promo.code,
      promo: {
        id: promo.id,
        code: promo.code,
        title: promo.title,
        description: promo.description,
        benefit_type: promo.benefit_type,
        discount_value: promo.discount_value != null ? Number(promo.discount_value) : null,
        menu_item_id: promo.menu_item_id,
        buy_quantity: promo.buy_quantity,
        get_quantity: promo.get_quantity,
      },
      newBalance,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('redeem-reward-offer error:', message);
    return jsonResponse({ error: message }, 500);
  }
});
