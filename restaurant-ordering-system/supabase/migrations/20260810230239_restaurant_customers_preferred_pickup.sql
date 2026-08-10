-- Persist regular-menu pickup location preference on restaurant_customers.
-- Semantics:
--   preferred_pickup_is_main IS NULL  → never chosen
--   preferred_pickup_is_main = true   → main store (preferred_pickup_location_id NULL)
--   preferred_pickup_is_main = false  → satellite location id

ALTER TABLE public.restaurant_customers
  ADD COLUMN IF NOT EXISTS preferred_pickup_location_id uuid
    REFERENCES public.restaurant_locations(id) ON DELETE SET NULL;

ALTER TABLE public.restaurant_customers
  ADD COLUMN IF NOT EXISTS preferred_pickup_is_main boolean;

CREATE INDEX IF NOT EXISTS idx_customers_preferred_pickup
  ON public.restaurant_customers (preferred_pickup_location_id)
  WHERE preferred_pickup_location_id IS NOT NULL;
