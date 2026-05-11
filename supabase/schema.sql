-- NRO OPERATOR CORE v0.1 — Supabase schema
-- Apply this in your Supabase SQL editor in one paste.

-- =====================================================================
-- EXTENSIONS
-- =====================================================================
create extension if not exists "pgcrypto";
create extension if not exists "citext";

-- =====================================================================
-- TYPES
-- =====================================================================
do $$ begin
  create type rank_tier as enum ('INITIATE', 'OPERATOR', 'ARCHITECT', 'COMMANDER', 'SOVEREIGN');
exception when duplicate_object then null; end $$;

do $$ begin
  create type deployment_kind as enum ('iteration', 'ship', 'milestone', 'launch');
exception when duplicate_object then null; end $$;

do $$ begin
  create type project_status as enum ('active', 'launched', 'archived');
exception when duplicate_object then null; end $$;

-- =====================================================================
-- OPERATORS
-- Each row is a public dossier. Linked 1:1 with auth.users.
-- =====================================================================
create table if not exists public.operators (
  id uuid primary key references auth.users(id) on delete cascade,
  handle citext unique not null,
  display_name text not null,
  avatar_url text,
  tagline text,
  bio text,
  location text,
  link_site text,
  link_x text,
  link_github text,
  current_project text,
  rank rank_tier not null default 'INITIATE',
  xp integer not null default 0,
  momentum integer not null default 0,
  streak_days integer not null default 0,
  last_deployment_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint handle_format check (handle ~ '^[a-z0-9_]{2,24}$')
);

create index if not exists operators_xp_idx on public.operators (xp desc);
create index if not exists operators_momentum_idx on public.operators (momentum desc);
create index if not exists operators_created_at_idx on public.operators (created_at desc);

-- =====================================================================
-- PROJECTS
-- =====================================================================
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  operator_id uuid not null references public.operators(id) on delete cascade,
  slug text not null,
  name text not null,
  tagline text,
  description text,
  status project_status not null default 'active',
  stack text[] not null default '{}',
  link_live text,
  link_repo text,
  cover_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (operator_id, slug),
  constraint slug_format check (slug ~ '^[a-z0-9-]{2,40}$')
);

create index if not exists projects_operator_idx on public.projects (operator_id, created_at desc);

-- =====================================================================
-- DEPLOYMENTS
-- The living build-in-public log.
-- =====================================================================
create table if not exists public.deployments (
  id uuid primary key default gen_random_uuid(),
  operator_id uuid not null references public.operators(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  kind deployment_kind not null default 'iteration',
  title text not null,
  description text,
  url text,
  screenshot_url text,
  xp_awarded integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists deployments_operator_idx on public.deployments (operator_id, created_at desc);
create index if not exists deployments_created_at_idx on public.deployments (created_at desc);
create index if not exists deployments_project_idx on public.deployments (project_id, created_at desc);

-- =====================================================================
-- XP LOG (audit trail)
-- =====================================================================
create table if not exists public.xp_log (
  id uuid primary key default gen_random_uuid(),
  operator_id uuid not null references public.operators(id) on delete cascade,
  source_type text not null,
  source_id uuid,
  xp_delta integer not null,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists xp_log_operator_idx on public.xp_log (operator_id, created_at desc);

-- =====================================================================
-- FUNCTIONS
-- =====================================================================

-- XP per deployment kind. Single source of truth.
create or replace function public.xp_for_kind(k deployment_kind)
returns integer language sql immutable as $$
  select case k
    when 'iteration' then 10
    when 'ship' then 25
    when 'milestone' then 50
    when 'launch' then 100
  end;
$$;

-- Compute rank from total XP. Tier thresholds match src/lib/ranks.ts.
create or replace function public.rank_for_xp(total_xp integer)
returns rank_tier language sql immutable as $$
  select case
    when total_xp >= 8000 then 'SOVEREIGN'::rank_tier
    when total_xp >= 3000 then 'COMMANDER'::rank_tier
    when total_xp >= 1000 then 'ARCHITECT'::rank_tier
    when total_xp >= 250 then 'OPERATOR'::rank_tier
    else 'INITIATE'::rank_tier
  end;
$$;

-- Momentum = sum of XP from deployments in the last 14 days.
-- Recomputed lazily on each new deployment for the affected operator.
create or replace function public.recompute_momentum(op_id uuid)
returns integer language plpgsql as $$
declare
  m integer;
begin
  select coalesce(sum(xp_awarded), 0)
    into m
    from public.deployments
    where operator_id = op_id
      and created_at > now() - interval '14 days';

  update public.operators
    set momentum = m,
        updated_at = now()
    where id = op_id;

  return m;
end;
$$;

-- On new deployment: stamp XP, update operator totals, streak, momentum, rank.
create or replace function public.on_deployment_insert()
returns trigger language plpgsql security definer as $$
declare
  op record;
  new_xp integer;
  awarded integer;
  new_streak integer;
  last_day date;
  today date := (now() at time zone 'utc')::date;
  new_rank rank_tier;
  old_rank rank_tier;
begin
  awarded := public.xp_for_kind(new.kind);
  new.xp_awarded := awarded;

  select * into op from public.operators where id = new.operator_id for update;
  if not found then
    raise exception 'operator % not found', new.operator_id;
  end if;

  -- streak: +1 if last deployment was yesterday, reset to 1 if older or first ever
  last_day := (op.last_deployment_at at time zone 'utc')::date;
  if last_day is null then
    new_streak := 1;
  elsif last_day = today then
    new_streak := op.streak_days; -- same day, no change
  elsif last_day = today - 1 then
    new_streak := op.streak_days + 1;
  else
    new_streak := 1;
  end if;

  new_xp := op.xp + awarded;
  old_rank := op.rank;
  new_rank := public.rank_for_xp(new_xp);

  update public.operators
    set xp = new_xp,
        rank = new_rank,
        streak_days = new_streak,
        last_deployment_at = now(),
        updated_at = now()
    where id = new.operator_id;

  insert into public.xp_log (operator_id, source_type, source_id, xp_delta, reason)
    values (new.operator_id, 'deployment', new.id, awarded, new.kind::text || ': ' || new.title);

  -- recompute momentum after the row exists; defer via after trigger pattern is overkill — do it inline
  return new;
end;
$$;

drop trigger if exists deployments_before_insert on public.deployments;
create trigger deployments_before_insert
  before insert on public.deployments
  for each row execute function public.on_deployment_insert();

create or replace function public.on_deployment_after_insert()
returns trigger language plpgsql security definer as $$
begin
  perform public.recompute_momentum(new.operator_id);
  return new;
end;
$$;

drop trigger if exists deployments_after_insert on public.deployments;
create trigger deployments_after_insert
  after insert on public.deployments
  for each row execute function public.on_deployment_after_insert();

-- updated_at touch helper
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists operators_touch on public.operators;
create trigger operators_touch before update on public.operators
  for each row execute function public.touch_updated_at();

drop trigger if exists projects_touch on public.projects;
create trigger projects_touch before update on public.projects
  for each row execute function public.touch_updated_at();

-- =====================================================================
-- ROW-LEVEL SECURITY
-- Public read for everything; writes scoped to the owning operator.
-- =====================================================================
alter table public.operators enable row level security;
alter table public.projects enable row level security;
alter table public.deployments enable row level security;
alter table public.xp_log enable row level security;

-- operators
drop policy if exists "operators public read" on public.operators;
create policy "operators public read" on public.operators for select using (true);

drop policy if exists "operators self insert" on public.operators;
create policy "operators self insert" on public.operators for insert with check (auth.uid() = id);

drop policy if exists "operators self update" on public.operators;
create policy "operators self update" on public.operators for update using (auth.uid() = id);

-- projects
drop policy if exists "projects public read" on public.projects;
create policy "projects public read" on public.projects for select using (true);

drop policy if exists "projects self write" on public.projects;
create policy "projects self write" on public.projects for all
  using (auth.uid() = operator_id) with check (auth.uid() = operator_id);

-- deployments
drop policy if exists "deployments public read" on public.deployments;
create policy "deployments public read" on public.deployments for select using (true);

drop policy if exists "deployments self insert" on public.deployments;
create policy "deployments self insert" on public.deployments for insert with check (auth.uid() = operator_id);

drop policy if exists "deployments self delete" on public.deployments;
create policy "deployments self delete" on public.deployments for delete using (auth.uid() = operator_id);

-- xp_log: read-only to owner, written by triggers
drop policy if exists "xp_log self read" on public.xp_log;
create policy "xp_log self read" on public.xp_log for select using (auth.uid() = operator_id);

-- =====================================================================
-- REALTIME
-- Stream new deployments to the live ticker.
-- =====================================================================
do $$ begin
  perform 1 from pg_publication where pubname = 'supabase_realtime';
  if not found then
    create publication supabase_realtime;
  end if;
end $$;

alter publication supabase_realtime add table public.deployments;
alter publication supabase_realtime add table public.operators;
