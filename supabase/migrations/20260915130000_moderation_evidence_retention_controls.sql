-- Safe operational stop control for moderation evidence retention.

create or replace function public.disable_moderation_evidence_retention_worker()
returns boolean
language plpgsql
security definer
set search_path = public, cron, auth, pg_catalog
as $$
declare
  v_job_id bigint;
begin
  if current_user not in ('postgres', 'supabase_admin')
     and auth.role() <> 'service_role' then
    raise exception using errcode = '42501', message = 'service_role_required';
  end if;

  update public.moderation_evidence_retention_config
  set enabled = false, updated_at = timezone('utc', now())
  where singleton;

  if to_regprocedure('cron.unschedule(bigint)') is not null then
    select jobid into v_job_id
    from cron.job
    where jobname = 'moderation-evidence-retention'
    limit 1;
    if v_job_id is not null then perform cron.unschedule(v_job_id); end if;
  end if;

  return true;
end;
$$;

revoke all on function public.disable_moderation_evidence_retention_worker()
  from public, anon, authenticated;
grant execute on function public.disable_moderation_evidence_retention_worker()
  to service_role;
