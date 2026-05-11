-- NRO SIGNAL MAP v0.1 — Schema additions on top of schema.sql
-- Idempotent. Apply after schema.sql.

-- =====================================================================
-- OPERATOR LOCATION + SIGNAL FIELDS
-- =====================================================================
alter table public.operators
  add column if not exists city text,
  add column if not exists state text,
  add column if not exists country text default 'US',
  add column if not exists lat double precision,
  add column if not exists lng double precision,
  add column if not exists signal_score numeric(6,2) not null default 0,
  add column if not exists followers integer not null default 0,
  add column if not exists active_users integer not null default 0;

create index if not exists operators_geo_idx on public.operators (lat, lng) where lat is not null and lng is not null;
create index if not exists operators_signal_idx on public.operators (signal_score desc);

-- =====================================================================
-- DEPLOYMENT IMPACT FIELDS
-- =====================================================================
alter table public.deployments
  add column if not exists impact_score numeric(6,2) not null default 0,
  add column if not exists event_color text,
  add column if not exists pulse_strength integer not null default 1;

-- =====================================================================
-- ASCENSION LOG — every rank-up emits an event for the live overlay.
-- =====================================================================
create table if not exists public.ascensions (
  id uuid primary key default gen_random_uuid(),
  operator_id uuid not null references public.operators(id) on delete cascade,
  from_rank rank_tier not null,
  to_rank rank_tier not null,
  at_xp integer not null,
  created_at timestamptz not null default now()
);

create index if not exists ascensions_recent_idx on public.ascensions (created_at desc);

alter table public.ascensions enable row level security;
drop policy if exists "ascensions public read" on public.ascensions;
create policy "ascensions public read" on public.ascensions for select using (true);

-- =====================================================================
-- FUNCTIONS
-- =====================================================================

-- Pulse strength: maps deployment kind to a radar-ping intensity 1..4
create or replace function public.pulse_strength_for_kind(k deployment_kind)
returns integer language sql immutable as $$
  select case k
    when 'iteration' then 1
    when 'ship' then 2
    when 'milestone' then 3
    when 'launch' then 4
  end;
$$;

-- Event color hex: cyan, blue, violet, gold, red (red reserved for system alerts)
create or replace function public.event_color_for_kind(k deployment_kind)
returns text language sql immutable as $$
  select case k
    when 'iteration' then '#7dd3fc'
    when 'ship' then '#67e8f9'
    when 'milestone' then '#a78bfa'
    when 'launch' then '#fbbf24'
  end;
$$;

-- Signal Score formula. Public ecosystem-prestige metric.
-- Bounded to a 0..10 scale (similar to MTG/Riot). Logarithmic to reward longevity.
create or replace function public.compute_signal_score(op_id uuid)
returns numeric language plpgsql as $$
declare
  m integer;        -- momentum (14d xp)
  f integer;        -- followers
  u integer;        -- active users
  d integer;        -- deployments total
  raw numeric;
  score numeric;
begin
  select coalesce(momentum, 0), coalesce(followers, 0), coalesce(active_users, 0)
    into m, f, u
    from public.operators where id = op_id;
  select coalesce(count(*), 0) into d from public.deployments where operator_id = op_id;

  raw := (m * 0.40) + (f * 0.20) + (u * 0.30) + (d * 0.10);

  -- log10-ish compression to a 0..10 band; tuned so:
  -- 100 raw → ~5.0  ·  1000 raw → ~7.5  ·  10000 raw → ~10.0
  if raw <= 0 then
    score := 0;
  else
    score := least(10, 2.5 * log(10, raw + 1));
  end if;

  update public.operators
    set signal_score = round(score, 2),
        updated_at = now()
    where id = op_id;

  return score;
end;
$$;

-- Extend deployment-insert triggers to stamp impact / pulse / color and recompute signal.
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
  new.pulse_strength := public.pulse_strength_for_kind(new.kind);
  new.event_color := public.event_color_for_kind(new.kind);
  new.impact_score := awarded; -- v0.1: impact == xp; refine later

  select * into op from public.operators where id = new.operator_id for update;
  if not found then
    raise exception 'operator % not found', new.operator_id;
  end if;

  last_day := (op.last_deployment_at at time zone 'utc')::date;
  if last_day is null then
    new_streak := 1;
  elsif last_day = today then
    new_streak := op.streak_days;
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

  -- ASCENSION EVENT
  if new_rank <> old_rank then
    insert into public.ascensions (operator_id, from_rank, to_rank, at_xp)
      values (new.operator_id, old_rank, new_rank, new_xp);
  end if;

  return new;
end;
$$;

-- Extend the after-insert trigger to also recompute signal score.
create or replace function public.on_deployment_after_insert()
returns trigger language plpgsql security definer as $$
begin
  perform public.recompute_momentum(new.operator_id);
  perform public.compute_signal_score(new.operator_id);
  return new;
end;
$$;

-- =====================================================================
-- REALTIME
-- =====================================================================
alter publication supabase_realtime add table public.ascensions;
