-- NRO Wall-of-Work · portfolio metrics for projects.
-- Each operator's projects become a visual portfolio card on their dossier
-- with cover image, MRR/ARR, user count, monetization type, etc.
-- Idempotent.

do $$ begin
  create type monetization_kind as enum (
    'subscription',  -- recurring revenue (MRR/ARR)
    'lifetime',      -- one-shot purchase, lifetime access
    'whitelabel',    -- sold or licensed to another operator/org
    'acquired',      -- sold the whole product, no longer operated
    'open_source',   -- shipped publicly, no revenue
    'free'           -- public, free, no monetization yet
  );
exception when duplicate_object then null; end $$;

alter table public.projects
  add column if not exists cover_url text,
  add column if not exists monetization monetization_kind not null default 'free',
  add column if not exists mrr_cents bigint not null default 0,
  add column if not exists arr_cents bigint not null default 0,
  add column if not exists last_sale_cents bigint not null default 0,
  add column if not exists users_count integer not null default 0,
  add column if not exists currency text not null default 'USD',
  add column if not exists featured boolean not null default true,
  add column if not exists launched_at date,
  add column if not exists buyer text;  -- who bought it (for whitelabel/acquired)

-- For ordering portfolio (featured first, then highest revenue)
create index if not exists projects_featured_idx on public.projects (operator_id, featured desc, mrr_cents desc);

-- Force PostgREST to reload its schema cache
notify pgrst, 'reload schema';
