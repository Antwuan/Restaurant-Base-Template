-- Allow guest + authenticated checkout to INSERT orders.
-- Tracker / edge functions remain the public read path (no broad SELECT).

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS orders_insert_public ON public.orders;
CREATE POLICY orders_insert_public ON public.orders
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    restaurant_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.restaurants r
      WHERE r.id = restaurant_id
    )
  );
