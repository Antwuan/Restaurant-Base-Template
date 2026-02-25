import { useState, useEffect, useCallback, useRef } from 'react';
import { orderService } from '../services/orderService';
import { supabase } from '../config/supabase';

export const useOrders = (restaurantId, { statusFilter = null, autoRefresh = true } = {}) => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const subscriptionRef = useRef(null);
  const audioRef = useRef(null);

  // Lazy-init notification sound
  const playNotificationSound = useCallback(() => {
    try {
      if (!audioRef.current) {
        audioRef.current = new Audio('/sounds/new-order.mp3'); // add this file to /public
      }
      audioRef.current.play().catch(() => {
        // Autoplay blocked — user hasn't interacted with page yet, that's fine
      });
    } catch {
      // Audio not supported
    }
  }, []);

  const fetchOrders = useCallback(async () => {
    if (!restaurantId) return;
    try {
      setError(null);
      const data = await orderService.getOrders(restaurantId, { status: statusFilter });
      setOrders(data);
    } catch (err) {
      setError(err.message || 'Failed to load orders');
    } finally {
      setLoading(false);
    }
  }, [restaurantId, statusFilter]);

  // Initial fetch
  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // Realtime subscription
  useEffect(() => {
    if (!restaurantId || !autoRefresh) return;

    subscriptionRef.current = supabase
      .channel(`orders:${restaurantId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'orders',
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        (payload) => {
          setOrders((prev) => [payload.new, ...prev]);
          playNotificationSound();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        (payload) => {
          setOrders((prev) =>
            prev.map((order) =>
              order.id === payload.new.id ? { ...order, ...payload.new } : order
            )
          );
        }
      )
      .subscribe();

    return () => {
      subscriptionRef.current?.unsubscribe();
    };
  }, [restaurantId, autoRefresh, playNotificationSound]);

  const updateOrderStatus = useCallback(async (orderId, newStatus) => {
    try {
      await orderService.updateOrderStatus(orderId, newStatus);
      // Optimistic update — realtime will confirm
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, status: newStatus } : o))
      );
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, []);

  // Filter helpers
  const ordersByStatus = useCallback(
    (status) => orders.filter((o) => o.status === status),
    [orders]
  );

  return {
    orders,
    loading,
    error,
    refetch: fetchOrders,
    updateOrderStatus,
    ordersByStatus,
  };
};