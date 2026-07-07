
CREATE OR REPLACE FUNCTION public.get_dkb_drop_analysis(
  _state text DEFAULT 'all',
  _date_from date DEFAULT NULL,
  _date_to date DEFAULT NULL,
  _campaign_type text DEFAULT 'all',
  _campaign text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
WITH base AS (
  SELECT
    COALESCE(call_answered,false) AS answered,
    COALESCE(drop_reason,'')      AS drop_reason,
    lower(coalesce(new_job_posted, data->'raw'->>'new_job_posted','')) IN ('true','yes','y','1') AS converted,
    lower(coalesce(job_status, data->'raw'->>'job_status','')) IN ('active','closed') AS has_status,
    (
      lower(coalesce(talent_insights_shown, data->'raw'->>'talent_insights_shown','')) IN ('true','yes','y','1')
      OR lower(coalesce(data->'raw'->>'fields_updated','')) NOT IN ('','0','none','no','false','nan')
    ) AS updated,
    lower(coalesce(data->'raw'->>'new_job_mentioned','')) IN ('true','yes','y','1') AS mentioned,
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
  WHERE program = 'dkb'
),
filtered AS (
  SELECT * FROM base
  WHERE answered = true
    AND converted = false
    AND (_state = 'all' OR region_code = _state)
    AND (_date_from IS NULL OR (call_date IS NOT NULL AND call_date >= _date_from))
    AND (_date_to   IS NULL OR (call_date IS NOT NULL AND call_date <= _date_to))
    AND (_campaign IS NULL OR ctype = _campaign)
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
    CASE
      WHEN mentioned THEN 'new_job'
      WHEN updated   THEN 'update'
      WHEN has_status THEN 'refresh'
      ELSE 'intro'
    END AS stage
  FROM filtered
),
bucketed AS (
  SELECT
    stage,
    drop_reason,
    CASE
      WHEN LOWER(TRIM(drop_reason)) LIKE '%hung%'
        OR LOWER(TRIM(drop_reason)) LIKE '%hang%'
        OR LOWER(TRIM(drop_reason)) LIKE '%disengage%' THEN 'Hung up / disengaged'
      WHEN LOWER(TRIM(drop_reason)) LIKE '%audio%'
        OR LOWER(TRIM(drop_reason)) LIKE '%comprehension%'
        OR LOWER(TRIM(drop_reason)) LIKE '%unclear%'
        OR LOWER(TRIM(drop_reason)) LIKE '%inaudible%' THEN 'Audio / comprehension'
      WHEN LOWER(TRIM(drop_reason)) LIKE '%refus%'
        OR LOWER(TRIM(drop_reason)) LIKE '%declin%' THEN 'Owner refused / declined'
      WHEN LOWER(TRIM(drop_reason)) LIKE '%busy%'
        OR LOWER(TRIM(drop_reason)) LIKE '%call back%'
        OR LOWER(TRIM(drop_reason)) LIKE '%callback%'
        OR LOWER(TRIM(drop_reason)) LIKE '%call later%' THEN 'Busy / callback'
      WHEN TRIM(COALESCE(drop_reason,'')) = ''
        OR TRIM(COALESCE(drop_reason,'')) ~ '^[0-9]+(\.[0-9]+)?$' THEN 'Not captured'
      ELSE 'Other'
    END AS bucket
  FROM staged
),
agg AS (
  SELECT
    bucket,
    stage,
    COALESCE(NULLIF(TRIM(drop_reason),''), 'Not captured') AS reason_label,
    COUNT(*)::int AS cnt
  FROM bucketed
  GROUP BY 1,2,3
),
by_stage AS (
  SELECT bucket, stage, SUM(cnt)::int AS cnt FROM agg GROUP BY 1,2
),
bucket_totals AS (
  SELECT bucket, SUM(cnt)::int AS total FROM by_stage GROUP BY 1
),
raw_per_bucket AS (
  SELECT bucket,
    jsonb_agg(jsonb_build_object('reason', reason_label, 'count', cnt) ORDER BY cnt DESC) AS raw
  FROM (
    SELECT bucket, reason_label, SUM(cnt)::int AS cnt FROM agg GROUP BY 1,2
  ) s
  GROUP BY bucket
),
stage_map AS (
  SELECT bucket, jsonb_object_agg(stage, cnt) AS by_stage_obj FROM by_stage GROUP BY 1
),
buckets_json AS (
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'bucket', bt.bucket,
      'byStage', jsonb_build_object(
        'intro',   COALESCE((sm.by_stage_obj->>'intro')::int, 0),
        'refresh', COALESCE((sm.by_stage_obj->>'refresh')::int, 0),
        'update',  COALESCE((sm.by_stage_obj->>'update')::int, 0),
        'new_job', COALESCE((sm.by_stage_obj->>'new_job')::int, 0)
      ),
      'total', bt.total,
      'raw',   COALESCE(rp.raw, '[]'::jsonb)
    ) ORDER BY bt.total DESC
  ), '[]'::jsonb) AS arr
  FROM bucket_totals bt
  LEFT JOIN stage_map sm USING (bucket)
  LEFT JOIN raw_per_bucket rp USING (bucket)
),
max_cell AS ( SELECT COALESCE(MAX(cnt), 0)::int AS m FROM by_stage ),
grand    AS ( SELECT COALESCE(SUM(total),0)::int AS g FROM bucket_totals )
SELECT jsonb_build_object(
  'stages', jsonb_build_array(
    jsonb_build_object('key','intro',   'label','Introduction'),
    jsonb_build_object('key','refresh', 'label','Refresh'),
    jsonb_build_object('key','update',  'label','Update'),
    jsonb_build_object('key','new_job', 'label','New Job Posted')
  ),
  'buckets',    (SELECT arr FROM buckets_json),
  'maxCell',    (SELECT m FROM max_cell),
  'grandTotal', (SELECT g FROM grand)
);
$function$;

GRANT EXECUTE ON FUNCTION public.get_dkb_drop_analysis(text, date, date, text, text) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
