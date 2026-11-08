-- Local forward-only proposal. Not part of the frozen/installed Scope A package.
-- No feature, provider, budget or account-scope configuration is changed here.
begin;

create function public.rpc_connect_set_media_preference(p_media text, p_enabled boolean)
returns void language plpgsql security definer set search_path = pg_catalog as $$
declare actor uuid := auth.uid(); s private.connect_sessions;
begin
  if actor is null then raise exception using message='connect_unauthenticated'; end if;
  if p_media is null or p_media not in ('voice','video') or p_enabled is null then
    raise exception using message='connect_invalid_input';
  end if;
  -- Withdrawal remains available without an active match, consent or calling gate.
  if p_enabled then
    perform private.connect_actor();
    perform private.connect_rate('preferences',20);
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('connect-preferences:' || actor::text,0));
  insert into private.connect_preferences(user_id,voice,video)
    values(actor,p_media='voice' and p_enabled,p_media='video' and p_enabled)
    on conflict(user_id) do update set
      voice=case when p_media='voice' then p_enabled else connect_preferences.voice end,
      video=case when p_media='video' then p_enabled else connect_preferences.video end;
  if not p_enabled then
    for s in select * from private.connect_sessions where ended_at is null and media=p_media
      and actor in (caller_user_id,recipient_user_id)
      order by least(caller_profile_id,recipient_profile_id),greatest(caller_profile_id,recipient_profile_id),id loop
      perform private.relationship_lock_pair(s.caller_profile_id,s.recipient_profile_id);
      -- The existing transition owns terminality, occupancy and durable provider cleanup.
      perform private.connect_transition(s.id,'ENDED','consent_revoked');
    end loop;
  end if;
end $$;

create or replace function public.rpc_connect_set_preferences(p_voice boolean,p_video boolean)
returns void language plpgsql security definer set search_path = pg_catalog as $$
declare actor uuid := auth.uid(); current_video boolean;
begin
  if actor is null then raise exception using message='connect_unauthenticated'; end if;
  if p_voice is null or p_video is null then raise exception using message='connect_invalid_input'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('connect-preferences:' || actor::text,0));
  select video into current_video from private.connect_preferences where user_id=actor;
  -- Legacy voice screens may preserve existing video permission or withdraw it,
  -- but cannot reinstate a withdrawn video opt-in from a cached boolean pair.
  if p_video and not coalesce(current_video,false) then raise exception using message='connect_invalid_input'; end if;
  perform public.rpc_connect_set_media_preference('voice',p_voice);
  if not p_video then perform public.rpc_connect_set_media_preference('video',false); end if;
end $$;

revoke all on function public.rpc_connect_set_media_preference(text,boolean) from public,anon,authenticated,service_role;
grant execute on function public.rpc_connect_set_media_preference(text,boolean) to authenticated;
revoke all on function public.rpc_connect_set_preferences(boolean,boolean) from public,anon,authenticated,service_role;
grant execute on function public.rpc_connect_set_preferences(boolean,boolean) to authenticated;
commit;
