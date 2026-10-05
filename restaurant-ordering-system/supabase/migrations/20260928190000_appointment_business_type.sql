-- Exclusive business type: restaurant (ordering) or appointment (public booking).
-- Booking writes go through security-definer RPCs so capacity cannot be bypassed.
-- Availability returns start times and remaining seats only — never other customers.

ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS business_type text NOT NULL DEFAULT 'restaurant',
  ADD COLUMN IF NOT EXISTS appointment_capacity integer NOT NULL DEFAULT 1;

ALTER TABLE public.restaurants
  DROP CONSTRAINT IF EXISTS restaurants_business_type_check;
ALTER TABLE public.restaurants
  ADD CONSTRAINT restaurants_business_type_check
  CHECK (business_type IN ('restaurant', 'appointment'));

ALTER TABLE public.restaurants
  DROP CONSTRAINT IF EXISTS restaurants_appointment_capacity_check;
ALTER TABLE public.restaurants
  ADD CONSTRAINT restaurants_appointment_capacity_check
  CHECK (appointment_capacity >= 1);

COMMENT ON COLUMN public.restaurants.business_type IS
  'restaurant keeps menu ordering. appointment replaces it with service booking.';
COMMENT ON COLUMN public.restaurants.appointment_capacity IS
  'How many confirmed appointments may overlap. Used when business_type = appointment.';

-- Booking interprets hours in this zone. The email-campaigns migration adds the
-- same column; IF NOT EXISTS keeps either order safe.
ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'America/New_York';

CREATE OR REPLACE FUNCTION public.safe_timezone(p_tz text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT n.name FROM pg_timezone_names n WHERE n.name = btrim(p_tz) LIMIT 1),
    'America/New_York'
  );
$$;

-- ---------------------------------------------------------------------------
-- services
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.services (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id     uuid        NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  name              text        NOT NULL,
  description       text        NOT NULL DEFAULT '',
  duration_minutes  integer     NOT NULL CHECK (duration_minutes > 0 AND duration_minutes <= 480),
  price_cents       integer     NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
  is_active         boolean     NOT NULL DEFAULT true,
  sort_order        integer     NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_services_restaurant_active_sort
  ON public.services (restaurant_id, is_active, sort_order);

DROP TRIGGER IF EXISTS services_updated_at ON public.services;
CREATE TRIGGER services_updated_at
  BEFORE UPDATE ON public.services
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- appointments
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.appointments (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id     uuid        NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  service_id        uuid        NOT NULL REFERENCES public.services(id) ON DELETE RESTRICT,
  customer_id       bigint      NOT NULL REFERENCES public.restaurant_customers(id) ON DELETE CASCADE,
  starts_at         timestamptz NOT NULL,
  ends_at           timestamptz NOT NULL,
  status            text        NOT NULL DEFAULT 'confirmed'
    CHECK (status IN ('confirmed', 'cancelled')),
  service_name      text        NOT NULL,
  duration_minutes  integer     NOT NULL,
  price_cents       integer     NOT NULL,
  cancelled_at      timestamptz,
  cancelled_by      text        CHECK (cancelled_by IS NULL OR cancelled_by IN ('customer', 'staff')),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT appointments_time_order CHECK (ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS idx_appointments_service_id
  ON public.appointments (service_id);
CREATE INDEX IF NOT EXISTS idx_appointments_customer_id
  ON public.appointments (customer_id);
CREATE INDEX IF NOT EXISTS idx_appointments_confirmed_range
  ON public.appointments (restaurant_id, starts_at, ends_at)
  WHERE status = 'confirmed';

DROP TRIGGER IF EXISTS appointments_updated_at ON public.appointments;
CREATE TRIGGER appointments_updated_at
  BEFORE UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- helpers (not callable via the Data API)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.try_parse_time(p text)
RETURNS time
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  IF p IS NULL OR btrim(p) = '' THEN
    RETURN NULL;
  END IF;
  RETURN btrim(p)::time;
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.try_parse_time(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.try_parse_time(text) FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- availability: open 15-minute starts in the restaurant timezone
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_appointment_availability(
  p_restaurant_id uuid,
  p_service_id uuid,
  p_day date
)
RETURNS TABLE (starts_at timestamptz, remaining integer)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_service public.services;
  v_restaurant public.restaurants;
  v_tz text;
  v_today date;
  v_dow integer;
  v_key text;
  v_hours jsonb;
  v_day jsonb;
  v_open time;
  v_close time;
  v_cursor timestamptz;
  v_close_at timestamptz;
  v_end timestamptz;
  v_count integer;
  v_keys text[] := ARRAY['sun','mon','tue','wed','thu','fri','sat'];
BEGIN
  IF p_restaurant_id IS NULL OR p_service_id IS NULL OR p_day IS NULL THEN
    RETURN;
  END IF;

  SELECT * INTO v_service
  FROM public.services s
  WHERE s.id = p_service_id
    AND s.restaurant_id = p_restaurant_id
    AND s.is_active = true;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT * INTO v_restaurant
  FROM public.restaurants r
  WHERE r.id = p_restaurant_id
    AND r.business_type = 'appointment';
  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_tz := public.safe_timezone(v_restaurant.timezone);
  v_today := (now() AT TIME ZONE v_tz)::date;
  IF p_day < v_today OR p_day > v_today + 60 THEN
    RETURN;
  END IF;

  v_dow := EXTRACT(DOW FROM p_day)::integer;
  v_key := v_keys[v_dow + 1];
  v_hours := COALESCE(v_restaurant.hours_of_operation, '{}'::jsonb);
  v_day := v_hours -> v_key;

  IF v_day IS NOT NULL AND COALESCE(v_day->>'closed', 'false') IN ('true', 't', '1') THEN
    RETURN;
  END IF;

  v_open := COALESCE(public.try_parse_time(v_day->>'open'), time '08:00');
  v_close := COALESCE(public.try_parse_time(v_day->>'close'), time '15:00');
  IF v_close <= v_open THEN
    RETURN;
  END IF;

  v_cursor := (p_day + v_open) AT TIME ZONE v_tz;
  v_close_at := (p_day + v_close) AT TIME ZONE v_tz;

  WHILE v_cursor < v_close_at LOOP
    v_end := v_cursor + make_interval(mins => v_service.duration_minutes);
    IF v_end <= v_close_at AND v_cursor > now() THEN
      SELECT count(*)::integer INTO v_count
      FROM public.appointments a
      WHERE a.restaurant_id = p_restaurant_id
        AND a.status = 'confirmed'
        AND a.starts_at < v_end
        AND a.ends_at > v_cursor;

      remaining := GREATEST(v_restaurant.appointment_capacity - v_count, 0);
      IF remaining > 0 THEN
        starts_at := v_cursor;
        RETURN NEXT;
      END IF;
    END IF;
    v_cursor := v_cursor + interval '15 minutes';
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.get_appointment_availability(uuid, uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_appointment_availability(uuid, uuid, date) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- book: lock the restaurant row so two customers cannot take the last seat
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.book_appointment(
  p_service_id uuid,
  p_starts_at timestamptz
)
RETURNS public.appointments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_service public.services;
  v_restaurant public.restaurants;
  v_customer_id bigint;
  v_tz text;
  v_day date;
  v_row public.appointments;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in to book';
  END IF;
  IF p_service_id IS NULL OR p_starts_at IS NULL THEN
    RAISE EXCEPTION 'Choose a service and a time';
  END IF;

  SELECT * INTO v_service
  FROM public.services s
  WHERE s.id = p_service_id
  FOR UPDATE;
  IF NOT FOUND OR NOT v_service.is_active THEN
    RAISE EXCEPTION 'This service is not available';
  END IF;

  SELECT * INTO v_restaurant
  FROM public.restaurants r
  WHERE r.id = v_service.restaurant_id
  FOR UPDATE;
  IF NOT FOUND OR v_restaurant.business_type <> 'appointment' THEN
    RAISE EXCEPTION 'Appointments are not offered here';
  END IF;

  SELECT c.id INTO v_customer_id
  FROM public.restaurant_customers c
  WHERE c.restaurant_id = v_restaurant.id
    AND c.auth_user_id = auth.uid();
  IF v_customer_id IS NULL THEN
    RAISE EXCEPTION 'Sign in with an account for this business';
  END IF;

  v_tz := public.safe_timezone(v_restaurant.timezone);
  v_day := (p_starts_at AT TIME ZONE v_tz)::date;

  -- Re-check hours, horizon, and capacity while the restaurant row is locked.
  IF NOT EXISTS (
    SELECT 1
    FROM public.get_appointment_availability(v_restaurant.id, v_service.id, v_day) slot
    WHERE slot.starts_at = p_starts_at
      AND slot.remaining > 0
  ) THEN
    RAISE EXCEPTION 'That time is no longer available';
  END IF;

  INSERT INTO public.appointments (
    restaurant_id,
    service_id,
    customer_id,
    starts_at,
    ends_at,
    status,
    service_name,
    duration_minutes,
    price_cents
  ) VALUES (
    v_restaurant.id,
    v_service.id,
    v_customer_id,
    p_starts_at,
    p_starts_at + make_interval(mins => v_service.duration_minutes),
    'confirmed',
    v_service.name,
    v_service.duration_minutes,
    v_service.price_cents
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.book_appointment(uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.book_appointment(uuid, timestamptz) TO authenticated;

-- ---------------------------------------------------------------------------
-- cancel: customer (upcoming, own) or staff (any confirmed)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_appointment(p_appointment_id uuid)
RETURNS public.appointments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.appointments;
  v_is_staff boolean;
  v_is_owner boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in required';
  END IF;
  IF p_appointment_id IS NULL THEN
    RAISE EXCEPTION 'Appointment not found';
  END IF;

  SELECT * INTO v_row
  FROM public.appointments a
  WHERE a.id = p_appointment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Appointment not found';
  END IF;

  v_is_staff := public.is_staff_for_restaurant(v_row.restaurant_id);
  v_is_owner := EXISTS (
    SELECT 1
    FROM public.restaurant_customers c
    WHERE c.id = v_row.customer_id
      AND c.auth_user_id = auth.uid()
  );

  IF NOT v_is_staff AND NOT v_is_owner THEN
    RAISE EXCEPTION 'Appointment not found';
  END IF;

  IF v_row.status <> 'confirmed' THEN
    RAISE EXCEPTION 'This appointment is already cancelled';
  END IF;

  IF NOT v_is_staff AND v_row.starts_at <= now() THEN
    RAISE EXCEPTION 'This appointment can no longer be cancelled';
  END IF;

  UPDATE public.appointments
  SET
    status = 'cancelled',
    cancelled_at = now(),
    cancelled_by = CASE WHEN v_is_staff AND NOT v_is_owner THEN 'staff' ELSE 'customer' END
  WHERE id = v_row.id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_appointment(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_appointment(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS services_select ON public.services;
CREATE POLICY services_select ON public.services
  FOR SELECT
  USING (
    is_active = true
    OR public.is_staff_for_restaurant(restaurant_id)
  );

DROP POLICY IF EXISTS services_insert_staff ON public.services;
CREATE POLICY services_insert_staff ON public.services
  FOR INSERT
  WITH CHECK (public.is_staff_for_restaurant(restaurant_id));

DROP POLICY IF EXISTS services_update_staff ON public.services;
CREATE POLICY services_update_staff ON public.services
  FOR UPDATE
  USING (public.is_staff_for_restaurant(restaurant_id))
  WITH CHECK (public.is_staff_for_restaurant(restaurant_id));

DROP POLICY IF EXISTS services_delete_staff ON public.services;
CREATE POLICY services_delete_staff ON public.services
  FOR DELETE
  USING (
    public.is_staff_for_restaurant(restaurant_id)
    AND NOT EXISTS (
      SELECT 1 FROM public.appointments a WHERE a.service_id = services.id
    )
  );

DROP POLICY IF EXISTS appointments_select ON public.appointments;
CREATE POLICY appointments_select ON public.appointments
  FOR SELECT
  TO authenticated
  USING (
    public.is_staff_for_restaurant(restaurant_id)
    OR customer_id IN (
      SELECT c.id
      FROM public.restaurant_customers c
      WHERE c.auth_user_id = (SELECT auth.uid())
    )
  );

REVOKE ALL ON TABLE public.appointments FROM anon, authenticated;
GRANT SELECT ON TABLE public.appointments TO authenticated;

REVOKE ALL ON TABLE public.appointments FROM PUBLIC;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.services FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.services TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.services TO authenticated;
GRANT ALL ON TABLE public.services TO service_role;
GRANT ALL ON TABLE public.appointments TO service_role;
GRANT EXECUTE ON FUNCTION public.get_appointment_availability(uuid, uuid, date) TO service_role;
GRANT EXECUTE ON FUNCTION public.book_appointment(uuid, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.cancel_appointment(uuid) TO service_role;
