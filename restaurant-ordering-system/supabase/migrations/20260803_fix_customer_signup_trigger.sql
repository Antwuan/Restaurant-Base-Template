-- Fix: previous auth.users trigger could throw and abort signup with
-- "Database error saving new user". Recreate with exception guard so
-- auth always succeeds; customer row is best-effort.

DROP TRIGGER IF EXISTS on_auth_user_created_customer ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_customer_user();

CREATE OR REPLACE FUNCTION public.handle_new_customer_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rid uuid;
BEGIN
  BEGIN
    rid := NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'restaurant_id', '')), '')::uuid;
  EXCEPTION WHEN others THEN
    RETURN NEW;
  END;

  IF rid IS NULL OR NEW.email IS NULL OR NEW.email = '' THEN
    RETURN NEW;
  END IF;

  -- Never block auth if staff lookup fails
  BEGIN
    IF EXISTS (
      SELECT 1 FROM public.restaurant_staff s WHERE s.auth_user_id = NEW.id
    ) THEN
      RETURN NEW;
    END IF;
  EXCEPTION WHEN others THEN
    NULL; -- continue to insert attempt
  END;

  BEGIN
    INSERT INTO public.restaurant_customers (restaurant_id, auth_user_id, email)
    VALUES (rid, NEW.id, LOWER(TRIM(NEW.email)))
    ON CONFLICT (restaurant_id, auth_user_id) DO NOTHING;
  EXCEPTION WHEN others THEN
    RAISE LOG 'handle_new_customer_user insert failed: %', SQLERRM;
  END;

  RETURN NEW;
EXCEPTION WHEN others THEN
  -- Absolute last resort: never fail auth.users INSERT
  RAISE LOG 'handle_new_customer_user failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

-- Use PROCEDURE for broader Postgres compatibility on Supabase
CREATE TRIGGER on_auth_user_created_customer
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE PROCEDURE public.handle_new_customer_user();
