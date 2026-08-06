/**
 * Validate HMAC review token; load order summary or insert review.
 * - GET ?token=… → preview
 * - POST { token } → preview (client invoke path)
 * - POST { token, rating, comment? } → insert
 * Secrets: REVIEW_TOKEN_SECRET
 * No customer auth required — service role inserts into order_reviews.
 *
 * Self-contained (no ../_shared imports) so Dashboard deploys bundle cleanly.
 */
import { createClient } from 'npm:@supabase/supabase-js@2';

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

function createServiceClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );
}

const enc = new TextEncoder();

function toBase64Url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  for (let i = 0; i < arr.length; i++) binary += String.fromCharCode(arr[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(s: string): Uint8Array {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

type ReviewTokenPayload = {
  orderId: string;
  restaurantId: string;
  exp: number;
};

async function verifyReviewToken(token: string, secret: string): Promise<ReviewTokenPayload> {
  const parts = String(token || '').split('.');
  if (parts.length !== 2) throw new Error('Invalid review token');

  const [bodyB64, sigB64] = parts;
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
  const valid = await crypto.subtle.verify(
    'HMAC',
    key,
    fromBase64Url(sigB64),
    enc.encode(bodyB64),
  );
  if (!valid) throw new Error('Invalid review token signature');

  let payload: ReviewTokenPayload;
  try {
    payload = JSON.parse(new TextDecoder().decode(fromBase64Url(bodyB64)));
  } catch {
    throw new Error('Invalid review token payload');
  }

  if (!payload?.orderId || !payload?.restaurantId || !payload?.exp) {
    throw new Error('Invalid review token payload');
  }
  if (payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error('Review token expired');
  }
  return payload;
}

function itemsSummary(items: unknown): Array<{ name: string; quantity: number }> {
  if (!Array.isArray(items)) return [];
  return items.slice(0, 20).map((item: Record<string, unknown>) => ({
    name: String(item.name ?? 'Item'),
    quantity: Number(item.quantity ?? 1),
  }));
}

async function loadOrderContext(token: string) {
  const secret = Deno.env.get('REVIEW_TOKEN_SECRET');
  if (!secret) throw new Error('REVIEW_TOKEN_SECRET is not configured');

  const payload = await verifyReviewToken(token, secret);
  const supabase = createServiceClient();
  const orderId = Number(payload.orderId);
  if (!Number.isFinite(orderId)) {
    const err = new Error('Invalid order token');
    (err as Error & { status: number }).status = 400;
    throw err;
  }

  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .select(
      'id, restaurant_id, order_number, order_type, items, subtotal, tax, total, customer_name, customer_email, created_at, status',
    )
    .eq('id', orderId)
    .single();

  if (orderErr || !order) {
    const err = new Error('Order not found');
    (err as Error & { status: number }).status = 404;
    throw err;
  }

  if (order.restaurant_id !== payload.restaurantId) {
    const err = new Error('Token does not match order');
    (err as Error & { status: number }).status = 403;
    throw err;
  }

  const { data: existing } = await supabase
    .from('order_reviews')
    .select('id, rating, comment, created_at')
    .eq('order_id', order.id)
    .maybeSingle();

  return { supabase, order, existing, payload };
}

/** Shape consumed by ReviewScreen / reviewService (snake_case order fields). */
function reviewPreviewResponse(order: Record<string, unknown>, existing: Record<string, unknown> | null) {
  return {
    alreadyReviewed: Boolean(existing),
    already_reviewed: Boolean(existing),
    review: existing
      ? {
          rating: existing.rating,
          comment: existing.comment,
          created_at: existing.created_at,
        }
      : null,
    order: {
      id: order.id,
      order_number: order.order_number || String(order.id).slice(0, 8),
      order_type: order.order_type,
      items: itemsSummary(order.items),
      subtotal: order.subtotal,
      tax: order.tax,
      total: order.total,
      created_at: order.created_at,
      customer_name: order.customer_name,
    },
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (req.method === 'GET') {
      const url = new URL(req.url);
      const token = url.searchParams.get('token') || '';
      if (!token) return jsonResponse({ error: 'token is required' }, 400);

      const { order, existing } = await loadOrderContext(token);
      return jsonResponse(reviewPreviewResponse(order, existing));
    }

    if (req.method === 'POST') {
      const body = await req.json();
      const token = String(body.token || '');
      const hasRating = body.rating !== undefined && body.rating !== null && body.rating !== '';
      const rating = hasRating ? Number(body.rating) : NaN;
      const comment = typeof body.comment === 'string' ? body.comment.trim() : '';

      if (!token) return jsonResponse({ error: 'token is required' }, 400);

      // No rating → preview/load (matches supabase.functions.invoke from reviewService)
      if (!hasRating) {
        const { order, existing } = await loadOrderContext(token);
        return jsonResponse(reviewPreviewResponse(order, existing));
      }

      if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
        return jsonResponse({ error: 'rating must be an integer from 1 to 5' }, 400);
      }

      const { supabase, order, existing } = await loadOrderContext(token);

      if (existing) {
        return jsonResponse({
          error: 'This order has already been reviewed',
          alreadyReviewed: true,
          already_reviewed: true,
          order: reviewPreviewResponse(order, existing).order,
          review: {
            rating: existing.rating,
            comment: existing.comment,
            created_at: existing.created_at,
          },
        }, 409);
      }

      const { data: review, error: insertErr } = await supabase
        .from('order_reviews')
        .insert({
          restaurant_id: order.restaurant_id,
          order_id: order.id,
          rating,
          comment: comment || null,
          customer_name: order.customer_name || null,
          customer_email: order.customer_email || null,
        })
        .select('id, rating, comment, created_at')
        .single();

      if (insertErr) {
        if (insertErr.code === '23505') {
          return jsonResponse({
            error: 'This order has already been reviewed',
            alreadyReviewed: true,
            already_reviewed: true,
          }, 409);
        }
        console.error('order_reviews insert error:', insertErr);
        return jsonResponse({ error: insertErr.message || 'Failed to save review' }, 500);
      }

      return jsonResponse({ ok: true, success: true, review });
    }

    return jsonResponse({ error: 'Method not allowed' }, 405);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    const status = (err as Error & { status?: number }).status
      || (message.includes('expired') || message.includes('Invalid review token') ? 401 : 500);
    console.error('submit-order-review error:', message);
    return jsonResponse({ error: message }, status);
  }
});
