const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

export async function createPaymentIntent(amount, restaurantId) {
  const response = await fetch(`${BACKEND_URL}/create-payment-intent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      amount: Math.round(amount * 100),
      restaurantId,
      currency: 'usd',
    }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.message || 'Failed to initialize payment.');
  }

  const { clientSecret } = await response.json();
  return clientSecret;
}
