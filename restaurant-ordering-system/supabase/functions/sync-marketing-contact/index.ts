/**
 * Upsert a Resend contact into the restaurant's marketing segment + topic.
 * Body: { restaurantId, email, fullName?, phone?, marketingOptIn }
 */
import { Resend } from 'npm:resend';
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get('RESEND_API_KEY');
    if (!apiKey) return json({ error: 'RESEND_API_KEY is not configured' }, 500);

    const { restaurantId, email, fullName, phone, marketingOptIn } = await req.json();
    const trimmedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';

    if (!restaurantId || !trimmedEmail) {
      return json({ error: 'restaurantId and email are required' }, 400);
    }
    if (!marketingOptIn) {
      return json({ skipped: true, reason: 'marketingOptIn is false' });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const { data: restaurant } = await supabase
      .from('restaurants')
      .select('id, resend_segment_id, resend_marketing_topic_id, email_domain_status')
      .eq('id', restaurantId)
      .single();

    if (!restaurant) return json({ error: 'Restaurant not found' }, 404);
    if (restaurant.email_domain_status !== 'verified') {
      return json({ skipped: true, reason: 'Email domain not verified' });
    }
    if (!restaurant.resend_segment_id) {
      return json({ skipped: true, reason: 'No marketing segment configured' });
    }

    const resend = new Resend(apiKey);
    const nameParts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
    const firstName = nameParts[0] || undefined;
    const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : undefined;

    const createParams: Record<string, unknown> = {
      email: trimmedEmail,
      firstName,
      lastName,
      unsubscribed: false,
      segments: [{ id: restaurant.resend_segment_id }],
    };

    if (restaurant.resend_marketing_topic_id) {
      createParams.topics = [
        { id: restaurant.resend_marketing_topic_id, subscription: 'opt_in' },
      ];
    }

    if (phone) {
      createParams.properties = { phone: String(phone) };
    }

    let contactId: string | undefined;

    const { data: created, error: createError } = await resend.contacts.create(
      createParams as Parameters<typeof resend.contacts.create>[0],
    );

    if (createError) {
      // Contact may already exist — update + add to segment
      const { data: existing, error: getErr } = await resend.contacts.get({ email: trimmedEmail });
      if (getErr || !existing?.id) {
        return json({ error: createError.message || 'Failed to create contact' }, 502);
      }
      contactId = existing.id;

      await resend.contacts.update({
        email: trimmedEmail,
        firstName,
        lastName,
        unsubscribed: false,
      });

      await resend.contacts.segments.add({
        contactId,
        segmentId: restaurant.resend_segment_id,
      });

      if (restaurant.resend_marketing_topic_id) {
        await resend.contacts.topics.update({
          id: contactId,
          topics: [{ id: restaurant.resend_marketing_topic_id, subscription: 'opt_in' }],
        });
      }
    } else {
      contactId = created?.id;
    }

    // Persist opt-in on restaurant_customers when a matching profile exists
    const now = new Date().toISOString();
    const { data: customers } = await supabase
      .from('restaurant_customers')
      .select('id')
      .eq('restaurant_id', restaurantId)
      .ilike('email', trimmedEmail)
      .limit(5);

    if (customers?.length) {
      await supabase
        .from('restaurant_customers')
        .update({
          marketing_opt_in: true,
          marketing_opt_in_at: now,
          resend_contact_id: contactId || null,
        })
        .in('id', customers.map((c) => c.id));
    }

    return json({ ok: true, contactId });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return json({ error: message }, 500);
  }
});
