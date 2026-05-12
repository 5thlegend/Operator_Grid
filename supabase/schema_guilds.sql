-- NRO GUILDS v0.1 — Faction system: operators band together as guilds with
-- shared territory, color, sigil, and combined influence on the Signal Map.
-- Idempotent.

create table if not exists public.guilds (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  tagline text,
  description text,
  sigil text default '◈',
  color text default '#67e8f9',
  founder_id uuid references public.operators(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint slug_format check (slug ~ '^[a-z0-9-]{2,40}$'),
  constraint color_hex check (color ~ '^#[0-9a-fA-F]{6}$')
);

create index if not exists guilds_created_idx on public.guilds (created_at desc);

create table if not exists public.guild_members (
  guild_id uuid not null references public.guilds(id) on delete cascade,
  operator_id uuid not null references public.operators(id) on delete cascade,
  role text not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (guild_id, operator_id),
  constraint role_valid check (role in ('founder', 'officer', 'member'))
);

-- Enforce one guild per operator at a time.
create unique index if not exists guild_members_one_per_op on public.guild_members (operator_id);

-- =====================================================================
-- ROW-LEVEL SECURITY
-- =====================================================================
alter table public.guilds enable row level security;
alter table public.guild_members enable row level security;

drop policy if exists "guilds public read" on public.guilds;
create policy "guilds public read" on public.guilds for select using (true);

drop policy if exists "guilds founder write" on public.guilds;
create policy "guilds founder write" on public.guilds for all
  using (auth.uid() = founder_id) with check (auth.uid() = founder_id);

drop policy if exists "guild_members public read" on public.guild_members;
create policy "guild_members public read" on public.guild_members for select using (true);

-- Operators can join (insert their own row) or leave (delete their own row).
drop policy if exists "guild_members self join" on public.guild_members;
create policy "guild_members self join" on public.guild_members for insert with check (auth.uid() = operator_id);

drop policy if exists "guild_members self leave" on public.guild_members;
create policy "guild_members self leave" on public.guild_members for delete using (auth.uid() = operator_id);

-- =====================================================================
-- INFLUENCE METRICS — let operators report their real numbers manually
-- (we already have followers + active_users columns; just exposing them).
-- =====================================================================
-- Already exist from schema_signal_map.sql:
--   operators.followers integer
--   operators.active_users integer
-- These now feed directly into signal score / influence radius. The UI
-- exposes them as editable form fields so operators can be honest about
-- their actual reach across socials + products.

-- =====================================================================
-- PUBLICATION
-- =====================================================================
alter publication supabase_realtime add table public.guilds;
alter publication supabase_realtime add table public.guild_members;
