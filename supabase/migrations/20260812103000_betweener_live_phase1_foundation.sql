-- Betweener Live Phase 1: authoritative lifecycle, capabilities and RLS foundation.
-- Supabase owns product authority. The RTC provider only transports media.

begin;

-- Matchmakers remain eligible to curate prompts and warm introductions through
-- the existing Circle contracts. Live moderation is resolved independently by
-- explicit capabilities and never inferred from public UI role labels.
alter table public.circle_members validate constraint circle_members_role_check;

alter table public.notification_prefs
  add column if not exists live_reminders boolean not null default true,
  add column if not exists live_started boolean not null default true,
  add column if not exists live_invitations boolean not null default true;

create table public.live_creator_eligibility (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default true,
  allowed_context_types text[] not null default array['global']::text[],
  granted_by_user_id uuid not null references auth.users(id) on delete restrict,
  expires_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint live_creator_contexts_valid check (
    allowed_context_types <@ array['global','circle','gathering','match_night','diaspora','special_event','invite_only']::text[]
    and cardinality(allowed_context_types) > 0
  )
);

create table public.live_sessions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  format text not null default 'hosted_match_night',
  status text not null default 'draft',
  context_type text not null default 'global',
  context_id uuid,
  circle_id uuid references public.circles(id) on delete set null,
  gathering_id uuid references public.gatherings(id) on delete set null,
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_by_profile_id uuid not null references public.profiles(id) on delete restrict,
  provider text not null default 'stream',
  provider_call_type text not null default 'betweener_live',
  provider_call_id text not null,
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  minimum_participants integer not null default 2,
  maximum_participants integer not null default 100,
  maximum_publishers integer not null default 4,
  quorum_reached_at timestamptz,
  chemistry_first_enabled boolean not null default false,
  captions_enabled boolean not null default false,
  recording_enabled boolean not null default false,
  backstage_opened_at timestamptz,
  started_at timestamptz,
  ended_at timestamptz,
  cancelled_at timestamptz,
  configuration jsonb not null default '{}'::jsonb,
  version bigint not null default 1,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint live_sessions_title_length check (char_length(btrim(title)) between 1 and 120),
  constraint live_sessions_description_length check (description is null or char_length(description) <= 1000),
  constraint live_sessions_format_valid check (format in ('hosted_match_night','quick_connect','circle_live','special_event','invite_only')),
  constraint live_sessions_status_valid check (status in ('draft','scheduled','waiting_for_quorum','confirmed','backstage','live','ending','ended','cancelled')),
  constraint live_sessions_context_valid check (context_type in ('global','circle','gathering','match_night','diaspora','special_event','invite_only')),
  constraint live_sessions_context_reference_valid check (
    (context_type = 'circle' and circle_id is not null and gathering_id is null and context_id = circle_id)
    or (context_type = 'gathering' and gathering_id is not null and circle_id is null and context_id = gathering_id)
    or (context_type not in ('circle','gathering') and circle_id is null and gathering_id is null)
  ),
  constraint live_sessions_schedule_valid check (scheduled_end is null or (scheduled_start is not null and scheduled_end > scheduled_start)),
  constraint live_sessions_capacity_valid check (
    minimum_participants between 2 and 10000
    and maximum_participants between minimum_participants and 10000
    and maximum_publishers between 1 and 12
    and maximum_publishers <= maximum_participants
  ),
  constraint live_sessions_configuration_object check (jsonb_typeof(configuration) = 'object'),
  constraint live_sessions_provider_call_id_length check (char_length(provider_call_id) between 8 and 160),
  constraint live_sessions_provider_call_unique unique (provider, provider_call_id)
);

create table public.live_participants (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.live_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  origin_context_type text not null,
  origin_context_id uuid,
  role text not null default 'audience',
  state text not null default 'invited',
  open_to_introductions boolean not null default false,
  stage_slot integer,
  connection_quality_state text not null default 'unknown',
  invited_at timestamptz not null default timezone('utc', now()),
  joined_at timestamptz,
  stage_joined_at timestamptz,
  stage_left_at timestamptz,
  left_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint live_participants_origin_valid check (origin_context_type in ('global','circle','gathering','match_night','diaspora','special_event','invite_only')),
  constraint live_participants_role_valid check (role in ('audience','participant','matchmaker','moderator','host','internal_admin')),
  constraint live_participants_state_valid check (state in ('invited','confirmed','waitlisted','backstage','audience','stage_requested','on_stage','private_spark','temporarily_disconnected','left','removed','banned')),
  constraint live_participants_connection_valid check (connection_quality_state in ('unknown','excellent','good','poor','offline')),
  constraint live_participants_stage_slot_valid check (stage_slot is null or stage_slot between 1 and 12),
  constraint live_participants_session_user_unique unique (session_id, user_id),
  constraint live_participants_session_profile_unique unique (session_id, profile_id)
);

create unique index live_participants_session_stage_slot_unique
  on public.live_participants(session_id, stage_slot)
  where stage_slot is not null;

create table public.live_participant_roles (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.live_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null,
  assigned_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  constraint live_participant_roles_role_valid check (role in ('audience','participant','matchmaker','moderator','host','internal_admin')),
  constraint live_participant_roles_unique unique (session_id, user_id, role)
);

create table public.live_session_capability_assignments (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.live_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  capability text not null,
  effect text not null default 'grant',
  assigned_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  constraint live_capability_name_valid check (capability in (
    'live.create_session','live.join','live.react','live.comment','live.report','live.block','live.request_seat',
    'live.publish','live.manage_stage','live.approve_seat_request','live.moderate_comments',
    'live.mute_public_participant','live.remove_participant','live.suspend_participant',
    'live.suggest_match','live.create_match_round','live.start_session','live.end_session',
    'live.terminate_private_spark','live.view_host_console','live.view_safety_console','live.emergency_terminate'
  )),
  constraint live_capability_effect_valid check (effect in ('grant','revoke')),
  constraint live_capability_assignment_unique unique (session_id, user_id, capability)
);

create table public.live_seat_requests (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.live_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending',
  requested_at timestamptz not null default timezone('utc', now()),
  resolved_at timestamptz,
  resolved_by_user_id uuid references auth.users(id) on delete set null,
  constraint live_seat_requests_status_valid check (status in ('pending','approved','declined','withdrawn','expired')),
  constraint live_seat_requests_resolution_valid check (
    (status = 'pending' and resolved_at is null and resolved_by_user_id is null)
    or status in ('withdrawn','expired')
    or (status in ('approved','declined') and resolved_at is not null and resolved_by_user_id is not null)
  )
);

create unique index live_seat_requests_one_pending_per_user
  on public.live_seat_requests(session_id, user_id)
  where status = 'pending';

create table public.live_session_events (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.live_sessions(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  from_state text,
  to_state text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  constraint live_session_events_type_length check (char_length(event_type) between 1 and 80),
  constraint live_session_events_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create table public.live_moderation_actions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.live_sessions(id) on delete cascade,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  target_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  constraint live_moderation_action_valid check (action in ('mute','unmute','remove','suspend','reinstate','end_session','terminate_private_spark','emergency_terminate')),
  constraint live_moderation_reason_length check (reason is null or char_length(reason) <= 500),
  constraint live_moderation_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create table public.live_provider_webhook_events (
  id bigint generated always as identity primary key,
  provider text not null,
  provider_event_id text not null,
  event_type text not null,
  payload_digest text not null,
  status text not null default 'pending',
  attempt_count integer not null default 0,
  last_error text,
  received_at timestamptz not null default timezone('utc', now()),
  processed_at timestamptz,
  constraint live_provider_event_status_valid check (status in ('pending','processing','processed','failed','ignored')),
  constraint live_provider_event_id_unique unique (provider, provider_event_id)
);

create index live_sessions_discovery_idx on public.live_sessions(status, scheduled_start desc);
create index live_sessions_context_idx on public.live_sessions(context_type, context_id);
create index live_sessions_circle_idx on public.live_sessions(circle_id, status) where circle_id is not null;
create index live_participants_user_idx on public.live_participants(user_id, state, session_id);
create index live_participants_session_state_idx on public.live_participants(session_id, state);
create index live_participant_roles_user_idx on public.live_participant_roles(user_id, session_id);
create index live_session_events_session_idx on public.live_session_events(session_id, created_at desc);

create trigger live_creator_eligibility_set_updated_at
before update on public.live_creator_eligibility
for each row execute function public.set_updated_at();

create trigger live_sessions_set_updated_at
before update on public.live_sessions
for each row execute function public.set_updated_at();

create trigger live_participants_set_updated_at
before update on public.live_participants
for each row execute function public.set_updated_at();

create or replace function public.live_role_capabilities(p_role text)
returns text[]
language sql
immutable
set search_path = public, pg_catalog
as $$
  select case lower(coalesce(p_role, ''))
    when 'audience' then array['live.join','live.react','live.comment','live.report','live.block','live.request_seat']::text[]
    when 'participant' then array['live.join','live.react','live.comment','live.report','live.block','live.request_seat','live.publish']::text[]
    when 'matchmaker' then array['live.join','live.react','live.comment','live.report','live.block','live.request_seat','live.suggest_match','live.create_match_round','live.view_host_console']::text[]
    when 'moderator' then array['live.join','live.react','live.comment','live.report','live.block','live.request_seat','live.moderate_comments','live.mute_public_participant','live.remove_participant','live.suspend_participant','live.terminate_private_spark','live.view_safety_console']::text[]
    when 'host' then array['live.create_session','live.join','live.react','live.comment','live.report','live.block','live.request_seat','live.publish','live.manage_stage','live.approve_seat_request','live.moderate_comments','live.mute_public_participant','live.remove_participant','live.suspend_participant','live.terminate_private_spark','live.start_session','live.end_session','live.view_host_console','live.view_safety_console']::text[]
    when 'internal_admin' then array['live.join','live.report','live.moderate_comments','live.mute_public_participant','live.remove_participant','live.suspend_participant','live.terminate_private_spark','live.view_safety_console','live.emergency_terminate']::text[]
    else array[]::text[]
  end;
$$;

create or replace function public.resolve_live_capabilities(p_session_id uuid, p_user_id uuid default auth.uid())
returns text[]
language plpgsql
stable
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_capabilities text[];
begin
  if p_user_id is null then
    return array[]::text[];
  end if;
  if p_user_id is distinct from auth.uid()
     and coalesce(auth.role(), '') <> 'service_role'
     and not public.is_admin_user(auth.uid()) then
    raise exception 'live_capability_subject_forbidden' using errcode = '42501';
  end if;

  with roles as (
    select lpr.role from public.live_participant_roles lpr
    where lpr.session_id = p_session_id and lpr.user_id = p_user_id
    union
    select lp.role from public.live_participants lp
    where lp.session_id = p_session_id and lp.user_id = p_user_id
    union all
    select 'internal_admin' where public.is_admin_user(p_user_id)
  ), base as (
    select distinct capability
    from roles r, lateral unnest(public.live_role_capabilities(r.role)) capability
  ), grants as (
    select capability from public.live_session_capability_assignments
    where session_id = p_session_id and user_id = p_user_id and effect = 'grant'
  ), revocations as (
    select capability from public.live_session_capability_assignments
    where session_id = p_session_id and user_id = p_user_id and effect = 'revoke'
  )
  select coalesce(array_agg(distinct c.capability order by c.capability), array[]::text[])
    into v_capabilities
  from (select capability from base union select capability from grants) c
  where not exists (select 1 from revocations r where r.capability = c.capability);

  return v_capabilities;
end;
$$;

create or replace function public.has_live_capability(p_session_id uuid, p_capability text, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
  select p_capability = any(public.resolve_live_capabilities(p_session_id, p_user_id));
$$;

create or replace function public.can_create_live_context(
  p_context_type text,
  p_circle_id uuid default null,
  p_gathering_id uuid default null,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
  select p_user_id is not null and (
    public.is_admin_user(p_user_id)
    or (
      p_context_type = 'circle'
      and p_circle_id is not null
      and (
        public.is_circle_owner(p_circle_id, p_user_id)
        or exists (
          select 1 from public.circle_members cm
          where cm.circle_id = p_circle_id and cm.user_id = p_user_id and cm.status = 'active'
            and lower(cm.role) in ('leader','host','admin')
        )
      )
    )
    or (
      p_context_type = 'gathering'
      and p_gathering_id is not null
      and exists (
        select 1 from public.gatherings g
        where g.id = p_gathering_id and (
          g.created_by_user_id = p_user_id
          or (g.circle_id is not null and (
            public.is_circle_owner(g.circle_id, p_user_id)
            or exists (
              select 1 from public.circle_members cm
              where cm.circle_id = g.circle_id and cm.user_id = p_user_id and cm.status = 'active'
                and lower(cm.role) in ('leader','host','admin')
            )
          ))
        )
      )
    )
    or exists (
      select 1 from public.live_creator_eligibility e
      where e.user_id = p_user_id and e.enabled
        and p_context_type = any(e.allowed_context_types)
        and (e.expires_at is null or e.expires_at > timezone('utc', now()))
    )
  );
$$;

create or replace function public.can_view_live_session(p_session_id uuid, p_user_id uuid default auth.uid())
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_allowed boolean;
begin
  if p_user_id is null then return false; end if;
  if p_user_id is distinct from auth.uid()
     and coalesce(auth.role(), '') <> 'service_role'
     and not public.is_admin_user(auth.uid()) then
    raise exception 'live_session_subject_forbidden' using errcode = '42501';
  end if;

  select exists (
    select 1 from public.live_sessions s
    where s.id = p_session_id and (
      public.is_admin_user(p_user_id)
      or s.created_by_user_id = p_user_id
      or exists (
        select 1 from public.live_participants lp
        where lp.session_id = s.id and lp.user_id = p_user_id and lp.state <> 'banned'
      )
      or (s.context_type in ('global','match_night','diaspora','special_event') and s.status in ('scheduled','waiting_for_quorum','confirmed','backstage','live','ending'))
      or (s.circle_id is not null and public.is_circle_member(s.circle_id, p_user_id))
    )
  ) into v_allowed;
  return coalesce(v_allowed, false);
end;
$$;

create or replace function public.enforce_live_session_transition()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
begin
  if new.status is not distinct from old.status then return new; end if;
  if not (
    (old.status = 'draft' and new.status in ('scheduled','cancelled'))
    or (old.status = 'scheduled' and new.status in ('waiting_for_quorum','confirmed','cancelled'))
    or (old.status = 'waiting_for_quorum' and new.status in ('confirmed','cancelled'))
    or (old.status = 'confirmed' and new.status in ('backstage','cancelled'))
    or (old.status = 'backstage' and new.status in ('live','cancelled'))
    or (old.status = 'live' and new.status = 'ending')
    or (old.status = 'ending' and new.status = 'ended')
  ) then
    raise exception 'invalid_live_session_transition:%:%', old.status, new.status using errcode = '23514';
  end if;
  new.version := old.version + 1;
  return new;
end;
$$;

create trigger live_sessions_transition_guard
before update of status on public.live_sessions
for each row execute function public.enforce_live_session_transition();

create or replace function public.enforce_live_participant_transition()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
begin
  if new.state is not distinct from old.state then return new; end if;
  if not (
    (old.state = 'invited' and new.state in ('confirmed','waitlisted','backstage','removed','banned'))
    or (old.state = 'confirmed' and new.state in ('waitlisted','backstage','audience','left','removed','banned'))
    or (old.state = 'waitlisted' and new.state in ('confirmed','backstage','audience','left','removed','banned'))
    or (old.state = 'backstage' and new.state in ('audience','on_stage','temporarily_disconnected','left','removed','banned'))
    or (old.state = 'audience' and new.state in ('stage_requested','on_stage','temporarily_disconnected','left','removed','banned'))
    or (old.state = 'stage_requested' and new.state in ('audience','on_stage','temporarily_disconnected','left','removed','banned'))
    or (old.state = 'on_stage' and new.state in ('audience','private_spark','temporarily_disconnected','left','removed','banned'))
    or (old.state = 'private_spark' and new.state in ('on_stage','audience','temporarily_disconnected','left','removed','banned'))
    or (old.state = 'temporarily_disconnected' and new.state in ('audience','on_stage','left','removed','banned'))
    or (old.state in ('left','removed') and new.state = 'banned')
  ) then
    raise exception 'invalid_live_participant_transition:%:%', old.state, new.state using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger live_participants_transition_guard
before update of state on public.live_participants
for each row execute function public.enforce_live_participant_transition();

create or replace function public.rpc_create_live_session(
  p_title text,
  p_format text default 'hosted_match_night',
  p_context_type text default 'global',
  p_context_id uuid default null,
  p_circle_id uuid default null,
  p_gathering_id uuid default null,
  p_scheduled_start timestamptz default null
)
returns public.live_sessions
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_profile public.profiles;
  v_session public.live_sessions;
  v_session_id uuid := gen_random_uuid();
  v_context_id uuid;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select * into v_profile from public.profiles p
  where p.user_id = auth.uid() and p.deleted_at is null and p.account_state = 'active'
    and p.profile_completed is true
  limit 1;
  if v_profile.id is null
     or (coalesce(v_profile.verification_level, 0) < 1 and not public.is_admin_user(auth.uid())) then
    raise exception 'live_profile_ineligible' using errcode = '42501';
  end if;
  if not public.can_create_live_context(p_context_type, p_circle_id, p_gathering_id, auth.uid()) then
    raise exception 'live_create_forbidden' using errcode = '42501';
  end if;
  if (p_context_type = 'circle' and p_gathering_id is not null)
     or (p_context_type = 'gathering' and p_circle_id is not null)
     or (p_context_type not in ('circle','gathering') and (p_circle_id is not null or p_gathering_id is not null)) then
    raise exception 'live_context_reference_invalid' using errcode = '22023';
  end if;

  v_context_id := case p_context_type
    when 'circle' then p_circle_id
    when 'gathering' then p_gathering_id
    else p_context_id
  end;
  if p_context_type in ('circle','gathering') and p_context_id is not null and p_context_id <> v_context_id then
    raise exception 'live_context_mismatch' using errcode = '22023';
  end if;

  insert into public.live_sessions(
    id,title,format,status,context_type,context_id,circle_id,gathering_id,
    created_by_user_id,created_by_profile_id,provider_call_id,scheduled_start
  ) values (
    v_session_id,btrim(p_title),p_format,
    case when p_scheduled_start is null then 'draft' else 'scheduled' end,
    p_context_type,v_context_id,p_circle_id,p_gathering_id,auth.uid(),v_profile.id,
    'live_' || replace(v_session_id::text,'-',''),p_scheduled_start
  ) returning * into v_session;

  insert into public.live_participants(
    session_id,user_id,profile_id,origin_context_type,origin_context_id,role,state
  ) values (
    v_session.id,auth.uid(),v_profile.id,p_context_type,v_context_id,'host',
    case when v_session.status = 'scheduled' then 'confirmed' else 'invited' end
  );
  insert into public.live_participant_roles(session_id,user_id,role,assigned_by_user_id)
  values(v_session.id,auth.uid(),'host',auth.uid());
  insert into public.live_session_events(session_id,actor_user_id,event_type,to_state)
  values(v_session.id,auth.uid(),'session_created',v_session.status);
  return v_session;
end;
$$;

create or replace function public.rpc_transition_live_session(
  p_session_id uuid,
  p_expected_version bigint,
  p_target_status text
)
returns public.live_sessions
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_session public.live_sessions;
  v_previous text;
begin
  select * into v_session from public.live_sessions where id = p_session_id for update;
  if v_session.id is null then raise exception 'live_session_not_found' using errcode = 'P0002'; end if;
  if v_session.version <> p_expected_version then raise exception 'live_session_version_conflict' using errcode = '40001'; end if;
  if p_target_status in ('scheduled','waiting_for_quorum','confirmed','backstage','live')
     and not public.has_live_capability(p_session_id,'live.start_session') then
    raise exception 'live_session_transition_forbidden' using errcode = '42501';
  end if;
  if p_target_status in ('ending','ended')
     and not public.has_live_capability(p_session_id,'live.end_session') then
    raise exception 'live_session_transition_forbidden' using errcode = '42501';
  end if;
  if p_target_status = 'cancelled'
     and not (public.has_live_capability(p_session_id,'live.end_session') or v_session.created_by_user_id = auth.uid()) then
    raise exception 'live_session_transition_forbidden' using errcode = '42501';
  end if;

  v_previous := v_session.status;
  update public.live_sessions set
    status = p_target_status,
    quorum_reached_at = case when p_target_status = 'confirmed' then coalesce(quorum_reached_at, timezone('utc',now())) else quorum_reached_at end,
    backstage_opened_at = case when p_target_status = 'backstage' then coalesce(backstage_opened_at, timezone('utc',now())) else backstage_opened_at end,
    started_at = case when p_target_status = 'live' then coalesce(started_at, timezone('utc',now())) else started_at end,
    ended_at = case when p_target_status = 'ended' then coalesce(ended_at, timezone('utc',now())) else ended_at end,
    cancelled_at = case when p_target_status = 'cancelled' then coalesce(cancelled_at, timezone('utc',now())) else cancelled_at end
  where id = p_session_id
  returning * into v_session;

  insert into public.live_session_events(session_id,actor_user_id,event_type,from_state,to_state)
  values(p_session_id,auth.uid(),'session_transitioned',v_previous,p_target_status);
  return v_session;
end;
$$;

create or replace function public.rpc_get_live_rtc_admission(p_session_id uuid)
returns table(
  session_id uuid,
  user_id uuid,
  profile_id uuid,
  primary_role text,
  roles text[],
  participant_state text,
  session_status text,
  provider text,
  provider_call_type text,
  provider_call_id text,
  capabilities text[]
)
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
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select * into v_profile from public.profiles p where p.user_id = auth.uid() limit 1;
  if v_profile.id is null or v_profile.deleted_at is not null or v_profile.account_state <> 'active'
     or (coalesce(v_profile.verification_level, 0) < 1 and not public.is_admin_user(auth.uid())) then
    raise exception 'live_admission_account_ineligible' using errcode = '42501';
  end if;
  select * into v_session from public.live_sessions s where s.id = p_session_id;
  if v_session.id is null or v_session.status not in ('backstage','live','ending') then
    raise exception 'live_admission_session_unavailable' using errcode = '42501';
  end if;
  select * into v_participant from public.live_participants lp
  where lp.session_id = p_session_id and lp.user_id = auth.uid();
  if v_participant.id is null
     or v_participant.state not in ('confirmed','backstage','audience','stage_requested','on_stage','temporarily_disconnected')
     or not public.has_live_capability(p_session_id,'live.join') then
    raise exception 'live_admission_forbidden' using errcode = '42501';
  end if;

  return query select
    v_session.id,
    auth.uid(),
    v_profile.id,
    v_participant.role,
    coalesce(
      (select array_agg(lpr.role order by lpr.role) from public.live_participant_roles lpr
       where lpr.session_id = v_session.id and lpr.user_id = auth.uid()),
      array[v_participant.role]
    ),
    v_participant.state,
    v_session.status,
    v_session.provider,
    v_session.provider_call_type,
    v_session.provider_call_id,
    public.resolve_live_capabilities(v_session.id,auth.uid());
end;
$$;

alter table public.live_creator_eligibility enable row level security;
alter table public.live_sessions enable row level security;
alter table public.live_participants enable row level security;
alter table public.live_participant_roles enable row level security;
alter table public.live_session_capability_assignments enable row level security;
alter table public.live_seat_requests enable row level security;
alter table public.live_session_events enable row level security;
alter table public.live_moderation_actions enable row level security;
alter table public.live_provider_webhook_events enable row level security;

create policy live_creator_eligibility_select_own
on public.live_creator_eligibility for select to authenticated
using (user_id = auth.uid() or public.is_internal_admin());

create policy live_sessions_select_authorized
on public.live_sessions for select to authenticated
using (public.can_view_live_session(id));

create policy live_participants_select_scoped
on public.live_participants for select to authenticated
using (
  user_id = auth.uid()
  or state = 'on_stage'
  or public.has_live_capability(session_id,'live.view_host_console')
  or public.has_live_capability(session_id,'live.view_safety_console')
);

create policy live_participant_roles_select_scoped
on public.live_participant_roles for select to authenticated
using (
  user_id = auth.uid()
  or public.has_live_capability(session_id,'live.view_host_console')
  or public.has_live_capability(session_id,'live.view_safety_console')
);

create policy live_capabilities_select_own_or_manager
on public.live_session_capability_assignments for select to authenticated
using (
  user_id = auth.uid()
  or public.has_live_capability(session_id,'live.view_safety_console')
);

create policy live_seat_requests_select_own_or_manager
on public.live_seat_requests for select to authenticated
using (
  user_id = auth.uid()
  or public.has_live_capability(session_id,'live.approve_seat_request')
);

create policy live_events_select_manager
on public.live_session_events for select to authenticated
using (
  public.has_live_capability(session_id,'live.view_host_console')
  or public.has_live_capability(session_id,'live.view_safety_console')
);

create policy live_moderation_select_manager
on public.live_moderation_actions for select to authenticated
using (public.has_live_capability(session_id,'live.view_safety_console'));

revoke all on public.live_creator_eligibility, public.live_sessions, public.live_participants,
  public.live_participant_roles, public.live_session_capability_assignments, public.live_seat_requests,
  public.live_session_events, public.live_moderation_actions, public.live_provider_webhook_events
from anon, authenticated;

grant select on public.live_creator_eligibility, public.live_participants,
  public.live_participant_roles, public.live_session_capability_assignments, public.live_seat_requests,
  public.live_session_events, public.live_moderation_actions
to authenticated;

revoke all on function public.live_role_capabilities(text),
  public.resolve_live_capabilities(uuid,uuid), public.has_live_capability(uuid,text,uuid),
  public.can_create_live_context(text,uuid,uuid,uuid), public.can_view_live_session(uuid,uuid),
  public.rpc_create_live_session(text,text,text,uuid,uuid,uuid,timestamptz),
  public.rpc_transition_live_session(uuid,bigint,text), public.rpc_get_live_rtc_admission(uuid)
from public, anon, authenticated;

grant execute on function public.live_role_capabilities(text),
  public.resolve_live_capabilities(uuid,uuid), public.has_live_capability(uuid,text,uuid),
  public.can_create_live_context(text,uuid,uuid,uuid), public.can_view_live_session(uuid,uuid),
  public.rpc_create_live_session(text,text,text,uuid,uuid,uuid,timestamptz),
  public.rpc_transition_live_session(uuid,bigint,text), public.rpc_get_live_rtc_admission(uuid)
to authenticated;

commit;
