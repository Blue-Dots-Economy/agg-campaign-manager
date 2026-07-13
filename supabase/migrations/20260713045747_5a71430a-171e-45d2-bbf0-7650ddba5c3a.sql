CREATE TABLE IF NOT EXISTS public.reviewers (
  email text PRIMARY KEY,
  added_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.reviewers TO anon, authenticated, service_role;
ALTER TABLE public.reviewers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "reviewers public read" ON public.reviewers;
CREATE POLICY "reviewers public read" ON public.reviewers FOR SELECT USING (true);
DROP POLICY IF EXISTS "reviewers public write" ON public.reviewers;
CREATE POLICY "reviewers public write" ON public.reviewers FOR ALL USING (true) WITH CHECK (true);
INSERT INTO public.reviewers(email) VALUES
 ('aryan@bluedots.com'),('vineela@bluedots.com'),('tushar@bluedots.com'),
 ('santosh@bluedots.com'),('adarsh@bluedots.com'),('parth.b@bluedots.com'),
 ('parth.s@bluedots.com'),('khushboo@bluedots.com'),('palak@bluedots.com')
ON CONFLICT (email) DO NOTHING;
NOTIFY pgrst, 'reload schema';