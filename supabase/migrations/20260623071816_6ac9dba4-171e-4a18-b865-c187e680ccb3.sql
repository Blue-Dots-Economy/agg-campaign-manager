
CREATE OR REPLACE FUNCTION public.get_program_metric_groups(_program text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  total_calls int := 0;
  answered_calls int := 0;
  unanswered_calls int := 0;
  productive_calls int := 0;
  avg_dur numeric := 0;
  seekers int := 0;
  answered_seekers int := 0;
  applied_seekers int := 0;
  failed_seekers int := 0;
  did_not_apply int := 0;
  total_applications numeric := 0;
  tried int := 0;
  application_rate numeric := 0;
  applied_pct numeric := 0;
  failed_pct numeric := 0;
  pickup numeric := 0;
  productive_pct numeric := 0;
  -- DKB openings
  total_openings int := 0;
  active_openings int := 0;
  closed_openings int := 0;
  unresolved_openings int := 0;
  new_openings int := 0;
  active_open_pct numeric := 0;
  closed_open_pct numeric := 0;
  unresolved_open_pct numeric := 0;
  -- DKB companies
  companies_called int := 0;
  jobs_active int := 0;
  jobs_closed int := 0;
  companies_unresolved int := 0;
  new_jobs_discussed int := 0;
  jobs_active_pct numeric := 0;
  jobs_closed_pct numeric := 0;
  companies_unresolved_pct numeric := 0;
  result jsonb;
BEGIN
  IF _program = 'kkb' THEN
    SELECT
      COUNT(*)::int,
      COUNT(*) FILTER (WHERE call_answered)::int,
      COUNT(*) FILTER (WHERE call_answered AND COALESCE(call_duration_seconds,0) > 30)::int,
      COALESCE(AVG(call_duration_seconds) FILTER (WHERE call_answered), 0)
    INTO total_calls, answered_calls, productive_calls, avg_dur
    FROM public.call_rows WHERE program = 'kkb';

    unanswered_calls := total_calls - answered_calls;
    pickup := CASE WHEN total_calls = 0 THEN 0 ELSE 100.0 * answered_calls / total_calls END;
    productive_pct := CASE WHEN total_calls = 0 THEN 0 ELSE 100.0 * productive_calls / total_calls END;

    SELECT
      COUNT(DISTINCT phone) FILTER (WHERE phone IS NOT NULL AND phone <> '')::int,
      COUNT(DISTINCT phone) FILTER (WHERE call_answered AND phone IS NOT NULL AND phone <> '')::int,
      COUNT(DISTINCT phone) FILTER (WHERE applied_to_job AND phone IS NOT NULL AND phone <> '')::int,
      COUNT(DISTINCT phone) FILTER (WHERE COALESCE(tried_to_apply,false) AND NOT COALESCE(applied_to_job,false) AND phone IS NOT NULL AND phone <> '')::int,
      COALESCE(SUM(applications_count), 0)
    INTO seekers, answered_seekers, applied_seekers, failed_seekers, total_applications
    FROM public.call_rows WHERE program = 'kkb';

    did_not_apply := GREATEST(answered_seekers - applied_seekers, 0);
    tried := applied_seekers + failed_seekers;
    applied_pct := CASE WHEN answered_seekers = 0 THEN 0 ELSE 100.0 * applied_seekers / answered_seekers END;
    failed_pct := CASE WHEN tried = 0 THEN 0 ELSE 100.0 * failed_seekers / tried END;
    application_rate := applied_pct;

    result := jsonb_build_array(
      jsonb_build_object(
        'key','outcome',
        'title','Outcome metrics',
        'subtitle','Per unique job seeker (deduped by phone)',
        'cards', jsonb_build_array(
          jsonb_build_object('key','seekers_called','label','Job Seekers Called','value', to_char(seekers,'FM999,999,999'),'sub','Unique phone numbers','accent','blue'),
          jsonb_build_object('key','applied','label','Applied to a Job','value', to_char(applied_seekers,'FM999,999,999'),'sub', to_char(applied_pct,'FM999990.0') || '% of seekers who answered','accent','green'),
          jsonb_build_object('key','failed_apply','label','Failed Apply Attempts','value', to_char(failed_seekers,'FM999,999,999'),'sub', to_char(failed_pct,'FM999990.0') || '% of seekers who tried','accent','amber'),
          jsonb_build_object('key','did_not_apply','label','Did Not Apply','value', to_char(did_not_apply,'FM999,999,999'),'sub','Answered but did not apply','accent','red'),
          jsonb_build_object('key','total_applications','label','Total Applications','value', to_char(ROUND(total_applications),'FM999,999,999'),'sub','Across all calls','accent','blue'),
          jsonb_build_object('key','application_rate','label','Application Rate','value', to_char(application_rate,'FM999990.0') || '%','sub','Seekers applied / seekers who answered','accent','green')
        )
      ),
      jsonb_build_object(
        'key','call',
        'title','Call metrics',
        'subtitle','Per call (raw rows)',
        'cards', jsonb_build_array(
          jsonb_build_object('key','total_calls','label','Total Calls','value', to_char(total_calls,'FM999,999,999'),'sub','All call attempts','accent','blue'),
          jsonb_build_object('key','answered','label','Answered Calls','value', to_char(answered_calls,'FM999,999,999'),'sub', to_char(pickup,'FM999990.0') || '% pickup rate','accent','green'),
          jsonb_build_object('key','unanswered','label','Unanswered Calls','value', to_char(unanswered_calls,'FM999,999,999'),'sub','No pickup','accent','red'),
          jsonb_build_object('key','productive','label','Productive Conversations','value', to_char(productive_pct,'FM999990.0') || '%','sub', to_char(productive_calls,'FM999,999,999') || ' calls — answered + duration > 30s','accent','amber'),
          jsonb_build_object('key','avg_duration','label','Avg Call Duration','value', to_char(ROUND(avg_dur::numeric, 1),'FM999990.0') || ' sec','sub','Answered calls only','accent','blue')
        )
      )
    );
  ELSE
    -- DKB ============================================================
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
      FROM public.call_rows
      WHERE program = 'dkb'
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
    INTO
      total_calls, answered_calls, productive_calls, avg_dur,
      total_openings, active_openings, closed_openings, new_openings,
      companies_called, jobs_active, jobs_closed, new_jobs_discussed
    FROM base;

    unanswered_calls := total_calls - answered_calls;
    pickup := CASE WHEN total_calls = 0 THEN 0 ELSE 100.0 * answered_calls / total_calls END;
    productive_pct := CASE WHEN answered_calls = 0 THEN 0 ELSE 100.0 * productive_calls / answered_calls END;

    unresolved_openings := GREATEST(total_openings - active_openings - closed_openings, 0);
    active_open_pct := CASE WHEN total_openings = 0 THEN 0 ELSE 100.0 * active_openings / total_openings END;
    closed_open_pct := CASE WHEN total_openings = 0 THEN 0 ELSE 100.0 * closed_openings / total_openings END;
    unresolved_open_pct := CASE WHEN total_openings = 0 THEN 0 ELSE 100.0 * unresolved_openings / total_openings END;

    companies_unresolved := GREATEST(companies_called - jobs_active - jobs_closed, 0);
    jobs_active_pct := CASE WHEN companies_called = 0 THEN 0 ELSE 100.0 * jobs_active / companies_called END;
    jobs_closed_pct := CASE WHEN companies_called = 0 THEN 0 ELSE 100.0 * jobs_closed / companies_called END;
    companies_unresolved_pct := CASE WHEN companies_called = 0 THEN 0 ELSE 100.0 * companies_unresolved / companies_called END;

    result := jsonb_build_array(
      jsonb_build_object(
        'key','openings',
        'title','Outcome metrics — Openings',
        'subtitle','Vacancy-weighted (sum of num_vacancies_input)',
        'cards', jsonb_build_array(
          jsonb_build_object('key','total_openings','label','Total Openings (Before Campaign)','value', to_char(total_openings,'FM999,999,999'),'sub','Vacancies across all contacted companies','accent','blue'),
          jsonb_build_object('key','active_openings','label','Active Openings','value', to_char(active_openings,'FM999,999,999'),'sub', to_char(active_open_pct,'FM999990.0') || '% of total openings','accent','green'),
          jsonb_build_object('key','closed_openings','label','Closed Openings','value', to_char(closed_openings,'FM999,999,999'),'sub', to_char(closed_open_pct,'FM999990.0') || '% — positions filled','accent','red'),
          jsonb_build_object('key','unresolved_openings','label','Unresolved Openings','value', to_char(unresolved_openings,'FM999,999,999'),'sub', to_char(unresolved_open_pct,'FM999990.0') || '% — not confirmed','accent','amber'),
          jsonb_build_object('key','new_openings','label','New Openings Captured','value', to_char(new_openings,'FM999,999,999'),'sub','From new jobs posted this campaign','accent','blue')
        )
      ),
      jsonb_build_object(
        'key','companies',
        'title','Outcome metrics — Companies',
        'subtitle','Per unique company (deduped by contact phone)',
        'cards', jsonb_build_array(
          jsonb_build_object('key','companies_called','label','Companies Called','value', to_char(companies_called,'FM999,999,999'),'sub','Unique phone numbers','accent','blue'),
          jsonb_build_object('key','jobs_active','label','Jobs Confirmed Active','value', to_char(jobs_active,'FM999,999,999'),'sub', to_char(jobs_active_pct,'FM999990.0') || '% of companies called','accent','green'),
          jsonb_build_object('key','jobs_closed','label','Jobs Confirmed Closed','value', to_char(jobs_closed,'FM999,999,999'),'sub', to_char(jobs_closed_pct,'FM999990.0') || '% — no longer hiring','accent','red'),
          jsonb_build_object('key','companies_unresolved','label','Unresolved','value', to_char(companies_unresolved,'FM999,999,999'),'sub', to_char(companies_unresolved_pct,'FM999990.0') || '% — no confirmation','accent','amber'),
          jsonb_build_object('key','new_jobs_discussed','label','New Jobs Discussed','value', to_char(new_jobs_discussed,'FM999,999,999'),'sub','Companies that mentioned a new role','accent','blue')
        )
      ),
      jsonb_build_object(
        'key','call',
        'title','Call metrics',
        'subtitle','Per call (raw rows)',
        'cards', jsonb_build_array(
          jsonb_build_object('key','total_calls','label','Total Calls','value', to_char(total_calls,'FM999,999,999'),'sub','All call attempts','accent','blue'),
          jsonb_build_object('key','answered','label','Answered Calls','value', to_char(answered_calls,'FM999,999,999'),'sub', to_char(pickup,'FM999990.0') || '% pickup rate','accent','green'),
          jsonb_build_object('key','unanswered','label','Unanswered Calls','value', to_char(unanswered_calls,'FM999,999,999'),'sub','No pickup','accent','red'),
          jsonb_build_object('key','productive','label','Productive Conversations','value', to_char(productive_pct,'FM999990.0') || '%','sub', to_char(productive_calls,'FM999,999,999') || ' calls — answered + over 30 seconds','accent','amber'),
          jsonb_build_object('key','avg_duration','label','Avg Call Duration','value', to_char(ROUND(avg_dur::numeric, 1),'FM999990.0') || ' sec','sub','Answered calls only','accent','blue')
        )
      )
    );
  END IF;

  RETURN result;
END;
$$;
