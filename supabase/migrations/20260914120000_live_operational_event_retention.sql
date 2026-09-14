begin;

create index if not exists live_session_events_retention_idx
  on public.live_session_events(created_at, id);
create index if not exists live_odo_trace_events_retention_idx
  on public.live_odo_trace_events(created_at, id);
create index if not exists live_program_audio_events_retention_idx
  on public.live_program_audio_events(created_at, id);

create or replace function public.cleanup_live_operational_events_v1(
  p_batch_size integer default 5000
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_trace_deleted integer := 0;
  v_audio_deleted integer := 0;
  v_session_deleted integer := 0;
begin
  if current_user <> 'postgres' and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'live_operational_cleanup_forbidden' using errcode = '42501';
  end if;
  if p_batch_size not between 100 and 10000 then
    raise exception 'live_operational_cleanup_batch_invalid' using errcode = '22023';
  end if;

  with doomed as (
    select trace.id
    from public.live_odo_trace_events trace
    where trace.created_at < timezone('utc', now()) - interval '30 days'
    order by trace.created_at, trace.id
    limit p_batch_size
    for update skip locked
  )
  delete from public.live_odo_trace_events trace
  using doomed
  where trace.id = doomed.id;
  get diagnostics v_trace_deleted = row_count;

  with doomed as (
    select audio.id
    from public.live_program_audio_events audio
    where audio.created_at < timezone('utc', now()) - interval '30 days'
    order by audio.created_at, audio.id
    limit p_batch_size
    for update skip locked
  )
  delete from public.live_program_audio_events audio
  using doomed
  where audio.id = doomed.id;
  get diagnostics v_audio_deleted = row_count;

  with doomed as (
    select session_event.id
    from public.live_session_events session_event
    join public.live_sessions session on session.id = session_event.session_id
    where session_event.created_at < timezone('utc', now()) - interval '365 days'
      and session.status in ('ended', 'cancelled')
      and not exists (
        select 1
        from public.live_reports report
        where report.session_id = session_event.session_id
          and report.status in ('open', 'reviewing')
      )
    order by session_event.created_at, session_event.id
    limit p_batch_size
    for update of session_event skip locked
  )
  delete from public.live_session_events session_event
  using doomed
  where session_event.id = doomed.id;
  get diagnostics v_session_deleted = row_count;

  return jsonb_build_object(
    'odoTraceDeleted', v_trace_deleted,
    'programAudioDeleted', v_audio_deleted,
    'sessionEventsDeleted', v_session_deleted
  );
end;
$$;

revoke all on function public.cleanup_live_operational_events_v1(integer)
from public, anon, authenticated;
grant execute on function public.cleanup_live_operational_events_v1(integer)
to service_role;

do $$
declare
  v_job record;
begin
  if to_regprocedure('cron.schedule(text,text,text)') is null then
    raise notice 'pg_cron unavailable; Live operational retention must be invoked externally.';
    return;
  end if;

  for v_job in select jobid from cron.job where jobname = 'live-operational-event-retention'
  loop
    perform cron.unschedule(v_job.jobid);
  end loop;

  perform cron.schedule(
    'live-operational-event-retention',
    '17 * * * *',
    'select public.cleanup_live_operational_events_v1(5000);'
  );
end;
$$;

comment on function public.cleanup_live_operational_events_v1(integer) is
  'Bounded retention for Live operational traces; preserves unresolved safety investigations and one year of session history.';

commit;
