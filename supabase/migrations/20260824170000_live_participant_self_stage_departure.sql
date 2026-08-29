-- Let a guest step down without leaving the Live. The transition is
-- server-authoritative and idempotent so refreshes cannot resurrect a stale
-- publisher state.

create or replace function public.rpc_leave_live_stage(p_session_id uuid)
returns public.live_participants
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_session public.live_sessions;
  v_participant public.live_participants;
begin
  if auth.uid() is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  select * into v_session
  from public.live_sessions s
  where s.id = p_session_id
  for update;

  if v_session.id is null then
    raise exception 'live_session_not_found' using errcode = 'P0002';
  end if;

  select * into v_participant
  from public.live_participants lp
  where lp.session_id = p_session_id
    and lp.user_id = auth.uid()
  for update;

  if v_participant.id is null then
    raise exception 'live_participant_not_found' using errcode = 'P0002';
  end if;
  if v_participant.role = 'host' or v_session.created_by_user_id = auth.uid() then
    raise exception 'live_host_cannot_leave_stage' using errcode = '42501';
  end if;
  if v_participant.state = 'audience' then
    return v_participant;
  end if;
  if v_participant.state <> 'on_stage' then
    raise exception 'live_stage_departure_invalid' using errcode = '22023';
  end if;

  update public.live_participants
  set state = 'audience',
      stage_slot = null,
      stage_left_at = timezone('utc'::text, now()),
      microphone_muted_by_moderator = false,
      last_seen_at = timezone('utc'::text, now()),
      updated_at = timezone('utc'::text, now())
  where id = v_participant.id
  returning * into v_participant;

  insert into public.live_session_capability_assignments (
    session_id, user_id, capability, effect, assigned_by_user_id
  ) values (
    p_session_id, auth.uid(), 'live.publish', 'revoke', auth.uid()
  )
  on conflict (session_id, user_id, capability)
  do update set
    effect = excluded.effect,
    assigned_by_user_id = excluded.assigned_by_user_id,
    updated_at = timezone('utc'::text, now());

  insert into public.live_session_events (
    session_id, actor_user_id, event_type, metadata
  ) values (
    p_session_id,
    auth.uid(),
    'participant_demoted',
    jsonb_build_object('targetUserId', auth.uid(), 'selfInitiated', true)
  );

  return v_participant;
end;
$$;

create or replace function public.rpc_get_live_member_summary(
  p_session_id uuid,
  p_profile_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_participant public.live_participants;
  v_profile public.profiles;
begin
  if auth.uid() is null or not public.can_view_live_session(p_session_id, auth.uid()) then
    raise exception 'live_session_forbidden' using errcode = '42501';
  end if;

  select * into v_participant
  from public.live_participants lp
  where lp.session_id = p_session_id
    and lp.profile_id = p_profile_id
  limit 1;

  if v_participant.id is null then
    raise exception 'live_participant_not_found' using errcode = 'P0002';
  end if;

  select * into v_profile from public.profiles p where p.id = p_profile_id;

  return jsonb_build_object(
    'userId', v_participant.user_id,
    'profileId', v_participant.profile_id,
    'fullName', v_profile.full_name,
    'avatarUrl', public.live_profile_avatar(v_profile),
    'joinedAt', coalesce(v_participant.joined_at, v_participant.updated_at)
  );
end;
$$;

revoke all on function public.rpc_leave_live_stage(uuid) from public, anon;
revoke all on function public.rpc_get_live_member_summary(uuid, uuid) from public, anon;
grant execute on function public.rpc_leave_live_stage(uuid) to authenticated, service_role;
grant execute on function public.rpc_get_live_member_summary(uuid, uuid) to authenticated, service_role;
