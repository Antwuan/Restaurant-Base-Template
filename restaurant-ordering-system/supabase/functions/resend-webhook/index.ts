/**
 * Resend webhook: verify Svix signature; sync bounces/complaints/unsubscribes.
 * Secrets: RESEND_API_KEY, RESEND_WEBHOOK_SECRET
 */
import { Resend } from 'npm:resend';
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, svix-id, svix-timestamp, svix-signature',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get('RESEND_API_KEY');
    const webhookSecret = Deno.env.get('RESEND_WEBHOOK_SECRET');
    if (!apiKey || !webhookSecret) {
      return new Response(JSON.stringify({ error: 'Resend webhook secrets not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const payload = await req.text();
    const resend = new Resend(apiKey);

    const event = resend.webhooks.verify({
      payload,
      headers: {
        'svix-id': req.headers.get('svix-id') ?? '',
        'svix-timestamp': req.headers.get('svix-timestamp') ?? '',
        'svix-signature': req.headers.get('svix-signature') ?? '',
      },
      secret: webhookSecret,
    });

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const data = (event as { type: string; data?: Record<string, unknown> }).data || {};
    const email = String(data.to || data.email || '').toLowerCase().trim();
    const type = (event as { type: string }).type;

    if (email && (type === 'email.bounced' || type === 'email.complained')) {
      // Opt out matching restaurant customers
      await supabase
        .from('restaurant_customers')
        .update({ marketing_opt_in: false })
        .ilike('email', email);

      // Best-effort: mark Resend contact unsubscribed
      try {
        await resend.contacts.update({ email, unsubscribed: true });
      } catch {
        // contact may not exist
      }
    }

    if (email && type === 'contact.updated') {
      const unsubscribed = Boolean(data.unsubscribed);
      if (unsubscribed) {
        await supabase
          .from('restaurant_customers')
          .update({ marketing_opt_in: false })
          .ilike('email', email);
      }
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('resend-webhook error:', err);
    return new Response(JSON.stringify({ error: 'Invalid signature' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
