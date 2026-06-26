CREATE OR REPLACE VIEW public.kkb_grid AS
SELECT
  campaign_day,
  campaign_date,
  campaign_type,
  language,
  call_id,
  phone,
  call_duration_seconds,
  data->>'call_datetime_ist'                                   AS call_datetime_ist,
  call_outcome,
  CASE WHEN call_answered  THEN 'Yes' ELSE 'No' END           AS call_answered,
  CASE WHEN call_engaged   THEN 'Yes' ELSE 'No' END           AS call_engaged,
  CASE WHEN applied_to_job THEN 'Yes' ELSE 'No' END           AS applied_to_job,
  applications_count,
  CASE WHEN lower(coalesce(data->>'jobs_shown','')) IN ('true','yes','1')
       THEN 'Yes' ELSE 'No' END                               AS jobs_shown,
  data->>'primary_topic'                                      AS primary_topic,
  coalesce(data->>'call_language', language)                  AS call_language,
  data->>'call_recording_url'                                 AS call_recording_url,
  data->>'final_summary'                                      AS final_summary,
  data->>'call_transcript'                                    AS call_transcript,
  CASE WHEN tried_to_apply THEN 'Yes' ELSE 'No' END           AS tried_to_apply,
  drop_reason,
  city_campaign,
  data->>'seeker_name'                                        AS seeker_name,
  data->>'user_intent'                                        AS user_intent,
  data->>'jobs_recommended'                                   AS jobs_recommended,
  data->>'jobs_applied'                                       AS jobs_applied,
  data->>'jobs_failed_to_apply'                               AS jobs_failed_to_apply,
  intent_score,
  data->>'Intent Score Reasoning'                             AS intent_score_reasoning
FROM public.call_rows
WHERE program = 'kkb';

COMMENT ON VIEW public.kkb_grid IS 'Read-only KKB master grid for NocoDB (Phase 1). Mirrors the Google Sheet 29-column layout.';