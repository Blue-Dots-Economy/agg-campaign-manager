CREATE OR REPLACE FUNCTION public.get_program_aggregates(_program text)
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
    lower(COALESCE(talent_insights_shown, '')) AS talent_insights_shown_l
  FROM public.call_rows
  WHERE program = _program
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
  FROM base
),
per_day AS (
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'day', day, 'date', campaign_date, 'type', campaign_type, 'language', language,
      'rows', rows, 'answered', answered, 'engaged', engaged, 'converted', converted,
      'new_jobs', new_jobs, 'answered_pct', answered_pct, 'high_intent', high_intent
    ) ORDER BY sort_num, day
  ), '[]'::jsonb) AS items
  FROM (
    SELECT campaign_day AS day, MIN(campaign_date) AS campaign_date, MIN(campaign_type) AS campaign_type,
      MIN(language) AS language, COUNT(*)::int AS rows,
      CASE WHEN _program = 'dkb' THEN COUNT(*) FILTER (WHERE call_status_l LIKE 'answered%' OR call_status_l = 'completed')::int
        ELSE COUNT(*) FILTER (WHERE call_answered)::int END AS answered,
      COUNT(*) FILTER (WHERE call_engaged)::int AS engaged,
      CASE WHEN _program = 'dkb' THEN COUNT(*) FILTER (WHERE new_job_posted_l = 'yes')::int
        ELSE COUNT(*) FILTER (WHERE applied_to_job)::int END AS converted,
      COUNT(*) FILTER (WHERE new_job_posted_l = 'yes')::int AS new_jobs,
      CASE WHEN COUNT(*) = 0 THEN 0 ELSE ROUND(
        100.0 * CASE WHEN _program = 'dkb' THEN COUNT(*) FILTER (WHERE call_status_l LIKE 'answered%' OR call_status_l = 'completed')
          ELSE COUNT(*) FILTER (WHERE call_answered) END / COUNT(*))::int END AS answered_pct,
      COUNT(*) FILTER (WHERE intent_score >= 5)::int AS high_intent,
      COALESCE(NULLIF(regexp_replace(campaign_day, '\D', '', 'g'), ''), '0')::int AS sort_num
    FROM base GROUP BY campaign_day
  ) d
),
drops AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object('reason', reason, 'count', count) ORDER BY count DESC, reason), '[]'::jsonb) AS items
  FROM (
    SELECT COALESCE(NULLIF(drop_reason, ''), 'Unknown') AS reason, COUNT(*)::int AS count
    FROM base WHERE _program <> 'dkb' AND COALESCE(drop_reason, '') <> ''
    GROUP BY 1
  ) x
),
intent_buckets AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object('score', b.bucket::text, 'count', COALESCE(c.count, 0)) ORDER BY b.bucket), '[]'::jsonb) AS items
  FROM generate_series(0, 10) AS b(bucket)
  LEFT JOIN (
    SELECT GREATEST(0, LEAST(10, FLOOR(intent_score)::int)) AS bucket, COUNT(*)::int AS count
    FROM base GROUP BY 1
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
    FROM base WHERE _program <> 'dkb' GROUP BY 1
  ) x
),
phases AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object('phase', phase, 'count', count) ORDER BY sort_order), '[]'::jsonb) AS items
  FROM (
    SELECT phase, COUNT(*)::int AS count, MIN(sort_order) AS sort_order
    FROM (
      SELECT
        CASE
          WHEN lower(replace(phases_reached, ' ', '')) = 'phase1' THEN 'Phase 1'
          WHEN lower(replace(phases_reached, ' ', '')) = 'phase2' THEN 'Phase 2'
          WHEN lower(replace(phases_reached, ' ', '')) = 'phase3' THEN 'Phase 3'
          WHEN lower(replace(phases_reached, ' ', '')) = 'phase4' THEN 'Phase 4'
          ELSE 'Not reached' END AS phase,
        CASE
          WHEN lower(replace(phases_reached, ' ', '')) = 'phase1' THEN 1
          WHEN lower(replace(phases_reached, ' ', '')) = 'phase2' THEN 2
          WHEN lower(replace(phases_reached, ' ', '')) = 'phase3' THEN 3
          WHEN lower(replace(phases_reached, ' ', '')) = 'phase4' THEN 4
          ELSE 5 END AS sort_order
      FROM base WHERE _program = 'dkb'
    ) p GROUP BY phase
  ) x
),
job_statuses AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object('status', status, 'count', count) ORDER BY count DESC, status), '[]'::jsonb) AS items
  FROM (
    SELECT COALESCE(NULLIF(job_status, ''), 'Not Called') AS status, COUNT(*)::int AS count
    FROM base WHERE _program = 'dkb' GROUP BY 1
  ) x
),
outcomes AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object('outcome', outcome, 'count', count) ORDER BY count DESC, outcome), '[]'::jsonb) AS items
  FROM (
    SELECT COALESCE(NULLIF(call_outcome, ''), 'Unknown') AS outcome, COUNT(*)::int AS count
    FROM base WHERE _program = 'dkb' AND COALESCE(call_outcome, '') <> '' GROUP BY 1
  ) x
),
drop_class AS (
  SELECT
    CASE
      WHEN city_campaign = 'Ghaziabad' OR lower(language) = 'hindi' THEN 'gzb'
      WHEN city_campaign = 'Hubli-Dharwad' OR lower(language) = 'kannada' THEN 'ka'
      ELSE NULL
    END AS region,
    lower(drop_reason) AS dr
  FROM base
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
      WHEN dr LIKE '%not interested%' OR dr LIKE '%declined%' OR dr LIKE '%not looking%'
        OR dr LIKE '%not available%' OR dr LIKE '%already employed%' OR dr LIKE '%call later%'
        OR dr LIKE '%look later%' OR dr LIKE '%wrong number%' OR dr LIKE '%off the line%'
        OR dr LIKE '%end call%' OR dr LIKE '%exit%' OR dr LIKE '%government%'
        OR dr LIKE '%online job%' OR dr LIKE '%not qualified%' OR dr = 'user_declined'
        OR dr LIKE '%said not%' OR dr LIKE '%asked not to call%' OR dr LIKE '%refused%'
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
    'total_calls', summary.total_rows,
    'answered', CASE WHEN _program = 'dkb' THEN summary.dkb_answered ELSE summary.kkb_answered END,
    'answered_pct', CASE WHEN summary.total_rows = 0 THEN 0 ELSE ROUND(100.0 * CASE WHEN _program = 'dkb' THEN summary.dkb_answered ELSE summary.kkb_answered END / summary.total_rows)::int END,
    'engaged', summary.engaged,
    'engaged_pct', CASE WHEN summary.total_rows = 0 THEN 0 ELSE ROUND(100.0 * summary.engaged / summary.total_rows)::int END,
    'applied', summary.applied, 'applications', summary.applied,
    'jobs_verified', summary.jobs_verified, 'new_jobs_posted', summary.new_jobs_posted,
    'high_intent', summary.high_intent, 'talent_insights_shown', summary.talent_insights
  ),
  'perDay', per_day.items,
  'drops', CASE WHEN _program = 'dkb' THEN '[]'::jsonb ELSE drops.items END,
  'intents', CASE WHEN _program = 'dkb' THEN '[]'::jsonb ELSE intent_buckets.items END,
  'regions', CASE WHEN _program = 'dkb' THEN '[]'::jsonb ELSE regions.items END,
  'phases', CASE WHEN _program = 'dkb' THEN phases.items ELSE '[]'::jsonb END,
  'jobStatus', CASE WHEN _program = 'dkb' THEN job_statuses.items ELSE '[]'::jsonb END,
  'outcomes', CASE WHEN _program = 'dkb' THEN outcomes.items ELSE '[]'::jsonb END,
  'dkbIntents', CASE WHEN _program = 'dkb' THEN intent_buckets.items ELSE '[]'::jsonb END,
  'dropAnalysis', CASE WHEN _program = 'dkb' THEN '[]'::jsonb ELSE drop_analysis.items END
)
FROM summary, per_day, drops, intent_buckets, regions, phases, job_statuses, outcomes, drop_analysis;
$function$;