/**
 * Stripe webhook: verify Stripe-Signature; fulfill payment_ledger + place_customer_order.
 * Secrets: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
 *
 * Events:
 *   payment_intent.succeeded — mark ledger succeeded; place order from cart_snapshot if needed
 *   payment_intent.payment_failed — mark ledger failed (no-op if already succeeded / order exists)
 */
import Stripe from 'npm:stripe@17';
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '');
const cryptoProvider = typeof Stripe.createSubtleCryptoProvider === 'function'
  ? Stripe.createSubtleCryptoProvider()
  : undefined;

type LedgerRow = {
  id: string;
  restaurant_id: string;
  idempotency_key: string;
  stripe_payment_intent_id: string | null;
  amount_cents: number;
  currency: string;
  status: string;
  cart_snapshot: Record<string, unknown> | null;
  order_id: number | string | null;
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function createServiceClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );
}

function snapshotStr(snapshot: Record<string, unknown> | null, ...keys: string[]): string {
  if (!snapshot) return '';
  for (const key of keys) {
    const value = snapshot[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

async function findLedger(
  supabase: SupabaseClient,
  pi: Stripe.PaymentIntent,
): Promise<LedgerRow | null> {
  const { data: byPi } = await supabase
    .from('payment_ledger')
    .select('*')
    .eq('stripe_payment_intent_id', pi.id)
    .maybeSingle();
  if (byPi) return byPi as LedgerRow;

  const idempotencyKey = typeof pi.metadata?.idempotency_key === 'string'
    ? pi.metadata.idempotency_key.trim()
    : '';
  if (!idempotencyKey) return null;

  const { data: byKey } = await supabase
    .from('payment_ledger')
    .select('*')
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle();
  return (byKey as LedgerRow | null) ?? null;
}

function orderPayloadFromSnapshot(
  snapshot: Record<string, unknown> | null,
  pi: Stripe.PaymentIntent,
  restaurantId: string,
): Record<string, unknown> {
  const items = Array.isArray(snapshot?.items) ? snapshot.items : [];
  const quote = snapshot?.quote && typeof snapshot.quote === 'object'
    ? snapshot.quote as Record<string, unknown>
    : {};

  const payload: Record<string, unknown> = {
    restaurant_id: restaurantId,
    items,
    stripe_payment_intent_id: pi.id,
    status: 'pending',
    order_type: snapshotStr(snapshot, 'order_type') || 'pickup',
    menu_type: snapshotStr(snapshot, 'menu_type') || 'regular',
  };

  const promoCodeId = snapshotStr(snapshot, 'promo_code_id') || String(quote.promo_code_id || '');
  const promoCode = snapshotStr(snapshot, 'promo_code') || String(quote.promo_code || '');
  const pickupLocationId = snapshotStr(snapshot, 'pickup_location_id')
    || String(quote.pickup_location_id || '');
  const customerId = snapshotStr(snapshot, 'customer_id') || String(quote.customer_id || '');
  const email = snapshotStr(snapshot, 'customer_email')
    || (typeof pi.receipt_email === 'string' ? pi.receipt_email : '');
  const name = snapshotStr(snapshot, 'customer_name');
  const phone = snapshotStr(snapshot, 'customer_phone');
  const scheduled = snapshotStr(snapshot, 'scheduled_time');
  const notes = snapshotStr(snapshot, 'notes');

  if (promoCodeId && promoCodeId !== 'null') payload.promo_code_id = promoCodeId;
  if (promoCode && promoCode !== 'null') payload.promo_code = promoCode;
  if (pickupLocationId && pickupLocationId !== 'null') payload.pickup_location_id = pickupLocationId;
  if (customerId && customerId !== 'null') payload.customer_id = customerId;
  if (email) payload.customer_email = email;
  if (name) payload.customer_name = name;
  if (phone) payload.customer_phone = phone;
  if (scheduled) payload.scheduled_time = scheduled;
  if (notes) payload.notes = notes;

  return payload;
}

async function handleSucceeded(
  supabase: SupabaseClient,
  pi: Stripe.PaymentIntent,
): Promise<Response> {
  const ledger = await findLedger(supabase, pi);
  if (!ledger) {
    console.warn('stripe-webhook: no ledger for', pi.id);
    return jsonResponse({ received: true, ignored: true });
  }

  if (ledger.order_id != null && (ledger.status === 'succeeded' || ledger.status === 'processing')) {
    if (ledger.status !== 'succeeded') {
      await supabase
        .from('payment_ledger')
        .update({ status: 'succeeded', stripe_payment_intent_id: pi.id })
        .eq('id', ledger.id);
    }
    return jsonResponse({ received: true, duplicate: true, orderId: ledger.order_id });
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
    console.error('stripe-webhook ledger succeeded update error:', statusErr);
    return jsonResponse({ error: 'Could not update payment record' }, 500);
  }

  if (ledger.order_id != null) {
    return jsonResponse({ received: true, orderId: ledger.order_id });
  }

  const restaurantId = ledger.restaurant_id
    || snapshotStr(ledger.cart_snapshot, 'restaurant_id')
    || (typeof pi.metadata?.restaurant_id === 'string' ? pi.metadata.restaurant_id : '');

  if (!restaurantId) {
    console.error('stripe-webhook: missing restaurant_id for', pi.id);
    return jsonResponse({ error: 'Missing restaurant_id' }, 500);
  }

  const payload = orderPayloadFromSnapshot(ledger.cart_snapshot, pi, restaurantId);
  const { data: order, error: orderErr } = await supabase.rpc('place_customer_order', {
    p: payload,
  });

  if (orderErr) {
    console.error('stripe-webhook place_customer_order error:', orderErr);
    return jsonResponse({ error: orderErr.message || 'Could not place order' }, 500);
  }

  const orderId = order?.id ?? null;
  if (orderId != null) {
    const { error: linkErr } = await supabase
      .from('payment_ledger')
      .update({ order_id: orderId, status: 'succeeded' })
      .eq('id', ledger.id);
    if (linkErr) {
      console.error('stripe-webhook ledger order_id update error:', linkErr);
    }
  }

  return jsonResponse({ received: true, orderId });
}

async function handleFailed(
  supabase: SupabaseClient,
  pi: Stripe.PaymentIntent,
): Promise<Response> {
  const ledger = await findLedger(supabase, pi);
  if (!ledger) {
    return jsonResponse({ received: true, ignored: true });
  }

  if (ledger.status === 'succeeded' || ledger.order_id != null) {
    return jsonResponse({ received: true, duplicate: true });
  }

  const { error } = await supabase
    .from('payment_ledger')
    .update({
      status: 'failed',
      stripe_payment_intent_id: pi.id,
    })
    .eq('id', ledger.id);

  if (error) {
    console.error('stripe-webhook ledger failed update error:', error);
    return jsonResponse({ error: 'Could not update payment record' }, 500);
  }

  return jsonResponse({ received: true });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Content-Type': 'application/json' } });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '';
  if (!webhookSecret) {
    return jsonResponse({ error: 'STRIPE_WEBHOOK_SECRET is not configured' }, 500);
  }

  const signature = req.headers.get('Stripe-Signature') ?? '';
  const payload = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      payload,
      signature,
      webhookSecret,
      undefined,
      cryptoProvider,
    );
  } catch (err) {
    console.error('stripe-webhook signature error:', err);
    return jsonResponse({ error: 'Invalid signature' }, 400);
  }

  try {
    const supabase = createServiceClient();

    switch (event.type) {
      case 'payment_intent.succeeded': {
        const pi = event.data.object as Stripe.PaymentIntent;
        return await handleSucceeded(supabase, pi);
      }
      case 'payment_intent.payment_failed': {
        const pi = event.data.object as Stripe.PaymentIntent;
        return await handleFailed(supabase, pi);
      }
      default:
        return jsonResponse({ received: true });
    }
  } catch (err) {
    console.error('stripe-webhook error:', err);
    return jsonResponse({ error: 'Webhook handler failed' }, 500);
  }
});
