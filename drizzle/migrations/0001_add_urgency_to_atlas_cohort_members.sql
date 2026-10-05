ALTER TABLE public.atlas_cohort_members ADD COLUMN urgency numeric;
ALTER TABLE public.atlas_cohort_members ADD COLUMN urgency_reason text;
ALTER TABLE public.atlas_cohort_members ADD COLUMN is_urgent boolean DEFAULT false;