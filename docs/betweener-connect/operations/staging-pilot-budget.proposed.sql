-- PROPOSAL ONLY. No activation. Target must be independently fenced to
-- betweener-staging / xsgzxadwuxuziubglvps before applying this exact patch.
-- Preserve the existing open-testing design; charge the shared budget in both
-- temporary restricted scope and open staging scope. No new account policy.
begin;
do $$ begin
  if md5(pg_get_functiondef('private.connect_consume_staging_call_budget()'::regprocedure)) is distinct from '5499655a658f0aa62768b3d3fd40b5bc'
    or (select proacl::text from pg_proc where oid='private.connect_consume_staging_call_budget()'::regprocedure) is distinct from '{postgres=X/postgres}' then
    raise exception 'pilot_budget_definition_drift';
  end if;
  if not exists(select 1 from private.connect_config where singleton and environment in ('unconfigured','staging')
    and not enabled and not voice_enabled and not video_enabled and not pre_match_enabled and not provider_ready
    and not end_block_enabled and not notifications_enabled and not staging_open_testing
    and staging_calls_remaining=0 and cardinality(staging_test_users)=0)
    or exists(select 1 from private.connect_sessions)
    or exists(select 1 from private.connect_provider_jobs) then
    raise exception 'pilot_budget_patch_requires_empty_disabled_state';
  end if;
end $$;
create or replace function private.connect_consume_staging_call_budget() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
declare c private.connect_config;
begin
  select * into c from private.connect_config where singleton for update;
  if c.environment='staging' then
    if c.staging_calls_remaining<=0 then
      raise exception using errcode='P0001',message='connect_test_budget_exhausted';
    end if;
    update private.connect_config set staging_calls_remaining=staging_calls_remaining-1 where singleton;
  end if;
  return new;
end $$;
commit;
