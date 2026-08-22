/**
 * Admin marketing broadcast to the restaurant's Resend segment.
 * Body: { restaurantId, subject, html, previewText?, name?, promoCodeId? }
 * Auth: Bearer JWT of restaurant_staff for restaurantId (admin).
 * Requires {{{RESEND_UNSUBSCRIBE_URL}}} in html.
 * promoCodeId is optional; when set it must belong to restaurantId.
 * Backfills opted-in customers missing resend_contact_id before sending.
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

/** Inlined: Dashboard deploys cannot import ../_shared. */
const BACKFILL_LIMIT = 200;
const NO_MARKETING_CONTACTS_ERROR = 'No marketing contacts in Resend yet';
const BACKFILL_MAX_BATCHES = 5;

type BackfillResult = {
  processed: number;
  skipped: number;
  failed: number;
  total: number;
  hasMore: boolean;
  error?: string;
};

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

async function backfillMissingResendContacts(
  supabase: ReturnType<typeof createClient>,
  restaurantId: string,
): Promise<BackfillResult> {
  const { data: pending, error: queryErr } = await supabase
    .from('restaurant_customers')
    .select('id, email, first_name, last_name, phone')
    .eq('restaurant_id', restaurantId)
    .eq('marketing_opt_in', true)
    .is('resend_contact_id', null)
    .limit(BACKFILL_LIMIT);

  if (queryErr) {
    return {
      processed: 0,
      skipped: 0,
      failed: 0,
      total: 0,
      hasMore: false,
      error: queryErr.message,
    };
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
      console.error('send-broadcast backfill contact error:', err);
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

async function backfillMissingResendContactsUntilDone(
  supabase: ReturnType<typeof createClient>,
  restaurantId: string,
): Promise<BackfillResult> {
  const acc: BackfillResult = {
    processed: 0,
    skipped: 0,
    failed: 0,
    total: 0,
    hasMore: false,
  };

  for (let i = 0; i < BACKFILL_MAX_BATCHES; i++) {
    const batch = await backfillMissingResendContacts(supabase, restaurantId);
    acc.processed += batch.processed;
    acc.skipped += batch.skipped;
    acc.failed += batch.failed;
    acc.total += batch.total;
    acc.hasMore = batch.hasMore;
    if (batch.error) {
      acc.error = batch.error;
      break;
    }
    if (!batch.hasMore || batch.processed === 0) break;
  }

  return acc;
}

async function countSyncedMarketingContacts(
  supabase: ReturnType<typeof createClient>,
  restaurantId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from('restaurant_customers')
    .select('id', { count: 'exact', head: true })
    .eq('restaurant_id', restaurantId)
    .eq('marketing_opt_in', true)
    .not('resend_contact_id', 'is', null);

  if (error) {
    console.error('countSyncedMarketingContacts error:', error);
    return 0;
  }
  return count ?? 0;
}

function isEmptyResendAudienceError(message: string): boolean {
  const m = message.toLowerCase();
  return /audience has no contacts|no contacts in (this )?audience|segment has no contacts|audience does not have any contacts/
    .test(m);
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

    const backfill = await backfillMissingResendContactsUntilDone(supabase, String(restaurantId).trim());
    if (backfill.error) {
      console.error('send-broadcast backfill error:', backfill.error);
    }

    const syncedCount = await countSyncedMarketingContacts(supabase, String(restaurantId).trim());
    if (syncedCount < 1) {
      const detail = backfill.failed > 0
        ? ' Opted-in customers could not be synced to Resend. Use Sync marketing contacts in Settings and check function logs.'
        : backfill.skipped > 0
          ? ' Opted-in customers were skipped (domain or segment not ready).'
          : ' Opt in a customer (signup, checkout, or Profile), then use Sync marketing contacts in Settings.';
      return json({ error: `${NO_MARKETING_CONTACTS_ERROR}.${detail}` }, 400);
    }

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
      const message = error.message || 'Failed to send broadcast';
      if (isEmptyResendAudienceError(message)) {
        return json({ error: NO_MARKETING_CONTACTS_ERROR }, 400);
      }
      return json({ error: message }, 502);
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
