import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet, Platform } from 'react-native';
import { CheckoutElementsProvider, PaymentElement, useCheckout } from '@stripe/react-stripe-js/checkout';
import { loadStripeForCheckout } from '../services/stripeApi';

function PayForm({ onComplete, label, brandColor }) {
  const checkoutState = useCheckout();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (checkoutState.type === 'loading') {
    return <ActivityIndicator style={{ marginVertical: 16 }} />;
  }
  if (checkoutState.type === 'error') {
    return <Text style={styles.error}>{checkoutState.error.message}</Text>;
  }

  const pay = async () => {
    if (submitting) return;
    setSubmitting(true);
    setError('');
    const result = await checkoutState.checkout.confirm();
    if (result.type === 'error') {
      setError(result.error?.message || 'Payment could not be completed.');
      setSubmitting(false);
      return;
    }
    onComplete();
  };

  return (
    <View style={styles.form}>
      <PaymentElement />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <TouchableOpacity style={[styles.button, { backgroundColor: brandColor || '#111' }]} onPress={pay} disabled={submitting}>
        {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{label}</Text>}
      </TouchableOpacity>
    </View>
  );
}

export default function AppointmentCheckoutForm({ clientSecret, label, onComplete, brandColor }) {
  const publishableKey = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  const stripe = useMemo(() => loadStripeForCheckout(publishableKey), [publishableKey]);
  if (Platform.OS !== 'web') {
    return <Text style={styles.error}>Finish this booking in a browser so the card form can load.</Text>;
  }
  if (!publishableKey || !stripe) {
    return <Text style={styles.error}>Set EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY in .env to accept payments.</Text>;
  }
  return (
    <CheckoutElementsProvider
      stripe={stripe}
      options={{ clientSecret }}
    >
      <PayForm onComplete={onComplete} label={label} brandColor={brandColor} />
    </CheckoutElementsProvider>
  );
}

const styles = StyleSheet.create({
  form: { marginTop: 12, gap: 12 },
  button: {
    borderRadius: 10,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  error: { color: '#FF3B30', fontSize: 14, lineHeight: 20, marginTop: 8 },
});
