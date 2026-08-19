import { supabase } from '../config/supabase';
import { sendOrderEmail } from './emailApi';
import { toPersistablePickupLocationId } from './locationsService';

export function validateOrderData(orderData) {
  const errors = [];
  if (!orderData.customerName?.trim()) errors.push('Customer name is required');
  if (!orderData.customerPhone?.trim()) errors.push('Customer phone is required');
  if (!orderData.items?.length) errors.push('Order must contain at least one item');
  if (!['pickup', 'delivery'].includes(orderData.orderType)) errors.push('Order type must be pickup or delivery');
  if (orderData.total <= 0) errors.push('Order total must be greater than zero');
  return errors;
}

/** Fire-and-forget email invoke — DB webhook is preferred; this is a client fallback. */
function triggerOrderEmail(orderId, type) {
  if (!orderId) return;
  sendOrderEmail(orderId, type).catch((err) => {
    console.warn(`[email] ${type} failed:`, err?.message || err);
  });
}

export async function createOrder(orderData) {
  // SECURITY DEFINER RPC — guests cannot SELECT orders under RLS, so
  // insert().select() fails even when INSERT is allowed.
  const { data, error } = await supabase.rpc('place_customer_order', {
    p: {
      restaurant_id: orderData.restaurantId,
      customer_name: orderData.customerName,
      customer_phone: orderData.customerPhone,
      customer_email: orderData.customerEmail || null,
      items: orderData.items,
      subtotal: orderData.subtotal,
      tax: orderData.tax,
      total: orderData.total,
      status: 'pending',
      order_type: orderData.orderType,
      menu_type: orderData.menuType || 'regular',
      scheduled_time: orderData.scheduledTime || null,
      stripe_payment_intent_id: orderData.paymentIntentId || null,
      notes: orderData.notes || null,
      promo_code_id: orderData.promoCodeId || null,
      promo_code: orderData.promoCode || null,
      discount_amount: orderData.discountAmount != null ? orderData.discountAmount : 0,
      pickup_location_id: toPersistablePickupLocationId(orderData.pickupLocationId),
    },
  });

  if (error) throw error;

  // Fallback if Database Webhook is not configured yet
  if (data?.customer_email) {
    triggerOrderEmail(data.id, 'confirm');
  }

  return data;
}

/**
 * Returns scheduled_time values for non-cancelled catering orders in range.
 * Used to exclude already-booked 15-minute catering pickup slots.
 */
export async function getBookedCateringSlots(restaurantId, fromISO, toISO) {
  const { data, error } = await supabase
    .from('orders')
    .select('scheduled_time')
    .eq('restaurant_id', restaurantId)
    .eq('menu_type', 'catering')
    .neq('status', 'cancelled')
    .not('scheduled_time', 'is', null)
    .gte('scheduled_time', fromISO)
    .lte('scheduled_time', toISO);

  if (error) throw error;
  return (data || []).map((row) => row.scheduled_time).filter(Boolean);
}

export async function getOrders(restaurantId, filters = {}) {
  let query = supabase
    .from('orders')
    .select('*, pickup_location:restaurant_locations(id, name, address)')
    .eq('restaurant_id', restaurantId)
    .order('created_at', { ascending: false });

  if (filters.status) query = query.eq('status', filters.status);
  if (filters.from) query = query.gte('created_at', filters.from);
  if (filters.to) query = query.lte('created_at', filters.to);
  if (filters.limit) query = query.limit(filters.limit);

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function updateOrderStatus(orderId, newStatus) {
  const validStatuses = ['pending', 'accepted', 'preparing', 'ready', 'completed', 'cancelled'];
  if (!validStatuses.includes(newStatus)) throw new Error(`Invalid status: ${newStatus}`);

  const { data, error } = await supabase
    .from('orders')
    .update({ status: newStatus })
    .eq('id', orderId)
    .select()
    .single();

  if (error) throw error;

  // Fallback if Database Webhook is not configured yet
  if (newStatus === 'ready') triggerOrderEmail(orderId, 'ready');
  if (newStatus === 'completed') triggerOrderEmail(orderId, 'review');

  return data;
}

export function subscribeToOrders(restaurantId, callback) {
  const channel = supabase
    .channel(`orders:${restaurantId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'orders',
        filter: `restaurant_id=eq.${restaurantId}`
      },
      (payload) => callback(payload)
    )
    .subscribe();

  return () => supabase.removeChannel(channel);
}

const OPEN_ORDER_STATUSES = ['pending', 'accepted', 'preparing', 'ready'];

/**
 * Open orders for the signed-in customer at this restaurant.
 * Relies on RLS (orders_select_own) — no phone lookup.
 */
export async function getOpenOrdersForCustomer(restaurantId) {
  if (!restaurantId) return [];

  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .in('status', OPEN_ORDER_STATUSES)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export function subscribeToOrder(orderId, callback) {
  const channel = supabase
    .channel(`order:${orderId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'orders',
        filter: `id=eq.${orderId}`,
      },
      (payload) => callback(payload.new)
    )
    .subscribe();

  return () => supabase.removeChannel(channel);
}