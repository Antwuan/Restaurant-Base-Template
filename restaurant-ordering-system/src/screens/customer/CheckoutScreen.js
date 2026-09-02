/**
 * Checkout — Stripe Payment Element, Stripe-Checkout-inspired UI.
 * Two-column layout on desktop (≥768 px), single column on mobile.
 * Each restaurant's stripe_account_id scopes the Stripe instance for Connect.
 */
import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  StyleSheet,
  useWindowDimensions,
  Modal,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { useCartContext } from '../../context/CartContext';
import { useTheme } from '../../theme';
import { useRestaurantContext } from '../../context/RestaurantContext';
import { useAuth } from '../../context/AuthContext';
import OrderSummary from '../../components/OrderSummary';
import PromoCodeInput from '../../components/PromoCodeInput';
import PickupLocationPicker, {
  isPickupLocationReady,
  resolvePickupLocation,
} from '../../components/PickupLocationPicker';
import CustomerSignInModal from '../../components/CustomerSignInModal';
import {
  createPaymentIntent,
  getPaymentMethodSummary,
  getOrCreateIdempotencyKey,
  writeCheckoutAttempt,
  readCheckoutAttempt,
  clearCheckoutAttempt,
  isConnectOnboardingError,
  retrievePaymentIntent,
  getPaymentReturnUrl,
  serializeCheckoutItems,
  loadStripeForCheckout,
} from '../../services/stripeApi';
import { createOrder } from '../../services/orderService';
import { awardPoints } from '../../services/rewardsService';
import { syncMarketingContact } from '../../services/emailApi';
import {
  extractPaymentDetailsFromIntent,
  mergeOrderItemImages,
  saveConfirmationPayload,
} from '../../utils/confirmationPayload';
import { applyPromoToTotals } from '../../services/promoService';
import { toPersistablePickupLocationId } from '../../services/locationsService';
import { resolveTaxRate } from '../../config/constants';
import { usePickupLocation } from '../../context/PickupLocationContext';
import {
  canOrderAsap,
  getAsapReadyOptions,
  getSlotTimesForDate,
  formatDateLabel,
  formatDateTo12,
  DAY_KEYS,
  resolveHours,
  ORDER_CLOSE_BUFFER_MINS,
} from '../../utils/hoursUtils';

const BREAKPOINT = 768;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SLOT_INTERVAL = 15;
const CALENDAR_SPAN_DAYS = 14;
const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function isPickupTimeMissing({ allowAsap, readyOption, scheduledSlot }) {
  if (scheduledSlot) return false;
  if (!allowAsap) return true;
  return readyOption === 'schedule';
}

function resolveCheckoutScheduledTimeIso({ readyOption, allowAsap, scheduledSlot, readyOptions }) {
  if (readyOption === 'ASAP' && allowAsap) return null;
  if (scheduledSlot) return new Date(scheduledSlot).toISOString();
  const opt = readyOptions?.find((o) => o.key === readyOption);
  if (opt && opt.minutesFromNow > 0) {
    return new Date(Date.now() + opt.minutesFromNow * 60 * 1000).toISOString();
  }
  return null;
}

function buildPickupCalendarCells(hours_of_operation) {
  const hours = resolveHours(hours_of_operation);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const rangeEnd = new Date(today);
  rangeEnd.setDate(rangeEnd.getDate() + CALENDAR_SPAN_DAYS - 1);
  rangeEnd.setHours(23, 59, 59, 999);

  const gridStart = new Date(today);
  gridStart.setDate(gridStart.getDate() - gridStart.getDay());
  const gridEnd = new Date(rangeEnd);
  gridEnd.setDate(gridEnd.getDate() + (6 - gridEnd.getDay()));

  const cells = [];
  const cursor = new Date(gridStart);
  while (cursor <= gridEnd) {
    const day = new Date(cursor);
    day.setHours(0, 0, 0, 0);
    const key = DAY_KEYS[day.getDay()];
    const beforeToday = day < today;
    const afterRange = day > rangeEnd;
    const closed = !hours[key] || hours[key].closed;
    const slots = (!beforeToday && !afterRange && !closed)
      ? getSlotTimesForDate(day, hours_of_operation, SLOT_INTERVAL, ORDER_CLOSE_BUFFER_MINS)
      : [];
    cells.push({
      date: day,
      selectable: !beforeToday && !afterRange && !closed && slots.length > 0,
      outside: beforeToday || afterRange,
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  return { cells };
}

function PickupScheduleModal({ visible, onClose, restaurant, brandColor, selectedSlot, onSelect }) {
  const { cells } = useMemo(
    () => buildPickupCalendarCells(restaurant?.hours_of_operation),
    [restaurant?.hours_of_operation],
  );
  const [step, setStep] = useState('date');
  const [date, setDate] = useState(null);

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
  }, [visible, selectedSlot]);

  const slots = useMemo(
    () => (date
      ? getSlotTimesForDate(date, restaurant?.hours_of_operation, SLOT_INTERVAL, ORDER_CLOSE_BUFFER_MINS)
      : []),
    [date, restaurant?.hours_of_operation],
  );

  const monthLabel = useMemo(() => {
    const ref = date || cells.find((c) => c.selectable)?.date || new Date();
    return ref.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }, [date, cells]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={psm.backdrop}>
        <View style={psm.sheet}>
          <View style={psm.headerRow}>
            <Text style={psm.title}>Schedule pickup</Text>
            <TouchableOpacity onPress={onClose} style={psm.closeBtn}>
              <Ionicons name="close" size={22} color="#333" />
            </TouchableOpacity>
          </View>
          <Text style={psm.note}>
            Choose a pickup time during open hours (last slot 30 minutes before close).
          </Text>

          {step === 'date' ? (
            <>
              <Text style={psm.label}>Select a date</Text>
              <Text style={psm.monthLabel}>{monthLabel}</Text>
              <View style={psm.weekdayRow}>
                {WEEKDAY_LABELS.map((w) => (
                  <Text key={w} style={psm.weekday}>{w}</Text>
                ))}
              </View>
              <View style={psm.calGrid}>
                {cells.map((cell, i) => {
                  const selected = date?.toDateString() === cell.date.toDateString();
                  return (
                    <TouchableOpacity
                      key={i}
                      style={[
                        psm.dayCell,
                        !cell.selectable && psm.dayDisabled,
                        selected && { backgroundColor: brandColor },
                      ]}
                      disabled={!cell.selectable}
                      onPress={() => { setDate(cell.date); setStep('time'); }}
                    >
                      <Text style={[
                        psm.dayText,
                        !cell.selectable && psm.dayTextDisabled,
                        selected && { color: '#fff' },
                      ]}>
                        {cell.date.getDate()}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          ) : (
            <>
              <TouchableOpacity onPress={() => setStep('date')} style={{ marginBottom: 8 }}>
                <Text style={{ color: brandColor, fontWeight: '600' }}>← {formatDateLabel(date)}</Text>
              </TouchableOpacity>
              <Text style={psm.label}>Select a time</Text>
              <ScrollView style={{ maxHeight: 280 }}>
                <View style={psm.slotGrid}>
                  {slots.map((slot) => {
                    const selected = selectedSlot && new Date(selectedSlot).getTime() === slot.getTime();
                    return (
                      <TouchableOpacity
                        key={slot.toISOString()}
                        style={[
                          psm.slotChip,
                          selected && { backgroundColor: brandColor, borderColor: brandColor },
                        ]}
                        onPress={() => { onSelect(slot); onClose(); }}
                      >
                        <Text style={[psm.slotText, selected && { color: '#fff' }]}>
                          {formatDateTo12(slot)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                  {slots.length === 0 ? (
                    <Text style={{ color: '#697386', fontSize: 13 }}>No available times this day.</Text>
                  ) : null}
                </View>
              </ScrollView>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const psm = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  sheet: { backgroundColor: '#fff', borderRadius: 14, padding: 20, width: '100%', maxWidth: 460 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  title: { fontSize: 17, fontWeight: '800', color: '#111' },
  closeBtn: { padding: 4 },
  note: { fontSize: 13, color: '#697386', marginBottom: 14, lineHeight: 18 },
  label: { fontSize: 13, fontWeight: '700', color: '#0a2540', marginBottom: 8 },
  monthLabel: { fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 8 },
  weekdayRow: { flexDirection: 'row', marginBottom: 4 },
  weekday: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '600', color: '#999' },
  calGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  dayDisabled: { opacity: 0.35 },
  dayText: { fontSize: 14, fontWeight: '600', color: '#111' },
  dayTextDisabled: { color: '#aaa' },
  slotGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  slotChip: {
    borderWidth: 1.5,
    borderColor: '#e3e8ee',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  slotText: { fontSize: 13, fontWeight: '600', color: '#697386' },
});

// ─── Inner form — must live inside <Elements> to use Stripe hooks ─────────────
function CheckoutForm({
  navigation,
  isDesktop,
  theme,
  restaurant,
  contact,
  setContact,
  isSignedIn,
  appliedPromo,
  onPromoApplied,
  onPromoCleared,
  pricing,
  readyOption,
  setReadyOption,
  scheduledSlot,
  setScheduledSlot,
  locations,
  selectedLocationId,
  notes,
  setNotes,
  summaryOpen,
  setSummaryOpen,
  paymentReady = true,
  chargeTotal,
  clientSecret,
  onGuestSignIn,
  piSucceeded = false,
}) {
  const stripe = useStripe();
  const elements = useElements();
  const { items, clearCart } = useCartContext();
  const { user, isCustomerAuthenticated, refreshCustomerProfile } = useAuth();
  const { cartSubtotal, tax, total, discountAmount } = pricing;
  const payTotal = Number.isFinite(Number(chargeTotal)) ? Number(chargeTotal) : total;

  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [scheduleVisible, setScheduleVisible] = useState(false);
  const [locationError, setLocationError] = useState(null);
  const submittingRef = useRef(false);

  const allowAsap = useMemo(
    () => canOrderAsap(restaurant?.hours_of_operation),
    [restaurant?.hours_of_operation],
  );
  const readyOptions = useMemo(
    () => getAsapReadyOptions(restaurant?.hours_of_operation),
    [restaurant?.hours_of_operation],
  );

  useEffect(() => {
    if (!allowAsap) {
      if (readyOption !== 'schedule') setReadyOption('schedule');
      return;
    }
    if (readyOption === 'schedule') return;
    if (!readyOptions.some((o) => o.key === readyOption)) {
      setReadyOption(readyOptions[0]?.key || 'ASAP');
    }
  }, [allowAsap, readyOptions, readyOption, setReadyOption]);

  const selectedLocation = useMemo(
    () => resolvePickupLocation(locations, selectedLocationId),
    [locations, selectedLocationId],
  );

  const summaryScheduledLabel = useMemo(() => {
    if (readyOption === 'ASAP' && allowAsap) return 'ASAP';
    if (scheduledSlot) {
      return `${formatDateLabel(scheduledSlot)} at ${formatDateTo12(scheduledSlot)}`;
    }
    const opt = readyOptions.find((o) => o.key === readyOption);
    return opt?.label || null;
  }, [readyOption, allowAsap, scheduledSlot, readyOptions]);

  const resolveScheduledTimeIso = useCallback(() => (
    resolveCheckoutScheduledTimeIso({
      readyOption,
      allowAsap,
      scheduledSlot,
      readyOptions,
    })
  ), [readyOption, allowAsap, scheduledSlot, readyOptions]);

  const validateFields = () => {
    const errs = {};
    if (!isSignedIn) {
      if (!contact.name.trim()) errs.name = 'Name is required';
      if (!contact.phone.trim()) errs.phone = 'Phone number is required';
      if (!contact.email.trim()) errs.email = 'Email is required';
      else if (!EMAIL_RE.test(contact.email.trim())) errs.email = 'Enter a valid email';
    }
    if (isPickupTimeMissing({ allowAsap, readyOption, scheduledSlot })) {
      errs.pickupTime = 'Please choose a pickup date and time.';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const clearFieldError = (key) => {
    setErrors((e) => (e[key] ? { ...e, [key]: undefined } : e));
  };

  const handleSubmit = async () => {
    if (!stripe || !elements) return;
    if (!paymentReady || piSucceeded) return;
    if (submittingRef.current || loading) return;
    if (!validateFields()) return;
    if (!isPickupLocationReady(locations, selectedLocationId)) {
      setLocationError('Please choose which store location you want to pick up from.');
      Alert.alert(
        'Pickup location required',
        'Please choose which location you would like to pick up from.',
      );
      return;
    }
    setLocationError(null);

    const name = contact.name.trim();
    const phone = contact.phone.trim();
    const email = contact.email.trim();
    const marketingOptIn = contact.marketingOptIn;
    const scheduledTimeIso = resolveScheduledTimeIso();

    submittingRef.current = true;
    setLoading(true);

    try {
      const idempotencyKey = getOrCreateIdempotencyKey(restaurant.id, 'checkout');
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
        menuType: 'regular',
        scheduledTime: scheduledTimeIso || undefined,
        notes: notes || undefined,
        pickupLocationId: toPersistablePickupLocationId(selectedLocation) || undefined,
      });

      let { error: confirmError, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          payment_method_data: {
            billing_details: {
              name: name || undefined,
              phone: phone || undefined,
              email: email || undefined,
            },
          },
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

      clearCart();
      if (restaurant?.id) clearCheckoutAttempt(restaurant.id, 'checkout');
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
        pickup_location: selectedLocation
          ? {
              id: toPersistablePickupLocationId(selectedLocation),
              name: selectedLocation.name,
              address: selectedLocation.address,
              is_main: Boolean(selectedLocation.is_main),
            }
          : null,
        payment,
      };
      const confirmationPayload = { order: confirmationOrder, pointsEarned };
      saveConfirmationPayload(confirmationPayload);
      navigation.replace('Confirmation', confirmationPayload);
    } catch (err) {
      if (isConnectOnboardingError(err.message) && restaurant?.id) {
        clearCheckoutAttempt(restaurant.id, 'checkout');
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

  const s = makeFormStyles(theme);

  const summaryPanel = (
    <View style={[s.summaryPanel, isDesktop && s.summaryPanelDesktop]}>
      <OrderSummary
        items={items}
        subtotal={pricing.cartSubtotal}
        tax={tax}
        total={total}
        discountAmount={discountAmount}
        promoCode={appliedPromo?.code}
        orderType="pickup"
        scheduledTime={summaryScheduledLabel}
      />
    </View>
  );

  const formPanel = (
    <View style={[s.formPanel, isDesktop && s.formPanelDesktop]}>

      {/* ── Contact ──────────────────────────────── */}
      <View style={s.section}>
        <Text style={s.sectionLabel}>Contact</Text>
        {!isSignedIn ? (
          <Text style={{ fontSize: 13, color: '#697386', marginBottom: 16, lineHeight: 18 }}>
            Email is required for your receipt and order updates.
            {' '}
            <Text
              onPress={onGuestSignIn}
              style={{ color: theme.colors.brand, fontWeight: '600' }}
            >
              Sign in
            </Text>
            {' '}to track all open orders in one place.
          </Text>
        ) : null}

        <View style={[isDesktop && s.twoCol]}>
          <View style={[isDesktop && s.colHalf]}>
            <Text style={s.fieldLabel}>
              Name{!isSignedIn ? <Text style={s.required}> *</Text> : null}
            </Text>
            <TextInput
              style={[s.input, errors.name && s.inputError]}
              placeholder="Full name"
              value={contact.name}
              onChangeText={(name) => {
                setContact((c) => ({ ...c, name }));
                if (errors.name) clearFieldError('name');
              }}
              autoCapitalize="words"
            />
            {errors.name ? <Text style={s.errorText}>{errors.name}</Text> : null}
          </View>
          <View style={[isDesktop && s.colHalf]}>
            <Text style={s.fieldLabel}>
              Phone{!isSignedIn ? <Text style={s.required}> *</Text> : null}
            </Text>
            <TextInput
              style={[s.input, errors.phone && s.inputError]}
              placeholder="(555) 555-5555"
              value={contact.phone}
              onChangeText={(phone) => {
                setContact((c) => ({ ...c, phone }));
                if (errors.phone) clearFieldError('phone');
              }}
              keyboardType="phone-pad"
            />
            {errors.phone ? <Text style={s.errorText}>{errors.phone}</Text> : null}
          </View>
        </View>

        <Text style={[s.fieldLabel, { marginTop: 14 }]}>
          Email{!isSignedIn ? <Text style={s.required}> *</Text> : null}
        </Text>
        <TextInput
          style={[s.input, errors.email && s.inputError]}
          placeholder="you@example.com"
          value={contact.email}
          onChangeText={(email) => {
            setContact((c) => ({ ...c, email }));
            if (errors.email) clearFieldError('email');
          }}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        {errors.email ? <Text style={s.errorText}>{errors.email}</Text> : null}

        {!isSignedIn ? (
          <TouchableOpacity
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 18 }}
            onPress={() => setContact((c) => ({ ...c, marketingOptIn: !c.marketingOptIn }))}
            activeOpacity={0.7}
          >
            <View style={{
              width: 20, height: 20, borderRadius: 4, borderWidth: 1.5,
              borderColor: contact.marketingOptIn ? theme.colors.brand : '#cfd7e3',
              backgroundColor: contact.marketingOptIn ? theme.colors.brand : '#fff',
              alignItems: 'center', justifyContent: 'center',
            }}>
              {contact.marketingOptIn ? <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>✓</Text> : null}
            </View>
            <Text style={{ fontSize: 14, color: '#0a2540', flex: 1 }}>
              Email me deals &amp; updates
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={s.sectionDivider} />

      {/* ── Order Details ────────────────────────── */}
      <View style={s.section}>
        <Text style={s.sectionLabel}>Order Details</Text>
        <View
          style={[
            s.toggleBtn,
            !isDesktop && s.toggleBtnMobile,
            { backgroundColor: theme.colors.brand, borderColor: theme.colors.brand },
          ]}
        >
          <Text style={[s.toggleText, { color: '#fff' }]}>Pickup</Text>
        </View>

        <Text style={[s.fieldLabel, { marginTop: 16 }]}>
          {allowAsap ? 'Ready Time' : 'Pickup Time'}
        </Text>
        {!allowAsap ? (
          <Text style={{ fontSize: 13, color: '#697386', marginTop: 4, marginBottom: 4, lineHeight: 18 }}>
            We&apos;re closed or closing soon. Please schedule a pickup during open hours.
          </Text>
        ) : null}

        {allowAsap ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={s.timeScroll}
            contentContainerStyle={s.timeRow}
          >
              {readyOptions.map((opt) => {
                const selected = readyOption === opt.key && !scheduledSlot;
                return (
                  <TouchableOpacity
                    key={opt.key}
                    style={[
                      s.timeChip,
                      selected && { backgroundColor: theme.colors.brand, borderColor: theme.colors.brand },
                    ]}
                    onPress={() => {
                      setScheduledSlot(null);
                      setReadyOption(opt.key);
                      clearFieldError('pickupTime');
                    }}
                  >
                    <Text style={[s.timeChipText, selected && { color: '#fff' }]}>{opt.label}</Text>
                  </TouchableOpacity>
                );
              })}
              <TouchableOpacity
                style={[
                  s.timeChip,
                  (readyOption === 'schedule' || scheduledSlot) && {
                    backgroundColor: theme.colors.brand,
                    borderColor: theme.colors.brand,
                  },
                  errors.pickupTime && s.inputError,
                ]}
                onPress={() => {
                  setReadyOption('schedule');
                  setScheduleVisible(true);
                }}
              >
                <Text style={[
                  s.timeChipText,
                  (readyOption === 'schedule' || scheduledSlot) && { color: '#fff' },
                ]}>
                  {scheduledSlot
                    ? `${formatDateLabel(scheduledSlot)} ${formatDateTo12(scheduledSlot)}`
                    : 'Schedule…'}
                </Text>
              </TouchableOpacity>
          </ScrollView>
        ) : (
          <TouchableOpacity
            style={[
              s.scheduleBtn,
              scheduledSlot && { borderColor: theme.colors.brand },
              errors.pickupTime && s.inputError,
            ]}
            onPress={() => setScheduleVisible(true)}
          >
            <Ionicons name="calendar-outline" size={16} color={theme.colors.brand} />
            <Text style={{ fontSize: 14, fontWeight: '600', color: '#0a2540', marginLeft: 8 }}>
              {scheduledSlot
                ? `${formatDateLabel(scheduledSlot)} at ${formatDateTo12(scheduledSlot)}`
                : 'Choose pickup date & time'}
            </Text>
          </TouchableOpacity>
        )}
        {errors.pickupTime ? <Text style={s.errorText}>{errors.pickupTime}</Text> : null}

        <View style={{ marginTop: 20 }}>
          <PickupLocationPicker
            locations={locations}
            selectedLocationId={selectedLocationId}
            restaurant={restaurant}
            brandColor={theme.colors.brand}
            readOnly
          />
          {locationError ? (
            <View style={{ marginTop: 10 }}>
              <Text style={{ fontSize: 12, color: '#c0392b', marginBottom: 6 }}>
                {locationError}
              </Text>
              <TouchableOpacity onPress={() => navigation?.navigate?.('Menu')}>
                <Text style={{ color: theme.colors.brand, fontWeight: '600', fontSize: 13 }}>
                  Choose a pickup location on the menu →
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      </View>

      <PickupScheduleModal
        visible={scheduleVisible}
        onClose={() => setScheduleVisible(false)}
        restaurant={restaurant}
        brandColor={theme.colors.brand}
        selectedSlot={scheduledSlot}
        onSelect={(slot) => {
          setScheduledSlot(slot);
          setReadyOption('schedule');
          clearFieldError('pickupTime');
        }}
      />

      <View style={s.sectionDivider} />

      {/* ── Promo Code ───────────────────────────── */}
      <View style={s.section}>
        <Text style={s.sectionLabel}>Promo Code</Text>
        <PromoCodeInput
          restaurantId={restaurant?.id}
          items={items}
          appliedPromo={appliedPromo}
          onApplied={onPromoApplied}
          onCleared={onPromoCleared}
          brandColor={theme.colors.brand}
        />
      </View>

      <View style={s.sectionDivider} />

      {/* ── Special Instructions ─────────────────── */}
      <View style={s.section}>
        <Text style={s.sectionLabel}>Special Instructions</Text>
        <TextInput
          style={[s.input, s.textArea]}
          placeholder="Allergies, requests, special notes…"
          value={notes}
          onChangeText={setNotes}
          multiline
          numberOfLines={3}
        />
      </View>

      <View style={s.sectionDivider} />

      {/* ── Payment ──────────────────────────────── */}
      <View style={s.section}>
        <Text style={s.sectionLabel}>Payment</Text>
        {!paymentReady && !piSucceeded ? (
          <View style={{ paddingVertical: 20, alignItems: 'center', gap: 10 }}>
            <ActivityIndicator color={theme.colors.brand} />
            <Text style={{ fontSize: 13, color: '#697386' }}>Updating payment for new total…</Text>
          </View>
        ) : piSucceeded ? (
          <Text style={{ fontSize: 14, color: '#0a2540', lineHeight: 20, marginBottom: 8 }}>
            This payment was already completed. Check confirmation or sign in to track your orders.
          </Text>
        ) : (
          <View style={s.paymentElementWrap}>
            <PaymentElement
              options={{
                layout: 'tabs',
                paymentMethodOrder: ['apple_pay', 'google_pay', 'card'],
              }}
            />
          </View>
        )}
        <View style={s.securedRow}>
          <Text style={s.securedText}>🔒  Secured by Stripe</Text>
        </View>
      </View>

      {/* ── Submit ───────────────────────────────── */}
      <View style={s.submitWrap}>
        <TouchableOpacity
          style={[
            s.submitBtn,
            { backgroundColor: theme.colors.brand },
            (loading || !stripe || !paymentReady || piSucceeded) && { opacity: 0.6 },
          ]}
          onPress={handleSubmit}
          disabled={loading || !stripe || !paymentReady || piSucceeded}
        >
          {loading || !paymentReady ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={s.submitText}>Pay ${payTotal.toFixed(2)} · Place Order</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={[s.columns, isDesktop && s.columnsDesktop]}>
      {isDesktop ? (
        <>
          {summaryPanel}
          {formPanel}
        </>
      ) : (
        <>
          <TouchableOpacity
            style={s.summaryToggle}
            onPress={() => setSummaryOpen((o) => !o)}
            activeOpacity={0.7}
          >
            <Text style={s.summaryToggleText}>
              {summaryOpen ? '▲' : '▼'}{'  '}Order Summary
            </Text>
            <Text style={[s.summaryToggleText, { fontWeight: '700' }]}>${payTotal.toFixed(2)}</Text>
          </TouchableOpacity>
          {summaryOpen && summaryPanel}
          {formPanel}
        </>
      )}
    </View>
  );
}

// ─── Outer component — creates PaymentIntent on load ──────────────────────────
export default function CheckoutScreen({ navigation }) {
  const { restaurant, loading: restaurantLoading } = useRestaurantContext();
  const { items, subtotal: cartSubtotal } = useCartContext();
  const { theme } = useTheme();
  const { user, customerProfile, isCustomerAuthenticated } = useAuth();
  const {
    locations,
    selectedLocationId,
    hasSelection,
    loading: locationsLoading,
  } = usePickupLocation();
  const { width } = useWindowDimensions();
  const isDesktop = width >= BREAKPOINT;

  const isSignedIn = isCustomerAuthenticated;

  const [contact, setContact] = useState({
    name: '',
    phone: '',
    email: '',
    marketingOptIn: false,
  });
  // Lifted so promo-driven PaymentIntent refresh does not wipe form edits
  const [readyOption, setReadyOption] = useState(
    () => (canOrderAsap(restaurant?.hours_of_operation) ? 'ASAP' : 'schedule'),
  );
  const [scheduledSlot, setScheduledSlot] = useState(null);
  const [notes, setNotes] = useState('');
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [clientSecret, setClientSecret] = useState(null);
  const [piError, setPiError] = useState(null);
  const [piLoading, setPiLoading] = useState(true);
  const [appliedPromo, setAppliedPromo] = useState(null);
  const [chargeAmountCents, setChargeAmountCents] = useState(null);
  const [piSucceeded, setPiSucceeded] = useState(false);
  const [signInVisible, setSignInVisible] = useState(false);
  const cartFingerprintRef = useRef(null);

  const selectedPickupLocation = useMemo(
    () => resolvePickupLocation(locations, selectedLocationId),
    [locations, selectedLocationId],
  );
  const taxRate = useMemo(
    () => resolveTaxRate(restaurant, selectedPickupLocation),
    [restaurant, selectedPickupLocation],
  );
  const pickupLocationId = toPersistablePickupLocationId(selectedPickupLocation);

  const pricing = useMemo(() => {
    try {
      const result = applyPromoToTotals(cartSubtotal, items, appliedPromo, taxRate);
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
  }, [cartSubtotal, items, appliedPromo, taxRate]);

  const { total } = pricing;
  const chargeTotal = chargeAmountCents != null ? chargeAmountCents / 100 : total;

  const cartFingerprint = useMemo(
    () => JSON.stringify({
      items: serializeCheckoutItems(items),
      promo: appliedPromo?.id || appliedPromo?.code || null,
      pickupLocationId: pickupLocationId || null,
    }),
    [items, appliedPromo, pickupLocationId],
  );

  // Drop item-based promos if the required item leaves the cart (or qty drops)
  useEffect(() => {
    if (!appliedPromo?.menu_item_id) return;
    const itemTypes = ['free_item', 'bogo', 'buy_x_percent_off', 'buy_x_amount_off'];
    if (!itemTypes.includes(appliedPromo.benefit_type)) return;
    const line = items.find((i) => String(i.id) === String(appliedPromo.menu_item_id));
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
  }, [items, appliedPromo]);

  const hasConnectAccount = Boolean(restaurant?.stripe_account_id);

  // Prefill from signed-in customer profile / auth email
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

  // Location is chosen on Menu; if missing for multi-store, send user back.
  useEffect(() => {
    if (locationsLoading) return;
    if (locations.length < 2) return;
    if (hasSelection) return;
    Alert.alert(
      'Pickup location needed',
      'Please choose which location you are ordering for on the menu.',
      [{ text: 'OK', onPress: () => navigation?.navigate?.('Menu') }],
    );
  }, [locationsLoading, locations.length, hasSelection, navigation]);

  const stripePromise = useMemo(() => {
    const pk = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    if (!pk) return null;
    return loadStripeForCheckout(pk);
  }, []);

  // Create / resume PaymentIntent. Same idempotencyKey updates the PI when the cart changes.
  // Do not mint a new PI after succeeded. Do not recreate on email keystrokes.
  useEffect(() => {
    let cancelled = false;
    async function initPi() {
      if (!restaurant?.id || !hasConnectAccount || !items.length) {
        setPiLoading(false);
        return;
      }

      const stored = readCheckoutAttempt(restaurant.id, 'checkout');
      if (stored?.clientSecret) {
        const pi = await retrievePaymentIntent(stored.clientSecret);
        if (cancelled) return;
        if (pi?.status === 'succeeded' || pi?.status === 'processing') {
          setClientSecret(stored.clientSecret);
          setPiSucceeded(pi.status === 'succeeded');
          if (pi.amount != null) setChargeAmountCents(pi.amount);
          setPiLoading(false);
          return;
        }
        if (pi && (pi.status === 'canceled' || pi.status === 'cancelled')) {
          clearCheckoutAttempt(restaurant.id, 'checkout');
        }
      }

      if (cartFingerprintRef.current === cartFingerprint && clientSecret && !piSucceeded) {
        setPiLoading(false);
        return;
      }

      setPiLoading(true);
      setPiError(null);
      try {
        const email =
          contact.email.trim() ||
          customerProfile?.email ||
          (isCustomerAuthenticated ? user?.email : undefined) ||
          undefined;
        const allowAsapInit = canOrderAsap(restaurant?.hours_of_operation);
        const readyOptionsInit = getAsapReadyOptions(restaurant?.hours_of_operation);
        const scheduledTimeIso = resolveCheckoutScheduledTimeIso({
          readyOption,
          allowAsap: allowAsapInit,
          scheduledSlot,
          readyOptions: readyOptionsInit,
        });
        const idempotencyKey = getOrCreateIdempotencyKey(restaurant.id, 'checkout');
        const result = await createPaymentIntent({
          restaurantId: restaurant.id,
          items,
          promo: appliedPromo,
          idempotencyKey,
          email,
          customerEmail: email,
          customerName: contact.name.trim() || undefined,
          customerPhone: contact.phone.trim() || undefined,
          orderType: 'pickup',
          menuType: 'regular',
          scheduledTime: scheduledTimeIso || undefined,
          notes: notes || undefined,
          pickupLocationId: pickupLocationId || undefined,
        });
        if (cancelled) return;
        writeCheckoutAttempt(restaurant.id, {
          idempotencyKey,
          clientSecret: result.clientSecret,
          paymentIntentId: result.paymentIntentId,
        }, 'checkout');
        setClientSecret(result.clientSecret);
        setChargeAmountCents(result.amountCents);
        setPiSucceeded(false);
        cartFingerprintRef.current = cartFingerprint;
      } catch (e) {
        if (!cancelled) {
          if (isConnectOnboardingError(e.message) && restaurant?.id) {
            clearCheckoutAttempt(restaurant.id, 'checkout');
          }
          setPiError(e.message);
        }
      } finally {
        if (!cancelled) setPiLoading(false);
      }
    }
    initPi();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurant?.id, hasConnectAccount, cartFingerprint]);

  const paymentReady = Boolean(clientSecret && !piLoading && !piSucceeded);

  const appearance = {
    theme: 'stripe',
    variables: {
      colorPrimary: theme.colors.brand,
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
      borderRadius: '8px',
      colorBackground: '#ffffff',
      colorText: '#0a2540',
      colorTextSecondary: '#697386',
    },
  };

  const s = makePageStyles(theme);
  const restaurantReady = Boolean(restaurant?.id) && !restaurantLoading;

  if (!process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY) {
    return (
      <View style={s.errorPage}>
        <Text style={s.errorMsg}>
          Set EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY in .env to accept payments.
        </Text>
      </View>
    );
  }

  if (!restaurantReady) {
    return (
      <View style={s.page}>
        <View style={s.loadingWrap}>
          <ActivityIndicator size="large" color={theme.colors.brand} />
          <Text style={s.loadingText}>Preparing checkout…</Text>
        </View>
      </View>
    );
  }

  if (!hasConnectAccount) {
    return (
      <View style={s.errorPage}>
        <Text style={s.errorMsg}>
          Payments are not configured for this restaurant. Set stripe_account_id in Supabase.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={s.page}
      contentContainerStyle={s.pageContent}
    >
      <View style={[s.header, isDesktop && s.headerDesktop]}>
        {restaurant?.name ? (
          <Text style={s.restaurantName}>{restaurant.name}</Text>
        ) : null}
        <Text style={s.pageTitle}>Checkout</Text>
      </View>

      {piLoading && !clientSecret ? (
        <View style={s.loadingWrap}>
          <ActivityIndicator size="large" color={theme.colors.brand} />
          <Text style={s.loadingText}>Preparing checkout…</Text>
        </View>
      ) : !piLoading && piError && !clientSecret ? (
        <View style={s.errorPage}>
          <Text style={s.errorMsg}>{piError}</Text>
        </View>
      ) : clientSecret ? (
        <Elements
          key={clientSecret}
          stripe={stripePromise}
          options={{ clientSecret, appearance }}
        >
          <CheckoutForm
            navigation={navigation}
            isDesktop={isDesktop}
            theme={theme}
            restaurant={restaurant}
            contact={contact}
            setContact={setContact}
            isSignedIn={isSignedIn}
            appliedPromo={appliedPromo}
            onPromoApplied={setAppliedPromo}
            onPromoCleared={() => setAppliedPromo(null)}
            pricing={pricing}
            readyOption={readyOption}
            setReadyOption={setReadyOption}
            scheduledSlot={scheduledSlot}
            setScheduledSlot={setScheduledSlot}
            locations={locations}
            selectedLocationId={selectedLocationId}
            notes={notes}
            setNotes={setNotes}
            summaryOpen={summaryOpen}
            setSummaryOpen={setSummaryOpen}
            paymentReady={paymentReady}
            chargeTotal={chargeTotal}
            clientSecret={clientSecret}
            onGuestSignIn={() => setSignInVisible(true)}
            piSucceeded={piSucceeded}
          />
        </Elements>
      ) : null}

      <CustomerSignInModal
        visible={signInVisible}
        onClose={() => setSignInVisible(false)}
      />
    </ScrollView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function makePageStyles(theme) {
  return StyleSheet.create({
    page: {
      flex: 1,
      backgroundColor: '#f6f9fc',
    },
    pageContent: {
      paddingBottom: 40,
    },
    header: {
      paddingHorizontal: 20,
      paddingTop: 24,
      paddingBottom: 20,
      borderBottomWidth: 1,
      borderBottomColor: '#e3e8ee',
      backgroundColor: '#ffffff',
    },
    headerDesktop: {
      paddingHorizontal: 40,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    restaurantName: {
      fontSize: 15,
      fontWeight: '600',
      color: '#697386',
    },
    pageTitle: {
      fontSize: 22,
      fontWeight: '700',
      color: '#0a2540',
      marginTop: 2,
    },
    loadingWrap: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 80,
      gap: 16,
    },
    loadingText: {
      fontSize: 15,
      color: '#697386',
    },
    errorPage: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 32,
      backgroundColor: '#f6f9fc',
    },
    errorMsg: {
      fontSize: 15,
      color: '#c0392b',
      textAlign: 'center',
      lineHeight: 22,
    },
  });
}

function makeFormStyles(theme) {
  return StyleSheet.create({
    columns: {
      flexDirection: 'column',
    },
    columnsDesktop: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      maxWidth: 1100,
      width: '100%',
      alignSelf: 'center',
      paddingHorizontal: 40,
      paddingTop: 40,
      gap: 32,
    },

    summaryPanel: {
      backgroundColor: '#f6f9fc',
      paddingHorizontal: 16,
      paddingVertical: 8,
    },
    summaryPanelDesktop: {
      flex: 4,
      backgroundColor: 'transparent',
      paddingHorizontal: 0,
      paddingVertical: 0,
      position: 'sticky',
      top: 24,
    },

    summaryToggle: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      backgroundColor: '#e8f0fe',
      paddingHorizontal: 20,
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: '#d0d9f0',
    },
    summaryToggleText: {
      fontSize: 15,
      color: '#0a2540',
      fontWeight: '500',
    },

    formPanel: {
      backgroundColor: '#ffffff',
      marginHorizontal: 0,
    },
    formPanelDesktop: {
      flex: 5,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: '#e3e8ee',
      overflow: 'hidden',
    },

    section: {
      padding: 24,
    },
    sectionDivider: {
      height: 1,
      backgroundColor: '#e3e8ee',
      marginHorizontal: 24,
    },
    sectionLabel: {
      fontSize: 11,
      fontWeight: '700',
      color: '#697386',
      letterSpacing: 0.8,
      textTransform: 'uppercase',
      marginBottom: 16,
    },

    fieldLabel: {
      fontSize: 13,
      fontWeight: '500',
      color: '#0a2540',
      marginBottom: 6,
    },
    required: {
      color: '#c0392b',
    },
    optional: {
      color: '#697386',
      fontWeight: '400',
    },
    input: {
      borderWidth: 1,
      borderColor: '#e3e8ee',
      borderRadius: 8,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
      color: '#0a2540',
      backgroundColor: '#ffffff',
    },
    inputError: {
      borderColor: '#c0392b',
    },
    textArea: {
      height: 80,
      textAlignVertical: 'top',
    },
    errorText: {
      fontSize: 12,
      color: '#c0392b',
      marginTop: 4,
    },

    twoCol: {
      flexDirection: 'row',
      gap: 12,
    },
    colHalf: {
      flex: 1,
    },

    toggleRow: {
      flexDirection: 'row',
      gap: 10,
    },
    toggleBtn: {
      flexGrow: 0,
      flexShrink: 0,
      alignSelf: 'flex-start',
      borderWidth: 1.5,
      borderColor: '#e3e8ee',
      borderRadius: 20,
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 8,
      minHeight: 36,
      alignItems: 'center',
      justifyContent: 'center',
      ...Platform.select({
        web: { width: 'fit-content', display: 'inline-flex' },
        default: {},
      }),
    },
    toggleBtnMobile: {
      alignSelf: 'stretch',
      width: '100%',
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingTop: 14,
      paddingBottom: 14,
      minHeight: 48,
      ...Platform.select({
        web: { width: '100%', display: 'flex' },
        default: {},
      }),
    },
    toggleText: {
      fontSize: 15,
      fontWeight: '600',
      color: '#697386',
      lineHeight: 20,
      ...Platform.select({
        android: { includeFontPadding: false },
        default: {},
      }),
    },

    timeScroll: {
      marginTop: 8,
      flexGrow: 0,
      flexShrink: 0,
    },
    timeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingRight: 16,
    },
    timeChip: {
      borderWidth: 1.5,
      borderColor: '#e3e8ee',
      borderRadius: 20,
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 8,
      minHeight: 36,
      alignItems: 'center',
      justifyContent: 'center',
    },
    timeChipText: {
      fontSize: 14,
      fontWeight: '500',
      color: '#697386',
      lineHeight: 18,
      ...Platform.select({
        android: { includeFontPadding: false },
        default: {},
      }),
    },
    scheduleBtn: {
      marginTop: 8,
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1.5,
      borderColor: '#e3e8ee',
      borderRadius: 8,
      paddingHorizontal: 14,
      paddingVertical: 12,
      backgroundColor: '#fff',
    },

    paymentElementWrap: {
      borderWidth: 1,
      borderColor: '#e3e8ee',
      borderRadius: 8,
      padding: 16,
      backgroundColor: '#ffffff',
      minHeight: 60,
    },
    securedRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 12,
    },
    securedText: {
      fontSize: 12,
      color: '#697386',
    },

    submitWrap: {
      padding: 24,
      paddingTop: 8,
    },
    submitBtn: {
      borderRadius: 10,
      paddingVertical: 16,
      alignItems: 'center',
    },
    submitText: {
      color: '#ffffff',
      fontSize: 17,
      fontWeight: '700',
      letterSpacing: 0.2,
    },
  });
}
