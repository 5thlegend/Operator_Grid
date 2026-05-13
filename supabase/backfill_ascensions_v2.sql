-- Simpler ascension backfill: for each seeded operator above INITIATE, write
-- one ascension row per rank tier they passed through. Spread timestamps
-- across their deployment date span so the tactical feed shows real history.
with rt(rank, threshold, ord) as (
  values
    ('INITIATE'::rank_tier, 0, 0),
    ('OPERATOR'::rank_tier, 250, 1),
    ('ARCHITECT'::rank_tier, 1000, 2),
    ('COMMANDER'::rank_tier, 3000, 3),
    ('SOVEREIGN'::rank_tier, 8000, 4)
),
op_span as (
  select o.id as operator_id,
         o.rank as current_rank,
         o.xp,
         coalesce((select min(created_at) from public.deployments d where d.operator_id = o.id),
                  o.created_at) as first_at,
         coalesce((select max(created_at) from public.deployments d where d.operator_id = o.id),
                  o.created_at) as last_at
    from public.operators o
   where o.rank <> 'INITIATE'
),
expand as (
  select op.operator_id,
         rt_to.rank as to_rank,
         rt_from.rank as from_rank,
         rt_to.threshold,
         op.first_at,
         op.last_at,
         rt_to.ord
    from op_span op
    join rt rt_to on rt_to.ord <= (select rt2.ord from rt rt2 where rt2.rank = op.current_rank)
                  and rt_to.ord > 0
    join rt rt_from on rt_from.ord = rt_to.ord - 1
)
insert into public.ascensions (operator_id, from_rank, to_rank, at_xp, created_at)
select e.operator_id,
       e.from_rank,
       e.to_rank,
       e.threshold,
       e.first_at + (e.last_at - e.first_at) * (e.ord::float / 5.0)
  from expand e
 where not exists (
   select 1 from public.ascensions a
    where a.operator_id = e.operator_id
      and a.from_rank = e.from_rank
      and a.to_rank = e.to_rank
 );

select (select count(*) from public.ascensions) as total_ascensions,
       (select count(distinct operator_id) from public.ascensions) as ops_with_history;
