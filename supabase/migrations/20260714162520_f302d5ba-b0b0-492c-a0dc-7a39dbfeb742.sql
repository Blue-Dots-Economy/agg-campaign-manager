CREATE OR REPLACE FUNCTION public.get_campaign_drop_causes(_campaign text, _state text DEFAULT 'all'::text, _date_from date DEFAULT NULL::date, _date_to date DEFAULT NULL::date, _channel text DEFAULT 'all'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  dom_region text;
  sample_calls int;
  result jsonb;
BEGIN
  WITH base AS (
    SELECT
      COALESCE(call_answered,false) AS answered,
      COALESCE(call_engaged,false)  AS engaged,
      COALESCE(intent_score,0)      AS intent_score,
      COALESCE(applied_to_job,false) AS applied_to_job,
      COALESCE(tried_to_apply,false) AS tried_to_apply,
      COALESCE(drop_reason,'')      AS drop_reason,
      ((data->>'jobs_shown') IS NOT NULL AND lower(data->>'jobs_shown') IN ('true','yes','y','1')) AS jobs_shown_flag,
      (jsonb_typeof(data->'jobs_applied')='array' AND jsonb_array_length(data->'jobs_applied')>0) AS jobs_applied_nonempty,
      (jsonb_typeof(data->'jobs_failed_to_apply')='array' AND jsonb_array_length(data->'jobs_failed_to_apply')>0) AS jobs_failed_nonempty,
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
      AND (_channel = 'all' OR channel = _channel)
  ),
  filtered_all AS (
    SELECT * FROM base
    WHERE (_state = 'all' OR region_code = _state)
      AND (_date_from IS NULL OR (call_date IS NOT NULL AND call_date >= _date_from))
      AND (_date_to   IS NULL OR (call_date IS NOT NULL AND call_date <= _date_to))
  ),
  campaign_rows AS (
    SELECT * FROM filtered_all WHERE ctype = _campaign
  )
  SELECT
    (SELECT COUNT(*)::int FROM campaign_rows),
    (SELECT region_code FROM campaign_rows
      WHERE region_code IS NOT NULL
      GROUP BY region_code
      ORDER BY COUNT(*) DESC
      LIMIT 1)
  INTO sample_calls, dom_region;

  WITH base AS (
    SELECT
      COALESCE(call_answered,false) AS answered,
      COALESCE(call_engaged,false)  AS engaged,
      COALESCE(intent_score,0)      AS intent_score,
      COALESCE(applied_to_job,false) AS applied_to_job,
      COALESCE(tried_to_apply,false) AS tried_to_apply,
      COALESCE(drop_reason,'')      AS drop_reason,
      ((data->>'jobs_shown') IS NOT NULL AND lower(data->>'jobs_shown') IN ('true','yes','y','1')) AS jobs_shown_flag,
      (jsonb_typeof(data->'jobs_applied')='array' AND jsonb_array_length(data->'jobs_applied')>0) AS jobs_applied_nonempty,
      (jsonb_typeof(data->'jobs_failed_to_apply')='array' AND jsonb_array_length(data->'jobs_failed_to_apply')>0) AS jobs_failed_nonempty,
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
      AND (_channel = 'all' OR channel = _channel)
  ),
  date_filtered AS (
    SELECT * FROM base
    WHERE (_date_from IS NULL OR (call_date IS NOT NULL AND call_date >= _date_from))
      AND (_date_to   IS NULL OR (call_date IS NOT NULL AND call_date <= _date_to))
  ),
  non_conv AS (
    SELECT
      (ctype = _campaign AND (_state = 'all' OR region_code = _state)) AS in_campaign,
      (dom_region IS NULL OR region_code = dom_region) AS in_region,
      answered, engaged, intent_score,
      applied_to_job, jobs_applied_nonempty,
      CASE
        WHEN tried_to_apply OR jobs_applied_nonempty OR jobs_failed_nonempty THEN 'apply'
        WHEN jobs_shown_flag AND intent_score >= 5 THEN 'deliberation'
        WHEN jobs_shown_flag AND (
          LOWER(drop_reason) LIKE '%suggested role%'
          OR LOWER(drop_reason) LIKE '%suggested roles%'
          OR LOWER(drop_reason) LIKE '%suggested job%'
          OR LOWER(drop_reason) LIKE '%offered job%'
          OR LOWER(drop_reason) LIKE '%none of the listed%'
          OR LOWER(drop_reason) LIKE '%other roles%'
          OR LOWER(drop_reason) LIKE '%not interested in suggested%'
        ) THEN 'extra'
        WHEN jobs_shown_flag THEN 'jobs'
        WHEN engaged THEN 'profile'
        ELSE 'intro'
      END AS phase,
      CASE
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
    FROM date_filtered
    WHERE answered = true
      AND NOT (applied_to_job OR jobs_applied_nonempty)
  ),
  hi_seg AS (
    SELECT * FROM non_conv WHERE in_campaign AND intent_score >= 5
  ),
  hi_seg_total AS ( SELECT COUNT(*)::int AS n FROM hi_seg ),
  hi_top AS (
    SELECT phase, bucket, COUNT(*)::int AS cnt
    FROM hi_seg
    GROUP BY phase, bucket
    ORDER BY cnt DESC
    LIMIT 3
  ),
  phase_labels AS (
    SELECT * FROM (VALUES
      ('intro','Introduction',1),
      ('profile','Profile Fetch',2),
      ('jobs','Jobs Shown',3),
      ('extra','Extra Job Shown',4),
      ('deliberation','Job Deliberation',5),
      ('apply','Apply',6)
    ) AS t(k,l,ord)
  ),
  camp_phase AS (
    SELECT phase, COUNT(*)::int AS cnt FROM non_conv WHERE in_campaign GROUP BY phase
  ),
  camp_total AS ( SELECT COALESCE(SUM(cnt),0)::int AS n FROM camp_phase ),
  reg_phase AS (
    SELECT phase, COUNT(*)::int AS cnt FROM non_conv WHERE in_region GROUP BY phase
  ),
  reg_total AS ( SELECT COALESCE(SUM(cnt),0)::int AS n FROM reg_phase ),
  phase_share AS (
    SELECT jsonb_agg(
      jsonb_build_object(
        'phaseKey', pl.k,
        'phaseLabel', pl.l,
        'campaignPct', CASE WHEN (SELECT n FROM camp_total) = 0 THEN 0
          ELSE ROUND(100.0 * COALESCE(cp.cnt,0) / (SELECT n FROM camp_total), 1) END,
        'regionPct', CASE WHEN (SELECT n FROM reg_total) = 0 THEN 0
          ELSE ROUND(100.0 * COALESCE(rp.cnt,0) / (SELECT n FROM reg_total), 1) END
      ) ORDER BY pl.ord
    ) AS arr
    FROM phase_labels pl
    LEFT JOIN camp_phase cp ON cp.phase = pl.k
    LEFT JOIN reg_phase rp ON rp.phase = pl.k
  ),
  hi_top_json AS (
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'phase', (SELECT l FROM phase_labels WHERE k = ht.phase),
        'reason', ht.bucket,
        'count', ht.cnt,
        'pct', CASE WHEN (SELECT n FROM hi_seg_total) = 0 THEN 0
          ELSE ROUND(100.0 * ht.cnt / (SELECT n FROM hi_seg_total), 1) END
      ) ORDER BY ht.cnt DESC
    ), '[]'::jsonb) AS arr
    FROM hi_top ht
  )
  SELECT jsonb_build_object(
    'sampleCalls', sample_calls,
    'region', dom_region,
    'highIntentNonApply', jsonb_build_object(
      'segment', (SELECT n FROM hi_seg_total),
      'top', (SELECT arr FROM hi_top_json)
    ),
    'phaseShare', COALESCE((SELECT arr FROM phase_share), '[]'::jsonb)
  ) INTO result;

  RETURN result;
END;
$function$;

NOTIFY pgrst, 'reload schema';