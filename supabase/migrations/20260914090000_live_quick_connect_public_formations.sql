begin;

-- A successful Quick Connect pairing leaves the already-public pool. Give
-- every room participant the same short, deterministic ceremony explaining
-- that departure. Private interest, eligibility and decision data stay out of
-- this projection.
alter table public.live_quick_connect_pairings
  add column if not exists public_formation_starts_at timestamptz;

create index if not exists live_quick_public_formation_session_idx
  on public.live_quick_connect_pairings(session_id, public_formation_starts_at)
  where public_formation_starts_at is not null;

create or replace function public.schedule_live_quick_connect_public_formation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_now timestamptz := now();
  v_latest_start timestamptz;
begin
  perform pg_advisory_xact_lock(
    hashtextextended('live-quick-public-formation:' || new.session_id::text, 0)
  );

  select max(pairing.public_formation_starts_at)
  into v_latest_start
  from public.live_quick_connect_pairings pairing
  where pairing.session_id = new.session_id
    and pairing.public_formation_starts_at > v_now - interval '3.9 seconds';

  new.public_formation_starts_at := greatest(
    v_now,
    coalesce(v_latest_start + interval '3.9 seconds', v_now)
  );
  return new;
end;
$$;

revoke all on function public.schedule_live_quick_connect_public_formation()
from public, anon, authenticated;

drop trigger if exists live_quick_schedule_public_formation
on public.live_quick_connect_pairings;
create trigger live_quick_schedule_public_formation
before insert on public.live_quick_connect_pairings
for each row execute function public.schedule_live_quick_connect_public_formation();

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
  v_preference public.live_quick_connect_preferences;
  v_members jsonb := '[]'::jsonb;
  v_public_formations jsonb := '[]'::jsonb;
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
    select 1
    from public.live_participants participant
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

  select preference.* into v_preference
  from public.live_quick_connect_preferences preference
  where preference.user_id = v_user_id;

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
      select 1
      from public.live_quick_connect_interests interest
      where interest.session_id = p_session_id
        and interest.from_user_id = v_user_id
        and interest.to_user_id = member.user_id
    )
  ) order by member.waiting_since, member.user_id), '[]'::jsonb)
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
    and member.last_seen_at >= now() - interval '45 seconds'
    and public_member.state in ('audience', 'stage_requested', 'backstage', 'on_stage')
    and not public.live_quick_connect_has_active_safety_hold(member.user_id);

  select coalesce(jsonb_agg(jsonb_build_object(
    'pairing_id', pairing.id,
    'starts_at', pairing.public_formation_starts_at,
    'participant_a', jsonb_build_object(
      'user_id', pairing.participant_a_user_id,
      'profile_id', pairing.participant_a_profile_id,
      'full_name', profile_a.full_name,
      'avatar_url', profile_a.avatar_url
    ),
    'participant_b', jsonb_build_object(
      'user_id', pairing.participant_b_user_id,
      'profile_id', pairing.participant_b_profile_id,
      'full_name', profile_b.full_name,
      'avatar_url', profile_b.avatar_url
    )
  ) order by pairing.public_formation_starts_at, pairing.id), '[]'::jsonb)
  into v_public_formations
  from public.live_quick_connect_pairings pairing
  join public.profiles profile_a
    on profile_a.id = pairing.participant_a_profile_id
   and profile_a.user_id = pairing.participant_a_user_id
  join public.profiles profile_b
    on profile_b.id = pairing.participant_b_profile_id
   and profile_b.user_id = pairing.participant_b_user_id
  where pairing.session_id = p_session_id
    and pairing.public_formation_starts_at is not null
    and pairing.public_formation_starts_at >= now() - interval '5 seconds'
    and pairing.public_formation_starts_at <= now() + interval '45 seconds';

  return jsonb_build_object(
    'session_id', p_session_id,
    'stage_layout', coalesce(v_control.stage_layout, 'stacked'),
    'control_state', coalesce(v_control.state, 'closed'),
    'creator_mode', 'facilitator',
    'server_now', now(),
    'is_host', v_session.created_by_user_id = v_user_id,
    'is_opted_in', coalesce(v_me.state in ('waiting', 'paired', 'disconnected'), false),
    'my_state', coalesce(v_me.state, 'not_joined'),
    'can_opt_in', coalesce(
      v_session.created_by_user_id <> v_user_id
      and v_control.state in ('closed', 'open', 'paused')
      and not public.live_quick_connect_has_active_safety_hold(v_user_id), false
    ),
    'connection_intent', v_preference.connection_intent,
    'gender_preferences', coalesce(to_jsonb(v_preference.allowed_genders), '[]'::jsonb),
    'members', v_members,
    'public_formations', v_public_formations,
    'queue', v_queue
  );
end;
$$;

revoke all on function public.rpc_get_live_quick_connect_pool(uuid)
from public, anon;
grant execute on function public.rpc_get_live_quick_connect_pool(uuid)
to authenticated;

comment on column public.live_quick_connect_pairings.public_formation_starts_at is
  'Server-owned start time for the successful-pair ceremony visible to the Quick Connect room.';
comment on function public.schedule_live_quick_connect_public_formation() is
  'Serializes concurrent Quick Connect pair ceremonies into deterministic 3.9 second presentation slots.';
comment on function public.rpc_get_live_quick_connect_pool(uuid) is
  'Public Quick Connect pool and successful formation ceremonies plus caller-private queue state.';

commit;
