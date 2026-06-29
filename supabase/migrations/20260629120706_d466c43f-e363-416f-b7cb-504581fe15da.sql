
CREATE OR REPLACE FUNCTION public.get_kkb_drop_analysis(
  _state text DEFAULT 'all',
  _date_from date DEFAULT NULL,
  _date_to date DEFAULT NULL,
  _campaign_type text DEFAULT 'all'
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
WITH base AS (
  SELECT
    COALESCE(call_answered,false) AS answered,
    COALESCE(call_engaged,false)  AS engaged,
    COALESCE(intent_score,0)      AS intent_score,
    COALESCE(applied_to_job,false) AS applied_to_job,
    COALESCE(drop_reason,'')      AS drop_reason,
    (
      (data->>'jobs_shown') IS NOT NULL
      AND lower(data->>'jobs_shown') IN ('true','yes','y','1')
    ) AS jobs_shown_flag,
    (
      COALESCE(applied_to_job,false)
      OR (jsonb_typeof(data->'jobs_applied')='array' AND jsonb_array_length(data->'jobs_applied')>0)
    ) AS applied_flag,
    CASE
      WHEN city_campaign = 'Ghaziabad' OR lower(COALESCE(language,'')) = 'hindi' THEN 'GZB'
      WHEN city_campaign = 'Hubli-Dharwad' OR lower(COALESCE(language,'')) = 'kannada' THEN 'KA'
      ELSE NULL
    END AS region_code,
    CASE
      WHEN COALESCE(campaign_date,'') ~ '^[0-9]{4,6}$'
        THEN (DATE '1899-12-30' + (campaign_date)::int)::date
      WHEN COALESCE(campaign_date,'') ~ '^\d{4}-\d{2}-\d{2}'
        THEN substring(campaign_date,1,10)::date
      WHEN COALESCE(data->>'call_datetime_ist','') ~ '^\d{4}-\d{2}-\d{2}'
        THEN substring(data->>'call_datetime_ist',1,10)::date
      ELSE NULL
    END AS call_date,
    COALESCE(campaign_type,'') AS ctype
  FROM public.call_rows
  WHERE program = 'kkb'
),
filtered AS (
  SELECT * FROM base
  WHERE (_state = 'all' OR region_code = _state)
    AND (_date_from IS NULL OR (call_date IS NOT NULL AND call_date >= _date_from))
    AND (_date_to   IS NULL OR (call_date IS NOT NULL AND call_date <= _date_to))
    AND (
      _campaign_type = 'all'
      OR (_campaign_type = 'higher_education'
          AND (LOWER(ctype) LIKE '%higher%education%' OR LOWER(ctype) LIKE '%higher_education%'))
      OR (_campaign_type = 'normal'
          AND LOWER(ctype) NOT LIKE '%higher%education%'
          AND LOWER(ctype) NOT LIKE '%higher_education%')
    )
),
staged AS (
  SELECT
    drop_reason,
    applied_flag,
    CASE
      WHEN NOT answered THEN 'calls_picked'
      WHEN answered AND NOT engaged THEN 'picked_engaged'
      WHEN answered AND engaged AND NOT jobs_shown_flag THEN 'engaged_jobs'
      WHEN answered AND engaged AND jobs_shown_flag AND intent_score < 5 THEN 'jobs_highintent'
      WHEN answered AND engaged AND jobs_shown_flag AND intent_score >= 5 AND NOT applied_flag THEN 'highintent_applied'
      ELSE NULL  -- converted (applied)
    END AS stage
  FROM filtered
),
bucketed AS (
  SELECT
    stage,
    drop_reason,
    CASE
      WHEN stage = 'calls_picked' THEN 'No pickup'
      WHEN LOWER(TRIM(drop_reason)) LIKE '%language%' THEN 'Language barrier'
      WHEN LOWER(TRIM(drop_reason)) LIKE '%salary%'
        OR LOWER(TRIM(drop_reason)) LIKE '%low savings%'
        OR LOWER(TRIM(drop_reason)) LIKE '%pay too%' THEN 'Salary too low'
      WHEN LOWER(TRIM(drop_reason)) LIKE '%already employed%'
        OR LOWER(TRIM(drop_reason)) LIKE '%already_employed%' THEN 'Already employed'
      WHEN LOWER(TRIM(drop_reason)) LIKE '%call later%'
        OR LOWER(TRIM(drop_reason)) LIKE '%callback%'
        OR LOWER(TRIM(drop_reason)) LIKE '%call_back%'
        OR LOWER(TRIM(drop_reason)) LIKE '%apply later%'
        OR LOWER(TRIM(drop_reason)) LIKE '%look later%'
        OR LOWER(TRIM(drop_reason)) LIKE '%call_later%'
        OR LOWER(TRIM(drop_reason)) LIKE '%wait%'
        OR LOWER(TRIM(drop_reason)) LIKE '%asked_callback%' THEN 'Asked to call later'
      WHEN LOWER(TRIM(drop_reason)) LIKE '%apply_fail%'
        OR LOWER(TRIM(drop_reason)) LIKE '%apply failure%'
        OR LOWER(TRIM(drop_reason)) LIKE '%apply failures%'
        OR LOWER(TRIM(drop_reason)) LIKE '%failed to apply%' THEN 'Apply failure'
      WHEN LOWER(TRIM(drop_reason)) LIKE '%profile%'
        OR LOWER(TRIM(drop_reason)) LIKE '%could not provide%'
        OR LOWER(TRIM(drop_reason)) LIKE '%required details%' THEN 'Profile friction'
      WHEN LOWER(TRIM(drop_reason)) LIKE '%no_matching%'
        OR LOWER(TRIM(drop_reason)) LIKE '%no matching%'
        OR LOWER(TRIM(drop_reason)) LIKE '%no suitable%'
        OR LOWER(TRIM(drop_reason)) LIKE '%mismatch%'
        OR LOWER(TRIM(drop_reason)) LIKE '%too far%'
        OR LOWER(TRIM(drop_reason)) LIKE '%not in his field%'
        OR LOWER(TRIM(drop_reason)) LIKE '%not relevant%'
        OR LOWER(TRIM(drop_reason)) LIKE '%only wants%'
        OR LOWER(TRIM(drop_reason)) LIKE '%govt%'
        OR LOWER(TRIM(drop_reason)) LIKE '%government%'
        OR LOWER(TRIM(drop_reason)) LIKE '%location%'
        OR LOWER(TRIM(drop_reason)) LIKE '%jobs not%'
        OR LOWER(TRIM(drop_reason)) LIKE '%suggested roles%'
        OR LOWER(TRIM(drop_reason)) LIKE '%offered jobs%'
        OR LOWER(TRIM(drop_reason)) LIKE '%shown jobs%'
        OR LOWER(TRIM(drop_reason)) LIKE '%work from home%'
        OR LOWER(TRIM(drop_reason)) LIKE '%wfh%'
        OR LOWER(TRIM(drop_reason)) LIKE '%not qualified%'
        OR LOWER(TRIM(drop_reason)) LIKE '%roles%' THEN 'Job mismatch'
      WHEN LOWER(TRIM(drop_reason)) LIKE '%bot%'
        OR LOWER(TRIM(drop_reason)) LIKE '%unclear%'
        OR LOWER(TRIM(drop_reason)) LIKE '%inaudible%'
        OR LOWER(TRIM(drop_reason)) LIKE '%audio%'
        OR LOWER(TRIM(drop_reason)) LIKE '%softly%'
        OR LOWER(TRIM(drop_reason)) LIKE '%incoherent%'
        OR LOWER(TRIM(drop_reason)) LIKE '%understand%'
        OR LOWER(TRIM(drop_reason)) LIKE '%unresponsive%'
        OR LOWER(TRIM(drop_reason)) LIKE '%speech%' THEN 'Bot / audio issue'
      WHEN LOWER(TRIM(drop_reason)) LIKE '%not interested%'
        OR LOWER(TRIM(drop_reason)) LIKE '%not_interested%'
        OR LOWER(TRIM(drop_reason)) LIKE '%not looking%'
        OR LOWER(TRIM(drop_reason)) LIKE '%not_looking%'
        OR LOWER(TRIM(drop_reason)) LIKE '%declined%'
        OR LOWER(TRIM(drop_reason)) LIKE '%user_declined%'
        OR LOWER(TRIM(drop_reason)) LIKE '%wrong number%'
        OR LOWER(TRIM(drop_reason)) LIKE '%do not call%'
        OR LOWER(TRIM(drop_reason)) LIKE '%not to call%'
        OR LOWER(TRIM(drop_reason)) LIKE '%not available%'
        OR LOWER(TRIM(drop_reason)) LIKE '%exit%'
        OR LOWER(TRIM(drop_reason)) LIKE '%end call%' THEN 'Not interested'
      WHEN LOWER(TRIM(drop_reason)) LIKE '%hang%'
        OR LOWER(TRIM(drop_reason)) LIKE '%hung%'
        OR LOWER(TRIM(drop_reason)) LIKE '%silent%'
        OR LOWER(TRIM(drop_reason)) LIKE '%no response%'
        OR LOWER(TRIM(drop_reason)) LIKE '%no_response%'
        OR LOWER(TRIM(drop_reason)) LIKE '%voicemail%'
        OR LOWER(TRIM(drop_reason)) LIKE '%hold%'
        OR LOWER(TRIM(drop_reason)) LIKE '%disengage%'
        OR LOWER(TRIM(drop_reason)) LIKE '%record message%'
        OR LOWER(TRIM(drop_reason)) LIKE '%recorded message%' THEN 'Hung up / disengaged'
      WHEN LOWER(TRIM(drop_reason)) LIKE '%not captured%'
        OR TRIM(COALESCE(drop_reason,'')) = '' THEN 'Not captured'
      ELSE 'Other'
    END AS bucket
  FROM staged
  WHERE stage IS NOT NULL  -- exclude converted
),
agg AS (
  SELECT
    bucket,
    stage,
    CASE
      WHEN bucket = 'No pickup' THEN 'Unanswered / no pickup'
      ELSE COALESCE(NULLIF(TRIM(drop_reason),''), 'Not captured')
    END AS reason_label,
    COUNT(*)::int AS cnt
  FROM bucketed
  GROUP BY 1,2,3
),
by_stage AS (
  SELECT bucket, stage, SUM(cnt)::int AS cnt
  FROM agg GROUP BY 1,2
),
bucket_totals AS (
  SELECT bucket, SUM(cnt)::int AS total
  FROM by_stage GROUP BY 1
),
raw_per_bucket AS (
  SELECT bucket,
    jsonb_agg(jsonb_build_object('reason', reason_label, 'count', cnt) ORDER BY cnt DESC) AS raw
  FROM (
    SELECT bucket, reason_label, SUM(cnt)::int AS cnt
    FROM agg GROUP BY 1,2
  ) s
  GROUP BY bucket
),
stage_map AS (
  SELECT bucket,
    jsonb_object_agg(stage, cnt) AS by_stage_obj
  FROM by_stage GROUP BY 1
),
buckets_json AS (
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'bucket', bt.bucket,
      'byStage', jsonb_build_object(
        'calls_picked',       COALESCE((sm.by_stage_obj->>'calls_picked')::int, 0),
        'picked_engaged',     COALESCE((sm.by_stage_obj->>'picked_engaged')::int, 0),
        'engaged_jobs',       COALESCE((sm.by_stage_obj->>'engaged_jobs')::int, 0),
        'jobs_highintent',    COALESCE((sm.by_stage_obj->>'jobs_highintent')::int, 0),
        'highintent_applied', COALESCE((sm.by_stage_obj->>'highintent_applied')::int, 0)
      ),
      'total', bt.total,
      'raw',   COALESCE(rp.raw, '[]'::jsonb)
    ) ORDER BY bt.total DESC
  ), '[]'::jsonb) AS arr
  FROM bucket_totals bt
  LEFT JOIN stage_map sm USING (bucket)
  LEFT JOIN raw_per_bucket rp USING (bucket)
),
max_cell AS (
  SELECT COALESCE(MAX(cnt), 0)::int AS m FROM by_stage
),
grand AS (
  SELECT COALESCE(SUM(total),0)::int AS g FROM bucket_totals
)
SELECT jsonb_build_object(
  'stages', jsonb_build_array(
    jsonb_build_object('key','calls_picked',       'label','Calls → Picked up'),
    jsonb_build_object('key','picked_engaged',     'label','Picked up → Engaged'),
    jsonb_build_object('key','engaged_jobs',       'label','Engaged → Jobs shown'),
    jsonb_build_object('key','jobs_highintent',    'label','Jobs shown → High-intent'),
    jsonb_build_object('key','highintent_applied', 'label','High-intent → Applied')
  ),
  'buckets',    (SELECT arr FROM buckets_json),
  'maxCell',    (SELECT m FROM max_cell),
  'grandTotal', (SELECT g FROM grand)
);
$$;

GRANT EXECUTE ON FUNCTION public.get_kkb_drop_analysis(text, date, date, text)
  TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
