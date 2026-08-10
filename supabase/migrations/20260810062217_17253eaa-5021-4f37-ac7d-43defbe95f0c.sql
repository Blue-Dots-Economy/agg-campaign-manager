create extension if not exists "pgcrypto";
create table if not exists public.campaign_requests (
  id uuid primary key default gen_random_uuid(),
  program text not null,
  agent_id text not null,
  agent_name text,
  batch_name text not null,
  campaign_day text,
  campaign_date text,
  campaign_type text,
  region text,
  language text,
  city_campaign text,
  channel text default 'outbound',
  source text,
  cohort_intent text,
  cohort_filters jsonb,
  contacts jsonb not null default '[]'::jsonb,
  contact_count integer not null default 0,
  schedule jsonb,
  concurrency integer,
  max_retries integer,
  retry_after_hrs integer,
  selected_statuses jsonb,
  requested_by text,
  status text not null default 'pending',
  reviewer_email text,
  decline_reason text,
  batch_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.campaign_requests enable row level security;
create policy "campaign_requests read" on public.campaign_requests for select using (true);
create policy "campaign_requests insert" on public.campaign_requests for insert with check (true);
create policy "campaign_requests update" on public.campaign_requests for update using (true);
grant select, insert, update on public.campaign_requests to anon, authenticated, service_role;