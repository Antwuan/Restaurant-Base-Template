-- Resend email system: per-restaurant domains, marketing opt-in, send tracking
-- Run in Supabase SQL Editor or via CLI.

-- ── restaurants ──────────────────────────────────────────────────────────────
ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS resend_domain_id text,
  ADD COLUMN IF NOT EXISTS resend_from_email text,
  ADD COLUMN IF NOT EXISTS resend_segment_id text,
  ADD COLUMN IF NOT EXISTS resend_marketing_topic_id text,
  ADD COLUMN IF NOT EXISTS review_url text,
  ADD COLUMN IF NOT EXISTS email_domain_status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS auto_review_emails boolean DEFAULT true;

COMMENT ON COLUMN public.restaurants.email_domain_status IS 'pending | verified | failed';
COMMENT ON COLUMN public.restaurants.resend_from_email IS 'e.g. Joe''s Pizza <hello@mail.joespizza.com>';

-- ── restaurant_customers ─────────────────────────────────────────────────────
ALTER TABLE public.restaurant_customers
  ADD COLUMN IF NOT EXISTS marketing_opt_in boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS marketing_opt_in_at timestamptz,
  ADD COLUMN IF NOT EXISTS resend_contact_id text;

-- ── orders ───────────────────────────────────────────────────────────────────
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS order_email_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS ready_email_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS review_email_sent_at timestamptz;

-- ── Database Webhook setup (Dashboard — not creatable from SQL alone) ────────
-- Supabase Dashboard → Database → Webhooks:
--
-- 1) Name: order-email-insert
--    Table: public.orders | Events: INSERT
--    URL: https://<project-ref>.supabase.co/functions/v1/send-order-email
--    HTTP Headers: Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>
--                  Content-Type: application/json
--
-- 2) Name: order-email-update
--    Table: public.orders | Events: UPDATE
--    Same URL and headers as above
--
-- The edge function is idempotent (checks *_email_sent_at + Resend idempotency keys).
-- Client also invokes send-order-email as a fallback after createOrder / status updates.
