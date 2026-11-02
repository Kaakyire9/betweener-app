-- Connect M1. Local artifact only. Requires relationship_acceptance_authority.
begin;
do $$ begin
  if to_regprocedure('public.rpc_is_relationship_mutually_verified(uuid)') is null then
    raise exception 'Connect requires relationship authority remediation';
  end if;
end $$;

create table private.connect_config (
  singleton boolean primary key default true check(singleton),
  environment text not null default 'unconfigured' check(environment in ('unconfigured','local','staging','production')),
  enabled boolean not null default false, voice_enabled boolean not null default false,
  video_enabled boolean not null default false, pre_match_enabled boolean not null default false,
  provider_ready boolean not null default false,
  check(environment <> 'production' or (not enabled and not provider_ready))
);
insert into private.connect_config(singleton) values(true);
create table private.connect_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  voice boolean not null default false, video boolean not null default false
);
create table private.connect_grants (
  id uuid primary key default gen_random_uuid(), intent_id uuid not null references public.intent_requests(id) on delete cascade,
  requester_profile_id uuid not null references public.profiles(id) on delete cascade,
  recipient_profile_id uuid not null references public.profiles(id) on delete cascade,
  requested_voice boolean not null, requested_video boolean not null,
  voice boolean not null default false, video boolean not null default false,
  status text not null default 'pending' check(status in ('pending','accepted','revoked')),
  created_at timestamptz not null default clock_timestamp(), accepted_at timestamptz,
  expires_at timestamptz not null default clock_timestamp()+interval '24 hours', revoked_at timestamptz,
  unique(intent_id), check(requester_profile_id<>recipient_profile_id),
  check(not voice or requested_voice), check(not video or requested_video)
);
create index connect_grants_recipient_idx on private.connect_grants(recipient_profile_id);
create table private.connect_sessions (
  id uuid primary key default gen_random_uuid(),
  caller_user_id uuid not null references auth.users(id) on delete cascade,
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  caller_profile_id uuid not null references public.profiles(id) on delete cascade,
  recipient_profile_id uuid not null references public.profiles(id) on delete cascade,
  caller_device uuid not null, recipient_device uuid,
  media text not null check(media in ('voice','video')),
  auth_mode text not null check(auth_mode in ('matched','pre_match')),
  -- Missing/deleted grant fails authorization. Do not obstruct account deletion.
  grant_id uuid,
  idempotency_key uuid not null,
  state text not null default 'REQUESTED' check(state in ('REQUESTED','RINGING','ACCEPTED','CONNECTING','ACTIVE','RECONNECTING','ENDING','ENDED','DECLINED','CANCELLED','MISSED','BUSY','FAILED')),
  version integer not null default 1,
  created_at timestamptz not null default clock_timestamp(), accepted_at timestamptz,
  connected_at timestamptz, ended_at timestamptz, deadline timestamptz default clock_timestamp()+interval '60 seconds',
  reason text, provider_session_id text, maintenance_due timestamptz not null default clock_timestamp(),
  unique(caller_user_id,idempotency_key), check(caller_user_id<>recipient_user_id),
  check((auth_mode='pre_match')=(grant_id is not null))
);
create index connect_sessions_caller_history_idx on private.connect_sessions(caller_user_id,created_at desc,id desc);
create index connect_sessions_recipient_history_idx on private.connect_sessions(recipient_user_id,created_at desc,id desc);
create index connect_sessions_deadline_idx on private.connect_sessions(deadline) where ended_at is null;
create index connect_sessions_maintenance_idx on private.connect_sessions(maintenance_due) where ended_at is null;
-- A single key across BOTH roles prevents crossed caller/recipient collisions.
create table private.connect_occupancy (
  user_id uuid primary key references auth.users(id) on delete cascade,
  -- Survives session deletion until provider cleanup acknowledges termination.
  call_id uuid not null
);
create index connect_occupancy_call_idx on private.connect_occupancy(call_id);
create table private.connect_rates (
  user_id uuid not null references auth.users(id) on delete cascade, bucket timestamptz not null,
  action text not null, count integer not null, primary key(user_id,bucket,action)
);
create table private.connect_provider_jobs (
  -- Cleanup must survive profile/Auth/session deletion; contains no peer PII.
  call_id uuid not null,
  operation text not null check(operation in ('create','end','sync')),
  status text not null default 'pending' check(status in ('pending','working','done')),
  attempts integer not null default 0, available_at timestamptz not null default clock_timestamp(),
  lease uuid, lease_until timestamptz, last_error text,
  primary key(call_id,operation)
);
create index connect_provider_jobs_pending_idx on private.connect_provider_jobs(available_at) where status<>'done';
create table private.connect_webhook_receipts (
  digest text primary key check(digest ~ '^[0-9a-f]{64}$'), received_at timestamptz not null default clock_timestamp()
);
do $$ declare t text; begin
  foreach t in array array['connect_config','connect_preferences','connect_grants','connect_sessions','connect_occupancy','connect_rates','connect_provider_jobs','connect_webhook_receipts'] loop
    execute format('alter table private.%I enable row level security',t);
    execute format('revoke all on private.%I from public,anon,authenticated,service_role',t);
  end loop;
end $$;

create function private.connect_actor() returns uuid language plpgsql security definer set search_path=pg_catalog as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='connect_unauthenticated'; end if;
  select p.id into v_id from public.profiles p join auth.users u on u.id=p.user_id
    where p.user_id=auth.uid() and p.deleted_at is null and p.is_active and p.account_state='active'
    and p.identity_status='active' and p.profile_moderation_state='CLEAR' and u.deleted_at is null
    and not coalesce(u.is_anonymous,false) and (u.banned_until is null or u.banned_until<=clock_timestamp());
  if v_id is null then raise exception using errcode='42501',message='connect_unavailable'; end if;
  return v_id;
end $$;
create function private.connect_rate(p_action text,p_limit integer) returns void language plpgsql security definer set search_path=pg_catalog as $$
declare v_count integer;
begin
  perform private.connect_actor();
  insert into private.connect_rates values(auth.uid(),date_trunc('minute',clock_timestamp()),p_action,1)
  on conflict(user_id,bucket,action) do update set count=private.connect_rates.count+1 returning count into v_count;
  if v_count>p_limit then raise exception using errcode='P0001',message='connect_rate_limited'; end if;
end $$;
create function private.connect_enabled(p_media text,p_authorization text) returns boolean language sql stable security definer set search_path=pg_catalog as $$
  select coalesce((select environment in ('local','staging') and enabled and provider_ready
    and case p_media when 'voice' then voice_enabled when 'video' then video_enabled else false end
    and case p_authorization when 'matched' then true when 'pre_match' then pre_match_enabled else false end
    from private.connect_config where singleton),false);
$$;
create function private.connect_authorized(p_caller uuid,p_recipient uuid,p_media text,p_authorization text,p_grant uuid)
returns boolean language sql stable security definer set search_path=pg_catalog as $$
  select private.relationship_pair_available(p_caller,p_recipient)
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
create function private.connect_snapshot(p_call uuid) returns jsonb language sql stable security definer set search_path=pg_catalog as $$
  select jsonb_build_object('id',id,'caller_profile_id',caller_profile_id,'recipient_profile_id',recipient_profile_id,
    'media',media,'authorization',auth_mode,'state',state,'version',version,'created_at',created_at,
    'accepted_at',accepted_at,'connected_at',connected_at,'ended_at',ended_at,'deadline',deadline,'reason',reason,
    'duration_seconds',case when connected_at is not null and ended_at is not null then greatest(0,floor(extract(epoch from ended_at-connected_at))) end)
  from private.connect_sessions where id=p_call;
$$;
create function private.connect_enqueue(p_call uuid,p_operation text,p_force boolean default false) returns void language sql security definer set search_path=pg_catalog as $$
  insert into private.connect_provider_jobs(call_id,operation) values(p_call,p_operation)
  on conflict(call_id,operation) do update set status='pending',available_at=clock_timestamp(),lease=null,lease_until=null
    where p_force or private.connect_provider_jobs.status='done';
$$;
create function private.connect_transition(p_call uuid,p_state text,p_reason text default null) returns void
language plpgsql security definer set search_path=pg_catalog as $$
declare s private.connect_sessions; v_allowed boolean;
begin
  select * into strict s from private.connect_sessions where id=p_call for update;
  if s.state=p_state or s.ended_at is not null then return; end if;
  v_allowed := case s.state
    when 'REQUESTED' then p_state in ('RINGING','CANCELLED','MISSED','FAILED','ENDED')
    when 'RINGING' then p_state in ('ACCEPTED','DECLINED','CANCELLED','MISSED','BUSY','FAILED','ENDED')
    when 'ACCEPTED' then p_state in ('CONNECTING','ENDING','FAILED','ENDED')
    when 'CONNECTING' then p_state in ('ACTIVE','ENDING','FAILED','ENDED')
    when 'ACTIVE' then p_state in ('RECONNECTING','ENDING','ENDED','FAILED')
    when 'RECONNECTING' then p_state in ('ACTIVE','ENDING','ENDED','FAILED')
    when 'ENDING' then p_state in ('ENDED','FAILED') else false end;
  if not v_allowed then raise exception using message='connect_invalid_transition'; end if;
  update private.connect_sessions set state=p_state,version=version+1,reason=p_reason,
    accepted_at=case when p_state='ACCEPTED' then coalesce(accepted_at,clock_timestamp()) else accepted_at end,
    connected_at=case when p_state='ACTIVE' then coalesce(connected_at,clock_timestamp()) else connected_at end,
    ended_at=case when p_state in ('ENDED','DECLINED','CANCELLED','MISSED','BUSY','FAILED') then clock_timestamp() else null end,
    deadline=case when p_state='RINGING' then clock_timestamp()+interval '45 seconds'
      when p_state in ('ACCEPTED','CONNECTING') then clock_timestamp()+interval '60 seconds'
      when p_state='RECONNECTING' then clock_timestamp()+interval '30 seconds'
      when p_state='ENDING' then clock_timestamp()+interval '30 seconds' else null end where id=p_call;
  if p_state in ('ENDED','DECLINED','CANCELLED','MISSED','BUSY','FAILED','ENDING') then
    -- Keep occupancy until provider cleanup ACK, avoiding overlapping media.
    perform private.connect_enqueue(p_call,'end');
  end if;
end $$;
create function private.connect_expire(p_call uuid) returns void language plpgsql security definer set search_path=pg_catalog as $$
declare s private.connect_sessions;
begin
  select * into s from private.connect_sessions where id=p_call for update;
  if s.ended_at is null then
    if not exists(select 1 from public.profiles a join public.profiles b on b.id=s.recipient_profile_id
      where a.id=s.caller_profile_id and a.user_id=s.caller_user_id and b.user_id=s.recipient_user_id)
      or not private.connect_authorized(s.caller_profile_id,s.recipient_profile_id,s.media,s.auth_mode,s.grant_id) then
      perform private.connect_transition(s.id,'ENDED','eligibility_revoked');
    elsif s.deadline<=clock_timestamp() then
      perform private.connect_transition(s.id,case when s.state in ('REQUESTED','RINGING') then 'MISSED' else 'FAILED' end,'deadline_expired');
    end if;
  end if;
end $$;

create function public.rpc_connect_check_eligibility(p_peer uuid,p_media text,p_authorization text,p_grant uuid default null)
returns boolean language plpgsql security definer set search_path=pg_catalog as $$
declare a uuid:=private.connect_actor();
begin
  perform private.connect_rate('eligibility',60);
  return private.connect_enabled(p_media,p_authorization) and private.connect_authorized(a,p_peer,p_media,p_authorization,p_grant);
end $$;
create function public.rpc_connect_set_preferences(p_voice boolean,p_video boolean) returns void
language plpgsql security definer set search_path=pg_catalog as $$
begin
  perform private.connect_actor(); perform private.connect_rate('preferences',20);
  if p_voice is null or p_video is null then raise exception using message='connect_invalid_input'; end if;
  insert into private.connect_preferences values(auth.uid(),p_voice,p_video)
  on conflict(user_id) do update set voice=excluded.voice,video=excluded.video;
end $$;
create function public.rpc_connect_get_preferences() returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
begin
  perform private.connect_actor(); perform private.connect_rate('read',120);
  return coalesce((select jsonb_build_object('voice',voice,'video',video) from private.connect_preferences where user_id=auth.uid()),
    jsonb_build_object('voice',false,'video',false));
end $$;
create function public.rpc_connect_get_grant(p_grant uuid) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare a uuid:=private.connect_actor(); g private.connect_grants;
begin
  perform private.connect_rate('read',120);
  select * into g from private.connect_grants where id=p_grant and a in (requester_profile_id,recipient_profile_id);
  if g.id is null then raise exception using errcode='42501',message='connect_unavailable'; end if;
  return to_jsonb(g);
end $$;
create function public.rpc_connect_request_grant(p_intent uuid,p_voice boolean,p_video boolean) returns uuid
language plpgsql security definer set search_path=pg_catalog as $$
declare a uuid:=private.connect_actor(); i public.intent_requests; g private.connect_grants;
begin
  perform private.connect_rate('grant',10);
  if p_voice is null or p_video is null or not(p_voice or p_video) then raise exception using message='connect_invalid_input'; end if;
  select * into i from public.intent_requests where id=p_intent and actor_id=a;
  if i.id is null then raise exception using errcode='42501',message='connect_unavailable'; end if;
  perform private.relationship_lock_pair(a,i.recipient_id);
  select * into i from public.intent_requests where id=p_intent for update;
  if i.status not in ('pending','accepted') or i.expires_at<=clock_timestamp()
    or not private.relationship_pair_available(a,i.recipient_id) then raise exception using message='connect_unavailable'; end if;
  if not private.connect_enabled(case when p_video then 'video' else 'voice' end,'pre_match') then raise exception using message='connect_disabled'; end if;
  select * into g from private.connect_grants where intent_id=p_intent;
  if g.id is not null then
    if g.requested_voice=p_voice and g.requested_video=p_video then return g.id; end if;
    raise exception using message='connect_idempotency_conflict';
  end if;
  insert into private.connect_grants(intent_id,requester_profile_id,recipient_profile_id,requested_voice,requested_video,expires_at)
    values(i.id,a,i.recipient_id,p_voice,p_video,least(i.expires_at,clock_timestamp()+interval '24 hours')) returning id into g.id;
  return g.id;
end $$;
create function public.rpc_connect_decide_grant(p_grant uuid,p_voice boolean,p_video boolean) returns void
language plpgsql security definer set search_path=pg_catalog as $$
declare a uuid:=private.connect_actor(); g private.connect_grants;
begin
  perform private.connect_rate('grant',10);
  select * into g from private.connect_grants where id=p_grant and recipient_profile_id=a;
  if g.id is null then raise exception using errcode='42501',message='connect_unavailable'; end if;
  perform private.relationship_lock_pair(g.requester_profile_id,a);
  select * into g from private.connect_grants where id=p_grant for update;
  if p_voice is null or p_video is null or (p_voice and not g.requested_voice) or (p_video and not g.requested_video) then raise exception using message='connect_invalid_input'; end if;
  if g.status='accepted' and g.voice=p_voice and g.video=p_video and g.expires_at>clock_timestamp() then return; end if;
  if g.status<>'pending' or g.expires_at<=clock_timestamp() or not private.relationship_pair_available(g.requester_profile_id,a)
    or not exists(select 1 from public.intent_requests where id=g.intent_id and status in ('pending','accepted') and expires_at>clock_timestamp()) then raise exception using message='connect_unavailable'; end if;
  if (p_voice or p_video) and not private.connect_enabled(case when p_video then 'video' else 'voice' end,'pre_match') then raise exception using message='connect_disabled'; end if;
  update private.connect_grants set voice=p_voice,video=p_video,status=case when p_voice or p_video then 'accepted' else 'revoked' end,
    accepted_at=clock_timestamp(),revoked_at=case when not(p_voice or p_video) then clock_timestamp() end where id=p_grant;
end $$;
create function public.rpc_connect_revoke_grant(p_grant uuid) returns void language plpgsql security definer set search_path=pg_catalog as $$
declare a uuid:=private.connect_actor(); g private.connect_grants; s private.connect_sessions;
begin
  perform private.connect_rate('revoke',30);
  select * into g from private.connect_grants where id=p_grant and a in (requester_profile_id,recipient_profile_id);
  if g.id is null then raise exception using errcode='42501',message='connect_unavailable'; end if;
  perform private.relationship_lock_pair(g.requester_profile_id,g.recipient_profile_id);
  update private.connect_grants set status='revoked',revoked_at=coalesce(revoked_at,clock_timestamp()) where id=p_grant;
  for s in select * from private.connect_sessions where grant_id=p_grant and ended_at is null order by id for update loop
    perform private.connect_transition(s.id,'ENDED','consent_revoked');
  end loop;
end $$;

create function public.rpc_connect_create_call(p_peer uuid,p_media text,p_authorization text,p_key uuid,p_device uuid,p_grant uuid default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare a uuid:=private.connect_actor(); u uuid; s private.connect_sessions;
begin
  if p_peer is null or p_key is null or p_device is null or p_media not in ('voice','video') or p_media is null
    or p_authorization not in ('matched','pre_match') or p_authorization is null
    or (p_authorization='pre_match')<>(p_grant is not null) then raise exception using message='connect_invalid_input'; end if;
  perform private.connect_rate('create_command',60);
  perform private.relationship_lock_pair(a,p_peer);
  -- Serialize retries before occupancy checks, across both user roles.
  select user_id into u from public.profiles where id=p_peer;
  if u is null or u=auth.uid() then raise exception using errcode='42501',message='connect_unavailable'; end if;
  perform pg_advisory_xact_lock(hashtextextended('connect-user:'||least(u::text,auth.uid()::text),0));
  perform pg_advisory_xact_lock(hashtextextended('connect-user:'||greatest(u::text,auth.uid()::text),0));
  select * into s from private.connect_sessions where caller_user_id=auth.uid() and idempotency_key=p_key;
  if s.id is not null then
    if (s.recipient_profile_id,s.media,s.auth_mode,s.grant_id,s.caller_device) is distinct from (p_peer,p_media,p_authorization,p_grant,p_device)
      then raise exception using message='connect_idempotency_conflict'; end if;
    perform private.connect_expire(s.id); return private.connect_snapshot(s.id);
  end if;
  perform private.connect_rate('create',5);
  if not private.connect_enabled(p_media,p_authorization) then raise exception using message='connect_disabled'; end if;
  if not private.connect_authorized(a,p_peer,p_media,p_authorization,p_grant) then raise exception using errcode='42501',message='connect_consent_required'; end if;
  if exists(select 1 from private.connect_occupancy where user_id in (u,auth.uid())) then raise exception using message='connect_busy'; end if;
  insert into private.connect_sessions(caller_user_id,recipient_user_id,caller_profile_id,recipient_profile_id,media,auth_mode,grant_id,idempotency_key,caller_device)
    values(auth.uid(),u,a,p_peer,p_media,p_authorization,p_grant,p_key,p_device) returning * into s;
  insert into private.connect_occupancy values(auth.uid(),s.id),(u,s.id);
  perform private.connect_enqueue(s.id,'create');
  return private.connect_snapshot(s.id);
end $$;
create function public.rpc_connect_act(p_call uuid,p_action text,p_version integer,p_device uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare a uuid:=private.connect_actor(); s private.connect_sessions;
begin
  perform private.connect_rate('action',90);
  select * into s from private.connect_sessions where id=p_call and auth.uid() in (caller_user_id,recipient_user_id);
  if s.id is null then raise exception using errcode='42501',message='connect_unavailable'; end if;
  perform private.relationship_lock_pair(s.caller_profile_id,s.recipient_profile_id);
  select * into s from private.connect_sessions where id=p_call for update;
  if p_action is null or p_action not in ('accept','decline','cancel','end') or p_version is null or p_device is null then raise exception using message='connect_invalid_input'; end if;
  if (p_action in ('accept','decline') and auth.uid()<>s.recipient_user_id) or (p_action='cancel' and auth.uid()<>s.caller_user_id)
    then raise exception using errcode='42501',message='connect_unavailable'; end if;
  perform private.connect_expire(s.id);
  select * into s from private.connect_sessions where id=p_call;
  if s.ended_at is not null or s.state='ENDING' then return private.connect_snapshot(s.id); end if;
  if p_action='accept' and s.recipient_device is not null then
    if s.recipient_device<>p_device then raise exception using message='connect_device_conflict'; end if;
    return private.connect_snapshot(s.id);
  end if;
  if p_version<>s.version then raise exception using message='connect_conflict'; end if;
  if p_action='accept' then
    if s.state<>'RINGING' then raise exception using message='connect_invalid_transition'; end if;
    if not private.connect_enabled(s.media,s.auth_mode) then raise exception using message='connect_disabled'; end if;
    update private.connect_sessions set recipient_device=p_device where id=p_call;
    perform private.connect_transition(s.id,'ACCEPTED'); perform private.connect_enqueue(s.id,'sync');
  elsif p_action='decline' then
    perform private.connect_transition(s.id,'DECLINED','recipient_declined');
  elsif p_action='cancel' then
    if s.state not in ('REQUESTED','RINGING') then raise exception using message='connect_invalid_transition'; end if;
    perform private.connect_transition(s.id,'CANCELLED','caller_cancelled');
  else perform private.connect_transition(s.id,'ENDING','participant_ended');
  end if;
  return private.connect_snapshot(s.id);
end $$;
create function public.rpc_connect_get_call(p_call uuid) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare s private.connect_sessions;
begin
  perform private.connect_actor(); perform private.connect_rate('read',120);
  select * into s from private.connect_sessions where id=p_call and auth.uid() in (caller_user_id,recipient_user_id);
  if s.id is null then raise exception using errcode='42501',message='connect_unavailable'; end if;
  perform private.relationship_lock_pair(s.caller_profile_id,s.recipient_profile_id); perform private.connect_expire(s.id);
  return private.connect_snapshot(s.id);
end $$;
create function public.rpc_connect_get_history(p_before timestamptz default null,p_limit integer default 30) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
begin
  perform private.connect_actor(); perform private.connect_rate('history',30);
  if p_limit is null or p_limit<1 or p_limit>100 then raise exception using message='connect_invalid_input'; end if;
  return coalesce((select jsonb_agg(private.connect_snapshot(x.id) order by x.created_at desc,x.id desc) from (
    select id,created_at from private.connect_sessions where auth.uid() in (caller_user_id,recipient_user_id)
    and (p_before is null or created_at<p_before) order by created_at desc,id desc limit p_limit)x),'[]'::jsonb);
end $$;

-- Authenticated admission is separate from invitation. No client marks ACTIVE.
create function public.rpc_connect_admission(p_call uuid,p_device uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare s private.connect_sessions;
begin
  perform private.connect_actor(); perform private.connect_rate('token',20);
  select * into s from private.connect_sessions where id=p_call and auth.uid() in (caller_user_id,recipient_user_id);
  if s.id is null then raise exception using errcode='42501',message='connect_unavailable'; end if;
  perform private.relationship_lock_pair(s.caller_profile_id,s.recipient_profile_id); perform private.connect_expire(s.id);
  select * into s from private.connect_sessions where id=p_call for update;
  if s.state not in ('ACCEPTED','CONNECTING','ACTIVE','RECONNECTING') or s.ended_at is not null
    then raise exception using errcode='42501',message='connect_unavailable'; end if;
  if p_device is null or p_device<>(case when auth.uid()=s.caller_user_id then s.caller_device else s.recipient_device end)
    then raise exception using message='connect_device_conflict'; end if;
  -- Existing active transports may refresh after an ordinary feature toggle.
  if s.state in ('ACCEPTED','CONNECTING') and not private.connect_enabled(s.media,s.auth_mode) then raise exception using message='connect_disabled'; end if;
  if s.state='ACCEPTED' then perform private.connect_transition(s.id,'CONNECTING'); end if;
  return jsonb_build_object('id',s.id,'user_id',auth.uid(),
    'media',s.media,'call_type','betweener_connect','state',s.state);
end $$;

-- Worker endpoints: service-role only, no user-controlled lifecycle payloads.
create function public.rpc_connect_claim_job() returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare j private.connect_provider_jobs; s private.connect_sessions;
begin
  select * into j from private.connect_provider_jobs where status<>'done' and available_at<=clock_timestamp()
    and (lease_until is null or lease_until<clock_timestamp()) order by available_at,call_id for update skip locked limit 1;
  if j.call_id is null then return null; end if;
  update private.connect_provider_jobs set status='working',attempts=attempts+1,lease=gen_random_uuid(),lease_until=clock_timestamp()+interval '60 seconds'
    where call_id=j.call_id and operation=j.operation returning * into j;
  select * into s from private.connect_sessions where id=j.call_id;
  return jsonb_build_object('call_id',s.id,'operation',j.operation,'lease',j.lease,'attempts',j.attempts);
end $$;
create function public.rpc_connect_worker_snapshot(p_call uuid) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare s private.connect_sessions;
begin
  select * into s from private.connect_sessions where id=p_call;
  if s.id is null then return null; end if;
  perform private.relationship_lock_pair(s.caller_profile_id,s.recipient_profile_id); perform private.connect_expire(s.id);
  select * into s from private.connect_sessions where id=p_call;
  return private.connect_snapshot(s.id)||jsonb_build_object('caller_user_id',s.caller_user_id,'recipient_user_id',s.recipient_user_id,
    'provider_session_id',s.provider_session_id,'can_provision',private.connect_enabled(s.media,s.auth_mode)
      and private.connect_authorized(s.caller_profile_id,s.recipient_profile_id,s.media,s.auth_mode,s.grant_id));
end $$;
create function public.rpc_connect_complete_job(p_call uuid,p_operation text,p_lease uuid,p_success boolean)
returns boolean language plpgsql security definer set search_path=pg_catalog as $$
declare s private.connect_sessions; j private.connect_provider_jobs;
begin
  select * into s from private.connect_sessions where id=p_call;
  if s.id is null then
    select * into j from private.connect_provider_jobs where call_id=p_call and operation=p_operation for update;
    if p_operation='create' then perform private.connect_enqueue(p_call,'end',true); end if;
    if j.lease is distinct from p_lease or p_lease is null or j.status<>'working' then return false; end if;
    update private.connect_provider_jobs set status=case when p_success or p_operation<>'end' then 'done' else 'pending' end,
      lease=null,lease_until=null,available_at=clock_timestamp()+interval '10 seconds'
      where call_id=p_call and operation=p_operation;
    if p_operation='end' and p_success and not exists(select 1 from private.connect_provider_jobs
      where call_id=p_call and operation='create' and status<>'done') then delete from private.connect_occupancy where call_id=p_call; end if;
    return true;
  end if;
  perform private.relationship_lock_pair(s.caller_profile_id,s.recipient_profile_id);
  select * into s from private.connect_sessions where id=p_call for update;
  select * into j from private.connect_provider_jobs where call_id=p_call and operation=p_operation for update;
  if j.lease is distinct from p_lease or p_lease is null or j.status<>'working' then
    -- A stale creator may have completed after a terminal cleanup. Compensate.
    if p_operation='create' and p_success and (s.ended_at is not null or s.state='ENDING') then perform private.connect_enqueue(p_call,'end',true); end if;
    return false;
  end if;
  if p_success then
    update private.connect_provider_jobs set status='done',lease_until=null,last_error=null where call_id=p_call and operation=p_operation;
    if p_operation='create' then
      perform private.connect_expire(s.id); select * into s from private.connect_sessions where id=p_call;
      if s.state='REQUESTED' and private.connect_enabled(s.media,s.auth_mode) then perform private.connect_transition(p_call,'RINGING');
      elsif s.state='REQUESTED' then perform private.connect_transition(p_call,'FAILED','feature_disabled');
      else perform private.connect_enqueue(p_call,'end',true); end if;
    elsif p_operation='end' then
      if s.ended_at is null then perform private.connect_transition(p_call,'ENDED','provider_cleanup'); end if;
      -- transition enqueues end; this ACK consumes that work.
      update private.connect_provider_jobs set status='done',lease_until=null where call_id=p_call and operation='end';
      if not exists(select 1 from private.connect_provider_jobs where call_id=p_call and operation='create' and status<>'done') then
        delete from private.connect_occupancy where call_id=p_call;
      end if;
    end if;
  else
    update private.connect_provider_jobs set status='pending',lease=null,lease_until=null,last_error='provider_unavailable',
      available_at=clock_timestamp()+make_interval(secs=>least(300,power(2,least(j.attempts,8))::integer)) where call_id=p_call and operation=p_operation;
    if p_operation='create' and j.attempts>=3 and s.ended_at is null then perform private.connect_transition(p_call,'FAILED','provider_unavailable'); end if;
  end if;
  return true;
end $$;
-- Trusted server GET snapshot only. Webhook/client join events cannot supply this.
create function public.rpc_connect_reconcile_media(p_call uuid,p_session text,p_users uuid[],p_ended boolean)
returns void language plpgsql security definer set search_path=pg_catalog as $$
declare s private.connect_sessions;
begin
  select * into s from private.connect_sessions where id=p_call;
  if s.id is null then return; end if;
  perform private.relationship_lock_pair(s.caller_profile_id,s.recipient_profile_id); perform private.connect_expire(s.id);
  select * into s from private.connect_sessions where id=p_call for update;
  if s.ended_at is not null or s.state='ENDING' then return; end if;
  if s.state not in ('CONNECTING','ACTIVE','RECONNECTING') then return; end if;
  if p_session is null or length(p_session)>200 then return; end if;
  if s.provider_session_id is not null and s.provider_session_id<>p_session then
    perform private.connect_transition(p_call,'FAILED','provider_session_changed'); return;
  end if;
  if exists(select 1 from unnest(p_users)u where u not in (s.caller_user_id,s.recipient_user_id)) then
    perform private.connect_transition(p_call,'FAILED','provider_membership_invalid'); return;
  end if;
  update private.connect_sessions set provider_session_id=p_session where id=p_call;
  if p_ended then perform private.connect_transition(p_call,'ENDED','provider_ended');
  elsif s.caller_user_id=any(p_users) and s.recipient_user_id=any(p_users) then
    perform private.connect_transition(p_call,'ACTIVE');
  elsif s.state='ACTIVE' then perform private.connect_transition(p_call,'RECONNECTING'); end if;
end $$;
create function public.rpc_connect_enqueue_sync(p_call uuid,p_digest text) returns void language plpgsql security definer set search_path=pg_catalog as $$
declare v_digest text;
begin
  if p_digest is null or p_digest !~ '^[0-9a-f]{64}$' then raise exception using message='connect_invalid_input'; end if;
  insert into private.connect_webhook_receipts(digest) values(p_digest) on conflict do nothing returning digest into v_digest;
  if v_digest is null then return; end if;
  if exists(select 1 from private.connect_sessions where id=p_call and ended_at is null) then
    perform private.connect_enqueue(p_call,'sync');
  end if;
end $$;
create function public.rpc_connect_sweep() returns integer language plpgsql security definer set search_path=pg_catalog as $$
declare s private.connect_sessions; n integer:=0;
begin
  -- Ordered pair locks avoid multi-call sweep deadlocks; due timestamps prevent
  -- the first batch from starving later calls on repeated worker invocations.
  for s in select * from private.connect_sessions where ended_at is null and maintenance_due<=clock_timestamp()
    order by least(caller_profile_id,recipient_profile_id),greatest(caller_profile_id,recipient_profile_id),id limit 200 loop
    perform private.relationship_lock_pair(s.caller_profile_id,s.recipient_profile_id);
    perform private.connect_expire(s.id);
    update private.connect_sessions set maintenance_due=clock_timestamp()+interval '10 seconds' where id=s.id;
    if s.state in ('CONNECTING','ACTIVE','RECONNECTING') then perform private.connect_enqueue(s.id,'sync'); end if;
    n:=n+1;
  end loop;
  delete from private.connect_rates where bucket<clock_timestamp()-interval '1 day';
  delete from private.connect_webhook_receipts where received_at<clock_timestamp()-interval '1 day';
  return n;
end $$;
create function private.connect_block_guard() returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare s private.connect_sessions;
begin
  -- Relationship BEFORE guard already holds the same pair lock.
  for s in select * from private.connect_sessions where ended_at is null
    and ((caller_user_id=new.blocker_id and recipient_user_id=new.blocked_id)
      or (recipient_user_id=new.blocker_id and caller_user_id=new.blocked_id)) order by id for update loop
    perform private.connect_transition(s.id,'ENDED','blocked');
  end loop;
  return new;
end $$;
create trigger connect_block_guard after insert on public.blocks for each row execute function private.connect_block_guard();
create function private.connect_delete_guard() returns trigger language plpgsql security definer set search_path=pg_catalog as $$
begin
  perform private.connect_enqueue(old.id,'end',true);
  return old;
end $$;
create trigger connect_delete_guard before delete on private.connect_sessions for each row execute function private.connect_delete_guard();

-- Explicit grants only; private helpers never become public RPCs.
do $$ declare f record; begin
  for f in select p.oid::regprocedure sig,n.nspname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where (n.nspname='private' and p.proname like 'connect_%') or (n.nspname='public' and p.proname like 'rpc_connect_%') loop
    execute format('revoke all on function %s from public,anon,authenticated,service_role',f.sig);
    if f.nspname='public' then
      if f.sig::text ~ 'rpc_connect_(claim_job|worker_snapshot|complete_job|reconcile_media|enqueue_sync|sweep)\(' then
        execute format('grant execute on function %s to service_role',f.sig);
      else execute format('grant execute on function %s to authenticated',f.sig); end if;
    end if;
  end loop;
end $$;
commit;
