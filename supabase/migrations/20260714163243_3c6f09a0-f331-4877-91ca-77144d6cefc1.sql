
DROP FUNCTION IF EXISTS public.get_program_aggregates(text, text, date, date, text, text);
DROP FUNCTION IF EXISTS public.get_program_metric_groups(text, text, date, date, text, text);
DROP FUNCTION IF EXISTS public.get_program_metrics_raw(text, text, date, date, text, text);
NOTIFY pgrst, 'reload schema';
