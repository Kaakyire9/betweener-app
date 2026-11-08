-- SEPARATE OWNER APPROVAL REQUIRED. Installing this job starts worker invocations.
-- First verify exact staging identity, secret digest equality, support SQL/ACLs,
-- all calling gates OFF, empty scope, zero budget, and no calls or pending jobs.
-- Existing Edge worker custom auth stays unchanged; no gateway JWT is added.
begin;
do $$
begin
  if exists(select 1 from cron.job where jobname='connect-staging-provider-worker') then
    raise exception 'connect_worker_job_already_exists';
  end if;
  if not exists(select 1 from private.connect_config where singleton
    and environment in ('unconfigured','staging') and not enabled and not voice_enabled
    and not video_enabled and not pre_match_enabled and not provider_ready
    and not end_block_enabled and not notifications_enabled and not staging_open_testing
    and staging_calls_remaining=0 and cardinality(staging_test_users)=0)
    or exists(select 1 from private.connect_sessions)
    or exists(select 1 from private.connect_provider_jobs where status<>'done') then
    raise exception 'connect_worker_install_requires_empty_disabled_state';
  end if;
  perform cron.schedule('connect-staging-provider-worker','5 seconds',
    'select private.connect_dispatch_staging_worker();');
end $$;
commit;
-- Do not unschedule during pending cleanup. Admission OFF is not worker OFF.
-- Later removal, after all owned jobs/occupancy and provider outcomes are verified:
-- select cron.unschedule(jobid) from cron.job where jobname='connect-staging-provider-worker';
