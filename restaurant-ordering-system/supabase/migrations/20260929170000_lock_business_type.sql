-- Store admins cannot change business_type. Set it with SQL or the
-- createRestaurant script (service role). Dashboard SQL and service_role
-- still can, because auth.role() is not 'authenticated' for those sessions.

CREATE OR REPLACE FUNCTION public.prevent_business_type_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.business_type IS DISTINCT FROM OLD.business_type
     AND auth.role() = 'authenticated' THEN
    RAISE EXCEPTION 'Business type can only be changed in the database';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_business_type_change() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prevent_business_type_change() FROM anon, authenticated;

DROP TRIGGER IF EXISTS restaurants_lock_business_type ON public.restaurants;
CREATE TRIGGER restaurants_lock_business_type
  BEFORE UPDATE ON public.restaurants
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_business_type_change();
