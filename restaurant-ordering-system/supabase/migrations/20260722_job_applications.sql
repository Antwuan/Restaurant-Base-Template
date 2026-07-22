-- ---------------------------------------------------------------------------
-- job_applications
-- Stores career applications submitted through the public Hiring page.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.job_applications (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid       NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  full_name    text        NOT NULL,
  email        text        NOT NULL,
  phone        text,
  comment      text,
  resume_path  text,          -- storage path: {restaurant_id}/applications/{id}.pdf
  resume_file_name text,      -- original filename shown to admin
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_applications_restaurant
  ON public.job_applications (restaurant_id, created_at DESC);

ALTER TABLE public.job_applications ENABLE ROW LEVEL SECURITY;

-- Public (unauthenticated) applicants can insert — no auth required to apply
DROP POLICY IF EXISTS job_applications_insert_public ON public.job_applications;
CREATE POLICY job_applications_insert_public ON public.job_applications
  FOR INSERT
  WITH CHECK (true);

-- Only staff can read applications for their restaurant
DROP POLICY IF EXISTS job_applications_select_staff ON public.job_applications;
CREATE POLICY job_applications_select_staff ON public.job_applications
  FOR SELECT
  USING (public.is_staff_for_restaurant(restaurant_id));

-- ---------------------------------------------------------------------------
-- Storage bucket: 'applications'
-- Create this bucket in the Supabase Dashboard (public: true) then run the
-- policies below. Or uncomment the INSERT to create it via SQL.
-- ---------------------------------------------------------------------------

-- INSERT INTO storage.buckets (id, name, public)
-- VALUES ('applications', 'applications', true)
-- ON CONFLICT (id) DO NOTHING;

-- Anyone can upload a PDF (unauthenticated applicants)
-- DROP POLICY IF EXISTS applications_storage_insert_public ON storage.objects;
-- CREATE POLICY applications_storage_insert_public ON storage.objects
--   FOR INSERT
--   WITH CHECK (bucket_id = 'applications');

-- Public read so admin can open the PDF URL directly
-- DROP POLICY IF EXISTS applications_storage_read_public ON storage.objects;
-- CREATE POLICY applications_storage_read_public ON storage.objects
--   FOR SELECT
--   USING (bucket_id = 'applications');
