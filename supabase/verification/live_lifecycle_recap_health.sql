-- Betweener Live lifecycle completion and recap production health check.
-- Strictly read-only: no room is ended and no participant content is returned.

-- 1. Migration and RPC boundary.
select exists (
  select 1
  from supabase_migrations.schema_migrations migration
  where migration.version = '20260909110000'
) as migration_installed;

with expected(signature) as (values
  ('public.rpc_end_live_session_v1(uuid)'),
  ('public.rpc_get_live_session_recap_v1(uuid)')
), resolved as (
  select signature, to_regprocedure(signature) procedure_oid
  from expected
)
select
  signature,
  procedure_oid is not null as installed,
  case when procedure_oid is null then false
    else not has_function_privilege('anon', procedure_oid, 'EXECUTE')
      and has_function_privilege('authenticated', procedure_oid, 'EXECUTE')
  end as boundary_healthy
from resolved
order by signature;

-- 2. Rooms must not remain half-ended after the bounded client refresh window.
select
  count(*) filter (
    where status = 'ending'
      and updated_at < now() - interval '2 minutes'
  )::integer as stale_ending_rooms,
  count(*) filter (
    where status = 'ended'
      and ended_at is null
  )::integer as ended_without_timestamp
from public.live_sessions;

-- 3. Final release gate.
with migration_blockers as (
  select case when exists (
    select 1 from supabase_migrations.schema_migrations
    where version = '20260909110000'
  ) then 0::bigint else 1::bigint end affected
), boundary_blockers as (
  select count(*)::bigint affected
  from (values
    ('public.rpc_end_live_session_v1(uuid)'),
    ('public.rpc_get_live_session_recap_v1(uuid)')
  ) expected(signature)
  where to_regprocedure(expected.signature) is null
    or has_function_privilege('anon', to_regprocedure(expected.signature), 'EXECUTE')
    or not has_function_privilege('authenticated', to_regprocedure(expected.signature), 'EXECUTE')
), state_blockers as (
  select count(*)::bigint affected
  from public.live_sessions
  where (status = 'ending' and updated_at < now() - interval '2 minutes')
    or (status = 'ended' and ended_at is null)
), catalogue_blockers as (
  select case when to_regprocedure(
    'public.rpc_list_live_studio_sessions_v2(integer,timestamptz)'
  ) is not null and pg_get_functiondef(to_regprocedure(
    'public.rpc_list_live_studio_sessions_v2(integer,timestamptz)'
  )) ilike '%live_participants%'
    then 0::bigint else 1::bigint end affected
), totals as (
  select
    migration_blockers.affected migration_release_blockers,
    boundary_blockers.affected boundary_release_blockers,
    state_blockers.affected state_release_blockers,
    catalogue_blockers.affected catalogue_release_blockers
  from migration_blockers, boundary_blockers, state_blockers, catalogue_blockers
)
select *,
  migration_release_blockers + boundary_release_blockers
    + state_release_blockers + catalogue_release_blockers as release_blockers,
  migration_release_blockers + boundary_release_blockers
    + state_release_blockers + catalogue_release_blockers = 0 as healthy
from totals;
