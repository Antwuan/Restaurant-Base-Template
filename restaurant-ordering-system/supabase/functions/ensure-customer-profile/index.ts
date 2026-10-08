/**
 * Create restaurant_customers row after signup even when email confirmation
 * leaves the client with no JWT (RLS insert impossible).
 *
 * Body: { restaurantId, userId, email, firstName?, lastName?, phone?, marketingOptIn? }
 * Verifies auth.users via Admin API: email match + signup metadata.restaurant_id.
 * Tenant is always taken from the auth user's signup metadata — never from an
 * unbound caller-supplied restaurantId.
 * Self-contained for Dashboard deploys (no ../_shared).
 */
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

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

type ProfileRow = {
  marketing_opt_in?: boolean | null;
  email?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
};

/** Best-effort Resend upsert. Failures must not block profile create/patch. */
async function syncIfOptedIn(profile: ProfileRow | null, restaurantId: string) {
  if (profile?.marketing_opt_in !== true || !profile.email) return;
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!supabaseUrl || !serviceRoleKey) return;
  const fullName = [profile.first_name, profile.last_name].filter(Boolean).join(' ');
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/sync-marketing-contact`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        restaurantId,
        email: profile.email,
        fullName: fullName || undefined,
        phone: profile.phone || undefined,
        marketingOptIn: true,
      }),
    });
    if (!res.ok) {
      console.error('ensure-customer-profile Resend sync failed:', res.status, await res.text());
    }
  } catch (err) {
    console.error('ensure-customer-profile Resend sync error:', err);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { restaurantId, userId, email } = body;
    const firstName = normalizeOptionalString(body?.firstName);
    const lastName = normalizeOptionalString(body?.lastName);
    const phone = normalizeOptionalString(body?.phone);
    const marketingOptIn =
      typeof body?.marketingOptIn === 'boolean' ? body.marketingOptIn : null;
    const trimmedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const rid = typeof restaurantId === 'string' ? restaurantId.trim() : '';
    const uid = typeof userId === 'string' ? userId.trim() : '';

    if (!rid || !uid || !trimmedEmail) {
      return json({ error: 'restaurantId, userId, and email are required' }, 400);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // When a user JWT is present, bind userId to the authenticated identity.
    const authHeader = req.headers.get('Authorization') || '';
    const bearer = authHeader.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || '';
    if (bearer && bearer !== anonKey && bearer !== serviceRoleKey && anonKey) {
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: `Bearer ${bearer}` } },
      });
      const { data: authData, error: authErr } = await userClient.auth.getUser();
      if (authErr || !authData?.user) {
        return json({ error: 'Invalid authorization' }, 401);
      }
      if (authData.user.id !== uid) {
        return json({ error: 'userId does not match authenticated user' }, 403);
      }
    }

    const { data: userData, error: userErr } = await supabase.auth.admin.getUserById(uid);
    if (userErr || !userData?.user) {
      return json({ error: 'User not found' }, 404);
    }

    const user = userData.user;
    const userEmail = String(user.email || '').trim().toLowerCase();
    if (userEmail !== trimmedEmail) {
      return json({ error: 'Email does not match user' }, 403);
    }

    // Tenant binding must come from signup metadata on the auth user.
    // Do not allow caller-supplied restaurantId when metadata is absent.
    const metaRestaurantId = String(user.user_metadata?.restaurant_id || '').trim();
    if (!metaRestaurantId || metaRestaurantId !== rid) {
      return json({ error: 'restaurantId does not match signup metadata' }, 403);
    }

    // Block only an admin of this business. The same account can be a
    // customer of every other business it is not linked to as staff.
    const { data: staffRows, error: staffErr } = await supabase
      .from('restaurant_staff')
      .select('id')
      .eq('auth_user_id', uid)
      .eq('restaurant_id', metaRestaurantId)
      .limit(1);
    if (staffErr) {
      console.error('ensure-customer-profile staff lookup:', staffErr);
      return json({ error: 'Could not verify this account' }, 500);
    }
    if (staffRows && staffRows.length > 0) {
      return json({ error: 'This account is an admin for this business.' }, 403);
    }

    const profileSelect =
      'id, restaurant_id, email, auth_user_id, points_balance, first_name, last_name, phone, marketing_opt_in, marketing_opt_in_at';

    const { data: existing } = await supabase
      .from('restaurant_customers')
      .select(profileSelect)
      .eq('restaurant_id', metaRestaurantId)
      .eq('auth_user_id', uid)
      .maybeSingle();

    if (existing) {
      const patch: Record<string, string | boolean> = {};
      if (firstName && !existing.first_name) patch.first_name = firstName;
      if (lastName && !existing.last_name) patch.last_name = lastName;
      if (phone && !existing.phone) patch.phone = phone;
      if (marketingOptIn === true && !existing.marketing_opt_in) {
        patch.marketing_opt_in = true;
        patch.marketing_opt_in_at = new Date().toISOString();
      } else if (marketingOptIn === false && existing.marketing_opt_in == null) {
        patch.marketing_opt_in = false;
      }
      if (Object.keys(patch).length > 0) {
        const { data: patched, error: patchErr } = await supabase
          .from('restaurant_customers')
          .update(patch)
          .eq('id', existing.id)
          .select(profileSelect)
          .single();
        if (patchErr) {
          console.error('ensure-customer-profile patch error:', patchErr);
          return json({ ok: true, profile: existing, created: false });
        }
        await syncIfOptedIn(patched, metaRestaurantId);
        return json({ ok: true, profile: patched, created: false });
      }
      return json({ ok: true, profile: existing, created: false });
    }

    const insertRow: Record<string, unknown> = {
      restaurant_id: metaRestaurantId,
      auth_user_id: uid,
      email: trimmedEmail,
    };
    if (firstName) insertRow.first_name = firstName;
    if (lastName) insertRow.last_name = lastName;
    if (phone) insertRow.phone = phone;
    if (marketingOptIn === true) {
      insertRow.marketing_opt_in = true;
      insertRow.marketing_opt_in_at = new Date().toISOString();
    } else if (marketingOptIn === false) {
      insertRow.marketing_opt_in = false;
    }

    const { data: created, error: insertErr } = await supabase
      .from('restaurant_customers')
      .insert(insertRow)
      .select(profileSelect)
      .single();

    if (insertErr) {
      console.error('ensure-customer-profile insert error:', insertErr);
      return json({ error: insertErr.message || 'Insert failed' }, 500);
    }

    await syncIfOptedIn(created, metaRestaurantId);
    return json({ ok: true, profile: created, created: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('ensure-customer-profile error:', message);
    return json({ error: message }, 500);
  }
});
