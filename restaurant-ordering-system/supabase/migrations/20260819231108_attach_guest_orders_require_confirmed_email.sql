-- Guest-order claiming must prove ownership of the checkout email.
-- restaurant_customers.email is client-writable (insert/update RLS) and is
-- populated at signup before confirmation, so matching on it lets anyone
-- who signs up with a victim address attach recent guest orders to their tracker.

CREATE OR REPLACE FUNCTION public.attach_guest_orders_to_customer(p_restaurant_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
  v_auth_email text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_restaurant_id IS NULL THEN
    RAISE EXCEPTION 'restaurant_id is required';
  END IF;

  SELECT lower(trim(u.email))
  INTO v_auth_email
  FROM auth.users u
  WHERE u.id = auth.uid()
    AND u.email_confirmed_at IS NOT NULL
    AND u.email IS NOT NULL
    AND length(trim(u.email)) > 0;

  -- Unconfirmed (or missing) auth email: do not claim guest orders.
  IF v_auth_email IS NULL THEN
    RETURN 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.restaurant_customers rc
    WHERE rc.auth_user_id = auth.uid()
      AND rc.restaurant_id = p_restaurant_id
  ) THEN
    RAISE EXCEPTION 'No customer profile for this restaurant';
  END IF;

  UPDATE public.orders o
  SET customer_id = rc.id
  FROM public.restaurant_customers rc
  WHERE rc.auth_user_id = auth.uid()
    AND rc.restaurant_id = p_restaurant_id
    AND o.restaurant_id = p_restaurant_id
    AND o.customer_id IS NULL
    AND o.customer_email IS NOT NULL
    AND lower(trim(o.customer_email)) = v_auth_email
    AND length(trim(o.customer_email)) > 0
    AND o.created_at >= now() - interval '30 days';

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.attach_guest_orders_to_customer(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.attach_guest_orders_to_customer(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.attach_guest_orders_to_customer(uuid) TO authenticated;
