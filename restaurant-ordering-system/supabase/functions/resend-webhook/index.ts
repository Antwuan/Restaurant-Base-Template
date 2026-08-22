/**
 * Resend webhook: verify Svix signature; sync bounces/complaints/unsubscribes;
 * increment email_broadcasts counters for delivered/opened/clicked/bounced/complained.
 * Secrets: RESEND_API_KEY, RESEND_WEBHOOK_SECRET
 */
import { Resend } from 'npm:resend';
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, svix-id, svix-timestamp, svix-signature',
};

const COUNTER_BY_EVENT: Record<string, string> = {
  'email.delivered': 'delivered_count',
  'email.opened': 'opened_count',
  'email.clicked': 'clicked_count',
  'email.bounced': 'bounced_count',
  'email.complained': 'complained_count',
};

function extractEmail(data: Record<string, unknown>): string {
  const to = data.to ?? data.email;
  if (Array.isArray(to)) return String(to[0] || '').toLowerCase().trim();
  return String(to || '').toLowerCase().trim();
}

function extractBroadcastId(data: Record<string, unknown>): string | null {
  const direct = data.broadcast_id ?? data.broadcastId;
  if (direct) return String(direct);

  const tags = data.tags;
  if (Array.isArray(tags)) {
    for (const tag of tags) {
      if (tag && typeof tag === 'object') {
        const t = tag as { name?: string; value?: string };
        if (t.name === 'broadcast_id' && t.value) return String(t.value);
      }
    }
  } else if (tags && typeof tags === 'object') {
    const map = tags as Record<string, unknown>;
    if (map.broadcast_id) return String(map.broadcast_id);
  }
  return null;
}

function extractEmailId(data: Record<string, unknown>): string | null {
  const id = data.email_id ?? data.id;
  return id ? String(id) : null;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
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
        id: req.headers.get('svix-id') ?? '',
        timestamp: req.headers.get('svix-timestamp') ?? '',
        signature: req.headers.get('svix-signature') ?? '',
      },
      webhookSecret,
    });

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const data = (event as { type: string; data?: Record<string, unknown> }).data || {};
    const email = extractEmail(data);
    const type = (event as { type: string }).type;

    if (email && (type === 'email.bounced' || type === 'email.complained')) {
      await supabase
        .from('restaurant_customers')
        .update({ marketing_opt_in: false })
        .ilike('email', email);

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

    const counterCol = COUNTER_BY_EVENT[type];
    const resendBroadcastId = extractBroadcastId(data);
    const emailId = extractEmailId(data);

    if (counterCol && resendBroadcastId && emailId) {
      const { data: broadcast } = await supabase
        .from('email_broadcasts')
        .select('id')
        .eq('resend_broadcast_id', resendBroadcastId)
        .maybeSingle();

      if (broadcast) {
        const { error: eventErr } = await supabase
          .from('email_broadcast_events')
          .insert({
            broadcast_id: broadcast.id,
            email_id: emailId,
            event_type: type,
          });

        // Unique violation = already counted
        if (!eventErr) {
          const { error: incErr } = await supabase.rpc('increment_email_broadcast_counter', {
            p_broadcast_id: broadcast.id,
            p_column: counterCol,
          });

          if (incErr) {
            console.error('email_broadcasts counter update error:', incErr);
          }
        } else if (eventErr.code !== '23505') {
          console.error('email_broadcast_events insert error:', eventErr);
        }
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
