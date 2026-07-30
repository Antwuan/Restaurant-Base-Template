-- Drop masonry gallery layout; keep grid_2 / grid_3 only.

UPDATE public.restaurants
SET gallery_layout = 'grid_2'
WHERE gallery_layout IS NULL OR gallery_layout = 'masonry';

ALTER TABLE public.restaurants
  ALTER COLUMN gallery_layout SET DEFAULT 'grid_2';

ALTER TABLE public.restaurants
  DROP CONSTRAINT IF EXISTS restaurants_gallery_layout_check;

ALTER TABLE public.restaurants
  ADD CONSTRAINT restaurants_gallery_layout_check
  CHECK (gallery_layout IN ('grid_2', 'grid_3'));
