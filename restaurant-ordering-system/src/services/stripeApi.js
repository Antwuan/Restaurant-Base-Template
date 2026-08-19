import { loadStripe } from '@stripe/stripe-js';
import { supabase } from '../config/supabase';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL?.replace(/\/$/, '');
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Functions base must be `{SUPABASE_URL}/functions/v1`.
 * Production sometimes sets EXPO_PUBLIC_BACKEND_URL to a single function
 * (e.g. .../create-checkout-session), which makes PaymentIntent calls hit
 * the wrong handler ("items array is required").
 */
function normalizeFunctionsBaseUrl(rawUrl, supabaseUrl) {
  const supabaseBase =
    typeof supabaseUrl === 'string' ? supabaseUrl.trim().replace(/\/+$/, '') : '';
  let url = typeof rawUrl === 'string' ? rawUrl.trim() : '';
  url = url.replace(/\/+$/, '');
  url = url.replace(/\/(?:create-checkout-session|create-payment-intent)$/i, '');
  url = url.replace(/\/+$/, '');

  if (!url) {
    return supabaseBase ? `${supabaseBase}/functions/v1` : null;
  }
  if (supabaseBase && url === supabaseBase) {
    return `${supabaseBase}/functions/v1`;
  }
  return url;
}

const BACKEND_URL = normalizeFunctionsBaseUrl(
  process.env.EXPO_PUBLIC_BACKEND_URL,
  SUPABASE_URL,
);

/**
 * Edge Function headers. apikey is always the anon key.
 * Authorization is the customer JWT when a session exists so create-payment-intent
 * can attach customer_id; otherwise the anon key (gateway auth only).
 */
async function getFunctionHeaders({ useUserJwt = false } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (SUPABASE_ANON_KEY) {
    headers.apikey = SUPABASE_ANON_KEY;
    headers.Authorization = `Bearer ${SUPABASE_ANON_KEY}`;
  }
  if (useUserJwt) {
    try {
      const { data } = await supabase.auth.getSession();
      const accessToken = data?.session?.access_token;
      if (accessToken && accessToken !== SUPABASE_ANON_KEY) {
        headers.Authorization = `Bearer ${accessToken}`;
      }
    } catch {
      // keep anon bearer
    }
  }
  return headers;
}

/**
 * Creates a Stripe Checkout Session (ui_mode: 'custom') with line items.
 * Returns the session client_secret used to initialize CheckoutElementsProvider.
 */
export async function createCheckoutSession({ items, restaurantId, currency = 'usd' }) {
  if (!BACKEND_URL) {
    throw new Error(
      'Payment backend URL is not configured. Set EXPO_PUBLIC_BACKEND_URL or EXPO_PUBLIC_SUPABASE_URL in .env',
    );
  }

  const returnUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/confirmation`
      : '';

  const response = await fetch(`${BACKEND_URL}/create-checkout-session`, {
    method: 'POST',
    headers: await getFunctionHeaders(),
    body: JSON.stringify({ items, restaurantId, currency, returnUrl }),
  });

  let payload;
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }

  if (!response.ok) {
    throw new Error(payload.message || payload.error || 'Failed to initialize checkout.');
  }

  const { clientSecret } = payload;
  if (!clientSecret) {
    throw new Error('Checkout session did not return a client secret.');
  }

  return clientSecret;
}

const ATTEMPT_STORAGE_PREFIX = 'checkout_attempt';

function newIdempotencyKey() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `ck_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
}

export function checkoutAttemptStorageKey(restaurantId, kind = 'checkout') {
  return `${ATTEMPT_STORAGE_PREFIX}:${restaurantId}:${kind}`;
}

export function readCheckoutAttempt(restaurantId, kind = 'checkout') {
  if (typeof sessionStorage === 'undefined' || !restaurantId) return null;
  try {
    const raw = sessionStorage.getItem(checkoutAttemptStorageKey(restaurantId, kind));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.idempotencyKey) return null;
    return {
      idempotencyKey: parsed.idempotencyKey,
      clientSecret: parsed.clientSecret || null,
      paymentIntentId: parsed.paymentIntentId || null,
    };
  } catch {
    return null;
  }
}

export function writeCheckoutAttempt(restaurantId, attempt, kind = 'checkout') {
  if (typeof sessionStorage === 'undefined' || !restaurantId || !attempt?.idempotencyKey) return;
  try {
    sessionStorage.setItem(
      checkoutAttemptStorageKey(restaurantId, kind),
      JSON.stringify({
        idempotencyKey: attempt.idempotencyKey,
        clientSecret: attempt.clientSecret || null,
        paymentIntentId: attempt.paymentIntentId || null,
      }),
    );
  } catch {
    // sessionStorage may be unavailable
  }
}

export function clearCheckoutAttempt(restaurantId, kind = 'checkout') {
  if (typeof sessionStorage === 'undefined' || !restaurantId) return;
  try {
    sessionStorage.removeItem(checkoutAttemptStorageKey(restaurantId, kind));
  } catch {
    // ignore
  }
}

export function getOrCreateIdempotencyKey(restaurantId, kind = 'checkout') {
  const existing = readCheckoutAttempt(restaurantId, kind);
  if (existing?.idempotencyKey) return existing.idempotencyKey;
  const idempotencyKey = newIdempotencyKey();
  writeCheckoutAttempt(restaurantId, { idempotencyKey }, kind);
  return idempotencyKey;
}

/** Confirmation return_url so 3DS does not remount checkout and mint a second PI. */
export function getPaymentReturnUrl() {
  if (typeof window === 'undefined') return 'https://localhost:19006/confirmation';
  try {
    const url = new URL(window.location.href);
    url.pathname = '/confirmation';
    url.hash = '';
    return url.toString();
  } catch {
    return `${window.location.origin}/confirmation`;
  }
}

export function serializeCheckoutItems(items) {
  return (Array.isArray(items) ? items : []).map((item) => ({
    id: item.id,
    quantity: item.quantity,
    selectedModifiers: item.selectedModifiers || item.selected_modifiers || [],
    specialInstructions: item.specialInstructions || item.special_instructions || '',
  }));
}

function serializePromo(promo) {
  if (!promo) return undefined;
  return {
    id: promo.id || undefined,
    code: promo.code || undefined,
    benefit_type: promo.benefit_type,
    discount_value: promo.discount_value,
    menu_item_id: promo.menu_item_id,
    buy_quantity: promo.buy_quantity,
    get_quantity: promo.get_quantity,
  };
}

/**
 * Creates or resumes a server-priced PaymentIntent.
 * Does not send a client amount — the Edge Function reprices from menu + tax_rate.
 * Snapshot fields (name, phone, email, notes, schedule, …) are stored on
 * payment_ledger.cart_snapshot for stripe-webhook place_customer_order.
 * Expects { clientSecret, paymentIntentId?, amountCents? } and ignores extra fields.
 */
export async function createPaymentIntent({
  restaurantId,
  items,
  promo,
  idempotencyKey: idempotencyKeyArg,
  email,
  customerEmail,
  pickupLocationId,
  customerName,
  customerPhone,
  orderType,
  menuType,
  scheduledTime,
  notes,
} = {}) {
  if (!BACKEND_URL) {
    throw new Error(
      'Payment backend URL is not configured. Set EXPO_PUBLIC_BACKEND_URL or EXPO_PUBLIC_SUPABASE_URL in .env',
    );
  }
  if (!restaurantId) {
    throw new Error('restaurantId is required to initialize payment.');
  }
  const idempotencyKey = (
    typeof idempotencyKeyArg === 'string' && idempotencyKeyArg.trim().length >= 16
      ? idempotencyKeyArg.trim()
      : getOrCreateIdempotencyKey(restaurantId)
  );

  const serializedPromo = serializePromo(promo) || null;
  const resolvedEmail = customerEmail || email || undefined;
  const body = {
    restaurantId,
    items: serializeCheckoutItems(items),
    promo: serializedPromo,
    promoCode: serializedPromo?.code || undefined,
    promoCodeId: serializedPromo?.id || undefined,
    idempotencyKey,
    email: resolvedEmail,
    customerEmail: resolvedEmail,
    pickupLocationId: pickupLocationId || undefined,
    customerName: customerName || undefined,
    customerPhone: customerPhone || undefined,
    orderType: orderType || undefined,
    menuType: menuType || undefined,
    scheduledTime: scheduledTime || undefined,
    notes: notes || undefined,
  };

  const response = await fetch(`${BACKEND_URL}/create-payment-intent`, {
    method: 'POST',
    headers: await getFunctionHeaders({ useUserJwt: true }),
    body: JSON.stringify(body),
  });

  let payload;
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }

  if (!response.ok) {
    throw new Error(
      payload.message || payload.error || 'Failed to initialize payment.',
    );
  }

  const clientSecret = payload.clientSecret || payload.client_secret;
  if (!clientSecret) {
    throw new Error('Payment backend did not return a client secret.');
  }

  return {
    clientSecret,
    paymentIntentId: payload.paymentIntentId || payload.payment_intent_id || null,
    amountCents: payload.amountCents ?? payload.amount_cents ?? null,
    currency: payload.currency || null,
    subtotal: payload.subtotal ?? null,
    tax: payload.tax ?? null,
    discountAmount: payload.discountAmount ?? payload.discount_amount ?? null,
    taxRate: payload.taxRate ?? payload.tax_rate ?? null,
    reused: payload.reused ?? null,
  };
}

/**
 * Resume a stored PaymentIntent from its client_secret.
 * Returns the Stripe PaymentIntent or null if it cannot be retrieved.
 */
export async function retrievePaymentIntent(clientSecret) {
  const pk = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  if (!pk || !clientSecret) return null;
  try {
    const stripe = await loadStripe(pk);
    if (!stripe) return null;
    const { paymentIntent, error } = await stripe.retrievePaymentIntent(clientSecret);
    if (error || !paymentIntent) return null;
    return paymentIntent;
  } catch {
    return null;
  }
}

/**
 * Fetches a display-safe card summary (brand + last4) for a PaymentIntent.
 * Requires the PaymentIntent client_secret as proof of possession.
 * Returns null when unavailable so checkout can still complete.
 */
export async function getPaymentMethodSummary(paymentIntentId, {
  clientSecret,
  restaurantId,
} = {}) {
  if (!BACKEND_URL || !paymentIntentId || !clientSecret || !restaurantId) return null;

  try {
    const response = await fetch(`${BACKEND_URL}/payment-method-summary`, {
      method: 'POST',
      headers: await getFunctionHeaders(),
      body: JSON.stringify({
        paymentIntentId,
        clientSecret,
        restaurantId,
      }),
    });
    let payload;
    try {
      payload = await response.json();
    } catch {
      payload = {};
    }
    if (!response.ok) return null;
    return {
      brand: payload.brand || null,
      last4: payload.last4 || null,
      funding: payload.funding || null,
      wallet: payload.wallet || null,
      label: payload.label || null,
      type: payload.type || 'card',
    };
  } catch {
    return null;
  }
}
