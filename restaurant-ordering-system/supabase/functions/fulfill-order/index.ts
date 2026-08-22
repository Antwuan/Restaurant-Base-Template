/**
 * Client fulfillment after Stripe confirmPayment.
 * Proof of possession: PaymentIntent client_secret.
 * Verifies PI succeeded, marks payment_ledger, then place_customer_order
 * (which quotes cart_snapshot and requires a matching paid amount).
 *
 * POST JSON: { restaurantId, paymentIntentId, clientSecret }
 * 200 JSON: order row
 */
import Stripe from 'npm:stripe@17';
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PI_ID_RE = /^pi_[A-Za-z0-9]+$/;
const RATE_LIMIT_MAX = 25;
const RATE_WINDOW_MS = 60_000;
const QUOTE_CURRENCY = 'usd';
const rateHits = new Map<string, number[]>();

type LedgerRow = {
  id: string;
  restaurant_id: string;
  amount_cents: number;
  status: string;
  order_id: number | string | null;
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function clientIp(req: Request): string {
  const cf = req.headers.get('cf-connecting-ip');
  if (cf) return cf.trim();
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return req.headers.get('x-real-ip')?.trim() || 'unknown';
}

function allowRequest(ip: string): boolean {
  const now = Date.now();
  const windowStart = now - RATE_WINDOW_MS;
  const prev = (rateHits.get(ip) || []).filter((t) => t > windowStart);
  if (prev.length >= RATE_LIMIT_MAX) {
    rateHits.set(ip, prev);
    return false;
  }
  prev.push(now);
  rateHits.set(ip, prev);
  if (rateHits.size > 4000) {
    for (const [key, times] of rateHits) {
      const kept = times.filter((t) => t > windowStart);
      if (kept.length === 0) rateHits.delete(key);
      else rateHits.set(key, kept);
    }
  }
  return true;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** Constant-time string compare for secret tokens of equal length. */
function secretsEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const aa = enc.encode(a);
  const bb = enc.encode(b);
  if (aa.byteLength !== bb.byteLength) return false;
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

function createServiceClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );
}

async function findLedger(
  supabase: SupabaseClient,
  pi: Stripe.PaymentIntent,
): Promise<LedgerRow | null> {
  const { data: byPi } = await supabase
    .from('payment_ledger')
    .select('id, restaurant_id, amount_cents, status, order_id')
    .eq('stripe_payment_intent_id', pi.id)
    .maybeSingle();
  if (byPi) return byPi as LedgerRow;

  const idempotencyKey = typeof pi.metadata?.idempotency_key === 'string'
    ? pi.metadata.idempotency_key.trim()
    : '';
  if (!idempotencyKey) return null;

  const { data: byKey } = await supabase
    .from('payment_ledger')
    .select('id, restaurant_id, amount_cents, status, order_id')
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle();
  return (byKey as LedgerRow | null) ?? null;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  if (!allowRequest(clientIp(req))) {
    return jsonResponse({ error: 'Too many requests' }, 429);
  }

  try {
    const body = await req.json();
    const paymentIntentId = str(body.paymentIntentId || body.payment_intent_id);
    const clientSecret = str(body.clientSecret || body.client_secret);
    const restaurantId = str(body.restaurantId || body.restaurant_id);

    if (!paymentIntentId || !PI_ID_RE.test(paymentIntentId)) {
      return jsonResponse({ error: 'Valid paymentIntentId is required' }, 400);
    }
    if (!clientSecret) {
      return jsonResponse({ error: 'clientSecret is required' }, 400);
    }
    if (!restaurantId) {
      return jsonResponse({ error: 'restaurantId is required' }, 400);
    }

    const expectedPrefix = `${paymentIntentId}_secret_`;
    if (!clientSecret.startsWith(expectedPrefix) || clientSecret.length <= expectedPrefix.length) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    const pi = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (!pi.client_secret || !secretsEqual(pi.client_secret, clientSecret)) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    const metaRestaurantId = typeof pi.metadata?.restaurant_id === 'string'
      ? pi.metadata.restaurant_id
      : '';
    if (!metaRestaurantId || metaRestaurantId !== restaurantId) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    if (pi.status !== 'succeeded') {
      const status = pi.status === 'processing' ? 409 : 402;
      return jsonResponse({
        error: pi.status === 'processing'
          ? 'Payment is still processing'
          : 'Payment has not succeeded',
      }, status);
    }

    const chargedCurrency = (pi.currency || '').trim().toLowerCase();
    if (chargedCurrency !== QUOTE_CURRENCY) {
      return jsonResponse({ error: 'Payment currency is not supported' }, 409);
    }

    const supabase = createServiceClient();
    const ledger = await findLedger(supabase, pi);
    if (!ledger) {
      return jsonResponse({ error: 'No payment found for this PaymentIntent' }, 404);
    }
    if (ledger.restaurant_id !== restaurantId) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }
    if (ledger.amount_cents !== pi.amount) {
      return jsonResponse({ error: 'Order total does not match paid amount' }, 409);
    }

    const { error: statusErr } = await supabase
      .from('payment_ledger')
      .update({
        status: 'succeeded',
        stripe_payment_intent_id: pi.id,
        amount_cents: pi.amount,
      })
      .eq('id', ledger.id);
    if (statusErr) {
      console.error('fulfill-order ledger update error:', statusErr);
      return jsonResponse({ error: 'Could not update payment record' }, 500);
    }

    const { data: order, error: orderErr } = await supabase.rpc('place_customer_order', {
      p: {
        restaurant_id: restaurantId,
        stripe_payment_intent_id: pi.id,
      },
    });

    if (orderErr) {
      console.error('fulfill-order place_customer_order error:', orderErr);
      return jsonResponse({ error: orderErr.message || 'Could not place order' }, 500);
    }

    return jsonResponse(order);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    const status = /no such payment_intent/i.test(message) ? 401 : 400;
    return jsonResponse({
      error: status === 401 ? 'Unauthorized' : message,
    }, status);
  }
});
