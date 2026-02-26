/**
 * CheckoutScreen
 * - Full checkout form with name/phone/email fields, pickup vs delivery toggle,
 *   ready‑time chips, special instructions, inline OrderSummary, and Stripe CardField.
 * - Validates required fields, then runs:
 *   stripeService.createPaymentIntent → confirmPayment → orderService.createOrder,
 *   and finally navigates to Confirmation on success.
 *
 * Depends on:
 * - hooks: useCart
 * - services: stripeService, orderService
 * - context: RestaurantContext
 * - theme: useTheme from ../../theme
 * - components: OrderSummary
 * - Stripe SDK: @stripe/stripe-react-native
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Platform,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
} from 'react-native';
import { CardField, useStripe } from '@stripe/stripe-react-native';
import { useCart } from '../../hooks/useCart';
import { useTheme } from '../../theme';
import { useRestaurantContext } from '../../context/RestaurantContext';
import OrderSummary from '../../components/OrderSummary';
import { stripeService } from '../../services/stripeService';
import { orderService } from '../../services/orderService';

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
  } = useCart(restaurant?.id);

  const { confirmPayment } = useStripe();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [orderType, setOrderType] = useState('pickup');
  const [scheduledTime, setScheduledTime] = useState('ASAP');
  const [notes, setNotes] = useState('');
  const [cardComplete, setCardComplete] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

  const validate = () => {
    const errs = {};
    if (!name.trim()) errs.name = 'Name is required';
    if (!phone.trim()) errs.phone = 'Phone number is required';
    if (!cardComplete) errs.card = 'Please enter valid card details';
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

    try {
      // 1. Create payment intent on backend
      const { clientSecret } = await stripeService.createPaymentIntent(
        total,
        restaurant.id,
      );

      // 2. Confirm payment with card details
      const { error: paymentError } = await confirmPayment(clientSecret, {
        paymentMethodType: 'Card',
        paymentMethodData: {
          billingDetails: { name, phone, email },
        },
      });

      if (paymentError) {
        Alert.alert('Payment Failed', paymentError.message);
        setLoading(false);
        return;
      }

      // 3. Create order in Supabase
      const order = await orderService.createOrder({
        restaurant_id: restaurant.id,
        customer_name: name,
        customer_phone: phone,
        customer_email: email || null,
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
        order_type: orderType,
        scheduled_time: scheduledTime === 'ASAP' ? null : scheduledTime,
        notes: notes || null,
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
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={{ paddingBottom: 120 }}
      >
        {/* Customer Info */}
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
          {errors.name && (
            <Text style={styles.errorText}>{errors.name}</Text>
          )}

          <Text style={styles.label}>Phone *</Text>
          <TextInput
            style={[styles.input, errors.phone && styles.inputError]}
            placeholder="(555) 555-5555"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
          />
          {errors.phone && (
            <Text style={styles.errorText}>{errors.phone}</Text>
          )}

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

        {/* Order Type */}
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

        {/* Scheduled Time */}
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

        {/* Special Instructions */}
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

        {/* Order Summary */}
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

        {/* Payment */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Payment</Text>
          <CardField
            postalCodeEnabled={false}
            placeholders={{ number: '4242 4242 4242 4242' }}
            cardStyle={{ backgroundColor: '#f8f8f8', textColor: '#111' }}
            style={styles.cardField}
            onCardChange={(details) => setCardComplete(details.complete)}
          />
          {errors.card && (
            <Text style={styles.errorText}>{errors.card}</Text>
          )}
        </View>
      </ScrollView>

      {/* Fixed bottom CTA */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={[
            styles.placeOrderBtn,
            { backgroundColor: theme.colors.brand },
            loading && { opacity: 0.6 },
          ]}
          onPress={handlePlaceOrder}
          disabled={loading}
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
  cardField: {
    height: 50,
    borderRadius: 8,
    overflow: 'hidden',
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    paddingBottom: Platform.OS === 'ios' ? 34 : 16,
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

