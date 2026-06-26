ALTER ROLE anon SET statement_timeout = '30s';
ALTER ROLE authenticated SET statement_timeout = '30s';
NOTIFY pgrst, 'reload schema';