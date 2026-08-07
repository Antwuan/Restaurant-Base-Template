/**
 * Validate a marketing promo code for checkout.
 * Uses service role — promo_codes has no public SELECT (staff RLS only).
 *
 * POST { restaurantId, code, cartItemIds?: string[], cartItems?: { id, quantity }[] }
 */
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function createServiceClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );
}

type CartLine = { id: string; quantity: number };

function parseCartItems(body: Record<string, unknown>): CartLine[] {
  if (Array.isArray(body.cartItems)) {
    return body.cartItems.map((raw: unknown) => {
      const row = raw as { id?: unknown; quantity?: unknown };
      return {
        id: String(row?.id ?? ''),
        quantity: Math.max(0, Number(row?.quantity) || 1),
      };
    }).filter((l) => l.id);
  }
  const ids = Array.isArray(body.cartItemIds)
    ? body.cartItemIds.map((id: unknown) => String(id))
    : [];
  return ids.map((id) => ({ id, quantity: 1 }));
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  try {
    const body = await req.json();
    const restaurantId = String(body.restaurantId || '').trim();
    const code = String(body.code || '').trim().toUpperCase();
    const cartItems = parseCartItems(body);

    if (!restaurantId) return jsonResponse({ error: 'restaurantId is required' }, 400);
    if (!code) return jsonResponse({ error: 'Promo code is required' }, 400);

    const supabase = createServiceClient();
    const { data: promo, error } = await supabase
      .from('promo_codes')
      .select(
        'id, restaurant_id, code, title, description, benefit_type, discount_value, menu_item_id, buy_quantity, get_quantity, max_redemptions, redemption_count, starts_at, expires_at, is_active',
      )
      .eq('restaurant_id', restaurantId)
      .eq('code', code)
      .maybeSingle();

    if (error) {
      console.error('validate-promo-code query error:', error);
      return jsonResponse({ error: 'Could not validate promo code' }, 500);
    }

    if (!promo || !promo.is_active) {
      return jsonResponse({ error: 'Invalid or inactive promo code' }, 404);
    }

    const now = Date.now();
    if (promo.starts_at && new Date(promo.starts_at).getTime() > now) {
      return jsonResponse({ error: 'This promo code is not active yet' }, 400);
    }
    if (promo.expires_at && new Date(promo.expires_at).getTime() < now) {
      return jsonResponse({ error: 'This promo code has expired' }, 400);
    }
    if (
      promo.max_redemptions != null
      && Number(promo.redemption_count) >= Number(promo.max_redemptions)
    ) {
      return jsonResponse({ error: 'This promo code has reached its redemption limit' }, 400);
    }

    const needsItem = [
      'free_item',
      'bogo',
      'buy_x_percent_off',
      'buy_x_amount_off',
    ].includes(promo.benefit_type);

    if (needsItem) {
      if (!promo.menu_item_id) {
        return jsonResponse({ error: 'Promo is misconfigured' }, 500);
      }
      if (cartItems.length > 0) {
        const line = cartItems.find((i) => i.id === String(promo.menu_item_id));
        if (!line) {
          const msg = promo.benefit_type === 'free_item'
            ? 'Add the free promo item to your cart to use this code.'
            : 'Add the promo item to your cart to use this code.';
          return jsonResponse({ error: msg }, 400);
        }
        if (
          (promo.benefit_type === 'buy_x_percent_off' || promo.benefit_type === 'buy_x_amount_off')
          && line.quantity < Number(promo.buy_quantity || 1)
        ) {
          return jsonResponse({
            error: `Add at least ${promo.buy_quantity} of the promo item to your cart.`,
          }, 400);
        }
      }
    }

    return jsonResponse({
      promo: {
        id: promo.id,
        code: promo.code,
        title: promo.title,
        description: promo.description,
        benefit_type: promo.benefit_type,
        discount_value: promo.discount_value != null ? Number(promo.discount_value) : null,
        menu_item_id: promo.menu_item_id,
        buy_quantity: promo.buy_quantity != null ? Number(promo.buy_quantity) : null,
        get_quantity: promo.get_quantity != null ? Number(promo.get_quantity) : null,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('validate-promo-code error:', message);
    return jsonResponse({ error: message }, 500);
  }
});
