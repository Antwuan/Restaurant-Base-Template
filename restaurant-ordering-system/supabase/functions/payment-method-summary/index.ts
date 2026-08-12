import Stripe from 'npm:stripe@17';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PI_ID_RE = /^pi_[A-Za-z0-9]+$/;

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function titleCaseBrand(brand: string | null | undefined) {
  if (!brand) return null;
  const key = String(brand).toLowerCase();
  const map: Record<string, string> = {
    visa: 'Visa',
    mastercard: 'Mastercard',
    amex: 'Amex',
    american_express: 'Amex',
    discover: 'Discover',
    diners: 'Diners Club',
    jcb: 'JCB',
    unionpay: 'UnionPay',
    link: 'Link',
  };
  return map[key] || brand.charAt(0).toUpperCase() + brand.slice(1);
}

/** Constant-time string compare for secret tokens of equal length. */
function secretsEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const aa = enc.encode(a);
  const bb = enc.encode(b);
  if (aa.byteLength !== bb.byteLength) return false;
  // Deno / Edge runtime exposes crypto.timingSafeEqual; fall back to XOR.
  const subtleEqual = (crypto as Crypto & {
    timingSafeEqual?: (x: BufferSource, y: BufferSource) => boolean;
  }).timingSafeEqual;
  if (typeof subtleEqual === 'function') {
    return subtleEqual(aa, bb);
  }
  let diff = 0;
  for (let i = 0; i < aa.byteLength; i += 1) {
    diff |= aa[i] ^ bb[i];
  }
  return diff === 0;
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
    const paymentIntentId = body.paymentIntentId || body.payment_intent_id;
    const clientSecret = body.clientSecret || body.client_secret;
    const restaurantId = body.restaurantId || body.restaurant_id;

    if (!paymentIntentId || typeof paymentIntentId !== 'string' || !PI_ID_RE.test(paymentIntentId)) {
      return jsonResponse({ error: 'Valid paymentIntentId is required' }, 400);
    }

    if (!clientSecret || typeof clientSecret !== 'string') {
      return jsonResponse({ error: 'clientSecret is required' }, 400);
    }

    if (!restaurantId || (typeof restaurantId !== 'string' && typeof restaurantId !== 'number')) {
      return jsonResponse({ error: 'restaurantId is required' }, 400);
    }

    // Proof of possession must bind to this PI before any Stripe retrieve.
    const expectedPrefix = `${paymentIntentId}_secret_`;
    if (!clientSecret.startsWith(expectedPrefix) || clientSecret.length <= expectedPrefix.length) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    const pi = await stripe.paymentIntents.retrieve(paymentIntentId, {
      expand: ['payment_method'],
    });

    if (!pi.client_secret || !secretsEqual(pi.client_secret, clientSecret)) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    const metaRestaurantId = pi.metadata?.restaurant_id;
    if (!metaRestaurantId || String(metaRestaurantId) !== String(restaurantId)) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    const pm = typeof pi.payment_method === 'object' && pi.payment_method
      ? pi.payment_method
      : null;

    const card = pm?.card ?? null;
    const walletType = card?.wallet?.type || null;
    const brand = titleCaseBrand(card?.brand);
    const last4 = card?.last4 || null;
    const funding = card?.funding || null;

    let label = 'Card';
    if (brand && last4) {
      label = `${brand} •••• ${last4}`;
    } else if (brand) {
      label = brand;
    } else if (last4) {
      label = `Card •••• ${last4}`;
    }

    if (walletType === 'apple_pay') {
      label = brand && last4 ? `Apple Pay · ${brand} •••• ${last4}` : 'Apple Pay';
    } else if (walletType === 'google_pay') {
      label = brand && last4 ? `Google Pay · ${brand} •••• ${last4}` : 'Google Pay';
    } else if (walletType === 'link') {
      label = brand && last4 ? `Link · ${brand} •••• ${last4}` : 'Link';
    }

    return jsonResponse({
      brand,
      last4,
      funding,
      wallet: walletType,
      label,
      type: pm?.type || 'card',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    // Do not leak Stripe "No such payment_intent" details that aid enumeration.
    const status = /no such payment_intent/i.test(message) ? 401 : 400;
    return jsonResponse({ error: status === 401 ? 'Unauthorized' : message }, status);
  }
});
