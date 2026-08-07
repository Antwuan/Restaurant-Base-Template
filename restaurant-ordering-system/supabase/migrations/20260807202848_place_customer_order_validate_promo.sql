-- Harden place_customer_order: recompute subtotal/discount/tax/total server-side.
-- Do not trust client-supplied money fields or promo discount amounts.

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

  INSERT INTO public.orders (
    restaurant_id,
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
    discount_amount
  ) VALUES (
    v_restaurant_id,
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
    NULLIF(TRIM(COALESCE(p->>'stripe_payment_intent_id', '')), ''),
    NULLIF(TRIM(COALESCE(p->>'notes', '')), ''),
    v_promo_id,
    v_promo_code,
    v_discount
  )
  RETURNING * INTO new_order;

  RETURN new_order;
END;
$$;

REVOKE ALL ON FUNCTION public.place_customer_order(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.place_customer_order(jsonb) TO anon, authenticated;
