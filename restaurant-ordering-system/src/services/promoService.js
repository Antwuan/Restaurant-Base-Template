import { supabase } from '../config/supabase';

export const PROMO_TAX_RATE = 0.08;

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export const BENEFIT_TYPES = [
  { value: 'percent_off', label: '% Off' },
  { value: 'amount_off', label: '$ Off' },
  { value: 'free_item', label: 'Free Item' },
  { value: 'bogo', label: 'Buy 1 Get X Free' },
  { value: 'buy_x_percent_off', label: 'Buy X % Off' },
  { value: 'buy_x_amount_off', label: 'Buy X $ Off' },
];

/** Random uppercase alphanumeric code (default 8 chars). */
export function generatePromoCode(length = 8) {
  let code = '';
  for (let i = 0; i < length; i += 1) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

export function formatPromoEmailBlurb(promo) {
  if (!promo) return '';
  const code = String(promo.code || '').toUpperCase();
  let benefit = promo.title || 'a special offer';
  if (promo.benefit_type === 'percent_off' && promo.discount_value != null) {
    benefit = `${Number(promo.discount_value)}% off`;
  } else if (promo.benefit_type === 'amount_off' && promo.discount_value != null) {
    benefit = `$${Number(promo.discount_value).toFixed(2)} off`;
  } else if (promo.benefit_type === 'free_item') {
    benefit = promo.title || 'a free item';
  } else if (promo.benefit_type === 'bogo') {
    const x = Number(promo.get_quantity) || 1;
    benefit = `buy one get ${x} free`;
  } else if (promo.benefit_type === 'buy_x_percent_off') {
    benefit = `buy ${Number(promo.buy_quantity) || 1}+ get ${Number(promo.discount_value)}% off`;
  } else if (promo.benefit_type === 'buy_x_amount_off') {
    benefit = `buy ${Number(promo.buy_quantity) || 1}+ get $${Number(promo.discount_value).toFixed(2)} off`;
  }
  return `Use code ${code} for ${benefit} on your next order.`;
}

export function formatPromoEmailHtml(promo) {
  const blurb = formatPromoEmailBlurb(promo);
  const code = String(promo?.code || '').toUpperCase();
  if (!blurb) return '';
  return `<p><strong>${blurb}</strong></p>\n<p>Enter <code>${code}</code> at checkout.</p>\n`;
}

function lineQty(line) {
  return Math.max(0, Number(line?.quantity) || 1);
}

function findCartLine(items, menuItemId) {
  return (items || []).find((i) => String(i.id) === String(menuItemId));
}

/**
 * Compute discount dollars from cart subtotal + validated promo.
 * free_item / bogo / buy_x_*: require matching cart line; throw if missing.
 */
export function computePromoDiscount(subtotal, items, promo) {
  if (!promo) return 0;
  const sub = Number(subtotal) || 0;

  if (promo.benefit_type === 'percent_off') {
    const pct = Number(promo.discount_value) || 0;
    return Math.min(sub, Math.round(sub * (pct / 100) * 100) / 100);
  }

  if (promo.benefit_type === 'amount_off') {
    return Math.min(sub, Math.max(0, Number(promo.discount_value) || 0));
  }

  if (promo.benefit_type === 'free_item') {
    const line = findCartLine(items, promo.menu_item_id);
    if (!line) {
      throw new Error('Add the free promo item to your cart to use this code.');
    }
    return Math.min(sub, Math.max(0, Number(line.price) || 0));
  }

  if (promo.benefit_type === 'bogo') {
    const line = findCartLine(items, promo.menu_item_id);
    if (!line) {
      throw new Error('Add the promo item to your cart to use this code.');
    }
    const x = Math.max(1, Number(promo.get_quantity) || 1);
    const qty = lineQty(line);
    const freeUnits = Math.floor(qty / (1 + x)) * x;
    const unit = Math.max(0, Number(line.price) || 0);
    return Math.min(sub, Math.round(freeUnits * unit * 100) / 100);
  }

  if (promo.benefit_type === 'buy_x_percent_off') {
    const line = findCartLine(items, promo.menu_item_id);
    if (!line) {
      throw new Error('Add the promo item to your cart to use this code.');
    }
    const need = Math.max(1, Number(promo.buy_quantity) || 1);
    const qty = lineQty(line);
    if (qty < need) {
      throw new Error(`Add at least ${need} of the promo item to your cart.`);
    }
    const lineSub = Math.round(qty * (Number(line.price) || 0) * 100) / 100;
    const pct = Number(promo.discount_value) || 0;
    return Math.min(sub, Math.round(lineSub * (pct / 100) * 100) / 100);
  }

  if (promo.benefit_type === 'buy_x_amount_off') {
    const line = findCartLine(items, promo.menu_item_id);
    if (!line) {
      throw new Error('Add the promo item to your cart to use this code.');
    }
    const need = Math.max(1, Number(promo.buy_quantity) || 1);
    const qty = lineQty(line);
    if (qty < need) {
      throw new Error(`Add at least ${need} of the promo item to your cart.`);
    }
    const lineSub = Math.round(qty * (Number(line.price) || 0) * 100) / 100;
    const amount = Math.max(0, Number(promo.discount_value) || 0);
    return Math.min(sub, Math.min(lineSub, amount));
  }

  return 0;
}

/** Apply promo: discount on subtotal, then tax on discounted subtotal. */
export function applyPromoToTotals(subtotal, items, promo) {
  const discountAmount = computePromoDiscount(subtotal, items, promo);
  const discountedSubtotal = Math.max(0, Math.round((subtotal - discountAmount) * 100) / 100);
  const tax = Math.round(discountedSubtotal * PROMO_TAX_RATE * 100) / 100;
  const total = Math.round((discountedSubtotal + tax) * 100) / 100;
  return { discountAmount, discountedSubtotal, tax, total };
}

/** Normalize benefit fields for insert/update (clears incompatible columns). */
export function normalizeBenefitPayload(promo) {
  const type = promo.benefit_type;
  const base = {
    benefit_type: type,
    discount_value: null,
    menu_item_id: null,
    buy_quantity: null,
    get_quantity: null,
  };

  if (type === 'percent_off' || type === 'amount_off') {
    return { ...base, discount_value: promo.discount_value };
  }
  if (type === 'free_item') {
    return { ...base, menu_item_id: promo.menu_item_id };
  }
  if (type === 'bogo') {
    return { ...base, menu_item_id: promo.menu_item_id, get_quantity: promo.get_quantity };
  }
  if (type === 'buy_x_percent_off' || type === 'buy_x_amount_off') {
    return {
      ...base,
      menu_item_id: promo.menu_item_id,
      buy_quantity: promo.buy_quantity,
      discount_value: promo.discount_value,
    };
  }
  return base;
}

function friendlyDbError(error, action) {
  if (!error) return `Could not ${action}`;
  const msg = error.message || '';
  const code = error.code || '';
  if (code === '42501' || /row-level security|permission denied/i.test(msg)) {
    return `Could not ${action}: permission denied (check you are signed in as staff).`;
  }
  if (code === '23505' || /duplicate|unique/i.test(msg)) {
    return `Could not ${action}: that promo code already exists.`;
  }
  if (code === '23514' || /check constraint|violates check/i.test(msg)) {
    return `Could not ${action}: invalid benefit fields for this type.`;
  }
  if (code === 'PGRST116' || /0 rows|Cannot coerce/i.test(msg)) {
    return `Could not ${action}: no matching row (it may have been deleted or you lack access).`;
  }
  if (/buy_quantity|get_quantity|source_offer_id|column .* does not exist/i.test(msg)) {
    return `Could not ${action}: promo schema is outdated. Run migration 20260806225739_offer_promo_benefit_types.sql then retry.`;
  }
  return msg || `Could not ${action}`;
}

// ─── Admin CRUD ───────────────────────────────────────────────────────────────

export async function getAllPromos(restaurantId) {
  const query = () => supabase
    .from('promo_codes')
    .select('*, menu_items:menu_item_id(id, name, price)')
    .eq('restaurant_id', restaurantId)
    .order('created_at', { ascending: false });

  let { data, error } = await query().is('source_offer_id', null);
  // Pre-migration DBs lack source_offer_id — fall back to unfiltered list.
  if (error && /source_offer_id|column .* does not exist/i.test(error.message || '')) {
    ({ data, error } = await query());
  }
  if (error) throw new Error(friendlyDbError(error, 'load promos'));
  return data || [];
}

export async function getActivePromos(restaurantId) {
  const { data, error } = await supabase
    .from('promo_codes')
    .select(
      'id, code, title, description, benefit_type, discount_value, menu_item_id, buy_quantity, get_quantity, expires_at, is_active',
    )
    .eq('restaurant_id', restaurantId)
    .eq('is_active', true)
    .is('source_offer_id', null)
    .order('created_at', { ascending: false });
  if (error) throw new Error(friendlyDbError(error, 'load promos'));
  return data || [];
}

export async function createPromo(restaurantId, promo) {
  const benefit = normalizeBenefitPayload(promo);
  const payload = {
    restaurant_id: restaurantId,
    code: (promo.code || generatePromoCode()).toUpperCase().trim(),
    title: promo.title,
    description: promo.description ?? null,
    ...benefit,
    max_redemptions: promo.max_redemptions ?? null,
    starts_at: promo.starts_at ?? null,
    expires_at: promo.expires_at ?? null,
    is_active: promo.is_active ?? true,
  };

  const { data, error } = await supabase
    .from('promo_codes')
    .insert(payload)
    .select()
    .single();
  if (error) throw new Error(friendlyDbError(error, 'create promo'));
  return data;
}

export async function updatePromo(promoId, updates) {
  const payload = { ...updates };
  if (payload.code != null) payload.code = String(payload.code).toUpperCase().trim();
  if (payload.benefit_type != null) {
    Object.assign(payload, normalizeBenefitPayload(payload));
  }

  const { data, error } = await supabase
    .from('promo_codes')
    .update(payload)
    .eq('id', promoId)
    .select()
    .maybeSingle();
  if (error) throw new Error(friendlyDbError(error, 'update promo'));
  if (!data) throw new Error(friendlyDbError({ code: 'PGRST116' }, 'update promo'));
  return data;
}

export async function deletePromo(promoId) {
  const { data, error } = await supabase
    .from('promo_codes')
    .delete()
    .eq('id', promoId)
    .select('id')
    .maybeSingle();
  if (error) throw new Error(friendlyDbError(error, 'delete promo'));
  if (!data) throw new Error(friendlyDbError({ code: 'PGRST116' }, 'delete promo'));
}

/**
 * Validate promo via edge function (service role). Returns promo payload.
 */
export async function validatePromoCode({ restaurantId, code, cartItemIds = [], cartItems = [] }) {
  const { data, error } = await supabase.functions.invoke('validate-promo-code', {
    body: {
      restaurantId,
      code: String(code || '').trim().toUpperCase(),
      cartItemIds,
      cartItems,
    },
  });

  if (error) {
    let message = data?.error || error.message || 'Could not validate promo code';
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
  if (!data?.promo) throw new Error('Invalid promo code');
  return data.promo;
}

export async function copyTextToClipboard(text) {
  const value = String(text || '');
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  throw new Error('Clipboard is not available in this environment');
}
