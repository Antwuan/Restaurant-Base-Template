import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  Switch,
  RefreshControl,
  Dimensions,
} from 'react-native';

const COLUMNS = 5;
const LIST_PADDING = 10;
const COLUMN_GAP = 8;

function getCardWidth() {
  const { width } = Dimensions.get('window');
  return (width - LIST_PADDING * 2 - COLUMN_GAP * (COLUMNS - 1)) / COLUMNS;
}
import { useOrders } from '../../hooks/useOrders';
import { useRestaurantContext } from '../../context/RestaurantContext';
import { useTheme } from '../../theme';
import * as restaurantService from '../../services/restaurantService';
import OrderCard from '../../components/admin/OrderCard';
import AdminEmptyState from '../../components/admin/AdminEmptyState';

const STATUS_TABS = ['pending', 'preparing', 'completed'];

export default function OrdersScreen() {
  const { theme } = useTheme();
  const c = theme.colors;
  const { restaurant, patchRestaurant } = useRestaurantContext();
  const [activeTab, setActiveTab] = useState('pending');
  const [cardWidth, setCardWidth] = useState(getCardWidth);
  const [acceptingOrders, setAcceptingOrders] = useState(
    restaurant?.is_accepting_orders ?? true,
  );
  const [toggling, setToggling] = useState(false);
  const [toggleError, setToggleError] = useState(null);
  const flatListRef = useRef(null);

  const { orders, loading, refetch: refreshOrders, updateOrderStatus: updateStatus } = useOrders(
    restaurant?.id,
  );

  useEffect(() => {
    setAcceptingOrders(restaurant?.is_accepting_orders ?? true);
  }, [restaurant?.is_accepting_orders]);

  useEffect(() => {
    if (activeTab === 'pending' && orders.length > 0) {
      flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
    }
  }, [orders.length, activeTab]);

  const filteredOrders = orders
    .filter((o) => {
      if (activeTab === 'preparing') {
        // Include both accepted and preparing so legacy accepted orders are visible
        return o.status === 'preparing' || o.status === 'accepted';
      }
      return o.status === activeTab;
    })
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  const tabCount = (tab) => {
    if (tab === 'preparing') {
      return orders.filter((o) => o.status === 'preparing' || o.status === 'accepted').length;
    }
    return orders.filter((o) => o.status === tab).length;
  };

  const handleToggleAccepting = async (value) => {
    if (!restaurant?.id) return;
    setAcceptingOrders(value);
    setToggleError(null);
    setToggling(true);
    try {
      await restaurantService.updateRestaurant(restaurant.id, {
        is_accepting_orders: value,
      });
      patchRestaurant({ is_accepting_orders: value });
    } catch (e) {
      setAcceptingOrders(!value);
      setToggleError('Could not update order status. Check your connection.');
    } finally {
      setToggling(false);
    }
  };

  const renderEmpty = () => (
    <AdminEmptyState
      icon="📋"
      title={`No ${activeTab} orders`}
      subtitle={
        activeTab === 'pending'
          ? 'New orders will appear here in real time.'
          : `Orders you move to "${activeTab}" will show here.`
      }
    />
  );

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      {/* Header */}
      <View
        style={[
          styles.header,
          { backgroundColor: c.backgroundCard, borderBottomColor: c.border },
        ]}
      >
        <View>
          <Text style={[styles.headerTitle, { color: c.textPrimary }]}>
            {restaurant?.name ?? 'Orders'}
          </Text>
          <Text style={[styles.headerSub, { color: c.textSecondary }]}>
            {acceptingOrders ? '🟢 Accepting orders' : '🔴 Paused'}
          </Text>
        </View>
        <View style={styles.toggleColumn}>
          <View style={styles.toggleRow}>
            <Text style={[styles.toggleLabel, { color: c.textPrimary }]}>Open</Text>
            <Switch
              value={acceptingOrders}
              onValueChange={handleToggleAccepting}
              disabled={toggling}
              trackColor={{ true: '#34C759', false: '#ccc' }}
            />
          </View>
          {toggleError ? (
            <Text style={styles.toggleError}>{toggleError}</Text>
          ) : null}
        </View>
      </View>

      {/* Status Tabs */}
      <View
        style={[
          styles.tabs,
          { backgroundColor: c.backgroundCard, borderBottomColor: c.border },
        ]}
      >
        {STATUS_TABS.map((tab) => {
          const count = tabCount(tab);
          const isActive = activeTab === tab;
          return (
            <TouchableOpacity
              key={tab}
              style={[
                styles.tab,
                isActive && { borderBottomWidth: 2, borderBottomColor: c.brand },
              ]}
              onPress={() => setActiveTab(tab)}
            >
              <Text
                style={[
                  styles.tabText,
                  { color: isActive ? c.brand : c.textSecondary },
                  isActive && styles.activeTabText,
                ]}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </Text>
              {count > 0 && (
                <View
                  style={[
                    styles.badge,
                    { backgroundColor: c.textDisabled },
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

      {/* Orders Grid */}
      <FlatList
        ref={flatListRef}
        data={filteredOrders}
        keyExtractor={(item) => item.id}
        numColumns={COLUMNS}
        key="orders-5col"
        columnWrapperStyle={styles.row}
        onLayout={(e) => {
          const containerWidth = e.nativeEvent.layout.width;
          setCardWidth(
            (containerWidth - LIST_PADDING * 2 - COLUMN_GAP * (COLUMNS - 1)) / COLUMNS,
          );
        }}
        renderItem={({ item }) => (
          <View style={[styles.cardWrapper, { width: cardWidth }]}>
            <OrderCard order={item} onStatusUpdate={updateStatus} />
          </View>
        )}
        contentContainerStyle={
          filteredOrders.length === 0 ? styles.emptyList : styles.listContent
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
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  headerSub: {
    fontSize: 12,
    marginTop: 2,
  },
  toggleColumn: {
    alignItems: 'flex-end',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  toggleLabel: {
    fontSize: 14,
  },
  toggleError: {
    fontSize: 11,
    color: '#DC3545',
    marginTop: 2,
    maxWidth: 160,
    textAlign: 'right',
  },
  tabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 11,
    gap: 4,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '500',
  },
  activeTabText: {
    fontWeight: '700',
  },
  badge: {
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
  listContent: {
    padding: 10,
  },
  row: {
    gap: 8,
    marginBottom: 8,
    alignItems: 'flex-start',
  },
  cardWrapper: {
    // width is set inline from cardWidth state
  },
  emptyList: {
    flex: 1,
  },
});
