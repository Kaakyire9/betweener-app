begin;

-- Hosting a Quick Connect Live and consenting to join its matchmaking pool are
-- independent roles. The creator remains the facilitator unless they
-- explicitly join the pool, at which point the same eligibility, consent and
-- safety rules used for every other member apply.
create or replace function public.rpc_join_live_quick_connect(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_user_id uuid := auth.uid();
  v_session public.live_sessions;
  v_control public.live_quick_connect_controls;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  select session.* into v_session
  from public.live_sessions session
  where session.id = p_session_id;

  if v_session.id is null
     or v_session.format <> 'quick_connect'
     or v_session.status not in ('live', 'backstage') then
    raise exception 'live_quick_connect_session_invalid' using errcode = '23514';
  end if;

  select control.* into v_control
  from public.live_quick_connect_controls control
  where control.session_id = p_session_id;

  if v_control.session_id is null then
    raise exception 'live_quick_connect_control_missing' using errcode = 'P0002';
  end if;

  if v_control.state in ('draining', 'ended') then
    raise exception 'live_quick_connect_not_accepting_members' using errcode = '55000';
  end if;

  return public.rpc_join_live_quick_connect_uncontrolled(p_session_id);
end;
$$;

revoke all on function public.rpc_join_live_quick_connect(uuid) from public, anon;
grant execute on function public.rpc_join_live_quick_connect(uuid) to authenticated;

create or replace function public.rpc_get_live_quick_connect_pool(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_user_id uuid := auth.uid();
  v_session public.live_sessions;
  v_control public.live_quick_connect_controls;
  v_me public.live_quick_connect_participants;
  v_members jsonb := '[]'::jsonb;
  v_queue jsonb := null;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  select session.* into v_session
  from public.live_sessions session
  where session.id = p_session_id;

  if v_session.id is null or v_session.format <> 'quick_connect' then
    raise exception 'live_quick_connect_session_invalid' using errcode = '23514';
  end if;

  if not exists (
    select 1 from public.live_participants participant
    where participant.session_id = p_session_id
      and participant.user_id = v_user_id
      and participant.state in ('audience', 'stage_requested', 'backstage', 'on_stage')
  ) then
    raise exception 'live_participant_required' using errcode = '42501';
  end if;

  select control.* into v_control
  from public.live_quick_connect_controls control
  where control.session_id = p_session_id;

  select participant.* into v_me
  from public.live_quick_connect_participants participant
  where participant.session_id = p_session_id
    and participant.user_id = v_user_id;

  if v_me.user_id is not null then
    perform public.live_quick_connect_sync(p_session_id);
    v_queue := public.rpc_get_live_quick_connect(p_session_id);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'user_id', member.user_id,
    'profile_id', member.profile_id,
    'full_name', profile.full_name,
    'avatar_url', profile.avatar_url,
    'age', profile.age,
    'city', coalesce(profile.city, profile.location),
    'expressed_interest', exists (
      select 1 from public.live_quick_connect_interests interest
      where interest.session_id = p_session_id
        and interest.from_user_id = v_user_id
        and interest.to_user_id = member.user_id
    )
  ) order by member.joined_at, member.user_id), '[]'::jsonb)
  into v_members
  from public.live_quick_connect_participants member
  join public.live_participants public_member
    on public_member.session_id = member.session_id
   and public_member.user_id = member.user_id
  join public.profiles profile
    on profile.id = member.profile_id
   and profile.user_id = member.user_id
  where member.session_id = p_session_id
    and member.state = 'waiting'
    and member.connection_state = 'connected'
    and public_member.state in ('audience', 'stage_requested', 'backstage', 'on_stage');

  return jsonb_build_object(
    'session_id', p_session_id,
    'control_state', coalesce(v_control.state, 'closed'),
    'creator_mode', coalesce(v_control.creator_mode, 'facilitator'),
    'server_now', timezone('utc', now()),
    'is_host', v_session.created_by_user_id = v_user_id,
    'is_opted_in', coalesce(v_me.state in ('waiting', 'paired', 'disconnected'), false),
    'my_state', coalesce(v_me.state, 'not_joined'),
    'can_opt_in', coalesce(v_control.state in ('closed', 'open', 'paused'), false),
    'members', v_members,
    'queue', v_queue
  );
end;
$$;

revoke all on function public.rpc_get_live_quick_connect_pool(uuid) from public, anon;
grant execute on function public.rpc_get_live_quick_connect_pool(uuid) to authenticated;

comment on function public.rpc_join_live_quick_connect(uuid) is
  'Explicitly enrolls any eligible Live participant, including the host, without changing their room role.';
comment on function public.rpc_get_live_quick_connect_pool(uuid) is
  'Returns the public Quick Connect pool and the caller private state; host membership is explicit, never automatic.';

commit;
