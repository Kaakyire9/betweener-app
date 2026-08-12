-- Betweener Live Phase 2: public-beta participation, stage, conversation,
-- reporting and moderation authority. Stream transports media only; every
-- durable product decision remains transactional in Supabase.

begin;

alter table public.live_participants
  add column if not exists rsvp_status text not null default 'none',
  add column if not exists microphone_muted_by_moderator boolean not null default false,
  add column if not exists last_connection_change_at timestamptz;

alter table public.live_participants
  drop constraint if exists live_participants_rsvp_status_valid;
alter table public.live_participants
  add constraint live_participants_rsvp_status_valid
  check (rsvp_status in ('none','invited','going','waitlisted','declined'));

alter table public.live_moderation_actions
  add column if not exists client_action_id uuid;

create unique index if not exists live_moderation_actions_client_id_unique
  on public.live_moderation_actions(session_id, actor_user_id, client_action_id)
  where client_action_id is not null;

create table public.live_comments (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.live_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  client_comment_id uuid not null,
  body text not null,
  status text not null default 'visible',
  moderated_by_user_id uuid references auth.users(id) on delete set null,
  moderated_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint live_comments_body_length check (char_length(btrim(body)) between 1 and 500),
  constraint live_comments_status_valid check (status in ('visible','removed','held')),
  constraint live_comments_moderation_valid check (
    (status = 'visible' and moderated_at is null and moderated_by_user_id is null)
    or status = 'held'
    or (status = 'removed' and moderated_at is not null and moderated_by_user_id is not null)
  ),
  constraint live_comments_client_id_unique unique(session_id, user_id, client_comment_id)
);

create table public.live_reactions (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.live_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  client_event_id uuid not null,
  reaction text not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint live_reactions_value_valid check (reaction in ('heart','spark','applause','support')),
  constraint live_reactions_client_id_unique unique(session_id, user_id, client_event_id)
);

create table public.live_reports (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.live_sessions(id) on delete cascade,
  reporter_user_id uuid not null references auth.users(id) on delete cascade,
  reporter_profile_id uuid not null references public.profiles(id) on delete cascade,
  target_user_id uuid references auth.users(id) on delete set null,
  target_comment_id uuid references public.live_comments(id) on delete set null,
  client_report_id uuid not null,
  reason text not null,
  details text,
  status text not null default 'open',
  created_at timestamptz not null default timezone('utc', now()),
  resolved_at timestamptz,
  constraint live_reports_reason_valid check (reason in ('harassment','hate','sexual_content','spam','impersonation','unsafe_behaviour','other')),
  constraint live_reports_details_length check (details is null or char_length(details) <= 1000),
  constraint live_reports_status_valid check (status in ('open','reviewing','resolved','dismissed')),
  constraint live_reports_target_valid check (target_user_id is not null or target_comment_id is not null),
  constraint live_reports_client_id_unique unique(session_id, reporter_user_id, client_report_id)
);

create table public.live_provider_control_jobs (
  id bigint generated always as identity primary key,
  moderation_action_id uuid not null references public.live_moderation_actions(id) on delete cascade,
  session_id uuid not null references public.live_sessions(id) on delete cascade,
  target_user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  status text not null default 'pending',
  attempt_count integer not null default 0,
  last_error text,
  created_at timestamptz not null default timezone('utc', now()),
  processed_at timestamptz,
  constraint live_provider_control_jobs_action_valid check (action in ('mute','unmute','remove','suspend')),
  constraint live_provider_control_jobs_status_valid check (status in ('pending','processing','processed','retryable_failed','terminal_failed')),
  constraint live_provider_control_jobs_action_unique unique(moderation_action_id)
);

create index live_comments_session_feed_idx
  on public.live_comments(session_id, created_at desc)
  where status = 'visible';
create index live_reactions_session_recent_idx
  on public.live_reactions(session_id, created_at desc);
create index live_reports_status_idx
  on public.live_reports(status, created_at desc);
create index live_provider_control_jobs_pending_idx
  on public.live_provider_control_jobs(status, created_at)
  where status in ('pending','retryable_failed');
create index live_participants_session_rsvp_idx
  on public.live_participants(session_id, rsvp_status, state);

create trigger live_comments_set_updated_at
before update on public.live_comments
for each row execute function public.set_updated_at();

-- Public-beta reconnects are deliberately narrow. Removed and banned users
-- can never revive themselves; a voluntary leave may rejoin a still-live room.
create or replace function public.enforce_live_participant_transition()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
begin
  if new.state is not distinct from old.state then return new; end if;
  if not (
    (old.state = 'invited' and new.state in ('confirmed','waitlisted','backstage','audience','removed','banned'))
    or (old.state = 'confirmed' and new.state in ('waitlisted','backstage','audience','left','removed','banned'))
    or (old.state = 'waitlisted' and new.state in ('confirmed','backstage','audience','left','removed','banned'))
    or (old.state = 'backstage' and new.state in ('audience','on_stage','temporarily_disconnected','left','removed','banned'))
    or (old.state = 'audience' and new.state in ('stage_requested','on_stage','temporarily_disconnected','left','removed','banned'))
    or (old.state = 'stage_requested' and new.state in ('backstage','audience','on_stage','temporarily_disconnected','left','removed','banned'))
    or (old.state = 'on_stage' and new.state in ('backstage','audience','private_spark','temporarily_disconnected','left','removed','banned'))
    or (old.state = 'private_spark' and new.state in ('on_stage','audience','temporarily_disconnected','left','removed','banned'))
    or (old.state = 'temporarily_disconnected' and new.state in ('backstage','audience','stage_requested','on_stage','left','removed','banned'))
    or (old.state = 'left' and new.state in ('confirmed','audience','banned'))
    or (old.state = 'removed' and new.state = 'banned')
  ) then
    raise exception 'invalid_live_participant_transition:%:%', old.state, new.state using errcode = '23514';
  end if;
  return new;
end;
$$;

-- Keep the host's participant state aligned with the room lifecycle. Slot
-- one is reserved in backstage so guests can never displace the host.
create or replace function public.sync_live_host_participant_state()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
begin
  if new.status = old.status then return new; end if;
  if new.status = 'backstage' then
    update public.live_participants
    set state='backstage',stage_slot=1,last_seen_at=timezone('utc',now())
    where session_id=new.id and user_id=new.created_by_user_id and role='host'
      and state in ('invited','confirmed','waitlisted');
  elsif new.status = 'live' then
    update public.live_participants
    set state='on_stage',stage_slot=1,
        stage_joined_at=coalesce(stage_joined_at,timezone('utc',now())),
        stage_left_at=null,last_seen_at=timezone('utc',now())
    where session_id=new.id and user_id=new.created_by_user_id and role='host'
      and state='backstage';
  end if;
  return new;
end;
$$;

drop trigger if exists live_sessions_sync_host_participant on public.live_sessions;
create trigger live_sessions_sync_host_participant
after update of status on public.live_sessions
for each row execute function public.sync_live_host_participant_state();

create or replace function public.live_active_profile(p_user_id uuid default auth.uid())
returns public.profiles
language plpgsql
stable
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_profile public.profiles;
begin
  if p_user_id is null or (p_user_id is distinct from auth.uid() and coalesce(auth.role(),'') <> 'service_role') then
    raise exception 'live_profile_forbidden' using errcode = '42501';
  end if;
  select * into v_profile from public.profiles p
  where p.user_id = p_user_id and p.deleted_at is null and p.account_state = 'active'
    and p.profile_completed is true
  limit 1;
  if v_profile.id is null
     or (coalesce(v_profile.verification_level,0) < 1 and not public.is_admin_user(p_user_id)) then
    raise exception 'live_profile_ineligible' using errcode = '42501';
  end if;
  return v_profile;
end;
$$;

create or replace function public.rpc_list_live_sessions(
  p_limit integer default 20,
  p_before timestamptz default null
)
returns table(
  id uuid,
  title text,
  description text,
  format text,
  status text,
  context_type text,
  context_id uuid,
  circle_id uuid,
  created_by_profile_id uuid,
  scheduled_start timestamptz,
  started_at timestamptz,
  maximum_publishers integer,
  rsvp_status text,
  participant_state text,
  audience_count bigint,
  stage_count bigint
)
language sql
stable
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
  select
    s.id,s.title,s.description,s.format,s.status,s.context_type,s.context_id,s.circle_id,
    s.created_by_profile_id,s.scheduled_start,s.started_at,least(s.maximum_publishers,4),
    coalesce(me.rsvp_status,'none'),coalesce(me.state,'invited'),
    (select count(*) from public.live_participants a where a.session_id=s.id and a.state in ('audience','stage_requested')),
    (select count(*) from public.live_participants st where st.session_id=s.id and st.state='on_stage')
  from public.live_sessions s
  left join public.live_participants me on me.session_id=s.id and me.user_id=auth.uid()
  where auth.uid() is not null
    and s.status in ('scheduled','waiting_for_quorum','confirmed','backstage','live')
    and (p_before is null or coalesce(s.scheduled_start,s.created_at) < p_before)
    and public.can_view_live_session(s.id,auth.uid())
  order by case when s.status='live' then 0 else 1 end, coalesce(s.scheduled_start,s.created_at)
  limit greatest(1,least(coalesce(p_limit,20),50));
$$;

create or replace function public.rpc_can_schedule_live_session()
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
  select exists(
    select 1 from public.live_creator_eligibility e
    where e.user_id=auth.uid() and e.enabled
      and (e.expires_at is null or e.expires_at > timezone('utc',now()))
      and 'global'=any(e.allowed_context_types)
  ) or public.is_admin_user(auth.uid());
$$;

create or replace function public.rpc_schedule_live_session(
  p_title text,
  p_description text,
  p_scheduled_start timestamptz
)
returns public.live_sessions
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare v_session public.live_sessions;
begin
  if not public.rpc_can_schedule_live_session() then
    raise exception 'live_schedule_forbidden' using errcode='42501';
  end if;
  if p_scheduled_start < timezone('utc',now())+interval '10 minutes'
     or p_scheduled_start > timezone('utc',now())+interval '90 days' then
    raise exception 'live_schedule_time_invalid' using errcode='22023';
  end if;
  v_session := public.rpc_create_live_session(
    p_title,'hosted_match_night','global',null,null,null,p_scheduled_start
  );
  update public.live_sessions
  set description=nullif(btrim(p_description),''),maximum_publishers=4,
      recording_enabled=false,configuration=configuration || jsonb_build_object('beta','public_v1')
  where id=v_session.id returning * into v_session;
  return v_session;
end;
$$;

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
begin
  if auth.uid() is null or not public.can_view_live_session(p_session_id,auth.uid()) then
    raise exception 'live_session_forbidden' using errcode='42501';
  end if;
  select * into v_session from public.live_sessions where id=p_session_id;
  if v_session.id is null then raise exception 'live_session_not_found' using errcode='P0002'; end if;
  select * into v_me from public.live_participants where session_id=p_session_id and user_id=auth.uid();
  return jsonb_build_object(
    'session',to_jsonb(v_session),
    'me',case when v_me.id is null then null else to_jsonb(v_me) end,
    'capabilities',public.resolve_live_capabilities(p_session_id,auth.uid()),
    'stage',coalesce((select jsonb_agg(
        to_jsonb(p) || jsonb_build_object(
          'full_name',pr.full_name,
          'avatar_url',pr.avatar_url
        ) order by p.stage_slot nulls last,p.stage_joined_at)
      from public.live_participants p
      join public.profiles pr on pr.id=p.profile_id
      where p.session_id=p_session_id and p.state='on_stage'),'[]'::jsonb),
    'backstage',case when public.has_live_capability(p_session_id,'live.manage_stage')
      then coalesce((select jsonb_agg(
          to_jsonb(p) || jsonb_build_object('full_name',pr.full_name,'avatar_url',pr.avatar_url)
          order by p.joined_at)
        from public.live_participants p
        join public.profiles pr on pr.id=p.profile_id
        where p.session_id=p_session_id and p.state='backstage' and p.role <> 'host'),'[]'::jsonb)
      else '[]'::jsonb end,
    'audienceCount',(select count(*) from public.live_participants p
      where p.session_id=p_session_id and p.state in ('audience','stage_requested')),
    'seatRequests',case when public.has_live_capability(p_session_id,'live.approve_seat_request')
      then coalesce((select jsonb_agg(
          to_jsonb(r) || jsonb_build_object('full_name',pr.full_name,'avatar_url',pr.avatar_url)
          order by r.requested_at)
        from public.live_seat_requests r
        join public.profiles pr on pr.id=r.profile_id
        where r.session_id=p_session_id and r.status='pending'),'[]'::jsonb)
      else '[]'::jsonb end,
    'comments',coalesce((select jsonb_agg(
        to_jsonb(c) || jsonb_build_object('full_name',pr.full_name,'avatar_url',pr.avatar_url)
        order by c.created_at)
      from (select * from public.live_comments lc where lc.session_id=p_session_id and lc.status='visible'
        order by lc.created_at desc limit 80) c
      join public.profiles pr on pr.id=c.profile_id),'[]'::jsonb)
  );
end;
$$;

create or replace function public.rpc_rsvp_live_session(
  p_session_id uuid,
  p_attending boolean,
  p_open_to_introductions boolean default false
)
returns public.live_participants
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_profile public.profiles;
  v_session public.live_sessions;
  v_participant public.live_participants;
begin
  v_profile := public.live_active_profile(auth.uid());
  select * into v_session from public.live_sessions where id=p_session_id for update;
  if v_session.id is null or v_session.status not in ('scheduled','waiting_for_quorum','confirmed')
     or not public.can_view_live_session(p_session_id,auth.uid()) then
    raise exception 'live_rsvp_unavailable' using errcode='42501';
  end if;
  select * into v_participant from public.live_participants
    where session_id=p_session_id and user_id=auth.uid() for update;
  if v_participant.state in ('removed','banned') then raise exception 'live_rsvp_forbidden' using errcode='42501'; end if;
  if v_participant.id is null then
    insert into public.live_participants(session_id,user_id,profile_id,origin_context_type,origin_context_id,role,state,rsvp_status,open_to_introductions)
    values(p_session_id,auth.uid(),v_profile.id,v_session.context_type,v_session.context_id,'audience','confirmed',
      case when p_attending then 'going' else 'declined' end,p_open_to_introductions)
    returning * into v_participant;
    insert into public.live_participant_roles(session_id,user_id,role,assigned_by_user_id)
    values(p_session_id,auth.uid(),'audience',auth.uid()) on conflict do nothing;
  else
    update public.live_participants set
      rsvp_status=case when p_attending then 'going' else 'declined' end,
      state=case when p_attending and state in ('invited','left') then 'confirmed' else state end,
      open_to_introductions=p_open_to_introductions
    where id=v_participant.id returning * into v_participant;
  end if;
  insert into public.live_session_events(session_id,actor_user_id,event_type,metadata)
  values(p_session_id,auth.uid(),'rsvp_updated',jsonb_build_object('attending',p_attending));
  return v_participant;
end;
$$;

create or replace function public.rpc_join_live_session(p_session_id uuid)
returns public.live_participants
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_profile public.profiles;
  v_session public.live_sessions;
  v_participant public.live_participants;
begin
  v_profile := public.live_active_profile(auth.uid());
  select * into v_session from public.live_sessions where id=p_session_id for update;
  if v_session.id is null or v_session.status <> 'live'
     or not public.can_view_live_session(p_session_id,auth.uid()) then
    raise exception 'live_join_unavailable' using errcode='42501';
  end if;
  select * into v_participant from public.live_participants
    where session_id=p_session_id and user_id=auth.uid() for update;
  if v_participant.state in ('removed','banned') then raise exception 'live_join_forbidden' using errcode='42501'; end if;
  if v_participant.id is null then
    insert into public.live_participants(session_id,user_id,profile_id,origin_context_type,origin_context_id,role,state,rsvp_status,joined_at,last_seen_at)
    values(p_session_id,auth.uid(),v_profile.id,v_session.context_type,v_session.context_id,'audience','audience','going',timezone('utc',now()),timezone('utc',now()))
    returning * into v_participant;
    insert into public.live_participant_roles(session_id,user_id,role,assigned_by_user_id)
    values(p_session_id,auth.uid(),'audience',auth.uid()) on conflict do nothing;
  else
    update public.live_participants set
      state=case when state in ('invited','confirmed','waitlisted','left','temporarily_disconnected') then 'audience' else state end,
      rsvp_status='going',joined_at=coalesce(joined_at,timezone('utc',now())),last_seen_at=timezone('utc',now()),left_at=null
    where id=v_participant.id returning * into v_participant;
  end if;
  insert into public.live_session_events(session_id,actor_user_id,event_type,to_state)
  values(p_session_id,auth.uid(),'participant_joined',v_participant.state);
  return v_participant;
end;
$$;

create or replace function public.rpc_leave_live_session(p_session_id uuid)
returns public.live_participants
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare v_participant public.live_participants;
begin
  select * into v_participant from public.live_participants
  where session_id=p_session_id and user_id=auth.uid() for update;
  if v_participant.id is null then raise exception 'live_participant_not_found' using errcode='P0002'; end if;
  if v_participant.state in ('left','removed','banned') then return v_participant; end if;
  update public.live_participants set state='left',stage_slot=null,left_at=timezone('utc',now()),last_seen_at=timezone('utc',now())
  where id=v_participant.id returning * into v_participant;
  delete from public.live_session_capability_assignments
  where session_id=p_session_id and user_id=auth.uid() and capability='live.publish' and effect='grant';
  insert into public.live_session_events(session_id,actor_user_id,event_type,to_state)
  values(p_session_id,auth.uid(),'participant_left','left');
  return v_participant;
end;
$$;

create or replace function public.rpc_request_live_seat(p_session_id uuid)
returns public.live_seat_requests
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_participant public.live_participants;
  v_request public.live_seat_requests;
begin
  select * into v_participant from public.live_participants
  where session_id=p_session_id and user_id=auth.uid() for update;
  if v_participant.id is null or v_participant.state not in ('audience','stage_requested')
     or not public.has_live_capability(p_session_id,'live.request_seat') then
    raise exception 'live_seat_request_forbidden' using errcode='42501';
  end if;
  select * into v_request from public.live_seat_requests
  where session_id=p_session_id and user_id=auth.uid() and status='pending' limit 1;
  if v_request.id is not null then return v_request; end if;
  insert into public.live_seat_requests(session_id,user_id,profile_id)
  values(p_session_id,auth.uid(),v_participant.profile_id) returning * into v_request;
  if v_participant.state='audience' then
    update public.live_participants set state='stage_requested' where id=v_participant.id;
  end if;
  insert into public.live_session_events(session_id,actor_user_id,event_type,to_state)
  values(p_session_id,auth.uid(),'seat_requested','stage_requested');
  return v_request;
end;
$$;

create or replace function public.rpc_withdraw_live_seat_request(p_session_id uuid)
returns public.live_seat_requests
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare v_request public.live_seat_requests;
begin
  select * into v_request from public.live_seat_requests
  where session_id=p_session_id and user_id=auth.uid() and status='pending' for update;
  if v_request.id is null then raise exception 'live_seat_request_not_found' using errcode='P0002'; end if;
  update public.live_seat_requests set status='withdrawn',resolved_at=timezone('utc',now())
  where id=v_request.id returning * into v_request;
  update public.live_participants set state='audience'
  where session_id=p_session_id and user_id=auth.uid() and state='stage_requested';
  return v_request;
end;
$$;

create or replace function public.rpc_resolve_live_seat_request(p_request_id uuid,p_approve boolean)
returns public.live_participants
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_request public.live_seat_requests;
  v_participant public.live_participants;
begin
  select * into v_request from public.live_seat_requests where id=p_request_id for update;
  if v_request.id is null then raise exception 'live_seat_request_not_found' using errcode='P0002'; end if;
  if not public.has_live_capability(v_request.session_id,'live.approve_seat_request') then
    raise exception 'live_seat_resolution_forbidden' using errcode='42501';
  end if;
  select * into v_participant from public.live_participants where session_id=v_request.session_id and user_id=v_request.user_id for update;
  if v_request.status <> 'pending' then return v_participant; end if;
  update public.live_seat_requests set status=case when p_approve then 'approved' else 'declined' end,
    resolved_at=timezone('utc',now()),resolved_by_user_id=auth.uid() where id=v_request.id;
  update public.live_participants set state=case when p_approve then 'backstage' else 'audience' end
  where id=v_participant.id returning * into v_participant;
  insert into public.live_session_events(session_id,actor_user_id,event_type,to_state,metadata)
  values(v_request.session_id,auth.uid(),'seat_request_resolved',v_participant.state,
    jsonb_build_object('targetUserId',v_request.user_id,'approved',p_approve));
  return v_participant;
end;
$$;

create or replace function public.rpc_set_live_stage_participant(
  p_session_id uuid,
  p_target_user_id uuid,
  p_on_stage boolean
)
returns public.live_participants
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_session public.live_sessions;
  v_participant public.live_participants;
  v_slot integer;
  v_publishers integer;
begin
  if not public.has_live_capability(p_session_id,'live.manage_stage') then
    raise exception 'live_stage_manage_forbidden' using errcode='42501';
  end if;
  select * into v_session from public.live_sessions where id=p_session_id for update;
  select * into v_participant from public.live_participants where session_id=p_session_id and user_id=p_target_user_id for update;
  if v_session.id is null or v_participant.id is null then raise exception 'live_stage_target_not_found' using errcode='P0002'; end if;
  if p_target_user_id=v_session.created_by_user_id and not p_on_stage then
    raise exception 'live_host_cannot_be_demoted' using errcode='22023';
  end if;
  if p_on_stage then
    if v_session.status not in ('backstage','live') or v_participant.state not in ('backstage','audience','stage_requested','temporarily_disconnected','on_stage') then
      raise exception 'live_stage_promotion_invalid' using errcode='22023';
    end if;
    if v_participant.state='on_stage' then return v_participant; end if;
    select count(*) into v_publishers from public.live_participants p
      where p.session_id=p_session_id and (p.state='on_stage' or p.role='host') and p.state not in ('left','removed','banned');
    if v_publishers >= least(v_session.maximum_publishers,4) then
      raise exception 'live_stage_capacity_reached' using errcode='23514';
    end if;
    select slots.slot into v_slot from generate_series(1,least(v_session.maximum_publishers,4)) as slots(slot)
      where not exists(select 1 from public.live_participants p where p.session_id=p_session_id and p.stage_slot=slots.slot)
      order by slots.slot limit 1;
    update public.live_participants set state='on_stage',stage_slot=v_slot,
      stage_joined_at=timezone('utc',now()),stage_left_at=null,microphone_muted_by_moderator=false
    where id=v_participant.id returning * into v_participant;
    insert into public.live_session_capability_assignments(session_id,user_id,capability,effect,assigned_by_user_id)
    values(p_session_id,p_target_user_id,'live.publish','grant',auth.uid())
    on conflict(session_id,user_id,capability) do update set effect='grant',assigned_by_user_id=excluded.assigned_by_user_id,created_at=timezone('utc',now());
  else
    if v_participant.state <> 'on_stage' then return v_participant; end if;
    update public.live_participants set state='audience',stage_slot=null,stage_left_at=timezone('utc',now()),microphone_muted_by_moderator=false
    where id=v_participant.id returning * into v_participant;
    insert into public.live_session_capability_assignments(session_id,user_id,capability,effect,assigned_by_user_id)
    values(p_session_id,p_target_user_id,'live.publish','revoke',auth.uid())
    on conflict(session_id,user_id,capability) do update set effect='revoke',assigned_by_user_id=excluded.assigned_by_user_id,created_at=timezone('utc',now());
  end if;
  insert into public.live_session_events(session_id,actor_user_id,event_type,to_state,metadata)
  values(p_session_id,auth.uid(),case when p_on_stage then 'participant_promoted' else 'participant_demoted' end,
    v_participant.state,jsonb_build_object('targetUserId',p_target_user_id,'stageSlot',v_participant.stage_slot));
  return v_participant;
end;
$$;

create or replace function public.rpc_create_live_comment(
  p_session_id uuid,
  p_client_comment_id uuid,
  p_body text
)
returns public.live_comments
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_profile public.profiles;
  v_comment public.live_comments;
begin
  v_profile := public.live_active_profile(auth.uid());
  if not public.has_live_capability(p_session_id,'live.comment')
     or not exists(select 1 from public.live_sessions s where s.id=p_session_id and s.status='live') then
    raise exception 'live_comment_forbidden' using errcode='42501';
  end if;
  select * into v_comment from public.live_comments
    where session_id=p_session_id and user_id=auth.uid() and client_comment_id=p_client_comment_id;
  if v_comment.id is not null then return v_comment; end if;
  if (select count(*) from public.live_comments c where c.session_id=p_session_id and c.user_id=auth.uid()
      and c.created_at > timezone('utc',now())-interval '30 seconds') >= 8 then
    raise exception 'live_comment_rate_limited' using errcode='P0001';
  end if;
  insert into public.live_comments(session_id,user_id,profile_id,client_comment_id,body)
  values(p_session_id,auth.uid(),v_profile.id,p_client_comment_id,btrim(p_body)) returning * into v_comment;
  return v_comment;
end;
$$;

create or replace function public.rpc_create_live_reaction(
  p_session_id uuid,
  p_client_event_id uuid,
  p_reaction text
)
returns public.live_reactions
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_profile public.profiles;
  v_reaction public.live_reactions;
begin
  v_profile := public.live_active_profile(auth.uid());
  if not public.has_live_capability(p_session_id,'live.react')
     or not exists(select 1 from public.live_sessions s where s.id=p_session_id and s.status='live') then
    raise exception 'live_reaction_forbidden' using errcode='42501';
  end if;
  select * into v_reaction from public.live_reactions
    where session_id=p_session_id and user_id=auth.uid() and client_event_id=p_client_event_id;
  if v_reaction.id is not null then return v_reaction; end if;
  if (select count(*) from public.live_reactions r where r.session_id=p_session_id and r.user_id=auth.uid()
      and r.created_at > timezone('utc',now())-interval '10 seconds') >= 20 then
    raise exception 'live_reaction_rate_limited' using errcode='P0001';
  end if;
  insert into public.live_reactions(session_id,user_id,profile_id,client_event_id,reaction)
  values(p_session_id,auth.uid(),v_profile.id,p_client_event_id,p_reaction) returning * into v_reaction;
  return v_reaction;
end;
$$;

create or replace function public.rpc_moderate_live_comment(p_comment_id uuid)
returns public.live_comments
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare v_comment public.live_comments;
begin
  select * into v_comment from public.live_comments where id=p_comment_id for update;
  if v_comment.id is null then raise exception 'live_comment_not_found' using errcode='P0002'; end if;
  if not public.has_live_capability(v_comment.session_id,'live.moderate_comments') then
    raise exception 'live_comment_moderation_forbidden' using errcode='42501';
  end if;
  if v_comment.status='removed' then return v_comment; end if;
  update public.live_comments set status='removed',moderated_at=timezone('utc',now()),moderated_by_user_id=auth.uid()
  where id=p_comment_id returning * into v_comment;
  return v_comment;
end;
$$;

create or replace function public.rpc_report_live_content(
  p_session_id uuid,
  p_client_report_id uuid,
  p_reason text,
  p_details text default null,
  p_target_user_id uuid default null,
  p_target_comment_id uuid default null
)
returns public.live_reports
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_profile public.profiles;
  v_report public.live_reports;
begin
  v_profile := public.live_active_profile(auth.uid());
  if not public.has_live_capability(p_session_id,'live.report') then raise exception 'live_report_forbidden' using errcode='42501'; end if;
  select * into v_report from public.live_reports where session_id=p_session_id and reporter_user_id=auth.uid() and client_report_id=p_client_report_id;
  if v_report.id is not null then return v_report; end if;
  insert into public.live_reports(session_id,reporter_user_id,reporter_profile_id,target_user_id,target_comment_id,client_report_id,reason,details)
  values(p_session_id,auth.uid(),v_profile.id,p_target_user_id,p_target_comment_id,p_client_report_id,p_reason,nullif(btrim(p_details),''))
  returning * into v_report;
  return v_report;
end;
$$;

create or replace function public.rpc_moderate_live_participant(
  p_session_id uuid,
  p_target_user_id uuid,
  p_action text,
  p_client_action_id uuid,
  p_reason text default null
)
returns public.live_participants
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_existing public.live_moderation_actions;
  v_participant public.live_participants;
  v_required text;
  v_action_id uuid;
begin
  v_required := case p_action
    when 'mute' then 'live.mute_public_participant'
    when 'unmute' then 'live.mute_public_participant'
    when 'remove' then 'live.remove_participant'
    when 'suspend' then 'live.suspend_participant'
    else null end;
  if v_required is null then raise exception 'live_moderation_action_invalid' using errcode='22023'; end if;
  if not public.has_live_capability(p_session_id,v_required) then raise exception 'live_moderation_forbidden' using errcode='42501'; end if;
  select * into v_participant from public.live_participants where session_id=p_session_id and user_id=p_target_user_id for update;
  if v_participant.id is null or v_participant.role in ('host','internal_admin') then
    raise exception 'live_moderation_target_forbidden' using errcode='42501';
  end if;
  select * into v_existing from public.live_moderation_actions
    where session_id=p_session_id and actor_user_id=auth.uid() and client_action_id=p_client_action_id;
  if v_existing.id is not null then return v_participant; end if;
  if p_action='mute' then
    update public.live_participants set microphone_muted_by_moderator=true where id=v_participant.id returning * into v_participant;
  elsif p_action='unmute' then
    update public.live_participants set microphone_muted_by_moderator=false where id=v_participant.id returning * into v_participant;
  elsif p_action='remove' then
    update public.live_participants set state='removed',stage_slot=null,left_at=timezone('utc',now()) where id=v_participant.id returning * into v_participant;
  elsif p_action='suspend' then
    update public.live_participants set state='banned',stage_slot=null,left_at=timezone('utc',now()) where id=v_participant.id returning * into v_participant;
  end if;
  insert into public.live_moderation_actions(session_id,actor_user_id,target_user_id,action,reason,client_action_id)
  values(p_session_id,auth.uid(),p_target_user_id,p_action,nullif(btrim(p_reason),''),p_client_action_id)
  returning id into v_action_id;
  insert into public.live_provider_control_jobs(moderation_action_id,session_id,target_user_id,action)
  values(v_action_id,p_session_id,p_target_user_id,p_action)
  on conflict(moderation_action_id) do nothing;
  if p_action in ('remove','suspend') then
    insert into public.live_session_capability_assignments(session_id,user_id,capability,effect,assigned_by_user_id)
    values(p_session_id,p_target_user_id,'live.join','revoke',auth.uid())
    on conflict(session_id,user_id,capability) do update set effect='revoke',assigned_by_user_id=excluded.assigned_by_user_id,created_at=timezone('utc',now());
  end if;
  insert into public.live_session_events(session_id,actor_user_id,event_type,to_state,metadata)
  values(p_session_id,auth.uid(),'moderation_applied',v_participant.state,jsonb_build_object('targetUserId',p_target_user_id,'action',p_action));
  return v_participant;
end;
$$;

alter table public.live_comments enable row level security;
alter table public.live_reactions enable row level security;
alter table public.live_reports enable row level security;
alter table public.live_provider_control_jobs enable row level security;

create policy live_comments_select_scoped on public.live_comments for select to authenticated
using (public.can_view_live_session(session_id) and (status='visible' or user_id=auth.uid() or public.has_live_capability(session_id,'live.moderate_comments')));
create policy live_reactions_select_scoped on public.live_reactions for select to authenticated
using (public.can_view_live_session(session_id));
create policy live_reports_select_own_or_safety on public.live_reports for select to authenticated
using (reporter_user_id=auth.uid() or public.has_live_capability(session_id,'live.view_safety_console'));

revoke all on public.live_comments,public.live_reactions,public.live_reports,public.live_provider_control_jobs from public,anon,authenticated;
grant select on public.live_comments,public.live_reactions,public.live_reports to authenticated;

revoke all on function public.live_active_profile(uuid),
  public.rpc_list_live_sessions(integer,timestamptz),public.rpc_get_live_session_snapshot(uuid),
  public.rpc_can_schedule_live_session(),public.rpc_schedule_live_session(text,text,timestamptz),
  public.rpc_rsvp_live_session(uuid,boolean,boolean),public.rpc_join_live_session(uuid),
  public.rpc_leave_live_session(uuid),public.rpc_request_live_seat(uuid),
  public.rpc_withdraw_live_seat_request(uuid),public.rpc_resolve_live_seat_request(uuid,boolean),
  public.rpc_set_live_stage_participant(uuid,uuid,boolean),public.rpc_create_live_comment(uuid,uuid,text),
  public.rpc_create_live_reaction(uuid,uuid,text),public.rpc_moderate_live_comment(uuid),
  public.rpc_report_live_content(uuid,uuid,text,text,uuid,uuid),
  public.rpc_moderate_live_participant(uuid,uuid,text,uuid,text)
from public,anon,authenticated;

grant execute on function public.live_active_profile(uuid),
  public.rpc_list_live_sessions(integer,timestamptz),public.rpc_get_live_session_snapshot(uuid),
  public.rpc_can_schedule_live_session(),public.rpc_schedule_live_session(text,text,timestamptz),
  public.rpc_rsvp_live_session(uuid,boolean,boolean),public.rpc_join_live_session(uuid),
  public.rpc_leave_live_session(uuid),public.rpc_request_live_seat(uuid),
  public.rpc_withdraw_live_seat_request(uuid),public.rpc_resolve_live_seat_request(uuid,boolean),
  public.rpc_set_live_stage_participant(uuid,uuid,boolean),public.rpc_create_live_comment(uuid,uuid,text),
  public.rpc_create_live_reaction(uuid,uuid,text),public.rpc_moderate_live_comment(uuid),
  public.rpc_report_live_content(uuid,uuid,text,text,uuid,uuid),
  public.rpc_moderate_live_participant(uuid,uuid,text,uuid,text)
to authenticated;

create or replace function public.cleanup_live_ephemeral_activity()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_reactions bigint;
begin
  if current_user <> 'postgres'
     and coalesce(auth.role(),'') <> 'service_role'
     and not public.is_admin_user(auth.uid()) then
    raise exception 'live_cleanup_forbidden' using errcode='42501';
  end if;
  delete from public.live_reactions where created_at < timezone('utc',now())-interval '6 hours';
  get diagnostics v_reactions = row_count;
  return jsonb_build_object('reactionsDeleted',v_reactions);
end;
$$;

revoke all on function public.cleanup_live_ephemeral_activity() from public,anon,authenticated;
grant execute on function public.cleanup_live_ephemeral_activity() to service_role;

-- Realtime provides refresh signals only; clients always re-read the
-- capability-filtered snapshot RPC as the source of truth.
do $$
declare v_table text;
begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') then
    foreach v_table in array array['live_participants','live_seat_requests','live_comments','live_reactions'] loop
      if not exists(
        select 1 from pg_publication_tables
        where pubname='supabase_realtime' and schemaname='public' and tablename=v_table
      ) then
        execute format('alter publication supabase_realtime add table public.%I',v_table);
      end if;
    end loop;
  end if;
end;
$$;

do $$
begin
  if exists(select 1 from pg_extension where extname='pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname='live-ephemeral-activity-cleanup';
    perform cron.schedule(
      'live-ephemeral-activity-cleanup',
      '17 * * * *',
      'select public.cleanup_live_ephemeral_activity();'
    );
  end if;
end;
$$;

commit;
