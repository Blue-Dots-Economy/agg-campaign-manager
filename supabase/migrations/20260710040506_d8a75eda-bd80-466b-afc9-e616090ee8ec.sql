
CREATE OR REPLACE FUNCTION public.get_funnel_call_ids(
  _program text, _state text DEFAULT 'all', _date_from date DEFAULT NULL,
  _date_to date DEFAULT NULL, _campaign_type text DEFAULT 'all',
  _campaign text DEFAULT NULL, _stage text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $fn$
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
$fn$;
GRANT EXECUTE ON FUNCTION public.get_funnel_call_ids(text,text,date,date,text,text,text) TO anon, authenticated, service_role;
NOTIFY pgrst, 'reload schema';
