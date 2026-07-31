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

export async function sendBroadcast({ restaurantId, subject, html, previewText, name }) {
  return invoke('send-broadcast', { restaurantId, subject, html, previewText, name });
}

export async function manageEmailDomain(payload) {
  return invoke('manage-email-domain', payload);
}
