-- Local-only foundation. No deployment or calling enablement is implied.
begin;

alter table private.connect_config add column end_block_enabled boolean not null default false;
alter table private.connect_config add constraint connect_end_block_never_production
  check(environment <> 'production' or not end_block_enabled);
-- Request receipts only: public.blocks remains the sole account-block authority.
alter table private.connect_sessions add column end_block_requests jsonb not null default '{}'::jsonb
  check(jsonb_typeof(end_block_requests)='object');

create function private.connect_end_block_session(p_call uuid,p_peer uuid,p_generation timestamptz)
returns private.connect_sessions language plpgsql security definer set search_path=pg_catalog as $$
declare s private.connect_sessions; a uuid:=auth.uid(); v_peer uuid;
begin
  if a is null then raise exception using errcode='42501',message='connect_unauthenticated'; end if;
  select * into s from private.connect_sessions where id=p_call and a in(caller_user_id,recipient_user_id);
  if s.id is null then raise exception using errcode='42501',message='connect_unavailable'; end if;
  perform private.relationship_lock_pair(s.caller_profile_id,s.recipient_profile_id);
  select * into s from private.connect_sessions where id=p_call for update;
  v_peer:=case when a=s.caller_user_id then s.recipient_profile_id else s.caller_profile_id end;
  if p_peer is distinct from v_peer or p_generation is distinct from s.created_at
    or not exists(select 1 from public.profiles x join public.profiles y on y.id=s.recipient_profile_id
      where x.id=s.caller_profile_id and x.user_id=s.caller_user_id and y.user_id=s.recipient_user_id)
  then raise exception using errcode='42501',message='connect_unavailable'; end if;
  -- Safety withdrawal does not require an active match, grant, feature or device.
  return s;
end $$;

create function private.connect_end_block_context(s private.connect_sessions)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare a uuid:=auth.uid(); b public.blocks; revoked timestamptz; peer_user uuid; peer_profile uuid;
begin
  peer_user:=case when a=s.caller_user_id then s.recipient_user_id else s.caller_user_id end;
  peer_profile:=case when a=s.caller_user_id then s.recipient_profile_id else s.caller_profile_id end;
  -- Row locking also orders this command against existing direct DELETE/unblock.
  select * into b from public.blocks where blocker_id=a and blocked_id=peer_user for update;
  select revoked_at into revoked from private.relationship_consent_revocations
    where profile_a_id=least(s.caller_profile_id,s.recipient_profile_id)
      and profile_b_id=greatest(s.caller_profile_id,s.recipient_profile_id);
  return jsonb_build_object('call_id',s.id,'generation',s.created_at,'actor_user_id',a,
    'peer_user_id',peer_user,'peer_profile_id',peer_profile,'caller_profile_id',s.caller_profile_id,
    'recipient_profile_id',s.recipient_profile_id,'media',s.media,'authorization',s.auth_mode,
    'grant_id',s.grant_id,'block_id',b.id,'revocation_at',revoked);
end $$;

create function private.connect_end_block_receipt(s private.connect_sessions)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare r jsonb:=s.end_block_requests->(auth.uid()::text); saved boolean; job_status text;
begin
  if r is null then return null; end if;
  perform 1 from public.blocks where id=(r->>'block_id')::uuid and blocker_id=auth.uid()
    and blocked_id=(r->>'peer_user_id')::uuid for update;
  saved:=found;
  select status into job_status from private.connect_provider_jobs where call_id=s.id and operation='end';
  return jsonb_build_object('call_id',s.id,'generation',s.created_at,'actor_user_id',auth.uid(),
    'peer_user_id',r->>'peer_user_id','peer_profile_id',r->>'peer_profile_id','request_id',r->>'request_id',
    'block',case when saved then 'saved' else 'no_longer_saved' end,
    'call',case when s.ended_at is not null then 'terminal' else 'unconfirmed' end,
    'provider',case when exists(select 1 from private.connect_provider_jobs where call_id=s.id and operation='create' and status<>'done') then 'pending'
      when job_status='done' then 'acknowledged' when job_status is null then 'unconfirmed' else 'pending' end,
    'media','unverified');
end $$;

create function public.rpc_connect_end_block_context(p_call uuid,p_peer uuid,p_generation timestamptz)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare s private.connect_sessions;
begin
  s:=private.connect_end_block_session(p_call,p_peer,p_generation);
  if not exists(select 1 from private.connect_config where singleton and end_block_enabled and environment in('local','staging'))
    then raise exception using message='connect_disabled'; end if;
  return private.connect_end_block_context(s);
end $$;

create function public.rpc_connect_end_call_and_block(p_call uuid,p_peer uuid,p_generation timestamptz,p_key uuid,p_context jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare s private.connect_sessions; expected jsonb; prior jsonb; block_id uuid; a uuid:=auth.uid();
begin
  s:=private.connect_end_block_session(p_call,p_peer,p_generation);
  if p_key is null or p_context is null or jsonb_typeof(p_context)<>'object'
    then raise exception using message='connect_invalid_input'; end if;
  expected:=private.connect_end_block_context(s);
  if (p_context-array['block_id','revocation_at']) is distinct from (expected-array['block_id','revocation_at'])
    then raise exception using errcode='42501',message='connect_unavailable'; end if;
  prior:=s.end_block_requests->(a::text);
  if prior is not null then
    if prior->>'request_id' is distinct from p_key::text then raise exception using message='connect_idempotency_conflict'; end if;
    -- A replay only observes. It never recreates an unblocked/replaced block row.
    return private.connect_end_block_receipt(s);
  end if;
  if not exists(select 1 from private.connect_config where singleton and end_block_enabled and environment in('local','staging'))
    then raise exception using message='connect_disabled'; end if;
  if p_context is distinct from expected then raise exception using message='connect_conflict'; end if;
  block_id:=(expected->>'block_id')::uuid;
  if block_id is null then
    -- No upsert: the pair lock serializes insertion with existing authority paths.
    insert into public.blocks(blocker_id,blocked_id) values(a,(expected->>'peer_user_id')::uuid) returning id into block_id;
  end if;
  -- An already existing row does not invoke the INSERT-only Connect guard.
  perform private.connect_transition(s.id,'ENDED','blocked');
  perform private.connect_enqueue(s.id,'end');
  update private.connect_sessions set end_block_requests=jsonb_set(end_block_requests,array[a::text],
    jsonb_build_object('request_id',p_key,'block_id',block_id,'peer_user_id',expected->>'peer_user_id','peer_profile_id',p_peer),true)
    where id=s.id returning * into s;
  return private.connect_end_block_receipt(s);
end $$;

create function public.rpc_connect_end_block_status(p_call uuid,p_peer uuid,p_generation timestamptz)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare s private.connect_sessions;
begin
  s:=private.connect_end_block_session(p_call,p_peer,p_generation);
  return private.connect_end_block_receipt(s);
end $$;

revoke all on function private.connect_end_block_session(uuid,uuid,timestamptz),
  private.connect_end_block_context(private.connect_sessions),private.connect_end_block_receipt(private.connect_sessions)
  from public,anon,authenticated,service_role;
revoke all on function public.rpc_connect_end_block_context(uuid,uuid,timestamptz),
  public.rpc_connect_end_call_and_block(uuid,uuid,timestamptz,uuid,jsonb),public.rpc_connect_end_block_status(uuid,uuid,timestamptz)
  from public,anon,authenticated,service_role;
grant execute on function public.rpc_connect_end_block_context(uuid,uuid,timestamptz),
  public.rpc_connect_end_call_and_block(uuid,uuid,timestamptz,uuid,jsonb),public.rpc_connect_end_block_status(uuid,uuid,timestamptz)
  to authenticated;
commit;
