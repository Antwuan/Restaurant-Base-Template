-- Rewards, hours of operation, catering order type, and rewards tables.
-- Run in Supabase SQL Editor or via: supabase db push

-- ---------------------------------------------------------------------------
-- Helper: updated_at trigger function (idempotent — may already exist from
-- the 20260529_carousel_customers.sql migration)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Helper: staff check (idempotent — may already exist from earlier migrations)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_staff_for_restaurant(p_restaurant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM restaurant_staff
    WHERE restaurant_id = p_restaurant_id
      AND auth_user_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- restaurants: hours_of_operation + points_per_dollar
-- hours_of_operation shape: { mon: { closed: false, open: "08:00", close: "15:00" }, tue: {...}, ... }
-- ---------------------------------------------------------------------------
ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS hours_of_operation jsonb,
  ADD COLUMN IF NOT EXISTS points_per_dollar numeric NOT NULL DEFAULT 1;

-- ---------------------------------------------------------------------------
-- orders: menu_type column (regular vs catering)
-- ---------------------------------------------------------------------------
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS menu_type text NOT NULL DEFAULT 'regular'
  CHECK (menu_type IN ('regular', 'catering'));

-- ---------------------------------------------------------------------------
-- restaurant_customers: points_balance
-- ---------------------------------------------------------------------------
ALTER TABLE public.restaurant_customers
  ADD COLUMN IF NOT EXISTS points_balance int NOT NULL DEFAULT 0;

-- ---------------------------------------------------------------------------
-- reward_offers
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.reward_offers (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id  uuid        NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  title          text        NOT NULL,
  description    text,
  points_cost    int         NOT NULL CHECK (points_cost > 0),
  is_active      boolean     NOT NULL DEFAULT true,
  sort_order     int         NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reward_offers_restaurant_active
  ON public.reward_offers (restaurant_id, is_active, sort_order);

DROP TRIGGER IF EXISTS reward_offers_updated_at ON public.reward_offers;
CREATE TRIGGER reward_offers_updated_at
  BEFORE UPDATE ON public.reward_offers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.reward_offers ENABLE ROW LEVEL SECURITY;

-- Public: read active offers
DROP POLICY IF EXISTS reward_offers_select_public ON public.reward_offers;
CREATE POLICY reward_offers_select_public ON public.reward_offers
  FOR SELECT USING (is_active = true);

-- Staff: all offers for their restaurant
DROP POLICY IF EXISTS reward_offers_select_staff ON public.reward_offers;
CREATE POLICY reward_offers_select_staff ON public.reward_offers
  FOR SELECT USING (public.is_staff_for_restaurant(restaurant_id));

DROP POLICY IF EXISTS reward_offers_insert_staff ON public.reward_offers;
CREATE POLICY reward_offers_insert_staff ON public.reward_offers
  FOR INSERT WITH CHECK (public.is_staff_for_restaurant(restaurant_id));

DROP POLICY IF EXISTS reward_offers_update_staff ON public.reward_offers;
CREATE POLICY reward_offers_update_staff ON public.reward_offers
  FOR UPDATE USING (public.is_staff_for_restaurant(restaurant_id))
  WITH CHECK (public.is_staff_for_restaurant(restaurant_id));

DROP POLICY IF EXISTS reward_offers_delete_staff ON public.reward_offers;
CREATE POLICY reward_offers_delete_staff ON public.reward_offers
  FOR DELETE USING (public.is_staff_for_restaurant(restaurant_id));

-- ---------------------------------------------------------------------------
-- reward_redemptions
-- customer_id type is detected from restaurant_customers.id so this works
-- whether that table uses uuid or bigint ids.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_type text;
BEGIN
  SELECT format_type(a.atttypid, a.atttypmod) INTO v_type
  FROM pg_attribute a
  WHERE a.attrelid = 'public.restaurant_customers'::regclass
    AND a.attname = 'id';

  EXECUTE format($sql$
    CREATE TABLE IF NOT EXISTS public.reward_redemptions (
      id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
      restaurant_id  uuid        NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
      customer_id    %s          NOT NULL REFERENCES public.restaurant_customers(id) ON DELETE CASCADE,
      offer_id       uuid        REFERENCES public.reward_offers(id) ON DELETE SET NULL,
      points_spent   int         NOT NULL CHECK (points_spent > 0),
      created_at     timestamptz NOT NULL DEFAULT now()
    )
  $sql$, v_type);
END $$;

CREATE INDEX IF NOT EXISTS idx_redemptions_customer
  ON public.reward_redemptions (customer_id);

ALTER TABLE public.reward_redemptions ENABLE ROW LEVEL SECURITY;

-- Customers: read their own redemptions
DROP POLICY IF EXISTS redemptions_select_own ON public.reward_redemptions;
CREATE POLICY redemptions_select_own ON public.reward_redemptions
  FOR SELECT USING (
    customer_id IN (
      SELECT id FROM public.restaurant_customers WHERE auth_user_id = auth.uid()
    )
  );

-- Customers: insert their own redemptions (via service)
DROP POLICY IF EXISTS redemptions_insert_own ON public.reward_redemptions;
CREATE POLICY redemptions_insert_own ON public.reward_redemptions
  FOR INSERT WITH CHECK (
    customer_id IN (
      SELECT id FROM public.restaurant_customers WHERE auth_user_id = auth.uid()
    )
  );

-- Staff: read all redemptions for their restaurant
DROP POLICY IF EXISTS redemptions_select_staff ON public.reward_redemptions;
CREATE POLICY redemptions_select_staff ON public.reward_redemptions
  FOR SELECT USING (public.is_staff_for_restaurant(restaurant_id));
