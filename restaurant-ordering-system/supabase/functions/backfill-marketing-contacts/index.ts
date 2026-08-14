/**
 * One-shot repair: upsert opted-in restaurant_customers missing resend_contact_id
 * into the restaurant's Resend marketing segment.
 *
 * Body: { restaurantId }
 * Auth: Bearer JWT of restaurant_staff for restaurantId (admin).
 * Reuses sync-marketing-contact for the actual Resend upsert.
 */
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BACKFILL_LIMIT = 200;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization') || '';
    const bearer = authHeader.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || '';
    if (!bearer) return json({ error: 'Authorization required' }, 401);

    const body = await req.json();
    const restaurantId = typeof body?.restaurantId === 'string' ? body.restaurantId.trim() : '';
    if (!restaurantId) return json({ error: 'restaurantId is required' }, 400);

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${bearer}` } },
    });
    const { data: authData, error: authErr } = await userClient.auth.getUser();
    if (authErr || !authData?.user) {
      return json({ error: 'Invalid authorization' }, 401);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const { data: staff } = await supabase
      .from('restaurant_staff')
      .select('id')
      .eq('auth_user_id', authData.user.id)
      .eq('restaurant_id', restaurantId)
      .maybeSingle();

    if (!staff) return json({ error: 'Admin access required' }, 403);

    const { data: restaurant } = await supabase
      .from('restaurants')
      .select('id, email_domain_status, resend_segment_id')
      .eq('id', restaurantId)
      .maybeSingle();

    if (!restaurant) return json({ error: 'Restaurant not found' }, 404);
    if (restaurant.email_domain_status !== 'verified') {
      return json({
        ok: true,
        processed: 0,
        skipped: 0,
        failed: 0,
        total: 0,
        hasMore: false,
        reason: 'Email domain not verified',
      });
    }
    if (!restaurant.resend_segment_id) {
      return json({
        ok: true,
        processed: 0,
        skipped: 0,
        failed: 0,
        total: 0,
        hasMore: false,
        reason: 'No marketing segment configured',
      });
    }

    const { data: pending, error: queryErr } = await supabase
      .from('restaurant_customers')
      .select('id, email, first_name, last_name, phone')
      .eq('restaurant_id', restaurantId)
      .eq('marketing_opt_in', true)
      .is('resend_contact_id', null)
      .limit(BACKFILL_LIMIT);

    if (queryErr) return json({ error: queryErr.message }, 500);

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
        console.error('backfill-marketing-contacts contact error:', err);
        failed += 1;
      }
    }

    return json({
      ok: true,
      processed,
      skipped,
      failed,
      total: rows.length,
      hasMore: rows.length === BACKFILL_LIMIT,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return json({ error: message }, 500);
  }
});
