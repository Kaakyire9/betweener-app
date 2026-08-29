-- Prevent delayed participant-arrival UI from announcing members who have
-- already left. Identity remains available only through the existing bounded,
-- session-authorized RPC; current participation state is returned solely so
-- clients can suppress stale realtime presentation.
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

  select * into v_profile
  from public.profiles p
  where p.id = p_profile_id;

  return jsonb_build_object(
    'userId', v_participant.user_id,
    'profileId', v_participant.profile_id,
    'fullName', v_profile.full_name,
    'avatarUrl', public.live_profile_avatar(v_profile),
    'joinedAt', coalesce(v_participant.joined_at, v_participant.updated_at),
    'participantState', v_participant.state
  );
end;
$$;

revoke all on function public.rpc_get_live_member_summary(uuid, uuid) from public, anon;
grant execute on function public.rpc_get_live_member_summary(uuid, uuid) to authenticated, service_role;
