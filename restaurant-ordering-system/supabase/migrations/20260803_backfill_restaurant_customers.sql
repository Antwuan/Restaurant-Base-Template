-- Backfill restaurant_customers for auth users who signed up with
-- restaurant_id in user metadata but never got a customer row
-- (email-confirm path with no JWT / broken trigger).
-- Uses NOT EXISTS only (no ON CONFLICT) for broader schema compatibility.

INSERT INTO public.restaurant_customers (restaurant_id, auth_user_id, email)
SELECT
  (u.raw_user_meta_data->>'restaurant_id')::uuid AS restaurant_id,
  u.id AS auth_user_id,
  LOWER(TRIM(u.email)) AS email
FROM auth.users u
WHERE u.email IS NOT NULL
  AND NULLIF(TRIM(COALESCE(u.raw_user_meta_data->>'restaurant_id', '')), '') IS NOT NULL
  AND (u.raw_user_meta_data->>'restaurant_id') ~*
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND NOT EXISTS (
    SELECT 1
    FROM public.restaurant_customers c
    WHERE c.auth_user_id = u.id
      AND c.restaurant_id = (u.raw_user_meta_data->>'restaurant_id')::uuid
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.restaurant_staff s WHERE s.auth_user_id = u.id
  );
