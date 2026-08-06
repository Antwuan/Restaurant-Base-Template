-- Create restaurant_customers when a customer signs up, even if email
-- confirmation is required (no JWT session yet for RLS insert).
-- CustomerSignInModal passes restaurant_id in auth user metadata.
-- IMPORTANT: must never throw — auth signup fails with
-- "Database error saving new user" if this trigger errors.

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

  BEGIN
    IF EXISTS (
      SELECT 1 FROM public.restaurant_staff s WHERE s.auth_user_id = NEW.id
    ) THEN
      RETURN NEW;
    END IF;
  EXCEPTION WHEN others THEN
    NULL;
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
  RAISE LOG 'handle_new_customer_user failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_customer ON auth.users;
CREATE TRIGGER on_auth_user_created_customer
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE PROCEDURE public.handle_new_customer_user();
