-- Live Creation Studio production health check.
-- Strictly read-only. Every *_healthy result must be true and every blocker
-- count must be zero.

-- 1. Expand/index/validation migration sequence.
with expected(version, purpose) as (
  values
    ('20260906170000', 'expand-only Studio lifecycle'),
    ('20260906171000', 'concurrent Studio indexes'),
    ('20260906172000', 'online Studio constraint validation')
)
select
  expected.version,
  expected.purpose,
  exists (
    select 1 from supabase_migrations.schema_migrations migration
    where migration.version = expected.version
  ) as installed
from expected
order by expected.version;

-- 2. Installation and authenticated execution boundaries.
with expected(name, signature) as (
  values
    ('publish', 'public.rpc_schedule_live_studio_session_v1(uuid,text,text,timestamptz,integer,text,boolean,uuid,integer)'),
    ('update', 'public.rpc_update_live_studio_session_v1(uuid,bigint,text,text,timestamptz,integer,boolean,integer)'),
    ('cancel', 'public.rpc_cancel_live_studio_session_v1(uuid,bigint,text)'),
    ('archive', 'public.rpc_archive_live_studio_session_v1(uuid,bigint)'),
    ('catalogue v2', 'public.rpc_list_live_studio_sessions_v2(integer,timestamptz)')
), resolved as (
  select expected.*, to_regprocedure(expected.signature) as procedure_oid
  from expected
)
select
  resolved.name,
  resolved.procedure_oid is not null as installed,
  case when resolved.procedure_oid is null then false else
    has_function_privilege('authenticated', resolved.procedure_oid, 'EXECUTE')
    and not has_function_privilege('anon', resolved.procedure_oid, 'EXECUTE')
    and not has_function_privilege('public', resolved.procedure_oid, 'EXECUTE')
  end as execution_boundary_healthy
from resolved
order by resolved.name;

-- 3. Schema and query contract.
select
  to_regprocedure(
    'public.rpc_list_live_studio_sessions(integer,timestamptz)'
  ) is not null
    and pg_get_function_result(to_regprocedure(
      'public.rpc_list_live_studio_sessions(integer,timestamptz)'
    )) not like '%schedule_revision%'
    as production_v1_1_1_catalogue_healthy,
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'live_sessions'
      and column_name = 'creation_request_id'
  ) as request_identity_installed,
  exists (
    select 1 from pg_index index_metadata
    where index_metadata.indexrelid =
      to_regclass('public.live_sessions_creator_request_unique_idx')
      and index_metadata.indisunique
      and index_metadata.indisvalid
      and index_metadata.indisready
  ) as request_idempotency_healthy,
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'live_sessions'
      and column_name = 'schedule_revision' and is_nullable = 'NO'
  ) as schedule_revision_installed,
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'live_sessions'
      and column_name = 'archived_at'
  ) as owner_archive_installed,
  pg_get_functiondef('public.rpc_update_live_studio_session_v1(uuid,bigint,text,text,timestamptz,integer,boolean,integer)'::regprocedure)
    like '%needs_reconfirmation%' as reschedule_reconfirmation_healthy,
  pg_get_functiondef('public.rpc_cancel_live_studio_session_v1(uuid,bigint,text)'::regprocedure)
    like '%private.send_push_webhook%' as cancellation_notification_healthy;

-- 4. Data integrity blockers.
with blockers as (
  select 'invalid_duration_or_end_time'::text as blocker, count(*)::bigint as affected
  from public.live_sessions session
  where session.creation_request_id is not null
    and (session.scheduled_duration_minutes not between 30 and 180
     or (
       session.scheduled_start is not null
       and session.scheduled_end is distinct from
         session.scheduled_start + make_interval(mins => session.scheduled_duration_minutes)
     ))

  union all

  select 'cancelled_without_outcome', count(*)
  from public.live_sessions session
  where session.status = 'cancelled'
    and exists (
      select 1 from public.live_session_events event_row
      where event_row.session_id = session.id
        and event_row.event_type = 'studio_session_cancelled'
    )
    and (session.cancelled_at is null or session.cancellation_reason is null)

  union all

  select 'active_room_is_archived', count(*)
  from public.live_sessions session
  where session.archived_at is not null
    and session.status not in ('ended', 'cancelled')

  union all

  select 'reconfirmation_without_revision', count(*)
  from public.live_participants participant
  join public.live_sessions session on session.id = participant.session_id
  where participant.rsvp_status = 'needs_reconfirmation'
    and session.schedule_revision = 0

  union all

  select 'linked_gathering_schedule_drift', count(*)
  from public.live_sessions session
  join public.gatherings gathering on gathering.live_session_id = session.id
  where gathering.title is distinct from session.title
     or gathering.description is distinct from session.description
     or gathering.starts_at is distinct from session.scheduled_start
     or gathering.ends_at is distinct from session.scheduled_end
     or (session.status = 'cancelled' and gathering.status <> 'cancelled')
)
select blocker, affected, affected = 0 as healthy
from blockers
order by blocker;

-- 5. Final release gate.
with contract as (
  select
    not exists (
      select 1 from (values
        ('20260906170000'),
        ('20260906171000'),
        ('20260906172000')
      ) expected(version)
      where not exists (
        select 1 from supabase_migrations.schema_migrations migration
        where migration.version = expected.version
      )
    )
    and to_regprocedure('public.rpc_schedule_live_studio_session_v1(uuid,text,text,timestamptz,integer,text,boolean,uuid,integer)') is not null
    and to_regprocedure('public.rpc_update_live_studio_session_v1(uuid,bigint,text,text,timestamptz,integer,boolean,integer)') is not null
    and to_regprocedure('public.rpc_cancel_live_studio_session_v1(uuid,bigint,text)') is not null
    and to_regprocedure('public.rpc_archive_live_studio_session_v1(uuid,bigint)') is not null
    and to_regprocedure('public.rpc_list_live_studio_sessions_v2(integer,timestamptz)') is not null
    and to_regprocedure('public.rpc_list_live_studio_sessions(integer,timestamptz)') is not null
    and pg_get_function_result(to_regprocedure(
      'public.rpc_list_live_studio_sessions(integer,timestamptz)'
    )) not like '%schedule_revision%'
    and to_regclass('public.live_sessions_creator_request_unique_idx') is not null
    as healthy
), blockers as (
  select count(*)::bigint as affected
  from public.live_sessions session
  where (session.creation_request_id is not null and (
      session.scheduled_duration_minutes not between 30 and 180
      or session.scheduled_end is distinct from
        session.scheduled_start
          + make_interval(mins => session.scheduled_duration_minutes)
    ))
     or (session.status = 'cancelled'
       and exists (
         select 1 from public.live_session_events event_row
         where event_row.session_id = session.id
           and event_row.event_type = 'studio_session_cancelled'
       )
       and (session.cancelled_at is null or session.cancellation_reason is null))
     or (session.archived_at is not null
       and session.status not in ('ended', 'cancelled'))
     or exists (
       select 1 from public.live_participants participant
       where participant.session_id = session.id
         and participant.rsvp_status = 'needs_reconfirmation'
         and session.schedule_revision = 0
     )
)
select
  contract.healthy as compatibility_contract_healthy,
  blockers.affected as release_blockers,
  contract.healthy and blockers.affected = 0 as healthy
from contract, blockers;
