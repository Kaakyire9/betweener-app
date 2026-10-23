begin;

-- A false availability value used to mean either "not answered" or the
-- deliberate audience-only choice. Keep the user's one-time decision
-- explicit so the Live canvas can retire the prompt after either choice.
alter table public.live_participants
  add column if not exists introduction_preference_decided_at timestamptz;

update public.live_participants
set introduction_preference_decided_at = coalesce(updated_at, created_at, timezone('utc', now()))
where open_to_introductions
  and introduction_preference_decided_at is null;

create or replace function public.rpc_set_live_introduction_availability(
  p_session_id uuid,
  p_open boolean
)
returns public.live_participants
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_participant public.live_participants;
begin
  if auth.uid() is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  select * into v_participant
  from public.live_participants
  where session_id = p_session_id and user_id = auth.uid()
  for update;

  if v_participant.id is null
     or v_participant.role = 'host'
     or v_participant.state not in ('confirmed', 'audience', 'stage_requested', 'backstage', 'on_stage') then
    raise exception 'live_introduction_availability_forbidden' using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.live_match_rounds round_row
    where round_row.session_id = p_session_id
      and auth.uid() in (round_row.participant_a_user_id, round_row.participant_b_user_id)
      and round_row.state in ('proposed', 'awaiting_consent', 'both_accepted', 'public_introduction')
      and (
        round_row.state <> 'awaiting_consent'
        or round_row.expires_at > timezone('utc', now())
      )
  ) then
    raise exception 'live_introduction_round_active' using errcode = '22023';
  end if;

  update public.live_participants
  set open_to_introductions = p_open,
      introduction_preference_decided_at = timezone('utc', now())
  where id = v_participant.id
  returning * into v_participant;

  insert into public.live_session_events(session_id, actor_user_id, event_type, metadata)
  values (
    p_session_id,
    auth.uid(),
    'introduction_availability_updated',
    jsonb_build_object('open', p_open, 'decision_explicit', true)
  );

  return v_participant;
end;
$$;

revoke all on function public.rpc_set_live_introduction_availability(uuid, boolean)
from public, anon, authenticated;
grant execute on function public.rpc_set_live_introduction_availability(uuid, boolean)
to authenticated, service_role;

-- The formation ceremony is public because the same pair was already named
-- during public_introduction. Identity is projected only for a short window;
-- all durable private consent and media information remains excluded.
create or replace function public.rpc_get_live_private_activity_v1(p_session_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_hosted_pairs integer := 0;
  v_quick_pairs integer := 0;
  v_latest_round_id uuid;
  v_latest_activated_at timestamptz;
  v_latest_formation jsonb;
begin
  if auth.uid() is null or not public.can_view_live_session(p_session_id, auth.uid()) then
    raise exception 'live_private_activity_forbidden' using errcode = '42501';
  end if;

  select count(*)::integer
  into v_hosted_pairs
  from public.live_private_sparks spark
  where spark.session_id = p_session_id
    and spark.state = 'active'
    and (spark.active_expires_at is null or spark.active_expires_at > timezone('utc', now()));

  select count(*)::integer
  into v_quick_pairs
  from public.live_quick_connect_pairings pairing
  where pairing.session_id = p_session_id
    and pairing.state in ('active', 'reconnect_grace')
    and (
      pairing.state = 'active' and pairing.ends_at > timezone('utc', now())
      or pairing.state = 'reconnect_grace'
        and pairing.reconnect_deadline is not null
        and pairing.reconnect_deadline > timezone('utc', now())
    );

  select spark.match_round_id, spark.activated_at
  into v_latest_round_id, v_latest_activated_at
  from public.live_private_sparks spark
  where spark.session_id = p_session_id
    and spark.state = 'active'
    and spark.activated_at is not null
    and (spark.active_expires_at is null or spark.active_expires_at > timezone('utc', now()))
  order by spark.activated_at desc
  limit 1;

  select jsonb_build_object(
    'round_id', round_row.id,
    'activated_at', spark.activated_at,
    'participant_a', jsonb_build_object(
      'user_id', round_row.participant_a_user_id,
      'profile_id', profile_a.id,
      'full_name', profile_a.full_name,
      'avatar_url', public.live_profile_avatar(profile_a),
      'age', null,
      'city', null
    ),
    'participant_b', jsonb_build_object(
      'user_id', round_row.participant_b_user_id,
      'profile_id', profile_b.id,
      'full_name', profile_b.full_name,
      'avatar_url', public.live_profile_avatar(profile_b),
      'age', null,
      'city', null
    )
  )
  into v_latest_formation
  from public.live_private_sparks spark
  join public.live_match_rounds round_row on round_row.id = spark.match_round_id
  join public.profiles profile_a on profile_a.id = round_row.participant_a_profile_id
  join public.profiles profile_b on profile_b.id = round_row.participant_b_profile_id
  where spark.session_id = p_session_id
    and spark.state = 'active'
    and spark.activated_at is not null
    and round_row.introduction_started_at is not null
    and spark.activated_at >= timezone('utc', now()) - interval '20 seconds'
    and (spark.active_expires_at is null or spark.active_expires_at > timezone('utc', now()))
  order by spark.activated_at desc
  limit 1;

  return jsonb_build_object(
    'session_id', p_session_id,
    'hosted_pair_count', v_hosted_pairs,
    'quick_connect_pair_count', v_quick_pairs,
    'latest_hosted_pair_round_id', v_latest_round_id,
    'latest_hosted_pair_activated_at', v_latest_activated_at,
    'latest_hosted_pair_formation', v_latest_formation,
    'server_now', timezone('utc', now())
  );
end;
$$;

revoke all on function public.rpc_get_live_private_activity_v1(uuid)
from public, anon, authenticated;
grant execute on function public.rpc_get_live_private_activity_v1(uuid)
to authenticated, service_role;

comment on function public.rpc_get_live_private_activity_v1(uuid) is
  'Count-only private activity plus a time-limited replay-safe public formation for a pair already introduced on stage.';

commit;
