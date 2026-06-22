
CREATE TABLE public.call_rows (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  program text NOT NULL,
  connection_id uuid,
  call_id text NOT NULL DEFAULT '',
  campaign_day text NOT NULL DEFAULT '',
  intent_score numeric,
  data jsonb NOT NULL,
  synced_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX call_rows_program_idx ON public.call_rows(program);
CREATE INDEX call_rows_program_day_idx ON public.call_rows(program, campaign_day);
CREATE INDEX call_rows_program_call_idx ON public.call_rows(program, call_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.call_rows TO anon, authenticated;
GRANT ALL ON public.call_rows TO service_role;
ALTER TABLE public.call_rows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read call_rows" ON public.call_rows FOR SELECT USING (true);
CREATE POLICY "Public write call_rows" ON public.call_rows FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE public.program_sync_state (
  program text NOT NULL PRIMARY KEY,
  last_synced_at timestamptz,
  row_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'idle',
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.program_sync_state TO anon, authenticated;
GRANT ALL ON public.program_sync_state TO service_role;
ALTER TABLE public.program_sync_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read program_sync_state" ON public.program_sync_state FOR SELECT USING (true);
CREATE POLICY "Public write program_sync_state" ON public.program_sync_state FOR ALL USING (true) WITH CHECK (true);
