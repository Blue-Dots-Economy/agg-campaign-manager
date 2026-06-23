CREATE OR REPLACE FUNCTION public.get_program_aggregate_payload(_program text)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
WITH aggregate_result AS (
  SELECT public.get_program_aggregates(_program) AS aggregates
),
state_row AS (
  SELECT last_synced_at, row_count, status
  FROM public.program_sync_state
  WHERE program = _program
),
connection_count AS (
  SELECT COUNT(*)::int AS count
  FROM public.sheet_connections
  WHERE program = _program AND enabled = true
)
SELECT jsonb_build_object(
  'connectionCount', COALESCE((SELECT count FROM connection_count), 0),
  'lastSyncedAt', (SELECT last_synced_at FROM state_row),
  'syncStatus', COALESCE((SELECT status FROM state_row), 'idle'),
  'stateRowCount', COALESCE((SELECT row_count FROM state_row), 0),
  'aggregates', (SELECT aggregates FROM aggregate_result)
);
$$;

GRANT EXECUTE ON FUNCTION public.get_program_aggregate_payload(text) TO anon, authenticated, service_role;