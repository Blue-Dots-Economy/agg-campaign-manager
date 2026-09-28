CREATE TABLE public.atlas_control (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  dispatch_enabled boolean NOT NULL DEFAULT false,
  killed boolean NOT NULL DEFAULT false,
  updated_at timestamptz DEFAULT now()
);
GRANT ALL ON public.atlas_control TO service_role;
ALTER TABLE public.atlas_control ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.atlas_cohorts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  run_date date DEFAULT current_date,
  program text, region text, budget int, confidence_min numeric,
  cooldown_days int, max_campaigns int, explore_pct numeric,
  status text NOT NULL DEFAULT 'proposed',
  model_mark text DEFAULT 'Mark I',
  total_count int, narration text, fairness jsonb, params jsonb, created_by text
);
GRANT ALL ON public.atlas_cohorts TO service_role;
ALTER TABLE public.atlas_cohorts ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.atlas_cohort_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id uuid REFERENCES public.atlas_cohorts(id) ON DELETE CASCADE,
  phone_masked text, region text, district text, category text,
  confidence numeric, total_campaigns int, last_call_date text,
  intent numeric, match numeric, priority_score numeric, reason text,
  is_exploration boolean DEFAULT false
);
CREATE INDEX atlas_cohort_members_cohort_idx ON public.atlas_cohort_members(cohort_id);
GRANT ALL ON public.atlas_cohort_members TO service_role;
ALTER TABLE public.atlas_cohort_members ENABLE ROW LEVEL SECURITY;