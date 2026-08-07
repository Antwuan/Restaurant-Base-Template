-- Fix: restaurant_customers had RLS enabled with zero policies (blocked reads/writes).
-- Add phone, drop unused full_name, restore customer/staff policies.
-- Fix: orders INSERT...RETURNING failed for guests (no SELECT policy) — place via SECURITY DEFINER RPC.

-- ---------------------------------------------------------------------------
-- restaurant_customers columns
-- ---------------------------------------------------------------------------
ALTER TABLE public.restaurant_customers
  ADD COLUMN IF NOT EXISTS phone text;

ALTER TABLE public.restaurant_customers
  DROP COLUMN IF EXISTS full_name;

-- ---------------------------------------------------------------------------
-- restaurant_customers RLS (idempotent)
-- ---------------------------------------------------------------------------
ALTER TABLE public.restaurant_customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS customers_select_own ON public.restaurant_customers;
CREATE POLICY customers_select_own ON public.restaurant_customers
  FOR SELECT
  USING (auth_user_id = auth.uid());

DROP POLICY IF EXISTS customers_select_staff ON public.restaurant_customers;
CREATE POLICY customers_select_staff ON public.restaurant_customers
  FOR SELECT
  USING (public.is_staff_for_restaurant(restaurant_id));

DROP POLICY IF EXISTS customers_insert_own ON public.restaurant_customers;
CREATE POLICY customers_insert_own ON public.restaurant_customers
  FOR INSERT
  WITH CHECK (auth_user_id = auth.uid());

DROP POLICY IF EXISTS customers_update_own ON public.restaurant_customers;
CREATE POLICY customers_update_own ON public.restaurant_customers
  FOR UPDATE
  USING (auth_user_id = auth.uid())
  WITH CHECK (auth_user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- place_customer_order: insert + return row without requiring SELECT RLS
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.place_customer_order(p jsonb)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_order public.orders;
  v_restaurant_id uuid := (p->>'restaurant_id')::uuid;
BEGIN
  IF v_restaurant_id IS NULL THEN
    RAISE EXCEPTION 'restaurant_id is required';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = v_restaurant_id) THEN
    RAISE EXCEPTION 'Invalid restaurant_id';
  END IF;

  INSERT INTO public.orders (
    restaurant_id,
    customer_name,
    customer_phone,
    customer_email,
    items,
    subtotal,
    tax,
    total,
    status,
    order_type,
    menu_type,
    scheduled_time,
    stripe_payment_intent_id,
    notes,
    promo_code_id,
    promo_code,
    discount_amount
  ) VALUES (
    v_restaurant_id,
    NULLIF(TRIM(COALESCE(p->>'customer_name', '')), ''),
    NULLIF(TRIM(COALESCE(p->>'customer_phone', '')), ''),
    NULLIF(TRIM(COALESCE(p->>'customer_email', '')), ''),
    COALESCE(p->'items', '[]'::jsonb),
    COALESCE((p->>'subtotal')::numeric, 0),
    COALESCE((p->>'tax')::numeric, 0),
    COALESCE((p->>'total')::numeric, 0),
    COALESCE(NULLIF(TRIM(COALESCE(p->>'status', '')), ''), 'pending'),
    NULLIF(TRIM(COALESCE(p->>'order_type', '')), ''),
    COALESCE(NULLIF(TRIM(COALESCE(p->>'menu_type', '')), ''), 'regular'),
    CASE
      WHEN p ? 'scheduled_time' AND NULLIF(TRIM(COALESCE(p->>'scheduled_time', '')), '') IS NOT NULL
        THEN (p->>'scheduled_time')::timestamptz
      ELSE NULL
    END,
    NULLIF(TRIM(COALESCE(p->>'stripe_payment_intent_id', '')), ''),
    NULLIF(TRIM(COALESCE(p->>'notes', '')), ''),
    CASE
      WHEN p ? 'promo_code_id' AND NULLIF(TRIM(COALESCE(p->>'promo_code_id', '')), '') IS NOT NULL
        THEN (p->>'promo_code_id')::uuid
      ELSE NULL
    END,
    NULLIF(TRIM(COALESCE(p->>'promo_code', '')), ''),
    COALESCE((p->>'discount_amount')::numeric, 0)
  )
  RETURNING * INTO new_order;

  RETURN new_order;
END;
$$;

REVOKE ALL ON FUNCTION public.place_customer_order(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.place_customer_order(jsonb) TO anon, authenticated;
