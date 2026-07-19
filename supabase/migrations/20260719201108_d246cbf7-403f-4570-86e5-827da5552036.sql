create table if not exists public.north_star_config (
  program text not null,
  key text not null,
  threshold numeric,
  enabled boolean not null default true,
  sort int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (program, key)
);
alter table public.north_star_config enable row level security;
drop policy if exists "north_star_config read" on public.north_star_config;
create policy "north_star_config read" on public.north_star_config for select using (true);
drop policy if exists "north_star_config write" on public.north_star_config;
create policy "north_star_config write" on public.north_star_config for all using (true) with check (true);
grant select on public.north_star_config to anon, authenticated;
grant all on public.north_star_config to service_role;
insert into public.north_star_config (program, key, threshold, sort) values
  ('kkb','pickup_to_app', 9, 1),
  ('kkb','highintent_to_app', 35, 2),
  ('kkb','pickup_to_highintent', 40, 3),
  ('kkb','jobsshown_to_app', null, 4)
on conflict (program, key) do nothing;
notify pgrst, 'reload schema';