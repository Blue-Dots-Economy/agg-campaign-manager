
CREATE OR REPLACE FUNCTION public.get_dkb_campaign_causes(
  _campaign text,
  _state text DEFAULT 'all',
  _date_from date DEFAULT NULL,
  _date_to date DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
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
  ),
  date_filtered AS (
    SELECT * FROM base
    WHERE (_date_from IS NULL OR (call_date IS NOT NULL AND call_date >= _date_from))
      AND (_date_to   IS NULL OR (call_date IS NOT NULL AND call_date <= _date_to))
  ),
  non_conv AS (
    SELECT
      (ctype = _campaign AND (_state = 'all' OR region_code = _state)) AS in_campaign,
      (dom_region IS NOT NULL AND region_code = dom_region) AS in_region,
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
$fn$;

GRANT EXECUTE ON FUNCTION public.get_dkb_campaign_causes(text, text, date, date) TO anon, authenticated, service_role;
NOTIFY pgrst, 'reload schema';
