CREATE POLICY "No client access launched_batch_inputs"
  ON public.launched_batch_inputs FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);