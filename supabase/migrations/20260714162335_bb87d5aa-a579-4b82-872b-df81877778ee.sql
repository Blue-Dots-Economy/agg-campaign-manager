DROP FUNCTION IF EXISTS public.get_campaign_drop_causes(_campaign text, _state text, _date_from date, _date_to date);
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
      ('apply',6)
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

DROP FUNCTION IF EXISTS public.get_campaign_list(_program text, _state text, _date_from date, _date_to date);
CREATE OR REPLACE FUNCTION public.get_campaign_list(_program text, _state text DEFAULT 'all'::text, _date_from date DEFAULT NULL::date, _date_to date DEFAULT NULL::date, _channel text DEFAULT 'all'::text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
WITH base AS (
  SELECT
    COALESCE(campaign_type,'') AS campaign_type,
    COALESCE(language,'') AS language,
    phone,
    COALESCE(call_answered, false) AS call_answered,
    COALESCE(call_engaged, false) AS call_engaged,
    COALESCE(intent_score, 0) AS intent_score,
    COALESCE(applied_to_job, false) AS applied_to_job,
    (jsonb_typeof(data->'jobs_applied') = 'array' AND jsonb_array_length(data->'jobs_applied') > 0) AS jobs_applied_flag,
    lower(COALESCE(job_status, data->'raw'->>'job_status','')) AS js,
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
    END AS call_date
  FROM public.call_rows
  WHERE program = _program
      AND (_channel = 'all' OR channel = _channel)
),
filtered AS (
  SELECT * FROM base
  WHERE campaign_type <> ''
    AND (_state = 'all' OR region_code = _state)
    AND (_date_from IS NULL OR (call_date IS NOT NULL AND call_date >= _date_from))
    AND (_date_to   IS NULL OR (call_date IS NOT NULL AND call_date <= _date_to))
),
grouped AS (
  SELECT
    campaign_type,
    call_date AS campaign_date,
    CASE WHEN COUNT(DISTINCT NULLIF(language,'')) = 1 THEN MIN(NULLIF(language,'')) ELSE NULL END AS language,
    CASE WHEN COUNT(DISTINCT region_code) FILTER (WHERE region_code IS NOT NULL) = 1
         THEN MIN(region_code)
         ELSE NULL END AS region,
    COUNT(*)::int AS total_calls,
    COUNT(*) FILTER (WHERE call_answered)::int AS answered,
    COUNT(*) FILTER (WHERE call_answered AND call_engaged)::int AS engaged,
    COUNT(*) FILTER (WHERE call_answered AND intent_score >= 5)::int AS high_intent,
    CASE WHEN _program = 'dkb'
      THEN COUNT(DISTINCT phone) FILTER (WHERE js = 'active' AND phone IS NOT NULL AND phone <> '')::int
      ELSE COUNT(*) FILTER (WHERE applied_to_job OR jobs_applied_flag)::int
    END AS converted
  FROM filtered
  GROUP BY campaign_type, call_date
)
SELECT COALESCE(jsonb_agg(
  jsonb_build_object(
    'campaignType', campaign_type,
    'campaignDate', CASE WHEN campaign_date IS NULL THEN NULL ELSE to_char(campaign_date,'YYYY-MM-DD') END,
    'language', language,
    'region', region,
    'totalCalls', total_calls,
    'answered', answered,
    'engaged', engaged,
    'highIntent', high_intent,
    'converted', converted
  ) ORDER BY campaign_date DESC NULLS LAST, campaign_type
), '[]'::jsonb)
FROM grouped;
$function$;

DROP FUNCTION IF EXISTS public.get_dkb_campaign_causes(_campaign text, _state text, _date_from date, _date_to date);
CREATE OR REPLACE FUNCTION public.get_dkb_campaign_causes(_campaign text, _state text DEFAULT 'all'::text, _date_from date DEFAULT NULL::date, _date_to date DEFAULT NULL::date, _channel text DEFAULT 'all'::text)
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
      CASE
        WHEN mentioned THEN 'new_job'
        WHEN updated   THEN 'update'
        WHEN has_status THEN 'refresh'
        ELSE 'intro'
      END AS phase
    FROM date_filtered
    WHERE answered = true AND converted = false
  ),
  phase_labels AS (
    SELECT * FROM (VALUES
      ('intro','Introduction',1),
      ('refresh','Refresh',2),
      ('update','Update',3),
      ('new_job','New Job Posted',4)
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
  )
  SELECT jsonb_build_object(
    'sampleCalls', sample_calls,
    'region', dom_region,
    'phaseShare', COALESCE((SELECT arr FROM phase_share), '[]'::jsonb)
  ) INTO result;

  RETURN result;
END;
$function$;

DROP FUNCTION IF EXISTS public.get_dkb_drop_analysis(_state text, _date_from date, _date_to date, _campaign_type text, _campaign text);
CREATE OR REPLACE FUNCTION public.get_dkb_drop_analysis(_state text DEFAULT 'all'::text, _date_from date DEFAULT NULL::date, _date_to date DEFAULT NULL::date, _campaign_type text DEFAULT 'all'::text, _campaign text DEFAULT NULL::text, _channel text DEFAULT 'all'::text)
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
      AND (_channel = 'all' OR channel = _channel)
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

DROP FUNCTION IF EXISTS public.get_funnel_call_ids(_program text, _state text, _date_from date, _date_to date, _campaign_type text, _campaign text, _stage text);
CREATE OR REPLACE FUNCTION public.get_funnel_call_ids(_program text, _state text DEFAULT 'all'::text, _date_from date DEFAULT NULL::date, _date_to date DEFAULT NULL::date, _campaign_type text DEFAULT 'all'::text, _campaign text DEFAULT NULL::text, _stage text DEFAULT NULL::text, _channel text DEFAULT 'all'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE ids jsonb;
BEGIN
  IF _program = 'kkb' THEN
    WITH base AS (
      SELECT COALESCE(call_id,'') AS call_id,
        COALESCE(call_answered,false) AS answered,
        COALESCE(call_engaged,false) AS engaged,
        COALESCE(intent_score,0) AS intent,
        ((data->>'jobs_shown') IS NOT NULL AND lower(data->>'jobs_shown') IN ('true','yes','y','1')) AS jobs_shown_flag,
        (COALESCE(applied_to_job,false) OR (jsonb_typeof(data->'jobs_applied')='array' AND jsonb_array_length(data->'jobs_applied')>0)) AS submitted_flag,
        (jsonb_typeof(data->'jobs_failed_to_apply')='array' AND jsonb_array_length(data->'jobs_failed_to_apply')>0) AS blocked_flag,
        COALESCE(campaign_type,'') AS campaign_type,
        CASE WHEN city_campaign='Ghaziabad' OR lower(COALESCE(language,''))='hindi' THEN 'GZB'
             WHEN city_campaign='Hubli-Dharwad' OR lower(COALESCE(language,''))='kannada' THEN 'KA' ELSE NULL END AS region_code,
        CASE WHEN COALESCE(campaign_date,'') ~ '^[0-9]{4,6}$' THEN (DATE '1899-12-30' + (campaign_date)::int)::date
             WHEN COALESCE(campaign_date,'') ~ '^\d{4}-\d{2}-\d{2}' THEN substring(campaign_date,1,10)::date
             WHEN COALESCE(data->>'call_datetime_ist','') ~ '^\d{4}-\d{2}-\d{2}' THEN substring(data->>'call_datetime_ist',1,10)::date
             ELSE NULL END AS call_date
      FROM public.call_rows WHERE program='kkb'
      AND (_channel = 'all' OR channel = _channel)
    ),
    f AS (
      SELECT * FROM base
      WHERE (_state='all' OR region_code=_state)
        AND (_date_from IS NULL OR (call_date IS NOT NULL AND call_date >= _date_from))
        AND (_date_to   IS NULL OR (call_date IS NOT NULL AND call_date <= _date_to))
        AND (_campaign IS NULL OR campaign_type=_campaign)
        AND (_campaign_type='all'
          OR (_campaign_type='higher_education' AND (LOWER(campaign_type) LIKE '%higher%education%' OR LOWER(campaign_type) LIKE '%higher_education%'))
          OR (_campaign_type='normal' AND LOWER(campaign_type) NOT LIKE '%higher%education%' AND LOWER(campaign_type) NOT LIKE '%higher_education%'))
    ),
    sel AS (
      SELECT call_id FROM f WHERE call_id <> '' AND (
        CASE _stage
          WHEN 'calls' THEN true
          WHEN 'picked' THEN answered
          WHEN 'engaged' THEN answered AND engaged
          WHEN 'jobs' THEN answered AND engaged AND jobs_shown_flag
          WHEN 'intent' THEN answered AND intent >= 5
          WHEN 'apps' THEN answered AND (submitted_flag OR blocked_flag)
          ELSE false END)
    )
    SELECT jsonb_agg(call_id) INTO ids FROM sel;
  ELSIF _program='dkb' THEN
    WITH base AS (
      SELECT COALESCE(call_id,'') AS call_id,
        lower(COALESCE(call_status,'')) AS cs, call_duration_seconds AS dur,
        lower(COALESCE(job_status, data->'raw'->>'job_status','')) AS js,
        lower(COALESCE(new_job_posted, data->'raw'->>'new_job_posted','')) AS njp,
        phone, COALESCE(campaign_type,'') AS campaign_type,
        CASE WHEN city_campaign='Ghaziabad' OR lower(COALESCE(language,''))='hindi' THEN 'GZB'
             WHEN city_campaign='Hubli-Dharwad' OR lower(COALESCE(language,''))='kannada' THEN 'KA' ELSE NULL END AS region_code,
        CASE WHEN COALESCE(campaign_date,'') ~ '^[0-9]{4,6}$' THEN (DATE '1899-12-30' + (campaign_date)::int)::date
             WHEN COALESCE(campaign_date,'') ~ '^\d{4}-\d{2}-\d{2}' THEN substring(campaign_date,1,10)::date
             WHEN COALESCE(data->>'call_datetime_ist','') ~ '^\d{4}-\d{2}-\d{2}' THEN substring(data->>'call_datetime_ist',1,10)::date
             ELSE NULL END AS call_date
      FROM public.call_rows WHERE program='dkb'
      AND (_channel = 'all' OR channel = _channel)
    ),
    f AS (
      SELECT * FROM base
      WHERE (_state='all' OR region_code=_state)
        AND (_date_from IS NULL OR (call_date IS NOT NULL AND call_date >= _date_from))
        AND (_date_to   IS NULL OR (call_date IS NOT NULL AND call_date <= _date_to))
        AND (_campaign IS NULL OR campaign_type=_campaign)
    ),
    sel AS (
      SELECT call_id FROM f WHERE call_id <> '' AND phone IS NOT NULL AND phone <> '' AND (
        CASE _stage
          WHEN 'called' THEN true
          WHEN 'picked' THEN (cs LIKE 'answered%' OR cs='completed')
          WHEN 'engaged' THEN (cs LIKE 'answered%' OR cs='completed') AND COALESCE(dur,0) > 30
          WHEN 'active' THEN js='active'
          WHEN 'new_jobs' THEN njp='yes'
          ELSE false END)
    )
    SELECT jsonb_agg(call_id) INTO ids FROM sel;
  END IF;
  RETURN jsonb_build_object('stage', _stage, 'count', COALESCE(jsonb_array_length(ids),0), 'ids', COALESCE(ids,'[]'::jsonb));
END;
$function$;

DROP FUNCTION IF EXISTS public.get_funnel_durations(_program text, _state text, _date_from date, _date_to date, _campaign_type text, _campaign text);
CREATE OR REPLACE FUNCTION public.get_funnel_durations(_program text, _state text DEFAULT 'all'::text, _date_from date DEFAULT NULL::date, _date_to date DEFAULT NULL::date, _campaign_type text DEFAULT 'all'::text, _campaign text DEFAULT NULL::text, _channel text DEFAULT 'all'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE res jsonb;
BEGIN
  IF _program = 'kkb' THEN
    WITH base AS (
      SELECT
        COALESCE(call_answered,false) AS answered,
        COALESCE(call_engaged,false) AS engaged,
        COALESCE(intent_score,0) AS intent,
        call_duration_seconds AS dur,
        ((data->>'jobs_shown') IS NOT NULL AND lower(data->>'jobs_shown') IN ('true','yes','y','1')) AS jobs_shown_flag,
        (COALESCE(applied_to_job,false) OR (jsonb_typeof(data->'jobs_applied')='array' AND jsonb_array_length(data->'jobs_applied')>0)) AS submitted_flag,
        (jsonb_typeof(data->'jobs_failed_to_apply')='array' AND jsonb_array_length(data->'jobs_failed_to_apply')>0) AS blocked_flag,
        COALESCE(campaign_type,'') AS campaign_type,
        CASE WHEN city_campaign='Ghaziabad' OR lower(COALESCE(language,''))='hindi' THEN 'GZB'
             WHEN city_campaign='Hubli-Dharwad' OR lower(COALESCE(language,''))='kannada' THEN 'KA' ELSE NULL END AS region_code,
        CASE WHEN COALESCE(campaign_date,'') ~ '^[0-9]{4,6}$' THEN (DATE '1899-12-30' + (campaign_date)::int)::date
             WHEN COALESCE(campaign_date,'') ~ '^\d{4}-\d{2}-\d{2}' THEN substring(campaign_date,1,10)::date
             WHEN COALESCE(data->>'call_datetime_ist','') ~ '^\d{4}-\d{2}-\d{2}' THEN substring(data->>'call_datetime_ist',1,10)::date
             ELSE NULL END AS call_date
      FROM public.call_rows WHERE program='kkb'
      AND (_channel = 'all' OR channel = _channel)
    ),
    f AS (
      SELECT * FROM base
      WHERE (_state='all' OR region_code=_state)
        AND (_date_from IS NULL OR (call_date IS NOT NULL AND call_date >= _date_from))
        AND (_date_to   IS NULL OR (call_date IS NOT NULL AND call_date <= _date_to))
        AND (_campaign IS NULL OR campaign_type=_campaign)
        AND (_campaign_type='all'
          OR (_campaign_type='higher_education' AND (LOWER(campaign_type) LIKE '%higher%education%' OR LOWER(campaign_type) LIKE '%higher_education%'))
          OR (_campaign_type='normal' AND LOWER(campaign_type) NOT LIKE '%higher%education%' AND LOWER(campaign_type) NOT LIKE '%higher_education%'))
    )
    SELECT jsonb_build_object(
      'calls',   COALESCE(ROUND(AVG(dur) FILTER (WHERE answered)),0)::int,
      'picked',  COALESCE(ROUND(AVG(dur) FILTER (WHERE answered)),0)::int,
      'engaged', COALESCE(ROUND(AVG(dur) FILTER (WHERE answered AND engaged)),0)::int,
      'jobs',    COALESCE(ROUND(AVG(dur) FILTER (WHERE answered AND engaged AND jobs_shown_flag)),0)::int,
      'intent',  COALESCE(ROUND(AVG(dur) FILTER (WHERE answered AND intent>=5)),0)::int,
      'apps',    COALESCE(ROUND(AVG(dur) FILTER (WHERE answered AND (submitted_flag OR blocked_flag))),0)::int
    ) INTO res FROM f;
  ELSIF _program='dkb' THEN
    WITH base AS (
      SELECT
        lower(COALESCE(call_status,'')) AS cs,
        call_duration_seconds AS dur,
        lower(COALESCE(job_status, data->'raw'->>'job_status','')) AS js,
        lower(COALESCE(new_job_posted, data->'raw'->>'new_job_posted','')) AS njp,
        COALESCE(campaign_type,'') AS campaign_type,
        CASE WHEN city_campaign='Ghaziabad' OR lower(COALESCE(language,''))='hindi' THEN 'GZB'
             WHEN city_campaign='Hubli-Dharwad' OR lower(COALESCE(language,''))='kannada' THEN 'KA' ELSE NULL END AS region_code,
        CASE WHEN COALESCE(campaign_date,'') ~ '^[0-9]{4,6}$' THEN (DATE '1899-12-30' + (campaign_date)::int)::date
             WHEN COALESCE(campaign_date,'') ~ '^\d{4}-\d{2}-\d{2}' THEN substring(campaign_date,1,10)::date
             WHEN COALESCE(data->>'call_datetime_ist','') ~ '^\d{4}-\d{2}-\d{2}' THEN substring(data->>'call_datetime_ist',1,10)::date
             ELSE NULL END AS call_date
      FROM public.call_rows WHERE program='dkb'
      AND (_channel = 'all' OR channel = _channel)
    ),
    f AS (
      SELECT *, (cs LIKE 'answered%' OR cs='completed') AS ans FROM base
      WHERE (_state='all' OR region_code=_state)
        AND (_date_from IS NULL OR (call_date IS NOT NULL AND call_date >= _date_from))
        AND (_date_to   IS NULL OR (call_date IS NOT NULL AND call_date <= _date_to))
        AND (_campaign IS NULL OR campaign_type=_campaign)
    )
    SELECT jsonb_build_object(
      'called',   COALESCE(ROUND(AVG(dur) FILTER (WHERE ans)),0)::int,
      'picked',   COALESCE(ROUND(AVG(dur) FILTER (WHERE ans)),0)::int,
      'engaged',  COALESCE(ROUND(AVG(dur) FILTER (WHERE ans AND COALESCE(dur,0)>30)),0)::int,
      'active',   COALESCE(ROUND(AVG(dur) FILTER (WHERE ans AND js='active')),0)::int,
      'new_jobs', COALESCE(ROUND(AVG(dur) FILTER (WHERE ans AND njp='yes')),0)::int
    ) INTO res FROM f;
  END IF;
  RETURN COALESCE(res, '{}'::jsonb);
END;
$function$;

DROP FUNCTION IF EXISTS public.get_kkb_drop_analysis(_state text, _date_from date, _date_to date, _campaign_type text, _campaign text);
CREATE OR REPLACE FUNCTION public.get_kkb_drop_analysis(_state text DEFAULT 'all'::text, _date_from date DEFAULT NULL::date, _date_to date DEFAULT NULL::date, _campaign_type text DEFAULT 'all'::text, _campaign text DEFAULT NULL::text, _channel text DEFAULT 'all'::text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
filtered AS (
  SELECT * FROM base
  WHERE answered = true
    AND NOT (applied_to_job OR jobs_applied_nonempty)
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
    END AS stage
  FROM filtered
),
bucketed AS (
  SELECT
    stage,
    drop_reason,
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
        'intro',        COALESCE((sm.by_stage_obj->>'intro')::int, 0),
        'profile',      COALESCE((sm.by_stage_obj->>'profile')::int, 0),
        'jobs',         COALESCE((sm.by_stage_obj->>'jobs')::int, 0),
        'extra',        COALESCE((sm.by_stage_obj->>'extra')::int, 0),
        'deliberation', COALESCE((sm.by_stage_obj->>'deliberation')::int, 0),
        'apply',        COALESCE((sm.by_stage_obj->>'apply')::int, 0)
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
grand AS ( SELECT COALESCE(SUM(total),0)::int AS g FROM bucket_totals )
SELECT jsonb_build_object(
  'stages', jsonb_build_array(
    jsonb_build_object('key','intro',        'label','Introduction'),
    jsonb_build_object('key','profile',      'label','Profile Fetch'),
    jsonb_build_object('key','jobs',         'label','Jobs Shown'),
    jsonb_build_object('key','extra',        'label','Extra Job Shown'),
    jsonb_build_object('key','deliberation', 'label','Job Deliberation'),
    jsonb_build_object('key','apply',        'label','Apply')
  ),
  'buckets',    (SELECT arr FROM buckets_json),
  'maxCell',    (SELECT m FROM max_cell),
  'grandTotal', (SELECT g FROM grand)
);
$function$;

DROP FUNCTION IF EXISTS public.get_program_aggregate_payload(_program text, _state text, _date_from date, _date_to date, _campaign_type text, _campaign text);
CREATE OR REPLACE FUNCTION public.get_program_aggregate_payload(_program text, _state text DEFAULT 'all'::text, _date_from date DEFAULT NULL::date, _date_to date DEFAULT NULL::date, _campaign_type text DEFAULT 'all'::text, _campaign text DEFAULT NULL::text, _channel text DEFAULT 'all'::text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
WITH aggregate_result AS (
  SELECT public.get_program_aggregates(_program, _state, _date_from, _date_to, _campaign_type, _campaign) AS aggregates
),
groups AS (
  SELECT public.get_program_metric_groups(_program, _state, _date_from, _date_to, _campaign_type, _campaign) AS metric_groups
),
metrics AS (
  SELECT public.get_program_metrics_raw(_program, _state, _date_from, _date_to, _campaign_type, _campaign) AS metrics_raw
),
state_row AS (
  SELECT last_synced_at, row_count, status FROM public.program_sync_state WHERE program = _program
),
connection_count AS (
  SELECT COUNT(*)::int AS count FROM public.sheet_connections WHERE program = _program AND enabled = true
)
SELECT jsonb_build_object(
  'connectionCount', COALESCE((SELECT count FROM connection_count), 0),
  'lastSyncedAt', (SELECT last_synced_at FROM state_row),
  'syncStatus', COALESCE((SELECT status FROM state_row), 'idle'),
  'stateRowCount', COALESCE((SELECT row_count FROM state_row), 0),
  'aggregates', (SELECT aggregates FROM aggregate_result),
  'metricGroups', (SELECT metric_groups FROM groups),
  'metrics', (SELECT metrics_raw FROM metrics)
);
$function$;

NOTIFY pgrst, 'reload schema';