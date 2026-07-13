CREATE TABLE IF NOT EXISTS public.transcript_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  job_id text,
  call_id text,
  reviewer_name text,
  reviewer_email text,
  company_name text,
  campaign_day text,
  campaign_type text,
  language text,
  city_campaign text,
  contact_phone text,
  call_outcome text,
  job_status_in_master text,
  review_type text,
  quantitative_issues text,
  turn_flags text,
  overall_rating integer,
  reviewer_notes text,
  summary_match text,
  job_status_correct text,
  output_fields_accurate text,
  dataset text
);
CREATE UNIQUE INDEX IF NOT EXISTS transcript_reviews_call_reviewer_uidx
  ON public.transcript_reviews (call_id, reviewer_email);
CREATE INDEX IF NOT EXISTS transcript_reviews_call_idx ON public.transcript_reviews (call_id);
CREATE INDEX IF NOT EXISTS transcript_reviews_job_idx ON public.transcript_reviews (job_id);
GRANT ALL ON public.transcript_reviews TO anon, authenticated, service_role;
ALTER TABLE public.transcript_reviews ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tr public read" ON public.transcript_reviews;
CREATE POLICY "tr public read" ON public.transcript_reviews FOR SELECT USING (true);
DROP POLICY IF EXISTS "tr public write" ON public.transcript_reviews;
CREATE POLICY "tr public write" ON public.transcript_reviews FOR ALL USING (true) WITH CHECK (true);
NOTIFY pgrst, 'reload schema';