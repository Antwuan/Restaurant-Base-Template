-- A new account can become a customer of this business even when that
-- person is already an admin of a different business. Skip the customer row
-- only when they are staff for the business they are signing up with.

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
      SELECT 1 FROM public.restaurant_staff s
      WHERE s.auth_user_id = NEW.id
        AND s.restaurant_id = rid
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
