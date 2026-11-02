-- Proposed M3.4 delta only. The frozen six migrations remain unchanged.
-- Opening staging testing and assigning a budget require separate owner approval.
begin;

alter table private.connect_config
  add column staging_open_testing boolean not null default false,
  add column staging_calls_remaining integer not null default 0 check(staging_calls_remaining>=0),
  add constraint connect_open_testing_staging_voice_only
    check(not staging_open_testing or (environment='staging' and not video_enabled));

-- Scope is additional to the existing authority; no match/consent predicate changes.
create or replace function private.connect_test_pair_allowed(p_caller uuid,p_recipient uuid) returns boolean
language sql stable security definer set search_path=pg_catalog as $$
  select coalesce((select case when c.environment='local' then true else c.environment='staging'
    and exists(select 1 from public.profiles a join public.profiles b on b.id=p_recipient
      join auth.users au on au.id=a.user_id join auth.users bu on bu.id=b.user_id
      where a.id=p_caller and a.user_id<>b.user_id and (c.staging_open_testing
        or (cardinality(c.staging_test_users)=2 and a.user_id=any(c.staging_test_users) and b.user_id=any(c.staging_test_users)))) end
    from private.connect_config c where singleton),false);
$$;
revoke all on function private.connect_test_pair_allowed(uuid,uuid) from public,anon,authenticated,service_role;

-- Consume a slot only for an actual insertion. Existing idempotent calls do not
-- insert again. Rollback restores the slot. Exhaustion does not revoke active calls.
create function private.connect_consume_staging_call_budget() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
declare c private.connect_config;
begin
  select * into c from private.connect_config where singleton for update;
  if c.environment='staging' and c.staging_open_testing then
    if c.staging_calls_remaining<=0 then
      raise exception using errcode='P0001',message='connect_test_budget_exhausted';
    end if;
    update private.connect_config set staging_calls_remaining=staging_calls_remaining-1 where singleton;
  end if;
  return new;
end $$;
revoke all on function private.connect_consume_staging_call_budget() from public,anon,authenticated,service_role;
create trigger connect_staging_call_budget before insert on private.connect_sessions
  for each row execute function private.connect_consume_staging_call_budget();

commit;
