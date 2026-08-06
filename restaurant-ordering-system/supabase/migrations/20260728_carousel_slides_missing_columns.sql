-- Fix menu_carousel_slides schema drift vs app payload.
-- Runtime error (PGRST204): Could not find the 'alt_text' column of
-- 'menu_carousel_slides' in the schema cache.
--
-- Run in Supabase SQL Editor, then (optional) reload the API schema:
--   Dashboard → Settings → API → Reload schema
-- or wait a few seconds for PostgREST to refresh.

ALTER TABLE public.menu_carousel_slides
  ADD COLUMN IF NOT EXISTS storage_path text,
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS alt_text text,
  ADD COLUMN IF NOT EXISTS link_url text,
  ADD COLUMN IF NOT EXISTS sort_order int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Ensure media_type / media_url exist for older hand-created tables
ALTER TABLE public.menu_carousel_slides
  ADD COLUMN IF NOT EXISTS media_type text,
  ADD COLUMN IF NOT EXISTS media_url text;

-- Tighten media_type when possible (ignore if constraint already exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'menu_carousel_slides_media_type_check'
  ) THEN
    ALTER TABLE public.menu_carousel_slides
      ADD CONSTRAINT menu_carousel_slides_media_type_check
      CHECK (media_type IS NULL OR media_type IN ('image', 'video'));
  END IF;
END $$;
