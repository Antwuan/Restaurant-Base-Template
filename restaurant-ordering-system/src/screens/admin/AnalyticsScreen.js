import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from 'recharts';
import { useRestaurantContext } from '../../context/RestaurantContext';
import { getOrders } from '../../services/orderService';
import { getMenuItems } from '../../services/menuService';
import { useTheme } from '../../theme';

// ── Constants ─────────────────────────────────────────────────────────────────

const GRANULARITIES = [
  { key: 'hour', label: 'Hour' },
  { key: 'day', label: 'Day' },
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
];

const CHART_HEIGHT = 180;

// ── Date helpers ──────────────────────────────────────────────────────────────

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function startOfHour(d) {
  const x = new Date(d);
  x.setMinutes(0, 0, 0);
  return x;
}

function startOfWeek(d) {
  const x = startOfDay(d);
  const day = x.getDay();
  const diffToMon = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diffToMon);
  return x;
}

function startOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function getWeekRange(weeksAgo = 0) {
  const mon = startOfWeek(new Date());
  mon.setDate(mon.getDate() - weeksAgo * 7);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  sun.setHours(23, 59, 59, 999);
  return { from: mon, to: sun };
}

function isoDate(d) {
  return d.toISOString();
}

function formatCurrency(n) {
  return `$${(n ?? 0).toFixed(2)}`;
}

function formatCurrencyShort(n) {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${Math.round(n)}`;
}

function formatPct(n) {
  if (n == null || !isFinite(n)) return '—';
  return `${n.toFixed(1)}%`;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** Build empty buckets for the selected granularity (newest last). */
function buildBuckets(granularity) {
  const now = new Date();
  const buckets = [];

  if (granularity === 'hour') {
    const start = startOfHour(now);
    start.setHours(start.getHours() - 23);
    for (let i = 0; i < 24; i++) {
      const d = new Date(start);
      d.setHours(start.getHours() + i);
      buckets.push({
        key: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}`,
        label: d.toLocaleTimeString('en-US', { hour: 'numeric' }),
        subLabel: i === 0 || d.getHours() === 0
          ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
          : null,
        from: d,
        revenue: 0,
        count: 0,
      });
    }
  } else if (granularity === 'day') {
    const start = startOfDay(now);
    start.setDate(start.getDate() - 6);
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      buckets.push({
        key: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`,
        label: d.toLocaleDateString('en-US', { weekday: 'short' }),
        subLabel: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        from: d,
        revenue: 0,
        count: 0,
      });
    }
  } else if (granularity === 'week') {
    const start = startOfWeek(now);
    start.setDate(start.getDate() - 7 * 7); // 8 weeks including current
    for (let i = 0; i < 8; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i * 7);
      const end = new Date(d);
      end.setDate(d.getDate() + 6);
      buckets.push({
        key: `${d.getFullYear()}-W${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`,
        label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        subLabel: `– ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
        from: d,
        revenue: 0,
        count: 0,
      });
    }
  } else {
    // month — last 12 months including current
    const start = startOfMonth(now);
    start.setMonth(start.getMonth() - 11);
    for (let i = 0; i < 12; i++) {
      const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
      buckets.push({
        key: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`,
        label: d.toLocaleDateString('en-US', { month: 'short' }),
        subLabel: String(d.getFullYear()).slice(2),
        from: d,
        revenue: 0,
        count: 0,
      });
    }
  }

  return buckets;
}

function orderBucketKey(orderDate, granularity) {
  const d = new Date(orderDate);
  if (granularity === 'hour') {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}`;
  }
  if (granularity === 'day') {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }
  if (granularity === 'week') {
    const w = startOfWeek(d);
    return `${w.getFullYear()}-W${pad2(w.getMonth() + 1)}-${pad2(w.getDate())}`;
  }
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

function bucketOrders(orders, granularity) {
  const buckets = buildBuckets(granularity);
  const byKey = Object.fromEntries(buckets.map((b) => [b.key, b]));

  orders
    .filter((o) => o.status !== 'cancelled')
    .forEach((o) => {
      if (!o.created_at) return;
      const key = orderBucketKey(o.created_at, granularity);
      const bucket = byKey[key];
      if (!bucket) return;
      bucket.revenue += o.total ?? 0;
      bucket.count += 1;
    });

  return buckets;
}

function rangeLabel(granularity) {
  switch (granularity) {
    case 'hour': return 'Last 24 hours';
    case 'day': return 'Last 7 days';
    case 'week': return 'Last 8 weeks';
    case 'month': return 'Last 12 months';
    default: return '';
  }
}

// ── Aggregation helpers ───────────────────────────────────────────────────────

function aggregateOrders(orders) {
  const completed = orders.filter((o) => o.status !== 'cancelled');
  const cancelled = orders.filter((o) => o.status === 'cancelled');

  const revenue = completed.reduce((s, o) => s + (o.total ?? 0), 0);
  const aov = completed.length > 0 ? revenue / completed.length : 0;

  const pickupCount = completed.filter((o) => o.order_type === 'pickup').length;
  const deliveryCount = completed.filter((o) => o.order_type === 'delivery').length;

  return {
    revenue,
    orderCount: completed.length,
    cancelCount: cancelled.length,
    aov,
    pickupCount,
    deliveryCount,
  };
}

function aggregateMenuItems(orders, menuItems) {
  const itemMap = {};
  menuItems.forEach((m) => {
    itemMap[m.id] = { name: m.name, price: m.price, cost: m.cost };
  });

  const statsById = {};
  orders
    .filter((o) => o.status !== 'cancelled')
    .forEach((o) => {
      (o.items ?? []).forEach((li) => {
        const id = li.id ?? li.name;
        if (!statsById[id]) {
          statsById[id] = {
            id,
            name: li.name,
            qty: 0,
            revenue: 0,
            priceAtSale: li.price ?? 0,
          };
        }
        statsById[id].qty += li.quantity ?? 1;
        statsById[id].revenue += (li.price ?? 0) * (li.quantity ?? 1);
      });
    });

  return Object.values(statsById)
    .map((s) => {
      const menuItem = itemMap[s.id];
      const cost = menuItem?.cost ?? null;
      const avgSalePrice = s.qty > 0 ? s.revenue / s.qty : s.priceAtSale;
      const margin =
        cost != null && avgSalePrice > 0
          ? ((avgSalePrice - cost) / avgSalePrice) * 100
          : null;
      return { ...s, cost, margin };
    })
    .sort((a, b) => b.revenue - a.revenue);
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({ icon, label, value, sub, accent }) {
  const { theme } = useTheme();
  const c = theme.colors;

  return (
    <View
      style={[
        styles.statCard,
        {
          backgroundColor: accent ? c.brand : c.backgroundCard,
          borderColor: accent ? c.brand : c.border,
        },
      ]}
    >
      <View
        style={[
          styles.statIconWrap,
          {
            backgroundColor: accent ? 'rgba(255,255,255,0.25)' : c.brandLight,
          },
        ]}
      >
        <Ionicons name={icon} size={18} color={accent ? '#fff' : c.brand} />
      </View>
      <Text style={[styles.statValue, { color: accent ? '#fff' : c.textPrimary }]}>
        {value}
      </Text>
      <Text
        style={[
          styles.statLabel,
          { color: accent ? 'rgba(255,255,255,0.75)' : c.textSecondary },
        ]}
      >
        {label}
      </Text>
      {sub ? (
        <Text
          style={[
            styles.statSub,
            { color: accent ? 'rgba(255,255,255,0.65)' : c.textDisabled },
          ]}
        >
          {sub}
        </Text>
      ) : null}
    </View>
  );
}

function MarginBadge({ margin }) {
  const { theme } = useTheme();
  const c = theme.colors;

  if (margin == null) {
    return <Text style={[styles.marginNone, { color: c.textDisabled }]}>No cost set</Text>;
  }
  const color = margin >= 60 ? '#16a34a' : margin >= 30 ? '#d97706' : '#dc2626';
  return (
    <View style={[styles.marginBadge, { backgroundColor: color + '18' }]}>
      <Text style={[styles.marginBadgeText, { color }]}>{formatPct(margin)}</Text>
    </View>
  );
}

function RevenueTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  return (
    <View style={styles.rechartsTooltip}>
      <Text style={styles.rechartsTooltipTitle}>
        {row.label}{row.subLabel ? ` · ${row.subLabel}` : ''}
      </Text>
      <Text style={styles.rechartsTooltipValue}>{formatCurrency(row.revenue)}</Text>
      <Text style={styles.rechartsTooltipCount}>
        {row.count} order{row.count !== 1 ? 's' : ''}
      </Text>
    </View>
  );
}

function RevenueBarChart({ buckets, selectedKey, onSelect, brandColor, brandDark, gridColor, tickColor }) {
  const chartData = buckets.map((b) => ({
    ...b,
    name: b.label,
  }));

  return (
    <View style={styles.rechartsWrap}>
      <ResponsiveContainer width="100%" height={CHART_HEIGHT + 40}>
        <BarChart
          data={chartData}
          margin={{ top: 12, right: 8, left: 0, bottom: 4 }}
          onClick={(state) => {
            const key = state?.activePayload?.[0]?.payload?.key;
            if (!key) return;
            onSelect(selectedKey === key ? null : key);
          }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: tickColor, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            tickFormatter={(v) => formatCurrencyShort(v)}
            tick={{ fill: tickColor, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={48}
          />
          <Tooltip
            cursor={{ fill: 'rgba(0,0,0,0.04)' }}
            content={<RevenueTooltip />}
          />
          <Bar dataKey="revenue" radius={[4, 4, 0, 0]} maxBarSize={42}>
            {chartData.map((entry) => (
              <Cell
                key={entry.key}
                fill={selectedKey === entry.key ? brandDark : brandColor}
                opacity={entry.revenue === 0 ? 0.2 : 1}
                cursor="pointer"
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function AnalyticsScreen() {
  const { restaurant } = useRestaurantContext();
  const { theme } = useTheme();
  const c = theme.colors;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [allOrders, setAllOrders] = useState([]);
  const [thisWeek, setThisWeek] = useState(null);
  const [lastWeek, setLastWeek] = useState(null);
  const [itemStats, setItemStats] = useState([]);
  const [lastRefresh, setLastRefresh] = useState(null);

  const [granularity, setGranularity] = useState('day');
  const [selectedBar, setSelectedBar] = useState(null);

  const load = useCallback(async () => {
    if (!restaurant?.id) return;
    setLoading(true);
    setError(null);
    try {
      const tw = getWeekRange(0);
      const lw = getWeekRange(1);

      // Fetch 12 months so month/week charts have enough history
      const chartFrom = startOfMonth(new Date());
      chartFrom.setMonth(chartFrom.getMonth() - 11);

      const [historyOrders, menuItems] = await Promise.all([
        getOrders(restaurant.id, { from: isoDate(chartFrom) }),
        getMenuItems(restaurant.id),
      ]);

      const twOrders = historyOrders.filter((o) => {
        const t = new Date(o.created_at).getTime();
        return t >= tw.from.getTime() && t <= tw.to.getTime();
      });
      const lwOrders = historyOrders.filter((o) => {
        const t = new Date(o.created_at).getTime();
        return t >= lw.from.getTime() && t <= lw.to.getTime();
      });

      setAllOrders(historyOrders);
      setThisWeek(aggregateOrders(twOrders));
      setLastWeek(aggregateOrders(lwOrders));
      setItemStats(aggregateMenuItems(twOrders, menuItems));
      setLastRefresh(new Date());
      setSelectedBar(null);
    } catch (e) {
      setError(e.message || 'Failed to load analytics.');
    } finally {
      setLoading(false);
    }
  }, [restaurant?.id]);

  useEffect(() => {
    load();
  }, [load]);

  // Re-bucket when granularity changes (no refetch needed)
  const chartBuckets = useMemo(
    () => bucketOrders(allOrders, granularity),
    [allOrders, granularity],
  );

  const chartTotal = useMemo(
    () => chartBuckets.reduce((s, b) => s + b.revenue, 0),
    [chartBuckets],
  );

  const handleGranularity = (key) => {
    setGranularity(key);
    setSelectedBar(null);
  };

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: c.background }]}>
        <ActivityIndicator size="large" color={c.brand} />
        <Text style={[styles.loadingText, { color: c.textSecondary }]}>Loading analytics…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.centered, { backgroundColor: c.background }]}>
        <Ionicons name="alert-circle-outline" size={40} color={c.error} />
        <Text style={[styles.errorText, { color: c.error }]}>{error}</Text>
        <TouchableOpacity
          style={[styles.retryBtn, { backgroundColor: c.brand }]}
          onPress={load}
        >
          <Text style={styles.retryBtnText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const revChange =
    lastWeek?.revenue > 0
      ? ((thisWeek.revenue - lastWeek.revenue) / lastWeek.revenue) * 100
      : null;
  const countChange =
    lastWeek?.orderCount > 0
      ? ((thisWeek.orderCount - lastWeek.orderCount) / lastWeek.orderCount) * 100
      : null;

  const cancelRate =
    (thisWeek.orderCount + thisWeek.cancelCount) > 0
      ? (thisWeek.cancelCount / (thisWeek.orderCount + thisWeek.cancelCount)) * 100
      : 0;

  const selectedBucket = chartBuckets.find((b) => b.key === selectedBar);

  return (
    <ScrollView
      style={[styles.root, { backgroundColor: c.background }]}
      contentContainerStyle={styles.rootContent}
      showsVerticalScrollIndicator={false}
    >
      {/* Header row */}
      <View style={styles.pageHeader}>
        <View>
          <Text style={[styles.pageTitle, { color: c.textPrimary }]}>This Week</Text>
          {lastRefresh && (
            <Text style={[styles.pageSub, { color: c.textDisabled }]}>
              Refreshed {lastRefresh.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
            </Text>
          )}
        </View>
        <TouchableOpacity
          style={[styles.refreshBtn, { borderColor: c.brand }]}
          onPress={load}
        >
          <Ionicons name="refresh-outline" size={18} color={c.brand} />
          <Text style={[styles.refreshBtnText, { color: c.brand }]}>Refresh</Text>
        </TouchableOpacity>
      </View>

      {/* KPI stat cards */}
      <View style={styles.statsGrid}>
        <StatCard
          icon="cash-outline"
          label="Weekly Revenue"
          value={formatCurrency(thisWeek.revenue)}
          sub={
            revChange != null
              ? `${revChange >= 0 ? '+' : ''}${revChange.toFixed(1)}% vs last week`
              : 'No prior week data'
          }
          accent
        />
        <StatCard
          icon="receipt-outline"
          label="Orders"
          value={String(thisWeek.orderCount)}
          sub={
            countChange != null
              ? `${countChange >= 0 ? '+' : ''}${countChange.toFixed(1)}% vs last week`
              : 'No prior week data'
          }
        />
        <StatCard
          icon="trending-up-outline"
          label="Avg Order Value"
          value={formatCurrency(thisWeek.aov)}
          sub={`Last week ${formatCurrency(lastWeek?.aov)}`}
        />
        <StatCard
          icon="close-circle-outline"
          label="Cancellation Rate"
          value={formatPct(cancelRate)}
          sub={`${thisWeek.cancelCount} cancelled`}
        />
      </View>

      {/* Revenue bar chart */}
      <View
        style={[
          styles.section,
          { backgroundColor: c.backgroundCard, borderColor: c.border },
        ]}
      >
        <View style={styles.chartHeader}>
          <View>
            <Text style={[styles.sectionTitle, { color: c.textSecondary }]}>Revenue</Text>
            <Text style={[styles.chartRange, { color: c.textDisabled }]}>
              {rangeLabel(granularity)}
            </Text>
          </View>
          <Text style={[styles.chartTotal, { color: c.textPrimary }]}>
            {formatCurrency(chartTotal)}
          </Text>
        </View>

        {/* Granularity toggles */}
        <View style={[styles.granularityRow, { backgroundColor: c.backgroundSunken }]}>
          {GRANULARITIES.map((g) => {
            const active = granularity === g.key;
            return (
              <TouchableOpacity
                key={g.key}
                style={[
                  styles.granularityChip,
                  active && styles.granularityChipActive,
                  active && { backgroundColor: c.backgroundCard },
                ]}
                onPress={() => handleGranularity(g.key)}
              >
                <Text
                  style={[
                    styles.granularityText,
                    { color: active ? c.brand : c.textSecondary },
                    active && styles.granularityTextActive,
                  ]}
                >
                  {g.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {selectedBucket && (
          <View style={[styles.selectedSummary, { backgroundColor: c.brandLight }]}>
            <Text style={[styles.selectedSummaryLabel, { color: c.textPrimary }]}>
              {selectedBucket.label}
              {selectedBucket.subLabel ? ` ${selectedBucket.subLabel}` : ''}
            </Text>
            <Text style={[styles.selectedSummaryValue, { color: c.brand }]}>
              {formatCurrency(selectedBucket.revenue)}
              <Text style={[styles.selectedSummaryCount, { color: c.textSecondary }]}>
                {'  '}· {selectedBucket.count} order{selectedBucket.count !== 1 ? 's' : ''}
              </Text>
            </Text>
          </View>
        )}

        <RevenueBarChart
          buckets={chartBuckets}
          selectedKey={selectedBar}
          onSelect={setSelectedBar}
          brandColor={c.brand}
          brandDark={c.brandDark || c.brand}
          gridColor={c.border}
          tickColor={c.textDisabled}
        />
      </View>

      {/* Pickup vs delivery */}
      {(thisWeek.pickupCount + thisWeek.deliveryCount) > 0 && (
        <View
          style={[
            styles.section,
            { backgroundColor: c.backgroundCard, borderColor: c.border },
          ]}
        >
          <Text style={[styles.sectionTitle, { color: c.textSecondary }]}>Order Type Mix</Text>
          <View style={styles.mixRow}>
            <View style={styles.mixItem}>
              <Ionicons name="bag-outline" size={20} color={c.brand} />
              <Text style={[styles.mixValue, { color: c.textPrimary }]}>
                {thisWeek.pickupCount}
              </Text>
              <Text style={[styles.mixLabel, { color: c.textSecondary }]}>Pickup</Text>
            </View>
            <View style={[styles.mixDivider, { backgroundColor: c.border }]} />
            <View style={styles.mixItem}>
              <Ionicons name="bicycle-outline" size={20} color={c.brand} />
              <Text style={[styles.mixValue, { color: c.textPrimary }]}>
                {thisWeek.deliveryCount}
              </Text>
              <Text style={[styles.mixLabel, { color: c.textSecondary }]}>Delivery</Text>
            </View>
            <View style={styles.mixBarWrap}>
              {thisWeek.pickupCount > 0 && (
                <View
                  style={[
                    styles.mixBarSegment,
                    { backgroundColor: c.brand, flex: thisWeek.pickupCount },
                  ]}
                />
              )}
              {thisWeek.deliveryCount > 0 && (
                <View
                  style={[
                    styles.mixBarSegment,
                    styles.mixBarDelivery,
                    { flex: thisWeek.deliveryCount },
                  ]}
                />
              )}
            </View>
          </View>
        </View>
      )}

      {/* Menu item performance */}
      <View
        style={[
          styles.section,
          { backgroundColor: c.backgroundCard, borderColor: c.border },
        ]}
      >
        <Text style={[styles.sectionTitle, { color: c.textSecondary }]}>
          Menu Item Performance
        </Text>
        {itemStats.length === 0 ? (
          <View style={styles.emptyItems}>
            <Ionicons name="restaurant-outline" size={32} color={c.textDisabled} />
            <Text style={[styles.emptyItemsText, { color: c.textDisabled }]}>
              No orders this week
            </Text>
          </View>
        ) : (
          <>
            <View style={[styles.tableHeader, { borderBottomColor: c.border }]}>
              <Text style={[styles.tableHeaderCell, styles.colName, { color: c.textDisabled }]}>
                Item
              </Text>
              <Text style={[styles.tableHeaderCell, styles.colQty, { color: c.textDisabled }]}>
                Ordered
              </Text>
              <Text style={[styles.tableHeaderCell, styles.colRevenue, { color: c.textDisabled }]}>
                Revenue
              </Text>
              <Text style={[styles.tableHeaderCell, styles.colMargin, { color: c.textDisabled }]}>
                Margin
              </Text>
            </View>

            {itemStats.map((item, idx) => (
              <View
                key={item.id}
                style={[
                  styles.tableRow,
                  idx % 2 === 0 && { backgroundColor: c.backgroundSunken },
                ]}
              >
                <View style={styles.colName}>
                  <Text style={[styles.itemName, { color: c.textPrimary }]} numberOfLines={1}>
                    {item.name}
                  </Text>
                  {item.cost != null && (
                    <Text style={[styles.itemCost, { color: c.textDisabled }]}>
                      Cost {formatCurrency(item.cost)}
                    </Text>
                  )}
                </View>
                <Text style={[styles.tableCell, styles.colQty, { color: c.textPrimary }]}>
                  {item.qty}
                </Text>
                <Text style={[styles.tableCell, styles.colRevenue, { color: c.textPrimary }]}>
                  {formatCurrency(item.revenue)}
                </Text>
                <View style={styles.colMargin}>
                  <MarginBadge margin={item.margin} />
                </View>
              </View>
            ))}

            <Text style={[styles.marginNote, { color: c.textDisabled }]}>
              Margin = (Sale price − Cost) ÷ Sale price. Set item cost in the Menu editor.
            </Text>
          </>
        )}
      </View>
    </ScrollView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  rootContent: {
    padding: 20,
    paddingBottom: 40,
    gap: 20,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    padding: 24,
  },
  loadingText: {
    fontSize: 14,
    marginTop: 8,
  },
  errorText: {
    fontSize: 14,
    textAlign: 'center',
  },
  retryBtn: {
    marginTop: 8,
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  retryBtnText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },

  pageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  pageTitle: {
    fontSize: 22,
    fontWeight: '800',
  },
  pageSub: {
    fontSize: 12,
    marginTop: 2,
  },
  refreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 7,
    paddingHorizontal: 13,
    borderRadius: 8,
    borderWidth: 1,
  },
  refreshBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },

  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  statCard: {
    flex: 1,
    minWidth: 140,
    borderRadius: 14,
    padding: 16,
    gap: 6,
    borderWidth: 1,
    ...Platform.select({
      web: { boxShadow: '0 1px 4px rgba(0,0,0,0.06)' },
    }),
  },
  statIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 2,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '800',
  },
  statLabel: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  statSub: {
    fontSize: 11,
  },

  section: {
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    gap: 12,
    ...Platform.select({
      web: { boxShadow: '0 1px 4px rgba(0,0,0,0.06)' },
    }),
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // Chart header
  chartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  chartRange: {
    fontSize: 12,
    marginTop: 2,
  },
  chartTotal: {
    fontSize: 20,
    fontWeight: '800',
  },

  // Granularity chips
  granularityRow: {
    flexDirection: 'row',
    gap: 6,
    borderRadius: 10,
    padding: 3,
  },
  granularityChip: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 8,
    alignItems: 'center',
  },
  granularityChipActive: {
    ...Platform.select({
      web: { boxShadow: '0 1px 3px rgba(0,0,0,0.1)' },
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.08,
        shadowRadius: 2,
      },
      android: { elevation: 1 },
    }),
  },
  granularityText: {
    fontSize: 13,
    fontWeight: '500',
  },
  granularityTextActive: {
    fontWeight: '700',
  },

  selectedSummary: {
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  selectedSummaryLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  selectedSummaryValue: {
    fontSize: 14,
    fontWeight: '800',
  },
  selectedSummaryCount: {
    fontSize: 12,
    fontWeight: '500',
  },

  rechartsWrap: {
    width: '100%',
    height: CHART_HEIGHT + 40,
    minHeight: CHART_HEIGHT + 40,
  },
  rechartsTooltip: {
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#e5e5e5',
    ...Platform.select({
      web: { boxShadow: '0 4px 12px rgba(0,0,0,0.12)' },
    }),
  },
  rechartsTooltipTitle: {
    fontSize: 11,
    color: '#666',
    marginBottom: 2,
  },
  rechartsTooltipValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111',
  },
  rechartsTooltipCount: {
    fontSize: 11,
    color: '#888',
    marginTop: 2,
  },

  // Bar chart (legacy layout helpers kept for mix charts below)
  chartBody: {
    flexDirection: 'row',
    height: CHART_HEIGHT,
  },
  yAxis: {
    width: 42,
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingRight: 8,
    paddingBottom: 0,
  },
  yTick: {
    fontSize: 10,
    fontWeight: '500',
  },
  barsArea: {
    flex: 1,
    position: 'relative',
  },
  gridLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
  },
  barsRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 3,
  },
  barCol: {
    flex: 1,
    height: '100%',
    justifyContent: 'flex-end',
    alignItems: 'center',
    position: 'relative',
  },
  barTrack: {
    width: '70%',
    maxWidth: 36,
    height: '100%',
    justifyContent: 'flex-end',
  },
  barFill: {
    width: '100%',
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
    minHeight: 2,
  },
  barTooltip: {
    position: 'absolute',
    top: 0,
    alignItems: 'center',
    zIndex: 2,
  },
  barTooltipValue: {
    fontSize: 10,
    fontWeight: '700',
  },
  barTooltipCount: {
    fontSize: 9,
  },
  xAxis: {
    flexDirection: 'row',
    marginTop: 6,
  },
  yAxisSpacer: {
    width: 42,
  },
  xLabelsRow: {
    flex: 1,
    flexDirection: 'row',
    gap: 3,
  },
  xLabelCol: {
    flex: 1,
    alignItems: 'center',
  },
  xLabel: {
    fontSize: 10,
    fontWeight: '500',
    textAlign: 'center',
  },
  xLabelSelected: {
    fontWeight: '700',
  },
  xSubLabel: {
    fontSize: 9,
    textAlign: 'center',
    marginTop: 1,
  },

  // Order type mix
  mixRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 16,
  },
  mixItem: {
    alignItems: 'center',
    gap: 2,
    minWidth: 56,
  },
  mixValue: {
    fontSize: 20,
    fontWeight: '800',
  },
  mixLabel: {
    fontSize: 11,
    fontWeight: '500',
  },
  mixDivider: {
    width: 1,
    height: 36,
  },
  mixBarWrap: {
    flex: 1,
    minWidth: 80,
    height: 10,
    borderRadius: 6,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  mixBarSegment: {
    height: 10,
  },
  mixBarDelivery: {
    backgroundColor: '#34c759',
  },

  // Item performance table
  tableHeader: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    paddingBottom: 8,
  },
  tableHeaderCell: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: 6,
  },
  tableCell: {
    fontSize: 14,
    fontWeight: '500',
  },
  colName: {
    flex: 3,
    paddingRight: 8,
  },
  colQty: {
    flex: 1,
    textAlign: 'center',
  },
  colRevenue: {
    flex: 1.5,
    textAlign: 'right',
  },
  colMargin: {
    flex: 1.5,
    alignItems: 'flex-end',
  },
  itemName: {
    fontSize: 14,
    fontWeight: '600',
  },
  itemCost: {
    fontSize: 11,
    marginTop: 1,
  },
  marginBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
  },
  marginBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  marginNone: {
    fontSize: 11,
    fontStyle: 'italic',
  },
  marginNote: {
    fontSize: 11,
    marginTop: 4,
    lineHeight: 16,
  },
  emptyItems: {
    alignItems: 'center',
    paddingVertical: 24,
    gap: 8,
  },
  emptyItemsText: {
    fontSize: 14,
  },
});
