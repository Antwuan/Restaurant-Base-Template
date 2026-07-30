-- Gallery images + About Us image + gallery layout
-- Run in Supabase SQL Editor or via: supabase db push

-- ---------------------------------------------------------------------------
-- restaurants: about image + gallery layout
-- ---------------------------------------------------------------------------
ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS about_image_url text,
  ADD COLUMN IF NOT EXISTS gallery_layout text NOT NULL DEFAULT 'masonry';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'restaurants_gallery_layout_check'
  ) THEN
    ALTER TABLE public.restaurants
      ADD CONSTRAINT restaurants_gallery_layout_check
      CHECK (gallery_layout IN ('masonry', 'grid_2', 'grid_3'));
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- menu_gallery_images
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.menu_gallery_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  media_url text NOT NULL,
  storage_path text,
  alt_text text,
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gallery_restaurant_active
  ON public.menu_gallery_images (restaurant_id, is_active, sort_order);

DROP TRIGGER IF EXISTS menu_gallery_images_updated_at ON public.menu_gallery_images;
CREATE TRIGGER menu_gallery_images_updated_at
  BEFORE UPDATE ON public.menu_gallery_images
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.menu_gallery_images ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS gallery_select_active ON public.menu_gallery_images;
CREATE POLICY gallery_select_active ON public.menu_gallery_images
  FOR SELECT
  USING (is_active = true);

DROP POLICY IF EXISTS gallery_select_staff ON public.menu_gallery_images;
CREATE POLICY gallery_select_staff ON public.menu_gallery_images
  FOR SELECT
  USING (public.is_staff_for_restaurant(restaurant_id));

DROP POLICY IF EXISTS gallery_insert_staff ON public.menu_gallery_images;
CREATE POLICY gallery_insert_staff ON public.menu_gallery_images
  FOR INSERT
  WITH CHECK (public.is_staff_for_restaurant(restaurant_id));

DROP POLICY IF EXISTS gallery_update_staff ON public.menu_gallery_images;
CREATE POLICY gallery_update_staff ON public.menu_gallery_images
  FOR UPDATE
  USING (public.is_staff_for_restaurant(restaurant_id))
  WITH CHECK (public.is_staff_for_restaurant(restaurant_id));

DROP POLICY IF EXISTS gallery_delete_staff ON public.menu_gallery_images;
CREATE POLICY gallery_delete_staff ON public.menu_gallery_images
  FOR DELETE
  USING (public.is_staff_for_restaurant(restaurant_id));

-- Storage paths (existing menu-images bucket):
--   {restaurant_id}/gallery/{image_id}.jpg
--   {restaurant_id}/about.jpg
