// Main admin orders dashboard. Uses `useOrders` for realtime updates, integrates
// with `RestaurantContext` and `restaurantService` to control accepting orders,
// and renders per-order UI via the shared admin `OrderCard` component.
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  Switch,
  RefreshControl,
  Alert,
} from 'react-native';
import { useOrders } from '../../hooks/useOrders';
import { useRestaurantContext } from '../../context/RestaurantContext';
import * as restaurantService from '../../services/restaurantService';
import OrderCard from '../../components/admin/OrderCard';

const STATUS_TABS = ['pending', 'preparing', 'ready', 'completed'];

export default function OrdersScreen() {
  const { restaurant, refreshRestaurant } = useRestaurantContext();
  const [activeTab, setActiveTab] = useState('pending');
  const [acceptingOrders, setAcceptingOrders] = useState(
    restaurant?.is_accepting_orders ?? true,
  );
  const [toggling, setToggling] = useState(false);
  const flatListRef = useRef(null);

  const { orders, loading, refreshOrders, updateStatus } = useOrders(
    restaurant?.id,
  );

  // Keep local acceptingOrders state in sync when restaurant changes.
  useEffect(() => {
    setAcceptingOrders(restaurant?.is_accepting_orders ?? true);
  }, [restaurant?.is_accepting_orders]);

  // Scroll to top when new pending orders arrive.
  useEffect(() => {
    if (activeTab === 'pending' && orders.length > 0) {
      flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
    }
  }, [orders.length, activeTab]);

  const filteredOrders = orders
    .filter((o) => o.status === activeTab)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  const handleToggleAccepting = async (value) => {
    if (!restaurant?.id) return;

    setToggling(true);
    try {
      await restaurantService.updateRestaurant(restaurant.id, {
        is_accepting_orders: value,
      });
      setAcceptingOrders(value);
      await refreshRestaurant();
    } catch (e) {
      Alert.alert('Error', 'Could not update order acceptance status.');
    } finally {
      setToggling(false);
    }
  };

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyIcon}>📋</Text>
      <Text style={styles.emptyTitle}>No {activeTab} orders</Text>
      <Text style={styles.emptySubtitle}>
        {activeTab === 'pending'
          ? 'New orders will appear here in real time.'
          : `Orders you move to "${activeTab}" will show here.`}
      </Text>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>{restaurant?.name ?? 'Orders'}</Text>
          <Text style={styles.headerSub}>
            {acceptingOrders ? '🟢 Accepting orders' : '🔴 Paused'}
          </Text>
        </View>
        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>Open</Text>
          <Switch
            value={acceptingOrders}
            onValueChange={handleToggleAccepting}
            disabled={toggling}
            trackColor={{ true: '#34C759', false: '#ccc' }}
          />
        </View>
      </View>

      {/* Status Tabs */}
      <View style={styles.tabs}>
        {STATUS_TABS.map((tab) => {
          const count = orders.filter((o) => o.status === tab).length;
          return (
            <TouchableOpacity
              key={tab}
              style={[styles.tab, activeTab === tab && styles.activeTab]}
              onPress={() => setActiveTab(tab)}
            >
              <Text
                style={[
                  styles.tabText,
                  activeTab === tab && styles.activeTabText,
                ]}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </Text>
              {count > 0 && (
                <View
                  style={[
                    styles.badge,
                    tab === 'pending' && styles.badgeUrgent,
                  ]}
                >
                  <Text style={styles.badgeText}>{count}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Orders List */}
      <FlatList
        ref={flatListRef}
        data={filteredOrders}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <OrderCard order={item} onStatusUpdate={updateStatus} />
        )}
        contentContainerStyle={
          filteredOrders.length === 0 && styles.emptyList
        }
        ListEmptyComponent={renderEmpty}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={refreshOrders} />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111',
  },
  headerSub: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  toggleLabel: {
    fontSize: 14,
    color: '#333',
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 4,
  },
  activeTab: {
    borderBottomWidth: 2,
    borderBottomColor: '#007AFF',
  },
  tabText: {
    fontSize: 13,
    color: '#999',
    fontWeight: '500',
  },
  activeTabText: {
    color: '#007AFF',
    fontWeight: '700',
  },
  badge: {
    backgroundColor: '#ccc',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeUrgent: {
    backgroundColor: '#FF3B30',
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  emptyList: {
    flex: 1,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    lineHeight: 20,
  },
});

