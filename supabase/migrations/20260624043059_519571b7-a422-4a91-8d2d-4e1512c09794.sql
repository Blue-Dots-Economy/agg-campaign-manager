
-- Backfill empty call_id with a stable fallback (row uuid) so uniqueness is meaningful
UPDATE public.call_rows
SET call_id = id::text
WHERE COALESCE(call_id, '') = '';

-- Remove duplicates per (program, call_id), keeping the most recently synced row
WITH ranked AS (
  SELECT id,
         row_number() OVER (PARTITION BY program, call_id ORDER BY synced_at DESC, id DESC) AS rn
  FROM public.call_rows
)
DELETE FROM public.call_rows c USING ranked r
WHERE c.id = r.id AND r.rn > 1;

-- Replace the non-unique lookup index with a unique one to enable upsert on (program, call_id)
DROP INDEX IF EXISTS public.call_rows_program_call_idx;
CREATE UNIQUE INDEX call_rows_program_call_uniq ON public.call_rows(program, call_id);
