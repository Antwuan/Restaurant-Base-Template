-- Marketing promo codes (checkout-applied), separate from points reward_offers.
-- Run via: supabase db push / SQL Editor

-- ---------------------------------------------------------------------------
-- Helper: updated_at (idempotent)
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
-- Helper: staff check (idempotent)
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
-- promo_codes
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.promo_codes (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id     uuid        NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  code              text        NOT NULL,
  title             text        NOT NULL,
  description       text,
  benefit_type      text        NOT NULL
    CHECK (benefit_type IN ('percent_off', 'amount_off', 'free_item')),
  discount_value    numeric,
  menu_item_id      uuid        REFERENCES public.menu_items(id) ON DELETE SET NULL,
  max_redemptions   int         CHECK (max_redemptions IS NULL OR max_redemptions > 0),
  redemption_count  int         NOT NULL DEFAULT 0 CHECK (redemption_count >= 0),
  starts_at         timestamptz,
  expires_at        timestamptz,
  is_active         boolean     NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT promo_codes_code_restaurant_unique UNIQUE (restaurant_id, code),
  CONSTRAINT promo_codes_benefit_fields CHECK (
    (benefit_type = 'free_item' AND menu_item_id IS NOT NULL)
    OR (benefit_type IN ('percent_off', 'amount_off') AND discount_value IS NOT NULL AND discount_value > 0)
  )
);

CREATE INDEX IF NOT EXISTS idx_promo_codes_restaurant_active
  ON public.promo_codes (restaurant_id, is_active);

CREATE INDEX IF NOT EXISTS idx_promo_codes_restaurant_code
  ON public.promo_codes (restaurant_id, code);

DROP TRIGGER IF EXISTS promo_codes_updated_at ON public.promo_codes;
CREATE TRIGGER promo_codes_updated_at
  BEFORE UPDATE ON public.promo_codes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Normalize code to uppercase on write
CREATE OR REPLACE FUNCTION public.promo_codes_normalize_code()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.code = upper(trim(NEW.code));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS promo_codes_normalize_code ON public.promo_codes;
CREATE TRIGGER promo_codes_normalize_code
  BEFORE INSERT OR UPDATE OF code ON public.promo_codes
  FOR EACH ROW EXECUTE FUNCTION public.promo_codes_normalize_code();

ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;

-- No public SELECT — validation goes through the validate-promo-code edge function (service role).
-- Staff: full CRUD for their restaurant
DROP POLICY IF EXISTS promo_codes_select_staff ON public.promo_codes;
CREATE POLICY promo_codes_select_staff ON public.promo_codes
  FOR SELECT USING (public.is_staff_for_restaurant(restaurant_id));

DROP POLICY IF EXISTS promo_codes_insert_staff ON public.promo_codes;
CREATE POLICY promo_codes_insert_staff ON public.promo_codes
  FOR INSERT WITH CHECK (public.is_staff_for_restaurant(restaurant_id));

DROP POLICY IF EXISTS promo_codes_update_staff ON public.promo_codes;
CREATE POLICY promo_codes_update_staff ON public.promo_codes
  FOR UPDATE USING (public.is_staff_for_restaurant(restaurant_id))
  WITH CHECK (public.is_staff_for_restaurant(restaurant_id));

DROP POLICY IF EXISTS promo_codes_delete_staff ON public.promo_codes;
CREATE POLICY promo_codes_delete_staff ON public.promo_codes
  FOR DELETE USING (public.is_staff_for_restaurant(restaurant_id));

-- ---------------------------------------------------------------------------
-- orders: promo discount columns
-- ---------------------------------------------------------------------------
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS promo_code_id uuid REFERENCES public.promo_codes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS promo_code text,
  ADD COLUMN IF NOT EXISTS discount_amount numeric NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_orders_promo_code_id
  ON public.orders (promo_code_id)
  WHERE promo_code_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Increment redemption_count when an order is created with a promo
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.increment_promo_redemption_on_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.promo_code_id IS NOT NULL THEN
    UPDATE public.promo_codes
    SET redemption_count = redemption_count + 1
    WHERE id = NEW.promo_code_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_increment_promo_redemption ON public.orders;
CREATE TRIGGER orders_increment_promo_redemption
  AFTER INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.increment_promo_redemption_on_order();
