/**
 * Checkout — Stripe Payment Element, Stripe-Checkout-inspired UI.
 * Two-column layout on desktop (≥768 px), single column on mobile.
 * Each restaurant's stripe_account_id scopes the Stripe instance for Connect.
 */
import React, { useState, useEffect, useMemo } from 'react';
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
import OrderSummary from '../../components/OrderSummary';
import { createPaymentIntent } from '../../services/stripeApi';
import { createOrder } from '../../services/orderService';

const ORDER_TYPES = ['pickup', 'delivery'];
const TIME_OPTIONS = ['ASAP', '15 min', '30 min', '45 min', '1 hour'];
const BREAKPOINT = 768;

// ─── Inner form — must live inside <Elements> to use Stripe hooks ─────────────
function CheckoutForm({ navigation, isDesktop, theme, restaurant }) {
  const stripe = useStripe();
  const elements = useElements();
  const { items, subtotal, tax, total, clearCart } = useCartContext();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [orderType, setOrderType] = useState('pickup');
  const [scheduledTime, setScheduledTime] = useState('ASAP');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [summaryOpen, setSummaryOpen] = useState(false);

  const validate = () => {
    const errs = {};
    if (!name.trim()) errs.name = 'Name is required';
    if (!phone.trim()) errs.phone = 'Phone number is required';
    return errs;
  };

  const handleSubmit = async () => {
    const validationErrors = validate();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    setErrors({});
    if (!stripe || !elements) return;
    setLoading(true);

    try {
      const { error: confirmError, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          payment_method_data: {
            billing_details: {
              name,
              phone,
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
        customerEmail: email || null,
        items: items.map(({ id, name: itemName, price, quantity, specialInstructions }) => ({
          id,
          name: itemName,
          price,
          quantity,
          special_instructions: specialInstructions || '',
        })),
        subtotal,
        tax,
        total,
        orderType,
        scheduledTime: scheduledTime === 'ASAP' ? null : scheduledTime,
        notes: notes || null,
        paymentIntentId: paymentIntent?.id,
      });

      clearCart();
      navigation.replace('Confirmation', { order });
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
        subtotal={subtotal}
        tax={tax}
        total={total}
        orderType={orderType}
        scheduledTime={scheduledTime}
      />
    </View>
  );

  const formPanel = (
    <View style={[s.formPanel, isDesktop && s.formPanelDesktop]}>

      {/* ── Contact ─────────────────────────────── */}
      <View style={s.section}>
        <Text style={s.sectionLabel}>Contact</Text>
        <View style={[isDesktop && s.twoCol]}>
          <View style={[isDesktop && s.colHalf]}>
            <Text style={s.fieldLabel}>
              Name <Text style={s.required}>*</Text>
            </Text>
            <TextInput
              style={[s.input, errors.name && s.inputError]}
              placeholder="Full name"
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
            />
            {errors.name ? <Text style={s.errorText}>{errors.name}</Text> : null}
          </View>
          <View style={[isDesktop && s.colHalf]}>
            <Text style={s.fieldLabel}>
              Phone <Text style={s.required}>*</Text>
            </Text>
            <TextInput
              style={[s.input, errors.phone && s.inputError]}
              placeholder="(555) 555-5555"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
            />
            {errors.phone ? <Text style={s.errorText}>{errors.phone}</Text> : null}
          </View>
        </View>
        <Text style={[s.fieldLabel, { marginTop: 14 }]}>
          Email <Text style={s.optional}>(optional)</Text>
        </Text>
        <TextInput
          style={s.input}
          placeholder="you@example.com"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />
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
        <View style={s.paymentElementWrap}>
          <PaymentElement
            options={{
              layout: 'tabs',
              paymentMethodOrder: ['apple_pay', 'google_pay', 'card'],
            }}
          />
        </View>
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
            (loading || !stripe) && { opacity: 0.6 },
          ]}
          onPress={handleSubmit}
          disabled={loading || !stripe}
        >
          {loading ? (
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
          {/* Mobile: collapsible order summary */}
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

// ─── Outer component — creates PaymentIntent, wraps with Elements ─────────────
export default function CheckoutScreen({ navigation }) {
  const { restaurant } = useRestaurantContext();
  const { total } = useCartContext();
  const { theme } = useTheme();
  const { width } = useWindowDimensions();
  const isDesktop = width >= BREAKPOINT;

  const [clientSecret, setClientSecret] = useState(null);
  const [piError, setPiError] = useState(null);

  const hasConnectAccount = Boolean(restaurant?.stripe_account_id);

  const stripePromise = useMemo(() => {
    const pk = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    if (!pk) return null;
    return loadStripe(pk);
  }, []);

  useEffect(() => {
    if (!restaurant?.id || !hasConnectAccount || !total) return;
    createPaymentIntent(total, restaurant.id)
      .then(setClientSecret)
      .catch((e) => setPiError(e.message));
  }, [restaurant?.id, hasConnectAccount, total]);

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

  if (piError) {
    return (
      <View style={s.errorPage}>
        <Text style={s.errorMsg}>{piError}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={s.page} contentContainerStyle={s.pageContent}>
      {/* Header */}
      <View style={[s.header, isDesktop && s.headerDesktop]}>
        {restaurant?.name ? (
          <Text style={s.restaurantName}>{restaurant.name}</Text>
        ) : null}
        <Text style={s.pageTitle}>Checkout</Text>
      </View>

      {clientSecret ? (
        <Elements stripe={stripePromise} options={{ clientSecret, appearance }}>
          <CheckoutForm
            navigation={navigation}
            isDesktop={isDesktop}
            theme={theme}
            restaurant={restaurant}
          />
        </Elements>
      ) : (
        <View style={s.loadingWrap}>
          <ActivityIndicator size="large" color={theme.colors.brand} />
          <Text style={s.loadingText}>Preparing checkout…</Text>
        </View>
      )}
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
    // Layout
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

    // Summary panel
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

    // Mobile summary toggle bar
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

    // Form panel
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

    // Sections
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

    // Field labels + inputs
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

    // Two-column input row (desktop only)
    twoCol: {
      flexDirection: 'row',
      gap: 12,
    },
    colHalf: {
      flex: 1,
    },

    // Order type toggles
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

    // Time chips
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

    // Payment Element
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

    // Submit
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
