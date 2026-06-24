/**
 * Checkout — Stripe.js Card Element + confirmCardPayment.
 * PaymentIntent is created via Supabase Edge Function create-payment-intent.
 */
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
} from 'react-native';
import { loadStripe } from '@stripe/stripe-js';
import { useCartContext } from '../../context/CartContext';
import { useTheme } from '../../theme';
import { useRestaurantContext } from '../../context/RestaurantContext';
import OrderSummary from '../../components/OrderSummary';
import { createPaymentIntent } from '../../services/stripeApi';
import { createOrder } from '../../services/orderService';

const ORDER_TYPES = ['pickup', 'delivery'];
const TIME_OPTIONS = ['ASAP', '15 min', '30 min', '45 min', '1 hour'];

export default function CheckoutScreen({ navigation }) {
  const { restaurant } = useRestaurantContext();
  const { theme } = useTheme();
  const {
    items,
    subtotal,
    tax,
    total,
    clearCart,
  } = useCartContext();

  const mountRef = useRef(null);
  const stripeRef = useRef(null);
  const cardRef = useRef(null);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [orderType, setOrderType] = useState('pickup');
  const [scheduledTime, setScheduledTime] = useState('ASAP');
  const [notes, setNotes] = useState('');
  const [cardComplete, setCardComplete] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [stripeReady, setStripeReady] = useState(false);

  const hasConnectAccount = Boolean(restaurant?.stripe_account_id);

  useEffect(() => {
    let cancelled = false;
    let card;

    (async () => {
      const pk = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY;
      if (!pk || !hasConnectAccount) {
        return;
      }
      const stripe = await loadStripe(pk);
      if (cancelled || !stripe || !mountRef.current) {
        return;
      }
      stripeRef.current = stripe;
      const elements = stripe.elements();
      card = elements.create('card', {
        style: {
          base: {
            fontSize: '16px',
            color: '#111',
            '::placeholder': { color: '#999' },
          },
          invalid: { color: '#cc2222' },
        },
      });
      card.mount(mountRef.current);
      card.on('change', (event) => {
        setCardComplete(!!event.complete);
      });
      cardRef.current = card;
      setStripeReady(true);
    })();

    return () => {
      cancelled = true;
      if (card) {
        try {
          card.unmount();
        } catch {
          // ignore
        }
      }
      cardRef.current = null;
      stripeRef.current = null;
    };
  }, [hasConnectAccount]);

  const validate = () => {
    const errs = {};
    if (!name.trim()) errs.name = 'Name is required';
    if (!phone.trim()) errs.phone = 'Phone number is required';
    if (!hasConnectAccount) {
      errs.card = 'Payments are not configured for this restaurant.';
    } else if (!cardComplete) {
      errs.card = 'Please enter valid card details';
    }
    return errs;
  };

  const handlePlaceOrder = async () => {
    const validationErrors = validate();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    setErrors({});
    setLoading(true);

    const stripe = stripeRef.current;
    const card = cardRef.current;
    if (!stripe || !card) {
      Alert.alert(
        'Payment unavailable',
        'Stripe could not load. Check EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY and try again.',
      );
      setLoading(false);
      return;
    }

    try {
      const clientSecret = await createPaymentIntent(total, restaurant.id);

      const { error: paymentError, paymentIntent } = await stripe.confirmCardPayment(
        clientSecret,
        {
          payment_method: {
            card,
            billing_details: {
              name,
              phone,
              email: email || undefined,
            },
          },
        },
      );

      if (paymentError) {
        Alert.alert('Payment Failed', paymentError.message);
        setLoading(false);
        return;
      }

      const order = await createOrder({
        restaurantId: restaurant.id,
        customerName: name,
        customerPhone: phone,
        customerEmail: email || null,
        items: items.map(
          ({ id, name: itemName, price, quantity, specialInstructions }) => ({
            id,
            name: itemName,
            price,
            quantity,
            special_instructions: specialInstructions || '',
          }),
        ),
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
      Alert.alert(
        'Error',
        err.message || 'Something went wrong. Please try again.',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="height">
      <ScrollView
        style={styles.container}
        contentContainerStyle={{ paddingBottom: 120 }}
      >
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Your Info</Text>

          <Text style={styles.label}>Name *</Text>
          <TextInput
            style={[styles.input, errors.name && styles.inputError]}
            placeholder="Full name"
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
          />
          {errors.name && <Text style={styles.errorText}>{errors.name}</Text>}

          <Text style={styles.label}>Phone *</Text>
          <TextInput
            style={[styles.input, errors.phone && styles.inputError]}
            placeholder="(555) 555-5555"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
          />
          {errors.phone && <Text style={styles.errorText}>{errors.phone}</Text>}

          <Text style={styles.label}>Email (optional)</Text>
          <TextInput
            style={styles.input}
            placeholder="you@example.com"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Order Type</Text>
          <View style={styles.toggleRow}>
            {ORDER_TYPES.map((type) => {
              const selected = orderType === type;
              return (
                <TouchableOpacity
                  key={type}
                  style={[
                    styles.toggleBtn,
                    selected && {
                      backgroundColor: theme.colors.brand,
                      borderColor: theme.colors.brand,
                    },
                  ]}
                  onPress={() => setOrderType(type)}
                >
                  <Text
                    style={[
                      styles.toggleText,
                      selected && { color: '#fff' },
                    ]}
                  >
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Ready Time</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.timeRow}>
              {TIME_OPTIONS.map((opt) => {
                const selected = scheduledTime === opt;
                return (
                  <TouchableOpacity
                    key={opt}
                    style={[
                      styles.timeChip,
                      selected && {
                        backgroundColor: theme.colors.brand,
                        borderColor: theme.colors.brand,
                      },
                    ]}
                    onPress={() => setScheduledTime(opt)}
                  >
                    <Text
                      style={[
                        styles.timeChipText,
                        selected && { color: '#fff' },
                      ]}
                    >
                      {opt}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Special Instructions</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="Allergies, requests, delivery notes…"
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={3}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Order Summary</Text>
          <OrderSummary
            subtotal={subtotal}
            tax={tax}
            total={total}
            orderType={orderType}
            scheduledTime={scheduledTime}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Payment</Text>
          {!process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ? (
            <Text style={styles.errorText}>
              Set EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY in .env to accept cards.
            </Text>
          ) : !hasConnectAccount ? (
            <Text style={styles.errorText}>
              This restaurant has no Stripe Connect account. Set stripe_account_id in Supabase.
            </Text>
          ) : (
            <>
              <View
                ref={mountRef}
                collapsable={false}
                style={styles.cardMount}
              />
              {!stripeReady && (
                <ActivityIndicator style={{ marginTop: 8 }} />
              )}
              {errors.card && (
                <Text style={styles.errorText}>{errors.card}</Text>
              )}
            </>
          )}
        </View>
      </ScrollView>

      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={[
            styles.placeOrderBtn,
            { backgroundColor: theme.colors.brand },
            loading && { opacity: 0.6 },
          ]}
          onPress={handlePlaceOrder}
          disabled={loading || !hasConnectAccount}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.placeOrderText}>
              Place Order · ${total.toFixed(2)}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  section: {
    padding: 20,
    borderBottomWidth: 8,
    borderBottomColor: '#f5f5f5',
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111',
    marginBottom: 14,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#555',
    marginBottom: 6,
    marginTop: 10,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
    color: '#111',
    backgroundColor: '#fafafa',
  },
  inputError: {
    borderColor: '#cc2222',
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  errorText: {
    fontSize: 12,
    color: '#cc2222',
    marginTop: 4,
  },
  toggleRow: {
    flexDirection: 'row',
    gap: 10,
  },
  toggleBtn: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  toggleText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#555',
  },
  timeRow: {
    flexDirection: 'row',
    gap: 8,
    paddingRight: 20,
  },
  timeChip: {
    borderWidth: 1.5,
    borderColor: '#ddd',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  timeChipText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#555',
  },
  cardMount: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    backgroundColor: '#fafafa',
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  placeOrderBtn: {
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
  },
  placeOrderText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },
});
