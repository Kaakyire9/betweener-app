with checks as (
  select
    to_regprocedure('public.cleanup_live_operational_events_v1(integer)') is not null
      as cleanup_function_present,
    not has_function_privilege(
      'authenticated',
      'public.cleanup_live_operational_events_v1(integer)',
      'execute'
    ) as client_execute_denied,
    exists (
      select 1 from pg_indexes
      where schemaname = 'public'
        and indexname = 'live_session_events_retention_idx'
    ) as session_retention_index_present,
    exists (
      select 1 from pg_indexes
      where schemaname = 'public'
        and indexname = 'live_odo_trace_events_retention_idx'
    ) as trace_retention_index_present,
    exists (
      select 1 from pg_indexes
      where schemaname = 'public'
        and indexname = 'live_program_audio_events_retention_idx'
    ) as audio_retention_index_present,
    case
      when to_regclass('cron.job') is null then true
      else exists (
        select 1 from cron.job
        where jobname = 'live-operational-event-retention'
          and schedule = '17 * * * *'
          and command = 'select public.cleanup_live_operational_events_v1(5000);'
      )
    end as cleanup_clock_present
)
select
  *,
  cleanup_function_present
    and client_execute_denied
    and session_retention_index_present
    and trace_retention_index_present
    and audio_retention_index_present
    and cleanup_clock_present as healthy
from checks;
