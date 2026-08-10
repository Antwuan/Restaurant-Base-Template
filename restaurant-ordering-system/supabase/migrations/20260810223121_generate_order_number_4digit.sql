-- Replace ORD-YYYYMMDD-XXXX with unique 4-digit order codes (e.g. 4827).
-- Existing rows keep their current order_number values.

CREATE OR REPLACE FUNCTION public.generate_order_number()
RETURNS text
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  candidate text;
  attempts integer := 0;
BEGIN
  LOOP
    attempts := attempts + 1;
    candidate := LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0');

    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.orders WHERE order_number = candidate
    );

    IF attempts >= 100 THEN
      RAISE EXCEPTION 'Could not generate a unique 4-digit order number after % attempts', attempts;
    END IF;
  END LOOP;

  RETURN candidate;
END;
$$;

-- Ensure uniqueness (no duplicate order numbers among existing rows).
CREATE UNIQUE INDEX IF NOT EXISTS orders_order_number_key
  ON public.orders (order_number);

REVOKE ALL ON FUNCTION public.generate_order_number() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.generate_order_number() FROM anon, authenticated;
