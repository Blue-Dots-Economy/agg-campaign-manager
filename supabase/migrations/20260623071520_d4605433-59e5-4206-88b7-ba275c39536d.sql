
-- Add columns needed for outcome/call metrics
ALTER TABLE public.call_rows
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS call_duration_seconds numeric,
  ADD COLUMN IF NOT EXISTS applications_count numeric,
  ADD COLUMN IF NOT EXISTS tried_to_apply boolean;

-- Backfill from JSONB for existing rows
UPDATE public.call_rows
SET
  phone = COALESCE(phone, NULLIF(data->>'phone',''), NULLIF(data->'raw'->>'phone',''), NULLIF(data->'raw'->>'contact_phone','')),
  call_duration_seconds = COALESCE(call_duration_seconds, NULLIF(regexp_replace(COALESCE(data->>'call_duration_seconds', data->'raw'->>'call_duration_seconds',''), '[^0-9\.\-]', '', 'g'),'')::numeric),
  applications_count = COALESCE(applications_count, NULLIF(regexp_replace(COALESCE(data->>'applications_count', data->'raw'->>'applications_count',''), '[^0-9\.\-]', '', 'g'),'')::numeric),
  tried_to_apply = COALESCE(tried_to_apply, lower(COALESCE(data->>'tried_to_apply', data->'raw'->>'tried_to_apply','')) IN ('true','yes','y','1'));

CREATE INDEX IF NOT EXISTS call_rows_program_phone_idx ON public.call_rows(program, phone);

-- Replace aggregate payload RPC to include labelled metric groups
CREATE OR REPLACE FUNCTION public.get_program_metric_groups(_program text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  total_calls int := 0;
  answered_calls int := 0;
  unanswered_calls int := 0;
  productive_calls int := 0;
  avg_dur numeric := 0;
  -- seeker-level
  seekers int := 0;
  answered_seekers int := 0;
  applied_seekers int := 0;
  failed_seekers int := 0;
  did_not_apply int := 0;
  total_applications numeric := 0;
  tried int := 0;
  application_rate numeric := 0;
  applied_pct numeric := 0;
  failed_pct numeric := 0;
  pickup numeric := 0;
  productive_pct numeric := 0;
  result jsonb;
BEGIN
  IF _program = 'kkb' THEN
    SELECT
      COUNT(*)::int,
      COUNT(*) FILTER (WHERE call_answered)::int,
      COUNT(*) FILTER (WHERE call_answered AND COALESCE(call_duration_seconds,0) > 30)::int,
      COALESCE(AVG(call_duration_seconds) FILTER (WHERE call_answered), 0)
    INTO total_calls, answered_calls, productive_calls, avg_dur
    FROM public.call_rows WHERE program = 'kkb';

    unanswered_calls := total_calls - answered_calls;
    pickup := CASE WHEN total_calls = 0 THEN 0 ELSE 100.0 * answered_calls / total_calls END;
    productive_pct := CASE WHEN total_calls = 0 THEN 0 ELSE 100.0 * productive_calls / total_calls END;

    SELECT
      COUNT(DISTINCT phone) FILTER (WHERE phone IS NOT NULL AND phone <> '')::int,
      COUNT(DISTINCT phone) FILTER (WHERE call_answered AND phone IS NOT NULL AND phone <> '')::int,
      COUNT(DISTINCT phone) FILTER (WHERE applied_to_job AND phone IS NOT NULL AND phone <> '')::int,
      COUNT(DISTINCT phone) FILTER (WHERE COALESCE(tried_to_apply,false) AND NOT COALESCE(applied_to_job,false) AND phone IS NOT NULL AND phone <> '')::int,
      COALESCE(SUM(applications_count), 0)
    INTO seekers, answered_seekers, applied_seekers, failed_seekers, total_applications
    FROM public.call_rows WHERE program = 'kkb';

    did_not_apply := GREATEST(answered_seekers - applied_seekers, 0);
    tried := applied_seekers + failed_seekers;
    applied_pct := CASE WHEN answered_seekers = 0 THEN 0 ELSE 100.0 * applied_seekers / answered_seekers END;
    failed_pct := CASE WHEN tried = 0 THEN 0 ELSE 100.0 * failed_seekers / tried END;
    application_rate := applied_pct;

    result := jsonb_build_array(
      jsonb_build_object(
        'key','outcome',
        'title','Outcome metrics',
        'subtitle','Per unique job seeker (deduped by phone)',
        'cards', jsonb_build_array(
          jsonb_build_object('key','seekers_called','label','Job Seekers Called','value', to_char(seekers,'FM999,999,999'),'sub','Unique phone numbers','accent','blue'),
          jsonb_build_object('key','applied','label','Applied to a Job','value', to_char(applied_seekers,'FM999,999,999'),'sub', to_char(applied_pct,'FM999990.0') || '% of seekers who answered','accent','green'),
          jsonb_build_object('key','failed_apply','label','Failed Apply Attempts','value', to_char(failed_seekers,'FM999,999,999'),'sub', to_char(failed_pct,'FM999990.0') || '% of seekers who tried','accent','amber'),
          jsonb_build_object('key','did_not_apply','label','Did Not Apply','value', to_char(did_not_apply,'FM999,999,999'),'sub','Answered but did not apply','accent','red'),
          jsonb_build_object('key','total_applications','label','Total Applications','value', to_char(ROUND(total_applications),'FM999,999,999'),'sub','Across all calls','accent','blue'),
          jsonb_build_object('key','application_rate','label','Application Rate','value', to_char(application_rate,'FM999990.0') || '%','sub','Seekers applied / seekers who answered','accent','green')
        )
      ),
      jsonb_build_object(
        'key','call',
        'title','Call metrics',
        'subtitle','Per call (raw rows)',
        'cards', jsonb_build_array(
          jsonb_build_object('key','total_calls','label','Total Calls','value', to_char(total_calls,'FM999,999,999'),'sub','All call attempts','accent','blue'),
          jsonb_build_object('key','answered','label','Answered Calls','value', to_char(answered_calls,'FM999,999,999'),'sub', to_char(pickup,'FM999990.0') || '% pickup rate','accent','green'),
          jsonb_build_object('key','unanswered','label','Unanswered Calls','value', to_char(unanswered_calls,'FM999,999,999'),'sub','No pickup','accent','red'),
          jsonb_build_object('key','productive','label','Productive Conversations','value', to_char(productive_pct,'FM999990.0') || '%','sub', to_char(productive_calls,'FM999,999,999') || ' calls — answered + duration > 30s','accent','amber'),
          jsonb_build_object('key','avg_duration','label','Avg Call Duration','value', to_char(ROUND(avg_dur::numeric, 1),'FM999990.0') || ' sec','sub','Answered calls only','accent','blue')
        )
      )
    );
  ELSE
    -- DKB placeholder (single neutral group, awaiting metrics from product)
    SELECT
      COUNT(*)::int,
      COUNT(*) FILTER (WHERE lower(COALESCE(call_status,'')) LIKE 'answered%' OR lower(COALESCE(call_status,'')) = 'completed')::int
    INTO total_calls, answered_calls
    FROM public.call_rows WHERE program = 'dkb';

    pickup := CASE WHEN total_calls = 0 THEN 0 ELSE 100.0 * answered_calls / total_calls END;

    result := jsonb_build_array(
      jsonb_build_object(
        'key','overview',
        'title','Overview',
        'subtitle','Detailed DKB metric groups coming soon',
        'cards', jsonb_build_array(
          jsonb_build_object('key','total_calls','label','Total Calls','value', to_char(total_calls,'FM999,999,999'),'sub','All call attempts','accent','blue'),
          jsonb_build_object('key','answered','label','Answered Calls','value', to_char(answered_calls,'FM999,999,999'),'sub', to_char(pickup,'FM999990.0') || '% pickup rate','accent','green')
        )
      )
    );
  END IF;

  RETURN result;
END;
$$;

-- Update payload RPC to embed metric groups
CREATE OR REPLACE FUNCTION public.get_program_aggregate_payload(_program text)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
WITH aggregate_result AS (
  SELECT public.get_program_aggregates(_program) AS aggregates
),
groups AS (
  SELECT public.get_program_metric_groups(_program) AS metric_groups
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
  'aggregates', (SELECT aggregates FROM aggregate_result),
  'metricGroups', (SELECT metric_groups FROM groups)
);
$$;
