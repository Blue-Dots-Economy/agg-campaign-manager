create extension if not exists pgcrypto;

create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  name text,
  role text not null check (role in ('admin','jfc','owner','coordinator','ecosystem','user')),
  district text,
  program text,
  node_type text,
  node_name text,
  password_hash text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.app_users enable row level security;
grant select, insert, update on public.app_users to service_role;

insert into public.app_users (email, name, role, password_hash) values
  ('admin@bluedots.com','Admin','admin', crypt('456789', gen_salt('bf'))),
  ('sanketika@bluedots.com','Sanketika','admin', crypt('456789', gen_salt('bf'))),
  ('aggregator-coordinator@bluedots.com','Aggregator Coordinator','admin', crypt('456789', gen_salt('bf'))),
  ('aggregator-owner@bluedots.com','Aggregator Owner','admin', crypt('456789', gen_salt('bf'))),
  ('ecosystem@bluedots.com','Ecosystem','ecosystem', crypt('456789', gen_salt('bf')))
on conflict (email) do nothing;

insert into public.app_users (email, role)
select lower(email), 'user' from public.reviewers
on conflict (email) do nothing;

create or replace function public.app_user_login(_email text, _password text default null)
returns table(email text, name text, role text, district text, program text, node_type text, node_name text)
language sql stable security definer set search_path = public, extensions as $$
  select u.email, u.name, u.role, u.district, u.program, u.node_type, u.node_name
  from public.app_users u
  where u.active and u.email = lower(btrim(_email))
    and (u.password_hash is null or (_password is not null and crypt(_password, u.password_hash) = u.password_hash))
  limit 1;
$$;

create or replace function public.upsert_app_user(
  _email text, _name text, _role text, _district text, _program text,
  _node_type text, _node_name text, _password text default null, _active boolean default true
) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare _id uuid;
begin
  insert into public.app_users (email, name, role, district, program, node_type, node_name, active, password_hash, updated_at)
  values (lower(btrim(_email)), nullif(_name,''), _role, nullif(_district,''), nullif(_program,''),
          nullif(_node_type,''), nullif(_node_name,''), _active,
          case when _password is null or _password = '' then null else crypt(_password, gen_salt('bf')) end, now())
  on conflict (email) do update set
    name = nullif(_name,''), role = _role, district = nullif(_district,''), program = nullif(_program,''),
    node_type = nullif(_node_type,''), node_name = nullif(_node_name,''), active = _active,
    password_hash = case when _password is null or _password = '' then public.app_users.password_hash else crypt(_password, gen_salt('bf')) end,
    updated_at = now()
  returning id into _id;
  return _id;
end $$;

grant execute on function public.app_user_login(text,text) to service_role;
grant execute on function public.upsert_app_user(text,text,text,text,text,text,text,text,boolean) to service_role;
notify pgrst, 'reload schema';