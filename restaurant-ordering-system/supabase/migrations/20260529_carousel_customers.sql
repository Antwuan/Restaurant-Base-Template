-- Carousel slides + restaurant customer profiles
-- Run in Supabase SQL Editor or via: supabase db push

-- ---------------------------------------------------------------------------
-- Helper: staff check (mirrors typical menu_items admin policies)
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
-- Helper: updated_at trigger
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
-- menu_carousel_slides
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.menu_carousel_slides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  media_type text NOT NULL CHECK (media_type IN ('image', 'video')),
  media_url text NOT NULL,
  storage_path text,
  title text,
  alt_text text,
  link_url text,
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_carousel_restaurant_active
  ON public.menu_carousel_slides (restaurant_id, is_active, sort_order);

DROP TRIGGER IF EXISTS menu_carousel_slides_updated_at ON public.menu_carousel_slides;
CREATE TRIGGER menu_carousel_slides_updated_at
  BEFORE UPDATE ON public.menu_carousel_slides
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.menu_carousel_slides ENABLE ROW LEVEL SECURITY;

-- Public / customer: active slides only
DROP POLICY IF EXISTS carousel_select_active ON public.menu_carousel_slides;
CREATE POLICY carousel_select_active ON public.menu_carousel_slides
  FOR SELECT
  USING (is_active = true);

-- Staff: all slides for their restaurant
DROP POLICY IF EXISTS carousel_select_staff ON public.menu_carousel_slides;
CREATE POLICY carousel_select_staff ON public.menu_carousel_slides
  FOR SELECT
  USING (public.is_staff_for_restaurant(restaurant_id));

DROP POLICY IF EXISTS carousel_insert_staff ON public.menu_carousel_slides;
CREATE POLICY carousel_insert_staff ON public.menu_carousel_slides
  FOR INSERT
  WITH CHECK (public.is_staff_for_restaurant(restaurant_id));

DROP POLICY IF EXISTS carousel_update_staff ON public.menu_carousel_slides;
CREATE POLICY carousel_update_staff ON public.menu_carousel_slides
  FOR UPDATE
  USING (public.is_staff_for_restaurant(restaurant_id))
  WITH CHECK (public.is_staff_for_restaurant(restaurant_id));

DROP POLICY IF EXISTS carousel_delete_staff ON public.menu_carousel_slides;
CREATE POLICY carousel_delete_staff ON public.menu_carousel_slides
  FOR DELETE
  USING (public.is_staff_for_restaurant(restaurant_id));

-- ---------------------------------------------------------------------------
-- restaurant_customers
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.restaurant_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  auth_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text,
  phone text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, auth_user_id)
);

CREATE INDEX IF NOT EXISTS idx_customers_auth ON public.restaurant_customers (auth_user_id);
CREATE INDEX IF NOT EXISTS idx_customers_restaurant_email
  ON public.restaurant_customers (restaurant_id, email);

DROP TRIGGER IF EXISTS restaurant_customers_updated_at ON public.restaurant_customers;
CREATE TRIGGER restaurant_customers_updated_at
  BEFORE UPDATE ON public.restaurant_customers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

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
-- Storage policies for carousel media (bucket: menu-images)
-- Paths: {restaurant_id}/carousel/{slide_id}.{ext}
-- Create bucket in Dashboard if missing: public read, authenticated write.
-- ---------------------------------------------------------------------------
-- NOTE: storage.objects policies require the bucket to exist first.
-- Run these after creating the `menu-images` bucket (public):

-- INSERT INTO storage.buckets (id, name, public) VALUES ('menu-images', 'menu-images', true)
-- ON CONFLICT (id) DO NOTHING;

-- DROP POLICY IF EXISTS carousel_storage_public_read ON storage.objects;
-- CREATE POLICY carousel_storage_public_read ON storage.objects
--   FOR SELECT USING (bucket_id = 'menu-images');

-- DROP POLICY IF EXISTS carousel_storage_staff_insert ON storage.objects;
-- CREATE POLICY carousel_storage_staff_insert ON storage.objects
--   FOR INSERT WITH CHECK (
--     bucket_id = 'menu-images'
--     AND public.is_staff_for_restaurant((storage.foldername(name))[1]::uuid)
--   );

-- DROP POLICY IF EXISTS carousel_storage_staff_update ON storage.objects;
-- CREATE POLICY carousel_storage_staff_update ON storage.objects
--   FOR UPDATE USING (
--     bucket_id = 'menu-images'
--     AND public.is_staff_for_restaurant((storage.foldername(name))[1]::uuid)
--   );

-- DROP POLICY IF EXISTS carousel_storage_staff_delete ON storage.objects;
-- CREATE POLICY carousel_storage_staff_delete ON storage.objects
--   FOR DELETE USING (
--     bucket_id = 'menu-images'
--     AND public.is_staff_for_restaurant((storage.foldername(name))[1]::uuid)
--   );
