/**
 * Per-restaurant Resend domain onboarding.
 * Actions: create | verify | status | save_settings
 * Auth: Bearer JWT of restaurant_staff for restaurantId (admin).
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

const BACKFILL_LIMIT = 25;

async function invokeSyncMarketingContact(opts: {
  restaurantId: string;
  email: string;
  fullName?: string;
  phone?: string | null;
}) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const res = await fetch(`${supabaseUrl}/functions/v1/sync-marketing-contact`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      restaurantId: opts.restaurantId,
      email: opts.email,
      fullName: opts.fullName || undefined,
      phone: opts.phone || undefined,
      marketingOptIn: true,
    }),
  });
  let payload: { ok?: boolean; skipped?: boolean; error?: string } = {};
  try {
    payload = await res.json();
  } catch {
    payload = { error: `sync-marketing-contact returned ${res.status}` };
  }
  if (!res.ok && !payload.error) payload.error = `sync-marketing-contact returned ${res.status}`;
  return payload;
}

async function backfillPendingMarketingContacts(
  supabase: ReturnType<typeof createClient>,
  restaurantId: string,
) {
  const { data: pending, error } = await supabase
    .from('restaurant_customers')
    .select('id, email, first_name, last_name, phone')
    .eq('restaurant_id', restaurantId)
    .eq('marketing_opt_in', true)
    .is('resend_contact_id', null)
    .limit(BACKFILL_LIMIT);

  if (error) {
    console.error('domain-verify backfill query error:', error);
    return { processed: 0, skipped: 0, failed: 0, total: 0, error: error.message };
  }

  const rows = pending || [];
  let processed = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows) {
    const email = typeof row.email === 'string' ? row.email.trim() : '';
    if (!email) {
      failed += 1;
      continue;
    }
    try {
      const result = await invokeSyncMarketingContact({
        restaurantId,
        email,
        fullName: [row.first_name, row.last_name].filter(Boolean).join(' '),
        phone: row.phone,
      });
      if (result.error) failed += 1;
      else if (result.skipped) skipped += 1;
      else processed += 1;
    } catch (err) {
      console.error('domain-verify backfill contact error:', err);
      failed += 1;
    }
  }

  return {
    processed,
    skipped,
    failed,
    total: rows.length,
    hasMore: rows.length === BACKFILL_LIMIT,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action, restaurantId } = body;
    if (!restaurantId || !action) {
      return json({ error: 'restaurantId and action are required' }, 400);
    }

    const staffErr = await requireRestaurantStaff(req, String(restaurantId).trim());
    if (staffErr) return staffErr;

    const apiKey = Deno.env.get('RESEND_API_KEY');
    if (!apiKey) return json({ error: 'RESEND_API_KEY is not configured' }, 500);

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
      let backfill: Awaited<ReturnType<typeof backfillPendingMarketingContacts>> | undefined;
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

        if (action === 'verify') {
          try {
            backfill = await backfillPendingMarketingContacts(supabase, restaurantId);
          } catch (err) {
            console.error('domain-verify backfill error:', err);
          }
        }
      }

      return json({
        ok: true,
        status,
        records: domainData?.records || [],
        domainId,
        fromEmail: restaurant.resend_from_email,
        ...(backfill ? { backfill } : {}),
      });
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return json({ error: message }, 500);
  }
});
