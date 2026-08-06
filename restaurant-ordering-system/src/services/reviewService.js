import { supabase } from '../config/supabase';

/**
 * Admin: list order_reviews joined to orders.
 * Supports sort (rating | created_at | order_type) and filters (rating, orderType).
 */
export async function listOrderReviews(
  restaurantId,
  {
    sortBy = 'created_at',
    sortAsc = false,
    rating = null,
    orderType = null,
  } = {},
) {
  if (!restaurantId) return [];

  const useOrderJoinFilter = Boolean(orderType) || sortBy === 'order_type';

  let query = supabase
    .from('order_reviews')
    .select(
      `
      id,
      restaurant_id,
      order_id,
      rating,
      comment,
      customer_name,
      customer_email,
      created_at,
      orders${useOrderJoinFilter ? '!inner' : ''} (
        id,
        order_number,
        order_type,
        items,
        subtotal,
        tax,
        total,
        status,
        customer_name,
        customer_email,
        created_at
      )
    `,
    )
    .eq('restaurant_id', restaurantId);

  if (rating != null && rating !== '') {
    query = query.eq('rating', Number(rating));
  }
  if (orderType) {
    query = query.eq('orders.order_type', orderType);
  }

  if (sortBy === 'rating') {
    query = query.order('rating', { ascending: sortAsc });
  } else if (sortBy === 'created_at') {
    query = query.order('created_at', { ascending: sortAsc });
  } else {
    // order_type: fetch newest first, sort client-side
    query = query.order('created_at', { ascending: false });
  }

  const { data, error } = await query;
  if (error) throw error;

  let rows = data || [];

  if (sortBy === 'order_type') {
    const dir = sortAsc ? 1 : -1;
    rows = [...rows].sort((a, b) => {
      const at = a.orders?.order_type || '';
      const bt = b.orders?.order_type || '';
      if (at < bt) return -1 * dir;
      if (at > bt) return 1 * dir;
      return new Date(b.created_at) - new Date(a.created_at);
    });
  }

  return rows;
}

/** Completed-order review email outreach counts for Marketing. */
export async function getReviewOutreachCounts(restaurantId) {
  if (!restaurantId) return { sent: 0, pending: 0, completed: 0 };

  const { data, error } = await supabase
    .from('orders')
    .select('id, status, review_email_sent_at')
    .eq('restaurant_id', restaurantId)
    .eq('status', 'completed');

  if (error) throw error;
  const rows = data || [];
  const sent = rows.filter((r) => r.review_email_sent_at).length;
  const pending = rows.filter((r) => !r.review_email_sent_at).length;
  return { sent, pending, completed: rows.length };
}

async function invokeSubmitOrderReview(body) {
  const { data, error } = await supabase.functions.invoke('submit-order-review', { body });
  if (error) {
    let message = data?.error || error.message || 'Failed calling submit-order-review';
    try {
      const ctx = error.context;
      if (ctx && typeof ctx.json === 'function') {
        const payload = await ctx.json();
        if (payload?.error) message = payload.error;
        if (payload?.alreadyReviewed != null || payload?.already_reviewed != null) {
          return payload;
        }
      }
    } catch {
      // keep message
    }
    const err = new Error(message);
    err.data = data;
    throw err;
  }
  if (data?.error && !data?.alreadyReviewed && !data?.already_reviewed) {
    throw new Error(data.error);
  }
  return data;
}

/**
 * Load order summary for the review form via edge function.
 * Body without rating → preview/load. Response: { order, alreadyReviewed? }
 */
export async function loadReviewByToken(token) {
  if (!token) throw new Error('Missing review token');
  return invokeSubmitOrderReview({ token });
}

/**
 * Submit rating + comment via edge function.
 * Body with rating → insert. Response: { success } | { alreadyReviewed }
 */
export async function submitOrderReview({ token, rating, comment }) {
  if (!token) throw new Error('Missing review token');
  if (!rating || rating < 1 || rating > 5) throw new Error('Rating must be between 1 and 5');
  return invokeSubmitOrderReview({
    token,
    rating: Number(rating),
    comment: comment?.trim() || null,
  });
}
