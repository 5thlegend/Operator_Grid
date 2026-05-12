-- NRO Public Intelligence Network · recruitment attribution.
-- Every operator dossier is a high-conversion landing page. When a cold
-- visitor enlists via @someone's URL, that recruitment is tracked. Recruiters
-- earn momentum when their recruits reach OPERATOR rank — aligned incentive
-- to share the network.
-- Idempotent.

alter table public.operators
  add column if not exists recruited_by uuid references public.operators(id) on delete set null,
  add column if not exists recruit_count integer not null default 0;

create index if not exists operators_recruited_by_idx on public.operators (recruited_by) where recruited_by is not null;

-- Maintain recruit_count denorm on the recruiter when a new operator with a recruited_by is inserted.
create or replace function public.on_operator_recruit_attribution()
returns trigger language plpgsql security definer as $$
begin
  if new.recruited_by is not null then
    update public.operators
      set recruit_count = recruit_count + 1,
          updated_at = now()
      where id = new.recruited_by;
  end if;
  return new;
end;
$$;

drop trigger if exists operators_recruit_attribution on public.operators;
create trigger operators_recruit_attribution
  after insert on public.operators
  for each row execute function public.on_operator_recruit_attribution();

-- Recruiter bonus: when a recruit ascends INITIATE → OPERATOR, the recruiter
-- gains +50 momentum (decay-windowed, so it actually shows up on the Grid).
create or replace function public.on_ascension_recruit_bonus()
returns trigger language plpgsql security definer as $$
declare
  recruiter_id uuid;
begin
  if new.from_rank = 'INITIATE' and new.to_rank = 'OPERATOR' then
    select recruited_by into recruiter_id from public.operators where id = new.operator_id;
    if recruiter_id is not null then
      update public.operators
        set momentum = momentum + 50,
            updated_at = now()
        where id = recruiter_id;
      insert into public.xp_log (operator_id, source_type, source_id, xp_delta, reason)
        values (recruiter_id, 'recruit_bonus', new.operator_id, 50, 'Recruit reached OPERATOR rank');
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists ascensions_recruit_bonus on public.ascensions;
create trigger ascensions_recruit_bonus
  after insert on public.ascensions
  for each row execute function public.on_ascension_recruit_bonus();

notify pgrst, 'reload schema';
