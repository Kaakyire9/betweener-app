-- Session-scoped primary Host delegation, runtime extensions and a content-free
-- global discovery signal for the Circles tab. No global admin role is granted.

begin;

alter table public.live_sessions
  add column if not exists produced_by_user_id uuid references auth.users(id) on delete restrict,
  add column if not exists produced_by_profile_id uuid references public.profiles(id) on delete restrict,
  add column if not exists end_policy text not null default 'scheduled',
  add column if not exists runtime_end_at timestamptz,
  add column if not exists runtime_extended_at timestamptz,
  add column if not exists runtime_extended_by_user_id uuid references auth.users(id) on delete set null;

update public.live_sessions
set produced_by_user_id = created_by_user_id,
    produced_by_profile_id = created_by_profile_id,
    runtime_end_at = scheduled_end
where ownership_type = 'human'
  and (produced_by_user_id is null or produced_by_profile_id is null or runtime_end_at is null);

alter table public.live_sessions
  drop constraint if exists live_sessions_end_policy_valid,
  add constraint live_sessions_end_policy_valid
    check (end_policy in ('scheduled','manual')),
  drop constraint if exists live_sessions_runtime_end_valid,
  add constraint live_sessions_runtime_end_valid
    check (runtime_end_at is null or started_at is null or runtime_end_at > started_at),
  drop constraint if exists live_sessions_scheduled_duration_valid,
  add constraint live_sessions_scheduled_duration_valid
    check (scheduled_duration_minutes between 30 and 1440) not valid;

alter table public.live_sessions validate constraint live_sessions_scheduled_duration_valid;

create table public.live_session_host_assignments (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.live_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  previous_host_user_id uuid references auth.users(id) on delete set null,
  assigned_by_user_id uuid not null references auth.users(id) on delete restrict,
  status text not null default 'active',
  assigned_at timestamptz not null default timezone('utc', now()),
  revoked_at timestamptz,
  expired_at timestamptz,
  updated_at timestamptz not null default timezone('utc', now()),
  constraint live_session_host_assignment_status_valid
    check (status in ('active','superseded','revoked','expired')),
  constraint live_session_host_assignment_resolution_valid check (
    (status = 'active' and revoked_at is null and expired_at is null)
    or (status = 'revoked' and revoked_at is not null)
    or (status in ('superseded','expired') and expired_at is not null)
  )
);

create unique index live_session_host_assignments_one_active_idx
  on public.live_session_host_assignments(session_id)
  where status = 'active';
create index live_session_host_assignments_user_idx
  on public.live_session_host_assignments(user_id, status, session_id);

alter table public.live_session_host_assignments enable row level security;
alter table public.live_session_host_assignments force row level security;

create policy live_session_host_assignments_select_scoped
on public.live_session_host_assignments
for select to authenticated
using (
  user_id = auth.uid()
  or assigned_by_user_id = auth.uid()
  or public.is_admin_user(auth.uid())
);

revoke all on table public.live_session_host_assignments from public, anon, authenticated;
grant select on table public.live_session_host_assignments to authenticated;
grant all on table public.live_session_host_assignments to service_role;

create or replace function public.live_session_has_active_delegated_host_v1(
  p_session_id uuid,
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
  select p_session_id is not null and p_user_id is not null and exists (
    select 1
    from public.live_session_host_assignments assignment
    join public.live_sessions session on session.id = assignment.session_id
    where assignment.session_id = p_session_id
      and assignment.user_id = p_user_id
      and assignment.status = 'active'
      and session.status not in ('ended','cancelled')
  );
$$;

revoke all on function public.live_session_has_active_delegated_host_v1(uuid, uuid)
from public, anon, authenticated;
grant execute on function public.live_session_has_active_delegated_host_v1(uuid, uuid)
to service_role;

create or replace function public.live_studio_is_authorized_v1(
  p_session_id uuid,
  p_user_id uuid,
  p_capability text default 'view'
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_config public.live_odo_configuration;
  v_access public.live_studio_access;
  v_role_allowed boolean := false;
  v_rollout_allowed boolean := false;
  v_delegated_host boolean := false;
begin
  if p_session_id is null or p_user_id is null
    or p_capability not in ('view','control','publish','screen_share','external_audio','moderate') then
    return false;
  end if;

  select * into v_config from public.live_odo_configuration where id = true;
  if not coalesce(v_config.betweener_studio_enabled, false)
    or not coalesce(v_config.studio_session_discovery_enabled, false) then
    return false;
  end if;

  v_delegated_host := public.live_session_has_active_delegated_host_v1(
    p_session_id,
    p_user_id
  );
  v_role_allowed := public.is_admin_user(p_user_id)
    or v_delegated_host
    or public.has_live_capability(p_session_id, 'live.view_host_console', p_user_id)
    or exists (
      select 1 from public.live_sessions session
      where session.id = p_session_id and session.created_by_user_id = p_user_id
    );
  if not v_role_allowed then return false; end if;

  select * into v_access from public.live_studio_access access
  where access.user_id = p_user_id
    and access.allowed
    and (access.expires_at is null or access.expires_at > timezone('utc', now()));

  v_rollout_allowed := v_delegated_host
    or not coalesce(v_config.studio_closed_beta, true)
    or v_access.user_id is not null;
  if not v_rollout_allowed then return false; end if;

  return case p_capability
    when 'view' then coalesce(v_access.can_view, v_delegated_host or not v_config.studio_closed_beta)
    when 'control' then v_config.betweener_studio_control_enabled
      and coalesce(v_access.can_control, v_delegated_host or not v_config.studio_closed_beta)
    when 'publish' then v_config.studio_media_publishing_enabled
      and coalesce(v_access.can_publish, v_delegated_host or not v_config.studio_closed_beta)
      and (public.has_live_capability(p_session_id, 'live.publish', p_user_id)
        or public.is_admin_user(p_user_id))
    when 'screen_share' then v_config.screen_share_enabled
      and coalesce(v_access.can_screen_share, v_delegated_host or not v_config.studio_closed_beta)
    when 'external_audio' then v_config.studio_external_audio_enabled
      and coalesce(v_access.can_use_external_audio, v_delegated_host or not v_config.studio_closed_beta)
    when 'moderate' then coalesce(v_access.can_moderate, v_delegated_host or not v_config.studio_closed_beta)
      and (public.has_live_capability(p_session_id, 'live.view_safety_console', p_user_id)
        or public.is_admin_user(p_user_id))
    else false
  end;
end;
$$;

revoke all on function public.live_studio_is_authorized_v1(uuid, uuid, text)
from public, anon, authenticated, service_role;

create or replace function public.rpc_get_live_hosting_management_v1(p_session_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_session public.live_sessions;
  v_host public.profiles;
  v_assignment public.live_session_host_assignments;
  v_audience_count integer := 0;
  v_total_attendees integer := 0;
  v_reactions bigint := 0;
begin
  if auth.uid() is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  select * into v_session from public.live_sessions where id = p_session_id;
  if v_session.id is null then
    raise exception 'live_session_not_found' using errcode = 'P0002';
  end if;
  if not public.is_admin_user(auth.uid())
    and v_session.created_by_user_id is distinct from auth.uid()
    and not public.live_session_has_active_delegated_host_v1(p_session_id, auth.uid())
    and not public.has_live_capability(p_session_id, 'live.view_host_console', auth.uid()) then
    raise exception 'live_host_management_forbidden' using errcode = '42501';
  end if;

  select * into v_host from public.profiles
  where user_id = v_session.created_by_user_id and deleted_at is null;
  select * into v_assignment from public.live_session_host_assignments
  where session_id = p_session_id and status = 'active';

  select
    count(*) filter (where state in ('audience','stage_requested','backstage','on_stage','private_spark'))::integer,
    count(*) filter (where joined_at is not null)::integer
  into v_audience_count, v_total_attendees
  from public.live_participants where session_id = p_session_id;

  select coalesce(sum(total_count), 0) into v_reactions
  from public.live_reaction_totals where session_id = p_session_id;

  return jsonb_build_object(
    'schemaVersion', 1,
    'serverNow', timezone('utc', now()),
    'sessionId', v_session.id,
    'title', v_session.title,
    'status', v_session.status,
    'canDelegateHosts', public.is_admin_user(auth.uid())
      and v_session.ownership_type = 'human'
      and v_session.status in ('scheduled','waiting_for_quorum','confirmed','backstage'),
    'canExtend', (public.is_admin_user(auth.uid())
      or v_session.created_by_user_id = auth.uid())
      and v_session.ownership_type = 'human'
      and v_session.status in ('scheduled','waiting_for_quorum','confirmed','backstage','live'),
    'host', jsonb_build_object(
      'userId', v_session.created_by_user_id,
      'profileId', v_session.created_by_profile_id,
      'fullName', v_host.full_name,
      'username', v_host.username,
      'avatarUrl', v_host.avatar_url,
      'delegated', v_assignment.id is not null
    ),
    'schedule', jsonb_build_object(
      'scheduledStart', v_session.scheduled_start,
      'scheduledEnd', v_session.scheduled_end,
      'runtimeEndAt', v_session.runtime_end_at,
      'durationMinutes', v_session.scheduled_duration_minutes,
      'endPolicy', v_session.end_policy,
      'lastExtendedAt', v_session.runtime_extended_at
    ),
    'traffic', jsonb_build_object(
      'audienceNow', v_audience_count,
      'totalAttendees', v_total_attendees,
      'reactions', v_reactions
    )
  );
end;
$$;

create or replace function public.rpc_admin_delegate_live_host_v1(
  p_session_id uuid,
  p_username text
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
  v_target public.profiles;
  v_previous_user_id uuid;
begin
  if auth.uid() is null or not public.is_admin_user(auth.uid()) then
    raise exception 'live_host_admin_required' using errcode = '42501';
  end if;
  if nullif(btrim(p_username), '') is null or char_length(btrim(p_username)) > 48 then
    raise exception 'live_host_username_invalid' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('live-host:' || p_session_id::text, 0));
  select * into v_session from public.live_sessions where id = p_session_id for update;
  if v_session.id is null then
    raise exception 'live_session_not_found' using errcode = 'P0002';
  end if;
  if v_session.ownership_type <> 'human'
    or v_session.status not in ('scheduled','waiting_for_quorum','confirmed','backstage') then
    raise exception 'live_host_assignment_unavailable' using errcode = '55000';
  end if;

  select * into v_target
  from public.profiles profile
  where lower(profile.username) = lower(trim(leading '@' from btrim(p_username)))
    and profile.deleted_at is null
    and profile.is_active
    and profile.account_state = 'active'
  limit 1;
  if v_target.id is null or v_target.user_id is null then
    raise exception 'live_host_profile_not_found' using errcode = 'P0002';
  end if;

  v_previous_user_id := v_session.created_by_user_id;
  update public.live_session_host_assignments
  set status = 'superseded', expired_at = v_now, updated_at = v_now
  where session_id = p_session_id and status = 'active';

  insert into public.live_session_host_assignments(
    session_id, user_id, profile_id, previous_host_user_id, assigned_by_user_id
  ) values (
    p_session_id, v_target.user_id, v_target.id, v_previous_user_id, auth.uid()
  );

  update public.live_sessions
  set produced_by_user_id = coalesce(produced_by_user_id, v_previous_user_id),
      produced_by_profile_id = coalesce(produced_by_profile_id, created_by_profile_id),
      created_by_user_id = v_target.user_id,
      created_by_profile_id = v_target.id,
      version = version + 1
  where id = p_session_id;

  delete from public.live_participant_roles
  where session_id = p_session_id and user_id = v_previous_user_id and role = 'host';
  insert into public.live_participant_roles(session_id, user_id, role, assigned_by_user_id)
  values(p_session_id, v_target.user_id, 'host', auth.uid())
  on conflict(session_id, user_id, role) do update
    set assigned_by_user_id = excluded.assigned_by_user_id;

  update public.live_participants
  set role = 'audience'
  where session_id = p_session_id and user_id = v_previous_user_id and role = 'host';
  update public.live_participants
  set role = 'host'
  where session_id = p_session_id and user_id = v_target.user_id;

  insert into public.live_session_events(session_id, actor_user_id, event_type, metadata)
  values(p_session_id, auth.uid(), 'primary_host_delegated', jsonb_build_object(
    'host_user_id', v_target.user_id,
    'previous_host_user_id', v_previous_user_id,
    'session_scoped', true
  ));

  perform private.send_push_webhook(jsonb_build_object(
    'user_id', v_target.user_id,
    'title', 'Your Live stage is ready',
    'body', 'You are hosting ' || v_session.title || '. Open your private Host Studio to prepare.',
    'data', jsonb_build_object(
      'type', 'live_host_assigned',
      'session_id', p_session_id,
      'route', '/live/event/' || p_session_id::text,
      'studio_url', 'https://studio.getbetweener.com/?session=' || p_session_id::text
    )
  ));

  insert into public.live_session_structure_updates(session_id, reason)
  values(p_session_id, 'session_structure')
  on conflict(session_id) do update set
    version = public.live_session_structure_updates.version + 1,
    reason = 'session_structure', updated_at = v_now;

  return public.rpc_get_live_hosting_management_v1(p_session_id);
end;
$$;

create or replace function public.rpc_admin_revoke_live_host_v1(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_session public.live_sessions;
  v_assignment public.live_session_host_assignments;
begin
  if auth.uid() is null or not public.is_admin_user(auth.uid()) then
    raise exception 'live_host_admin_required' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('live-host:' || p_session_id::text, 0));
  select * into v_session from public.live_sessions where id = p_session_id for update;
  select * into v_assignment from public.live_session_host_assignments
  where session_id = p_session_id and status = 'active' for update;
  if v_session.id is null then
    raise exception 'live_session_not_found' using errcode = 'P0002';
  end if;
  if v_assignment.id is null
    or v_session.status not in ('scheduled','waiting_for_quorum','confirmed','backstage')
    or v_session.produced_by_user_id is null or v_session.produced_by_profile_id is null then
    raise exception 'live_host_revocation_unavailable' using errcode = '55000';
  end if;

  update public.live_session_host_assignments
  set status = 'revoked', revoked_at = v_now, updated_at = v_now
  where id = v_assignment.id;
  update public.live_sessions
  set created_by_user_id = produced_by_user_id,
      created_by_profile_id = produced_by_profile_id,
      version = version + 1
  where id = p_session_id;

  delete from public.live_participant_roles
  where session_id = p_session_id and user_id = v_assignment.user_id and role = 'host';
  insert into public.live_participant_roles(session_id, user_id, role, assigned_by_user_id)
  values(p_session_id, v_session.produced_by_user_id, 'host', auth.uid())
  on conflict(session_id, user_id, role) do nothing;

  update public.live_participants set role = 'audience'
  where session_id = p_session_id and user_id = v_assignment.user_id and role = 'host';
  update public.live_participants set role = 'host'
  where session_id = p_session_id and user_id = v_session.produced_by_user_id;

  insert into public.live_session_events(session_id, actor_user_id, event_type, metadata)
  values(p_session_id, auth.uid(), 'primary_host_revoked', jsonb_build_object(
    'host_user_id', v_assignment.user_id,
    'restored_producer_user_id', v_session.produced_by_user_id
  ));

  perform private.send_push_webhook(jsonb_build_object(
    'user_id', v_assignment.user_id,
    'title', 'Live Host access updated',
    'body', 'Your Host access for ' || v_session.title || ' has ended.',
    'data', jsonb_build_object('type', 'live_host_revoked', 'session_id', p_session_id)
  ));

  return public.rpc_get_live_hosting_management_v1(p_session_id);
end;
$$;

create or replace function public.rpc_extend_live_session_v1(
  p_session_id uuid,
  p_extension_minutes integer default null,
  p_keep_open boolean default false
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
  v_new_end timestamptz;
  v_new_duration integer;
begin
  if auth.uid() is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if coalesce(p_keep_open, false) = (p_extension_minutes is not null) then
    raise exception 'live_extension_choice_invalid' using errcode = '22023';
  end if;
  if p_extension_minutes is not null
    and (p_extension_minutes not between 15 and 360 or p_extension_minutes % 15 <> 0) then
    raise exception 'live_extension_minutes_invalid' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('live-runtime:' || p_session_id::text, 0));
  select * into v_session from public.live_sessions where id = p_session_id for update;
  if v_session.id is null then
    raise exception 'live_session_not_found' using errcode = 'P0002';
  end if;
  if not public.is_admin_user(auth.uid()) and v_session.created_by_user_id <> auth.uid() then
    raise exception 'live_extension_forbidden' using errcode = '42501';
  end if;
  if v_session.ownership_type <> 'human'
    or v_session.status not in ('scheduled','waiting_for_quorum','confirmed','backstage','live') then
    raise exception 'live_extension_unavailable' using errcode = '55000';
  end if;

  if coalesce(p_keep_open, false) then
    update public.live_sessions
    set end_policy = 'manual', runtime_end_at = null,
        runtime_extended_at = v_now, runtime_extended_by_user_id = auth.uid(),
        version = version + 1
    where id = p_session_id;
  else
    v_new_end := greatest(
      coalesce(v_session.runtime_end_at, v_session.scheduled_end, v_now),
      v_now
    ) + make_interval(mins => p_extension_minutes);
    v_new_duration := greatest(30, ceil(extract(epoch from (
      v_new_end - coalesce(v_session.scheduled_start, v_session.started_at, v_now)
    )) / 60)::integer);
    if v_new_duration > 1440 then
      raise exception 'live_extension_daily_limit' using errcode = '22023';
    end if;

    update public.live_sessions
    set end_policy = 'scheduled', runtime_end_at = v_new_end,
        scheduled_end = v_new_end, scheduled_duration_minutes = v_new_duration,
        runtime_extended_at = v_now, runtime_extended_by_user_id = auth.uid(),
        version = version + 1
    where id = p_session_id;

    update public.gatherings set ends_at = v_new_end
    where live_session_id = p_session_id;
  end if;

  insert into public.live_session_events(session_id, actor_user_id, event_type, metadata)
  values(p_session_id, auth.uid(), 'live_runtime_extended', jsonb_build_object(
    'extension_minutes', p_extension_minutes,
    'end_policy', case when p_keep_open then 'manual' else 'scheduled' end,
    'audience_count', (select count(*) from public.live_participants
      where session_id = p_session_id and state in ('audience','stage_requested','backstage','on_stage','private_spark'))
  ));

  insert into public.live_session_structure_updates(session_id, reason)
  values(p_session_id, 'session_structure')
  on conflict(session_id) do update set
    version = public.live_session_structure_updates.version + 1,
    reason = 'session_structure', updated_at = v_now;

  return public.rpc_get_live_hosting_management_v1(p_session_id);
end;
$$;

create or replace function public.expire_live_delegated_host_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_delegated_user_id uuid;
begin
  if new.status in ('ended','cancelled') and old.status is distinct from new.status then
    select user_id into v_delegated_user_id
    from public.live_session_host_assignments
    where session_id = new.id and status = 'active';

    update public.live_session_host_assignments
    set status = 'expired', expired_at = timezone('utc', now()),
        updated_at = timezone('utc', now())
    where session_id = new.id and status = 'active';
    delete from public.live_participant_roles assignment
    using public.live_session_host_assignments delegated
    where delegated.session_id = new.id
      and delegated.status = 'expired'
      and assignment.session_id = delegated.session_id
      and assignment.user_id = delegated.user_id
      and assignment.role = 'host';

    if v_delegated_user_id is not null
      and new.produced_by_user_id is not null
      and new.produced_by_profile_id is not null then
      update public.live_sessions
      set created_by_user_id = new.produced_by_user_id,
          created_by_profile_id = new.produced_by_profile_id,
          version = version + 1
      where id = new.id and created_by_user_id = v_delegated_user_id;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists live_session_expire_delegated_host on public.live_sessions;
create trigger live_session_expire_delegated_host
after update of status on public.live_sessions
for each row execute function public.expire_live_delegated_host_v1();

create table public.live_discovery_updates (
  id boolean primary key default true check (id),
  version bigint not null default 1 check (version > 0),
  active_live_count integer not null default 0 check (active_live_count >= 0),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.live_discovery_updates enable row level security;
alter table public.live_discovery_updates force row level security;
create policy live_discovery_updates_select_authenticated
on public.live_discovery_updates for select to authenticated using (true);
revoke all on table public.live_discovery_updates from public, anon, authenticated;
grant select on table public.live_discovery_updates to authenticated;
grant all on table public.live_discovery_updates to service_role;

create or replace function public.bump_live_discovery_update_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
begin
  insert into public.live_discovery_updates(id, version, active_live_count, updated_at)
  values(true, 1, (
    select count(*)::integer from public.live_sessions
    where status in ('live','ending')
      and context_type in ('global','match_night','diaspora','special_event')
  ), timezone('utc', now()))
  on conflict(id) do update set
    version = public.live_discovery_updates.version + 1,
    active_live_count = excluded.active_live_count,
    updated_at = excluded.updated_at;
  return new;
end;
$$;

drop trigger if exists live_sessions_bump_discovery on public.live_sessions;
create trigger live_sessions_bump_discovery
after insert or update of status, scheduled_start, scheduled_end, created_by_user_id
on public.live_sessions
for each row execute function public.bump_live_discovery_update_v1();

insert into public.live_discovery_updates(id, active_live_count)
select true, count(*)::integer from public.live_sessions
where status in ('live','ending')
  and context_type in ('global','match_night','diaspora','special_event')
on conflict(id) do update set
  active_live_count = excluded.active_live_count,
  version = public.live_discovery_updates.version + 1,
  updated_at = timezone('utc', now());

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'live_discovery_updates'
  ) then
    alter publication supabase_realtime add table public.live_discovery_updates;
  end if;
end;
$$;

revoke all on function public.rpc_get_live_hosting_management_v1(uuid),
  public.rpc_admin_delegate_live_host_v1(uuid, text),
  public.rpc_admin_revoke_live_host_v1(uuid),
  public.rpc_extend_live_session_v1(uuid, integer, boolean)
from public, anon;
grant execute on function public.rpc_get_live_hosting_management_v1(uuid),
  public.rpc_admin_delegate_live_host_v1(uuid, text),
  public.rpc_admin_revoke_live_host_v1(uuid),
  public.rpc_extend_live_session_v1(uuid, integer, boolean)
to authenticated, service_role;

comment on table public.live_session_host_assignments is
  'Audited primary Host handoffs scoped to one Live; never grants global admin or creator eligibility.';
comment on function public.rpc_extend_live_session_v1(uuid, integer, boolean) is
  'Lets the active primary Host extend a human Live in 15-minute increments or keep it open until manually ended.';

commit;
