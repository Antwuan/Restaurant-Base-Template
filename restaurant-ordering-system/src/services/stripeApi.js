const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL?.replace(/\/$/, '');
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

const BACKEND_URL =
  process.env.EXPO_PUBLIC_BACKEND_URL?.replace(/\/$/, '') ||
  (SUPABASE_URL ? `${SUPABASE_URL}/functions/v1` : null);

function getFunctionHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  if (SUPABASE_ANON_KEY) {
    headers.Authorization = `Bearer ${SUPABASE_ANON_KEY}`;
    headers.apikey = SUPABASE_ANON_KEY;
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
    headers: getFunctionHeaders(),
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

/**
 * Creates a PaymentIntent with optional receipt_email for Stripe automatic receipts.
 * Pass email so the PI is created with receipt_email set before confirmPayment.
 */
export async function createPaymentIntent(amount, restaurantId, { email } = {}) {
  if (!BACKEND_URL) {
    throw new Error(
      'Payment backend URL is not configured. Set EXPO_PUBLIC_BACKEND_URL or EXPO_PUBLIC_SUPABASE_URL in .env',
    );
  }

  const response = await fetch(`${BACKEND_URL}/create-payment-intent`, {
    method: 'POST',
    headers: getFunctionHeaders(),
    body: JSON.stringify({
      amount: Math.round(amount * 100),
      restaurantId,
      restaurant_id: restaurantId,
      currency: 'usd',
      email: email || undefined,
    }),
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

  const { clientSecret } = payload;
  if (!clientSecret) {
    throw new Error('Payment backend did not return a client secret.');
  }

  return clientSecret;
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
      headers: getFunctionHeaders(),
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
