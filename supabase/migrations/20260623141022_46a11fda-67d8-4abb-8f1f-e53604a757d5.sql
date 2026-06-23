
CREATE OR REPLACE FUNCTION public.get_program_metrics_raw(
  _program text,
  _state text DEFAULT 'all',
  _date_from date DEFAULT NULL,
  _date_to date DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  total_calls int := 0;
  answered_calls int := 0;
  productive_calls int := 0;
  avg_dur numeric := 0;
  result jsonb;
BEGIN
  IF _program = 'kkb' THEN
    DECLARE
      seekers int; answered_seekers int; applied_seekers int; failed_seekers int;
      total_applications numeric; tried int;
      engaged_calls int; jobs_shown_calls int; high_intent_calls int;
      apps_submitted int; apps_blocked int; apps_total int;
    BEGIN
      WITH base AS (
        SELECT
          phone, call_answered, call_engaged, call_duration_seconds, intent_score,
          applied_to_job, tried_to_apply, applications_count,
          ((data->>'jobs_shown') IS NOT NULL AND lower(data->>'jobs_shown') IN ('true','yes','y','1')) AS jobs_shown_flag,
          (COALESCE(applied_to_job,false)
            OR (jsonb_typeof(data->'jobs_applied') = 'array' AND jsonb_array_length(data->'jobs_applied') > 0)) AS submitted_flag,
          (jsonb_typeof(data->'jobs_failed_to_apply') = 'array' AND jsonb_array_length(data->'jobs_failed_to_apply') > 0) AS blocked_flag,
          CASE
            WHEN city_campaign = 'Ghaziabad' OR lower(COALESCE(language,'')) = 'hindi' THEN 'GZB'
            WHEN city_campaign = 'Hubli-Dharwad' OR lower(COALESCE(language,'')) = 'kannada' THEN 'KA'
            ELSE NULL END AS region_code,
          CASE
            WHEN COALESCE(campaign_date,'') ~ '^\d{4}-\d{2}-\d{2}'
              THEN substring(campaign_date, 1, 10)::date
            WHEN COALESCE(data->>'call_datetime_ist','') ~ '^\d{4}-\d{2}-\d{2}'
              THEN substring(data->>'call_datetime_ist', 1, 10)::date
            ELSE NULL END AS call_date
        FROM public.call_rows WHERE program = 'kkb'
      ),
      f AS (
        SELECT * FROM base
        WHERE (_state = 'all' OR region_code = _state)
          AND (_date_from IS NULL OR (call_date IS NOT NULL AND call_date >= _date_from))
          AND (_date_to   IS NULL OR (call_date IS NOT NULL AND call_date <= _date_to))
      ),
      cum AS (
        SELECT *,
          call_answered AS s_picked,
          (call_answered AND call_engaged) AS s_engaged,
          (call_answered AND call_engaged AND jobs_shown_flag) AS s_jobs,
          (call_answered AND call_engaged AND jobs_shown_flag AND COALESCE(intent_score,0) >= 5) AS s_intent,
          (call_answered AND call_engaged AND jobs_shown_flag AND COALESCE(intent_score,0) >= 5
            AND (submitted_flag OR blocked_flag)) AS s_apps
        FROM f
      )
      SELECT
        COUNT(*)::int,
        COUNT(*) FILTER (WHERE call_answered)::int,
        COUNT(*) FILTER (WHERE call_answered AND COALESCE(call_duration_seconds,0) > 30)::int,
        COALESCE(AVG(call_duration_seconds) FILTER (WHERE call_answered), 0),
        COUNT(*) FILTER (WHERE s_engaged)::int,
        COUNT(*) FILTER (WHERE s_jobs)::int,
        COUNT(*) FILTER (WHERE s_intent)::int,
        COUNT(*) FILTER (WHERE s_apps AND submitted_flag)::int,
        COUNT(*) FILTER (WHERE s_apps AND blocked_flag AND NOT submitted_flag)::int,
        COUNT(*) FILTER (WHERE s_apps)::int,
        COUNT(DISTINCT phone) FILTER (WHERE phone IS NOT NULL AND phone <> '')::int,
        COUNT(DISTINCT phone) FILTER (WHERE call_answered AND phone IS NOT NULL AND phone <> '')::int,
        COUNT(DISTINCT phone) FILTER (WHERE applied_to_job AND phone IS NOT NULL AND phone <> '')::int,
        COUNT(DISTINCT phone) FILTER (WHERE COALESCE(tried_to_apply,false) AND NOT COALESCE(applied_to_job,false) AND phone IS NOT NULL AND phone <> '')::int,
        COALESCE(SUM(applications_count), 0)
      INTO total_calls, answered_calls, productive_calls, avg_dur,
           engaged_calls, jobs_shown_calls, high_intent_calls,
           apps_submitted, apps_blocked, apps_total,
           seekers, answered_seekers, applied_seekers, failed_seekers, total_applications
      FROM cum;

      tried := applied_seekers + failed_seekers;
      result := jsonb_build_object(
        'program','kkb','totalCalls', total_calls,'answeredCalls', answered_calls,
        'unansweredCalls', GREATEST(total_calls - answered_calls, 0),
        'productiveCalls', productive_calls,'avgDuration', ROUND(avg_dur::numeric, 1),
        'engagedCalls', engaged_calls,'jobsShownCalls', jobs_shown_calls,
        'highIntentCalls', high_intent_calls,
        'applicationsSubmitted', apps_submitted,'applicationsBlocked', apps_blocked,
        'applicationsTotal', apps_total,'hasInterviewData', false,'interviewCount', 0,
        'seekers', seekers,'answeredSeekers', answered_seekers,'triedSeekers', tried,
        'appliedSeekers', applied_seekers,'failedSeekers', failed_seekers,
        'didNotApply', GREATEST(answered_seekers - applied_seekers, 0),
        'totalApplications', ROUND(total_applications)::int
      );
    END;
  ELSE
    DECLARE
      total_openings int; active_openings int; closed_openings int; new_openings int;
      companies_called int; jobs_active int; jobs_closed int; new_jobs_discussed int;
      funnel jsonb;
      p_called int; p_picked int; p_engaged int; p_active int;
      o_called int; o_picked int; o_engaged int; o_active int;
    BEGIN
      WITH base AS (
        SELECT
          phone,
          lower(COALESCE(call_status,'')) AS cs,
          COALESCE(call_status,'') AS cs_raw,
          call_duration_seconds AS dur,
          lower(COALESCE(job_status, data->'raw'->>'job_status','')) AS js,
          lower(COALESCE(new_job_posted, data->'raw'->>'new_job_posted','')) AS njp,
          lower(COALESCE(data->'raw'->>'new_job_mentioned','')) AS njm,
          COALESCE((regexp_match(COALESCE(data->'raw'->>'num_vacancies_input',''), '\d+'))[1]::int, 0) AS nvi,
          -- Sum every integer in the new_job_vacancies field (so "50 (Welder),
          -- 20 (Grinder)" counts as 70, not 50). Ignore any single value > 500
          -- as a clear data-entry error (e.g. typos like "46117").
          COALESCE((
            SELECT SUM((m[1])::int)
            FROM regexp_matches(COALESCE(data->'raw'->>'new_job_vacancies',''), '\d+', 'g') AS m
            WHERE (m[1])::int <= 500
          ), 0)::int AS njv,
          CASE
            WHEN city_campaign = 'Ghaziabad' OR lower(COALESCE(language,'')) = 'hindi' THEN 'GZB'
            WHEN city_campaign = 'Hubli-Dharwad' OR lower(COALESCE(language,'')) = 'kannada' THEN 'KA'
            ELSE NULL END AS region_code,
          CASE
            WHEN COALESCE(campaign_date,'') ~ '^\d{4}-\d{2}-\d{2}'
              THEN substring(campaign_date, 1, 10)::date
            WHEN COALESCE(data->>'call_datetime_ist','') ~ '^\d{4}-\d{2}-\d{2}'
              THEN substring(data->>'call_datetime_ist', 1, 10)::date
            ELSE NULL END AS call_date
        FROM public.call_rows WHERE program = 'dkb'
      ),
      f AS (
        SELECT * FROM base
        WHERE (_state = 'all' OR region_code = _state)
          AND (_date_from IS NULL OR (call_date IS NOT NULL AND call_date >= _date_from))
          AND (_date_to   IS NULL OR (call_date IS NOT NULL AND call_date <= _date_to))
      ),
      provider AS (
        SELECT
          phone,
          bool_or(cs LIKE 'answered%' OR cs = 'completed') AS picked,
          bool_or((cs LIKE 'answered%' OR cs = 'completed') AND COALESCE(dur,0) > 30) AS engaged,
          bool_or(js = 'active') AS active,
          SUM(nvi)::int AS openings
        FROM f
        WHERE phone IS NOT NULL AND phone <> ''
        GROUP BY phone
      )
      SELECT
        COUNT(*)::int,
        COUNT(*) FILTER (WHERE cs LIKE 'answered%' OR cs = 'completed')::int,
        COUNT(*) FILTER (WHERE (cs LIKE 'answered%' OR cs = 'completed') AND COALESCE(dur,0) > 30)::int,
        COALESCE(AVG(dur) FILTER (WHERE cs LIKE 'answered%' OR cs = 'completed'), 0),
        COALESCE(SUM(nvi), 0)::int,
        COALESCE(SUM(nvi) FILTER (WHERE js = 'active'), 0)::int,
        COALESCE(SUM(nvi) FILTER (WHERE js = 'closed'), 0)::int,
        COALESCE(SUM(njv) FILTER (WHERE njp = 'yes'), 0)::int,
        COUNT(DISTINCT phone) FILTER (WHERE phone IS NOT NULL AND phone <> '')::int,
        COUNT(*) FILTER (WHERE js = 'active')::int,
        COUNT(*) FILTER (WHERE js = 'closed')::int,
        COUNT(DISTINCT phone) FILTER (WHERE njm = 'yes' AND phone IS NOT NULL AND phone <> '')::int,
        (SELECT COUNT(*)::int FROM provider),
        (SELECT COUNT(*)::int FROM provider WHERE picked),
        (SELECT COUNT(*)::int FROM provider WHERE engaged),
        (SELECT COUNT(*)::int FROM provider WHERE active AND engaged),
        (SELECT COALESCE(SUM(openings),0)::int FROM provider),
        (SELECT COALESCE(SUM(openings),0)::int FROM provider WHERE picked),
        (SELECT COALESCE(SUM(openings),0)::int FROM provider WHERE engaged),
        (SELECT COALESCE(SUM(openings),0)::int FROM provider WHERE active AND engaged)
      INTO total_calls, answered_calls, productive_calls, avg_dur,
           total_openings, active_openings, closed_openings, new_openings,
           companies_called, jobs_active, jobs_closed, new_jobs_discussed,
           p_called, p_picked, p_engaged, p_active,
           o_called, o_picked, o_engaged, o_active
      FROM f;

      funnel := jsonb_build_array(
        jsonb_build_object('key','called','label','Called','providers', p_called, 'openings', o_called),
        jsonb_build_object('key','picked','label','Picked up','providers', p_picked, 'openings', o_picked),
        jsonb_build_object('key','engaged','label','Engaged (30s+)','providers', p_engaged, 'openings', o_engaged),
        jsonb_build_object('key','active','label','Actively hiring','providers', p_active, 'openings', o_active)
      );

      result := jsonb_build_object(
        'program','dkb','totalCalls', total_calls,'answeredCalls', answered_calls,
        'unansweredCalls', GREATEST(total_calls - answered_calls, 0),
        'productiveCalls', productive_calls,'avgDuration', ROUND(avg_dur::numeric, 1),
        'totalOpenings', total_openings,'activeOpenings', active_openings,
        'closedOpenings', closed_openings,
        'unresolvedOpenings', GREATEST(total_openings - active_openings - closed_openings, 0),
        'newOpenings', new_openings,'companiesCalled', companies_called,
        'jobsActive', jobs_active,'jobsClosed', jobs_closed,
        'companiesUnresolved', GREATEST(companies_called - jobs_active - jobs_closed, 0),
        'newJobsDiscussed', new_jobs_discussed,
        'providerFunnel', funnel
      );
    END;
  END IF;
  RETURN result;
END;
$function$;
