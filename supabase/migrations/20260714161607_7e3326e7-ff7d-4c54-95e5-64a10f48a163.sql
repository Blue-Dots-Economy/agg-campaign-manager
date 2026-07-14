
ALTER TABLE public.call_rows ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'outbound';
ALTER TABLE public.sheet_connections ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'outbound';

INSERT INTO public.sheet_connections (program, name, sheet_id, tab_name, enabled, status, channel)
SELECT 'kkb', 'KKB Inbound', sheet_id, 'Inbound', true, 'unknown', 'inbound'
FROM public.sheet_connections
WHERE program = 'kkb' AND channel = 'outbound' AND enabled = true
  AND NOT EXISTS (
    SELECT 1 FROM public.sheet_connections WHERE program = 'kkb' AND channel = 'inbound'
  )
ORDER BY created_at ASC
LIMIT 1;

NOTIFY pgrst, 'reload schema';
