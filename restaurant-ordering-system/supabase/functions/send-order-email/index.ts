/**
 * Transactional order emails via Resend.
 *
 * Call shapes:
 * 1) Direct: { orderId, type: 'confirm' | 'ready' | 'review' }
 * 2) Supabase Database Webhook (INSERT/UPDATE on orders)
 *
 * Secrets: RESEND_API_KEY, REVIEW_TOKEN_SECRET, PUBLIC_APP_ORIGIN
 * Idempotency: order-confirm/{id}, order-ready/{id}, review-request/{id}
 */
import { Resend } from 'npm:resend';
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type EmailType = 'confirm' | 'ready' | 'review';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/** HMAC review token — inlined so Dashboard deploys don't need ../_shared */
const reviewTokenEnc = new TextEncoder();

function toBase64Url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  for (let i = 0; i < arr.length; i++) binary += String.fromCharCode(arr[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function signReviewToken(
  payload: { orderId: string; restaurantId: string; expiresInSeconds?: number },
  secret: string,
): Promise<string> {
  const expiresIn = payload.expiresInSeconds ?? 30 * 24 * 60 * 60;
  const body = {
    orderId: payload.orderId,
    restaurantId: payload.restaurantId,
    exp: Math.floor(Date.now() / 1000) + expiresIn,
  };
  const bodyB64 = toBase64Url(reviewTokenEnc.encode(JSON.stringify(body)));
  const key = await crypto.subtle.importKey(
    'raw',
    reviewTokenEnc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, reviewTokenEnc.encode(bodyB64));
  return `${bodyB64}.${toBase64Url(sig)}`;
}

function escapeHtml(s: string) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatMoney(n: number) {
  return `$${Number(n || 0).toFixed(2)}`;
}

function itemsHtml(items: unknown) {
  if (!Array.isArray(items) || items.length === 0) return '<p>No items</p>';
  const rows = items.map((item: Record<string, unknown>) => {
    const qty = item.quantity ?? 1;
    const name = escapeHtml(String(item.name ?? 'Item'));
    const price = formatMoney(Number(item.price ?? 0) * Number(qty));
    return `<tr><td style="padding:6px 0">${qty}× ${name}</td><td style="text-align:right;padding:6px 0">${price}</td></tr>`;
  });
  return `<table width="100%" cellpadding="0" cellspacing="0">${rows.join('')}</table>`;
}

function wrapEmail(restaurantName: string, title: string, body: string) {
  return `<!DOCTYPE html><html><body style="font-family:system-ui,-apple-system,sans-serif;background:#f6f9fc;padding:24px;color:#0a2540">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:28px;border:1px solid #e3e8ee">
    <p style="margin:0 0 4px;font-size:13px;color:#697386;font-weight:600">${escapeHtml(restaurantName)}</p>
    <h1 style="margin:0 0 16px;font-size:22px">${escapeHtml(title)}</h1>
    ${body}
  </div></body></html>`;
}

function resolveTypeFromWebhook(payload: Record<string, unknown>): EmailType | null {
  const type = String(payload.type || payload.event || '').toUpperCase();
  const record = (payload.record || payload.new || {}) as Record<string, unknown>;
  const oldRecord = (payload.old_record || payload.old || {}) as Record<string, unknown>;

  if (type === 'INSERT') return 'confirm';
  if (type === 'UPDATE') {
    const next = String(record.status || '');
    const prev = String(oldRecord.status || '');
    if (next === 'ready' && prev !== 'ready') return 'ready';
    if (next === 'completed' && prev !== 'completed') return 'review';
  }
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get('RESEND_API_KEY');
    if (!apiKey) return json({ error: 'RESEND_API_KEY is not configured' }, 500);

    const payload = await req.json();

    // Resend webhooks belong on /functions/v1/resend-webhook. If this URL is
    // subscribed to email.delivered (etc.), do not 400 — that fails the webhook.
    const incomingType = String(payload.type || payload.emailType || payload.event || '');
    if (/^(email|contact|domain)\./i.test(incomingType)) {
      return json({
        skipped: true,
        reason: 'Resend events must POST to /functions/v1/resend-webhook',
      });
    }

    let orderId = payload.orderId || payload.order_id;
    let emailType: EmailType | null = payload.type || payload.emailType || null;

    // Database webhook payload
    if (!orderId && (payload.record || payload.new)) {
      const record = payload.record || payload.new;
      orderId = record.id;
      emailType = resolveTypeFromWebhook(payload);
    }

    if (!orderId) return json({ error: 'orderId is required' }, 400);
    if (!emailType || !['confirm', 'ready', 'review'].includes(emailType)) {
      return json({ skipped: true, reason: 'No email action for this event' });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single();

    if (orderErr || !order) return json({ error: 'Order not found' }, 404);

    const to = (order.customer_email || '').trim();
    if (!to) return json({ skipped: true, reason: 'No customer email' });

    const { data: restaurant, error: restErr } = await supabase
      .from('restaurants')
      .select('id, name, slug, resend_from_email, email_domain_status, auto_review_emails, address, phone')
      .eq('id', order.restaurant_id)
      .single();

    if (restErr || !restaurant) return json({ error: 'Restaurant not found' }, 404);

    if (restaurant.email_domain_status !== 'verified' || !restaurant.resend_from_email) {
      return json({
        skipped: true,
        reason: 'Restaurant email domain is not verified. Complete domain setup in Settings.',
      });
    }

    // Idempotency via DB timestamps
    if (emailType === 'confirm' && order.order_email_sent_at) {
      return json({ skipped: true, reason: 'Confirmation already sent' });
    }
    if (emailType === 'ready' && order.ready_email_sent_at) {
      return json({ skipped: true, reason: 'Ready email already sent' });
    }
    if (emailType === 'review' && order.review_email_sent_at) {
      return json({ skipped: true, reason: 'Review email already sent' });
    }
    if (emailType === 'review' && restaurant.auto_review_emails === false) {
      return json({ skipped: true, reason: 'Auto review emails disabled' });
    }

    const resend = new Resend(apiKey);
    const restaurantName = restaurant.name || 'Restaurant';
    const orderNumber = order.order_number || String(order.id);
    const customerName = escapeHtml(order.customer_name || 'there');

    let subject = '';
    let html = '';
    let idempotencyKey = '';
    let scheduledAt: string | undefined;
    let sentColumn = '';

    if (emailType === 'confirm') {
      subject = `Order confirmed — ${orderNumber}`;
      idempotencyKey = `order-confirm/${order.id}`;
      sentColumn = 'order_email_sent_at';
      html = wrapEmail(
        restaurantName,
        'Thanks for your order!',
        `<p>Hi ${customerName},</p>
         <p>We've received order <strong>${escapeHtml(String(orderNumber))}</strong>.</p>
         ${itemsHtml(order.items)}
         <hr style="border:none;border-top:1px solid #e3e8ee;margin:16px 0"/>
         <p style="margin:4px 0">Subtotal: ${formatMoney(order.subtotal)}</p>
         <p style="margin:4px 0">Tax: ${formatMoney(order.tax)}</p>
         <p style="margin:4px 0;font-weight:700">Total: ${formatMoney(order.total)}</p>
         <p style="margin-top:16px;color:#697386;font-size:13px">
           ${order.order_type === 'delivery' ? 'Delivery' : 'Pickup'}
           ${order.scheduled_time ? ` · ${escapeHtml(new Date(order.scheduled_time).toLocaleString())}` : ' · ASAP'}
         </p>
         ${restaurant.address ? `<p style="color:#697386;font-size:13px">${escapeHtml(restaurant.address)}</p>` : ''}`,
      );
    } else if (emailType === 'ready') {
      subject = `Ready for pickup — ${orderNumber}`;
      idempotencyKey = `order-ready/${order.id}`;
      sentColumn = 'ready_email_sent_at';
      html = wrapEmail(
        restaurantName,
        'Your order is ready!',
        `<p>Hi ${customerName},</p>
         <p>Order <strong>${escapeHtml(String(orderNumber))}</strong> is ready for pickup.</p>
         ${restaurant.address ? `<p>Come see us at:<br/><strong>${escapeHtml(restaurant.address)}</strong></p>` : ''}
         ${restaurant.phone ? `<p>Questions? Call ${escapeHtml(restaurant.phone)}</p>` : ''}`,
      );
    } else {
      const reviewSecret = Deno.env.get('REVIEW_TOKEN_SECRET');
      const appOrigin = (Deno.env.get('PUBLIC_APP_ORIGIN') || '').replace(/\/+$/, '');
      if (!reviewSecret || !appOrigin) {
        return json({
          skipped: true,
          reason: 'REVIEW_TOKEN_SECRET or PUBLIC_APP_ORIGIN is not configured',
        });
      }
      if (!restaurant.slug) {
        return json({ skipped: true, reason: 'Restaurant slug is missing' });
      }

      const token = await signReviewToken(
        { orderId: String(order.id), restaurantId: restaurant.id },
        reviewSecret,
      );
      const reviewUrl = escapeHtml(
        `${appOrigin}/review?token=${encodeURIComponent(token)}&restaurant=${encodeURIComponent(restaurant.slug)}`,
      );

      subject = `How was your visit? — ${restaurantName}`;
      idempotencyKey = `review-request/${order.id}`;
      sentColumn = 'review_email_sent_at';
      scheduledAt = 'in 2 hours';
      html = wrapEmail(
        restaurantName,
        'We\'d love your feedback',
        `<p>Hi ${customerName},</p>
         <p>Thanks for ordering with us. If you have a moment, leave a quick review:</p>
         <p style="margin:24px 0"><a href="${reviewUrl}" style="background:#0a2540;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">Leave a review</a></p>
         <p style="color:#697386;font-size:13px">Order ${escapeHtml(String(orderNumber))}</p>`,
      );
    }

    const sendPayload: Record<string, unknown> = {
      from: restaurant.resend_from_email,
      to: [to],
      subject,
      html,
    };
    if (scheduledAt) sendPayload.scheduledAt = scheduledAt;

    const { data, error } = await resend.emails.send(
      sendPayload as Parameters<typeof resend.emails.send>[0],
      { idempotencyKey },
    );

    if (error) {
      console.error('Resend send error:', error);
      return json({ error: error.message || 'Failed to send email' }, 502);
    }

    await supabase
      .from('orders')
      .update({ [sentColumn]: new Date().toISOString() })
      .eq('id', order.id);

    return json({ ok: true, id: data?.id, type: emailType, scheduled: Boolean(scheduledAt) });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('send-order-email error:', message);
    return json({ error: message }, 500);
  }
});
