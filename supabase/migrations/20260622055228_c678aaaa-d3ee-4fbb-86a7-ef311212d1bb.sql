
CREATE TABLE public.sheet_connections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  program TEXT NOT NULL CHECK (program IN ('kkb','dkb')),
  name TEXT NOT NULL,
  sheet_id TEXT NOT NULL,
  tab_name TEXT,
  enabled BOOLEAN NOT NULL DEFAULT true,
  status TEXT NOT NULL DEFAULT 'unknown',
  row_count INTEGER,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sheet_connections TO anon, authenticated;
GRANT ALL ON public.sheet_connections TO service_role;

ALTER TABLE public.sheet_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read sheet_connections"
  ON public.sheet_connections FOR SELECT
  USING (true);

CREATE POLICY "Public write sheet_connections"
  ON public.sheet_connections FOR ALL
  USING (true) WITH CHECK (true);

INSERT INTO public.sheet_connections (program, name, sheet_id, enabled, status)
VALUES ('kkb', 'KKB Master', '1L4jEkuDeek2cUKoUGZpNbkfgMWf_i2CYJDDdMwBmpWY', true, 'unknown');
