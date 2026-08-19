-- Checkout hardening: payment_ledger, tax rates, orders.customer_id,
-- unique PaymentIntent, idempotent place_customer_order, tracker RLS.
-- restaurant_customers.id type is detected (uuid or bigint) like 20260806225739.

-- ---------------------------------------------------------------------------
-- restaurants / locations: configurable tax (fraction, e.g. 0.08 = 8%)
-- ---------------------------------------------------------------------------
ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS tax_rate numeric NOT NULL DEFAULT 0.08;

ALTER TABLE public.restaurant_locations
  ADD COLUMN IF NOT EXISTS tax_rate numeric;

-- ---------------------------------------------------------------------------
-- orders.customer_id → restaurant_customers (nullable for historical/guest rows)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_customer_id_type text;
  v_col_type text;
BEGIN
  SELECT format_type(a.atttypid, a.atttypmod) INTO v_customer_id_type
  FROM pg_attribute a
  WHERE a.attrelid = 'public.restaurant_customers'::regclass
    AND a.attname = 'id'
    AND NOT a.attisdropped;

  IF v_customer_id_type IS NULL THEN
    RAISE EXCEPTION 'public.restaurant_customers.id not found';
  END IF;

  SELECT format_type(a.atttypid, a.atttypmod) INTO v_col_type
  FROM pg_attribute a
  WHERE a.attrelid = 'public.orders'::regclass
    AND a.attname = 'customer_id'
    AND NOT a.attisdropped;

  IF v_col_type IS NOT NULL AND v_col_type IS DISTINCT FROM v_customer_id_type THEN
    ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_customer_id_fkey;
    ALTER TABLE public.orders DROP COLUMN customer_id;
    v_col_type := NULL;
  END IF;

  IF v_col_type IS NULL THEN
    EXECUTE format(
      'ALTER TABLE public.orders ADD COLUMN customer_id %s REFERENCES public.restaurant_customers(id) ON DELETE SET NULL',
      v_customer_id_type
    );
  ELSIF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.orders'::regclass
      AND conname = 'orders_customer_id_fkey'
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_customer_id_fkey
      FOREIGN KEY (customer_id)
      REFERENCES public.restaurant_customers(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- Tracker: restaurant + customer (+ FK covering for customer_id)
CREATE INDEX IF NOT EXISTS idx_orders_customer_id
  ON public.orders (customer_id)
  WHERE customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_restaurant_customer
  ON public.orders (restaurant_id, customer_id)
  WHERE customer_id IS NOT NULL;

-- One Stripe PaymentIntent → one order
UPDATE public.orders
SET stripe_payment_intent_id = NULL
WHERE stripe_payment_intent_id IS NOT NULL
  AND TRIM(stripe_payment_intent_id) = '';

CREATE UNIQUE INDEX IF NOT EXISTS orders_stripe_payment_intent_id_key
  ON public.orders (stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- payment_ledger: service-role only (create-payment-intent / stripe-webhook)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payment_ledger (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id            uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  idempotency_key          text NOT NULL,
  stripe_payment_intent_id text,
  amount_cents             integer NOT NULL CHECK (amount_cents >= 0),
  currency                 text NOT NULL DEFAULT 'usd',
  status                   text NOT NULL DEFAULT 'created'
    CHECK (status IN (
      'created',
      'requires_action',
      'processing',
      'succeeded',
      'failed',
      'canceled'
    )),
  cart_snapshot            jsonb NOT NULL DEFAULT '{}'::jsonb,
  order_id                 bigint REFERENCES public.orders(id) ON DELETE SET NULL,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_ledger_idempotency_key_key UNIQUE (idempotency_key),
  CONSTRAINT payment_ledger_stripe_payment_intent_id_key UNIQUE (stripe_payment_intent_id)
);

CREATE INDEX IF NOT EXISTS idx_payment_ledger_restaurant_id
  ON public.payment_ledger (restaurant_id);

CREATE INDEX IF NOT EXISTS idx_payment_ledger_order_id
  ON public.payment_ledger (order_id)
  WHERE order_id IS NOT NULL;

DROP TRIGGER IF EXISTS payment_ledger_updated_at ON public.payment_ledger;
CREATE TRIGGER payment_ledger_updated_at
  BEFORE UPDATE ON public.payment_ledger
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.payment_ledger ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.payment_ledger FROM PUBLIC;
REVOKE ALL ON TABLE public.payment_ledger FROM anon, authenticated;
GRANT ALL ON TABLE public.payment_ledger TO service_role;

-- ---------------------------------------------------------------------------
-- orders RLS: staff restaurant-wide; customers own rows; no anon SELECT
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Staff can view own restaurant" ON public.orders;
DROP POLICY IF EXISTS "Staff can update own restaurant" ON public.orders;
DROP POLICY IF EXISTS orders_select_staff ON public.orders;
DROP POLICY IF EXISTS orders_update_staff ON public.orders;
DROP POLICY IF EXISTS orders_select_own ON public.orders;

CREATE POLICY orders_select_staff ON public.orders
  FOR SELECT
  TO authenticated
  USING (public.is_staff_for_restaurant(restaurant_id));

CREATE POLICY orders_update_staff ON public.orders
  FOR UPDATE
  TO authenticated
  USING (public.is_staff_for_restaurant(restaurant_id))
  WITH CHECK (public.is_staff_for_restaurant(restaurant_id));

CREATE POLICY orders_select_own ON public.orders
  FOR SELECT
  TO authenticated
  USING (
    customer_id IN (
      SELECT rc.id
      FROM public.restaurant_customers rc
      WHERE rc.auth_user_id = (SELECT auth.uid())
        AND rc.restaurant_id = orders.restaurant_id
    )
  );

-- Guest/authenticated INSERT may not spoof another customer's id
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
    AND (
      customer_id IS NULL
      OR customer_id IN (
        SELECT rc.id
        FROM public.restaurant_customers rc
        WHERE rc.auth_user_id = (SELECT auth.uid())
          AND rc.restaurant_id = restaurant_id
      )
    )
  );

-- ---------------------------------------------------------------------------
-- place_customer_order: tax_rate, customer_id, idempotent PaymentIntent
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.place_customer_order(p jsonb)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_order public.orders;
  v_restaurant_id uuid := (p->>'restaurant_id')::uuid;
  v_items jsonb := COALESCE(p->'items', '[]'::jsonb);
  v_item jsonb;
  v_item_id uuid;
  v_qty numeric;
  v_base_price numeric;
  v_unit_price numeric;
  v_mod jsonb;
  v_opt_id uuid;
  v_opt_delta numeric;
  v_subtotal numeric := 0;
  v_discount numeric := 0;
  v_tax numeric := 0;
  v_total numeric := 0;
  v_tax_rate numeric := 0.08;
  v_promo_id uuid := NULL;
  v_promo_code text := NULL;
  v_promo public.promo_codes%ROWTYPE;
  v_line_qty numeric;
  v_line_price numeric;
  v_line_sub numeric;
  v_free_units numeric;
  v_need numeric;
  v_pickup_location_id uuid := NULL;
  v_stripe_pi text := NULL;
BEGIN
  IF v_restaurant_id IS NULL THEN
    RAISE EXCEPTION 'restaurant_id is required';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = v_restaurant_id) THEN
    RAISE EXCEPTION 'Invalid restaurant_id';
  END IF;

  v_stripe_pi := NULLIF(TRIM(COALESCE(p->>'stripe_payment_intent_id', '')), '');

  -- Idempotent: webhook + browser retry for the same PaymentIntent
  IF v_stripe_pi IS NOT NULL THEN
    SELECT * INTO new_order
    FROM public.orders o
    WHERE o.stripe_payment_intent_id = v_stripe_pi
      AND o.restaurant_id = v_restaurant_id;
    IF FOUND THEN
      RETURN new_order;
    END IF;
  END IF;

  IF jsonb_typeof(v_items) <> 'array' OR jsonb_array_length(v_items) = 0 THEN
    RAISE EXCEPTION 'Order must contain at least one item';
  END IF;

  IF p ? 'pickup_location_id' AND NULLIF(TRIM(COALESCE(p->>'pickup_location_id', '')), '') IS NOT NULL THEN
    BEGIN
      v_pickup_location_id := (p->>'pickup_location_id')::uuid;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'Invalid pickup_location_id';
    END;

    IF NOT EXISTS (
      SELECT 1
      FROM public.restaurant_locations rl
      WHERE rl.id = v_pickup_location_id
        AND rl.restaurant_id = v_restaurant_id
        AND rl.is_active = true
    ) THEN
      RAISE EXCEPTION 'Invalid pickup location for this restaurant';
    END IF;
  END IF;

  SELECT COALESCE(rl.tax_rate, r.tax_rate, 0.08)
  INTO v_tax_rate
  FROM public.restaurants r
  LEFT JOIN public.restaurant_locations rl
    ON v_pickup_location_id IS NOT NULL
   AND rl.id = v_pickup_location_id
   AND rl.restaurant_id = r.id
  WHERE r.id = v_restaurant_id;

  IF v_tax_rate IS NULL THEN
    v_tax_rate := 0.08;
  END IF;

  -- Reprice cart from menu_items + modifier option deltas (ignore client prices)
  FOR v_item IN SELECT value FROM jsonb_array_elements(v_items)
  LOOP
    BEGIN
      v_item_id := (v_item->>'id')::uuid;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'Invalid menu item id';
    END;

    IF v_item_id IS NULL THEN
      RAISE EXCEPTION 'Invalid menu item id';
    END IF;

    v_qty := GREATEST(0, COALESCE((v_item->>'quantity')::numeric, 1));
    IF v_qty <= 0 THEN
      RAISE EXCEPTION 'Invalid item quantity';
    END IF;

    SELECT mi.price INTO v_base_price
    FROM public.menu_items mi
    WHERE mi.id = v_item_id
      AND mi.restaurant_id = v_restaurant_id;

    IF v_base_price IS NULL THEN
      RAISE EXCEPTION 'Invalid menu item for this restaurant';
    END IF;

    v_unit_price := v_base_price;

    IF v_item ? 'selected_modifiers' AND jsonb_typeof(v_item->'selected_modifiers') = 'array' THEN
      FOR v_mod IN SELECT value FROM jsonb_array_elements(v_item->'selected_modifiers')
      LOOP
        BEGIN
          v_opt_id := COALESCE(
            (v_mod->>'optionId')::uuid,
            (v_mod->>'option_id')::uuid
          );
        EXCEPTION WHEN others THEN
          v_opt_id := NULL;
        END;

        IF v_opt_id IS NULL THEN
          CONTINUE;
        END IF;

        SELECT o.price_delta INTO v_opt_delta
        FROM public.menu_item_modifier_options o
        JOIN public.menu_item_modifier_groups g ON g.id = o.group_id
        WHERE o.id = v_opt_id
          AND g.menu_item_id = v_item_id;

        IF v_opt_delta IS NOT NULL THEN
          v_unit_price := v_unit_price + v_opt_delta;
        END IF;
      END LOOP;
    END IF;

    v_subtotal := v_subtotal + ROUND(v_unit_price * v_qty, 2);
  END LOOP;

  v_subtotal := ROUND(v_subtotal, 2);

  -- Resolve promo by id (preferred) or code
  IF p ? 'promo_code_id' AND NULLIF(TRIM(COALESCE(p->>'promo_code_id', '')), '') IS NOT NULL THEN
    v_promo_id := (p->>'promo_code_id')::uuid;
  END IF;
  v_promo_code := NULLIF(TRIM(COALESCE(p->>'promo_code', '')), '');

  IF v_promo_id IS NOT NULL OR v_promo_code IS NOT NULL THEN
    SELECT * INTO v_promo
    FROM public.promo_codes pc
    WHERE pc.restaurant_id = v_restaurant_id
      AND (
        (v_promo_id IS NOT NULL AND pc.id = v_promo_id)
        OR (v_promo_id IS NULL AND upper(pc.code) = upper(v_promo_code))
      )
    LIMIT 1;

    IF NOT FOUND OR NOT v_promo.is_active THEN
      RAISE EXCEPTION 'Invalid or inactive promo code';
    END IF;

    IF v_promo.starts_at IS NOT NULL AND v_promo.starts_at > now() THEN
      RAISE EXCEPTION 'This promo code is not active yet';
    END IF;

    IF v_promo.expires_at IS NOT NULL AND v_promo.expires_at < now() THEN
      RAISE EXCEPTION 'This promo code has expired';
    END IF;

    IF v_promo.max_redemptions IS NOT NULL
       AND COALESCE(v_promo.redemption_count, 0) >= v_promo.max_redemptions THEN
      RAISE EXCEPTION 'This promo code has reached its redemption limit';
    END IF;

    -- Optional: issued codes must belong to the signed-in customer
    IF v_promo.issued_to_customer_id IS NOT NULL THEN
      IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Sign in to use this promo code';
      END IF;
      IF NOT EXISTS (
        SELECT 1
        FROM public.restaurant_customers rc
        WHERE rc.id = v_promo.issued_to_customer_id
          AND rc.auth_user_id = auth.uid()
          AND rc.restaurant_id = v_restaurant_id
      ) THEN
        RAISE EXCEPTION 'This promo code is not available for your account';
      END IF;
    END IF;

    IF v_promo.benefit_type = 'percent_off' THEN
      v_discount := LEAST(
        v_subtotal,
        ROUND(v_subtotal * (COALESCE(v_promo.discount_value, 0) / 100.0), 2)
      );

    ELSIF v_promo.benefit_type = 'amount_off' THEN
      v_discount := LEAST(v_subtotal, GREATEST(0, COALESCE(v_promo.discount_value, 0)));

    ELSIF v_promo.benefit_type IN ('free_item', 'bogo', 'buy_x_percent_off', 'buy_x_amount_off') THEN
      IF v_promo.menu_item_id IS NULL THEN
        RAISE EXCEPTION 'Promo is misconfigured';
      END IF;

      v_line_qty := 0;
      v_line_price := NULL;
      v_line_sub := 0;

      FOR v_item IN SELECT value FROM jsonb_array_elements(v_items)
      LOOP
        IF (v_item->>'id')::uuid = v_promo.menu_item_id THEN
          v_qty := GREATEST(0, COALESCE((v_item->>'quantity')::numeric, 1));
          v_line_qty := v_line_qty + v_qty;

          SELECT mi.price INTO v_base_price
          FROM public.menu_items mi
          WHERE mi.id = v_promo.menu_item_id
            AND mi.restaurant_id = v_restaurant_id;

          v_unit_price := COALESCE(v_base_price, 0);
          IF v_item ? 'selected_modifiers' AND jsonb_typeof(v_item->'selected_modifiers') = 'array' THEN
            FOR v_mod IN SELECT value FROM jsonb_array_elements(v_item->'selected_modifiers')
            LOOP
              BEGIN
                v_opt_id := COALESCE(
                  (v_mod->>'optionId')::uuid,
                  (v_mod->>'option_id')::uuid
                );
              EXCEPTION WHEN others THEN
                v_opt_id := NULL;
              END;
              IF v_opt_id IS NULL THEN
                CONTINUE;
              END IF;
              SELECT o.price_delta INTO v_opt_delta
              FROM public.menu_item_modifier_options o
              JOIN public.menu_item_modifier_groups g ON g.id = o.group_id
              WHERE o.id = v_opt_id
                AND g.menu_item_id = v_promo.menu_item_id;
              IF v_opt_delta IS NOT NULL THEN
                v_unit_price := v_unit_price + v_opt_delta;
              END IF;
            END LOOP;
          END IF;

          IF v_line_price IS NULL THEN
            v_line_price := v_unit_price;
          END IF;
          v_line_sub := v_line_sub + ROUND(v_unit_price * v_qty, 2);
        END IF;
      END LOOP;

      IF v_line_qty <= 0 OR v_line_price IS NULL THEN
        IF v_promo.benefit_type = 'free_item' THEN
          RAISE EXCEPTION 'Add the free promo item to your cart to use this code.';
        ELSE
          RAISE EXCEPTION 'Add the promo item to your cart to use this code.';
        END IF;
      END IF;

      IF v_promo.benefit_type = 'free_item' THEN
        v_discount := LEAST(v_subtotal, GREATEST(0, v_line_price));

      ELSIF v_promo.benefit_type = 'bogo' THEN
        v_free_units := FLOOR(v_line_qty / (1 + GREATEST(1, COALESCE(v_promo.get_quantity, 1))))
          * GREATEST(1, COALESCE(v_promo.get_quantity, 1));
        v_discount := LEAST(v_subtotal, ROUND(v_free_units * GREATEST(0, v_line_price), 2));

      ELSIF v_promo.benefit_type = 'buy_x_percent_off' THEN
        v_need := GREATEST(1, COALESCE(v_promo.buy_quantity, 1));
        IF v_line_qty < v_need THEN
          RAISE EXCEPTION 'Add at least % of the promo item to your cart.', v_need;
        END IF;
        v_discount := LEAST(
          v_subtotal,
          ROUND(v_line_sub * (COALESCE(v_promo.discount_value, 0) / 100.0), 2)
        );

      ELSIF v_promo.benefit_type = 'buy_x_amount_off' THEN
        v_need := GREATEST(1, COALESCE(v_promo.buy_quantity, 1));
        IF v_line_qty < v_need THEN
          RAISE EXCEPTION 'Add at least % of the promo item to your cart.', v_need;
        END IF;
        v_discount := LEAST(
          v_subtotal,
          LEAST(v_line_sub, GREATEST(0, COALESCE(v_promo.discount_value, 0)))
        );
      END IF;
    ELSE
      v_discount := 0;
    END IF;

    v_promo_id := v_promo.id;
    v_promo_code := v_promo.code;
  ELSE
    v_promo_id := NULL;
    v_promo_code := NULL;
    v_discount := 0;
  END IF;

  v_discount := ROUND(GREATEST(0, LEAST(v_subtotal, COALESCE(v_discount, 0))), 2);
  v_tax := ROUND((v_subtotal - v_discount) * v_tax_rate, 2);
  v_total := ROUND((v_subtotal - v_discount) + v_tax, 2);

  IF v_total <= 0 THEN
    RAISE EXCEPTION 'Order total must be greater than zero';
  END IF;

  BEGIN
    INSERT INTO public.orders (
      restaurant_id,
      customer_id,
      customer_name,
      customer_phone,
      customer_email,
      items,
      subtotal,
      tax,
      total,
      status,
      order_type,
      menu_type,
      scheduled_time,
      stripe_payment_intent_id,
      notes,
      promo_code_id,
      promo_code,
      discount_amount,
      pickup_location_id
    ) VALUES (
      v_restaurant_id,
      (
        SELECT rc.id
        FROM public.restaurant_customers rc
        WHERE rc.auth_user_id = auth.uid()
          AND rc.restaurant_id = v_restaurant_id
        LIMIT 1
      ),
      NULLIF(TRIM(COALESCE(p->>'customer_name', '')), ''),
      NULLIF(TRIM(COALESCE(p->>'customer_phone', '')), ''),
      NULLIF(TRIM(COALESCE(p->>'customer_email', '')), ''),
      v_items,
      v_subtotal,
      v_tax,
      v_total,
      COALESCE(NULLIF(TRIM(COALESCE(p->>'status', '')), ''), 'pending'),
      NULLIF(TRIM(COALESCE(p->>'order_type', '')), ''),
      COALESCE(NULLIF(TRIM(COALESCE(p->>'menu_type', '')), ''), 'regular'),
      CASE
        WHEN p ? 'scheduled_time' AND NULLIF(TRIM(COALESCE(p->>'scheduled_time', '')), '') IS NOT NULL
          THEN (p->>'scheduled_time')::timestamptz
        ELSE NULL
      END,
      v_stripe_pi,
      NULLIF(TRIM(COALESCE(p->>'notes', '')), ''),
      v_promo_id,
      v_promo_code,
      v_discount,
      v_pickup_location_id
    )
    RETURNING * INTO new_order;
  EXCEPTION
    WHEN unique_violation THEN
      IF v_stripe_pi IS NULL THEN
        RAISE;
      END IF;
      SELECT * INTO new_order
      FROM public.orders o
      WHERE o.stripe_payment_intent_id = v_stripe_pi
        AND o.restaurant_id = v_restaurant_id;
      IF NOT FOUND THEN
        RAISE;
      END IF;
  END;

  RETURN new_order;
END;
$$;

REVOKE ALL ON FUNCTION public.place_customer_order(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.place_customer_order(jsonb) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- On sign-in: attach unmatched recent guest orders by email + restaurant
-- (does not match on phone). Authenticated only.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.attach_guest_orders_to_customer(p_restaurant_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_restaurant_id IS NULL THEN
    RAISE EXCEPTION 'restaurant_id is required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.restaurant_customers rc
    WHERE rc.auth_user_id = auth.uid()
      AND rc.restaurant_id = p_restaurant_id
  ) THEN
    RAISE EXCEPTION 'No customer profile for this restaurant';
  END IF;

  UPDATE public.orders o
  SET customer_id = rc.id
  FROM public.restaurant_customers rc
  WHERE rc.auth_user_id = auth.uid()
    AND rc.restaurant_id = p_restaurant_id
    AND o.restaurant_id = p_restaurant_id
    AND o.customer_id IS NULL
    AND o.customer_email IS NOT NULL
    AND rc.email IS NOT NULL
    AND lower(trim(o.customer_email)) = lower(trim(rc.email))
    AND length(trim(o.customer_email)) > 0
    AND o.created_at >= now() - interval '30 days';

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.attach_guest_orders_to_customer(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.attach_guest_orders_to_customer(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.attach_guest_orders_to_customer(uuid) TO authenticated;
