-- Order-linked in-app reviews + marketing broadcast metrics
-- Run in Supabase SQL Editor or via CLI.
-- Note: public.orders.id is bigint (not uuid).

-- Drop partial table if a previous run failed mid-create
DROP TABLE IF EXISTS public.order_reviews CASCADE;

-- ── order_reviews ────────────────────────────────────────────────────────────
CREATE TABLE public.order_reviews (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id   uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  order_id        bigint NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  rating          smallint NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment         text,
  customer_name   text,
  customer_email  text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT order_reviews_order_id_unique UNIQUE (order_id)
);

CREATE INDEX IF NOT EXISTS idx_order_reviews_restaurant_created
  ON public.order_reviews (restaurant_id, created_at DESC);

ALTER TABLE public.order_reviews ENABLE ROW LEVEL SECURITY;

-- Staff can read reviews for their restaurant; inserts only via service role (edge function)
DROP POLICY IF EXISTS order_reviews_select_staff ON public.order_reviews;
CREATE POLICY order_reviews_select_staff ON public.order_reviews
  FOR SELECT
  USING (public.is_staff_for_restaurant(restaurant_id));

-- ── email_broadcasts ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.email_broadcasts (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id        uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  resend_broadcast_id  text,
  subject              text NOT NULL,
  preview_text         text,
  name                 text,
  sent_at              timestamptz NOT NULL DEFAULT now(),
  delivered_count      integer NOT NULL DEFAULT 0,
  opened_count         integer NOT NULL DEFAULT 0,
  clicked_count        integer NOT NULL DEFAULT 0,
  bounced_count        integer NOT NULL DEFAULT 0,
  complained_count     integer NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_email_broadcasts_restaurant_sent
  ON public.email_broadcasts (restaurant_id, sent_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_email_broadcasts_resend_id
  ON public.email_broadcasts (resend_broadcast_id)
  WHERE resend_broadcast_id IS NOT NULL;

ALTER TABLE public.email_broadcasts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS email_broadcasts_select_staff ON public.email_broadcasts;
CREATE POLICY email_broadcasts_select_staff ON public.email_broadcasts
  FOR SELECT
  USING (public.is_staff_for_restaurant(restaurant_id));

-- ── email_broadcast_events (webhook idempotency) ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.email_broadcast_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  broadcast_id  uuid NOT NULL REFERENCES public.email_broadcasts(id) ON DELETE CASCADE,
  email_id      text NOT NULL,
  event_type    text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT email_broadcast_events_unique UNIQUE (email_id, event_type)
);

CREATE INDEX IF NOT EXISTS idx_email_broadcast_events_broadcast
  ON public.email_broadcast_events (broadcast_id);

ALTER TABLE public.email_broadcast_events ENABLE ROW LEVEL SECURITY;

-- Staff can inspect event rows for their restaurant's broadcasts
DROP POLICY IF EXISTS email_broadcast_events_select_staff ON public.email_broadcast_events;
CREATE POLICY email_broadcast_events_select_staff ON public.email_broadcast_events
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.email_broadcasts b
      WHERE b.id = email_broadcast_events.broadcast_id
        AND public.is_staff_for_restaurant(b.restaurant_id)
    )
  );

-- Atomic counter bump for Resend webhook (invoked with service role)
CREATE OR REPLACE FUNCTION public.increment_email_broadcast_counter(
  p_broadcast_id uuid,
  p_column text
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF p_column NOT IN (
    'delivered_count', 'opened_count', 'clicked_count', 'bounced_count', 'complained_count'
  ) THEN
    RAISE EXCEPTION 'invalid counter column: %', p_column;
  END IF;

  EXECUTE format(
    'UPDATE public.email_broadcasts SET %I = %I + 1 WHERE id = $1',
    p_column,
    p_column
  )
  USING p_broadcast_id;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_email_broadcast_counter(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_email_broadcast_counter(uuid, text) TO service_role;
