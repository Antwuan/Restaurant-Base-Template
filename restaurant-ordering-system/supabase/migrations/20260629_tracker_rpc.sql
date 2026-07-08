-- RPC function allowing anonymous clients to look up their own orders by phone number.
-- SECURITY DEFINER bypasses RLS so no anon SELECT policy is needed on the orders table.
CREATE OR REPLACE FUNCTION get_orders_by_phone(
  p_restaurant_id uuid,
  p_phone        text
)
RETURNS TABLE (
  id                       bigint,
  restaurant_id            uuid,
  order_number             text,
  customer_name            text,
  customer_phone           text,
  items                    jsonb,
  subtotal                 numeric,
  tax                      numeric,
  total                    numeric,
  status                   text,
  order_type               text,
  scheduled_time           timestamptz,
  notes                    text,
  created_at               timestamptz
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT
    o.id,
    o.restaurant_id,
    o.order_number,
    o.customer_name,
    o.customer_phone,
    o.items,
    o.subtotal,
    o.tax,
    o.total,
    o.status,
    o.order_type,
    o.scheduled_time,
    o.notes,
    o.created_at
  FROM orders o
  WHERE o.restaurant_id = p_restaurant_id
    AND o.customer_phone = p_phone
    AND o.status <> 'cancelled'
    AND o.created_at >= now() - interval '48 hours'
  ORDER BY o.created_at DESC
  LIMIT 5;
$$;

-- Allow anon and authenticated roles to call this function.
GRANT EXECUTE ON FUNCTION get_orders_by_phone(uuid, text) TO anon, authenticated;

-- Enable Supabase Realtime publication for the orders table (idempotent).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'orders'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE orders;
  END IF;
END$$;
