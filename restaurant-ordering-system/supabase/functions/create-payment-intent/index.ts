/**
 * Create or reuse a Stripe PaymentIntent for checkout.
 * Server-reprices the cart (quote_customer_order). Does not trust client amount.
 *
 * POST JSON:
 *   restaurantId, items[], idempotencyKey,
 *   promoCode / promoCodeId, email, pickupLocationId,
 *   optional fulfillment fields (customerName, customerPhone, orderType, menuType, scheduledTime, notes)
 *
 * 200 JSON:
 *   clientSecret, paymentIntentId, amountCents, currency,
 *   subtotal, tax, discountAmount, taxRate, reused
 */
import Stripe from 'npm:stripe@17';
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '');

const CONNECT_ONBOARDING_ERROR =
  'Complete Stripe Connect onboarding for this restaurant';

const RATE_LIMIT_MAX = 25;
const RATE_WINDOW_MS = 60_000;
const MIN_AMOUNT_CENTS = 50;
const rateHits = new Map<string, number[]>();

type V2AccountFields = {
  configuration?: {
    recipient?: {
      capabilities?: {
        stripe_balance?: {
          stripe_transfers?: { status?: string | null };
        };
      };
    };
  };
};

type LedgerRow = {
  id: string;
  restaurant_id: string;
  idempotency_key: string;
  stripe_payment_intent_id: string | null;
  amount_cents: number;
  currency: string;
  status: string;
  cart_snapshot: Record<string, unknown>;
  order_id: number | null;
};

type QuoteResult = {
  subtotal: number;
  discount_amount: number;
  tax: number;
  total: number;
  tax_rate: number;
  promo_code_id: string | null;
  promo_code: string | null;
  pickup_location_id: string | null;
  customer_id: string | null;
  amount_cents: number;
};

function isTransfersActive(account: Stripe.Account): boolean {
  const v1 = account.capabilities?.transfers;
  const v2 = (account as Stripe.Account & V2AccountFields).configuration
    ?.recipient?.capabilities?.stripe_balance?.stripe_transfers?.status;
  return v1 === 'active' || v2 === 'active';
}

function isTransfersRequested(account: Stripe.Account): boolean {
  const v1 = account.capabilities?.transfers;
  if (v1 && v1 !== 'unrequested') return true;
  const v2 = (account as Stripe.Account & V2AccountFields).configuration
    ?.recipient?.capabilities?.stripe_balance?.stripe_transfers?.status;
  if (v2 && v2 !== 'unrequested') return true;
  return false;
}

/** Dashboard deploys do not include ../_shared — keep this helper inlined. */
async function ensureConnectTransfers(stripeClient: Stripe, accountId: string): Promise<void> {
  let account: Stripe.Account;
  try {
    account = await stripeClient.accounts.retrieve(accountId);
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    if (/no such account|does not exist|capability|transfers/i.test(message)) {
      throw new Error(CONNECT_ONBOARDING_ERROR);
    }
    throw err;
  }

  if (isTransfersActive(account)) return;

  if (!isTransfersRequested(account)) {
    try {
      account = await stripeClient.accounts.update(accountId, {
        capabilities: { transfers: { requested: true } },
      });
    } catch {
      // Requesting does not finish onboarding.
    }
    if (isTransfersActive(account)) return;
  }

  throw new Error(CONNECT_ONBOARDING_ERROR);
}

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

function normalizeItems(raw: unknown): Record<string, unknown>[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((row) => {
    const item = row && typeof row === 'object' ? row as Record<string, unknown> : {};
    const mods = item.selected_modifiers ?? item.selectedModifiers ?? [];
    return {
      id: item.id,
      name: item.name ?? null,
      quantity: item.quantity ?? 1,
      special_instructions: item.special_instructions ?? item.specialInstructions ?? '',
      selected_modifiers: Array.isArray(mods) ? mods : [],
      image_url: item.image_url ?? null,
      menu_type: item.menu_type ?? item.menuType ?? null,
    };
  }).filter((item) => item.id != null && String(item.id).length > 0);
}

function ledgerStatusFromPi(status: string): string {
  switch (status) {
    case 'requires_action':
      return 'requires_action';
    case 'processing':
      return 'processing';
    case 'succeeded':
      return 'succeeded';
    case 'canceled':
      return 'canceled';
    default:
      return 'created';
  }
}

function createServiceClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );
}

async function resolveCustomerId(
  req: Request,
  restaurantId: string,
  supabase: SupabaseClient,
): Promise<string | null> {
  const authHeader = req.headers.get('Authorization') || '';
  const bearer = authHeader.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  if (!bearer || !anonKey || bearer === anonKey) return null;

  const userClient = createClient(Deno.env.get('SUPABASE_URL') ?? '', anonKey, {
    global: { headers: { Authorization: `Bearer ${bearer}` } },
  });
  const { data: authData } = await userClient.auth.getUser();
  const authUserId = authData?.user?.id;
  if (!authUserId) return null;

  const { data: customer } = await supabase
    .from('restaurant_customers')
    .select('id')
    .eq('restaurant_id', restaurantId)
    .eq('auth_user_id', authUserId)
    .maybeSingle();

  return customer?.id != null ? String(customer.id) : null;
}

function parseQuote(data: unknown): QuoteResult {
  const raw = data && typeof data === 'object' ? data as Record<string, unknown> : {};
  const amountCents = Math.round(Number(raw.amount_cents));
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    throw new Error('Could not price this order');
  }
  const asText = (value: unknown): string | null => {
    if (value == null) return null;
    const text = String(value).trim();
    return text && text !== 'null' ? text : null;
  };
  return {
    subtotal: Number(raw.subtotal),
    discount_amount: Number(raw.discount_amount),
    tax: Number(raw.tax),
    total: Number(raw.total),
    tax_rate: Number(raw.tax_rate),
    promo_code_id: asText(raw.promo_code_id),
    promo_code: asText(raw.promo_code),
    pickup_location_id: asText(raw.pickup_location_id),
    customer_id: asText(raw.customer_id),
    amount_cents: amountCents,
  };
}

async function quoteCart(
  supabase: SupabaseClient,
  payload: Record<string, unknown>,
): Promise<QuoteResult> {
  const { data, error } = await supabase.rpc('quote_customer_order', { p: payload });
  if (error) {
    throw new Error(error.message || 'Could not price this order');
  }
  return parseQuote(data);
}

function successBody(pi: Stripe.PaymentIntent, quote: QuoteResult, reused: boolean) {
  return {
    clientSecret: pi.client_secret,
    paymentIntentId: pi.id,
    amountCents: reused ? pi.amount : quote.amount_cents,
    currency: pi.currency || 'usd',
    subtotal: quote.subtotal,
    tax: quote.tax,
    discountAmount: quote.discount_amount,
    taxRate: quote.tax_rate,
    reused,
  };
}

async function loadLedger(
  supabase: SupabaseClient,
  idempotencyKey: string,
): Promise<LedgerRow | null> {
  const { data } = await supabase
    .from('payment_ledger')
    .select('*')
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle();
  return (data as LedgerRow | null) ?? null;
}

async function insertLedger(
  supabase: SupabaseClient,
  row: Record<string, unknown>,
  idempotencyKey: string,
): Promise<LedgerRow> {
  const { data, error } = await supabase
    .from('payment_ledger')
    .insert(row)
    .select('*')
    .single();

  if (!error && data) return data as LedgerRow;

  if (error?.code === '23505') {
    const existing = await loadLedger(supabase, idempotencyKey);
    if (existing) return existing;
  }

  throw new Error(error?.message || 'Could not create payment record');
}

function piIsOpen(status: Stripe.PaymentIntent.Status): boolean {
  return status === 'requires_payment_method' || status === 'requires_confirmation';
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
    const restaurantId = str(body.restaurantId || body.restaurant_id);
    const idempotencyKey = str(body.idempotencyKey || body.idempotency_key);
    const items = normalizeItems(body.items);
    const promoCode = str(body.promoCode || body.promo_code);
    const promoCodeId = str(body.promoCodeId || body.promo_code_id);
    const email = str(body.email || body.customerEmail || body.customer_email);
    const pickupLocationId = str(body.pickupLocationId || body.pickup_location_id);
    const currency = (str(body.currency) || 'usd').toLowerCase();
    const customerName = str(body.customerName || body.customer_name);
    const customerPhone = str(body.customerPhone || body.customer_phone);
    const orderType = str(body.orderType || body.order_type);
    const menuType = str(body.menuType || body.menu_type);
    const scheduledTime = str(body.scheduledTime || body.scheduled_time);
    const notes = str(body.notes);

    if (!restaurantId) {
      return jsonResponse({ error: 'restaurantId is required' }, 400);
    }
    if (!idempotencyKey || idempotencyKey.length < 16 || idempotencyKey.length > 128) {
      const looksLikeLegacyClient = body.amount != null && items.length === 0;
      return jsonResponse({
        error: looksLikeLegacyClient
          ? 'Checkout web app is out of date. Redeploy the website from the CheckOutHardening branch so it sends items and idempotencyKey (the payment function was updated, but this page is still the old build).'
          : 'idempotencyKey is required (16–128 characters)',
      }, 400);
    }
    if (items.length === 0) {
      return jsonResponse({ error: 'items array is required' }, 400);
    }

    const supabase = createServiceClient();
    const customerId = await resolveCustomerId(req, restaurantId, supabase);

    const quotePayload: Record<string, unknown> = {
      restaurant_id: restaurantId,
      items,
    };
    if (promoCodeId) quotePayload.promo_code_id = promoCodeId;
    if (promoCode) quotePayload.promo_code = promoCode;
    if (pickupLocationId) quotePayload.pickup_location_id = pickupLocationId;
    if (customerId) quotePayload.customer_id = customerId;

    const quote = await quoteCart(supabase, quotePayload);
    if (quote.amount_cents < MIN_AMOUNT_CENTS) {
      return jsonResponse({ error: 'amount (cents) must be >= 50' }, 400);
    }

    const { data: restaurant } = await supabase
      .from('restaurants')
      .select('stripe_account_id')
      .eq('id', restaurantId)
      .single();

    const cartSnapshot = {
      restaurant_id: restaurantId,
      items,
      promo_code: quote.promo_code,
      promo_code_id: quote.promo_code_id,
      pickup_location_id: quote.pickup_location_id,
      customer_email: email || null,
      customer_name: customerName || null,
      customer_phone: customerPhone || null,
      customer_id: customerId || quote.customer_id || null,
      order_type: orderType || 'pickup',
      menu_type: menuType || 'regular',
      scheduled_time: scheduledTime || null,
      notes: notes || null,
      currency,
      quote,
    };

    let ledger = await loadLedger(supabase, idempotencyKey);

    if (ledger && ledger.restaurant_id !== restaurantId) {
      return jsonResponse({ error: 'idempotencyKey already used' }, 409);
    }

    if (ledger?.status === 'succeeded' && ledger.stripe_payment_intent_id) {
      const pi = await stripe.paymentIntents.retrieve(ledger.stripe_payment_intent_id);
      return jsonResponse(successBody(pi, quote, true));
    }

    const buildCreateParams = async (): Promise<Stripe.PaymentIntentCreateParams> => {
      const piParams: Stripe.PaymentIntentCreateParams = {
        amount: quote.amount_cents,
        currency,
        automatic_payment_methods: { enabled: true },
        metadata: {
          restaurant_id: restaurantId,
          idempotency_key: idempotencyKey,
        },
      };
      if (email) piParams.receipt_email = email;
      if (restaurant?.stripe_account_id) {
        await ensureConnectTransfers(stripe, restaurant.stripe_account_id);
        piParams.transfer_data = { destination: restaurant.stripe_account_id };
      }
      return piParams;
    };

    const persistPi = async (
      rowId: string,
      pi: Stripe.PaymentIntent,
      updateSnapshot: boolean,
    ) => {
      const patch: Record<string, unknown> = {
        stripe_payment_intent_id: pi.id,
        amount_cents: pi.amount,
        currency,
        status: ledgerStatusFromPi(pi.status),
      };
      if (updateSnapshot) patch.cart_snapshot = cartSnapshot;
      const { error } = await supabase
        .from('payment_ledger')
        .update(patch)
        .eq('id', rowId);
      if (error) throw new Error(error.message || 'Could not update payment record');
    };

    if (ledger?.stripe_payment_intent_id) {
      let pi: Stripe.PaymentIntent | null = null;
      try {
        pi = await stripe.paymentIntents.retrieve(ledger.stripe_payment_intent_id);
      } catch {
        pi = null;
      }

      if (pi && pi.status !== 'canceled') {
        if (pi.status === 'succeeded' || pi.status === 'processing') {
          await persistPi(ledger.id, pi, false);
          return jsonResponse(successBody(pi, quote, true));
        }

        if (ledger.amount_cents === quote.amount_cents) {
          if (email && pi.receipt_email !== email) {
            try {
              pi = await stripe.paymentIntents.update(pi.id, { receipt_email: email });
            } catch {
              // keep existing PI
            }
          }
          await persistPi(ledger.id, pi, true);
          return jsonResponse(successBody(pi, quote, true));
        }

        if (piIsOpen(pi.status)) {
          pi = await stripe.paymentIntents.update(
            pi.id,
            {
              amount: quote.amount_cents,
              ...(email ? { receipt_email: email } : {}),
              metadata: {
                restaurant_id: restaurantId,
                idempotency_key: idempotencyKey,
              },
            },
            { idempotencyKey: `${idempotencyKey}:upd:${quote.amount_cents}` },
          );
          await persistPi(ledger.id, pi, true);
          return jsonResponse(successBody(pi, quote, false));
        }

        try {
          await stripe.paymentIntents.cancel(pi.id);
        } catch {
          return jsonResponse(
            { error: 'Payment already in progress. Refresh checkout to continue.' },
            409,
          );
        }
      }
    }

    if (!ledger) {
      ledger = await insertLedger(supabase, {
        restaurant_id: restaurantId,
        idempotency_key: idempotencyKey,
        amount_cents: quote.amount_cents,
        currency,
        status: 'created',
        cart_snapshot: cartSnapshot,
      }, idempotencyKey);

      if (ledger.stripe_payment_intent_id && ledger.amount_cents === quote.amount_cents) {
        const pi = await stripe.paymentIntents.retrieve(ledger.stripe_payment_intent_id);
        return jsonResponse(successBody(pi, quote, true));
      }
    }

    if (!ledger) {
      throw new Error('Could not create payment record');
    }

    const createParams = await buildCreateParams();
    const stripeIdempotencyKey = ledger.stripe_payment_intent_id
      ? `${idempotencyKey}:cents:${quote.amount_cents}`
      : idempotencyKey;

    const paymentIntent = await stripe.paymentIntents.create(createParams, {
      idempotencyKey: stripeIdempotencyKey,
    });

    await persistPi(ledger.id, paymentIntent, true);
    return jsonResponse(successBody(paymentIntent, quote, false));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    const status = /too many requests/i.test(message) ? 429 : 400;
    return jsonResponse({ error: message }, status);
  }
});
