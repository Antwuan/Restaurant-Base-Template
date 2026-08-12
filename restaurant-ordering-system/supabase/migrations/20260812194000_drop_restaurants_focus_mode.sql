-- Remove Focus Mode columns from restaurants (feature retired).

ALTER TABLE public.restaurants
  DROP COLUMN IF EXISTS focus_mode_enabled,
  DROP COLUMN IF EXISTS focus_pin_hash,
  DROP COLUMN IF EXISTS focus_mode_allowed_tabs;
