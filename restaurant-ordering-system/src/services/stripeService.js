import { confirmPayment as stripeConfirmPayment } from '@stripe/stripe-react-native';

import { createPaymentIntent } from './stripeApi';

export { createPaymentIntent } from './stripeApi';

export async function confirmPayment(clientSecret, billingDetails) {
  const { paymentIntent, error } = await stripeConfirmPayment(clientSecret, {
    paymentMethodType: 'Card',
    paymentMethodData: { billingDetails },
  });

  if (error) {
    switch (error.code) {
      case 'Canceled':
        throw new Error('Payment was cancelled.');
      case 'Failed':
        throw new Error('Payment failed. Please check your card details.');
      case 'card_declined':
        throw new Error('Your card was declined. Please try a different card.');
      default:
        throw new Error(error.message || 'Payment could not be completed.');
    }
  }

  return paymentIntent;
}

export async function processCheckoutPayment(total, restaurantId, billingDetails) {
  const clientSecret = await createPaymentIntent(total, restaurantId);
  const paymentIntent = await confirmPayment(clientSecret, billingDetails);

  return {
    paymentIntentId: paymentIntent.id,
    status: paymentIntent.status,
  };
}
