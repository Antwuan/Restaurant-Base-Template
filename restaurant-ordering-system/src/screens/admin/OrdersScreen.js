import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  ScrollView,
  StyleSheet,
  Switch,
  RefreshControl,
} from 'react-native';
import { useOrders } from '../../hooks/useOrders';
import { useRestaurantContext } from '../../context/RestaurantContext';
import { useTheme } from '../../theme';
import * as restaurantService from '../../services/restaurantService';
import OrderCard from '../../components/admin/OrderCard';
import AdminEmptyState from '../../components/admin/AdminEmptyState';
import AdminHoverTab from '../../components/admin/AdminHoverTab';

const STATUS_TABS = ['pending', 'preparing', 'ready', 'completed'];
const VIEW_TABS = ['Regular', 'Catering'];
const MIN_CARD_WIDTH = 220;
const MAX_COLUMNS = 5;

function columnsForWidth(containerWidth, listPadding, columnGap) {
  if (!containerWidth || containerWidth <= 0) return 1;
  const inner = containerWidth - listPadding * 2;
  const cols = Math.floor((inner + columnGap) / (MIN_CARD_WIDTH + columnGap));
  return Math.max(1, Math.min(MAX_COLUMNS, cols || 1));
}

function cardWidthFor(containerWidth, columns, listPadding, columnGap) {
  if (!containerWidth || columns < 1) return MIN_CARD_WIDTH;
  return (containerWidth - listPadding * 2 - columnGap * (columns - 1)) / columns;
}

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
  columns,
  cardWidth,
  listPadding,
  columnGap,
  c,
  activeTab,
  onTabChange,
  s,
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
      <View style={[s.tabs, { backgroundColor: c.backgroundCard, borderBottomColor: c.border }]}>
        {STATUS_TABS.map((tab) => {
          const count = tabCount(tab);
          const isActive = activeTab === tab;
          return (
            <AdminHoverTab
              key={tab}
              isActive={isActive}
              brandLight={c.brandLight}
              washRadius={0}
              style={[
                s.tab,
                isActive && { borderBottomWidth: 2, borderBottomColor: c.brand },
              ]}
              contentStyle={s.tabContent}
              onPress={() => onTabChange(tab)}
            >
              {({ hovered }) => (
                <>
                  <Text
                    style={[
                      s.tabText,
                      { color: isActive || hovered ? c.brand : c.textSecondary },
                      isActive && s.activeTabText,
                    ]}
                  >
                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                  </Text>
                  {count > 0 && (
                    <View
                      style={[
                        s.badge,
                        { backgroundColor: c.textDisabled },
                        tab === 'pending' && s.badgeUrgent,
                      ]}
                    >
                      <Text style={s.badgeText}>{count}</Text>
                    </View>
                  )}
                </>
              )}
            </AdminHoverTab>
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
          contentContainerStyle={{
            padding: listPadding,
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: columnGap,
            alignItems: 'flex-start',
          }}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={onRefresh} />}
        >
          {filtered.map((order) => (
            <View key={order.id} style={{ width: cardWidth }}>
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
  const sp = theme.spacing;
  const listPadding = sp[3]; // 12
  const columnGap = sp[2]; // 8
  const s = React.useMemo(() => makeStyles(sp), [sp]);

  const { restaurant, patchRestaurant } = useRestaurantContext();
  const [viewTab, setViewTab] = useState('Regular');
  const [activeTab, setActiveTab] = useState('pending');
  const [columns, setColumns] = useState(1);
  const [cardWidth, setCardWidth] = useState(MIN_CARD_WIDTH);
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

  const updateLayout = (containerWidth) => {
    const nextCols = columnsForWidth(containerWidth, listPadding, columnGap);
    const nextWidth = cardWidthFor(containerWidth, nextCols, listPadding, columnGap);
    setColumns(nextCols);
    setCardWidth(nextWidth);
  };

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
    <View
      style={[s.container, { backgroundColor: c.background }]}
      onLayout={(e) => updateLayout(e.nativeEvent.layout.width)}
    >
      {/* Single toolbar: Open + Regular/Catering (shell already titles the section) */}
      <View
        style={[
          s.toolbar,
          { backgroundColor: c.backgroundCard, borderBottomColor: c.border },
        ]}
      >
        <View style={s.openCluster}>
          <View
            style={[
              s.openPill,
              {
                backgroundColor: acceptingOrders ? '#D1FAE5' : '#FEE2E2',
                borderColor: acceptingOrders ? '#6EE7B7' : '#FECACA',
              },
            ]}
          >
            <Text
              style={[
                s.openPillText,
                { color: acceptingOrders ? '#065F46' : '#991B1B' },
              ]}
            >
              {acceptingOrders ? 'Open' : 'Paused'}
            </Text>
            <Switch
              value={acceptingOrders}
              onValueChange={handleToggleAccepting}
              disabled={toggling}
              trackColor={{ true: '#34C759', false: '#ccc' }}
              style={s.openSwitch}
            />
          </View>
          {toggleError ? (
            <Text style={s.toggleError}>{toggleError}</Text>
          ) : null}
        </View>

        <View style={s.viewTabs}>
          {VIEW_TABS.map((vt) => {
            const isActive = viewTab === vt;
            const badge = vt === 'Catering' ? cateringCount : null;
            return (
              <AdminHoverTab
                key={vt}
                isActive={isActive}
                brandLight={c.brandLight}
                style={[
                  s.viewTab,
                  isActive && {
                    backgroundColor: c.brand + '14',
                    borderColor: c.brand,
                  },
                ]}
                contentStyle={s.viewTabContent}
                onPress={() => setViewTab(vt)}
              >
                {({ hovered }) => (
                  <>
                    <Text
                      style={[
                        s.viewTabText,
                        { color: isActive || hovered ? c.brand : c.textSecondary },
                        isActive && { fontWeight: '700' },
                      ]}
                    >
                      {vt}
                    </Text>
                    {badge > 0 && (
                      <View style={[s.badge, { backgroundColor: c.brand }]}>
                        <Text style={s.badgeText}>{badge}</Text>
                      </View>
                    )}
                  </>
                )}
              </AdminHoverTab>
            );
          })}
        </View>
      </View>

      {/* ── Regular orders ──────────────────────────────── */}
      {viewTab === 'Regular' && (
        <>
          <View style={[s.tabs, { backgroundColor: c.backgroundCard, borderBottomColor: c.border }]}>
            {STATUS_TABS.map((tab) => {
              const count = tabCount(tab);
              const isActive = activeTab === tab;
              return (
                <AdminHoverTab
                  key={tab}
                  isActive={isActive}
                  brandLight={c.brandLight}
                  washRadius={0}
                  style={[
                    s.tab,
                    isActive && { borderBottomWidth: 2, borderBottomColor: c.brand },
                  ]}
                  contentStyle={s.tabContent}
                  onPress={() => setActiveTab(tab)}
                >
                  {({ hovered }) => (
                    <>
                      <Text
                        style={[
                          s.tabText,
                          { color: isActive || hovered ? c.brand : c.textSecondary },
                          isActive && s.activeTabText,
                        ]}
                      >
                        {tab.charAt(0).toUpperCase() + tab.slice(1)}
                      </Text>
                      {count > 0 && (
                        <View
                          style={[
                            s.badge,
                            { backgroundColor: c.textDisabled },
                            tab === 'pending' && s.badgeUrgent,
                          ]}
                        >
                          <Text style={s.badgeText}>{count}</Text>
                        </View>
                      )}
                    </>
                  )}
                </AdminHoverTab>
              );
            })}
          </View>

          <FlatList
            ref={flatListRef}
            data={filteredOrders}
            keyExtractor={(item) => item.id}
            numColumns={columns}
            key={`orders-${columns}col`}
            columnWrapperStyle={columns > 1 ? [s.row, { gap: columnGap, marginBottom: columnGap }] : undefined}
            renderItem={({ item }) => (
              <View style={[s.cardWrapper, { width: cardWidth, marginBottom: columns === 1 ? columnGap : 0 }]}>
                <OrderCard order={item} onStatusUpdate={updateStatus} />
              </View>
            )}
            contentContainerStyle={
              filteredOrders.length === 0
                ? s.emptyList
                : [s.listContent, { padding: listPadding }]
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
          columns={columns}
          cardWidth={cardWidth}
          listPadding={listPadding}
          columnGap={columnGap}
          c={c}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          s={s}
        />
      )}
    </View>
  );
}

function makeStyles(sp) {
  return StyleSheet.create({
    container: {
      flex: 1,
    },
    toolbar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      flexWrap: 'wrap',
      gap: sp[2],
      paddingHorizontal: sp[3],
      paddingVertical: sp[2],
      borderBottomWidth: 1,
    },
    openCluster: {
      flexShrink: 0,
    },
    openPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: sp[2],
      paddingLeft: sp[3],
      paddingRight: sp[1],
      paddingVertical: sp[1],
      borderRadius: 999,
      borderWidth: 1,
    },
    openPillText: {
      fontSize: 13,
      fontWeight: '700',
    },
    openSwitch: {
      transform: [{ scaleX: 0.9 }, { scaleY: 0.9 }],
    },
    toggleError: {
      fontSize: 11,
      color: '#DC3545',
      marginTop: 2,
      maxWidth: 200,
    },
    viewTabs: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: sp[1],
      flexWrap: 'wrap',
    },
    viewTab: {
      paddingVertical: sp[2],
      paddingHorizontal: sp[3],
      borderRadius: 8,
      borderWidth: 1,
      borderColor: 'transparent',
      minHeight: 40,
    },
    viewTabContent: {
      gap: 6,
      flex: 0,
    },
    viewTabText: {
      fontSize: 14,
      fontWeight: '500',
    },
    tabs: {
      flexDirection: 'row',
      borderBottomWidth: 1,
    },
    tab: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingVertical: sp[2] + 2,
      minHeight: 44,
      borderRadius: 0,
    },
    tabContent: {
      justifyContent: 'center',
      gap: 4,
      flex: 0,
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
      flexGrow: 1,
    },
    row: {
      alignItems: 'flex-start',
    },
    cardWrapper: {},
    emptyList: {
      flex: 1,
    },
  });
}
