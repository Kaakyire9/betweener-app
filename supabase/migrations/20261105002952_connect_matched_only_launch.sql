-- Matched-only initial launch. Narrowing only: no budget, consent or production activation.
begin;
update private.connect_config set pre_match_enabled=false where singleton;
alter table private.connect_config add constraint connect_matched_only_launch check (not pre_match_enabled);

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
  -- Matched-only applies to refreshes too; cleanup work must still commit.
  if s.auth_mode <> 'matched' then
    perform private.connect_transition(s.id,'ENDING','revoked');
    return jsonb_build_object('admitted',false,'error','connect_disabled');
  end if;
  -- Existing active transports retain the prior ordinary-toggle refresh behaviour.
  if s.state in ('ACCEPTED','CONNECTING') and not private.connect_enabled(s.media,s.auth_mode) then
    return jsonb_build_object('admitted',false,'error','connect_disabled');
  end if;
  if s.state='ACCEPTED' then perform private.connect_transition(s.id,'CONNECTING'); end if;
  return jsonb_build_object('admitted',true,'id',s.id,'user_id',auth.uid(),
    'media',s.media,'call_type','betweener_connect','state',s.state);
end $$;


commit;
