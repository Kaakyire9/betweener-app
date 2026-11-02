-- M3.1 local only. Reuses consent, call transitions and the signed push outbox.
begin;

alter table private.connect_config add column notifications_enabled boolean not null default false;
alter table private.connect_config add column staging_test_users uuid[] not null default '{}'::uuid[]
  check(cardinality(staging_test_users) in(0,2) and array_position(staging_test_users,null) is null
    and (cardinality(staging_test_users)=0 or staging_test_users[1]<>staging_test_users[2]));
alter table private.connect_config add constraint connect_notifications_never_production
  check(environment <> 'production' or not notifications_enabled);
alter table public.push_tokens add column connect_push_contract integer not null default 0
  check(connect_push_contract in (0,1));
create function private.connect_reset_push_capability() returns trigger language plpgsql set search_path=pg_catalog as $$
begin new.connect_push_contract:=0; return new; end $$;
create trigger connect_reset_push_capability before insert or update of user_id,token,installation_id,app_environment,application_id
  on public.push_tokens for each row execute function private.connect_reset_push_capability();
revoke all on function private.connect_reset_push_capability() from public,anon,authenticated,service_role;

-- Narrower staging scope, in addition to every existing match/consent check.
-- Local disposable fixtures retain their existing behavior. No test account is allocated.
create function private.connect_test_pair_allowed(p_caller uuid,p_recipient uuid) returns boolean
language sql stable security definer set search_path=pg_catalog as $$
  select coalesce((select case when c.environment='local' then true else c.environment='staging'
    and cardinality(c.staging_test_users)=2 and exists(select 1 from public.profiles a join public.profiles b on b.id=p_recipient
      where a.id=p_caller and a.user_id<>b.user_id and a.user_id=any(c.staging_test_users) and b.user_id=any(c.staging_test_users)) end
    from private.connect_config c where singleton),false);
$$;
revoke all on function private.connect_test_pair_allowed(uuid,uuid) from public,anon,authenticated,service_role;
create or replace function private.connect_authorized(p_caller uuid,p_recipient uuid,p_media text,p_authorization text,p_grant uuid)
returns boolean language sql stable security definer set search_path=pg_catalog as $$
  select private.connect_test_pair_allowed(p_caller,p_recipient) and private.relationship_pair_available(p_caller,p_recipient)
    and exists(select 1 from private.connect_preferences cp join public.profiles p on p.user_id=cp.user_id
      where p.id=p_recipient and case p_media when 'voice' then cp.voice when 'video' then cp.video else false end)
    and case p_authorization when 'matched' then p_grant is null and exists(select 1 from public.matches m
      where ((m.user1_id=p_caller and m.user2_id=p_recipient) or (m.user2_id=p_caller and m.user1_id=p_recipient))
      and m.status='ACCEPTED' and private.relationship_has_proof(m.id,p_caller,p_recipient))
    when 'pre_match' then exists(select 1 from private.connect_grants g join public.intent_requests i on i.id=g.intent_id
      where g.id=p_grant and g.requester_profile_id=p_caller and g.recipient_profile_id=p_recipient
      and g.status='accepted' and g.revoked_at is null and g.expires_at>statement_timestamp()
      and i.actor_id=p_caller and i.recipient_id=p_recipient and i.status in ('pending','accepted') and i.expires_at>statement_timestamp()
      and not exists(select 1 from private.relationship_consent_revocations r
        where r.profile_a_id=least(p_caller,p_recipient) and r.profile_b_id=greatest(p_caller,p_recipient) and r.revoked_at>=g.created_at)
      and case p_media when 'voice' then g.voice when 'video' then g.video else false end)
    else false end;
$$;
revoke all on function private.connect_authorized(uuid,uuid,text,text,uuid) from public,anon,authenticated,service_role;

create function public.rpc_connect_get_intent_consent(p_intent uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare a uuid:=private.connect_actor(); i public.intent_requests; g private.connect_grants; available boolean;
begin
  perform private.connect_rate('read',120);
  select * into i from public.intent_requests where id=p_intent and a in(actor_id,recipient_id);
  if i.id is null then raise exception using errcode='42501',message='connect_unavailable'; end if;
  select * into g from private.connect_grants where intent_id=i.id;
  available:=i.status in('pending','accepted') and i.expires_at>clock_timestamp()
    and private.connect_test_pair_allowed(i.actor_id,i.recipient_id) and private.relationship_pair_available(i.actor_id,i.recipient_id);
  return jsonb_build_object('intent_id',i.id,'requester_profile_id',i.actor_id,'recipient_profile_id',i.recipient_id,
    'intent_status',i.status,'intent_expires_at',i.expires_at,'available',available,
    'offer_voice',available and private.connect_enabled('voice','pre_match'),
    'offer_video',available and private.connect_enabled('video','pre_match'),
    'can_call_voice',available and a=i.actor_id and private.connect_enabled('voice','pre_match')
      and private.connect_authorized(i.actor_id,i.recipient_id,'voice','pre_match',g.id),
    'grant',case when g.id is not null then to_jsonb(g) else null end);
end $$;
revoke all on function public.rpc_connect_get_intent_consent(uuid) from public,anon,authenticated,service_role;
grant execute on function public.rpc_connect_get_intent_consent(uuid) to authenticated;

-- Explicit app capability; an old 1.2.0 binary/version label alone does not qualify.
create function public.rpc_connect_register_notification_capability(p_installation uuid,p_enabled boolean) returns void
language plpgsql security definer set search_path=pg_catalog as $$
begin
  perform private.connect_actor();
  if p_installation is null or p_enabled is null then raise exception using message='connect_invalid_input'; end if;
  update public.push_tokens set connect_push_contract=case when p_enabled then 1 else 0 end
    where user_id=auth.uid() and installation_id=p_installation
      and app_environment='staging' and application_id='com.aduboffour.betweener.staging'
      and provenance_status='verified' and quarantined_at is null;
end $$;
revoke all on function public.rpc_connect_register_notification_capability(uuid,boolean) from public,anon,authenticated,service_role;
grant execute on function public.rpc_connect_register_notification_capability(uuid,boolean) to authenticated;

create function private.connect_push_type(p_state text,p_reason text,p_caller boolean) returns text
language sql immutable set search_path=pg_catalog as $$
select case when p_state='RINGING' and not p_caller then 'connect_voice_incoming'
  when p_state='CANCELLED' and not p_caller then 'connect_voice_cancelled'
  when p_state='DECLINED' and p_caller then 'connect_voice_declined'
  when p_state='MISSED' and p_caller then 'connect_voice_missed'
  when p_state='MISSED' and not p_caller then 'connect_voice_expired'
  when p_state='ENDED' and p_reason='blocked' then 'connect_voice_blocked'
  when p_state='ENDED' and p_reason in('consent_revoked','eligibility_revoked') then 'connect_voice_revoked'
  end;
$$;

create function private.connect_push_current(p_event uuid) returns boolean
language plpgsql stable security definer set search_path=pg_catalog as $$
declare e private.push_notification_events; s private.connect_sessions; expected text;
begin
  select * into e from private.push_notification_events where id=p_event;
  if e.id is null then return false; end if;
  if e.event_type not like 'connect_%' then return true; end if;
  if not coalesce((select environment in('local','staging') and notifications_enabled from private.connect_config where singleton),false)
    or e.delivery_kind<>'unicast' or e.data->>'type' is distinct from e.event_type
    or (e.data-array['type','call_id','call_generation','call_version','recipient_user_id']::text[])<>'{}'::jsonb
    or not(e.data ?& array['type','call_id','call_generation','call_version','recipient_user_id'])
    or jsonb_typeof(e.data->'call_version') is distinct from 'number'
    or jsonb_typeof(e.data->'recipient_user_id') is distinct from 'string' then return false; end if;
  select * into s from private.connect_sessions where id::text=e.data->>'call_id';
  if s.id is null or s.media<>'voice' or s.created_at is distinct from (e.data->>'call_generation')::timestamptz
    or s.version::text is distinct from e.data->>'call_version' or e.recipient_user_id::text is distinct from e.data->>'recipient_user_id'
    or e.recipient_user_id not in(s.caller_user_id,s.recipient_user_id) then return false; end if;
  if not private.connect_test_pair_allowed(s.caller_profile_id,s.recipient_profile_id) then return false; end if;
  expected:=private.connect_push_type(s.state,s.reason,e.recipient_user_id=s.caller_user_id);
  if expected is null or expected<>e.event_type then return false; end if;
  if s.state='RINGING' then
    return s.ended_at is null and s.deadline>clock_timestamp() and private.connect_enabled('voice',s.auth_mode)
      and private.connect_authorized(s.caller_profile_id,s.recipient_profile_id,s.media,s.auth_mode,s.grant_id);
  end if;
  return s.ended_at is not null;
exception when invalid_datetime_format or datetime_field_overflow then return false;
end $$;

create function private.connect_enqueue_notification() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
declare destination uuid; kind text; event_id uuid; payload jsonb; expiry timestamptz;
begin
  if new.media<>'voice' or new.state=old.state or not coalesce((select environment in('local','staging')
    and notifications_enabled from private.connect_config where singleton),false) then return new; end if;
  if not private.connect_test_pair_allowed(new.caller_profile_id,new.recipient_profile_id) then return new; end if;
  -- Supersede unsent invitations; transport/delivery after reservation is still racy.
  if new.state<>'RINGING' then
    update private.push_notification_events set status='suppressed',outcome='connect_invitation_superseded',
      completed_at=clock_timestamp(),updated_at=clock_timestamp()
      where event_type='connect_voice_incoming' and data->>'call_id'=new.id::text and status='pending';
  end if;
  foreach destination in array array[new.caller_user_id,new.recipient_user_id] loop
    kind:=private.connect_push_type(new.state,new.reason,destination=new.caller_user_id);
    if kind is null then continue; end if;
    expiry:=case when new.state='RINGING' then new.deadline else clock_timestamp()+interval '10 minutes' end;
    if expiry is null or expiry<=clock_timestamp() then continue; end if;
    payload:=jsonb_build_object('type',kind,'call_id',new.id,'call_generation',to_char(new.created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
      'call_version',new.version,'recipient_user_id',destination);
    insert into private.push_notification_events(delivery_kind,recipient_user_id,event_type,title,body,data,idempotency_key,expires_at)
      values('unicast',destination,kind,'Betweener Connect',
        case when kind='connect_voice_incoming' then 'You have a voice call invitation.'
          when kind='connect_voice_missed' then 'You missed a voice call.'
          else 'Your voice call invitation has been updated.' end,
        payload,'connect:'||new.id||':'||new.version||':'||destination,expiry)
      on conflict(idempotency_key) do nothing returning id into event_id;
    if event_id is not null then perform private.dispatch_push_notification_event_v1(event_id); end if;
  end loop;
  return new;
end $$;
create trigger connect_call_notifications after update of state on private.connect_sessions
  for each row execute function private.connect_enqueue_notification();

-- Guard the existing claim/reservation algorithms, preserving HMAC/replay/rate limits.
alter function public.rpc_service_claim_push_notification_event_v1(uuid) rename to rpc_service_claim_push_notification_event_pre_connect_v1;
revoke all on function public.rpc_service_claim_push_notification_event_pre_connect_v1(uuid) from public,anon,authenticated,service_role;
create function public.rpc_service_claim_push_notification_event_v1(p_event_id uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
begin
  if auth.role()<>'service_role' then raise exception using errcode='42501',message='service_role_required'; end if;
  perform pg_advisory_xact_lock(hashtextextended('push-notification-event:'||p_event_id::text,0));
  if not private.connect_push_current(p_event_id) then
    update private.push_notification_events set status='suppressed',outcome='connect_canonical_state_changed',
      completed_at=clock_timestamp(),updated_at=clock_timestamp() where id=p_event_id and status='pending';
    return jsonb_build_object('claimStatus','not_authorized');
  end if;
  return public.rpc_service_claim_push_notification_event_pre_connect_v1(p_event_id);
end $$;
revoke all on function public.rpc_service_claim_push_notification_event_v1(uuid) from public,anon,authenticated;
grant execute on function public.rpc_service_claim_push_notification_event_v1(uuid) to service_role;

alter function public.rpc_service_reserve_push_notification_deliveries_v1(uuid,uuid[]) rename to rpc_service_reserve_push_notification_deliveries_pre_connect_v1;
revoke all on function public.rpc_service_reserve_push_notification_deliveries_pre_connect_v1(uuid,uuid[]) from public,anon,authenticated,service_role;
create function public.rpc_service_reserve_push_notification_deliveries_v1(p_event_id uuid,p_token_ids uuid[])
returns table(reserved_token_id uuid) language plpgsql security definer set search_path=pg_catalog as $$
declare allowed uuid[]; connect_event boolean;
begin
  if auth.role()<>'service_role' then raise exception using errcode='42501',message='service_role_required'; end if;
  if p_token_ids is null or cardinality(p_token_ids) not between 1 and 100 or array_position(p_token_ids,null) is not null then
    raise exception using errcode='22023',message='push_delivery_reservation_batch_invalid'; end if;
  if not private.connect_push_current(p_event_id) then return; end if;
  select event_type like 'connect_%' into connect_event from private.push_notification_events where id=p_event_id;
  if connect_event then
    select array_agg(id) into allowed from public.push_tokens where id=any(p_token_ids)
      and connect_push_contract=1 and app_environment='staging' and application_id='com.aduboffour.betweener.staging'
      and provenance_status='verified' and quarantined_at is null;
    if coalesce(cardinality(allowed),0)=0 then return; end if;
  else allowed:=p_token_ids; end if;
  return query select * from public.rpc_service_reserve_push_notification_deliveries_pre_connect_v1(p_event_id,allowed);
end $$;
revoke all on function public.rpc_service_reserve_push_notification_deliveries_v1(uuid,uuid[]) from public,anon,authenticated;
grant execute on function public.rpc_service_reserve_push_notification_deliveries_v1(uuid,uuid[]) to service_role;

revoke all on function private.connect_push_type(text,text,boolean),private.connect_push_current(uuid),private.connect_enqueue_notification()
  from public,anon,authenticated,service_role;
commit;
