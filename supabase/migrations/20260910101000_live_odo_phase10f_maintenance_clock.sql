-- Betweener Live Phase 10F: guarantee the database-owned maintenance clock
-- used for availability expiry, detection and system-session lifecycle.

begin;

do $$
begin
  if to_regprocedure('cron.schedule(text,text,text)') is null then
    raise notice 'pg_cron is unavailable; live-maintenance was not scheduled';
    return;
  end if;

  perform cron.unschedule(job.jobid)
  from cron.job job
  where job.jobname = 'live-maintenance';

  perform cron.schedule(
    'live-maintenance',
    '* * * * *',
    'select public.run_live_maintenance();'
  );
end;
$$;

commit;
