/**
 * Customer review form — opened from email link /review?token=…
 * Loads order summary and submits rating/comment via submit-order-review edge function.
 */
import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme';
import { useRestaurantContext } from '../../context/RestaurantContext';
import { loadReviewByToken, submitOrderReview } from '../../services/reviewService';

function formatMoney(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  return `$${v.toFixed(2)}`;
}

function formatDate(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function resolveToken(route) {
  const fromParams = route?.params?.token;
  if (fromParams) return String(fromParams);
  if (typeof window !== 'undefined' && window.location?.search) {
    return new URLSearchParams(window.location.search).get('token') || '';
  }
  return '';
}

export default function ReviewScreen({ route, navigation }) {
  const { theme } = useTheme();
  const { restaurant } = useRestaurantContext();
  const c = theme.colors;

  const token = resolveToken(route);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [order, setOrder] = useState(null);
  const [alreadyReviewed, setAlreadyReviewed] = useState(false);
  const [success, setSuccess] = useState(false);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');

  const load = useCallback(async () => {
    if (!token) {
      setError('This review link is missing a token. Open the link from your email.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await loadReviewByToken(token);
      if (data?.alreadyReviewed || data?.already_reviewed) {
        setAlreadyReviewed(true);
        setOrder(data.order || null);
      } else {
        setOrder(data?.order || data || null);
        setAlreadyReviewed(false);
      }
    } catch (e) {
      const payload = e.data;
      if (payload?.alreadyReviewed || payload?.already_reviewed) {
        setAlreadyReviewed(true);
        setOrder(payload.order || null);
      } else {
        setError(e.message || 'Could not load this review link.');
      }
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSubmit = async () => {
    if (!rating) {
      setError('Please select a star rating.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const data = await submitOrderReview({ token, rating, comment });
      if (data?.alreadyReviewed || data?.already_reviewed) {
        setAlreadyReviewed(true);
      } else {
        setSuccess(true);
      }
    } catch (e) {
      const payload = e.data;
      if (payload?.alreadyReviewed || payload?.already_reviewed) {
        setAlreadyReviewed(true);
      } else {
        setError(e.message || 'Could not submit your review.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const items = order?.items || order?.items_summary || [];
  const itemsList = Array.isArray(items)
    ? items
    : typeof items === 'string'
      ? [{ name: items }]
      : [];

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: c.background }]}>
        <ActivityIndicator size="large" color={c.brand} />
      </View>
    );
  }

  if (success || alreadyReviewed) {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: c.background }}
        contentContainerStyle={styles.centeredContent}
      >
        <View style={[styles.iconCircle, { backgroundColor: c.brand }]}>
          <Ionicons name="checkmark" size={36} color="#fff" />
        </View>
        <Text style={[styles.title, { color: c.textPrimary }]}>
          {alreadyReviewed ? 'Already reviewed' : 'Thank you!'}
        </Text>
        <Text style={[styles.subtitle, { color: c.textSecondary }]}>
          {alreadyReviewed
            ? 'This order already has a review on file.'
            : `Thanks for sharing your experience${restaurant?.name ? ` with ${restaurant.name}` : ''}.`}
        </Text>
        <TouchableOpacity
          style={[styles.secondaryBtn, { borderColor: c.border }]}
          onPress={() => navigation?.navigate?.('Menu') || navigation?.navigate?.('Home')}
        >
          <Text style={[styles.secondaryBtnText, { color: c.textPrimary }]}>Back to menu</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.background }}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={[styles.brand, { color: c.brand }]}>{restaurant?.name || 'Leave a review'}</Text>
      <Text style={[styles.title, { color: c.textPrimary }]}>How was your order?</Text>
      <Text style={[styles.subtitle, { color: c.textSecondary }]}>
        Your feedback helps us improve. Rating is required; comments are optional.
      </Text>

      {order ? (
        <View style={[styles.orderCard, { backgroundColor: c.backgroundCard, borderColor: c.border }]}>
          <Text style={[styles.orderLabel, { color: c.textSecondary }]}>Your order</Text>
          {order.order_number ? (
            <Text style={[styles.orderNumber, { color: c.textPrimary }]}>#{order.order_number}</Text>
          ) : null}
          <Text style={[styles.orderMeta, { color: c.textSecondary }]}>
            {[
              order.order_type === 'delivery' ? 'Delivery' : order.order_type === 'pickup' ? 'Pickup' : null,
              formatDate(order.created_at || order.completed_at || order.date),
              order.total != null ? formatMoney(order.total) : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
          {itemsList.length > 0 ? (
            <Text style={[styles.orderItems, { color: c.textPrimary }]} numberOfLines={4}>
              {itemsList
                .map((it) => {
                  if (typeof it === 'string') return it;
                  const qty = it.quantity || it.qty || 1;
                  return `${qty}× ${it.name || it.item_name || 'Item'}`;
                })
                .join(', ')}
            </Text>
          ) : null}
        </View>
      ) : null}

      <View style={styles.starsBlock}>
        <Text style={[styles.fieldLabel, { color: c.textSecondary }]}>Rating</Text>
        <View style={styles.starsRow}>
          {[1, 2, 3, 4, 5].map((n) => (
            <TouchableOpacity key={n} onPress={() => setRating(n)} hitSlop={8} accessibilityLabel={`${n} stars`}>
              <Ionicons
                name={n <= rating ? 'star' : 'star-outline'}
                size={40}
                color={n <= rating ? c.brand : '#ccc'}
              />
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <Text style={[styles.fieldLabel, { color: c.textSecondary }]}>Comment (optional)</Text>
      <TextInput
        style={[
          styles.input,
          { color: c.textPrimary, backgroundColor: c.backgroundCard, borderColor: c.border },
        ]}
        value={comment}
        onChangeText={setComment}
        placeholder="Tell us more about your visit…"
        placeholderTextColor={c.textDisabled}
        multiline
        textAlignVertical="top"
        maxLength={2000}
      />

      {error ? (
        <View style={[styles.errorBox, { backgroundColor: '#F8D7DA', borderColor: '#F5C6CB' }]}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      <TouchableOpacity
        style={[styles.submitBtn, { backgroundColor: c.brand }, (!rating || submitting) && { opacity: 0.6 }]}
        onPress={handleSubmit}
        disabled={!rating || submitting}
      >
        {submitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.submitText}>Submit review</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 20,
    paddingBottom: 48,
    maxWidth: 520,
    width: '100%',
    alignSelf: 'center',
  },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  centeredContent: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  brand: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  title: { fontSize: 26, fontWeight: '800', marginBottom: 8 },
  subtitle: { fontSize: 14, lineHeight: 20, marginBottom: 20 },
  orderCard: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    marginBottom: 20,
  },
  orderLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: 4,
  },
  orderNumber: { fontSize: 16, fontWeight: '700' },
  orderMeta: { fontSize: 12, marginTop: 4 },
  orderItems: { fontSize: 13, lineHeight: 18, marginTop: 8 },
  starsBlock: { marginBottom: 16 },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: 8,
  },
  starsRow: { flexDirection: 'row', gap: 8 },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
    minHeight: 120,
    marginBottom: 16,
  },
  errorBox: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  errorText: { color: '#721C24', fontSize: 13, lineHeight: 18 },
  submitBtn: {
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  submitText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  secondaryBtn: {
    marginTop: 20,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 18,
    paddingVertical: 11,
  },
  secondaryBtnText: { fontWeight: '600', fontSize: 14 },
});
