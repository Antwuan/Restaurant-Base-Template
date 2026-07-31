import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  ScrollView,
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

const STATUS_TABS = ['pending', 'preparing', 'ready', 'completed'];
const VIEW_TABS = ['Regular', 'Catering'];

// ── helpers ──────────────────────────────────────────────────────────────────

function isTodayOrFuture(isoString) {
  if (!isoString) return false;
  const d = new Date(isoString);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d >= today;
}

function formatScheduled(isoString) {
  if (!isoString) return null;
  const d = new Date(isoString);
  return d.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// ── Catering section ─────────────────────────────────────────────────────────
function CateringSection({
  orders,
  loading,
  onRefresh,
  onStatusUpdate,
  cardWidth,
  c,
  activeTab,
  onTabChange,
}) {
  const cateringOrders = orders
    .filter((o) => o.menu_type === 'catering' && isTodayOrFuture(o.scheduled_time))
    .sort((a, b) => new Date(a.scheduled_time) - new Date(b.scheduled_time));

  const tabCount = (tab) => {
    if (tab === 'preparing') {
      return cateringOrders.filter((o) => o.status === 'preparing' || o.status === 'accepted').length;
    }
    return cateringOrders.filter((o) => o.status === tab).length;
  };

  const filtered = cateringOrders.filter((o) => {
    if (activeTab === 'preparing') {
      return o.status === 'preparing' || o.status === 'accepted';
    }
    return o.status === activeTab;
  });

  return (
    <>
      <View style={[styles.tabs, { backgroundColor: c.backgroundCard, borderBottomColor: c.border }]}>
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
              onPress={() => onTabChange(tab)}
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

      {loading && filtered.length === 0 ? null : filtered.length === 0 ? (
        <AdminEmptyState
          icon="🍱"
          title={`No ${activeTab} catering orders`}
          subtitle="Catering orders scheduled for today or the future will appear here."
        />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: LIST_PADDING, gap: 10 }}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={onRefresh} />}
        >
          {filtered.map((order) => (
            <View key={order.id} style={{ marginBottom: 10, maxWidth: 420 }}>
              <View style={[cat.timeBanner, { backgroundColor: c.brand + '18', borderColor: c.brand + '44' }]}>
                <Text style={[cat.timeText, { color: c.brand }]}>
                  📅 {formatScheduled(order.scheduled_time)}
                </Text>
              </View>
              <OrderCard order={order} onStatusUpdate={onStatusUpdate} />
            </View>
          ))}
        </ScrollView>
      )}
    </>
  );
}

const cat = StyleSheet.create({
  timeBanner: {
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderBottomWidth: 0,
  },
  timeText: { fontSize: 13, fontWeight: '600' },
});

// ── Main screen ───────────────────────────────────────────────────────────────
export default function OrdersScreen() {
  const { theme } = useTheme();
  const c = theme.colors;
  const { restaurant, patchRestaurant } = useRestaurantContext();
  const [viewTab, setViewTab] = useState('Regular');
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

  // Regular orders only
  const regularOrders = orders.filter((o) => !o.menu_type || o.menu_type === 'regular');

  const filteredOrders = regularOrders
    .filter((o) => {
      if (activeTab === 'preparing') {
        return o.status === 'preparing' || o.status === 'accepted';
      }
      return o.status === activeTab;
    })
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  const tabCount = (tab) => {
    if (tab === 'preparing') {
      return regularOrders.filter((o) => o.status === 'preparing' || o.status === 'accepted').length;
    }
    return regularOrders.filter((o) => o.status === tab).length;
  };

  // Catering badge count
  const cateringCount = orders.filter(
    (o) => o.menu_type === 'catering' && isTodayOrFuture(o.scheduled_time),
  ).length;

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

      {/* View tabs: Regular | Catering */}
      <View style={[styles.viewTabs, { backgroundColor: c.backgroundCard, borderBottomColor: c.border }]}>
        {VIEW_TABS.map((vt) => {
          const isActive = viewTab === vt;
          const badge = vt === 'Catering' ? cateringCount : null;
          return (
            <TouchableOpacity
              key={vt}
              style={[
                styles.viewTab,
                isActive && { borderBottomWidth: 2.5, borderBottomColor: c.brand },
              ]}
              onPress={() => setViewTab(vt)}
            >
              <Text style={[styles.viewTabText, { color: isActive ? c.brand : c.textSecondary }, isActive && { fontWeight: '700' }]}>
                {vt}
              </Text>
              {badge > 0 && (
                <View style={[styles.badge, { backgroundColor: c.brand }]}>
                  <Text style={styles.badgeText}>{badge}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── Regular orders ──────────────────────────────── */}
      {viewTab === 'Regular' && (
        <>
          {/* Status Tabs */}
          <View style={[styles.tabs, { backgroundColor: c.backgroundCard, borderBottomColor: c.border }]}>
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
        </>
      )}

      {/* ── Catering orders ─────────────────────────────── */}
      {viewTab === 'Catering' && (
        <CateringSection
          orders={orders}
          loading={loading}
          onRefresh={refreshOrders}
          onStatusUpdate={updateStatus}
          cardWidth={cardWidth}
          c={c}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />
      )}
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
  // Top-level Regular / Catering switcher
  viewTabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    paddingHorizontal: 8,
  },
  viewTab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 6,
  },
  viewTabText: {
    fontSize: 14,
    fontWeight: '500',
  },
  // Status tabs
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
