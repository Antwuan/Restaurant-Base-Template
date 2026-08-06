/**
 * Create restaurant_customers row after signup even when email confirmation
 * leaves the client with no JWT (RLS insert impossible).
 *
 * Body: { restaurantId, userId, email }
 * Verifies auth.users via Admin API: email match + metadata.restaurant_id.
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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { restaurantId, userId, email } = await req.json();
    const trimmedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const rid = typeof restaurantId === 'string' ? restaurantId.trim() : '';
    const uid = typeof userId === 'string' ? userId.trim() : '';

    if (!rid || !uid || !trimmedEmail) {
      return json({ error: 'restaurantId, userId, and email are required' }, 400);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const { data: userData, error: userErr } = await supabase.auth.admin.getUserById(uid);
    if (userErr || !userData?.user) {
      return json({ error: 'User not found' }, 404);
    }

    const user = userData.user;
    const userEmail = String(user.email || '').trim().toLowerCase();
    if (userEmail !== trimmedEmail) {
      return json({ error: 'Email does not match user' }, 403);
    }

    const metaRestaurantId = String(user.user_metadata?.restaurant_id || '').trim();
    // Prefer metadata match; if metadata missing (older signups), still allow
    // when email matches a real auth user (admin API already verified).
    if (metaRestaurantId && metaRestaurantId !== rid) {
      return json({ error: 'restaurantId does not match signup metadata' }, 403);
    }

    // Skip staff accounts
    const { data: staff } = await supabase
      .from('restaurant_staff')
      .select('id')
      .eq('auth_user_id', uid)
      .maybeSingle();
    if (staff) {
      return json({ skipped: true, reason: 'staff_account' });
    }

    const { data: existing } = await supabase
      .from('restaurant_customers')
      .select('id, restaurant_id, email, auth_user_id, created_at')
      .eq('restaurant_id', rid)
      .eq('auth_user_id', uid)
      .maybeSingle();

    if (existing) {
      return json({ ok: true, profile: existing, created: false });
    }

    const { data: created, error: insertErr } = await supabase
      .from('restaurant_customers')
      .insert({
        restaurant_id: rid,
        auth_user_id: uid,
        email: trimmedEmail,
      })
      .select('id, restaurant_id, email, auth_user_id, created_at')
      .single();

    if (insertErr) {
      console.error('ensure-customer-profile insert error:', insertErr);
      return json({ error: insertErr.message || 'Insert failed' }, 500);
    }

    return json({ ok: true, profile: created, created: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('ensure-customer-profile error:', message);
    return json({ error: message }, 500);
  }
});
