/**
 * CateringScreen — catering menu with an order-page layout:
 *   - Slim location meta row (shared CustomerNavbar provides brand/sign-in)
 *   - "Catering Menu" tab bar
 *   - Left: menu items in a two-column grid
 *   - Right: "Your Order" panel (pickup location, scheduled time, cart items)
 *
 * Catering is pickup only and must be scheduled at least 2 days ahead in
 * 15-minute slots within the restaurant's hours of operation.
 * Always renders in light theme (dark theme is admin-only).
 */
import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Linking,
  useWindowDimensions,
} from 'react-native';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { Ionicons } from '@expo/vector-icons';
import { useRestaurantContext } from '../../context/RestaurantContext';
import { useMenu } from '../../hooks/useMenu';
import { useCartContext } from '../../context/CartContext';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../theme';
import MenuItemModal from '../../components/MenuItemModal';
import MenuItem from '../../components/MenuItem';
import { QuantityStepper } from '../../components/motion';
import OrderSummary from '../../components/OrderSummary';
import PromoCodeInput from '../../components/PromoCodeInput';
import PickupLocationPicker, {
  isPickupLocationReady,
  resolvePickupLocation,
} from '../../components/PickupLocationPicker';
import BottomSheet, { useMobileBottomSheet } from '../../components/BottomSheet';
import { createPaymentIntent, getPaymentMethodSummary, getOrCreateIdempotencyKey, writeCheckoutAttempt, readCheckoutAttempt, clearCheckoutAttempt, isConnectOnboardingError, retrievePaymentIntent, getPaymentReturnUrl, serializeCheckoutItems, loadStripeForCheckout } from '../../services/stripeApi';
import { createOrder, getBookedCateringSlots } from '../../services/orderService';
import { awardPoints } from '../../services/rewardsService';
import { syncMarketingContact } from '../../services/emailApi';
import { applyPromoToTotals } from '../../services/promoService';
import { resolveTaxRate } from '../../config/constants';
import CustomerSignInModal from '../../components/CustomerSignInModal';
import {
  listPickupOptions,
  toPersistablePickupLocationId,
} from '../../services/locationsService';
import {
  extractPaymentDetailsFromIntent,
  mergeOrderItemImages,
  saveConfirmationPayload,
} from '../../utils/confirmationPayload';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
import {
  getEarliestCateringDate,
  getSlotTimesForDate,
  getClosedUntilLabel,
  formatDateLabel,
  formatDateTo12,
  DAY_KEYS,
  resolveHours,
} from '../../utils/hoursUtils';

const DESKTOP_BP = 1024;
const DAYS_AHEAD = 2;
const SLOT_INTERVAL = 15;
const CALENDAR_SPAN_DAYS = 14; // ~2 weeks of selectable calendar days
const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Build calendar cells for ~2 weeks from earliest catering date (closed/out-of-range disabled). */
function buildCalendarCells(hours_of_operation) {
  const earliest = getEarliestCateringDate(hours_of_operation, DAYS_AHEAD);
  const hours = resolveHours(hours_of_operation);
  const rangeEnd = new Date(earliest);
  rangeEnd.setDate(rangeEnd.getDate() + CALENDAR_SPAN_DAYS - 1);
  rangeEnd.setHours(23, 59, 59, 999);

  const gridStart = new Date(earliest);
  gridStart.setHours(0, 0, 0, 0);
  gridStart.setDate(gridStart.getDate() - gridStart.getDay());

  const gridEnd = new Date(rangeEnd);
  gridEnd.setHours(0, 0, 0, 0);
  gridEnd.setDate(gridEnd.getDate() + (6 - gridEnd.getDay()));

  const cells = [];
  const cursor = new Date(gridStart);
  while (cursor <= gridEnd) {
    const day = new Date(cursor);
    day.setHours(0, 0, 0, 0);
    const key = DAY_KEYS[day.getDay()];
    const beforeEarliest = day < earliest;
    const afterRange = day > rangeEnd;
    const closed = !hours[key] || hours[key].closed;
    cells.push({
      date: day,
      selectable: !beforeEarliest && !afterRange && !closed,
      outside: beforeEarliest || afterRange,
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  return { cells, earliest, rangeEnd };
}

// ─── Schedule picker modal ────────────────────────────────────────────────────
function ScheduleModal({ visible, onClose, restaurant, brandColor, selectedSlot, onSelect }) {
  const mobileSheet = useMobileBottomSheet();
  const { cells } = useMemo(
    () => buildCalendarCells(restaurant?.hours_of_operation),
    [restaurant?.hours_of_operation],
  );

  const [step, setStep] = useState('date'); // 'date' | 'time'
  const [date, setDate] = useState(null);
  const [bookedMs, setBookedMs] = useState(() => new Set());
  const [loadingSlots, setLoadingSlots] = useState(false);

  useEffect(() => {
    if (!visible) return;
    if (selectedSlot) {
      const d = new Date(selectedSlot);
      d.setHours(0, 0, 0, 0);
      setDate(d);
      setStep('time');
    } else {
      setDate(null);
      setStep('date');
    }
    setBookedMs(new Set());
  }, [visible, selectedSlot]);

  useEffect(() => {
    if (!visible || step !== 'time' || !date || !restaurant?.id) return;
    let cancelled = false;
    (async () => {
      setLoadingSlots(true);
      try {
        const dayStart = new Date(date);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(date);
        dayEnd.setHours(23, 59, 59, 999);
        const booked = await getBookedCateringSlots(
          restaurant.id,
          dayStart.toISOString(),
          dayEnd.toISOString(),
        );
        if (!cancelled) {
          setBookedMs(new Set(booked.map((t) => new Date(t).getTime())));
        }
      } catch {
        if (!cancelled) setBookedMs(new Set());
      } finally {
        if (!cancelled) setLoadingSlots(false);
      }
    })();
    return () => { cancelled = true; };
  }, [visible, step, date, restaurant?.id]);

  const slots = useMemo(
    () => (date ? getSlotTimesForDate(date, restaurant?.hours_of_operation, SLOT_INTERVAL) : []),
    [date, restaurant?.hours_of_operation],
  );

  const availableSlots = useMemo(
    () => slots.filter((slot) => !bookedMs.has(slot.getTime())),
    [slots, bookedMs],
  );

  const handlePickDate = (d) => {
    setDate(d);
    setStep('time');
  };

  const monthLabel = useMemo(() => {
    const ref = date || cells.find((c) => c.selectable)?.date || new Date();
    return ref.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }, [date, cells]);

  const inner = (
    <>
          <View style={sm.headerRow}>
            <Text style={sm.title}>Schedule pickup</Text>
            <TouchableOpacity onPress={onClose} style={sm.closeBtn}>
              <Ionicons name="close" size={22} color="#333" />
            </TouchableOpacity>
          </View>
          <Text style={sm.note}>
            Catering pickups must be scheduled at least {DAYS_AHEAD} days in advance.
          </Text>

          {step === 'date' ? (
            <>
              <Text style={sm.label}>Select a date</Text>
              <Text style={sm.monthLabel}>{monthLabel}</Text>
              <View style={sm.weekdayRow}>
                {WEEKDAY_LABELS.map((w) => (
                  <Text key={w} style={sm.weekday}>{w}</Text>
                ))}
              </View>
              <View style={sm.calGrid}>
                {cells.map((cell, i) => {
                  const selected = date?.toDateString() === cell.date.toDateString();
                  return (
                    <TouchableOpacity
                      key={i}
                      style={[
                        sm.calCell,
                        cell.outside && sm.calCellOutside,
                        !cell.selectable && sm.calCellDisabled,
                        selected && { backgroundColor: brandColor, borderColor: brandColor },
                      ]}
                      disabled={!cell.selectable}
                      onPress={() => handlePickDate(cell.date)}
                      activeOpacity={0.75}
                    >
                      <Text
                        style={[
                          sm.calDayText,
                          cell.outside && sm.calDayOutside,
                          !cell.selectable && sm.calDayDisabled,
                          selected && { color: '#fff' },
                        ]}
                      >
                        {cell.date.getDate()}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          ) : (
            <>
              <TouchableOpacity style={sm.backRow} onPress={() => setStep('date')} activeOpacity={0.7}>
                <Ionicons name="chevron-back" size={18} color="#555" />
                <Text style={sm.backText}>
                  {date ? formatDateLabel(date) : 'Change date'}
                </Text>
              </TouchableOpacity>

              <Text style={sm.label}>Available times</Text>
              {loadingSlots ? (
                <ActivityIndicator color={brandColor} style={{ marginVertical: 24 }} />
              ) : availableSlots.length === 0 ? (
                <Text style={sm.emptySlots}>No available times for this date. Pick another day.</Text>
              ) : (
                <ScrollView style={{ maxHeight: 260 }}>
                  <View style={sm.slotGrid}>
                    {availableSlots.map((slot, i) => {
                      const selected = selectedSlot?.getTime?.() === slot.getTime();
                      return (
                        <TouchableOpacity
                          key={i}
                          style={[sm.slotChip, selected && { backgroundColor: brandColor, borderColor: brandColor }]}
                          onPress={() => { onSelect(slot); onClose(); }}
                        >
                          <Text style={[sm.chipText, selected && { color: '#fff' }]}>{formatDateTo12(slot)}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </ScrollView>
              )}
            </>
          )}
    </>
  );

  if (mobileSheet) {
    return (
      <BottomSheet visible={visible} onClose={onClose}>
        <View style={sm.sheetInSheet}>{inner}</View>
      </BottomSheet>
    );
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={sm.backdrop}>
        <View style={sm.sheet}>{inner}</View>
      </View>
    </Modal>
  );
}

const sm = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  sheet: { backgroundColor: '#fff', borderRadius: 14, padding: 20, width: '100%', maxWidth: 460 },
  sheetInSheet: { backgroundColor: '#fff', padding: 20, paddingTop: 8, width: '100%' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 17, fontWeight: '800', color: '#111' },
  closeBtn: { padding: 4 },
  note: { fontSize: 12, color: '#777', marginTop: 4, marginBottom: 10, lineHeight: 17 },
  label: { fontSize: 12, fontWeight: '700', color: '#555', textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 12, marginBottom: 8 },
  monthLabel: { fontSize: 14, fontWeight: '700', color: '#111', marginBottom: 10 },
  weekdayRow: { flexDirection: 'row', marginBottom: 6 },
  weekday: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '600', color: '#999' },
  calGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calCell: {
    width: '14.28%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: 'transparent',
    marginBottom: 4,
  },
  calCellOutside: { opacity: 0.35 },
  calCellDisabled: { opacity: 0.4 },
  calDayText: { fontSize: 14, fontWeight: '600', color: '#222' },
  calDayOutside: { color: '#aaa' },
  calDayDisabled: { color: '#bbb', textDecorationLine: 'line-through' },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 4, marginBottom: 4 },
  backText: { fontSize: 14, fontWeight: '600', color: '#555' },
  emptySlots: { fontSize: 13, color: '#888', lineHeight: 18, marginVertical: 16 },
  chipText: { fontSize: 13, fontWeight: '500', color: '#555' },
  slotGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  slotChip: { borderWidth: 1.5, borderColor: '#e3e3e3', borderRadius: 18, paddingHorizontal: 13, paddingVertical: 8, marginBottom: 2 },
});

// ─── Catering checkout form (inside <Elements>) ───────────────────────────────
function CateringCheckoutForm({
  navigation,
  isDesktop,
  brandColor,
  restaurant,
  scheduledSlot,
  pickupLocation,
  onBack,
  contact,
  onEditContact,
  appliedPromo,
  onPromoApplied,
  onPromoCleared,
  pricing,
  notes,
  setNotes,
  paymentReady = true,
  chargeTotal,
  clientSecret,
  piSucceeded = false,
}) {
  const stripe = useStripe();
  const elements = useElements();
  const { cateringItems: items, clearCart } = useCartContext();
  const { user, isCustomerAuthenticated, refreshCustomerProfile } = useAuth();
  const { cartSubtotal, tax, total, discountAmount } = pricing;
  const payTotal = Number.isFinite(Number(chargeTotal)) ? Number(chargeTotal) : total;

  const { name, phone, email, marketingOptIn } = contact;
  const [loading, setLoading] = useState(false);
  const submittingRef = useRef(false);

  const handleSubmit = async () => {
    if (!stripe || !elements) return;
    if (!paymentReady || piSucceeded) return;
    if (submittingRef.current || loading) return;
    submittingRef.current = true;
    setLoading(true);

    try {
      const idempotencyKey = getOrCreateIdempotencyKey(restaurant.id, 'catering');
      await createPaymentIntent({
        restaurantId: restaurant.id,
        items,
        promo: appliedPromo,
        idempotencyKey,
        email,
        customerEmail: email,
        customerName: name,
        customerPhone: phone,
        orderType: 'pickup',
        menuType: 'catering',
        scheduledTime: scheduledSlot ? scheduledSlot.toISOString() : undefined,
        notes: notes || undefined,
        pickupLocationId: toPersistablePickupLocationId(pickupLocation) || undefined,
      });

      let { error: confirmError, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          payment_method_data: { billing_details: { name, phone, email } },
          return_url: getPaymentReturnUrl(),
        },
        redirect: 'if_required',
      });

      if (confirmError?.code === 'payment_intent_unexpected_state' && clientSecret) {
        const retrieved = await stripe.retrievePaymentIntent(clientSecret);
        if (retrieved.paymentIntent?.status === 'succeeded') {
          confirmError = undefined;
          paymentIntent = retrieved.paymentIntent;
        }
      }

      if (confirmError) {
        Alert.alert(
          'Payment Failed',
          confirmError.message,
        );
        return;
      }

      const order = await createOrder({
        restaurantId: restaurant.id,
        paymentIntentId: paymentIntent?.id,
        clientSecret: paymentIntent?.client_secret || clientSecret,
      });

      let pointsEarned = 0;
      if (isCustomerAuthenticated && user?.id && restaurant?.id) {
        const awarded = await awardPoints({
          restaurantId: restaurant.id,
          authUserId: user.id,
          orderTotal: total,
          pointsPerDollar: restaurant.points_per_dollar ?? 1,
        });
        pointsEarned = awarded?.pointsEarned || 0;
        await refreshCustomerProfile(restaurant.id);
      }

      if (marketingOptIn && email) {
        syncMarketingContact({
          restaurantId: restaurant.id,
          email,
          fullName: name,
          phone,
          marketingOptIn: true,
        }).catch(() => {});
      }

      clearCart('catering');
      if (restaurant?.id) clearCheckoutAttempt(restaurant.id, 'catering');
      const paymentFromIntent = extractPaymentDetailsFromIntent(paymentIntent);
      const paymentFromApi = paymentIntent?.id && paymentIntent?.client_secret
        ? await getPaymentMethodSummary(paymentIntent.id, {
            clientSecret: paymentIntent.client_secret,
            restaurantId: restaurant?.id,
          })
        : null;
      const payment = paymentFromApi || paymentFromIntent || { label: 'Card' };

      const confirmationOrder = {
        ...order,
        items: mergeOrderItemImages(order?.items, items),
        pickup_location: pickupLocation
          ? {
              id: toPersistablePickupLocationId(pickupLocation),
              name: pickupLocation.name,
              address: pickupLocation.address,
              is_main: Boolean(pickupLocation.is_main),
            }
          : null,
        payment,
      };
      const confirmationPayload = { order: confirmationOrder, pointsEarned };
      saveConfirmationPayload(confirmationPayload);
      navigation.replace('Confirmation', confirmationPayload);
    } catch (err) {
      if (isConnectOnboardingError(err.message) && restaurant?.id) {
        clearCheckoutAttempt(restaurant.id, 'catering');
      }
      Alert.alert(
        'Error',
        err.message || 'Something went wrong. Please try again.',
      );
    } finally {
      submittingRef.current = false;
      setLoading(false);
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#f6f9fc' }} contentContainerStyle={cf.wrap}>
      <TouchableOpacity style={cf.backBtn} onPress={onBack}>
        <Ionicons name="arrow-back" size={18} color={brandColor} />
        <Text style={[cf.backText, { color: brandColor }]}>Back to menu</Text>
      </TouchableOpacity>

      <View style={[cf.columns, isDesktop && cf.columnsDesktop]}>
        <View style={[cf.summaryPanel, isDesktop && cf.summaryPanelDesktop]}>
          <OrderSummary
            items={items}
            subtotal={cartSubtotal}
            tax={tax}
            total={total}
            discountAmount={discountAmount}
            promoCode={appliedPromo?.code}
            orderType="pickup"
            scheduledTime={scheduledSlot ? scheduledSlot.toISOString() : null}
          />
          {(pickupLocation?.name || pickupLocation?.address) ? (
            <View style={[cf.scheduleBox, { borderColor: brandColor, marginBottom: scheduledSlot ? 8 : 0 }]}>
              <Ionicons name="storefront-outline" size={16} color={brandColor} />
              <View style={{ flex: 1 }}>
                <Text style={[cf.scheduleBoxText, { color: '#333', fontWeight: '700' }]}>
                  Pickup location: {pickupLocation.name || 'Store'}
                </Text>
                {pickupLocation.address ? (
                  <Text style={{ fontSize: 12, color: '#697386', marginTop: 2, lineHeight: 16 }}>
                    {pickupLocation.address}
                  </Text>
                ) : null}
              </View>
            </View>
          ) : null}
          {scheduledSlot && (
            <View style={[cf.scheduleBox, { borderColor: brandColor }]}>
              <Ionicons name="calendar-outline" size={16} color={brandColor} />
              <Text style={[cf.scheduleBoxText, { color: '#333' }]}>
                Pickup {formatDateLabel(scheduledSlot)} at {formatDateTo12(scheduledSlot)}
              </Text>
            </View>
          )}
        </View>

        <View style={[cf.formPanel, isDesktop && cf.formPanelDesktop]}>
          <View style={cf.section}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <Text style={[cf.sectionLabel, { marginBottom: 0 }]}>Contact</Text>
              <TouchableOpacity onPress={onEditContact}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: brandColor }}>Edit</Text>
              </TouchableOpacity>
            </View>
            <Text style={{ fontSize: 15, fontWeight: '600', color: '#0a2540' }}>{name}</Text>
            <Text style={{ fontSize: 14, color: '#697386', marginTop: 4 }}>{phone}</Text>
            <Text style={{ fontSize: 14, color: '#697386', marginTop: 2 }}>{email}</Text>
          </View>

          <View style={cf.divider} />

          <View style={cf.section}>
            <Text style={cf.sectionLabel}>Promo Code</Text>
            <PromoCodeInput
              restaurantId={restaurant?.id}
              items={items}
              appliedPromo={appliedPromo}
              onApplied={onPromoApplied}
              onCleared={onPromoCleared}
              brandColor={brandColor}
            />
          </View>

          <View style={cf.divider} />

          <View style={cf.section}>
            <Text style={cf.sectionLabel}>Special Instructions</Text>
            <TextInput
              style={[cf.input, cf.textArea]}
              value={notes}
              onChangeText={setNotes}
              placeholder="Dietary restrictions, special requests…"
              multiline
              numberOfLines={3}
            />
          </View>

          <View style={cf.divider} />

          <View style={cf.section}>
            <Text style={cf.sectionLabel}>Payment</Text>
            {!paymentReady && !piSucceeded ? (
              <View style={{ paddingVertical: 20, alignItems: 'center', gap: 10 }}>
                <ActivityIndicator color={brandColor} />
                <Text style={{ fontSize: 13, color: '#697386' }}>Updating payment for new total…</Text>
              </View>
            ) : piSucceeded ? (
              <Text style={{ fontSize: 14, color: '#0a2540', lineHeight: 20, marginBottom: 8 }}>
                This payment was already completed. Check confirmation or sign in to track your orders.
              </Text>
            ) : (
              <View style={cf.payWrap}>
                <PaymentElement options={{ layout: 'tabs', paymentMethodOrder: ['apple_pay', 'google_pay', 'card'] }} />
              </View>
            )}
            <Text style={cf.secured}>🔒  Secured by Stripe</Text>
          </View>

          <View style={cf.submitWrap}>
            <TouchableOpacity
              style={[cf.submitBtn, { backgroundColor: brandColor }, (loading || !stripe || !paymentReady || piSucceeded) && { opacity: 0.6 }]}
              onPress={handleSubmit}
              disabled={loading || !stripe || !paymentReady || piSucceeded}
            >
              {loading || !paymentReady
                ? <ActivityIndicator color="#fff" />
                : <Text style={cf.submitText}>Pay ${payTotal.toFixed(2)} · Place Catering Order</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

function CateringContactStep({
  brandColor,
  isDesktop,
  contact,
  setContact,
  onContinue,
  onBack,
  loading,
  error,
  scheduledSlot,
  items,
  pricing,
  restaurantId,
  appliedPromo,
  onPromoApplied,
  onPromoCleared,
  isSignedIn = false,
  onGuestSignIn,
}) {
  const { cartSubtotal, tax, total, discountAmount } = pricing;
  const [errors, setErrors] = useState({});

  const handleContinue = () => {
    const errs = {};
    if (!contact.name.trim()) errs.name = 'Name is required';
    if (!contact.phone.trim()) errs.phone = 'Phone is required';
    if (!contact.email.trim()) errs.email = 'Email is required';
    else if (!EMAIL_RE.test(contact.email.trim())) errs.email = 'Enter a valid email';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    onContinue();
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#f6f9fc' }} contentContainerStyle={cf.wrap}>
      <TouchableOpacity style={cf.backBtn} onPress={onBack}>
        <Ionicons name="arrow-back" size={18} color={brandColor} />
        <Text style={[cf.backText, { color: brandColor }]}>Back to menu</Text>
      </TouchableOpacity>

      <View style={[cf.columns, isDesktop && cf.columnsDesktop]}>
        <View style={[cf.summaryPanel, isDesktop && cf.summaryPanelDesktop]}>
          <OrderSummary
            items={items}
            subtotal={cartSubtotal}
            tax={tax}
            total={total}
            discountAmount={discountAmount}
            promoCode={appliedPromo?.code}
            orderType="pickup"
            scheduledTime={scheduledSlot ? scheduledSlot.toISOString() : null}
          />
        </View>

        <View style={[cf.formPanel, isDesktop && cf.formPanelDesktop]}>
          <View style={cf.section}>
            <Text style={cf.sectionLabel}>Contact</Text>
            <Text style={{ fontSize: 13, color: '#697386', marginBottom: 14, lineHeight: 18 }}>
              Email is required for your receipt and order updates.
              {!isSignedIn ? (
                <>
                  {' '}
                  <Text
                    onPress={onGuestSignIn}
                    style={{ color: brandColor, fontWeight: '600' }}
                  >
                    Sign in
                  </Text>
                  {' '}to track all open orders in one place.
                </>
              ) : null}
            </Text>
            <View style={[isDesktop && cf.twoCol]}>
              <View style={[isDesktop && cf.colHalf]}>
                <Text style={cf.fieldLabel}>Name *</Text>
                <TextInput
                  style={[cf.input, errors.name && cf.inputError]}
                  value={contact.name}
                  onChangeText={(name) => setContact((c) => ({ ...c, name }))}
                  placeholder="Full name"
                  autoCapitalize="words"
                />
                {errors.name ? <Text style={cf.errorText}>{errors.name}</Text> : null}
              </View>
              <View style={[isDesktop && cf.colHalf]}>
                <Text style={cf.fieldLabel}>Phone *</Text>
                <TextInput
                  style={[cf.input, errors.phone && cf.inputError]}
                  value={contact.phone}
                  onChangeText={(phone) => setContact((c) => ({ ...c, phone }))}
                  placeholder="(555) 555-5555"
                  keyboardType="phone-pad"
                />
                {errors.phone ? <Text style={cf.errorText}>{errors.phone}</Text> : null}
              </View>
            </View>
            <Text style={[cf.fieldLabel, { marginTop: 14 }]}>Email *</Text>
            <TextInput
              style={[cf.input, errors.email && cf.inputError]}
              value={contact.email}
              onChangeText={(email) => setContact((c) => ({ ...c, email }))}
              placeholder="you@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
            />
            {errors.email ? <Text style={cf.errorText}>{errors.email}</Text> : null}

            <TouchableOpacity
              style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16 }}
              onPress={() => setContact((c) => ({ ...c, marketingOptIn: !c.marketingOptIn }))}
              activeOpacity={0.7}
            >
              <View style={{
                width: 20, height: 20, borderRadius: 4, borderWidth: 1.5,
                borderColor: contact.marketingOptIn ? brandColor : '#cfd7e3',
                backgroundColor: contact.marketingOptIn ? brandColor : '#fff',
                alignItems: 'center', justifyContent: 'center',
              }}>
                {contact.marketingOptIn ? <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>✓</Text> : null}
              </View>
              <Text style={{ fontSize: 14, color: '#0a2540', flex: 1 }}>Email me deals &amp; updates</Text>
            </TouchableOpacity>
          </View>

          <View style={cf.divider} />

          <View style={cf.section}>
            <Text style={cf.sectionLabel}>Promo Code</Text>
            <PromoCodeInput
              restaurantId={restaurantId}
              items={items}
              appliedPromo={appliedPromo}
              onApplied={onPromoApplied}
              onCleared={onPromoCleared}
              brandColor={brandColor}
            />

            {error ? <Text style={[cf.errorText, { marginTop: 12 }]}>{error}</Text> : null}

            <TouchableOpacity
              style={[cf.submitBtn, { backgroundColor: brandColor, marginTop: 24 }, loading && { opacity: 0.6 }]}
              onPress={handleContinue}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={cf.submitText}>Continue to payment · ${total.toFixed(2)}</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const cf = StyleSheet.create({
  wrap: { paddingBottom: 60 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 16 },
  backText: { fontSize: 14, fontWeight: '600' },
  columns: { flexDirection: 'column' },
  columnsDesktop: { flexDirection: 'row', alignItems: 'flex-start', maxWidth: 1100, width: '100%', alignSelf: 'center', paddingHorizontal: 40, paddingTop: 20, gap: 32 },
  summaryPanel: { backgroundColor: '#f6f9fc', paddingHorizontal: 16, paddingVertical: 8 },
  summaryPanelDesktop: { flex: 4, backgroundColor: 'transparent', paddingHorizontal: 0, paddingVertical: 0 },
  scheduleBox: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1.5, borderRadius: 10, padding: 12, marginTop: 12, backgroundColor: '#fff' },
  scheduleBoxText: { fontSize: 13, fontWeight: '600' },
  formPanel: { backgroundColor: '#fff' },
  formPanelDesktop: { flex: 5, borderRadius: 12, borderWidth: 1, borderColor: '#e3e8ee', overflow: 'hidden' },
  section: { padding: 24 },
  divider: { height: 1, backgroundColor: '#e3e8ee', marginHorizontal: 24 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: '#697386', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 14 },
  fieldLabel: { fontSize: 13, fontWeight: '500', color: '#0a2540', marginBottom: 6 },
  optional: { color: '#697386', fontWeight: '400' },
  input: { borderWidth: 1, borderColor: '#e3e8ee', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: '#0a2540', backgroundColor: '#fff' },
  inputError: { borderColor: '#c0392b' },
  textArea: { height: 80, textAlignVertical: 'top' },
  errorText: { fontSize: 12, color: '#c0392b', marginTop: 4 },
  twoCol: { flexDirection: 'row', gap: 12 },
  colHalf: { flex: 1 },
  payWrap: { borderWidth: 1, borderColor: '#e3e8ee', borderRadius: 8, padding: 16, backgroundColor: '#fff', minHeight: 60 },
  secured: { fontSize: 12, color: '#697386', textAlign: 'center', marginTop: 12 },
  submitWrap: { padding: 24, paddingTop: 8 },
  submitBtn: { borderRadius: 10, paddingVertical: 16, alignItems: 'center' },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '700', letterSpacing: 0.2 },
});

// ─── Menu item card (grid) ────────────────────────────────────────────────────
function ItemCard({ item, onPress }) {
  return (
    <TouchableOpacity style={ic.card} onPress={() => onPress(item)} activeOpacity={0.75}>
      <View style={ic.textCol}>
        <Text style={ic.name} numberOfLines={2}>{item.name}</Text>
        {item.description ? (
          <Text style={ic.desc} numberOfLines={3}>{item.description}</Text>
        ) : null}
        <Text style={ic.price}>${Number(item.price ?? 0).toFixed(2)}</Text>
      </View>
      {item.image_url ? (
        <Image source={{ uri: item.image_url }} style={ic.image} resizeMode="cover" />
      ) : (
        <View style={[ic.image, ic.imagePlaceholder]}>
          <Ionicons name="fast-food-outline" size={26} color="#ccc" />
        </View>
      )}
    </TouchableOpacity>
  );
}

const ic = StyleSheet.create({
  card: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#efefef',
    flex: 1,
  },
  textCol: { flex: 1 },
  name: { fontSize: 15, fontWeight: '700', color: '#111', marginBottom: 4 },
  desc: { fontSize: 12, color: '#888', lineHeight: 17, marginBottom: 8 },
  price: { fontSize: 14, fontWeight: '600', color: '#222', marginTop: 'auto' },
  image: { width: 92, height: 92, borderRadius: 10, backgroundColor: '#f4f4f4' },
  imagePlaceholder: { alignItems: 'center', justifyContent: 'center' },
});

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function CateringScreen({ navigation }) {
  const { restaurant } = useRestaurantContext();
  const { categoriesWithItems, menuByCategory, allItems, loading } = useMenu(restaurant?.id, 'catering');
  const {
    cateringItems: cartItems,
    cateringSubtotal: cartSubtotal,
    addItem,
    removeItem,
    updateQuantity,
    hydrateImages,
  } = useCartContext();
  const { theme } = useTheme();
  const { width } = useWindowDimensions();
  const isDesktop = width >= DESKTOP_BP;
  const { isCustomerAuthenticated, user, customerProfile } = useAuth();

  const brandColor = theme.colors.brand;

  // Backfill image_url on catering cart lines saved before images were stored.
  useEffect(() => {
    if (!allItems?.length || !hydrateImages) return;
    const imageById = {};
    allItems.forEach((item) => {
      if (item?.id && item.image_url) imageById[item.id] = item.image_url;
    });
    if (Object.keys(imageById).length) hydrateImages(imageById);
  }, [allItems, hydrateImages]);

  const [selectedItem, setSelectedItem] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [scheduleVisible, setScheduleVisible] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [locations, setLocations] = useState([]);
  const [selectedLocationId, setSelectedLocationId] = useState(null);
  const [locationError, setLocationError] = useState(null);
  const [phase, setPhase] = useState('menu'); // 'menu' | 'checkout'
  const [clientSecret, setClientSecret] = useState(null);
  const [piError, setPiError] = useState(null);
  const [piLoading, setPiLoading] = useState(false);
  const [appliedPromo, setAppliedPromo] = useState(null);
  const [checkoutNotes, setCheckoutNotes] = useState('');
  const [contact, setContact] = useState({
    name: '',
    phone: '',
    email: '',
    marketingOptIn: false,
  });
  const [chargeAmountCents, setChargeAmountCents] = useState(null);
  const [piSucceeded, setPiSucceeded] = useState(false);
  const [signInVisible, setSignInVisible] = useState(false);
  const cartFingerprintRef = useRef(null);

  useEffect(() => {
    if (!isCustomerAuthenticated || !user) return;
    setContact((c) => ({
      ...c,
      name: c.name
        || [customerProfile?.first_name, customerProfile?.last_name].filter(Boolean).join(' ')
        || '',
      phone: c.phone || customerProfile?.phone || '',
      email: c.email || customerProfile?.email || user.email || '',
    }));
  }, [isCustomerAuthenticated, user, customerProfile]);

  useEffect(() => {
    if (!appliedPromo?.menu_item_id) return;
    const itemTypes = ['free_item', 'bogo', 'buy_x_percent_off', 'buy_x_amount_off'];
    if (!itemTypes.includes(appliedPromo.benefit_type)) return;
    const line = cartItems.find((i) => String(i.id) === String(appliedPromo.menu_item_id));
    if (!line) {
      setAppliedPromo(null);
      return;
    }
    const need = Number(appliedPromo.buy_quantity) || 0;
    if (
      (appliedPromo.benefit_type === 'buy_x_percent_off' || appliedPromo.benefit_type === 'buy_x_amount_off')
      && (Number(line.quantity) || 0) < need
    ) {
      setAppliedPromo(null);
    }
  }, [cartItems, appliedPromo]);

  useEffect(() => {
    if (!modalVisible) setSelectedItem(null);
  }, [modalVisible]);

  useEffect(() => {
    if (!restaurant?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const options = await listPickupOptions(restaurant);
        if (cancelled) return;
        setLocations(options);
        setSelectedLocationId((prev) => {
          if (prev && options.some((r) => r.id === prev)) return prev;
          // Single store: auto-select. Multiple: require an intentional choice.
          if (options.length === 1) return options[0].id;
          return null;
        });
      } catch {
        if (!cancelled) setLocations([]);
      }
    })();
    return () => { cancelled = true; };
  }, [restaurant?.id, restaurant?.name, restaurant?.address]);

  const selectedLocation = useMemo(
    () => resolvePickupLocation(locations, selectedLocationId),
    [locations, selectedLocationId],
  );

  const taxRate = useMemo(
    () => resolveTaxRate(restaurant, selectedLocation),
    [restaurant, selectedLocation],
  );

  const pickupLocationId = toPersistablePickupLocationId(selectedLocation);

  const pricing = useMemo(() => {
    try {
      const result = applyPromoToTotals(cartSubtotal, cartItems, appliedPromo, taxRate);
      return {
        cartSubtotal,
        subtotal: result.discountedSubtotal,
        tax: result.tax,
        total: result.total,
        discountAmount: result.discountAmount,
      };
    } catch {
      const tax = Math.round(cartSubtotal * taxRate * 100) / 100;
      return {
        cartSubtotal,
        subtotal: cartSubtotal,
        tax,
        total: Math.round((cartSubtotal + tax) * 100) / 100,
        discountAmount: 0,
      };
    }
  }, [cartSubtotal, cartItems, appliedPromo, taxRate]);

  const { tax, total } = pricing;
  const chargeTotal = chargeAmountCents != null ? chargeAmountCents / 100 : total;
  const subtotal = cartSubtotal;

  const cartFingerprint = useMemo(
    () => JSON.stringify({
      items: serializeCheckoutItems(cartItems),
      promo: appliedPromo?.id || appliedPromo?.code || null,
      pickupLocationId: pickupLocationId || null,
    }),
    [cartItems, appliedPromo, pickupLocationId],
  );

  const displayAddress = selectedLocation?.address || restaurant?.address || '';
  const displayLocationName = selectedLocation?.name
    || (locations.length === 1 ? locations[0].name : null)
    || restaurant?.name
    || 'Restaurant';

  const hasConnectAccount = Boolean(restaurant?.stripe_account_id);
  const closedLabel = getClosedUntilLabel(restaurant?.hours_of_operation);

  const stripePromise = useMemo(() => {
    const pk = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    if (!pk) return null;
    return loadStripeForCheckout(pk);
  }, []);

  const handleItemPress = useCallback((item) => {
    setSelectedItem(item);
    setModalVisible(true);
  }, []);

  const handleAddToCart = useCallback((item, quantity = 1, specialInstructions = '', menuType = 'catering', selectedModifiers = [], unitPrice) => {
    addItem(item, quantity, specialInstructions, menuType || 'catering', selectedModifiers, unitPrice);
  }, [addItem]);

  const getSuggestedItems = useCallback((forItem) => {
    if (!forItem) return [];
    const results = [];
    for (const cat of categoriesWithItems) {
      const catItems = menuByCategory[cat.id]?.items || [];
      const eligible = catItems.filter((it) => it.id !== forItem.id && it.is_available);
      if (eligible.length) results.push(eligible[0]);
      if (results.length >= 3) break;
    }
    return results;
  }, [categoriesWithItems, menuByCategory]);

  const handleDirections = () => {
    if (!displayAddress) return;
    Linking.openURL(`https://maps.google.com/?q=${encodeURIComponent(displayAddress)}`);
  };

  const handleCall = () => {
    if (restaurant?.phone) Linking.openURL(`tel:${restaurant.phone}`);
  };

  const handleCheckout = () => {
    if (!cartItems.length) { Alert.alert('Empty Cart', 'Add items before checking out.'); return; }
    if (!selectedSlot) {
      setScheduleVisible(true);
      return;
    }
    if (!isPickupLocationReady(locations, selectedLocationId)) {
      setLocationError('Please choose which store location you want to pick up from.');
      Alert.alert(
        'Pickup location required',
        'Please choose which location you would like to pick up from.',
      );
      return;
    }
    setLocationError(null);
    setPhase('checkout');
    setClientSecret(null);
    setPiError(null);
  };

  const ensureCateringPaymentIntent = async () => {
    if (!restaurant?.id || !hasConnectAccount || !cartItems.length) return null;

    const stored = readCheckoutAttempt(restaurant.id, 'catering');
    if (stored?.clientSecret) {
      const pi = await retrievePaymentIntent(stored.clientSecret);
      if (pi?.status === 'succeeded' || pi?.status === 'processing') {
        setClientSecret(stored.clientSecret);
        setPiSucceeded(pi.status === 'succeeded');
        if (pi.amount != null) setChargeAmountCents(pi.amount);
        return stored.clientSecret;
      }
      if (pi && (pi.status === 'canceled' || pi.status === 'cancelled')) {
        clearCheckoutAttempt(restaurant.id, 'catering');
      }
    }

    const email = contact.email.trim() || customerProfile?.email || user?.email || undefined;
    const idempotencyKey = getOrCreateIdempotencyKey(restaurant.id, 'catering');
    const result = await createPaymentIntent({
      restaurantId: restaurant.id,
      items: cartItems,
      promo: appliedPromo,
      idempotencyKey,
      email,
      customerEmail: email,
      customerName: contact.name.trim() || undefined,
      customerPhone: contact.phone.trim() || undefined,
      orderType: 'pickup',
      menuType: 'catering',
      scheduledTime: selectedSlot ? selectedSlot.toISOString() : undefined,
      notes: checkoutNotes || undefined,
      pickupLocationId: pickupLocationId || undefined,
    });
    writeCheckoutAttempt(restaurant.id, {
      idempotencyKey,
      clientSecret: result.clientSecret,
      paymentIntentId: result.paymentIntentId,
    }, 'catering');
    setClientSecret(result.clientSecret);
    setChargeAmountCents(result.amountCents);
    setPiSucceeded(false);
    cartFingerprintRef.current = cartFingerprint;
    return result.clientSecret;
  };

  const handleContinueToPayment = async () => {
    if (!restaurant?.id || !hasConnectAccount || !pricing.total) return;
    setPiLoading(true);
    setPiError(null);
    try {
      await ensureCateringPaymentIntent();
    } catch (e) {
      if (isConnectOnboardingError(e.message) && restaurant?.id) {
        clearCheckoutAttempt(restaurant.id, 'catering');
      }
      setPiError(e.message);
    } finally {
      setPiLoading(false);
    }
  };

  // Refresh PaymentIntent when promo/cart/location changes after payment step starts.
  useEffect(() => {
    if (phase !== 'checkout' || !clientSecret) return;
    if (!restaurant?.id || !hasConnectAccount || !cartItems.length) return;
    if (piSucceeded) return;
    if (cartFingerprintRef.current === cartFingerprint) return;

    let cancelled = false;
    (async () => {
      setPiLoading(true);
      setPiError(null);
      try {
        await ensureCateringPaymentIntent();
      } catch (e) {
        if (!cancelled) {
          if (isConnectOnboardingError(e.message) && restaurant?.id) {
            clearCheckoutAttempt(restaurant.id, 'catering');
          }
          setPiError(e.message);
        }
      } finally {
        if (!cancelled) setPiLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, clientSecret, cartFingerprint, restaurant?.id, hasConnectAccount, piSucceeded]);

  const paymentReady = Boolean(clientSecret && !piLoading && !piSucceeded);

  const handleBack = () => {
    setPhase('menu');
    setClientSecret(null);
    setPiError(null);
    setPiLoading(false);
    setAppliedPromo(null);
    setCheckoutNotes('');
    setPiSucceeded(false);
    cartFingerprintRef.current = null;
  };

  const handleEditContact = () => {
    setClientSecret(null);
    setPiError(null);
  };

  const appearance = {
    theme: 'stripe',
    variables: { colorPrimary: brandColor, fontFamily: 'system-ui, sans-serif', borderRadius: '8px' },
  };

  // ── Checkout phase ─────────────────────────────────────
  if (phase === 'checkout') {
    if (!process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY || !hasConnectAccount) {
      return (
        <View style={s.errorPage}>
          <Text style={s.errorMsg}>Payments are not configured.</Text>
          <TouchableOpacity onPress={handleBack}><Text style={{ color: brandColor, marginTop: 12 }}>← Back</Text></TouchableOpacity>
        </View>
      );
    }
    if (!clientSecret) {
      return (
        <>
          <CateringContactStep
            brandColor={brandColor}
            isDesktop={isDesktop}
            contact={contact}
            setContact={setContact}
            onContinue={handleContinueToPayment}
            onBack={handleBack}
            loading={piLoading}
            error={piError}
            scheduledSlot={selectedSlot}
            items={cartItems}
            pricing={pricing}
            restaurantId={restaurant?.id}
            appliedPromo={appliedPromo}
            onPromoApplied={setAppliedPromo}
            onPromoCleared={() => setAppliedPromo(null)}
            isSignedIn={isCustomerAuthenticated}
            onGuestSignIn={() => setSignInVisible(true)}
          />
          <CustomerSignInModal
            visible={signInVisible}
            onClose={() => setSignInVisible(false)}
          />
        </>
      );
    }
    return (
      <>
      <Elements
        key={clientSecret}
        stripe={stripePromise}
        options={{ clientSecret, appearance }}
      >
        <CateringCheckoutForm
          navigation={navigation}
          isDesktop={isDesktop}
          brandColor={brandColor}
          restaurant={restaurant}
          scheduledSlot={selectedSlot}
          pickupLocation={selectedLocation}
          onBack={handleBack}
          contact={{
            ...contact,
            name: contact.name.trim(),
            phone: contact.phone.trim(),
            email: contact.email.trim(),
          }}
          onEditContact={handleEditContact}
          appliedPromo={appliedPromo}
          onPromoApplied={setAppliedPromo}
          onPromoCleared={() => setAppliedPromo(null)}
          pricing={pricing}
          notes={checkoutNotes}
          setNotes={setCheckoutNotes}
          paymentReady={paymentReady}
          chargeTotal={chargeTotal}
          clientSecret={clientSecret}
          piSucceeded={piSucceeded}
        />
      </Elements>
      <CustomerSignInModal
        visible={signInVisible}
        onClose={() => setSignInVisible(false)}
      />
      </>
    );
  }

  // ── Menu phase ─────────────────────────────────────────
  return (
    <View style={s.root}>
      <ScrollView style={s.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Location meta (navbar handles brand / sign-in) ── */}
        <View style={s.header}>
          <View style={s.metaRow}>
            <View style={s.metaItem}>
              <Ionicons name="storefront-outline" size={14} color={brandColor} />
              <Text style={[s.metaText, { color: brandColor }]}>{displayLocationName}</Text>
            </View>
            {displayAddress ? (
              <TouchableOpacity style={s.metaItem} onPress={handleDirections}>
                <Ionicons name="navigate-outline" size={14} color={brandColor} />
                <Text style={[s.metaText, { color: brandColor }]}>{displayAddress}</Text>
              </TouchableOpacity>
            ) : null}
            {restaurant?.phone ? (
              <TouchableOpacity style={s.metaItem} onPress={handleCall}>
                <Ionicons name="call-outline" size={14} color={brandColor} />
                <Text style={[s.metaText, { color: brandColor }]}>{restaurant.phone}</Text>
              </TouchableOpacity>
            ) : null}
            {closedLabel ? (
              <View style={s.closedBadge}>
                <Text style={s.closedBadgeText}>{closedLabel}</Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* ── Tab bar ─────────────────────────────────── */}
        <View style={s.tabBar}>
          <View style={[s.tabActive, { borderBottomColor: '#111' }]}>
            <Text style={s.tabActiveText}>Catering Menu</Text>
          </View>
        </View>

        {/* ── Body ────────────────────────────────────── */}
        <View style={[s.body, isDesktop && s.bodyDesktop]}>

          {/* Left: menu */}
          <View style={[s.menuCol, isDesktop && s.menuColDesktop]}>
            <Text style={s.menuHeading}>Catering Menu</Text>

            {loading ? (
              <ActivityIndicator color={brandColor} style={{ marginTop: 40 }} />
            ) : categoriesWithItems.length === 0 ? (
              <View style={s.empty}>
                <Ionicons name="restaurant-outline" size={48} color="#ccc" />
                <Text style={s.emptyText}>Catering menu coming soon.</Text>
              </View>
            ) : (
              categoriesWithItems.map((category) => {
                const items = (menuByCategory[category.id]?.items || []);
                return (
                  <View key={category.id} style={s.categoryBlock}>
                    {categoriesWithItems.length > 1 && (
                      <Text style={s.categoryName}>{category.name}</Text>
                    )}
                    <View style={[s.menuGrid, isDesktop && s.menuGridDesktop]}>
                      {items.map((item) => (
                        <View key={item.id} style={[s.menuCell, isDesktop && s.menuCellDesktop]}>
                          <MenuItem
                            item={item}
                            variant="catering"
                            onItemPress={handleItemPress}
                            onAddToCart={handleItemPress}
                          />
                        </View>
                      ))}
                    </View>
                  </View>
                );
              })
            )}
          </View>

          {/* Right: Your Order panel */}
          <View style={[s.orderCol, isDesktop && s.orderColDesktop]}>
            <Text style={s.orderHeading}>Your Order</Text>

            <View style={s.pickupOnlyBadge}>
              <Ionicons name="walk-outline" size={15} color={brandColor} />
              <Text style={[s.pickupOnlyText, { color: brandColor }]}>Pickup only</Text>
            </View>

            {/* Location + time card */}
            <View style={s.infoCard}>
              <PickupLocationPicker
                locations={locations}
                selectedLocationId={selectedLocationId}
                onSelect={(id) => {
                  setSelectedLocationId(id);
                  setLocationError(null);
                }}
                restaurant={restaurant}
                brandColor={brandColor}
                error={locationError}
                compact
                autoOpenWhenUnset={locations.length >= 2 && !selectedLocationId}
              />

              <View style={s.infoDivider} />

              <View style={s.infoRow}>
                <View style={s.infoRowText}>
                  <Text style={s.infoLabel}>Pickup time</Text>
                  <Text style={s.infoValueBold}>
                    {selectedSlot
                      ? `${formatDateLabel(selectedSlot)} at ${formatDateTo12(selectedSlot)}`
                      : 'Schedule for later'}
                  </Text>
                </View>
                <TouchableOpacity style={s.smallBtn} onPress={() => setScheduleVisible(true)}>
                  <Text style={s.smallBtnText}>Change</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Items */}
            <View style={s.itemsCard}>
              <Text style={s.itemsHeading}>Items</Text>
              {cartItems.length === 0 ? (
                <Text style={s.itemsEmpty}>You don't have any items in your cart.</Text>
              ) : (
                <>
                  {cartItems.map((item, i) => (
                    <View key={`${item.id}-${i}`} style={s.cartItemRow}>
                      <View style={s.cartThumbWrap}>
                        {item.image_url ? (
                          <Image
                            source={{ uri: item.image_url }}
                            style={s.cartThumb}
                            resizeMode="cover"
                          />
                        ) : (
                          <View style={[s.cartThumb, s.cartThumbPlaceholder]}>
                            <Ionicons name="restaurant-outline" size={16} color="#c4c4c4" />
                          </View>
                        )}
                      </View>
                      <QuantityStepper
                        variant="compact"
                        value={item.quantity}
                        onDecrease={() => updateQuantity(item.id, item.quantity - 1, item.specialInstructions, 'catering', item.selectedModifiers)}
                        onIncrease={() => updateQuantity(item.id, item.quantity + 1, item.specialInstructions, 'catering', item.selectedModifiers)}
                        decreaseLabel={`Decrease quantity of ${item.name}`}
                        increaseLabel={`Increase quantity of ${item.name}`}
                      />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={s.cartItemName} numberOfLines={2}>{item.name}</Text>
                        {Array.isArray(item.selectedModifiers) && item.selectedModifiers.length > 0 ? (
                          <Text style={s.cartItemMods} numberOfLines={2}>
                            {item.selectedModifiers.map((m) => m.optionName).join(', ')}
                          </Text>
                        ) : null}
                      </View>
                      <Text style={s.cartItemPrice}>${(item.price * item.quantity).toFixed(2)}</Text>
                      <TouchableOpacity
                        onPress={() => removeItem(item.id, item.specialInstructions, 'catering', item.selectedModifiers)}
                        style={{ padding: 8, minWidth: 36, minHeight: 36, alignItems: 'center', justifyContent: 'center' }}
                        accessibilityRole="button"
                        accessibilityLabel={`Remove ${item.name}`}
                      >
                        <Ionicons name="close" size={15} color="#aaa" />
                      </TouchableOpacity>
                    </View>
                  ))}

                  {/* Totals */}
                  <View style={s.totalsBlock}>
                    <View style={s.totalRow}>
                      <Text style={s.totalLabel}>Subtotal</Text>
                      <Text style={s.totalValue}>${subtotal.toFixed(2)}</Text>
                    </View>
                    <View style={s.totalRow}>
                      <Text style={s.totalLabel}>Tax</Text>
                      <Text style={s.totalValue}>${tax.toFixed(2)}</Text>
                    </View>
                    <View style={s.totalRow}>
                      <Text style={s.totalLabelBold}>Total</Text>
                      <Text style={s.totalValueBold}>${total.toFixed(2)}</Text>
                    </View>
                  </View>

                  <TouchableOpacity
                    style={[s.checkoutBtn, { backgroundColor: brandColor }]}
                    onPress={handleCheckout}
                    activeOpacity={0.85}
                  >
                    <Text style={s.checkoutBtnText}>
                      {selectedSlot ? `Checkout · $${total.toFixed(2)}` : 'Schedule pickup to checkout'}
                    </Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        </View>

        {/* Footer */}
        <Text style={s.footerCopy}>
          © {new Date().getFullYear()} {restaurant?.name || 'Restaurant'}
        </Text>
      </ScrollView>

      {/* Modals */}
      <MenuItemModal
        item={selectedItem}
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onAddToCart={handleAddToCart}
        suggestedItems={getSuggestedItems(selectedItem)}
        menuType="catering"
      />
      <ScheduleModal
        visible={scheduleVisible}
        onClose={() => setScheduleVisible(false)}
        restaurant={restaurant}
        brandColor={brandColor}
        selectedSlot={selectedSlot}
        onSelect={setSelectedSlot}
      />
    </View>
  );
}

// ─── Styles (fixed light theme) ───────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },
  scroll: { flex: 1 },

  // Slim location meta (navbar provides brand / sign-in)
  header: {
    paddingHorizontal: 24,
    paddingTop: 14,
    paddingBottom: 10,
    backgroundColor: '#fff',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 14,
  },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 12, fontWeight: '500' },
  closedBadge: {
    backgroundColor: '#fde8ec',
    borderRadius: 100,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  closedBadgeText: { fontSize: 11, fontWeight: '600', color: '#c2314f' },

  // Tab bar
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    paddingHorizontal: 24,
    backgroundColor: '#fff',
  },
  tabActive: { paddingVertical: 12, borderBottomWidth: 2 },
  tabActiveText: { fontSize: 13, fontWeight: '700', color: '#111' },

  // Body
  body: { paddingHorizontal: 24, paddingTop: 20 },
  bodyDesktop: { flexDirection: 'row', gap: 36, maxWidth: 1440, width: '100%', alignSelf: 'center' },

  // Menu column
  menuCol: {},
  menuColDesktop: { flex: 9 },
  menuHeading: { fontSize: 16, fontWeight: '800', color: '#111', marginBottom: 4 },
  categoryBlock: { marginBottom: 16 },
  categoryName: { fontSize: 14, fontWeight: '700', color: '#333', marginTop: 16, marginBottom: 4 },
  menuGrid: { flexDirection: 'column', rowGap: 14 },
  menuGridDesktop: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -7 },
  menuCell: { width: '100%' },
  menuCellDesktop: { width: '50%', paddingHorizontal: 7, marginBottom: 14 },

  // Order column
  orderCol: { marginTop: 24 },
  orderColDesktop: { flex: 3, marginTop: 0, borderLeftWidth: 1, borderLeftColor: '#f0f0f0', paddingLeft: 28 },
  orderHeading: { fontSize: 16, fontWeight: '800', color: '#111', marginBottom: 14 },

  pickupOnlyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    borderWidth: 1.5,
    borderColor: '#eee',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 14,
    backgroundColor: '#fafafa',
  },
  pickupOnlyText: { fontSize: 13, fontWeight: '700' },

  // Info card — enlarged pickup location + time
  infoCard: {
    borderWidth: 1,
    borderColor: '#e5e5e5',
    borderRadius: 14,
    padding: 18,
    marginBottom: 16,
    backgroundColor: '#fff',
  },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  infoRowText: { flex: 1 },
  infoLabel: { fontSize: 12, color: '#999', marginBottom: 4, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.3 },
  infoValueBold: { fontSize: 15, fontWeight: '700', color: '#111' },
  infoValue: { fontSize: 13, color: '#555', marginTop: 3, lineHeight: 18 },
  infoValueMuted: { fontSize: 12, color: '#888', marginTop: 2 },
  infoDivider: { height: 1, backgroundColor: '#f0f0f0', marginVertical: 14 },
  smallBtn: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 9,
    backgroundColor: '#f6f6f6',
  },
  smallBtnText: { fontSize: 13, fontWeight: '600', color: '#333' },

  // Items card
  itemsCard: {
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 12,
    padding: 16,
    backgroundColor: '#fff',
  },
  itemsHeading: { fontSize: 15, fontWeight: '800', color: '#111', marginBottom: 12 },
  itemsEmpty: { fontSize: 13, color: '#999', textAlign: 'center', paddingVertical: 24 },

  cartItemRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10 },
  cartThumbWrap: {
    width: 44,
    height: 44,
    borderRadius: 8,
    overflow: 'hidden',
    flexShrink: 0,
    backgroundColor: '#f3f4f6',
  },
  cartThumb: { width: '100%', height: '100%' },
  cartThumbPlaceholder: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#f3f4f6' },
  cartItemName: { fontSize: 13, color: '#333', fontWeight: '500' },
  cartItemMods: { fontSize: 11, color: '#888', marginTop: 2 },
  cartItemPrice: { fontSize: 13, fontWeight: '600', color: '#111', flexShrink: 0 },

  totalsBlock: { borderTopWidth: 1, borderTopColor: '#f0f0f0', marginTop: 8, paddingTop: 10, gap: 5 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between' },
  totalLabel: { fontSize: 12, color: '#777' },
  totalValue: { fontSize: 12, color: '#333' },
  totalLabelBold: { fontSize: 14, fontWeight: '800', color: '#111' },
  totalValueBold: { fontSize: 14, fontWeight: '800', color: '#111' },

  checkoutBtn: { borderRadius: 10, paddingVertical: 13, alignItems: 'center', marginTop: 14 },
  checkoutBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },

  // Empty / misc
  empty: { alignItems: 'center', paddingVertical: 60, gap: 12 },
  emptyText: { fontSize: 15, color: '#aaa' },
  footerCopy: { fontSize: 11, color: '#bbb', paddingHorizontal: 24, paddingVertical: 24 },

  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, backgroundColor: '#fff' },
  loadingText: { color: '#697386', fontSize: 15 },
  errorPage: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: '#fff' },
  errorMsg: { fontSize: 15, color: '#c0392b', textAlign: 'center' },
});
