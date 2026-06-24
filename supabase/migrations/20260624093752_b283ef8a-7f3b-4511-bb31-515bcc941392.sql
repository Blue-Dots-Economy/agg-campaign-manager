CREATE TABLE public.program_export_targets (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  program text NOT NULL UNIQUE,
  sheet_id text NOT NULL DEFAULT '',
  tab_name text,
  label text,
  enabled boolean NOT NULL DEFAULT true,
  last_exported_at timestamp with time zone,
  last_error text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.program_export_targets TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.program_export_targets TO authenticated;
GRANT ALL ON public.program_export_targets TO service_role;

ALTER TABLE public.program_export_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read program_export_targets"
  ON public.program_export_targets FOR SELECT
  USING (true);

CREATE POLICY "Public write program_export_targets"
  ON public.program_export_targets FOR ALL
  USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.touch_export_target_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_program_export_targets_touch
  BEFORE UPDATE ON public.program_export_targets
  FOR EACH ROW EXECUTE FUNCTION public.touch_export_target_updated_at();