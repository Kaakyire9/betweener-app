-- Synchronize the host-selected Quick Connect stage composition to every
-- participant through the existing content-free Quick Connect invalidation.

begin;

alter table public.live_quick_connect_controls
  add column if not exists stage_layout text not null default 'stacked';

alter table public.live_quick_connect_controls
  drop constraint if exists live_quick_connect_controls_stage_layout_check;

alter table public.live_quick_connect_controls
  add constraint live_quick_connect_controls_stage_layout_check
  check (stage_layout in ('stacked', 'side-by-side'));

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
    'stage_layout', coalesce(v_control.stage_layout, 'stacked'),
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

revoke all on function public.rpc_get_live_quick_connect_pool(uuid)
from public, anon;
grant execute on function public.rpc_get_live_quick_connect_pool(uuid)
to authenticated;

create or replace function public.rpc_set_live_quick_connect_stage_layout(
  p_session_id uuid,
  p_stage_layout text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_user_id uuid := auth.uid();
  v_session public.live_sessions;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_stage_layout not in ('stacked', 'side-by-side') then
    raise exception 'live_quick_connect_stage_layout_invalid' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('quick:' || p_session_id::text, 0));

  select session.* into v_session
  from public.live_sessions session
  where session.id = p_session_id
  for update;

  if v_session.id is null or v_session.format <> 'quick_connect' then
    raise exception 'live_quick_connect_session_invalid' using errcode = '23514';
  end if;
  if v_session.created_by_user_id <> v_user_id then
    raise exception 'live_quick_connect_control_forbidden' using errcode = '42501';
  end if;

  update public.live_quick_connect_controls control
  set stage_layout = p_stage_layout,
      updated_by_user_id = v_user_id
  where control.session_id = p_session_id;

  if not found then
    raise exception 'live_quick_connect_control_missing' using errcode = 'P0002';
  end if;

  return public.rpc_get_live_quick_connect_pool(p_session_id);
end;
$$;

revoke all on function public.rpc_set_live_quick_connect_stage_layout(uuid, text)
from public, anon;
grant execute on function public.rpc_set_live_quick_connect_stage_layout(uuid, text)
to authenticated;

comment on function public.rpc_set_live_quick_connect_stage_layout(uuid, text) is
  'Lets only the Live creator choose the shared Quick Connect stage composition; the control update emits a content-free realtime invalidation.';

commit;
