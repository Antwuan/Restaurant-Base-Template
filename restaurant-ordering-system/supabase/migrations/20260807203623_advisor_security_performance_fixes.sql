-- Resolve Supabase Advisor security + performance warnings.
-- App uses PostgREST/supabase-js only (no GraphQL).

-- ---------------------------------------------------------------------------
-- 1) Disable unused pg_graphql (clears schema-exposure lints 0026/0027)
-- ---------------------------------------------------------------------------
DROP EXTENSION IF EXISTS pg_graphql;

-- ---------------------------------------------------------------------------
-- 2) Pin search_path on trigger/helper functions (lint 0011)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_order_number()
RETURNS text
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RETURN 'ORD-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.set_order_number()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.order_number := generate_order_number();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.promo_codes_normalize_code()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.code = upper(trim(NEW.code));
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3) Revoke RPC execute on trigger-only SECURITY DEFINER helpers (0028/0029)
--    place_customer_order stays executable (intentional guest checkout RPC).
--    is_staff_for_restaurant stays executable (used by RLS policies).
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.handle_new_customer_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.handle_new_customer_user() FROM anon, authenticated;

REVOKE ALL ON FUNCTION public.increment_promo_redemption_on_order() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.increment_promo_redemption_on_order() FROM anon, authenticated;

-- Trigger helpers should not be callable via /rest/v1/rpc
REVOKE ALL ON FUNCTION public.generate_order_number() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.generate_order_number() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.set_order_number() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_order_number() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.promo_codes_normalize_code() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.promo_codes_normalize_code() FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4) FK covering indexes (lint 0001)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_menu_carousel_slides_restaurant_id
  ON public.menu_carousel_slides (restaurant_id);
CREATE INDEX IF NOT EXISTS idx_menu_categories_restaurant_id
  ON public.menu_categories (restaurant_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_category_id
  ON public.menu_items (category_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_restaurant_id
  ON public.menu_items (restaurant_id);
CREATE INDEX IF NOT EXISTS idx_orders_restaurant_id
  ON public.orders (restaurant_id);
CREATE INDEX IF NOT EXISTS idx_promo_codes_menu_item_id
  ON public.promo_codes (menu_item_id);
CREATE INDEX IF NOT EXISTS idx_restaurant_customers_restaurant_id
  ON public.restaurant_customers (restaurant_id);
CREATE INDEX IF NOT EXISTS idx_restaurant_staff_auth_user_id
  ON public.restaurant_staff (auth_user_id);
CREATE INDEX IF NOT EXISTS idx_restaurant_staff_restaurant_id
  ON public.restaurant_staff (restaurant_id);
CREATE INDEX IF NOT EXISTS idx_reward_offers_menu_item_id
  ON public.reward_offers (menu_item_id);
CREATE INDEX IF NOT EXISTS idx_reward_redemptions_offer_id
  ON public.reward_redemptions (offer_id);
CREATE INDEX IF NOT EXISTS idx_reward_redemptions_restaurant_id
  ON public.reward_redemptions (restaurant_id);

-- ---------------------------------------------------------------------------
-- 5) Drop duplicate permissive policies
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Public read access" ON public.menu_categories;
DROP POLICY IF EXISTS "Public read available items" ON public.menu_items;
DROP POLICY IF EXISTS "Staff full access" ON public.menu_items;
DROP POLICY IF EXISTS "Public read access" ON public.restaurants;
DROP POLICY IF EXISTS "Customers can insert" ON public.orders;
DROP POLICY IF EXISTS "orders_insert_customer" ON public.orders;
DROP POLICY IF EXISTS "Staff can view own restaurant" ON public.orders;
DROP POLICY IF EXISTS "Staff can update own restaurant" ON public.orders;

-- ---------------------------------------------------------------------------
-- 6) RLS initplan fixes + consolidate overlapping SELECT policies
--    Replace auth.uid()/auth.role() with (select auth.uid()) / (select auth.role())
-- ---------------------------------------------------------------------------

-- restaurant_staff
DROP POLICY IF EXISTS "Staff can view self" ON public.restaurant_staff;
CREATE POLICY "Staff can view self" ON public.restaurant_staff
  FOR SELECT
  USING (auth_user_id = (SELECT auth.uid()));

-- restaurant_customers
DROP POLICY IF EXISTS customers_select_own ON public.restaurant_customers;
DROP POLICY IF EXISTS customers_select_staff ON public.restaurant_customers;
CREATE POLICY customers_select ON public.restaurant_customers
  FOR SELECT
  USING (
    auth_user_id = (SELECT auth.uid())
    OR public.is_staff_for_restaurant(restaurant_id)
  );

DROP POLICY IF EXISTS customers_insert_own ON public.restaurant_customers;
CREATE POLICY customers_insert_own ON public.restaurant_customers
  FOR INSERT
  WITH CHECK (auth_user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS customers_update_own ON public.restaurant_customers;
CREATE POLICY customers_update_own ON public.restaurant_customers
  FOR UPDATE
  USING (auth_user_id = (SELECT auth.uid()))
  WITH CHECK (auth_user_id = (SELECT auth.uid()));

-- reward_redemptions
DROP POLICY IF EXISTS redemptions_select_own ON public.reward_redemptions;
DROP POLICY IF EXISTS redemptions_select_staff ON public.reward_redemptions;
CREATE POLICY redemptions_select ON public.reward_redemptions
  FOR SELECT
  USING (
    customer_id IN (
      SELECT rc.id
      FROM public.restaurant_customers rc
      WHERE rc.auth_user_id = (SELECT auth.uid())
    )
    OR public.is_staff_for_restaurant(restaurant_id)
  );

DROP POLICY IF EXISTS redemptions_insert_own ON public.reward_redemptions;
CREATE POLICY redemptions_insert_own ON public.reward_redemptions
  FOR INSERT
  WITH CHECK (
    customer_id IN (
      SELECT rc.id
      FROM public.restaurant_customers rc
      WHERE rc.auth_user_id = (SELECT auth.uid())
    )
  );

-- promo_codes
DROP POLICY IF EXISTS promo_codes_select_own_issued ON public.promo_codes;
DROP POLICY IF EXISTS promo_codes_select_staff ON public.promo_codes;
CREATE POLICY promo_codes_select ON public.promo_codes
  FOR SELECT
  USING (
    public.is_staff_for_restaurant(restaurant_id)
    OR issued_to_customer_id IN (
      SELECT rc.id
      FROM public.restaurant_customers rc
      WHERE rc.auth_user_id = (SELECT auth.uid())
    )
  );

-- menu_carousel_slides: active public OR staff
DROP POLICY IF EXISTS carousel_select_active ON public.menu_carousel_slides;
DROP POLICY IF EXISTS carousel_select_staff ON public.menu_carousel_slides;
CREATE POLICY carousel_select ON public.menu_carousel_slides
  FOR SELECT
  USING (
    is_active = true
    OR public.is_staff_for_restaurant(restaurant_id)
  );

-- menu_gallery_images: active public OR staff
DROP POLICY IF EXISTS gallery_select_active ON public.menu_gallery_images;
DROP POLICY IF EXISTS gallery_select_staff ON public.menu_gallery_images;
CREATE POLICY gallery_select ON public.menu_gallery_images
  FOR SELECT
  USING (
    is_active = true
    OR public.is_staff_for_restaurant(restaurant_id)
  );

-- reward_offers: active public OR staff
DROP POLICY IF EXISTS reward_offers_select_public ON public.reward_offers;
DROP POLICY IF EXISTS reward_offers_select_staff ON public.reward_offers;
CREATE POLICY reward_offers_select ON public.reward_offers
  FOR SELECT
  USING (
    is_active = true
    OR public.is_staff_for_restaurant(restaurant_id)
  );

-- menu_items: available public OR staff (drop duplicate public selects already done)
DROP POLICY IF EXISTS menu_items_select_public ON public.menu_items;
DROP POLICY IF EXISTS menu_items_select_staff ON public.menu_items;
CREATE POLICY menu_items_select ON public.menu_items
  FOR SELECT
  USING (
    is_available = true
    OR public.is_staff_for_restaurant(restaurant_id)
  );

-- menu_item_modifier_groups: public read + staff write (not ALL, so SELECT isn't doubled)
DROP POLICY IF EXISTS "Public read modifier groups" ON public.menu_item_modifier_groups;
DROP POLICY IF EXISTS "Staff write modifier groups" ON public.menu_item_modifier_groups;
CREATE POLICY modifier_groups_select_public ON public.menu_item_modifier_groups
  FOR SELECT
  USING (true);
CREATE POLICY modifier_groups_insert_staff ON public.menu_item_modifier_groups
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.menu_items mi
      WHERE mi.id = menu_item_id
        AND public.is_staff_for_restaurant(mi.restaurant_id)
    )
  );
CREATE POLICY modifier_groups_update_staff ON public.menu_item_modifier_groups
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.menu_items mi
      WHERE mi.id = menu_item_id
        AND public.is_staff_for_restaurant(mi.restaurant_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.menu_items mi
      WHERE mi.id = menu_item_id
        AND public.is_staff_for_restaurant(mi.restaurant_id)
    )
  );
CREATE POLICY modifier_groups_delete_staff ON public.menu_item_modifier_groups
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.menu_items mi
      WHERE mi.id = menu_item_id
        AND public.is_staff_for_restaurant(mi.restaurant_id)
    )
  );

-- menu_item_modifier_options
DROP POLICY IF EXISTS "Public read modifier options" ON public.menu_item_modifier_options;
DROP POLICY IF EXISTS "Staff write modifier options" ON public.menu_item_modifier_options;
CREATE POLICY modifier_options_select_public ON public.menu_item_modifier_options
  FOR SELECT
  USING (true);
CREATE POLICY modifier_options_insert_staff ON public.menu_item_modifier_options
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.menu_item_modifier_groups g
      JOIN public.menu_items mi ON mi.id = g.menu_item_id
      WHERE g.id = group_id
        AND public.is_staff_for_restaurant(mi.restaurant_id)
    )
  );
CREATE POLICY modifier_options_update_staff ON public.menu_item_modifier_options
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.menu_item_modifier_groups g
      JOIN public.menu_items mi ON mi.id = g.menu_item_id
      WHERE g.id = group_id
        AND public.is_staff_for_restaurant(mi.restaurant_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.menu_item_modifier_groups g
      JOIN public.menu_items mi ON mi.id = g.menu_item_id
      WHERE g.id = group_id
        AND public.is_staff_for_restaurant(mi.restaurant_id)
    )
  );
CREATE POLICY modifier_options_delete_staff ON public.menu_item_modifier_options
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM public.menu_item_modifier_groups g
      JOIN public.menu_items mi ON mi.id = g.menu_item_id
      WHERE g.id = group_id
        AND public.is_staff_for_restaurant(mi.restaurant_id)
    )
  );
