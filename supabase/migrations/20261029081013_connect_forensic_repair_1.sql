-- Forward-only local repair. No provider settings, flags or historical migrations change.
begin;

create or replace function public.rpc_connect_admission(p_call uuid,p_device uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare s private.connect_sessions;
begin
  perform private.connect_actor(); perform private.connect_rate('token',20);
  select * into s from private.connect_sessions where id=p_call and auth.uid() in (caller_user_id,recipient_user_id);
  if s.id is null then raise exception using errcode='42501',message='connect_unavailable'; end if;
  perform private.relationship_lock_pair(s.caller_profile_id,s.recipient_profile_id);
  perform private.connect_expire(s.id);
  select * into s from private.connect_sessions where id=p_call for update;
  -- Return normally after invalidation so terminal state and durable end work commit.
  -- Every consumer must require admitted=true, including the post-mint fence.
  if s.id is null or s.state not in ('ACCEPTED','CONNECTING','ACTIVE','RECONNECTING') or s.ended_at is not null then
    return jsonb_build_object('admitted',false,'error','connect_unavailable');
  end if;
  if p_device is null or p_device is distinct from
    (case when auth.uid()=s.caller_user_id then s.caller_device else s.recipient_device end) then
    return jsonb_build_object('admitted',false,'error','connect_device_conflict');
  end if;
  -- Existing active transports retain the prior ordinary-toggle refresh behaviour.
  if s.state in ('ACCEPTED','CONNECTING') and not private.connect_enabled(s.media,s.auth_mode) then
    return jsonb_build_object('admitted',false,'error','connect_disabled');
  end if;
  if s.state='ACCEPTED' then perform private.connect_transition(s.id,'CONNECTING'); end if;
  return jsonb_build_object('admitted',true,'id',s.id,'user_id',auth.uid(),
    'media',s.media,'call_type','betweener_connect','state',s.state);
end $$;

-- Preserve the RPC signature; p_ended now explicitly represents permanent CALL
-- termination (or confirmed absence), not a transient session ending.
create or replace function public.rpc_connect_reconcile_media(p_call uuid,p_session text,p_users uuid[],p_ended boolean)
returns void language plpgsql security definer set search_path=pg_catalog as $$
declare s private.connect_sessions;
begin
  select * into s from private.connect_sessions where id=p_call;
  if s.id is null then return; end if;
  perform private.relationship_lock_pair(s.caller_profile_id,s.recipient_profile_id);
  perform private.connect_expire(s.id);
  select * into s from private.connect_sessions where id=p_call for update;
  if s.ended_at is not null or s.state='ENDING' then return; end if;
  -- Call-level terminality takes precedence over absent/stale session metadata.
  -- Keep the last real session ID; never invent one or mark media verified.
  if p_ended is true then
    perform private.connect_transition(p_call,'ENDED','provider_ended'); return;
  end if;
  if s.state not in ('CONNECTING','ACTIVE','RECONNECTING') then return; end if;
  if p_session is null then
    if s.state='ACTIVE' then perform private.connect_transition(p_call,'RECONNECTING'); end if;
    return;
  end if;
  if length(p_session)>200 then return; end if;
  if s.provider_session_id is not null and s.provider_session_id<>p_session then
    perform private.connect_transition(p_call,'FAILED','provider_session_changed'); return;
  end if;
  if exists(select 1 from unnest(p_users)u where u not in (s.caller_user_id,s.recipient_user_id)) then
    perform private.connect_transition(p_call,'FAILED','provider_membership_invalid'); return;
  end if;
  update private.connect_sessions set provider_session_id=p_session where id=p_call;
  if s.caller_user_id=any(p_users) and s.recipient_user_id=any(p_users) then
    perform private.connect_transition(p_call,'ACTIVE');
  elsif s.state='ACTIVE' then perform private.connect_transition(p_call,'RECONNECTING'); end if;
end $$;

revoke all on function public.rpc_connect_admission(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.rpc_connect_admission(uuid,uuid) to authenticated;
revoke all on function public.rpc_connect_reconcile_media(uuid,text,uuid[],boolean) from public,anon,authenticated,service_role;
grant execute on function public.rpc_connect_reconcile_media(uuid,text,uuid[],boolean) to service_role;
commit;
