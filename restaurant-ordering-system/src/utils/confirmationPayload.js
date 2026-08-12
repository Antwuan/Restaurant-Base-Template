/**
 * Persist the last confirmation payload so React Navigation linking
 * (path `/confirmation` with no params) cannot wipe order details after submit.
 */
const STORAGE_KEY = 'restaurant_last_confirmation';

export function saveConfirmationPayload(payload) {
  try {
    if (typeof sessionStorage === 'undefined') return;
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // ignore quota / private mode
  }
}

export function loadConfirmationPayload() {
  try {
    if (typeof sessionStorage === 'undefined') return null;
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Merge cart line images onto order items returned from the API. */
export function mergeOrderItemImages(orderItems, cartItems) {
  const cartById = new Map();
  (cartItems || []).forEach((item) => {
    if (!item?.id) return;
    const url = item.image_url || item.imageUrl || null;
    if (url) cartById.set(String(item.id), url);
  });

  return (orderItems || []).map((item) => {
    const existing = item?.image_url || item?.imageUrl || null;
    if (existing) return { ...item, image_url: existing };
    const fromCart = item?.id != null ? cartById.get(String(item.id)) : null;
    return { ...item, image_url: fromCart || null };
  });
}

/** Fill missing image_url values from a menu catalog. */
export function enrichItemsWithMenuImages(orderItems, menuItems) {
  const byId = new Map();
  (menuItems || []).forEach((item) => {
    if (!item?.id) return;
    const url = item.image_url || item.imageUrl || null;
    if (url) byId.set(String(item.id), url);
  });

  return (orderItems || []).map((item) => {
    const existing = item?.image_url || item?.imageUrl || null;
    if (existing) return { ...item, image_url: existing };
    const fromMenu = item?.id != null ? byId.get(String(item.id)) : null;
    return { ...item, image_url: fromMenu || null };
  });
}

/** Best-effort card details from a Stripe PaymentIntent client object. */
export function extractPaymentDetailsFromIntent(paymentIntent) {
  if (!paymentIntent) return null;
  const pm = paymentIntent.payment_method;
  const cardFromPm = pm && typeof pm === 'object' ? pm.card : null;
  const cardFromCharge =
    paymentIntent.charges?.data?.[0]?.payment_method_details?.card
    || (typeof paymentIntent.latest_charge === 'object'
      ? paymentIntent.latest_charge?.payment_method_details?.card
      : null);
  const card = cardFromPm || cardFromCharge;
  if (!card) return null;

  const brandRaw = card.brand || null;
  const last4 = card.last4 || null;
  const brand = brandRaw
    ? brandRaw.charAt(0).toUpperCase() + brandRaw.slice(1).toLowerCase()
    : null;
  const wallet = card.wallet?.type || null;

  let label = 'Card';
  if (brand && last4) label = `${brand} •••• ${last4}`;
  else if (brand) label = brand;
  else if (last4) label = `Card •••• ${last4}`;

  if (wallet === 'apple_pay') {
    label = brand && last4 ? `Apple Pay · ${brand} •••• ${last4}` : 'Apple Pay';
  } else if (wallet === 'google_pay') {
    label = brand && last4 ? `Google Pay · ${brand} •••• ${last4}` : 'Google Pay';
  }

  return { brand, last4, wallet, label, type: 'card' };
}

export function formatPaymentLabel(payment) {
  if (!payment) return 'Card';
  if (payment.label) return payment.label;
  if (payment.brand && payment.last4) return `${payment.brand} •••• ${payment.last4}`;
  if (payment.last4) return `Card •••• ${payment.last4}`;
  if (payment.brand) return payment.brand;
  return 'Card';
}
