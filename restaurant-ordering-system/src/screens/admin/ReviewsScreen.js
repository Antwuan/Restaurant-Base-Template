/**
 * Admin Reviews — sortable inbox of order-linked customer reviews.
 */
import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme';
import { useRestaurantContext } from '../../context/RestaurantContext';
import AdminEmptyState from '../../components/admin/AdminEmptyState';
import { listOrderReviews } from '../../services/reviewService';

const SORT_OPTIONS = [
  { key: 'created_at', label: 'Date' },
  { key: 'rating', label: 'Rating' },
  { key: 'order_type', label: 'Method' },
];

const RATING_FILTERS = [
  { key: null, label: 'All' },
  { key: 5, label: '5★' },
  { key: 4, label: '4★' },
  { key: 3, label: '3★' },
  { key: 2, label: '2★' },
  { key: 1, label: '1★' },
];

const TYPE_FILTERS = [
  { key: null, label: 'All types' },
  { key: 'pickup', label: 'Pickup' },
];

function formatDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatMoney(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  return `$${v.toFixed(2)}`;
}

function itemsSummary(items) {
  if (!Array.isArray(items) || items.length === 0) return 'No items';
  return items
    .map((it) => {
      const qty = it.quantity || it.qty || 1;
      const name = it.name || it.item_name || 'Item';
      return `${qty}× ${name}`;
    })
    .join(', ');
}

function Stars({ rating, color }) {
  return (
    <View style={styles.starsRow}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Ionicons
          key={n}
          name={n <= rating ? 'star' : 'star-outline'}
          size={16}
          color={n <= rating ? color : '#ccc'}
        />
      ))}
    </View>
  );
}

function FilterChip({ label, active, onPress, colors, trailing }) {
  return (
    <TouchableOpacity
      style={[
        styles.chip,
        {
          backgroundColor: active ? colors.brand : colors.backgroundSunken,
          borderColor: active ? colors.brand : colors.border,
        },
      ]}
      onPress={onPress}
    >
      <Text style={[styles.chipText, { color: active ? '#fff' : colors.textSecondary }]}>
        {label}
      </Text>
      {trailing}
    </TouchableOpacity>
  );
}

export default function ReviewsScreen() {
  const { theme } = useTheme();
  const { restaurant } = useRestaurantContext();
  const c = theme.colors;

  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const [sortBy, setSortBy] = useState('created_at');
  const [sortAsc, setSortAsc] = useState(false);
  const [ratingFilter, setRatingFilter] = useState(null);
  const [typeFilter, setTypeFilter] = useState(null);

  const load = useCallback(async () => {
    if (!restaurant?.id) return;
    setError(null);
    try {
      const data = await listOrderReviews(restaurant.id, {
        sortBy,
        sortAsc,
        rating: ratingFilter,
        orderType: typeFilter,
      });
      setReviews(data);
    } catch (e) {
      setError(e.message || 'Could not load reviews.');
      setReviews([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [restaurant?.id, sortBy, sortAsc, ratingFilter, typeFilter]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const toggleSort = (key) => {
    if (sortBy === key) {
      setSortAsc((v) => !v);
    } else {
      setSortBy(key);
      setSortAsc(key === 'order_type' ? true : false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <View style={[styles.filterBar, { backgroundColor: c.backgroundCard, borderBottomColor: c.border }]}>
        {SORT_OPTIONS.map((opt) => {
          const active = sortBy === opt.key;
          return (
            <FilterChip
              key={opt.key}
              label={`Sort: ${opt.label}`}
              active={active}
              onPress={() => toggleSort(opt.key)}
              colors={c}
              trailing={
                active ? (
                  <Ionicons name={sortAsc ? 'arrow-up' : 'arrow-down'} size={12} color="#fff" />
                ) : null
              }
            />
          );
        })}
        {RATING_FILTERS.map((opt) => (
          <FilterChip
            key={`rating-${String(opt.key)}`}
            label={opt.key == null ? 'All ratings' : opt.label}
            active={ratingFilter === opt.key}
            onPress={() => setRatingFilter(opt.key)}
            colors={c}
          />
        ))}
        {TYPE_FILTERS.map((opt) => (
          <FilterChip
            key={`type-${String(opt.key)}`}
            label={opt.label}
            active={typeFilter === opt.key}
            onPress={() => setTypeFilter(opt.key)}
            colors={c}
          />
        ))}
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={c.brand} />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={{ color: c.error || '#c00', textAlign: 'center', paddingHorizontal: 24 }}>{error}</Text>
          <TouchableOpacity onPress={load} style={{ marginTop: 12 }}>
            <Text style={{ color: c.brand, fontWeight: '600' }}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.brand} />}
        >
          {reviews.length === 0 ? (
            <AdminEmptyState
              icon="★"
              title="No reviews yet"
              subtitle="When customers leave feedback from their review email link, it will show up here."
            />
          ) : (
            reviews.map((review) => {
              const order = review.orders || {};
              const method = order.order_type === 'delivery' ? 'Delivery' : 'Pickup';
              return (
                <View
                  key={review.id}
                  style={[styles.card, { backgroundColor: c.backgroundCard, borderColor: c.border }]}
                >
                  <View style={styles.cardHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.customer, { color: c.textPrimary }]}>
                        {review.customer_name || order.customer_name || 'Customer'}
                      </Text>
                      <Text style={[styles.meta, { color: c.textSecondary }]}>
                        {formatDateTime(review.created_at)}
                        {order.order_number ? ` · #${order.order_number}` : ''}
                      </Text>
                    </View>
                    <View style={styles.headerRight}>
                      <Stars rating={review.rating} color={c.brand} />
                      <View
                        style={[
                          styles.typeBadge,
                          {
                            backgroundColor: order.order_type === 'delivery' ? '#E8F1FF' : '#EEF7EE',
                            borderColor: order.order_type === 'delivery' ? '#B8D4FF' : '#C3E6CB',
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.typeBadgeText,
                            { color: order.order_type === 'delivery' ? '#004085' : '#155724' },
                          ]}
                        >
                          {method}
                        </Text>
                      </View>
                    </View>
                  </View>

                  {review.comment ? (
                    <Text style={[styles.comment, { color: c.textPrimary }]}>{review.comment}</Text>
                  ) : (
                    <Text style={[styles.commentMuted, { color: c.textDisabled }]}>No comment</Text>
                  )}

                  <View style={[styles.orderBox, { backgroundColor: c.backgroundSunken, borderColor: c.border }]}>
                    <Text style={[styles.orderLabel, { color: c.textSecondary }]}>Order</Text>
                    <Text style={[styles.orderItems, { color: c.textPrimary }]} numberOfLines={3}>
                      {itemsSummary(order.items)}
                    </Text>
                    <Text style={[styles.orderTotal, { color: c.textSecondary }]}>
                      Total {formatMoney(order.total)}
                    </Text>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  filterBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipText: { fontSize: 12, fontWeight: '600' },
  list: { padding: 12, paddingBottom: 48, gap: 10 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: { borderWidth: 1, borderRadius: 10, padding: 14 },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  customer: { fontSize: 15, fontWeight: '700' },
  meta: { fontSize: 12, marginTop: 2 },
  headerRight: { alignItems: 'flex-end', gap: 6 },
  starsRow: { flexDirection: 'row', gap: 2 },
  typeBadge: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  typeBadgeText: { fontSize: 11, fontWeight: '700' },
  comment: { fontSize: 14, lineHeight: 20, marginTop: 10 },
  commentMuted: { fontSize: 13, fontStyle: 'italic', marginTop: 10 },
  orderBox: {
    marginTop: 12,
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
  },
  orderLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: 4,
  },
  orderItems: { fontSize: 13, lineHeight: 18 },
  orderTotal: { fontSize: 12, marginTop: 6, fontWeight: '600' },
});
