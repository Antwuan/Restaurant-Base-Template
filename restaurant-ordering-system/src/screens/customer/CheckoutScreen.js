/**
 * Checkout — Stripe Payment Element, Stripe-Checkout-inspired UI.
 * Two-column layout on desktop (≥768 px), single column on mobile.
 * Each restaurant's stripe_account_id scopes the Stripe instance for Connect.
 */
import React, { useState, useMemo } from 'react';
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
import { createPaymentIntent } from '../../services/stripeApi';
import { createOrder } from '../../services/orderService';
import { awardPoints } from '../../services/rewardsService';
import { syncMarketingContact } from '../../services/emailApi';

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
  onEditContact,
}) {
  const stripe = useStripe();
  const elements = useElements();
  const { items, subtotal, tax, total, clearCart } = useCartContext();
  const { user } = useAuth();

  const { name, phone, email, marketingOptIn } = contact;
  const [orderType, setOrderType] = useState('pickup');
  const [scheduledTime, setScheduledTime] = useState('ASAP');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);

  const handleSubmit = async () => {
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
              email,
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
        subtotal,
        tax,
        total,
        orderType,
        scheduledTime: scheduledTime === 'ASAP' ? null : scheduledTime,
        notes: notes || null,
        paymentIntentId: paymentIntent?.id,
      });

      // Award points to signed-in customers (silent — never blocks order flow)
      if (user?.id && restaurant?.id) {
        awardPoints({
          restaurantId: restaurant.id,
          authUserId: user.id,
          orderTotal: total,
          pointsPerDollar: restaurant.points_per_dollar ?? 1,
        });
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

      {/* ── Contact (locked after PI create) ─────── */}
      <View style={s.section}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <Text style={[s.sectionLabel, { marginBottom: 0 }]}>Contact</Text>
          <TouchableOpacity onPress={onEditContact}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: theme.colors.brand }}>Edit</Text>
          </TouchableOpacity>
        </View>
        <Text style={{ fontSize: 15, fontWeight: '600', color: '#0a2540' }}>{name}</Text>
        <Text style={{ fontSize: 14, color: '#697386', marginTop: 4 }}>{phone}</Text>
        <Text style={{ fontSize: 14, color: '#697386', marginTop: 2 }}>{email}</Text>
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

        {/* ── Pickup location confirmation ───── */}
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

// ─── Contact step — collect email before creating PaymentIntent ───────────────
function ContactStep({ theme, isDesktop, contact, setContact, onContinue, loading, error }) {
  const s = makeFormStyles(theme);
  const [errors, setErrors] = useState({});

  const handleContinue = () => {
    const errs = {};
    if (!contact.name.trim()) errs.name = 'Name is required';
    if (!contact.phone.trim()) errs.phone = 'Phone number is required';
    if (!contact.email.trim()) errs.email = 'Email is required';
    else if (!EMAIL_RE.test(contact.email.trim())) errs.email = 'Enter a valid email';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    onContinue();
  };

  return (
    <View style={[s.formPanel, isDesktop && s.formPanelDesktop, { marginTop: 24, alignSelf: 'center', maxWidth: 560, width: '100%' }]}>
      <View style={s.section}>
        <Text style={s.sectionLabel}>Contact</Text>
        <Text style={{ fontSize: 13, color: '#697386', marginBottom: 16, lineHeight: 18 }}>
          Email is required for your receipt and order updates.
        </Text>
        <View style={[isDesktop && s.twoCol]}>
          <View style={[isDesktop && s.colHalf]}>
            <Text style={s.fieldLabel}>Name <Text style={s.required}>*</Text></Text>
            <TextInput
              style={[s.input, errors.name && s.inputError]}
              placeholder="Full name"
              value={contact.name}
              onChangeText={(name) => setContact((c) => ({ ...c, name }))}
              autoCapitalize="words"
            />
            {errors.name ? <Text style={s.errorText}>{errors.name}</Text> : null}
          </View>
          <View style={[isDesktop && s.colHalf]}>
            <Text style={s.fieldLabel}>Phone <Text style={s.required}>*</Text></Text>
            <TextInput
              style={[s.input, errors.phone && s.inputError]}
              placeholder="(555) 555-5555"
              value={contact.phone}
              onChangeText={(phone) => setContact((c) => ({ ...c, phone }))}
              keyboardType="phone-pad"
            />
            {errors.phone ? <Text style={s.errorText}>{errors.phone}</Text> : null}
          </View>
        </View>
        <Text style={[s.fieldLabel, { marginTop: 14 }]}>Email <Text style={s.required}>*</Text></Text>
        <TextInput
          style={[s.input, errors.email && s.inputError]}
          placeholder="you@example.com"
          value={contact.email}
          onChangeText={(email) => setContact((c) => ({ ...c, email }))}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        {errors.email ? <Text style={s.errorText}>{errors.email}</Text> : null}

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

        {error ? <Text style={[s.errorText, { marginTop: 12 }]}>{error}</Text> : null}

        <TouchableOpacity
          style={[s.submitBtn, { backgroundColor: theme.colors.brand, marginTop: 24 }, loading && { opacity: 0.6 }]}
          onPress={handleContinue}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={s.submitText}>Continue to payment</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Outer component — creates PaymentIntent after valid email ────────────────
export default function CheckoutScreen({ navigation }) {
  const { restaurant } = useRestaurantContext();
  const { total } = useCartContext();
  const { theme } = useTheme();
  const { width } = useWindowDimensions();
  const isDesktop = width >= BREAKPOINT;

  const [contact, setContact] = useState({
    name: '',
    phone: '',
    email: '',
    marketingOptIn: false,
  });
  const [clientSecret, setClientSecret] = useState(null);
  const [piError, setPiError] = useState(null);
  const [piLoading, setPiLoading] = useState(false);

  const hasConnectAccount = Boolean(restaurant?.stripe_account_id);

  const stripePromise = useMemo(() => {
    const pk = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    if (!pk) return null;
    return loadStripe(pk);
  }, []);

  const handleContinueToPayment = async () => {
    if (!restaurant?.id || !hasConnectAccount || !total) return;
    setPiLoading(true);
    setPiError(null);
    try {
      const secret = await createPaymentIntent(total, restaurant.id, {
        email: contact.email.trim(),
      });
      setClientSecret(secret);
    } catch (e) {
      setPiError(e.message);
    } finally {
      setPiLoading(false);
    }
  };

  const handleEditContact = () => {
    setClientSecret(null);
    setPiError(null);
  };

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

      {!clientSecret ? (
        <ContactStep
          theme={theme}
          isDesktop={isDesktop}
          contact={contact}
          setContact={setContact}
          onContinue={handleContinueToPayment}
          loading={piLoading}
          error={piError}
        />
      ) : (
        <Elements stripe={stripePromise} options={{ clientSecret, appearance }}>
          <CheckoutForm
            navigation={navigation}
            isDesktop={isDesktop}
            theme={theme}
            restaurant={restaurant}
            contact={{
              ...contact,
              email: contact.email.trim(),
              name: contact.name.trim(),
              phone: contact.phone.trim(),
            }}
            onEditContact={handleEditContact}
          />
        </Elements>
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
