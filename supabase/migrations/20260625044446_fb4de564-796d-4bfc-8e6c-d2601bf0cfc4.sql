CREATE TABLE public.launched_batch_inputs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id text NOT NULL,
  program text NOT NULL,
  normalized_phone text NOT NULL,
  contact_name text,
  recommendations text,
  user_intent text,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (batch_id, normalized_phone)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.launched_batch_inputs TO anon, authenticated;
GRANT ALL ON public.launched_batch_inputs TO service_role;

ALTER TABLE public.launched_batch_inputs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read launched_batch_inputs"
  ON public.launched_batch_inputs FOR SELECT
  USING (true);

CREATE POLICY "Public write launched_batch_inputs"
  ON public.launched_batch_inputs FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE INDEX launched_batch_inputs_batch_phone_idx
  ON public.launched_batch_inputs (batch_id, normalized_phone);

CREATE INDEX launched_batch_inputs_program_idx
  ON public.launched_batch_inputs (program, created_at DESC);

CREATE OR REPLACE FUNCTION public.touch_launched_batch_inputs_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_launched_batch_inputs_touch
  BEFORE UPDATE ON public.launched_batch_inputs
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_launched_batch_inputs_updated_at();