import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Platform,
  useWindowDimensions,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRestaurantContext } from '../../context/RestaurantContext';
import { useTheme } from '../../theme';
import CustomerNavbar from '../../components/CustomerNavbar';
import { getOrdersByPhone, subscribeToOrder } from '../../services/orderService';

// ─── Status helpers ────────────────────────────────────────────────────────────

const TRACKER_STEPS = [
  { key: 'queued', label: 'In Queue', icon: 'time-outline' },
  { key: 'preparing', label: 'Preparing', icon: 'restaurant-outline' },
  { key: 'completed', label: 'Completed', icon: 'checkmark-circle-outline' },
];

function getTrackerStep(dbStatus) {
  switch (dbStatus) {
    case 'pending':
    case 'accepted':
      return 0;
    case 'preparing':
    case 'ready':
      return 1;
    case 'completed':
      return 2;
    default:
      return 0;
  }
}

function formatEta(createdAt) {
  const ETA_MINUTES = 25;
  const eta = new Date(new Date(createdAt).getTime() + ETA_MINUTES * 60 * 1000);
  return eta.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatCurrency(amount) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function ProgressBar({ stepIndex, brandColor }) {
  const totalSteps = TRACKER_STEPS.length;
  const progressAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const target = stepIndex / (totalSteps - 1);
    Animated.timing(progressAnim, {
      toValue: target,
      duration: 600,
      useNativeDriver: false,
    }).start();
  }, [stepIndex, totalSteps, progressAnim]);

  const widthInterpolated = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={styles.progressContainer}>
      {/* Track */}
      <View style={styles.progressTrack}>
        <Animated.View
          style={[styles.progressFill, { width: widthInterpolated, backgroundColor: brandColor }]}
        />
      </View>

      {/* Step dots */}
      <View style={styles.stepsRow}>
        {TRACKER_STEPS.map((step, i) => {
          const done = i <= stepIndex;
          return (
            <View key={step.key} style={styles.stepItem}>
              <View
                style={[
                  styles.stepDot,
                  done
                    ? { backgroundColor: brandColor, borderColor: brandColor }
                    : styles.stepDotInactive,
                ]}
              >
                {done ? (
                  <Ionicons name={step.icon} size={16} color="#fff" />
                ) : (
                  <View style={styles.stepDotEmpty} />
                )}
              </View>
              <Text style={[styles.stepLabel, done && { color: brandColor, fontWeight: '700' }]}>
                {step.label}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function OrderCard({ order, brandColor, onReset }) {
  const [liveOrder, setLiveOrder] = useState(order);
  const stepIndex = getTrackerStep(liveOrder.status);
  const isCancelled = liveOrder.status === 'cancelled';
  const isCompleted = liveOrder.status === 'completed' || liveOrder.status === 'ready';

  useEffect(() => {
    setLiveOrder(order);
  }, [order]);

  useEffect(() => {
    const unsub = subscribeToOrder(liveOrder.id, (updated) => {
      setLiveOrder((prev) => ({ ...prev, ...updated }));
    });
    return unsub;
  }, [liveOrder.id]);

  const etaText = isCompleted
    ? 'Your order is ready for pickup!'
    : `Estimated ready by ${formatEta(liveOrder.created_at)}`;

  return (
    <View style={styles.card}>
      {/* Header */}
      <View style={styles.cardHeader}>
        <View>
          <Text style={styles.orderNumberLabel}>Order</Text>
          <Text style={styles.orderNumber}>
            #{liveOrder.order_number || liveOrder.id.slice(0, 8).toUpperCase()}
          </Text>
        </View>
        <View style={[styles.statusBadge, isCancelled && styles.statusBadgeCancelled, { borderColor: isCancelled ? '#ef4444' : brandColor }]}>
          <Text style={[styles.statusBadgeText, { color: isCancelled ? '#ef4444' : brandColor }]}>
            {isCancelled ? 'Cancelled' : TRACKER_STEPS[stepIndex].label}
          </Text>
        </View>
      </View>

      <Text style={styles.customerGreeting}>Hi, {liveOrder.customer_name}!</Text>

      {isCancelled ? (
        <View style={styles.cancelledBox}>
          <Ionicons name="close-circle-outline" size={36} color="#ef4444" style={{ marginBottom: 8 }} />
          <Text style={styles.cancelledText}>
            This order has been cancelled. Please contact us if you have questions.
          </Text>
        </View>
      ) : (
        <>
          <ProgressBar stepIndex={stepIndex} brandColor={brandColor} />

          <View style={[styles.etaBox, { backgroundColor: isCompleted ? '#f0fdf4' : '#f8faff', borderColor: isCompleted ? '#86efac' : '#dbeafe' }]}>
            <Ionicons
              name={isCompleted ? 'checkmark-circle' : 'time'}
              size={20}
              color={isCompleted ? '#16a34a' : brandColor}
              style={{ marginRight: 8 }}
            />
            <Text style={[styles.etaText, { color: isCompleted ? '#15803d' : '#1e40af' }]}>
              {etaText}
            </Text>
          </View>
        </>
      )}

      {/* Items summary */}
      <View style={styles.itemsList}>
        <Text style={styles.itemsTitle}>Order Summary</Text>
        {(liveOrder.items || []).map((item, idx) => (
          <View key={idx} style={styles.itemRow}>
            <Text style={styles.itemQty}>{item.quantity}x</Text>
            <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
            <Text style={styles.itemPrice}>{formatCurrency(item.price * item.quantity)}</Text>
          </View>
        ))}
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalAmount}>{formatCurrency(liveOrder.total)}</Text>
        </View>
      </View>

      <TouchableOpacity style={styles.resetBtn} onPress={onReset} activeOpacity={0.7}>
        <Ionicons name="search-outline" size={15} color="#6b7280" style={{ marginRight: 6 }} />
        <Text style={styles.resetBtnText}>Track a different order</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Phone lookup form ─────────────────────────────────────────────────────────

function PhoneLookupForm({ onFound, brandColor }) {
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { restaurant } = useRestaurantContext();

  const handleSubmit = useCallback(async () => {
    const trimmed = phone.trim();
    if (!trimmed) {
      setError('Please enter your phone number.');
      return;
    }
    if (!restaurant?.id) {
      setError('Restaurant not found. Please try again.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const orders = await getOrdersByPhone(restaurant.id, trimmed);
      if (!orders || orders.length === 0) {
        setError('No recent orders found for this phone number. Make sure you enter the number used at checkout.');
      } else {
        onFound(orders[0]);
      }
    } catch (err) {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [phone, restaurant, onFound]);

  return (
    <View style={styles.formCard}>
      <View style={[styles.formIconWrap, { backgroundColor: brandColor + '18' }]}>
        <Ionicons name="location-outline" size={32} color={brandColor} />
      </View>
      <Text style={styles.formTitle}>Track Your Order</Text>
      <Text style={styles.formSubtitle}>
        Enter the phone number you used when placing your order to see its current status.
      </Text>

      <Text style={styles.inputLabel}>Phone Number</Text>
      <TextInput
        style={[styles.input, error ? styles.inputError : null]}
        value={phone}
        onChangeText={(v) => { setPhone(v); setError(''); }}
        placeholder="e.g. (555) 123-4567"
        placeholderTextColor="#9ca3af"
        keyboardType="phone-pad"
        autoComplete="tel"
        returnKeyType="search"
        onSubmitEditing={handleSubmit}
        editable={!loading}
      />

      {!!error && (
        <View style={styles.errorBox}>
          <Ionicons name="alert-circle-outline" size={15} color="#ef4444" style={{ marginRight: 6 }} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <TouchableOpacity
        style={[styles.submitBtn, { backgroundColor: brandColor }, loading && styles.submitBtnDisabled]}
        onPress={handleSubmit}
        activeOpacity={0.85}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <>
            <Ionicons name="search" size={16} color="#fff" style={{ marginRight: 8 }} />
            <Text style={styles.submitBtnText}>Track My Order</Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );
}

// ─── Main screen ───────────────────────────────────────────────────────────────

export default function TrackerScreen({ navigation }) {
  const { theme } = useTheme();
  const { width } = useWindowDimensions();
  const brandColor = theme.colors.brand;
  const isWide = width >= 768;

  const [foundOrder, setFoundOrder] = useState(null);

  return (
    <View style={styles.root}>
      <CustomerNavbar navigation={navigation} currentRoute="OrderTracker" />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, isWide && styles.scrollContentWide]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.pageHeader, { backgroundColor: brandColor }]}>
          <Ionicons name="navigate-circle-outline" size={36} color="#fff" style={{ marginBottom: 10 }} />
          <Text style={styles.pageTitle}>Order Tracker</Text>
          <Text style={styles.pageSubtitle}>Real-time updates on your order status</Text>
        </View>

        <View style={styles.contentWrap}>
          {foundOrder ? (
            <OrderCard
              order={foundOrder}
              brandColor={brandColor}
              onReset={() => setFoundOrder(null)}
            />
          ) : (
            <PhoneLookupForm onFound={setFoundOrder} brandColor={brandColor} />
          )}
        </View>
      </ScrollView>
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 48,
  },
  scrollContentWide: {},

  // Page header banner
  pageHeader: {
    paddingVertical: 36,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 6,
  },
  pageSubtitle: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.85)',
    textAlign: 'center',
  },

  contentWrap: {
    maxWidth: 560,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingTop: 28,
  },

  // ── Phone lookup form card
  formCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 28,
    ...Platform.select({
      web: { boxShadow: '0 4px 24px rgba(0,0,0,0.08)' },
      ios: { shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
      android: { elevation: 4 },
    }),
  },
  formIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 16,
  },
  formTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111',
    textAlign: 'center',
    marginBottom: 8,
  },
  formSubtitle: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 6,
  },
  input: {
    height: 48,
    borderWidth: 1.5,
    borderColor: '#d1d5db',
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 15,
    color: '#111',
    backgroundColor: '#fafafa',
    marginBottom: 12,
    ...Platform.select({ web: { outlineStyle: 'none' } }),
  },
  inputError: {
    borderColor: '#ef4444',
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef2f2',
    borderRadius: 8,
    padding: 10,
    marginBottom: 14,
  },
  errorText: {
    fontSize: 13,
    color: '#ef4444',
    flex: 1,
    lineHeight: 18,
  },
  submitBtn: {
    height: 50,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    marginTop: 4,
  },
  submitBtnDisabled: {
    opacity: 0.6,
  },
  submitBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },

  // ── Order card
  card: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    ...Platform.select({
      web: { boxShadow: '0 4px 24px rgba(0,0,0,0.08)' },
      ios: { shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
      android: { elevation: 4 },
    }),
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  orderNumberLabel: {
    fontSize: 12,
    color: '#9ca3af',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  orderNumber: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111',
    marginTop: 2,
  },
  statusBadge: {
    borderWidth: 1.5,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  statusBadgeCancelled: {
    borderColor: '#ef4444',
  },
  statusBadgeText: {
    fontSize: 13,
    fontWeight: '700',
  },
  customerGreeting: {
    fontSize: 16,
    color: '#374151',
    marginBottom: 20,
    fontWeight: '500',
  },

  // ── Progress bar
  progressContainer: {
    marginBottom: 20,
  },
  progressTrack: {
    height: 6,
    backgroundColor: '#e5e7eb',
    borderRadius: 3,
    marginBottom: 0,
    marginHorizontal: 20,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  stepsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: -12,
  },
  stepItem: {
    alignItems: 'center',
    width: 80,
  },
  stepDot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    backgroundColor: '#fff',
    marginBottom: 6,
  },
  stepDotInactive: {
    borderColor: '#d1d5db',
    backgroundColor: '#f9fafb',
  },
  stepDotEmpty: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#d1d5db',
  },
  stepLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#9ca3af',
    textAlign: 'center',
  },

  // ── ETA box
  etaBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 20,
  },
  etaText: {
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },

  // ── Cancelled state
  cancelledBox: {
    alignItems: 'center',
    paddingVertical: 20,
    marginBottom: 16,
  },
  cancelledText: {
    fontSize: 14,
    color: '#ef4444',
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 320,
  },

  // ── Items list
  itemsList: {
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
    paddingTop: 16,
    marginBottom: 16,
  },
  itemsTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#374151',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  itemQty: {
    fontSize: 13,
    fontWeight: '700',
    color: '#6b7280',
    width: 28,
  },
  itemName: {
    fontSize: 14,
    color: '#111',
    flex: 1,
  },
  itemPrice: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
    paddingTop: 10,
    marginTop: 4,
  },
  totalLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111',
  },
  totalAmount: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111',
  },

  // ── Reset button
  resetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  resetBtnText: {
    fontSize: 13,
    color: '#6b7280',
    fontWeight: '600',
  },
});
