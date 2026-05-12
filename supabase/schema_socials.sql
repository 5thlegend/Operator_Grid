-- NRO socials migration: ecosystem-relevant social handles per operator.
-- Idempotent. Apply via Supabase Management API or SQL editor.

alter table public.operators
  add column if not exists link_youtube text,
  add column if not exists link_tiktok text,
  add column if not exists link_instagram text,
  add column if not exists link_linkedin text,
  add column if not exists link_discord text,
  add column if not exists link_farcaster text,
  add column if not exists link_producthunt text,
  add column if not exists link_substack text,
  add column if not exists link_telegram text;
