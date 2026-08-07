-- Split customer name into first_name / last_name (no full_name — unused).

ALTER TABLE public.restaurant_customers
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text;
