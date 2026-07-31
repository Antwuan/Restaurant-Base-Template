/**
 * Admin marketing broadcast to the restaurant's Resend segment.
 * Body: { restaurantId, subject, html, previewText? }
 * Requires {{{RESEND_UNSUBSCRIBE_URL}}} in html.
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

    const { restaurantId, subject, html, previewText, name } = await req.json();

    if (!restaurantId || !subject?.trim() || !html?.trim()) {
      return json({ error: 'restaurantId, subject, and html are required' }, 400);
    }

    if (!String(html).includes('{{{RESEND_UNSUBSCRIBE_URL}}}')) {
      return json({
        error: 'Email body must include {{{RESEND_UNSUBSCRIBE_URL}}} for unsubscribe compliance.',
      }, 400);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const { data: restaurant } = await supabase
      .from('restaurants')
      .select('id, name, resend_from_email, resend_segment_id, resend_marketing_topic_id, email_domain_status')
      .eq('id', restaurantId)
      .single();

    if (!restaurant) return json({ error: 'Restaurant not found' }, 404);

    if (restaurant.email_domain_status !== 'verified' || !restaurant.resend_from_email) {
      return json({
        error: 'Email domain is not verified. Complete domain setup in Settings before sending.',
      }, 400);
    }

    if (!restaurant.resend_segment_id) {
      return json({ error: 'No marketing segment configured. Re-run domain setup.' }, 400);
    }

    if (!restaurant.resend_marketing_topic_id) {
      return json({
        error: 'No marketing topic configured. Re-run domain setup to create a marketing topic.',
      }, 400);
    }

    const resend = new Resend(apiKey);
    const broadcastName = name?.trim() || `${restaurant.name} — ${new Date().toISOString().slice(0, 10)}`;

    const { data, error } = await resend.broadcasts.create({
      name: broadcastName,
      from: restaurant.resend_from_email,
      subject: subject.trim(),
      html: html.trim(),
      previewText: previewText?.trim() || undefined,
      segmentId: restaurant.resend_segment_id,
      topicId: restaurant.resend_marketing_topic_id,
      send: true,
    });

    if (error) {
      console.error('Broadcast error:', error);
      return json({ error: error.message || 'Failed to send broadcast' }, 502);
    }

    return json({ ok: true, broadcastId: data?.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return json({ error: message }, 500);
  }
});
