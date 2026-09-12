-- Host-visible audience roster and consent-first, targeted stage invitations.
-- Audience identity never leaves the capability-filtered session snapshot.

begin;

create table public.live_stage_invitations (
  id uuid primary key,
  session_id uuid not null references public.live_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  invited_by_user_id uuid not null references auth.users(id) on delete restrict,
  status text not null default 'pending',
  invited_at timestamptz not null default timezone('utc', now()),
  expires_at timestamptz not null,
  responded_at timestamptz,
  constraint live_stage_invitations_status_valid check (
    status in ('pending', 'accepted', 'declined', 'expired', 'cancelled')
  ),
  constraint live_stage_invitations_expiry_valid check (expires_at > invited_at),
  constraint live_stage_invitations_response_valid check (
    (status = 'pending' and responded_at is null)
    or (status <> 'pending' and responded_at is not null)
  )
);

create unique index live_stage_invitations_one_pending_per_member
  on public.live_stage_invitations(session_id, user_id)
  where status = 'pending';

create index live_stage_invitations_session_pending_idx
  on public.live_stage_invitations(session_id, expires_at)
  where status = 'pending';

alter table public.live_stage_invitations enable row level security;
alter table public.live_stage_invitations force row level security;

revoke all on table public.live_stage_invitations from public, anon, authenticated;
grant all on table public.live_stage_invitations to service_role;

create or replace function public.rpc_invite_live_stage_member_v1(
  p_session_id uuid,
  p_target_user_id uuid,
  p_invitation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_session public.live_sessions;
  v_participant public.live_participants;
  v_invitation public.live_stage_invitations;
  v_occupied_guest_seats integer;
  v_pending_invitations integer;
  v_maximum_guest_seats integer;
begin
  if auth.uid() is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_invitation_id is null or p_target_user_id is null then
    raise exception 'live_stage_invitation_target_required' using errcode = '22023';
  end if;
  if not public.has_live_capability(p_session_id, 'live.manage_stage') then
    raise exception 'live_stage_invitation_forbidden' using errcode = '42501';
  end if;

  -- Serialize invitations, promotions and capacity checks on the Live.
  perform pg_advisory_xact_lock(hashtextextended(p_session_id::text, 0));
  select * into v_session
  from public.live_sessions session
  where session.id = p_session_id
  for update;

  if v_session.id is null then
    raise exception 'live_session_not_found' using errcode = 'P0002';
  end if;
  if v_session.status <> 'live' then
    raise exception 'live_stage_invitation_unavailable' using errcode = '55000';
  end if;

  select * into v_participant
  from public.live_participants participant
  where participant.session_id = p_session_id
    and participant.user_id = p_target_user_id
  for update;

  if v_participant.id is null
     or v_participant.role = 'host'
     or v_participant.state <> 'audience' then
    raise exception 'live_stage_invitation_target_unavailable' using errcode = '55000';
  end if;

  update public.live_stage_invitations invitation
  set status = 'expired', responded_at = v_now
  where invitation.session_id = p_session_id
    and invitation.status = 'pending'
    and invitation.expires_at <= v_now;

  select * into v_invitation
  from public.live_stage_invitations invitation
  where invitation.id = p_invitation_id;

  if v_invitation.id is not null then
    if v_invitation.session_id <> p_session_id
       or v_invitation.user_id <> p_target_user_id
       or v_invitation.invited_by_user_id <> auth.uid() then
      raise exception 'live_stage_invitation_idempotency_conflict' using errcode = '23505';
    end if;
    return to_jsonb(v_invitation);
  end if;

  select * into v_invitation
  from public.live_stage_invitations invitation
  where invitation.session_id = p_session_id
    and invitation.user_id = p_target_user_id
    and invitation.status = 'pending'
  limit 1
  for update;

  if v_invitation.id is not null then
    return to_jsonb(v_invitation);
  end if;

  v_maximum_guest_seats := greatest(least(v_session.maximum_publishers, 4) - 1, 0);

  select count(distinct participant.user_id)
  into v_occupied_guest_seats
  from public.live_participants participant
  where participant.session_id = p_session_id
    and participant.role <> 'host'
    and participant.state in ('backstage', 'on_stage');

  select count(*)
  into v_pending_invitations
  from public.live_stage_invitations invitation
  where invitation.session_id = p_session_id
    and invitation.status = 'pending'
    and invitation.expires_at > v_now;

  if v_occupied_guest_seats + v_pending_invitations >= v_maximum_guest_seats then
    raise exception 'live_stage_capacity_reached' using errcode = '55000';
  end if;

  insert into public.live_stage_invitations (
    id, session_id, user_id, profile_id, invited_by_user_id,
    status, invited_at, expires_at
  ) values (
    p_invitation_id, p_session_id, p_target_user_id, v_participant.profile_id,
    auth.uid(), 'pending', v_now, v_now + interval '90 seconds'
  )
  returning * into v_invitation;

  insert into public.live_session_events (
    session_id, actor_user_id, event_type, to_state, metadata
  ) values (
    p_session_id,
    auth.uid(),
    'stage_invitation_sent',
    'pending',
    jsonb_build_object('targetUserId', p_target_user_id, 'expiresAt', v_invitation.expires_at)
  );

  insert into public.live_session_structure_updates as current_update (
    session_id, version, reason, updated_at
  ) values (
    p_session_id, 1, 'session_structure', v_now
  )
  on conflict (session_id) do update set
    version = current_update.version + 1,
    reason = excluded.reason,
    updated_at = excluded.updated_at;

  return to_jsonb(v_invitation);
end;
$$;

create or replace function public.rpc_respond_live_stage_invitation_v1(
  p_invitation_id uuid,
  p_accept boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_session public.live_sessions;
  v_participant public.live_participants;
  v_invitation public.live_stage_invitations;
  v_reserved_guest_seats integer;
  v_slot integer;
begin
  if auth.uid() is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_accept is null then
    raise exception 'live_stage_invitation_response_required' using errcode = '22023';
  end if;

  select * into v_invitation
  from public.live_stage_invitations invitation
  where invitation.id = p_invitation_id;

  if v_invitation.id is null or v_invitation.user_id <> auth.uid() then
    raise exception 'live_stage_invitation_not_found' using errcode = 'P0002';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_invitation.session_id::text, 0));
  select * into v_session
  from public.live_sessions session
  where session.id = v_invitation.session_id
  for update;

  select * into v_invitation
  from public.live_stage_invitations invitation
  where invitation.id = p_invitation_id
  for update;

  if v_invitation.status <> 'pending' then
    return to_jsonb(v_invitation);
  end if;

  if v_invitation.expires_at <= v_now then
    update public.live_stage_invitations invitation
    set status = 'expired', responded_at = v_now
    where invitation.id = p_invitation_id
    returning * into v_invitation;
  elsif not p_accept then
    update public.live_stage_invitations invitation
    set status = 'declined', responded_at = v_now
    where invitation.id = p_invitation_id
    returning * into v_invitation;
  else
    if v_session.id is null or v_session.status <> 'live' then
      raise exception 'live_stage_invitation_unavailable' using errcode = '55000';
    end if;

    select * into v_participant
    from public.live_participants participant
    where participant.session_id = v_invitation.session_id
      and participant.user_id = auth.uid()
    for update;

    if v_participant.id is null
       or v_participant.role = 'host'
       or v_participant.state not in ('audience', 'stage_requested') then
      raise exception 'live_stage_invitation_target_unavailable' using errcode = '55000';
    end if;

    select count(distinct participant.user_id) into v_reserved_guest_seats
    from public.live_participants participant
    where participant.session_id = v_invitation.session_id
      and participant.user_id <> auth.uid()
      and participant.role <> 'host'
      and participant.state in ('backstage', 'on_stage');

    if v_reserved_guest_seats >= greatest(least(v_session.maximum_publishers, 4) - 1, 0) then
      raise exception 'live_stage_capacity_reached' using errcode = '55000';
    end if;

    select slots.slot into v_slot
    from generate_series(1, least(v_session.maximum_publishers, 4)) slots(slot)
    where not exists (
      select 1 from public.live_participants occupied
      where occupied.session_id = v_invitation.session_id
        and occupied.stage_slot = slots.slot
    )
    order by slots.slot
    limit 1;

    if v_slot is null then
      raise exception 'live_stage_capacity_reached' using errcode = '55000';
    end if;

    update public.live_participants participant
    set state = 'on_stage',
        reconnect_state = null,
        stage_slot = v_slot,
        stage_joined_at = v_now,
        stage_left_at = null,
        microphone_muted_by_moderator = false,
        last_seen_at = v_now,
        updated_at = v_now
    where participant.id = v_participant.id;

    insert into public.live_session_capability_assignments (
      session_id, user_id, capability, effect, assigned_by_user_id
    ) values (
      v_invitation.session_id,
      auth.uid(),
      'live.publish',
      'grant',
      v_invitation.invited_by_user_id
    )
    on conflict (session_id, user_id, capability) do update set
      effect = excluded.effect,
      assigned_by_user_id = excluded.assigned_by_user_id,
      created_at = v_now;

    update public.live_seat_requests request
    set status = 'withdrawn', resolved_at = v_now, resolved_by_user_id = null
    where request.session_id = v_invitation.session_id
      and request.user_id = auth.uid()
      and request.status = 'pending';

    update public.live_stage_invitations invitation
    set status = 'accepted', responded_at = v_now
    where invitation.id = p_invitation_id
    returning * into v_invitation;
  end if;

  insert into public.live_session_events (
    session_id, actor_user_id, event_type, to_state, metadata
  ) values (
    v_invitation.session_id,
    auth.uid(),
    'stage_invitation_responded',
    v_invitation.status,
    jsonb_build_object(
      'accepted', v_invitation.status = 'accepted',
      'invitedByUserId', v_invitation.invited_by_user_id
    )
  );

  insert into public.live_session_structure_updates as current_update (
    session_id, version, reason, updated_at
  ) values (
    v_invitation.session_id, 1, 'session_structure', v_now
  )
  on conflict (session_id) do update set
    version = current_update.version + 1,
    reason = excluded.reason,
    updated_at = excluded.updated_at;

  return to_jsonb(v_invitation);
end;
$$;

-- The host sees only active audience members. Every other viewer receives an
-- empty audience projection and can see only their own pending invitation.
create or replace function public.rpc_get_live_session_snapshot(p_session_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_session public.live_sessions;
  v_me public.live_participants;
  v_can_manage_stage boolean;
begin
  if auth.uid() is null or not public.can_view_live_session(p_session_id, auth.uid()) then
    raise exception 'live_session_forbidden' using errcode = '42501';
  end if;

  select * into v_session from public.live_sessions where id = p_session_id;
  if v_session.id is null then
    raise exception 'live_session_not_found' using errcode = 'P0002';
  end if;

  select * into v_me from public.live_participants
  where session_id = p_session_id and user_id = auth.uid();

  v_can_manage_stage := public.has_live_capability(p_session_id, 'live.manage_stage');

  return jsonb_build_object(
    'session', to_jsonb(v_session),
    'me', case when v_me.id is null then null else to_jsonb(v_me) end,
    'capabilities', public.resolve_live_capabilities(p_session_id, auth.uid()),
    'stage', coalesce((select jsonb_agg(
        to_jsonb(participant) || jsonb_build_object(
          'full_name', profile.full_name,
          'avatar_url', public.live_profile_avatar(profile)
        ) order by case when participant.user_id = v_session.created_by_user_id then 0 else 1 end,
          participant.stage_slot nulls last, participant.stage_joined_at)
      from public.live_participants participant
      join public.profiles profile on profile.id = participant.profile_id
      where participant.session_id = p_session_id
        and (
          participant.state = 'on_stage'
          or (
            participant.user_id = v_session.created_by_user_id
            and participant.role = 'host'
            and v_session.status in ('live', 'ending')
            and participant.state not in ('removed', 'banned')
          )
        )), '[]'::jsonb),
    'backstage', case when v_can_manage_stage
      then coalesce((select jsonb_agg(
          to_jsonb(participant) || jsonb_build_object(
            'full_name', profile.full_name,
            'avatar_url', public.live_profile_avatar(profile)
          ) order by participant.joined_at)
        from public.live_participants participant
        join public.profiles profile on profile.id = participant.profile_id
        where participant.session_id = p_session_id
          and participant.state = 'backstage'
          and participant.role <> 'host'), '[]'::jsonb)
      else '[]'::jsonb end,
    'audience', case when v_can_manage_stage
      then coalesce((select jsonb_agg(
          to_jsonb(participant) || jsonb_build_object(
            'full_name', profile.full_name,
            'avatar_url', public.live_profile_avatar(profile)
          ) order by participant.joined_at desc nulls last)
        from public.live_participants participant
        join public.profiles profile on profile.id = participant.profile_id
        where participant.session_id = p_session_id
          and participant.state = 'audience'
          and participant.role <> 'host'), '[]'::jsonb)
      else '[]'::jsonb end,
    'audienceCount', (select count(*) from public.live_participants participant
      where participant.session_id = p_session_id
        and participant.state in ('audience', 'stage_requested')),
    'seatRequests', case when public.has_live_capability(p_session_id, 'live.approve_seat_request')
      then coalesce((select jsonb_agg(
          to_jsonb(request) || jsonb_build_object(
            'full_name', profile.full_name,
            'avatar_url', public.live_profile_avatar(profile)
          ) order by request.requested_at)
        from public.live_seat_requests request
        join public.profiles profile on profile.id = request.profile_id
        where request.session_id = p_session_id and request.status = 'pending'), '[]'::jsonb)
      else '[]'::jsonb end,
    'stageInvitations', case when v_can_manage_stage
      then coalesce((select jsonb_agg(to_jsonb(invitation) order by invitation.invited_at)
        from public.live_stage_invitations invitation
        where invitation.session_id = p_session_id
          and invitation.status = 'pending'
          and invitation.expires_at > timezone('utc', now())), '[]'::jsonb)
      else '[]'::jsonb end,
    'myStageInvitation', (select to_jsonb(invitation)
      from public.live_stage_invitations invitation
      where invitation.session_id = p_session_id
        and invitation.user_id = auth.uid()
        and invitation.status = 'pending'
        and invitation.expires_at > timezone('utc', now())
      order by invitation.invited_at desc
      limit 1),
    'commentCount', (select count(*) from public.live_comments comment
      where comment.session_id = p_session_id and comment.status = 'visible'),
    'comments', public.rpc_list_live_comments(p_session_id, 40, null)
  );
end;
$$;

revoke all on function public.rpc_invite_live_stage_member_v1(uuid, uuid, uuid),
  public.rpc_respond_live_stage_invitation_v1(uuid, boolean)
from public, anon;

grant execute on function public.rpc_invite_live_stage_member_v1(uuid, uuid, uuid),
  public.rpc_respond_live_stage_invitation_v1(uuid, boolean)
to authenticated, service_role;

commit;
