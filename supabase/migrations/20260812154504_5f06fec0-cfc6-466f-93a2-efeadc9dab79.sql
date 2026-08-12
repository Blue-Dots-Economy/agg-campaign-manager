DO $do$
DECLARE d text; d2 text;
BEGIN
  SELECT pg_get_functiondef('public.get_program_metrics_raw(text,text,date,date,text,text,text)'::regprocedure) INTO d;

  d2 := replace(d,
    '((data->>''jobs_shown'') IS NOT NULL AND lower(data->>''jobs_shown'') IN (''true'',''yes'',''y'',''1'')) AS jobs_shown_flag,',
    '((data->>''jobs_shown'') IS NOT NULL AND lower(data->>''jobs_shown'') IN (''true'',''yes'',''y'',''1'')) AS jobs_shown_flag, (lower(COALESCE(call_outcome,'''')) <> ''pending'' AND lower(COALESCE(call_outcome,'''')) NOT LIKE ''not dialled%'') AS dialled_flag,');
  IF d2 = d THEN RAISE EXCEPTION 'jobs_shown_flag anchor not found'; END IF;
  d := d2;

  d2 := regexp_replace(d,
    'COUNT\(\*\)::int,(\s*)COUNT\(\*\) FILTER \(WHERE call_answered\)',
    'COUNT(*) FILTER (WHERE dialled_flag)::int,\1COUNT(*) FILTER (WHERE call_answered)');
  IF d2 = d THEN RAISE EXCEPTION 'total_calls anchor not found'; END IF;

  EXECUTE d2;
END
$do$;

CREATE OR REPLACE FUNCTION public.get_kkb_call_outcomes(_state text DEFAULT 'all'::text, _date_from date DEFAULT NULL::date, _date_to date DEFAULT NULL::date, _campaign_type text DEFAULT 'all'::text, _campaign text DEFAULT NULL::text, _channel text DEFAULT 'all'::text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH base AS (
    SELECT
      COALESCE(NULLIF(btrim(call_outcome), ''), 'Unknown') AS outcome,
      COALESCE(campaign_type,'') AS campaign_type,
      CASE
        WHEN city_campaign = 'Ghaziabad' OR lower(COALESCE(language,'')) = 'hindi' THEN 'GZB'
        WHEN city_campaign = 'Hubli-Dharwad' OR lower(COALESCE(language,'')) = 'kannada' THEN 'KA'
        ELSE NULL END AS region_code,
      CASE
        WHEN COALESCE(campaign_date,'') ~ '^[0-9]{4,6}$'
          THEN (DATE '1899-12-30' + (campaign_date)::int)::date
        WHEN COALESCE(campaign_date,'') ~ '^\d{4}-\d{2}-\d{2}'
          THEN substring(campaign_date, 1, 10)::date
        WHEN COALESCE(data->>'call_datetime_ist','') ~ '^\d{4}-\d{2}-\d{2}'
          THEN substring(data->>'call_datetime_ist', 1, 10)::date
        ELSE NULL END AS call_date
    FROM public.call_rows
    WHERE program = 'kkb' AND (_channel = 'all' OR channel = _channel)
  ),
  f AS (
    SELECT * FROM base
    WHERE (_state = 'all' OR region_code = _state)
      AND (_date_from IS NULL OR (call_date IS NOT NULL AND call_date >= _date_from))
      AND (_date_to   IS NULL OR (call_date IS NOT NULL AND call_date <= _date_to))
      AND (_campaign IS NULL OR campaign_type = _campaign)
      AND (
        _campaign_type = 'all'
        OR (_campaign_type = 'higher_education'
            AND (LOWER(campaign_type) LIKE '%higher%education%' OR LOWER(campaign_type) LIKE '%higher_education%'))
        OR (_campaign_type = 'normal'
            AND LOWER(campaign_type) NOT LIKE '%higher%education%'
            AND LOWER(campaign_type) NOT LIKE '%higher_education%')
      )
  ),
  g AS (
    SELECT outcome, COUNT(*)::int AS n FROM f GROUP BY outcome ORDER BY n DESC
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object('outcome', outcome, 'n', n)), '[]'::jsonb) FROM g;
$function$;

NOTIFY pgrst, 'reload schema';