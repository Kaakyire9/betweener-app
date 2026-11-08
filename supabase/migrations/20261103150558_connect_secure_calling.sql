-- Local proposal. Does not activate either feature or change existing call policy.
begin;
alter table private.connect_config
  add column native_incoming_enabled boolean not null default false,
  add column e2ee_enabled boolean not null default false,
  add constraint connect_secure_calling_environment check(environment <> 'production' or (not native_incoming_enabled and not e2ee_enabled));
alter table private.connect_sessions
  add column encryption_required boolean not null default false,
  add column native_incoming boolean not null default false;

create table private.connect_secure_devices (
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id uuid not null, public_key text not null check(public_key ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default clock_timestamp(), revoked_at timestamptz,
  primary key(user_id,device_id)
);
create table private.connect_key_envelopes (
  call_id uuid not null references private.connect_sessions(id) on delete cascade,
  user_id uuid not null, device_id uuid not null,
  nonce text not null check(nonce ~ '^[0-9a-f]{48}$'),
  ciphertext text not null check(ciphertext ~ '^[0-9a-f]+$' and length(ciphertext) between 64 and 4096 and length(ciphertext)%2=0),
  primary key(call_id,user_id,device_id),
  foreign key(user_id,device_id) references private.connect_secure_devices(user_id,device_id) on delete cascade
);
alter table private.connect_secure_devices enable row level security;
alter table private.connect_key_envelopes enable row level security;
revoke all on private.connect_secure_devices,private.connect_key_envelopes from public,anon,authenticated,service_role;

create function private.connect_pin_secure_call() returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare c private.connect_config;
begin
  select * into strict c from private.connect_config where singleton;
  new.encryption_required := c.e2ee_enabled and c.environment in ('local','staging');
  new.native_incoming := c.native_incoming_enabled and c.environment in ('local','staging');
  if new.encryption_required and (not exists(select 1 from private.connect_secure_devices d where d.user_id=new.caller_user_id
      and d.device_id=new.caller_device and d.revoked_at is null)
    or not exists(select 1 from private.connect_secure_devices d where d.user_id=new.recipient_user_id and d.revoked_at is null)) then
    raise exception using message='connect_encryption_unavailable';
  end if;
  return new;
end $$;
create trigger connect_pin_secure_call before insert on private.connect_sessions for each row execute function private.connect_pin_secure_call();

create or replace function private.connect_snapshot(p_call uuid) returns jsonb language sql stable security definer set search_path=pg_catalog as $$
  select jsonb_build_object('id',id,'caller_profile_id',caller_profile_id,'recipient_profile_id',recipient_profile_id,
    'media',media,'authorization',auth_mode,'state',state,'version',version,'created_at',created_at,
    'accepted_at',accepted_at,'connected_at',connected_at,'ended_at',ended_at,'deadline',deadline,'reason',reason,
    'duration_seconds',case when connected_at is not null and ended_at is not null then greatest(0,floor(extract(epoch from ended_at-connected_at))) end,
    'encryption_required',encryption_required,'native_incoming',native_incoming,'grant_id',grant_id)
  from private.connect_sessions where id=p_call;
$$;

create function public.rpc_connect_security_capabilities() returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
begin
  perform private.connect_actor();
  return (select jsonb_build_object('e2ee',e2ee_enabled and environment in ('local','staging'),
    'native_incoming',native_incoming_enabled and environment in ('local','staging')) from private.connect_config where singleton);
end $$;
create function public.rpc_connect_register_secure_device(p_device uuid,p_public_key text) returns boolean language plpgsql security definer set search_path=pg_catalog as $$
begin
  perform private.connect_actor(); perform private.connect_rate('secure_device',10);
  if p_device is null or p_public_key is null or p_public_key !~ '^[0-9a-f]{64}$' then raise exception using message='connect_invalid_input'; end if;
  if not exists(select 1 from private.connect_config where singleton and environment in ('local','staging') and (e2ee_enabled or native_incoming_enabled)) then
    raise exception using message='connect_disabled';
  end if;
  -- Serialize the per-account device limit and forbid silent key replacement.
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,731));
  if exists(select 1 from private.connect_secure_devices where user_id=auth.uid() and device_id=p_device and (revoked_at is not null or public_key<>p_public_key)) then
    raise exception using message='connect_device_key_changed';
  end if;
  if not exists(select 1 from private.connect_secure_devices where user_id=auth.uid() and device_id=p_device)
     and (select count(*) from private.connect_secure_devices where user_id=auth.uid() and revoked_at is null)>=4 then
    raise exception using message='connect_device_limit';
  end if;
  insert into private.connect_secure_devices(user_id,device_id,public_key) values(auth.uid(),p_device,p_public_key) on conflict do nothing;
  return true;
end $$;

create function public.rpc_connect_peer_key_context(p_peer uuid,p_media text,p_authorization text,p_grant uuid default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare actor uuid:=private.connect_actor(); peer_user uuid;
begin
  perform private.connect_rate('identity_review',20);
  if not exists(select 1 from private.connect_config where singleton and e2ee_enabled and environment in ('local','staging'))
    or not private.connect_authorized(actor,p_peer,p_media,p_authorization,p_grant) then raise exception using message='connect_unavailable'; end if;
  select user_id into strict peer_user from public.profiles where id=p_peer;
  return jsonb_build_object('peer_user_id',peer_user,'devices',
    (select coalesce(jsonb_agg(jsonb_build_object('user_id',user_id,'device_id',device_id,'public_key',public_key) order by user_id,device_id),'[]'::jsonb)
    from private.connect_secure_devices where user_id in (auth.uid(),peer_user) and revoked_at is null));
end $$;

create function public.rpc_connect_key_context(p_call uuid,p_device uuid) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare s private.connect_sessions;
begin
  perform private.connect_actor(); perform private.connect_rate('call_keys',60);
  select * into s from private.connect_sessions where id=p_call;
  if s.id is null or not (auth.uid() in (s.caller_user_id,s.recipient_user_id)) or not s.encryption_required
    or s.ended_at is not null or s.state='ENDING' or clock_timestamp() >= s.created_at+interval '24 hours'
    or not private.connect_enabled(s.media,s.auth_mode)
    or not private.connect_authorized(s.caller_profile_id,s.recipient_profile_id,s.media,s.auth_mode,s.grant_id)
    or not exists(select 1 from private.connect_secure_devices where user_id=auth.uid() and device_id=p_device and revoked_at is null)
    or (auth.uid()=s.caller_user_id and p_device<>s.caller_device)
    or (auth.uid()=s.recipient_user_id and s.recipient_device is not null and p_device<>s.recipient_device) then
    raise exception using message='connect_unavailable';
  end if;
  return jsonb_build_object('call_id',s.id,'generation',s.created_at,'media',s.media,'caller_user_id',s.caller_user_id,
    'recipient_user_id',s.recipient_user_id,'caller_device',s.caller_device,'expires_at',s.created_at+interval '24 hours',
    'devices',(select coalesce(jsonb_agg(jsonb_build_object('user_id',user_id,'device_id',device_id,'public_key',public_key) order by user_id,device_id),'[]'::jsonb)
      from private.connect_secure_devices where user_id in (s.caller_user_id,s.recipient_user_id) and revoked_at is null),
    -- A participant can retrieve only ciphertext addressed to this exact device.
    'envelopes',(select coalesce(jsonb_agg(jsonb_build_object('user_id',user_id,'device_id',device_id,'nonce',nonce,'ciphertext',ciphertext)),'[]'::jsonb)
      from private.connect_key_envelopes where call_id=s.id and user_id=auth.uid() and device_id=p_device));
end $$;

create function public.rpc_connect_publish_key_envelopes(p_call uuid,p_device uuid,p_generation timestamptz,p_envelopes jsonb)
returns boolean language plpgsql security definer set search_path=pg_catalog as $$
declare s private.connect_sessions; e jsonb; targets integer;
begin
  perform public.rpc_connect_key_context(p_call,p_device);
  select * into strict s from private.connect_sessions where id=p_call for update;
  if s.ended_at is not null or s.state='ENDING' or auth.uid()<>s.caller_user_id or p_device<>s.caller_device or p_generation is distinct from s.created_at then
    raise exception using message='connect_unavailable';
  end if;
  if jsonb_typeof(p_envelopes) is distinct from 'array' or jsonb_array_length(p_envelopes) not between 2 and 5 or octet_length(p_envelopes::text)>24000 then
    raise exception using message='connect_invalid_input';
  end if;
  if exists(select 1 from private.connect_key_envelopes where call_id=p_call) then return false; end if;
  select count(*) into targets from private.connect_secure_devices where revoked_at is null
    and ((user_id=s.caller_user_id and device_id=s.caller_device) or user_id=s.recipient_user_id);
  if jsonb_array_length(p_envelopes)<>targets or (select count(distinct (x->>'user_id',x->>'device_id')) from jsonb_array_elements(p_envelopes) x)<>targets then
    raise exception using message='connect_invalid_input';
  end if;
  for e in select * from jsonb_array_elements(p_envelopes) loop
    if jsonb_typeof(e) is distinct from 'object' or (select count(*) from jsonb_object_keys(e))<>4
      or not exists(select 1 from private.connect_secure_devices d where d.user_id=(e->>'user_id')::uuid and d.device_id=(e->>'device_id')::uuid
        and d.revoked_at is null and ((d.user_id=s.caller_user_id and d.device_id=s.caller_device) or d.user_id=s.recipient_user_id)) then
      raise exception using message='connect_invalid_input';
    end if;
    insert into private.connect_key_envelopes(call_id,user_id,device_id,nonce,ciphertext)
      values(p_call,(e->>'user_id')::uuid,(e->>'device_id')::uuid,e->>'nonce',e->>'ciphertext');
  end loop;
  return true;
end $$;

-- Existing admission/consent/device fences run first. No alternative token issuer.
create function public.rpc_connect_secure_admission(p_call uuid,p_device uuid) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare admission jsonb; s private.connect_sessions;
begin
  admission := public.rpc_connect_admission(p_call,p_device);
  select * into strict s from private.connect_sessions where id=p_call for update;
  if s.encryption_required then
    perform public.rpc_connect_key_context(p_call,p_device);
    if not exists(select 1 from private.connect_key_envelopes where call_id=p_call and user_id=auth.uid() and device_id=p_device) then
      raise exception using message='connect_encryption_unavailable';
    end if;
  end if;
  return admission;
end $$;
create function public.rpc_connect_revoke_secure_device(p_device uuid) returns boolean language plpgsql security definer set search_path=pg_catalog as $$
declare s private.connect_sessions;
begin
  perform private.connect_actor();
  update private.connect_secure_devices set revoked_at=coalesce(revoked_at,clock_timestamp()) where user_id=auth.uid() and device_id=p_device;
  for s in select * from private.connect_sessions where ended_at is null
    and ((caller_user_id=auth.uid() and caller_device=p_device) or (recipient_user_id=auth.uid() and recipient_device=p_device)) order by id for update loop
    perform private.connect_transition(s.id,'ENDED','device_revoked');
  end loop;
  return true;
end $$;
create function private.connect_discard_terminal_keys() returns trigger language plpgsql security definer set search_path=pg_catalog as $$
begin
  if new.ended_at is not null then delete from private.connect_key_envelopes where call_id=new.id; end if;
  return new;
end $$;
create trigger connect_discard_terminal_keys after update of ended_at on private.connect_sessions for each row execute function private.connect_discard_terminal_keys();

revoke all on function private.connect_pin_secure_call(),private.connect_discard_terminal_keys() from public,anon,authenticated,service_role;
revoke all on function public.rpc_connect_security_capabilities(),public.rpc_connect_register_secure_device(uuid,text),
  public.rpc_connect_peer_key_context(uuid,text,text,uuid),
  public.rpc_connect_key_context(uuid,uuid),public.rpc_connect_publish_key_envelopes(uuid,uuid,timestamptz,jsonb),
  public.rpc_connect_secure_admission(uuid,uuid),public.rpc_connect_revoke_secure_device(uuid) from public,anon,authenticated,service_role;
grant execute on function public.rpc_connect_security_capabilities(),public.rpc_connect_register_secure_device(uuid,text),
  public.rpc_connect_peer_key_context(uuid,text,text,uuid),
  public.rpc_connect_key_context(uuid,uuid),public.rpc_connect_publish_key_envelopes(uuid,uuid,timestamptz,jsonb),
  public.rpc_connect_secure_admission(uuid,uuid),public.rpc_connect_revoke_secure_device(uuid) to authenticated;
-- Native push destinations are private, session-bound and reconciled by the
-- existing authenticated worker. Tokens are never returned to app readers.
create table private.connect_native_destinations (
  token_hash text primary key, push_token text check(push_token is null or length(push_token) between 16 and 4096),
  platform text not null check(platform in ('ios','android')),
  desired_user uuid references auth.users(id) on delete set null, desired_device uuid, auth_session uuid,
  possible_users uuid[] not null default '{}', generation bigint not null default 1,
  status text not null default 'pending' check(status in ('pending','working','done')),
  available_at timestamptz not null default clock_timestamp(), lease uuid, lease_until timestamptz,
  attempts integer not null default 0, last_error text
);
create index connect_native_destinations_due on private.connect_native_destinations(status,available_at);
create index connect_native_destinations_session on private.connect_native_destinations(auth_session) where desired_user is not null;
alter table private.connect_native_destinations enable row level security;
revoke all on private.connect_native_destinations from public,anon,authenticated,service_role;

create function public.rpc_connect_native_device_intent(p_device uuid,p_platform text,p_token text,p_register boolean)
returns boolean language plpgsql security definer set search_path=pg_catalog as $$
declare h text; session_id uuid; existing private.connect_native_destinations;
begin
  perform private.connect_actor(); perform private.connect_rate('native_device',20);
  if p_device is null or p_platform is null or p_platform not in ('ios','android') or p_token is null
     or length(p_token) not between 16 and 4096 or p_token ~ '[[:space:]]' or p_register is null then raise exception using message='connect_invalid_input'; end if;
  session_id := nullif(auth.jwt()->>'session_id','')::uuid;
  if p_register and (session_id is null or not exists(select 1 from auth.sessions where id=session_id and user_id=auth.uid() and (not_after is null or not_after>clock_timestamp()))
    or not exists(select 1 from private.connect_config where singleton and native_incoming_enabled and environment in ('local','staging'))
    or not exists(select 1 from private.connect_preferences where user_id=auth.uid() and (voice or video))
    or not exists(select 1 from private.connect_secure_devices where user_id=auth.uid() and device_id=p_device and revoked_at is null)) then
    raise exception using message='connect_unavailable';
  end if;
  h := encode(sha256(convert_to(p_token,'UTF8')),'hex');
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,733));
  perform pg_advisory_xact_lock(hashtextextended(h,732));
  select * into existing from private.connect_native_destinations where token_hash=h for update;
  if not p_register and (existing.desired_user is distinct from auth.uid() or existing.desired_device is distinct from p_device) then return true; end if;
  if p_register and existing.desired_user=auth.uid() and existing.desired_device=p_device and existing.auth_session=session_id and existing.platform=p_platform then return true; end if;
  if p_register and cardinality(existing.possible_users)>=8 and not (auth.uid()=any(existing.possible_users)) then raise exception using message='connect_busy'; end if;
  if p_register and existing.desired_user is distinct from auth.uid() and (select count(*) from private.connect_native_destinations where desired_user=auth.uid())>=4 then
    raise exception using message='connect_device_limit';
  end if;
  insert into private.connect_native_destinations(token_hash,push_token,platform,desired_user,desired_device,auth_session)
    values(h,p_token,p_platform,case when p_register then auth.uid() end,p_device,session_id)
  on conflict(token_hash) do update set push_token=excluded.push_token,platform=excluded.platform,desired_user=case when p_register then auth.uid() end,
    desired_device=p_device,auth_session=session_id,generation=private.connect_native_destinations.generation+1,
    available_at=clock_timestamp(),status=case when private.connect_native_destinations.status='working' then 'working' else 'pending' end;
  return true;
end $$;

create function public.rpc_connect_claim_native_destination() returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare d private.connect_native_destinations; permitted boolean;
begin
  select native_incoming_enabled and environment in ('local','staging') into permitted from private.connect_config where singleton;
  select * into d from private.connect_native_destinations x where
    (x.status='pending' and x.available_at<=clock_timestamp()) or (x.status='working' and x.lease_until<=clock_timestamp())
    or (x.status='done' and cardinality(x.possible_users)>0 and
      ((x.available_at<=clock_timestamp() and (cardinality(x.possible_users)>1 or x.desired_user is null))
      or (x.desired_user is not null and (not coalesce(permitted,false)
      or not exists(select 1 from private.connect_preferences p where p.user_id=x.desired_user and (p.voice or p.video))
      or not exists(select 1 from auth.sessions s where s.id=x.auth_session and s.user_id=x.desired_user and (s.not_after is null or s.not_after>clock_timestamp()))
      or not exists(select 1 from private.connect_secure_devices k where k.user_id=x.desired_user and k.device_id=x.desired_device and k.revoked_at is null)))))
    order by (x.desired_user is not null),x.available_at,x.token_hash for update skip locked limit 1;
  if d.token_hash is null then return null; end if;
  if not coalesce(permitted,false) or not exists(select 1 from auth.sessions where id=d.auth_session and user_id=d.desired_user and (not_after is null or not_after>clock_timestamp()))
    or not exists(select 1 from private.connect_preferences where user_id=d.desired_user and (voice or video))
    or not exists(select 1 from private.connect_secure_devices where user_id=d.desired_user and device_id=d.desired_device and revoked_at is null) then d.desired_user:=null; end if;
  update private.connect_native_destinations set desired_user=d.desired_user,status='working',lease=gen_random_uuid(),
    lease_until=clock_timestamp()+interval '45 seconds',attempts=attempts+1,
    possible_users=array(select distinct v from unnest(possible_users||array[d.desired_user])v where v is not null)
    where token_hash=d.token_hash returning * into d;
  return jsonb_build_object('token_hash',d.token_hash,'token',d.push_token,'platform',d.platform,'user_id',d.desired_user,
    'possible_users',d.possible_users,'generation',d.generation,'lease',d.lease);
end $$;
-- Recheck ownership immediately before provider registration. A provider write
-- already in flight cannot be fenced remotely: retain all possible owners and
-- periodically reconcile done rows rather than forgetting a delayed old write.
create function public.rpc_connect_native_destination_current(p_hash text,p_generation bigint,p_lease uuid)
returns boolean language sql stable security definer set search_path=pg_catalog as $$
  select exists(select 1 from private.connect_native_destinations d
    join private.connect_config c on c.singleton
    join auth.sessions s on s.id=d.auth_session and s.user_id=d.desired_user
    join private.connect_preferences p on p.user_id=d.desired_user
    join private.connect_secure_devices k on k.user_id=d.desired_user and k.device_id=d.desired_device
    where d.token_hash=p_hash and d.generation=p_generation and d.lease=p_lease and d.status='working'
      and d.lease_until>clock_timestamp() and c.native_incoming_enabled and c.environment in ('local','staging')
      and (s.not_after is null or s.not_after>clock_timestamp()) and (p.voice or p.video) and k.revoked_at is null);
$$;
create function public.rpc_connect_complete_native_destination(p_hash text,p_generation bigint,p_lease uuid,p_success boolean)
returns boolean language plpgsql security definer set search_path=pg_catalog as $$
declare d private.connect_native_destinations;
begin
  select * into d from private.connect_native_destinations where token_hash=p_hash for update;
  if d.token_hash is null or d.lease is distinct from p_lease or d.status<>'working' then raise exception using message='connect_conflict'; end if;
  -- A changed desired owner cannot be acknowledged by an earlier worker.
  if d.generation<>p_generation then
    update private.connect_native_destinations set status='pending',lease=null,lease_until=null where token_hash=p_hash;
    return false;
  end if;
  update private.connect_native_destinations set status=case when p_success then 'done' else 'pending' end,
    -- Retain private removal tombstones: an expired provider request can finish
    -- late even after a later removal ACK. No automatic purge may discard this
    -- reconciliation obligation. Tokens are never exposed by public RPCs.
    available_at=clock_timestamp()+make_interval(secs=>case when p_success then 300 else least(300,5*power(2,least(attempts,6))::integer) end),
    lease=null,lease_until=null,last_error=case when p_success then null else 'provider_unconfirmed' end
    where token_hash=p_hash;
  return true;
end $$;
revoke all on function public.rpc_connect_native_device_intent(uuid,text,text,boolean),public.rpc_connect_claim_native_destination(),
  public.rpc_connect_native_destination_current(text,bigint,uuid),
  public.rpc_connect_complete_native_destination(text,bigint,uuid,boolean) from public,anon,authenticated,service_role;
grant execute on function public.rpc_connect_native_device_intent(uuid,text,text,boolean) to authenticated;
grant execute on function public.rpc_connect_claim_native_destination(),public.rpc_connect_native_destination_current(text,bigint,uuid),public.rpc_connect_complete_native_destination(text,bigint,uuid,boolean) to service_role;
commit;
