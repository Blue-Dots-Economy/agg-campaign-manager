ALTER TABLE public.call_rows
  ADD COLUMN IF NOT EXISTS call_answered boolean,
  ADD COLUMN IF NOT EXISTS call_engaged boolean,
  ADD COLUMN IF NOT EXISTS applied_to_job boolean,
  ADD COLUMN IF NOT EXISTS call_status text,
  ADD COLUMN IF NOT EXISTS job_status text,
  ADD COLUMN IF NOT EXISTS new_job_posted text,
  ADD COLUMN IF NOT EXISTS talent_insights_shown text,
  ADD COLUMN IF NOT EXISTS phases_reached text,
  ADD COLUMN IF NOT EXISTS drop_reason text,
  ADD COLUMN IF NOT EXISTS call_outcome text,
  ADD COLUMN IF NOT EXISTS city_campaign text,
  ADD COLUMN IF NOT EXISTS campaign_date text,
  ADD COLUMN IF NOT EXISTS campaign_type text,
  ADD COLUMN IF NOT EXISTS language text;

CREATE INDEX IF NOT EXISTS call_rows_program_idx ON public.call_rows(program);
CREATE INDEX IF NOT EXISTS call_rows_program_day_idx ON public.call_rows(program, campaign_day);
CREATE INDEX IF NOT EXISTS call_rows_program_call_idx ON public.call_rows(program, call_id);

UPDATE public.call_rows
SET
  call_answered = COALESCE(call_answered, lower(COALESCE(data->>'call_answered', '')) IN ('true', 'yes', 'y', '1')),
  call_engaged = COALESCE(call_engaged, lower(COALESCE(data->>'call_engaged', '')) IN ('true', 'yes', 'y', '1')),
  applied_to_job = COALESCE(applied_to_job, lower(COALESCE(data->>'applied_to_job', '')) IN ('true', 'yes', 'y', '1')),
  call_status = COALESCE(call_status, data->'raw'->>'call_status', ''),
  job_status = COALESCE(job_status, data->'raw'->>'job_status', ''),
  new_job_posted = COALESCE(new_job_posted, data->'raw'->>'new_job_posted', ''),
  talent_insights_shown = COALESCE(talent_insights_shown, data->'raw'->>'talent_insights_shown', ''),
  phases_reached = COALESCE(phases_reached, data->'raw'->>'phases_reached', ''),
  drop_reason = COALESCE(drop_reason, data->>'drop_reason', data->'raw'->>'drop_reason', ''),
  call_outcome = COALESCE(call_outcome, data->'raw'->>'call_outcome', data->>'call_outcome', ''),
  city_campaign = COALESCE(city_campaign, data->'raw'->>'city_campaign', data->>'city_campaign', ''),
  campaign_date = COALESCE(campaign_date, data->>'campaign_date', data->'raw'->>'campaign_date', ''),
  campaign_type = COALESCE(campaign_type, data->>'campaign_type', data->'raw'->>'campaign_type', ''),
  language = COALESCE(language, data->>'language', data->'raw'->>'language', ''),
  intent_score = COALESCE(
    intent_score,
    CASE
      WHEN COALESCE(data->>'Intent Score', data->'raw'->>'intent_score', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
      THEN COALESCE(data->>'Intent Score', data->'raw'->>'intent_score')::numeric
      ELSE NULL
    END
  );

CREATE OR REPLACE FUNCTION public.get_program_aggregates(_program text)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
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
      'day', day,
      'date', campaign_date,
      'type', campaign_type,
      'language', language,
      'rows', rows,
      'answered', answered,
      'engaged', engaged,
      'converted', converted,
      'new_jobs', new_jobs,
      'answered_pct', answered_pct,
      'high_intent', high_intent
    ) ORDER BY sort_num, day
  ), '[]'::jsonb) AS items
  FROM (
    SELECT
      campaign_day AS day,
      MIN(campaign_date) AS campaign_date,
      MIN(campaign_type) AS campaign_type,
      MIN(language) AS language,
      COUNT(*)::int AS rows,
      CASE WHEN _program = 'dkb'
        THEN COUNT(*) FILTER (WHERE call_status_l LIKE 'answered%' OR call_status_l = 'completed')::int
        ELSE COUNT(*) FILTER (WHERE call_answered)::int
      END AS answered,
      COUNT(*) FILTER (WHERE call_engaged)::int AS engaged,
      CASE WHEN _program = 'dkb'
        THEN COUNT(*) FILTER (WHERE new_job_posted_l = 'yes')::int
        ELSE COUNT(*) FILTER (WHERE applied_to_job)::int
      END AS converted,
      COUNT(*) FILTER (WHERE new_job_posted_l = 'yes')::int AS new_jobs,
      CASE WHEN COUNT(*) = 0 THEN 0 ELSE ROUND(
        100.0 * CASE WHEN _program = 'dkb'
          THEN COUNT(*) FILTER (WHERE call_status_l LIKE 'answered%' OR call_status_l = 'completed')
          ELSE COUNT(*) FILTER (WHERE call_answered)
        END / COUNT(*)
      )::int END AS answered_pct,
      COUNT(*) FILTER (WHERE intent_score >= 5)::int AS high_intent,
      COALESCE(NULLIF(regexp_replace(campaign_day, '\D', '', 'g'), ''), '0')::int AS sort_num
    FROM base
    GROUP BY campaign_day
  ) d
),
drops AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object('reason', reason, 'count', count) ORDER BY count DESC, reason), '[]'::jsonb) AS items
  FROM (
    SELECT COALESCE(NULLIF(drop_reason, ''), 'Unknown') AS reason, COUNT(*)::int AS count
    FROM base
    WHERE _program <> 'dkb' AND COALESCE(drop_reason, '') <> ''
    GROUP BY 1
  ) x
),
intent_buckets AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object('score', b.bucket::text, 'count', COALESCE(c.count, 0)) ORDER BY b.bucket), '[]'::jsonb) AS items
  FROM generate_series(0, 10) AS b(bucket)
  LEFT JOIN (
    SELECT GREATEST(0, LEAST(10, FLOOR(intent_score)::int)) AS bucket, COUNT(*)::int AS count
    FROM base
    GROUP BY 1
  ) c USING (bucket)
),
regions AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object('region', region, 'count', count) ORDER BY region), '[]'::jsonb) AS items
  FROM (
    SELECT
      CASE
        WHEN city_campaign = 'Hubli-Dharwad' THEN 'KA'
        WHEN city_campaign = 'Ghaziabad' THEN 'GZB'
        ELSE COALESCE(NULLIF(city_campaign, ''), 'Unknown')
      END AS region,
      COUNT(*)::int AS count
    FROM base
    WHERE _program <> 'dkb'
    GROUP BY 1
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
          ELSE 'Not reached'
        END AS phase,
        CASE
          WHEN lower(replace(phases_reached, ' ', '')) = 'phase1' THEN 1
          WHEN lower(replace(phases_reached, ' ', '')) = 'phase2' THEN 2
          WHEN lower(replace(phases_reached, ' ', '')) = 'phase3' THEN 3
          WHEN lower(replace(phases_reached, ' ', '')) = 'phase4' THEN 4
          ELSE 5
        END AS sort_order
      FROM base
      WHERE _program = 'dkb'
    ) p
    GROUP BY phase
  ) x
),
job_statuses AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object('status', status, 'count', count) ORDER BY count DESC, status), '[]'::jsonb) AS items
  FROM (
    SELECT COALESCE(NULLIF(job_status, ''), 'Not Called') AS status, COUNT(*)::int AS count
    FROM base
    WHERE _program = 'dkb'
    GROUP BY 1
  ) x
),
outcomes AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object('outcome', outcome, 'count', count) ORDER BY count DESC, outcome), '[]'::jsonb) AS items
  FROM (
    SELECT COALESCE(NULLIF(call_outcome, ''), 'Unknown') AS outcome, COUNT(*)::int AS count
    FROM base
    WHERE _program = 'dkb' AND COALESCE(call_outcome, '') <> ''
    GROUP BY 1
  ) x
)
SELECT jsonb_build_object(
  'kpis', jsonb_build_object(
    'total_calls', summary.total_rows,
    'answered', CASE WHEN _program = 'dkb' THEN summary.dkb_answered ELSE summary.kkb_answered END,
    'answered_pct', CASE WHEN summary.total_rows = 0 THEN 0 ELSE ROUND(100.0 * CASE WHEN _program = 'dkb' THEN summary.dkb_answered ELSE summary.kkb_answered END / summary.total_rows)::int END,
    'engaged', summary.engaged,
    'engaged_pct', CASE WHEN summary.total_rows = 0 THEN 0 ELSE ROUND(100.0 * summary.engaged / summary.total_rows)::int END,
    'applied', summary.applied,
    'applications', summary.applied,
    'jobs_verified', summary.jobs_verified,
    'new_jobs_posted', summary.new_jobs_posted,
    'high_intent', summary.high_intent,
    'talent_insights_shown', summary.talent_insights
  ),
  'perDay', per_day.items,
  'drops', CASE WHEN _program = 'dkb' THEN '[]'::jsonb ELSE drops.items END,
  'intents', CASE WHEN _program = 'dkb' THEN '[]'::jsonb ELSE intent_buckets.items END,
  'regions', CASE WHEN _program = 'dkb' THEN '[]'::jsonb ELSE regions.items END,
  'phases', CASE WHEN _program = 'dkb' THEN phases.items ELSE '[]'::jsonb END,
  'jobStatus', CASE WHEN _program = 'dkb' THEN job_statuses.items ELSE '[]'::jsonb END,
  'outcomes', CASE WHEN _program = 'dkb' THEN outcomes.items ELSE '[]'::jsonb END,
  'dkbIntents', CASE WHEN _program = 'dkb' THEN intent_buckets.items ELSE '[]'::jsonb END
)
FROM summary, per_day, drops, intent_buckets, regions, phases, job_statuses, outcomes;
$$;

GRANT EXECUTE ON FUNCTION public.get_program_aggregates(text) TO anon, authenticated, service_role;