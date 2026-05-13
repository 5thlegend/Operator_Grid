-- Backfill ascension records for seeded operators whose rank was set directly
-- by the seed script (bypassing the deployment trigger that normally logs ascensions).
-- Walks each operator's deployments in created_at order, recomputes cumulative XP,
-- and inserts ascension events at the moment XP crossed each rank threshold.

with rank_thresholds(rank, threshold) as (
  values
    ('INITIATE'::rank_tier, 0),
    ('OPERATOR'::rank_tier, 250),
    ('ARCHITECT'::rank_tier, 1000),
    ('COMMANDER'::rank_tier, 3000),
    ('SOVEREIGN'::rank_tier, 8000)
),
cum as (
  select d.operator_id,
         d.created_at,
         d.xp_awarded,
         sum(d.xp_awarded) over (partition by d.operator_id order by d.created_at) as cum_xp
    from public.deployments d
),
walk as (
  select operator_id, created_at, xp_awarded, cum_xp,
         lag(cum_xp) over (partition by operator_id order by created_at) as prev_cum
    from cum
),
crossings as (
  select w.operator_id,
         w.created_at,
         w.cum_xp,
         coalesce(w.prev_cum, 0) as prev_cum,
         rt.rank as to_rank,
         rt.threshold
    from walk w
    join rank_thresholds rt
      on rt.threshold > coalesce(w.prev_cum, 0)
     and rt.threshold <= w.cum_xp
     and rt.rank <> 'INITIATE'
),
with_prev as (
  select c.operator_id, c.created_at, c.cum_xp, c.to_rank, c.threshold,
         coalesce(
           (select rt2.rank
              from rank_thresholds rt2
             where rt2.threshold < c.threshold
             order by rt2.threshold desc limit 1),
           'INITIATE'::rank_tier
         ) as from_rank
    from crossings c
)
insert into public.ascensions (operator_id, from_rank, to_rank, at_xp, created_at)
select operator_id, from_rank, to_rank, cum_xp, created_at
  from with_prev
 where not exists (
   select 1 from public.ascensions a
    where a.operator_id = with_prev.operator_id
      and a.from_rank = with_prev.from_rank
      and a.to_rank = with_prev.to_rank
 );

-- Recompute streak_days from actual deployment-date history. An operator's
-- streak = consecutive trailing days ending on their most recent deployment.
with deploy_days as (
  select distinct operator_id,
         (created_at at time zone 'utc')::date as day
    from public.deployments
),
last_day as (
  select operator_id, max(day) as last_day
    from deploy_days
   group by operator_id
),
ranked as (
  select d.operator_id, d.day,
         d.day - (row_number() over (partition by d.operator_id order by d.day))::int as grp
    from deploy_days d
),
trailing_group as (
  select r.operator_id, r.grp
    from ranked r
    join last_day l on l.operator_id = r.operator_id and r.day = l.last_day
),
streak as (
  select r.operator_id, count(*) as streak_days
    from ranked r
    join trailing_group t on t.operator_id = r.operator_id and r.grp = t.grp
   group by r.operator_id
)
update public.operators o
   set streak_days = s.streak_days,
       updated_at = now()
  from streak s
 where s.operator_id = o.id;

select 'backfill done' as status,
       (select count(*) from public.ascensions) as ascensions_now,
       (select count(*) from public.operators where streak_days > 1) as ops_with_real_streak;
