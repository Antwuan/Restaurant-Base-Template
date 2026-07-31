/**
 * Per-restaurant Resend domain onboarding.
 * Actions: create | verify | status | save_settings
 *
 * create: { restaurantId, domain, fromLocalPart? }
 * verify: { restaurantId }
 * status: { restaurantId }
 * save_settings: { restaurantId, reviewUrl?, autoReviewEmails?, fromEmail? }
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

    const body = await req.json();
    const { action, restaurantId } = body;
    if (!restaurantId || !action) {
      return json({ error: 'restaurantId and action are required' }, 400);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const { data: restaurant, error: restErr } = await supabase
      .from('restaurants')
      .select('*')
      .eq('id', restaurantId)
      .single();

    if (restErr || !restaurant) return json({ error: 'Restaurant not found' }, 404);

    const resend = new Resend(apiKey);

    if (action === 'save_settings') {
      const updates: Record<string, unknown> = {};
      if (typeof body.reviewUrl === 'string') updates.review_url = body.reviewUrl.trim() || null;
      if (typeof body.autoReviewEmails === 'boolean') updates.auto_review_emails = body.autoReviewEmails;
      if (typeof body.fromEmail === 'string' && body.fromEmail.trim()) {
        updates.resend_from_email = body.fromEmail.trim();
      }
      const { data, error } = await supabase
        .from('restaurants')
        .update(updates)
        .eq('id', restaurantId)
        .select()
        .single();
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true, restaurant: data });
    }

    if (action === 'create') {
      const domain = String(body.domain || '').trim().toLowerCase();
      if (!domain || !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(domain)) {
        return json({ error: 'Valid sending domain is required (e.g. mail.joespizza.com)' }, 400);
      }

      const fromLocal = String(body.fromLocalPart || 'hello').trim().toLowerCase() || 'hello';
      const fromEmail = `${restaurant.name} <${fromLocal}@${domain}>`;

      const { data: domainData, error: domainError } = await resend.domains.create({
        name: domain,
        region: body.region || 'us-east-1',
        openTracking: false,
        clickTracking: false,
      });

      if (domainError) {
        return json({ error: domainError.message || 'Failed to create domain' }, 502);
      }

      // Create marketing segment + topic (best-effort)
      let segmentId = restaurant.resend_segment_id;
      let topicId = restaurant.resend_marketing_topic_id;

      if (!segmentId) {
        const { data: segment, error: segErr } = await resend.segments.create({
          name: `${restaurant.name} – Marketing`,
        });
        if (!segErr && segment?.id) segmentId = segment.id;
      }

      if (!topicId) {
        const { data: topic, error: topicErr } = await resend.topics.create({
          name: `${restaurant.name} Deals & Updates`,
          defaultSubscription: 'opt_out',
          description: 'Promotions and restaurant updates',
          visibility: 'public',
        });
        if (!topicErr && topic?.id) topicId = topic.id;
      }

      const { data: updated, error: upErr } = await supabase
        .from('restaurants')
        .update({
          resend_domain_id: domainData?.id,
          resend_from_email: fromEmail,
          resend_segment_id: segmentId,
          resend_marketing_topic_id: topicId,
          email_domain_status: domainData?.status || 'pending',
        })
        .eq('id', restaurantId)
        .select()
        .single();

      if (upErr) return json({ error: upErr.message }, 400);

      return json({
        ok: true,
        domainId: domainData?.id,
        status: domainData?.status,
        records: domainData?.records || [],
        fromEmail,
        restaurant: updated,
      });
    }

    if (action === 'verify' || action === 'status') {
      const domainId = restaurant.resend_domain_id;
      if (!domainId) return json({ error: 'No domain configured. Create a domain first.' }, 400);

      if (action === 'verify') {
        const { error: verifyErr } = await resend.domains.verify(domainId);
        if (verifyErr) {
          return json({ error: verifyErr.message || 'Verify request failed' }, 502);
        }
      }

      const { data: domainData, error: getErr } = await resend.domains.get(domainId);
      if (getErr) return json({ error: getErr.message || 'Failed to fetch domain' }, 502);

      const status = domainData?.status || 'pending';
      await supabase
        .from('restaurants')
        .update({ email_domain_status: status })
        .eq('id', restaurantId);

      // Ensure segment/topic exist once verified
      if (status === 'verified') {
        const updates: Record<string, unknown> = { email_domain_status: 'verified' };
        if (!restaurant.resend_segment_id) {
          const { data: segment } = await resend.segments.create({
            name: `${restaurant.name} – Marketing`,
          });
          if (segment?.id) updates.resend_segment_id = segment.id;
        }
        if (!restaurant.resend_marketing_topic_id) {
          const { data: topic } = await resend.topics.create({
            name: `${restaurant.name} Deals & Updates`,
            defaultSubscription: 'opt_out',
            description: 'Promotions and restaurant updates',
            visibility: 'public',
          });
          if (topic?.id) updates.resend_marketing_topic_id = topic.id;
        }
        if (Object.keys(updates).length > 1) {
          await supabase.from('restaurants').update(updates).eq('id', restaurantId);
        }
      }

      return json({
        ok: true,
        status,
        records: domainData?.records || [],
        domainId,
        fromEmail: restaurant.resend_from_email,
      });
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return json({ error: message }, 500);
  }
});
