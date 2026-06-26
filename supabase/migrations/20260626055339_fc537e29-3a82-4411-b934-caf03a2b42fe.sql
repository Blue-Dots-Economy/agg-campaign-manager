DROP FUNCTION IF EXISTS public.get_program_aggregate_payload(text);
DROP FUNCTION IF EXISTS public.get_program_aggregate_payload(text, text, date, date);

GRANT EXECUTE ON FUNCTION public.get_program_aggregate_payload(text, text, date, date, text) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';