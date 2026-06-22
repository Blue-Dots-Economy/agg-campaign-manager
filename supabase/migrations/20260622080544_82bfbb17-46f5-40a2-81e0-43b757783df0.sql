CREATE TABLE public.program_agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program text NOT NULL CHECK (program IN ('kkb','dkb')),
  agent_id text NOT NULL,
  name text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'unknown',
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (program, agent_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.program_agents TO anon, authenticated;
GRANT ALL ON public.program_agents TO service_role;

ALTER TABLE public.program_agents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read program_agents" ON public.program_agents FOR SELECT USING (true);
CREATE POLICY "Public write program_agents" ON public.program_agents FOR ALL USING (true) WITH CHECK (true);