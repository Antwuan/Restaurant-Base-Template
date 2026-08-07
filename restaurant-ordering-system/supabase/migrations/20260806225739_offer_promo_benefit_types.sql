-- Offer benefits + BOGO / Buy-X promo types; reward-minted promo linkage.
-- Run via: supabase db push / SQL Editor

-- ---------------------------------------------------------------------------
-- promo_codes: buy_quantity / get_quantity + offer linkage
-- issued_to_customer_id matches restaurant_customers.id (uuid or bigint).
-- Safe to re-run if a prior attempt left a uuid column without a valid FK.
-- ---------------------------------------------------------------------------
ALTER TABLE public.promo_codes
  ADD COLUMN IF NOT EXISTS buy_quantity int,
  ADD COLUMN IF NOT EXISTS get_quantity int,
  ADD COLUMN IF NOT EXISTS source_offer_id uuid REFERENCES public.reward_offers(id) ON DELETE SET NULL;

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
  WHERE a.attrelid = 'public.promo_codes'::regclass
    AND a.attname = 'issued_to_customer_id'
    AND NOT a.attisdropped;

  IF v_col_type IS NOT NULL AND v_col_type IS DISTINCT FROM v_customer_id_type THEN
    -- Drop FK if present, then drop the wrongly typed column (no data expected yet).
    ALTER TABLE public.promo_codes
      DROP CONSTRAINT IF EXISTS promo_codes_issued_to_customer_id_fkey;
    ALTER TABLE public.promo_codes
      DROP COLUMN issued_to_customer_id;
    v_col_type := NULL;
  END IF;

  IF v_col_type IS NULL THEN
    EXECUTE format(
      'ALTER TABLE public.promo_codes ADD COLUMN issued_to_customer_id %s REFERENCES public.restaurant_customers(id) ON DELETE SET NULL',
      v_customer_id_type
    );
  ELSE
    -- Column already correct type; ensure FK exists.
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conrelid = 'public.promo_codes'::regclass
        AND conname = 'promo_codes_issued_to_customer_id_fkey'
    ) THEN
      ALTER TABLE public.promo_codes
        ADD CONSTRAINT promo_codes_issued_to_customer_id_fkey
        FOREIGN KEY (issued_to_customer_id)
        REFERENCES public.restaurant_customers(id)
        ON DELETE SET NULL;
    END IF;
  END IF;
END $$;

-- Drop prior benefit CHECKs (inline + named)
ALTER TABLE public.promo_codes DROP CONSTRAINT IF EXISTS promo_codes_benefit_type_check;
ALTER TABLE public.promo_codes DROP CONSTRAINT IF EXISTS promo_codes_benefit_fields;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.promo_codes'::regclass
      AND contype = 'c'
      AND (
        pg_get_constraintdef(oid) ILIKE '%benefit_type%IN%'
        OR pg_get_constraintdef(oid) ILIKE '%promo_codes_benefit%'
      )
  LOOP
    EXECUTE format('ALTER TABLE public.promo_codes DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.promo_codes
  ADD CONSTRAINT promo_codes_benefit_type_check
  CHECK (benefit_type IN (
    'percent_off',
    'amount_off',
    'free_item',
    'bogo',
    'buy_x_percent_off',
    'buy_x_amount_off'
  ));

ALTER TABLE public.promo_codes
  ADD CONSTRAINT promo_codes_benefit_fields CHECK (
    (benefit_type = 'free_item'
      AND menu_item_id IS NOT NULL
      AND discount_value IS NULL
      AND buy_quantity IS NULL
      AND get_quantity IS NULL)
    OR (benefit_type IN ('percent_off', 'amount_off')
      AND discount_value IS NOT NULL AND discount_value > 0
      AND menu_item_id IS NULL
      AND buy_quantity IS NULL
      AND get_quantity IS NULL)
    OR (benefit_type = 'bogo'
      AND menu_item_id IS NOT NULL
      AND get_quantity IS NOT NULL AND get_quantity > 0
      AND discount_value IS NULL
      AND buy_quantity IS NULL)
    OR (benefit_type IN ('buy_x_percent_off', 'buy_x_amount_off')
      AND menu_item_id IS NOT NULL
      AND buy_quantity IS NOT NULL AND buy_quantity > 0
      AND discount_value IS NOT NULL AND discount_value > 0
      AND get_quantity IS NULL)
  );

CREATE INDEX IF NOT EXISTS idx_promo_codes_source_offer
  ON public.promo_codes (source_offer_id)
  WHERE source_offer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_promo_codes_issued_customer
  ON public.promo_codes (issued_to_customer_id)
  WHERE issued_to_customer_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- reward_offers: promo-like benefit fields
-- ---------------------------------------------------------------------------
ALTER TABLE public.reward_offers
  ADD COLUMN IF NOT EXISTS benefit_type text,
  ADD COLUMN IF NOT EXISTS discount_value numeric,
  ADD COLUMN IF NOT EXISTS menu_item_id uuid REFERENCES public.menu_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS buy_quantity int,
  ADD COLUMN IF NOT EXISTS get_quantity int;

ALTER TABLE public.reward_offers DROP CONSTRAINT IF EXISTS reward_offers_benefit_type_check;
ALTER TABLE public.reward_offers DROP CONSTRAINT IF EXISTS reward_offers_benefit_fields;

ALTER TABLE public.reward_offers
  ADD CONSTRAINT reward_offers_benefit_type_check
  CHECK (
    benefit_type IS NULL
    OR benefit_type IN (
      'percent_off',
      'amount_off',
      'free_item',
      'bogo',
      'buy_x_percent_off',
      'buy_x_amount_off'
    )
  );

ALTER TABLE public.reward_offers
  ADD CONSTRAINT reward_offers_benefit_fields CHECK (
    benefit_type IS NULL
    OR (benefit_type = 'free_item'
      AND menu_item_id IS NOT NULL
      AND discount_value IS NULL
      AND buy_quantity IS NULL
      AND get_quantity IS NULL)
    OR (benefit_type IN ('percent_off', 'amount_off')
      AND discount_value IS NOT NULL AND discount_value > 0
      AND menu_item_id IS NULL
      AND buy_quantity IS NULL
      AND get_quantity IS NULL)
    OR (benefit_type = 'bogo'
      AND menu_item_id IS NOT NULL
      AND get_quantity IS NOT NULL AND get_quantity > 0
      AND discount_value IS NULL
      AND buy_quantity IS NULL)
    OR (benefit_type IN ('buy_x_percent_off', 'buy_x_amount_off')
      AND menu_item_id IS NOT NULL
      AND buy_quantity IS NOT NULL AND buy_quantity > 0
      AND discount_value IS NOT NULL AND discount_value > 0
      AND get_quantity IS NULL)
  );

-- ---------------------------------------------------------------------------
-- reward_redemptions: link to minted promo code
-- ---------------------------------------------------------------------------
ALTER TABLE public.reward_redemptions
  ADD COLUMN IF NOT EXISTS promo_code_id uuid REFERENCES public.promo_codes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_redemptions_promo_code
  ON public.reward_redemptions (promo_code_id)
  WHERE promo_code_id IS NOT NULL;
