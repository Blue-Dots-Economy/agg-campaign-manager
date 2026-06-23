CREATE OR REPLACE FUNCTION public.get_program_metrics_raw(_program text)
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
          phone,
          call_answered,
          call_engaged,
          call_duration_seconds,
          intent_score,
          applied_to_job,
          tried_to_apply,
          applications_count,
          (
            (data->>'jobs_shown') IS NOT NULL
            AND lower(data->>'jobs_shown') IN ('true','yes','y','1')
          ) AS jobs_shown_flag,
          (
            COALESCE(applied_to_job,false)
            OR (jsonb_typeof(data->'jobs_applied') = 'array' AND jsonb_array_length(data->'jobs_applied') > 0)
          ) AS submitted_flag,
          (
            jsonb_typeof(data->'jobs_failed_to_apply') = 'array'
            AND jsonb_array_length(data->'jobs_failed_to_apply') > 0
          ) AS blocked_flag
        FROM public.call_rows
        WHERE program = 'kkb'
      ),
      cum AS (
        SELECT
          *,
          call_answered AS s_picked,
          (call_answered AND call_engaged) AS s_engaged,
          (call_answered AND call_engaged AND jobs_shown_flag) AS s_jobs,
          (call_answered AND call_engaged AND jobs_shown_flag AND COALESCE(intent_score,0) >= 5) AS s_intent,
          (call_answered AND call_engaged AND jobs_shown_flag AND COALESCE(intent_score,0) >= 5
            AND (submitted_flag OR blocked_flag)) AS s_apps
        FROM base
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
        'program','kkb',
        'totalCalls', total_calls,
        'answeredCalls', answered_calls,
        'unansweredCalls', GREATEST(total_calls - answered_calls, 0),
        'productiveCalls', productive_calls,
        'avgDuration', ROUND(avg_dur::numeric, 1),
        'engagedCalls', engaged_calls,
        'jobsShownCalls', jobs_shown_calls,
        'highIntentCalls', high_intent_calls,
        'applicationsSubmitted', apps_submitted,
        'applicationsBlocked', apps_blocked,
        'applicationsTotal', apps_total,
        'hasInterviewData', false,
        'interviewCount', 0,
        'seekers', seekers,
        'answeredSeekers', answered_seekers,
        'triedSeekers', tried,
        'appliedSeekers', applied_seekers,
        'failedSeekers', failed_seekers,
        'didNotApply', GREATEST(answered_seekers - applied_seekers, 0),
        'totalApplications', ROUND(total_applications)::int
      );
    END;
  ELSE
    DECLARE
      total_openings int; active_openings int; closed_openings int; new_openings int;
      companies_called int; jobs_active int; jobs_closed int; new_jobs_discussed int;
    BEGIN
      WITH base AS (
        SELECT
          phone,
          lower(COALESCE(call_status,'')) AS cs,
          call_duration_seconds AS dur,
          lower(COALESCE(job_status, data->'raw'->>'job_status','')) AS js,
          lower(COALESCE(new_job_posted, data->'raw'->>'new_job_posted','')) AS njp,
          lower(COALESCE(data->'raw'->>'new_job_mentioned','')) AS njm,
          COALESCE(NULLIF(regexp_replace(COALESCE(data->'raw'->>'num_vacancies_input',''), '[^0-9]', '', 'g'),'')::int, 0) AS nvi,
          COALESCE(NULLIF(regexp_replace(COALESCE(data->'raw'->>'new_job_vacancies',''), '[^0-9]', '', 'g'),'')::int, 0) AS njv
        FROM public.call_rows WHERE program = 'dkb'
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
        COUNT(DISTINCT phone) FILTER (WHERE njm = 'yes' AND phone IS NOT NULL AND phone <> '')::int
      INTO total_calls, answered_calls, productive_calls, avg_dur,
           total_openings, active_openings, closed_openings, new_openings,
           companies_called, jobs_active, jobs_closed, new_jobs_discussed
      FROM base;

      result := jsonb_build_object(
        'program','dkb',
        'totalCalls', total_calls,
        'answeredCalls', answered_calls,
        'unansweredCalls', GREATEST(total_calls - answered_calls, 0),
        'productiveCalls', productive_calls,
        'avgDuration', ROUND(avg_dur::numeric, 1),
        'totalOpenings', total_openings,
        'activeOpenings', active_openings,
        'closedOpenings', closed_openings,
        'unresolvedOpenings', GREATEST(total_openings - active_openings - closed_openings, 0),
        'newOpenings', new_openings,
        'companiesCalled', companies_called,
        'jobsActive', jobs_active,
        'jobsClosed', jobs_closed,
        'companiesUnresolved', GREATEST(companies_called - jobs_active - jobs_closed, 0),
        'newJobsDiscussed', new_jobs_discussed
      );
    END;
  END IF;
  RETURN result;
END;
$function$;