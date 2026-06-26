
CREATE OR REPLACE FUNCTION public.get_program_aggregates(
  _program text,
  _state text DEFAULT 'all',
  _date_from date DEFAULT NULL,
  _date_to date DEFAULT NULL,
  _campaign_type text DEFAULT 'all'
)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
WITH base AS (
  SELECT
    campaign_day,
    COALESCE(campaign_date, '') AS campaign_date,
    COALESCE(campaign_type, '') AS campaign_type,
    COALESCE(language, '') AS language,
    COALESCE(intent_score, 0) AS intent_score,
    COALESCE(call_answered, false) AS call_answered,
    COALESCE(call_engaged, false) AS call_engaged,
    COALESCE(applied_to_job, false) AS applied_to_job,
    COALESCE(call_status, '') AS call_status,
    COALESCE(job_status, '') AS job_status,
    COALESCE(new_job_posted, '') AS new_job_posted,
    COALESCE(talent_insights_shown, '') AS talent_insights_shown,
    COALESCE(phases_reached, '') AS phases_reached,
    COALESCE(drop_reason, '') AS drop_reason,
    COALESCE(call_outcome, '') AS call_outcome,
    COALESCE(city_campaign, '') AS city_campaign,
    lower(COALESCE(call_status, '')) AS call_status_l,
    lower(COALESCE(job_status, '')) AS job_status_l,
    lower(COALESCE(new_job_posted, '')) AS new_job_posted_l,
    lower(COALESCE(talent_insights_shown, '')) AS talent_insights_shown_l,
    CASE
      WHEN city_campaign = 'Ghaziabad' OR lower(COALESCE(language,'')) = 'hindi' THEN 'GZB'
      WHEN city_campaign = 'Hubli-Dharwad' OR lower(COALESCE(language,'')) = 'kannada' THEN 'KA'
      ELSE NULL
    END AS region_code,
    CASE
      WHEN COALESCE(campaign_date,'') ~ '^[0-9]{4,6}$'
        THEN (DATE '1899-12-30' + (campaign_date)::int)::date
      WHEN COALESCE(campaign_date,'') ~ '^\d{4}-\d{2}-\d{2}'
        THEN substring(campaign_date, 1, 10)::date
      WHEN COALESCE(data->>'call_datetime_ist','') ~ '^\d{4}-\d{2}-\d{2}'
        THEN substring(data->>'call_datetime_ist', 1, 10)::date
      ELSE NULL
    END AS call_date
  FROM public.call_rows
  WHERE program = _program
),
filtered AS (
  SELECT * FROM base
  WHERE (_state = 'all' OR region_code = _state)
    AND (_date_from IS NULL OR (call_date IS NOT NULL AND call_date >= _date_from))
    AND (_date_to   IS NULL OR (call_date IS NOT NULL AND call_date <= _date_to))
    AND (
      _program <> 'kkb'
      OR _campaign_type = 'all'
      OR (
        _campaign_type = 'higher_education'
        AND (
          LOWER(campaign_type) LIKE '%higher%education%'
          OR LOWER(campaign_type) LIKE '%higher_education%'
        )
      )
      OR (
        _campaign_type = 'normal'
        AND LOWER(campaign_type) NOT LIKE '%higher%education%'
        AND LOWER(campaign_type) NOT LIKE '%higher_education%'
      )
    )
),
summary AS (
  SELECT
    COUNT(*)::int AS total_rows,
    COUNT(*) FILTER (WHERE call_answered)::int AS kkb_answered,
    COUNT(*) FILTER (WHERE call_engaged)::int AS engaged,
    COUNT(*) FILTER (WHERE applied_to_job)::int AS applied,
    COUNT(*) FILTER (WHERE intent_score >= 5)::int AS high_intent,
    COUNT(*) FILTER (WHERE call_status_l LIKE 'answered%' OR call_status_l = 'completed')::int AS dkb_answered,
    COUNT(*) FILTER (WHERE job_status_l IN ('active', 'closed'))::int AS jobs_verified,
    COUNT(*) FILTER (WHERE new_job_posted_l = 'yes')::int AS new_jobs_posted,
    COUNT(*) FILTER (WHERE talent_insights_shown_l = 'yes')::int AS talent_insights
  FROM filtered
),
per_day AS (
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'day', day, 'date', date_str, 'type', campaign_type, 'language', language,
      'rows', rows, 'answered', answered, 'engaged', engaged, 'converted', converted,
      'new_jobs', new_jobs, 'answered_pct', answered_pct, 'high_intent', high_intent
    ) ORDER BY sort_date NULLS LAST, date_str
  ), '[]'::jsonb) AS items
  FROM (
    SELECT
      MIN(campaign_day) AS day,
      to_char(call_date, 'YYYY-MM-DD') AS date_str,
      call_date AS sort_date,
      MIN(campaign_type) AS campaign_type,
      MIN(language) AS language,
      COUNT(*)::int AS rows,
      CASE WHEN _program = 'dkb' THEN COUNT(*) FILTER (WHERE call_status_l LIKE 'answered%' OR call_status_l = 'completed')::int
        ELSE COUNT(*) FILTER (WHERE call_answered)::int END AS answered,
      COUNT(*) FILTER (WHERE call_engaged)::int AS engaged,
      CASE WHEN _program = 'dkb' THEN COUNT(*) FILTER (WHERE new_job_posted_l = 'yes')::int
        ELSE COUNT(*) FILTER (WHERE applied_to_job)::int END AS converted,
      COUNT(*) FILTER (WHERE new_job_posted_l = 'yes')::int AS new_jobs,
      CASE WHEN COUNT(*) = 0 THEN 0 ELSE ROUND(
        100.0 * CASE WHEN _program = 'dkb' THEN COUNT(*) FILTER (WHERE call_status_l LIKE 'answered%' OR call_status_l = 'completed')
          ELSE COUNT(*) FILTER (WHERE call_answered) END / COUNT(*))::int END AS answered_pct,
      COUNT(*) FILTER (WHERE intent_score >= 5)::int AS high_intent
    FROM filtered
    WHERE call_date IS NOT NULL
    GROUP BY call_date
  ) d
),
drops AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object('reason', reason, 'count', count) ORDER BY count DESC, reason), '[]'::jsonb) AS items
  FROM (
    SELECT COALESCE(NULLIF(drop_reason, ''), 'Unknown') AS reason, COUNT(*)::int AS count
    FROM filtered WHERE _program <> 'dkb' AND COALESCE(drop_reason, '') <> ''
    GROUP BY 1
  ) x
),
intent_buckets AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object('score', b.bucket::text, 'count', COALESCE(c.count, 0)) ORDER BY b.bucket), '[]'::jsonb) AS items
  FROM generate_series(0, 10) AS b(bucket)
  LEFT JOIN (
    SELECT GREATEST(0, LEAST(10, FLOOR(intent_score)::int)) AS bucket, COUNT(*)::int AS count
    FROM filtered GROUP BY 1
  ) c USING (bucket)
),
regions AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object('region', region, 'count', count) ORDER BY region), '[]'::jsonb) AS items
  FROM (
    SELECT CASE
        WHEN city_campaign = 'Hubli-Dharwad' THEN 'KA'
        WHEN city_campaign = 'Ghaziabad' THEN 'GZB'
        ELSE COALESCE(NULLIF(city_campaign, ''), 'Unknown') END AS region,
      COUNT(*)::int AS count
    FROM filtered WHERE _program <> 'dkb' GROUP BY 1
  ) x
),
phases AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object('phase', phase, 'count', count) ORDER BY phase), '[]'::jsonb) AS items
  FROM (
    SELECT 'Phase ' || phases_reached AS phase, COUNT(*)::int AS count
    FROM filtered WHERE _program = 'dkb' AND phases_reached ~ '^[1-4]$' GROUP BY phases_reached
  ) x
),
job_statuses AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object('status', status, 'count', count) ORDER BY count DESC), '[]'::jsonb) AS items
  FROM (
    SELECT COALESCE(NULLIF(job_status, ''), 'Unknown') AS status, COUNT(*)::int AS count
    FROM filtered WHERE _program = 'dkb' GROUP BY 1
  ) x
),
outcomes AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object('outcome', outcome, 'count', count) ORDER BY count DESC), '[]'::jsonb) AS items
  FROM (
    SELECT COALESCE(NULLIF(call_outcome, ''), 'Unknown') AS outcome, COUNT(*)::int AS count
    FROM filtered WHERE _program = 'dkb' GROUP BY 1
  ) x
),
drop_class AS (
  SELECT
    CASE WHEN region_code = 'GZB' THEN 'gzb'
         WHEN region_code = 'KA' THEN 'ka'
         ELSE NULL END AS region,
    lower(drop_reason) AS dr
  FROM filtered
  WHERE _program = 'kkb'
    AND drop_reason IS NOT NULL
    AND drop_reason <> ''
    AND lower(drop_reason) <> 'not a drop'
    AND lower(drop_reason) NOT LIKE 'not captured%'
),
drop_tagged AS (
  SELECT region,
    CASE
      WHEN (dr LIKE '%apply%' AND (dr LIKE '%fail%' OR dr LIKE '%api%' OR dr LIKE '%404%'))
        OR dr = 'apply_failed' OR dr LIKE '%repeated apply%' OR dr LIKE '%before confirming application%'
        THEN 'Apply step'
      WHEN dr LIKE '%profile%' THEN 'Profile collection'
      WHEN dr LIKE '%no matching%' OR dr = 'no_matching_jobs' THEN 'Job matching'
      WHEN dr LIKE '%salary%' OR dr LIKE '%location%' OR dr LIKE '%too far%' OR dr LIKE '%mismatch%'
        THEN 'After jobs shown'
      WHEN dr LIKE '%shown jobs%' OR dr LIKE '%offered jobs%' OR dr LIKE '%available jobs%'
        OR dr LIKE '%suggested jobs%' OR dr LIKE '%available roles%' OR dr = 'hung_up_after_jobs_shown'
        THEN 'After jobs shown'
      WHEN dr LIKE '%bot%' OR dr LIKE '%understand%' OR dr LIKE '%unclear comm%'
        OR dr LIKE '%irrelevant%' OR dr LIKE '%nonsensical%' OR dr = 'bot_didnt_understand'
        THEN 'Mid-call'
      WHEN dr LIKE '%language%' THEN 'Mid-call'
      WHEN dr LIKE '%audio%' OR dr LIKE '%inaudible%' OR dr LIKE '%unclear speech%' OR dr LIKE '%softly%'
        OR dr LIKE '%could not hear%' OR dr LIKE '%silent%' OR dr LIKE '%no response%'
        OR dr LIKE '%voicemail%' OR dr LIKE '%unreachable%' OR dr LIKE '%no meaningful engagement%'
        THEN CASE WHEN dr LIKE '%greeting%' OR dr LIKE '%voicemail%' OR dr LIKE '%unreachable%' OR dr = 'silent_user'
          THEN 'Before / at greeting' ELSE 'Mid-call' END
      WHEN dr = 'early_hangup' OR dr LIKE '%after greeting%' THEN 'Before / at greeting'
      WHEN dr = 'hung up mid-call' OR dr LIKE '%hung up%' OR dr LIKE '%disengage%' OR dr LIKE '%on hold%'
        THEN 'Mid-call'
      ELSE 'Mid-call'
    END AS stage,
    CASE
      WHEN (dr LIKE '%apply%' AND (dr LIKE '%fail%' OR dr LIKE '%api%' OR dr LIKE '%404%'))
        OR dr = 'apply_failed' OR dr LIKE '%repeated apply%' OR dr LIKE '%before confirming application%'
        THEN 'Apply failure (API)'
      WHEN dr LIKE '%profile%' THEN 'Profile friction'
      WHEN dr LIKE '%no matching%' OR dr = 'no_matching_jobs' THEN 'No matching jobs'
      WHEN dr LIKE '%salary%' OR dr LIKE '%location%' OR dr LIKE '%too far%' OR dr LIKE '%mismatch%'
        THEN 'Job mismatch (salary/location)'
      WHEN dr LIKE '%shown jobs%' OR dr LIKE '%offered jobs%' OR dr LIKE '%available jobs%'
        OR dr LIKE '%suggested jobs%' OR dr LIKE '%available roles%' OR dr = 'hung_up_after_jobs_shown'
        THEN 'Not interested / declined'
      WHEN dr LIKE '%bot%' OR dr LIKE '%understand%' OR dr LIKE '%unclear comm%'
        OR dr LIKE '%irrelevant%' OR dr LIKE '%nonsensical%' OR dr = 'bot_didnt_understand'
        THEN 'Bot / tech difficulty'
      WHEN dr LIKE '%language%' THEN 'Language barrier'
      WHEN dr LIKE '%audio%' OR dr LIKE '%inaudible%' OR dr LIKE '%unclear speech%' OR dr LIKE '%softly%'
        OR dr LIKE '%could not hear%' OR dr LIKE '%silent%' OR dr LIKE '%no response%'
        OR dr LIKE '%voicemail%' OR dr LIKE '%unreachable%' OR dr LIKE '%no meaningful engagement%'
        THEN 'No / unclear audio'
      WHEN dr = 'early_hangup' OR dr LIKE '%after greeting%' THEN 'Hung up / disengaged'
      WHEN dr = 'hung up mid-call' OR dr LIKE '%hung up%' OR dr LIKE '%disengage%' OR dr LIKE '%on hold%'
        THEN 'Hung up / disengaged'
      WHEN dr LIKE '%not interested%' OR dr LIKE '%declined%' OR dr LIKE '%not looking%'
        OR dr LIKE '%not available%' OR dr LIKE '%already employed%' OR dr LIKE '%call later%'
        OR dr LIKE '%look later%' OR dr LIKE '%wrong number%' OR dr LIKE '%off the line%'
        OR dr LIKE '%end call%' OR dr LIKE '%exit%' OR dr LIKE '%government%'
        OR dr LIKE '%online job%' OR dr LIKE '%not qualified%' OR dr = 'user_declined'
        OR dr LIKE '%said not%' OR dr LIKE '%asked not to call%' OR dr LIKE '%refused%'
        THEN 'Not interested / declined'
      ELSE 'Other'
    END AS reason
  FROM drop_class
),
drop_agg AS (
  SELECT stage, reason,
    COUNT(*) FILTER (WHERE region = 'gzb')::int AS gzb,
    COUNT(*) FILTER (WHERE region = 'ka')::int AS ka,
    COUNT(*)::int AS total
  FROM drop_tagged
  GROUP BY stage, reason
),
drop_analysis AS (
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object('stage', stage, 'reason', reason, 'gzb', gzb, 'ka', ka, 'total', total)
    ORDER BY
      CASE stage
        WHEN 'Before / at greeting' THEN 1
        WHEN 'Profile collection' THEN 2
        WHEN 'Job matching' THEN 3
        WHEN 'After jobs shown' THEN 4
        WHEN 'Apply step' THEN 5
        WHEN 'Mid-call' THEN 6
        ELSE 7
      END,
      total DESC, reason
  ), '[]'::jsonb) AS items
  FROM drop_agg
)
SELECT jsonb_build_object(
  'kpis', jsonb_build_object(
    'total_rows', summary.total_rows,
    'kkb_answered', summary.kkb_answered, 'engaged', summary.engaged, 'applied', summary.applied,
    'high_intent', summary.high_intent, 'dkb_answered', summary.dkb_answered,
    'jobs_verified', summary.jobs_verified, 'new_jobs_posted', summary.new_jobs_posted,
    'talent_insights', summary.talent_insights
  ),
  'perDay', per_day.items,
  'drops', drops.items,
  'intents', intent_buckets.items,
  'regions', regions.items,
  'phases', phases.items,
  'jobStatus', job_statuses.items,
  'outcomes', outcomes.items,
  'dkbIntents', intent_buckets.items,
  'dropAnalysis', CASE WHEN _program = 'dkb' THEN '[]'::jsonb ELSE drop_analysis.items END
)
FROM summary, per_day, drops, intent_buckets, regions, phases, job_statuses, outcomes, drop_analysis;
$function$;

CREATE OR REPLACE FUNCTION public.get_program_metric_groups(
  _program text,
  _state text DEFAULT 'all',
  _date_from date DEFAULT NULL,
  _date_to date DEFAULT NULL,
  _campaign_type text DEFAULT 'all'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
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
  total_openings int := 0;
  active_openings int := 0;
  closed_openings int := 0;
  unresolved_openings int := 0;
  new_openings int := 0;
  active_open_pct numeric := 0;
  closed_open_pct numeric := 0;
  unresolved_open_pct numeric := 0;
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
    WITH base AS (
      SELECT
        phone, call_answered, call_duration_seconds, applied_to_job,
        tried_to_apply, applications_count,
        COALESCE(campaign_type,'') AS campaign_type,
        CASE
          WHEN city_campaign = 'Ghaziabad' OR lower(COALESCE(language,'')) = 'hindi' THEN 'GZB'
          WHEN city_campaign = 'Hubli-Dharwad' OR lower(COALESCE(language,'')) = 'kannada' THEN 'KA'
          ELSE NULL END AS region_code,
        CASE
          WHEN COALESCE(data->>'call_datetime_ist','') ~ '^\d{4}-\d{2}-\d{2}'
            THEN substring(data->>'call_datetime_ist', 1, 10)::date
          WHEN COALESCE(campaign_date,'') ~ '^\d{4}-\d{2}-\d{2}'
            THEN substring(campaign_date, 1, 10)::date
          ELSE NULL END AS call_date
      FROM public.call_rows WHERE program = 'kkb'
    ),
    f AS (
      SELECT * FROM base
      WHERE (_state = 'all' OR region_code = _state)
        AND (_date_from IS NULL OR (call_date IS NOT NULL AND call_date >= _date_from))
        AND (_date_to   IS NULL OR (call_date IS NOT NULL AND call_date <= _date_to))
        AND (
          _campaign_type = 'all'
          OR (
            _campaign_type = 'higher_education'
            AND (
              LOWER(campaign_type) LIKE '%higher%education%'
              OR LOWER(campaign_type) LIKE '%higher_education%'
            )
          )
          OR (
            _campaign_type = 'normal'
            AND LOWER(campaign_type) NOT LIKE '%higher%education%'
            AND LOWER(campaign_type) NOT LIKE '%higher_education%'
          )
        )
    )
    SELECT
      COUNT(*)::int,
      COUNT(*) FILTER (WHERE call_answered)::int,
      COUNT(*) FILTER (WHERE call_answered AND COALESCE(call_duration_seconds,0) > 30)::int,
      COALESCE(AVG(call_duration_seconds) FILTER (WHERE call_answered), 0),
      COUNT(DISTINCT phone) FILTER (WHERE phone IS NOT NULL AND phone <> '')::int,
      COUNT(DISTINCT phone) FILTER (WHERE call_answered AND phone IS NOT NULL AND phone <> '')::int,
      COUNT(DISTINCT phone) FILTER (WHERE applied_to_job AND phone IS NOT NULL AND phone <> '')::int,
      COUNT(DISTINCT phone) FILTER (WHERE COALESCE(tried_to_apply,false) AND NOT COALESCE(applied_to_job,false) AND phone IS NOT NULL AND phone <> '')::int,
      COALESCE(SUM(applications_count), 0)
    INTO total_calls, answered_calls, productive_calls, avg_dur,
         seekers, answered_seekers, applied_seekers, failed_seekers, total_applications
    FROM f;

    unanswered_calls := total_calls - answered_calls;
    pickup := CASE WHEN total_calls = 0 THEN 0 ELSE 100.0 * answered_calls / total_calls END;
    productive_pct := CASE WHEN total_calls = 0 THEN 0 ELSE 100.0 * productive_calls / total_calls END;
    did_not_apply := GREATEST(answered_seekers - applied_seekers, 0);
    tried := applied_seekers + failed_seekers;
    applied_pct := CASE WHEN answered_seekers = 0 THEN 0 ELSE 100.0 * applied_seekers / answered_seekers END;
    failed_pct := CASE WHEN tried = 0 THEN 0 ELSE 100.0 * failed_seekers / tried END;
    application_rate := applied_pct;

    result := jsonb_build_array(
      jsonb_build_object(
        'key','outcome','title','Outcome metrics',
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
        'key','call','title','Call metrics','subtitle','Per call (raw rows)',
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
    WITH base AS (
      SELECT
        phone,
        lower(COALESCE(call_status,'')) AS cs,
        call_duration_seconds AS dur,
        lower(COALESCE(job_status, data->'raw'->>'job_status','')) AS js,
        lower(COALESCE(new_job_posted, data->'raw'->>'new_job_posted','')) AS njp,
        lower(COALESCE(data->'raw'->>'new_job_mentioned','')) AS njm,
        COALESCE((regexp_match(COALESCE(data->'raw'->>'num_vacancies_input',''), '\d+'))[1]::int, 0) AS nvi,
        COALESCE((regexp_match(COALESCE(data->'raw'->>'new_job_vacancies',''), '\d+'))[1]::int, 0) AS njv,
        CASE
          WHEN city_campaign = 'Ghaziabad' OR lower(COALESCE(language,'')) = 'hindi' THEN 'GZB'
          WHEN city_campaign = 'Hubli-Dharwad' OR lower(COALESCE(language,'')) = 'kannada' THEN 'KA'
          ELSE NULL END AS region_code,
        CASE
          WHEN COALESCE(data->>'call_datetime_ist','') ~ '^\d{4}-\d{2}-\d{2}'
            THEN substring(data->>'call_datetime_ist', 1, 10)::date
          WHEN COALESCE(campaign_date,'') ~ '^\d{4}-\d{2}-\d{2}'
            THEN substring(campaign_date, 1, 10)::date
          ELSE NULL END AS call_date
      FROM public.call_rows WHERE program = 'dkb'
    ),
    f AS (
      SELECT * FROM base
      WHERE (_state = 'all' OR region_code = _state)
        AND (_date_from IS NULL OR (call_date IS NOT NULL AND call_date >= _date_from))
        AND (_date_to   IS NULL OR (call_date IS NOT NULL AND call_date <= _date_to))
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
    FROM f;

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
        'key','openings','title','Outcome metrics — Openings',
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
        'key','companies','title','Outcome metrics — Companies',
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
        'key','call','title','Call metrics','subtitle','Per call (raw rows)',
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
$function$;

CREATE OR REPLACE FUNCTION public.get_program_metrics_raw(
  _program text,
  _state text DEFAULT 'all',
  _date_from date DEFAULT NULL,
  _date_to date DEFAULT NULL,
  _campaign_type text DEFAULT 'all'
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
          COALESCE(campaign_type,'') AS campaign_type,
          ((data->>'jobs_shown') IS NOT NULL AND lower(data->>'jobs_shown') IN ('true','yes','y','1')) AS jobs_shown_flag,
          (COALESCE(applied_to_job,false)
            OR (jsonb_typeof(data->'jobs_applied') = 'array' AND jsonb_array_length(data->'jobs_applied') > 0)) AS submitted_flag,
          (jsonb_typeof(data->'jobs_failed_to_apply') = 'array' AND jsonb_array_length(data->'jobs_failed_to_apply') > 0) AS blocked_flag,
          CASE
            WHEN city_campaign = 'Ghaziabad' OR lower(COALESCE(language,'')) = 'hindi' THEN 'GZB'
            WHEN city_campaign = 'Hubli-Dharwad' OR lower(COALESCE(language,'')) = 'kannada' THEN 'KA'
            ELSE NULL END AS region_code,
          CASE
            WHEN COALESCE(campaign_date,'') ~ '^[0-9]{4,6}$'
              THEN (DATE '1899-12-30' + (campaign_date)::int)::date
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
          AND (
            _campaign_type = 'all'
            OR (
              _campaign_type = 'higher_education'
              AND (
                LOWER(campaign_type) LIKE '%higher%education%'
                OR LOWER(campaign_type) LIKE '%higher_education%'
              )
            )
            OR (
              _campaign_type = 'normal'
              AND LOWER(campaign_type) NOT LIKE '%higher%education%'
              AND LOWER(campaign_type) NOT LIKE '%higher_education%'
            )
          )
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
            WHEN COALESCE(campaign_date,'') ~ '^[0-9]{4,6}$'
              THEN (DATE '1899-12-30' + (campaign_date)::int)::date
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

CREATE OR REPLACE FUNCTION public.get_program_aggregate_payload(
  _program text,
  _state text DEFAULT 'all',
  _date_from date DEFAULT NULL,
  _date_to date DEFAULT NULL,
  _campaign_type text DEFAULT 'all'
)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
WITH aggregate_result AS (
  SELECT public.get_program_aggregates(_program, _state, _date_from, _date_to, _campaign_type) AS aggregates
),
groups AS (
  SELECT public.get_program_metric_groups(_program, _state, _date_from, _date_to, _campaign_type) AS metric_groups
),
metrics AS (
  SELECT public.get_program_metrics_raw(_program, _state, _date_from, _date_to, _campaign_type) AS metrics_raw
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
