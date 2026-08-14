import { supabase } from '../config/supabase';

async function invoke(name, body) {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    let message = data?.error || error.message || `Failed calling ${name}`;
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
  return data;
}

/** Fallback / direct transactional send. Prefer Database Webhooks in production. */
export async function sendOrderEmail(orderId, type) {
  return invoke('send-order-email', { orderId, type });
}

export async function syncMarketingContact({
  restaurantId,
  email,
  fullName,
  phone,
  marketingOptIn,
}) {
  return invoke('sync-marketing-contact', {
    restaurantId,
    email,
    fullName,
    phone,
    marketingOptIn,
  });
}

export async function sendBroadcast({ restaurantId, subject, html, previewText, name, promoCodeId }) {
  return invoke('send-broadcast', { restaurantId, subject, html, previewText, name, promoCodeId });
}

export async function manageEmailDomain(payload) {
  return invoke('manage-email-domain', payload);
}

/** Admin: upsert opted-in customers missing resend_contact_id into Resend. */
export async function backfillMarketingContacts(restaurantId) {
  return invoke('backfill-marketing-contacts', { restaurantId });
}

/** Admin: list persisted promo broadcasts with webhook engagement counters. */
export async function listEmailBroadcasts(restaurantId) {
  if (!restaurantId) return [];
  const { data, error } = await supabase
    .from('email_broadcasts')
    .select(
      'id, restaurant_id, resend_broadcast_id, subject, preview_text, name, sent_at, delivered_count, opened_count, clicked_count, bounced_count, complained_count, promo_code_id, promo_codes(code, title)',
    )
    .eq('restaurant_id', restaurantId)
    .order('sent_at', { ascending: false });
  if (error) throw error;
  return data || [];
}
