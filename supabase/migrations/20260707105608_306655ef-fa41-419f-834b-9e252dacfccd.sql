CREATE OR REPLACE FUNCTION public.get_campaign_list(
  _program text,
  _state text DEFAULT 'all'::text,
  _date_from date DEFAULT NULL::date,
  _date_to date DEFAULT NULL::date
)
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

GRANT EXECUTE ON FUNCTION public.get_campaign_list(text,text,date,date) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';