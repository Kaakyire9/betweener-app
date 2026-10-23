with checks as (
  select
    exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'live_quick_connect_pairings'
        and column_name = 'public_formation_starts_at'
        and data_type = 'timestamp with time zone'
    ) as formation_clock_present,
    exists (
      select 1
      from pg_trigger
      where tgrelid = 'public.live_quick_connect_pairings'::regclass
        and tgname = 'live_quick_schedule_public_formation'
        and tgenabled <> 'D'
    ) as formation_scheduler_present,
    position(
      'pg_advisory_xact_lock' in lower(pg_get_functiondef(
        'public.schedule_live_quick_connect_public_formation()'::regprocedure
      ))
    ) > 0 as scheduler_serialized,
    position(
      'public_formations' in lower(pg_get_functiondef(
        'public.rpc_get_live_quick_connect_pool(uuid)'::regprocedure
      ))
    ) > 0 as public_projection_present,
    position(
      'live_quick_connect_interests' in lower(pg_get_functiondef(
        'public.rpc_get_live_quick_connect_pool(uuid)'::regprocedure
      ))
    ) > 0 as private_interest_contract_preserved,
    has_function_privilege(
      'authenticated',
      'public.rpc_get_live_quick_connect_pool(uuid)',
      'execute'
    ) as authenticated_execute_present,
    not has_function_privilege(
      'anon',
      'public.rpc_get_live_quick_connect_pool(uuid)',
      'execute'
    ) as anonymous_execute_denied
)
select
  *,
  formation_clock_present
    and formation_scheduler_present
    and scheduler_serialized
    and public_projection_present
    and private_interest_contract_preserved
    and authenticated_execute_present
    and anonymous_execute_denied as healthy
from checks;
