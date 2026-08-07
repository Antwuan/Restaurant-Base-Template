/**
 * Checkout — Stripe Payment Element, Stripe-Checkout-inspired UI.
 * Two-column layout on desktop (≥768 px), single column on mobile.
 * Each restaurant's stripe_account_id scopes the Stripe instance for Connect.
 */
import React, { useState, useMemo, useEffect, useRef } from 'react';
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
} from 'react-native';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { useCartContext } from '../../context/CartContext';
import { useTheme } from '../../theme';
import { useRestaurantContext } from '../../context/RestaurantContext';
import { useAuth } from '../../context/AuthContext';
import OrderSummary from '../../components/OrderSummary';
import LocationCard from '../../components/LocationCard';
import PromoCodeInput from '../../components/PromoCodeInput';
import { createPaymentIntent } from '../../services/stripeApi';
import { createOrder } from '../../services/orderService';
import { awardPoints } from '../../services/rewardsService';
import { syncMarketingContact } from '../../services/emailApi';
import { applyPromoToTotals } from '../../services/promoService';

const ORDER_TYPES = ['pickup', 'delivery'];
const TIME_OPTIONS = ['ASAP', '15 min', '30 min', '45 min', '1 hour'];
const BREAKPOINT = 768;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
  orderType,
  setOrderType,
  scheduledTime,
  setScheduledTime,
  notes,
  setNotes,
  summaryOpen,
  setSummaryOpen,
  paymentReady = true,
}) {
  const stripe = useStripe();
  const elements = useElements();
  const { items, clearCart } = useCartContext();
  const { user, isCustomerAuthenticated, refreshCustomerProfile } = useAuth();
  const { cartSubtotal, tax, total, discountAmount } = pricing;

  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

  const validateContact = () => {
    if (isSignedIn) return true;
    const errs = {};
    if (!contact.name.trim()) errs.name = 'Name is required';
    if (!contact.phone.trim()) errs.phone = 'Phone number is required';
    if (!contact.email.trim()) errs.email = 'Email is required';
    else if (!EMAIL_RE.test(contact.email.trim())) errs.email = 'Enter a valid email';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async () => {
    if (!stripe || !elements) return;
    if (!paymentReady) return;
    if (!validateContact()) return;

    const name = contact.name.trim();
    const phone = contact.phone.trim();
    const email = contact.email.trim();
    const marketingOptIn = contact.marketingOptIn;

    setLoading(true);

    try {
      const { error: confirmError, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          payment_method_data: {
            billing_details: {
              name: name || undefined,
              phone: phone || undefined,
              email: email || undefined,
            },
          },
          return_url:
            typeof window !== 'undefined'
              ? window.location.href
              : 'https://localhost:19006/confirmation',
        },
        redirect: 'if_required',
      });

      if (confirmError) {
        Alert.alert('Payment Failed', confirmError.message);
        setLoading(false);
        return;
      }

      const order = await createOrder({
        restaurantId: restaurant.id,
        customerName: name,
        customerPhone: phone,
        customerEmail: email,
        items: items.map(({ id, name: itemName, price, quantity, specialInstructions, selectedModifiers }) => ({
          id,
          name: itemName,
          price,
          quantity,
          special_instructions: specialInstructions || '',
          selected_modifiers: selectedModifiers || [],
        })),
        subtotal: cartSubtotal,
        tax,
        total,
        orderType,
        scheduledTime: scheduledTime === 'ASAP' ? null : scheduledTime,
        notes: notes || null,
        paymentIntentId: paymentIntent?.id,
        promoCodeId: appliedPromo?.id || null,
        promoCode: appliedPromo?.code || null,
        discountAmount: discountAmount || 0,
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
      navigation.replace('Confirmation', { order, pointsEarned });
    } catch (err) {
      Alert.alert('Error', err.message || 'Something went wrong. Please try again.');
    } finally {
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
        orderType={orderType}
        scheduledTime={scheduledTime}
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
                if (errors.name) setErrors((e) => ({ ...e, name: undefined }));
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
                if (errors.phone) setErrors((e) => ({ ...e, phone: undefined }));
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
            if (errors.email) setErrors((e) => ({ ...e, email: undefined }));
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
        <View style={s.toggleRow}>
          {ORDER_TYPES.map((type) => {
            const selected = orderType === type;
            return (
              <TouchableOpacity
                key={type}
                style={[
                  s.toggleBtn,
                  selected && { backgroundColor: theme.colors.brand, borderColor: theme.colors.brand },
                ]}
                onPress={() => setOrderType(type)}
              >
                <Text style={[s.toggleText, selected && { color: '#fff' }]}>
                  {type.charAt(0).toUpperCase() + type.slice(1)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <Text style={[s.fieldLabel, { marginTop: 16 }]}>Ready Time</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
          <View style={s.timeRow}>
            {TIME_OPTIONS.map((opt) => {
              const selected = scheduledTime === opt;
              return (
                <TouchableOpacity
                  key={opt}
                  style={[
                    s.timeChip,
                    selected && { backgroundColor: theme.colors.brand, borderColor: theme.colors.brand },
                  ]}
                  onPress={() => setScheduledTime(opt)}
                >
                  <Text style={[s.timeChipText, selected && { color: '#fff' }]}>{opt}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>

        {orderType === 'pickup' && (
          <View style={{ marginTop: 20 }}>
            <Text style={s.fieldLabel}>Pickup Location</Text>
            <View style={{ marginTop: 8 }}>
              <LocationCard
                restaurant={restaurant}
                variant="compact"
                brandColor={theme.colors.brand}
              />
            </View>
          </View>
        )}
      </View>

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
          placeholder="Allergies, requests, delivery notes…"
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
        {!paymentReady ? (
          <View style={{ paddingVertical: 20, alignItems: 'center', gap: 10 }}>
            <ActivityIndicator color={theme.colors.brand} />
            <Text style={{ fontSize: 13, color: '#697386' }}>Updating payment for new total…</Text>
          </View>
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
            (loading || !stripe || !paymentReady) && { opacity: 0.6 },
          ]}
          onPress={handleSubmit}
          disabled={loading || !stripe || !paymentReady}
        >
          {loading || !paymentReady ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={s.submitText}>Pay ${total.toFixed(2)} · Place Order</Text>
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
            <Text style={[s.summaryToggleText, { fontWeight: '700' }]}>${total.toFixed(2)}</Text>
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
  const { restaurant } = useRestaurantContext();
  const { items, subtotal: cartSubtotal } = useCartContext();
  const { theme } = useTheme();
  const { user, customerProfile, isCustomerAuthenticated } = useAuth();
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
  const [orderType, setOrderType] = useState('pickup');
  const [scheduledTime, setScheduledTime] = useState('ASAP');
  const [notes, setNotes] = useState('');
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [clientSecret, setClientSecret] = useState(null);
  const [piError, setPiError] = useState(null);
  const [piLoading, setPiLoading] = useState(true);
  const [appliedPromo, setAppliedPromo] = useState(null);
  const piAmountRef = useRef(null);

  const pricing = useMemo(() => {
    try {
      const result = applyPromoToTotals(cartSubtotal, items, appliedPromo);
      return {
        cartSubtotal,
        subtotal: result.discountedSubtotal,
        tax: result.tax,
        total: result.total,
        discountAmount: result.discountAmount,
      };
    } catch {
      return {
        cartSubtotal,
        subtotal: cartSubtotal,
        tax: Math.round(cartSubtotal * 0.08 * 100) / 100,
        total: Math.round((cartSubtotal + cartSubtotal * 0.08) * 100) / 100,
        discountAmount: 0,
      };
    }
  }, [cartSubtotal, items, appliedPromo]);

  const { total } = pricing;

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

  const stripePromise = useMemo(() => {
    const pk = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    if (!pk) return null;
    return loadStripe(pk);
  }, []);

  // Create / refresh PaymentIntent when checkout total changes (promo, cart)
  useEffect(() => {
    let cancelled = false;
    async function initPi() {
      if (!restaurant?.id || !hasConnectAccount || !total) {
        setPiLoading(false);
        return;
      }
      if (piAmountRef.current === total && clientSecret) {
        setPiLoading(false);
        return;
      }
      setPiLoading(true);
      setPiError(null);
      try {
        const email =
          customerProfile?.email ||
          (isCustomerAuthenticated ? user?.email : undefined) ||
          contact.email.trim() ||
          undefined;
        const secret = await createPaymentIntent(total, restaurant.id, { email });
        if (!cancelled) {
          setClientSecret(secret);
          piAmountRef.current = total;
        }
      } catch (e) {
        if (!cancelled) setPiError(e.message);
      } finally {
        if (!cancelled) setPiLoading(false);
      }
    }
    initPi();
    return () => { cancelled = true; };
    // Intentionally once per restaurant/total — don't recreate PI on every keystroke
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurant?.id, hasConnectAccount, total]);

  const paymentReady = Boolean(
    clientSecret && !piLoading && piAmountRef.current === total,
  );

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

  if (!process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY) {
    return (
      <View style={s.errorPage}>
        <Text style={s.errorMsg}>
          Set EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY in .env to accept payments.
        </Text>
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
    <ScrollView style={s.page} contentContainerStyle={s.pageContent}>
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
      ) : piError && !clientSecret ? (
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
            orderType={orderType}
            setOrderType={setOrderType}
            scheduledTime={scheduledTime}
            setScheduledTime={setScheduledTime}
            notes={notes}
            setNotes={setNotes}
            summaryOpen={summaryOpen}
            setSummaryOpen={setSummaryOpen}
            paymentReady={paymentReady}
          />
        </Elements>
      ) : null}
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
      flex: 1,
      borderWidth: 1.5,
      borderColor: '#e3e8ee',
      borderRadius: 8,
      paddingVertical: 11,
      alignItems: 'center',
    },
    toggleText: {
      fontSize: 15,
      fontWeight: '600',
      color: '#697386',
    },

    timeRow: {
      flexDirection: 'row',
      gap: 8,
      paddingRight: 16,
    },
    timeChip: {
      borderWidth: 1.5,
      borderColor: '#e3e8ee',
      borderRadius: 20,
      paddingHorizontal: 16,
      paddingVertical: 8,
    },
    timeChipText: {
      fontSize: 14,
      fontWeight: '500',
      color: '#697386',
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
