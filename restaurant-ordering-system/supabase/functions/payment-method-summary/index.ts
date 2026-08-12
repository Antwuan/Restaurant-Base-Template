import Stripe from 'npm:stripe@17';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function titleCaseBrand(brand: string | null | undefined) {
  if (!brand) return null;
  const key = String(brand).toLowerCase();
  const map: Record<string, string> = {
    visa: 'Visa',
    mastercard: 'Mastercard',
    amex: 'Amex',
    american_express: 'Amex',
    discover: 'Discover',
    diners: 'Diners Club',
    jcb: 'JCB',
    unionpay: 'UnionPay',
    link: 'Link',
  };
  return map[key] || brand.charAt(0).toUpperCase() + brand.slice(1);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const paymentIntentId = body.paymentIntentId || body.payment_intent_id;

    if (!paymentIntentId || typeof paymentIntentId !== 'string') {
      return new Response(JSON.stringify({ error: 'paymentIntentId is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const pi = await stripe.paymentIntents.retrieve(paymentIntentId, {
      expand: ['payment_method'],
    });

    const pm = typeof pi.payment_method === 'object' && pi.payment_method
      ? pi.payment_method
      : null;

    const card = pm?.card ?? null;
    const walletType = card?.wallet?.type || null;
    const brand = titleCaseBrand(card?.brand);
    const last4 = card?.last4 || null;
    const funding = card?.funding || null;

    let label = 'Card';
    if (brand && last4) {
      label = `${brand} •••• ${last4}`;
    } else if (brand) {
      label = brand;
    } else if (last4) {
      label = `Card •••• ${last4}`;
    }

    if (walletType === 'apple_pay') {
      label = brand && last4 ? `Apple Pay · ${brand} •••• ${last4}` : 'Apple Pay';
    } else if (walletType === 'google_pay') {
      label = brand && last4 ? `Google Pay · ${brand} •••• ${last4}` : 'Google Pay';
    } else if (walletType === 'link') {
      label = brand && last4 ? `Link · ${brand} •••• ${last4}` : 'Link';
    }

    return new Response(
      JSON.stringify({
        brand,
        last4,
        funding,
        wallet: walletType,
        label,
        type: pm?.type || 'card',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
