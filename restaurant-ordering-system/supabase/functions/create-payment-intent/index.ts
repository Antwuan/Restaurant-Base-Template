import Stripe from 'npm:stripe@17';
import { createClient } from 'npm:@supabase/supabase-js@2';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '');

const CONNECT_ONBOARDING_ERROR =
  'Complete Stripe Connect onboarding for this restaurant';

type V2AccountFields = {
  configuration?: {
    recipient?: {
      capabilities?: {
        stripe_balance?: {
          stripe_transfers?: { status?: string | null };
        };
      };
    };
  };
};

function isTransfersActive(account: Stripe.Account): boolean {
  const v1 = account.capabilities?.transfers;
  const v2 = (account as Stripe.Account & V2AccountFields).configuration
    ?.recipient?.capabilities?.stripe_balance?.stripe_transfers?.status;
  return v1 === 'active' || v2 === 'active';
}

function isTransfersRequested(account: Stripe.Account): boolean {
  const v1 = account.capabilities?.transfers;
  if (v1 && v1 !== 'unrequested') return true;
  const v2 = (account as Stripe.Account & V2AccountFields).configuration
    ?.recipient?.capabilities?.stripe_balance?.stripe_transfers?.status;
  if (v2 && v2 !== 'unrequested') return true;
  return false;
}

/** Dashboard deploys do not include ../_shared — keep this helper inlined. */
async function ensureConnectTransfers(stripeClient: Stripe, accountId: string): Promise<void> {
  let account: Stripe.Account;
  try {
    account = await stripeClient.accounts.retrieve(accountId);
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    if (/no such account|does not exist|capability|transfers/i.test(message)) {
      throw new Error(CONNECT_ONBOARDING_ERROR);
    }
    throw err;
  }

  if (isTransfersActive(account)) return;

  if (!isTransfersRequested(account)) {
    try {
      account = await stripeClient.accounts.update(accountId, {
        capabilities: { transfers: { requested: true } },
      });
    } catch {
      // Requesting does not finish onboarding.
    }
    if (isTransfersActive(account)) return;
  }

  throw new Error(CONNECT_ONBOARDING_ERROR);
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const amount = body.amount;
    const restaurantId = body.restaurantId || body.restaurant_id;
    const currency = body.currency || 'usd';
    const email = typeof body.email === 'string' ? body.email.trim() : '';

    if (!amount || amount < 50) {
      return new Response(JSON.stringify({ error: 'amount (cents) is required and must be >= 50' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!restaurantId) {
      return new Response(JSON.stringify({ error: 'restaurantId is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const { data: restaurant } = await supabase
      .from('restaurants')
      .select('stripe_account_id')
      .eq('id', restaurantId)
      .single();

    const piParams: Stripe.PaymentIntentCreateParams = {
      amount: Math.round(Number(amount)),
      currency,
      automatic_payment_methods: { enabled: true },
      metadata: { restaurant_id: restaurantId },
    };

    if (email) {
      piParams.receipt_email = email;
    }

    // Route funds to the restaurant's Connect account when configured
    if (restaurant?.stripe_account_id) {
      await ensureConnectTransfers(stripe, restaurant.stripe_account_id);
      piParams.transfer_data = { destination: restaurant.stripe_account_id };
    }

    const paymentIntent = await stripe.paymentIntents.create(piParams);

    return new Response(
      JSON.stringify({
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
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
