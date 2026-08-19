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
    'amount_cents', ROUND(v_total * 100)::integer
  );
END;
$$;

REVOKE ALL ON FUNCTION public.quote_customer_order(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.quote_customer_order(jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.quote_customer_order(jsonb) TO service_role;

-- Honor cart_snapshot customer_id when the invoker is service_role (no auth.uid()).
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
  v_stripe_pi text := NULL;
  v_quote jsonb;
  v_subtotal numeric;
  v_discount numeric;
  v_tax numeric;
  v_total numeric;
  v_promo_id uuid;
  v_promo_code text;
  v_pickup_location_id uuid;
BEGIN
  IF v_restaurant_id IS NULL THEN
    RAISE EXCEPTION 'restaurant_id is required';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = v_restaurant_id) THEN
    RAISE EXCEPTION 'Invalid restaurant_id';
  END IF;

  v_stripe_pi := NULLIF(TRIM(COALESCE(p->>'stripe_payment_intent_id', '')), '');

  IF v_stripe_pi IS NOT NULL THEN
    SELECT * INTO new_order
    FROM public.orders o
    WHERE o.stripe_payment_intent_id = v_stripe_pi
      AND o.restaurant_id = v_restaurant_id;
    IF FOUND THEN
      RETURN new_order;
    END IF;
  END IF;

  v_quote := public.quote_customer_order(p);

  v_subtotal := (v_quote->>'subtotal')::numeric;
  v_discount := (v_quote->>'discount_amount')::numeric;
  v_tax := (v_quote->>'tax')::numeric;
  v_total := (v_quote->>'total')::numeric;
  v_promo_id := NULLIF(v_quote->>'promo_code_id', '')::uuid;
  v_promo_code := NULLIF(v_quote->>'promo_code', '');
  BEGIN
    v_pickup_location_id := NULLIF(v_quote->>'pickup_location_id', '')::uuid;
  EXCEPTION WHEN others THEN
    v_pickup_location_id := NULL;
  END;

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
      COALESCE(
        (
          SELECT rc.id
          FROM public.restaurant_customers rc
          WHERE rc.auth_user_id = (SELECT auth.uid())
            AND rc.restaurant_id = v_restaurant_id
          LIMIT 1
        ),
        (
          SELECT rc.id
          FROM public.restaurant_customers rc
          WHERE (SELECT auth.role()) = 'service_role'
            AND rc.restaurant_id = v_restaurant_id
            AND rc.id::text = NULLIF(TRIM(COALESCE(p->>'customer_id', '')), '')
          LIMIT 1
        )
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

GRANT EXECUTE ON FUNCTION public.place_customer_order(jsonb) TO anon, authenticated, service_role;
