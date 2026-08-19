/**
 * Admin marketing broadcast to the restaurant's Resend segment.
 * Body: { restaurantId, subject, html, previewText?, name?, promoCodeId? }
 * Auth: Bearer JWT of restaurant_staff for restaurantId (admin).
 * Requires {{{RESEND_UNSUBSCRIBE_URL}}} in html.
 * promoCodeId is optional; when set it must belong to restaurantId.
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

/** Bearer user JWT + restaurant_staff row for restaurantId. Inlined (Dashboard deploys often cannot import ../_shared). */
async function requireRestaurantStaff(req: Request, restaurantId: string): Promise<Response | null> {
  const authHeader = req.headers.get('Authorization') || '';
  const bearer = authHeader.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || '';
  if (!bearer) {
    return json({ error: 'Authorization required' }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${bearer}` } },
  });
  const { data: authData, error: authErr } = await userClient.auth.getUser();
  if (authErr || !authData?.user) {
    return json({ error: 'Invalid authorization' }, 401);
  }

  const supabase = createClient(
    supabaseUrl,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );
  const { data: staff } = await supabase
    .from('restaurant_staff')
    .select('id')
    .eq('auth_user_id', authData.user.id)
    .eq('restaurant_id', restaurantId)
    .maybeSingle();

  if (!staff) {
    return json({ error: 'Admin access required' }, 403);
  }

  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { restaurantId, subject, html, previewText, name, promoCodeId } = await req.json();

    if (!restaurantId || !subject?.trim() || !html?.trim()) {
      return json({ error: 'restaurantId, subject, and html are required' }, 400);
    }

    const staffErr = await requireRestaurantStaff(req, String(restaurantId).trim());
    if (staffErr) return staffErr;

    const apiKey = Deno.env.get('RESEND_API_KEY');
    if (!apiKey) return json({ error: 'RESEND_API_KEY is not configured' }, 500);

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

    let resolvedPromoCodeId: string | null = null;
    const rawPromoId = typeof promoCodeId === 'string' ? promoCodeId.trim() : promoCodeId;
    if (rawPromoId) {
      const { data: promo, error: promoErr } = await supabase
        .from('promo_codes')
        .select('id, restaurant_id')
        .eq('id', rawPromoId)
        .maybeSingle();

      if (promoErr) {
        return json({ error: 'Invalid promo code' }, 400);
      }
      if (!promo) {
        return json({ error: 'Promo code not found' }, 404);
      }
      if (promo.restaurant_id !== restaurantId) {
        return json({ error: 'Promo code does not belong to this restaurant' }, 400);
      }
      resolvedPromoCodeId = promo.id;
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

    const resendBroadcastId = data?.id ? String(data.id) : null;

    const { data: row, error: persistErr } = await supabase
      .from('email_broadcasts')
      .insert({
        restaurant_id: restaurantId,
        resend_broadcast_id: resendBroadcastId,
        subject: subject.trim(),
        preview_text: previewText?.trim() || null,
        name: broadcastName,
        promo_code_id: resolvedPromoCodeId,
        sent_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (persistErr) {
      console.error('email_broadcasts persist error:', persistErr);
      // Broadcast already sent via Resend — surface id but flag persistence failure
      return json({
        ok: true,
        broadcastId: resendBroadcastId,
        warning: 'Broadcast sent but failed to persist metrics row',
      });
    }

    return json({ ok: true, broadcastId: resendBroadcastId, id: row?.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return json({ error: message }, 500);
  }
});
