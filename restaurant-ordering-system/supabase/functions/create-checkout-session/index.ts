import Stripe from 'npm:stripe@17';
import { createClient } from 'npm:@supabase/supabase-js@2';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '');

const CONNECT_ONBOARDING_ERROR =
  'Complete Stripe Connect onboarding for this restaurant';
const V2_STRIPE_VERSION = '2025-12-15.clover';

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

function stripeErrorMessage(err: unknown): string {
  if (err && typeof err === 'object') {
    const rec = err as { message?: unknown; raw?: { message?: unknown } };
    if (typeof rec.message === 'string' && rec.message.trim()) return rec.message;
    if (typeof rec.raw?.message === 'string' && rec.raw.message.trim()) return rec.raw.message;
  }
  return err instanceof Error ? err.message : '';
}

function isDestinationCapabilityFailure(message: string): boolean {
  if (!message) return false;
  if (/complete stripe connect onboarding for this restaurant/i.test(message)) return true;
  return (
    /destination account needs to/i.test(message)
    || /cannot create a destination charge/i.test(message)
    || /does not have the [`']?transfers[`']? capability/i.test(message)
    || /stripe_transfers/i.test(message)
    || /receive transfers/i.test(message)
    || /platform account as a destination/i.test(message)
    || /destination cannot be the same/i.test(message)
  );
}

function mapCheckoutError(err: unknown): string {
  const message = stripeErrorMessage(err);
  if (isDestinationCapabilityFailure(message)) return CONNECT_ONBOARDING_ERROR;
  return message || 'Internal server error';
}

function v2TransfersStatus(account: Stripe.Account, extra?: string | null): string | null {
  const fromAccount = (account as Stripe.Account & V2AccountFields).configuration
    ?.recipient?.capabilities?.stripe_balance?.stripe_transfers?.status;
  return fromAccount ?? extra ?? null;
}

function isTransfersActive(account: Stripe.Account, v2Status?: string | null): boolean {
  return account.capabilities?.transfers === 'active'
    || v2TransfersStatus(account, v2Status) === 'active';
}

async function requestV2StripeTransfers(accountId: string): Promise<string | null> {
  const secret = Deno.env.get('STRIPE_SECRET_KEY') ?? '';
  if (!secret) return null;
  try {
    const res = await fetch(
      `https://api.stripe.com/v2/core/accounts/${encodeURIComponent(accountId)}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${secret}`,
          'Content-Type': 'application/json',
          'Stripe-Version': V2_STRIPE_VERSION,
        },
        body: JSON.stringify({
          configuration: {
            recipient: {
              capabilities: {
                stripe_balance: {
                  stripe_transfers: { requested: true },
                },
              },
            },
          },
        }),
      },
    );
    if (!res.ok) return null;
    const json = await res.json() as V2AccountFields;
    return json.configuration?.recipient?.capabilities?.stripe_balance?.stripe_transfers?.status
      ?? null;
  } catch {
    return null;
  }
}

/** Dashboard deploys do not include ../_shared — keep this helper inlined. */
async function ensureConnectTransfers(stripeClient: Stripe, accountId: string): Promise<void> {
  let account: Stripe.Account;
  try {
    account = await stripeClient.accounts.retrieve(accountId);
  } catch (err) {
    const message = stripeErrorMessage(err);
    if (/no such account|does not exist|capability|transfers/i.test(message)) {
      throw new Error(CONNECT_ONBOARDING_ERROR);
    }
    throw err;
  }

  if (isTransfersActive(account)) return;

  try {
    account = await stripeClient.accounts.update(accountId, {
      capabilities: { transfers: { requested: true } },
    });
  } catch {
    // Requesting does not finish onboarding.
  }

  const v2Status = await requestV2StripeTransfers(accountId);
  if (isTransfersActive(account, v2Status)) return;

  throw new Error(CONNECT_ONBOARDING_ERROR);
}

/** Skip destination charges when the destination is the platform account itself. */
async function resolveDestinationAccount(
  stripeClient: Stripe,
  accountId: string | null | undefined,
): Promise<string | null> {
  const dest = typeof accountId === 'string' ? accountId.trim() : '';
  if (!dest) return null;

  try {
    const platform = await stripeClient.accounts.retrieve();
    if (platform.id && platform.id === dest) return null;
  } catch {
    // If platform lookup fails, still attempt destination charges.
  }

  await ensureConnectTransfers(stripeClient, dest);
  return dest;
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
    const { items, restaurantId, currency = 'usd', returnUrl } = await req.json();

    if (!Array.isArray(items) || items.length === 0) {
      return new Response(JSON.stringify({ error: 'items array is required' }), {
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

    // Look up this restaurant's connected Stripe account for platform routing
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const { data: restaurant } = await supabase
      .from('restaurants')
      .select('stripe_account_id')
      .eq('id', restaurantId)
      .single();

    const lineItems = items.map((item: { name: string; price: number; quantity: number }) => ({
      price_data: {
        currency,
        product_data: { name: item.name },
        unit_amount: Math.round(item.price * 100),
      },
      quantity: item.quantity,
    }));

    const origin = req.headers.get('origin') ?? '';
    const sessionReturnUrl = returnUrl || `${origin}/confirmation?session_id={CHECKOUT_SESSION_ID}`;

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: 'payment',
      ui_mode: 'custom',
      line_items: lineItems,
      currency,
      return_url: sessionReturnUrl,
      payment_method_types: ['card'],
    };

    // Route payment to restaurant's connected account if configured
    if (restaurant?.stripe_account_id) {
      const destinationAccountId = await resolveDestinationAccount(
        stripe,
        restaurant.stripe_account_id,
      );
      if (destinationAccountId) {
        sessionParams.payment_intent_data = {
          transfer_data: { destination: destinationAccountId },
        };
      }
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    return new Response(
      JSON.stringify({ clientSecret: session.client_secret }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    const message = mapCheckoutError(err);
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
