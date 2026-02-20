import { supabase } from '../config/supabase';

export function validateOrderData(orderData) {
  const errors = [];
  if (!orderData.customerName?.trim()) errors.push('Customer name is required');
  if (!orderData.customerPhone?.trim()) errors.push('Customer phone is required');
  if (!orderData.items?.length) errors.push('Order must contain at least one item');
  if (!['pickup', 'delivery'].includes(orderData.orderType)) errors.push('Order type must be pickup or delivery');
  if (orderData.total <= 0) errors.push('Order total must be greater than zero');
  return errors;
}

export async function createOrder(orderData) {
  const { data, error } = await supabase
    .from('orders')
    .insert({
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
      scheduled_time: orderData.scheduledTime || null,
      stripe_payment_intent_id: orderData.paymentIntentId || null,
      notes: orderData.notes || null,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getOrders(restaurantId, filters = {}) {
  let query = supabase
    .from('orders')
    .select('*')
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