-- Persist the server-computed per-unit price on every orders.items element so
-- receipts, the confirmation screen, and the tracker stop rendering $0.00.
--
-- quote_customer_order now also returns the priced items array it already builds
-- while summing the subtotal; place_customer_order reuses that array instead of
-- recomputing menu_items.price + modifier price_delta a second time.
--
-- Supersedes:
--   20260819201000_quote_customer_order.sql              (quote_customer_order)
--   20260819231102_place_customer_order_require_paid_ledger.sql (place_customer_order)
-- Both function signatures and grants are unchanged. No backfill: historical
-- orders never stored a unit price and recomputing it today would misstate any
-- order placed before a menu price change.

-- Shared server-side cart quote used by create-payment-intent.
-- Same menu + modifier + promo + tax_rate rules as place_customer_order.
-- Also lets the Stripe webhook (service_role) attach customer_id from cart_snapshot.

CREATE OR REPLACE FUNCTION public.quote_customer_order(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
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
  v_priced_items jsonb := '[]'::jsonb;
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
  v_customer_id_text text := NULL;
BEGIN
  IF v_restaurant_id IS NULL THEN
    RAISE EXCEPTION 'restaurant_id is required';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = v_restaurant_id) THEN
    RAISE EXCEPTION 'Invalid restaurant_id';
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

  SELECT rc.id::text INTO v_customer_id_text
  FROM public.restaurant_customers rc
  WHERE rc.auth_user_id = (SELECT auth.uid())
    AND rc.restaurant_id = v_restaurant_id
  LIMIT 1;

  IF v_customer_id_text IS NULL
     AND (SELECT auth.role()) = 'service_role'
     AND NULLIF(TRIM(COALESCE(p->>'customer_id', '')), '') IS NOT NULL THEN
    SELECT rc.id::text INTO v_customer_id_text
    FROM public.restaurant_customers rc
    WHERE rc.restaurant_id = v_restaurant_id
      AND rc.id::text = TRIM(p->>'customer_id')
    LIMIT 1;
  END IF;

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

    -- Per-unit price in dollars, modifiers included. Callers that persist items
    -- (place_customer_order) reuse this instead of repricing; the email template
    -- and the confirmation/tracker screens multiply it by quantity themselves.
    v_priced_items := v_priced_items || jsonb_build_array(
      v_item || jsonb_build_object('price', v_unit_price)
    );

    v_subtotal := v_subtotal + ROUND(v_unit_price * v_qty, 2);
  END LOOP;

  v_subtotal := ROUND(v_subtotal, 2);

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

    IF v_promo.issued_to_customer_id IS NOT NULL THEN
      IF v_customer_id_text IS NULL THEN
        RAISE EXCEPTION 'Sign in to use this promo code';
      END IF;
      IF v_promo.issued_to_customer_id::text IS DISTINCT FROM v_customer_id_text THEN
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

  RETURN jsonb_build_object(
    'subtotal', v_subtotal,
    'discount_amount', v_discount,
    'tax', v_tax,
    'total', v_total,
    'tax_rate', v_tax_rate,
    'promo_code_id', v_promo_id,
    'promo_code', v_promo_code,
    'pickup_location_id', v_pickup_location_id,
    'customer_id', v_customer_id_text,
    'amount_cents', ROUND(v_total * 100)::integer,
    'items', v_priced_items
  );
END;
$$;

REVOKE ALL ON FUNCTION public.quote_customer_order(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.quote_customer_order(jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.quote_customer_order(jsonb) TO service_role;

-- place_customer_order keeps every guard from 20260819231102: service_role only,
-- a succeeded payment_ledger row for the PaymentIntent, matching restaurant,
-- usd currency, and amount_cents equal to the server quote of cart_snapshot.
-- The only change is that the enrichment loop now starts from the quote's priced
-- items, so each persisted item carries 'price' alongside 'name'/'image_url'.

CREATE OR REPLACE FUNCTION public.place_customer_order(p jsonb)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_order public.orders;
  v_restaurant_id uuid := (p->>'restaurant_id')::uuid;
  v_stripe_pi text;
  v_ledger public.payment_ledger%ROWTYPE;
  v_snapshot jsonb;
  v_quote_payload jsonb;
  v_quote jsonb;
  v_subtotal numeric;
  v_discount numeric;
  v_tax numeric;
  v_total numeric;
  v_promo_id uuid;
  v_promo_code text;
  v_pickup_location_id uuid;
  v_amount_cents integer;
  v_items jsonb;
  v_priced_items jsonb;
  v_item jsonb;
  v_item_id uuid;
  v_item_name text;
  v_item_image text;
  v_enriched jsonb := '[]'::jsonb;
BEGIN
  IF v_restaurant_id IS NULL THEN
    RAISE EXCEPTION 'restaurant_id is required';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = v_restaurant_id) THEN
    RAISE EXCEPTION 'Invalid restaurant_id';
  END IF;

  v_stripe_pi := NULLIF(TRIM(COALESCE(p->>'stripe_payment_intent_id', '')), '');
  IF v_stripe_pi IS NULL THEN
    RAISE EXCEPTION 'stripe_payment_intent_id is required';
  END IF;

  SELECT * INTO v_ledger
  FROM public.payment_ledger pl
  WHERE pl.stripe_payment_intent_id = v_stripe_pi
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No payment found for this PaymentIntent';
  END IF;

  IF v_ledger.restaurant_id IS DISTINCT FROM v_restaurant_id THEN
    RAISE EXCEPTION 'PaymentIntent does not belong to this restaurant';
  END IF;

  IF v_ledger.status IS DISTINCT FROM 'succeeded' THEN
    RAISE EXCEPTION 'Payment has not succeeded';
  END IF;

  IF lower(COALESCE(NULLIF(TRIM(v_ledger.currency), ''), 'usd')) IS DISTINCT FROM 'usd' THEN
    RAISE EXCEPTION 'Payment currency is not supported';
  END IF;

  IF v_ledger.order_id IS NOT NULL THEN
    SELECT * INTO new_order
    FROM public.orders o
    WHERE o.id = v_ledger.order_id;
    IF FOUND THEN
      RETURN new_order;
    END IF;
  END IF;

  SELECT * INTO new_order
  FROM public.orders o
  WHERE o.stripe_payment_intent_id = v_stripe_pi;
  IF FOUND THEN
    UPDATE public.payment_ledger
    SET order_id = new_order.id,
        status = 'succeeded',
        updated_at = now()
    WHERE id = v_ledger.id
      AND (order_id IS DISTINCT FROM new_order.id OR status IS DISTINCT FROM 'succeeded');
    RETURN new_order;
  END IF;

  v_snapshot := COALESCE(v_ledger.cart_snapshot, '{}'::jsonb);
  v_items := COALESCE(v_snapshot->'items', '[]'::jsonb);

  v_quote_payload := jsonb_build_object(
    'restaurant_id', v_restaurant_id,
    'items', v_items
  );

  IF NULLIF(TRIM(COALESCE(v_snapshot->>'promo_code_id', '')), '') IS NOT NULL THEN
    v_quote_payload := v_quote_payload || jsonb_build_object(
      'promo_code_id', TRIM(v_snapshot->>'promo_code_id')
    );
  END IF;
  IF NULLIF(TRIM(COALESCE(v_snapshot->>'promo_code', '')), '') IS NOT NULL THEN
    v_quote_payload := v_quote_payload || jsonb_build_object(
      'promo_code', TRIM(v_snapshot->>'promo_code')
    );
  END IF;
  IF NULLIF(TRIM(COALESCE(v_snapshot->>'pickup_location_id', '')), '') IS NOT NULL THEN
    v_quote_payload := v_quote_payload || jsonb_build_object(
      'pickup_location_id', TRIM(v_snapshot->>'pickup_location_id')
    );
  END IF;
  IF NULLIF(TRIM(COALESCE(v_snapshot->>'customer_id', '')), '') IS NOT NULL THEN
    v_quote_payload := v_quote_payload || jsonb_build_object(
      'customer_id', TRIM(v_snapshot->>'customer_id')
    );
  END IF;

  v_quote := public.quote_customer_order(v_quote_payload);

  v_subtotal := (v_quote->>'subtotal')::numeric;
  v_discount := (v_quote->>'discount_amount')::numeric;
  v_tax := (v_quote->>'tax')::numeric;
  v_total := (v_quote->>'total')::numeric;
  v_amount_cents := (v_quote->>'amount_cents')::integer;
  v_promo_id := NULLIF(v_quote->>'promo_code_id', '')::uuid;
  v_promo_code := NULLIF(v_quote->>'promo_code', '');
  BEGIN
    v_pickup_location_id := NULLIF(v_quote->>'pickup_location_id', '')::uuid;
  EXCEPTION WHEN others THEN
    v_pickup_location_id := NULL;
  END;

  IF v_amount_cents IS NULL OR v_amount_cents IS DISTINCT FROM v_ledger.amount_cents THEN
    RAISE EXCEPTION 'Order total does not match paid amount';
  END IF;

  -- Quote items are the snapshot items plus a server-priced 'price'. Fall back to
  -- the raw snapshot items if an older quote_customer_order is installed, so an
  -- out-of-order deploy costs prices on the receipt rather than the whole order.
  v_priced_items := v_quote->'items';
  IF jsonb_typeof(v_priced_items) <> 'array'
     OR jsonb_typeof(v_items) <> 'array'
     OR jsonb_array_length(v_priced_items) <> jsonb_array_length(v_items) THEN
    v_priced_items := v_items;
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(v_priced_items, '[]'::jsonb))
  LOOP
    BEGIN
      v_item_id := (v_item->>'id')::uuid;
    EXCEPTION WHEN others THEN
      v_item_id := NULL;
    END;

    v_item_name := NULL;
    v_item_image := NULL;
    IF v_item_id IS NOT NULL THEN
      SELECT mi.name, mi.image_url
      INTO v_item_name, v_item_image
      FROM public.menu_items mi
      WHERE mi.id = v_item_id
        AND mi.restaurant_id = v_restaurant_id;
    END IF;

    v_enriched := v_enriched || jsonb_build_array(
      v_item || jsonb_strip_nulls(jsonb_build_object(
        'name', COALESCE(NULLIF(TRIM(COALESCE(v_item->>'name', '')), ''), v_item_name),
        'image_url', COALESCE(NULLIF(TRIM(COALESCE(v_item->>'image_url', '')), ''), v_item_image)
      ))
    );
  END LOOP;
  v_items := v_enriched;

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
        WHERE rc.restaurant_id = v_restaurant_id
          AND rc.id::text = NULLIF(TRIM(COALESCE(
            v_quote->>'customer_id',
            v_snapshot->>'customer_id',
            ''
          )), '')
        LIMIT 1
      ),
      NULLIF(TRIM(COALESCE(v_snapshot->>'customer_name', '')), ''),
      NULLIF(TRIM(COALESCE(v_snapshot->>'customer_phone', '')), ''),
      NULLIF(TRIM(COALESCE(v_snapshot->>'customer_email', '')), ''),
      v_items,
      v_subtotal,
      v_tax,
      v_total,
      'pending',
      COALESCE(NULLIF(TRIM(COALESCE(v_snapshot->>'order_type', '')), ''), 'pickup'),
      COALESCE(NULLIF(TRIM(COALESCE(v_snapshot->>'menu_type', '')), ''), 'regular'),
      CASE
        WHEN NULLIF(TRIM(COALESCE(v_snapshot->>'scheduled_time', '')), '') IS NOT NULL
          THEN (v_snapshot->>'scheduled_time')::timestamptz
        ELSE NULL
      END,
      v_stripe_pi,
      NULLIF(TRIM(COALESCE(v_snapshot->>'notes', '')), ''),
      v_promo_id,
      v_promo_code,
      v_discount,
      v_pickup_location_id
    )
    RETURNING * INTO new_order;
  EXCEPTION
    WHEN unique_violation THEN
      SELECT * INTO new_order
      FROM public.orders o
      WHERE o.stripe_payment_intent_id = v_stripe_pi;
      IF NOT FOUND THEN
        RAISE;
      END IF;
  END;

  UPDATE public.payment_ledger
  SET order_id = new_order.id,
      status = 'succeeded',
      updated_at = now()
  WHERE id = v_ledger.id
    AND (order_id IS DISTINCT FROM new_order.id OR status IS DISTINCT FROM 'succeeded');

  RETURN new_order;
END;
$$;

REVOKE ALL ON FUNCTION public.place_customer_order(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.place_customer_order(jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.place_customer_order(jsonb) TO service_role;
