DROP POLICY IF EXISTS "Public read launched_batch_inputs" ON public.launched_batch_inputs;
DROP POLICY IF EXISTS "Public write launched_batch_inputs" ON public.launched_batch_inputs;

REVOKE ALL ON public.launched_batch_inputs FROM anon;
REVOKE ALL ON public.launched_batch_inputs FROM authenticated;
GRANT ALL ON public.launched_batch_inputs TO service_role;