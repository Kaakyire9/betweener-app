with checks as (
  select
    exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'live_participants'
        and column_name = 'introduction_preference_decided_at'
    ) as explicit_preference_present,
    position(
      'introduction_preference_decided_at' in
      lower(pg_get_functiondef('public.rpc_set_live_introduction_availability(uuid,boolean)'::regprocedure))
    ) > 0 as preference_rpc_records_decision,
    position(
      'latest_hosted_pair_formation' in
      lower(pg_get_functiondef('public.rpc_get_live_private_activity_v1(uuid)'::regprocedure))
    ) > 0 as public_formation_present,
    position(
      'interval ''20 seconds''' in
      lower(pg_get_functiondef('public.rpc_get_live_private_activity_v1(uuid)'::regprocedure))
    ) > 0 as public_formation_time_limited
)
select *,
  explicit_preference_present
  and preference_rpc_records_decision
  and public_formation_present
  and public_formation_time_limited as healthy
from checks;
