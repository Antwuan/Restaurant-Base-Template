-- Link marketing broadcasts to an optional promo (Rewards send).
-- Nullable + non-unique so review outreach stays unlinked and a promo can be sent again.

ALTER TABLE public.email_broadcasts
  ADD COLUMN IF NOT EXISTS promo_code_id uuid REFERENCES public.promo_codes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_email_broadcasts_promo_code_id
  ON public.email_broadcasts (promo_code_id)
  WHERE promo_code_id IS NOT NULL;
