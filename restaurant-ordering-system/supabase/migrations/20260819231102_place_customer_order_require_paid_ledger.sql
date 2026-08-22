-- Harden place_customer_order: require a succeeded payment_ledger row whose
-- amount matches the server quote of the *ledger cart_snapshot* (not client items).
-- Revoke guest execute; only service_role (stripe-webhook / fulfill-order) may insert.

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

  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(v_items, '[]'::jsonb))
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

-- Guests must not INSERT kitchen rows directly; SECURITY DEFINER RPC (service_role) still can.
DROP POLICY IF EXISTS orders_insert_public ON public.orders;
REVOKE INSERT ON TABLE public.orders FROM anon, authenticated;
