CREATE TABLE public.launched_batches (
  batch_id text PRIMARY KEY,
  program text NOT NULL,
  agent_id text,
  agent_name text,
  batch_name text,
  campaign_day text,
  campaign_date text,
  campaign_type text,
  language text,
  city_campaign text,
  region text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.launched_batches TO anon, authenticated;
GRANT ALL ON public.launched_batches TO service_role;

ALTER TABLE public.launched_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read launched_batches" ON public.launched_batches FOR SELECT USING (true);
CREATE POLICY "Public write launched_batches" ON public.launched_batches FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX launched_batches_program_idx ON public.launched_batches (program, created_at DESC);