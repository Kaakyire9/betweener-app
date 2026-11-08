-- Live-safe Studio team management.
--
-- Operator access and on-air hosting are deliberately separate. A co-host can
-- help run the room without replacing the event creator or primary host.

begin;

create table public.live_session_on_air_hosts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.live_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'revoked')),
  note text check (note is null or char_length(note) <= 240),
  assigned_by_user_id uuid not null references auth.users(id) on delete restrict,
  assigned_at timestamptz not null default timezone('utc', now()),
  expires_at timestamptz not null,
  revoked_by_user_id uuid references auth.users(id) on delete restrict,
  revoked_at timestamptz,
  updated_at timestamptz not null default timezone('utc', now()),
  constraint live_session_on_air_hosts_unique unique (session_id, user_id),
  constraint live_session_on_air_hosts_expiry_valid check (expires_at > assigned_at),
  constraint live_session_on_air_hosts_revocation_valid check (
    (status = 'active' and revoked_at is null and revoked_by_user_id is null)
    or (status = 'revoked' and revoked_at is not null and revoked_by_user_id is not null)
  )
);

create index live_session_on_air_hosts_active_idx
  on public.live_session_on_air_hosts(session_id, user_id, expires_at)
  where status = 'active';

alter table public.live_session_on_air_hosts enable row level security;
alter table public.live_session_on_air_hosts force row level security;
revoke all on table public.live_session_on_air_hosts
from public, anon, authenticated, service_role;
grant all on table public.live_session_on_air_hosts to service_role;

create trigger live_session_on_air_hosts_updated_at
before update on public.live_session_on_air_hosts
for each row execute function public.set_updated_at();

create table public.live_studio_team_updates (
  session_id uuid primary key references public.live_sessions(id) on delete cascade,
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.live_studio_team_updates enable row level security;
alter table public.live_studio_team_updates force row level security;
revoke all on table public.live_studio_team_updates from public, anon, authenticated;
grant select on table public.live_studio_team_updates to authenticated;
grant all on table public.live_studio_team_updates to service_role;

create or replace function public.live_studio_can_receive_team_updates_v1(
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
  select p_user_id is not null and (
    public.is_admin_user(p_user_id)
    or public.live_studio_is_authorized_v1(p_session_id, p_user_id, 'view')
  );
$$;

revoke all on function public.live_studio_can_receive_team_updates_v1(uuid, uuid)
from public, anon, authenticated;
grant execute on function public.live_studio_can_receive_team_updates_v1(uuid, uuid)
to authenticated, service_role;

create policy live_studio_team_updates_select_authorized
on public.live_studio_team_updates for select to authenticated
using (public.live_studio_can_receive_team_updates_v1(session_id, (select auth.uid())));

create or replace function public.live_studio_bump_team_revision_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_session_id uuid := coalesce(new.session_id, old.session_id);
begin
  insert into public.live_studio_team_updates(session_id, revision, updated_at)
  values(v_session_id, 1, timezone('utc', now()))
  on conflict(session_id) do update set
    revision = public.live_studio_team_updates.revision + 1,
    updated_at = excluded.updated_at;
  return null;
end;
$$;

revoke all on function public.live_studio_bump_team_revision_v1()
from public, anon, authenticated, service_role;

create trigger live_studio_session_operators_team_revision
after insert or update or delete on public.live_studio_session_operators
for each row execute function public.live_studio_bump_team_revision_v1();

create trigger live_session_on_air_hosts_team_revision
after insert or update or delete on public.live_session_on_air_hosts
for each row execute function public.live_studio_bump_team_revision_v1();

alter table public.live_studio_team_updates replica identity full;
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'live_studio_team_updates'
  ) then
    alter publication supabase_realtime add table public.live_studio_team_updates;
  end if;
end;
$$;

create or replace function public.live_session_has_active_on_air_host_v1(
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
  select exists (
    select 1
    from public.live_session_on_air_hosts host
    where host.session_id = p_session_id
      and host.user_id = p_user_id
      and host.status = 'active'
      and host.expires_at > timezone('utc', now())
  );
$$;

revoke all on function public.live_session_has_active_on_air_host_v1(uuid, uuid)
from public, anon, authenticated;
grant execute on function public.live_session_has_active_on_air_host_v1(uuid, uuid)
to service_role;

-- An active co-host receives the established host capability set without
-- changing live_sessions.created_by_user_id or inserting a permanent role.
create or replace function public.resolve_live_capabilities(
  p_session_id uuid,
  p_user_id uuid default auth.uid()
)
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
     and coalesce(auth.jwt() ->> 'role', '') <> 'service_role'
     and not public.is_admin_user(auth.uid()) then
    raise exception 'live_capability_subject_forbidden' using errcode = '42501';
  end if;

  with roles as (
    select assignment.role
    from public.live_participant_roles assignment
    where assignment.session_id = p_session_id and assignment.user_id = p_user_id
    union
    select participant.role
    from public.live_participants participant
    where participant.session_id = p_session_id and participant.user_id = p_user_id
    union all
    select 'host'
    where public.live_session_has_active_on_air_host_v1(p_session_id, p_user_id)
    union all
    select 'internal_admin' where public.is_admin_user(p_user_id)
  ), base as (
    select distinct capability
    from roles role, lateral unnest(public.live_role_capabilities(role.role)) capability
  ), grants as (
    select capability from public.live_session_capability_assignments
    where session_id = p_session_id and user_id = p_user_id and effect = 'grant'
  ), revocations as (
    select capability from public.live_session_capability_assignments
    where session_id = p_session_id and user_id = p_user_id and effect = 'revoke'
  )
  select coalesce(array_agg(distinct candidate.capability order by candidate.capability), array[]::text[])
  into v_capabilities
  from (select capability from base union select capability from grants) candidate
  where not exists (
    select 1 from revocations revoked where revoked.capability = candidate.capability
  );

  return v_capabilities;
end;
$$;

create or replace function public.rpc_get_live_studio_team_v1(p_session_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_catalog
set row_security = off
as $$
declare
  v_session public.live_sessions;
  v_primary_host public.profiles;
  v_can_manage boolean := false;
  v_operators jsonb := '[]'::jsonb;
  v_hosts jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  select * into v_session from public.live_sessions where id = p_session_id;
  if v_session.id is null then
    raise exception 'live_session_not_found' using errcode = 'P0002';
  end if;
  if not public.is_admin_user(auth.uid())
    and not public.live_studio_is_authorized_v1(p_session_id, auth.uid(), 'view')
    and not public.has_live_capability(p_session_id, 'live.view_host_console', auth.uid()) then
    raise exception 'live_studio_team_forbidden' using errcode = '42501';
  end if;

  v_can_manage := public.is_admin_user(auth.uid())
    and v_session.status not in ('ended', 'cancelled');

  select * into v_primary_host
  from public.profiles profile
  where profile.user_id = v_session.created_by_user_id
    and profile.deleted_at is null;

  select coalesce(jsonb_agg(jsonb_build_object(
    'assignmentId', assignment.id,
    'userId', assignment.user_id,
    'email', case when v_can_manage then account.email else null end,
    'fullName', profile.full_name,
    'username', profile.username,
    'avatarUrl', profile.avatar_url,
    'operatorRole', assignment.operator_role,
    'status', case
      when assignment.status = 'active'
        and assignment.expires_at <= timezone('utc', now()) then 'expired'
      else assignment.status
    end,
    'assignedAt', assignment.assigned_at,
    'expiresAt', assignment.expires_at
  ) order by assignment.assigned_at desc), '[]'::jsonb)
  into v_operators
  from public.live_studio_session_operators assignment
  join auth.users account on account.id = assignment.user_id
  left join public.profiles profile on profile.user_id = assignment.user_id
  where assignment.session_id = p_session_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'assignmentId', host.id,
    'userId', host.user_id,
    'profileId', host.profile_id,
    'email', case when v_can_manage then account.email else null end,
    'fullName', profile.full_name,
    'username', profile.username,
    'avatarUrl', profile.avatar_url,
    'status', case
      when host.status = 'active' and host.expires_at <= timezone('utc', now()) then 'expired'
      else host.status
    end,
    'assignedAt', host.assigned_at,
    'expiresAt', host.expires_at
  ) order by host.assigned_at desc), '[]'::jsonb)
  into v_hosts
  from public.live_session_on_air_hosts host
  join auth.users account on account.id = host.user_id
  join public.profiles profile on profile.id = host.profile_id
  where host.session_id = p_session_id;

  return jsonb_build_object(
    'schemaVersion', 1,
    'serverNow', timezone('utc', now()),
    'sessionId', v_session.id,
    'sessionTitle', v_session.title,
    'sessionStatus', v_session.status,
    'canManageTeam', v_can_manage,
    'primaryHost', jsonb_build_object(
      'userId', v_session.created_by_user_id,
      'profileId', v_session.created_by_profile_id,
      'fullName', v_primary_host.full_name,
      'username', v_primary_host.username,
      'avatarUrl', v_primary_host.avatar_url
    ),
    'operators', v_operators,
    'onAirHosts', v_hosts
  );
end;
$$;

create or replace function public.rpc_admin_assign_live_on_air_host_v1(
  p_session_id uuid,
  p_email text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_catalog
set row_security = off
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_session public.live_sessions;
  v_user_id uuid;
  v_profile public.profiles;
  v_expires_at timestamptz;
begin
  if auth.uid() is null or not public.is_admin_user(auth.uid()) then
    raise exception 'live_studio_admin_required' using errcode = '42501';
  end if;
  if not public.live_studio_has_aal2_v1() then
    raise exception 'live_studio_step_up_required' using errcode = '42501';
  end if;
  if nullif(btrim(p_email), '') is null
    or char_length(btrim(p_email)) > 254
    or (p_note is not null and char_length(p_note) > 240) then
    raise exception 'live_on_air_host_assignment_invalid' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('live-on-air-hosts:' || p_session_id::text, 0));
  select * into v_session from public.live_sessions where id = p_session_id for update;
  if v_session.id is null then
    raise exception 'live_session_not_found' using errcode = 'P0002';
  end if;
  if v_session.ownership_type <> 'human'
    or v_session.status not in ('scheduled', 'waiting_for_quorum', 'confirmed', 'backstage', 'live') then
    raise exception 'live_on_air_host_assignment_closed' using errcode = '55000';
  end if;

  select account.id into v_user_id
  from auth.users account
  where lower(account.email) = lower(btrim(p_email))
    and account.deleted_at is null
  limit 1;
  if v_user_id is null then
    raise exception 'live_on_air_host_account_not_found' using errcode = 'P0002';
  end if;
  if v_user_id = v_session.created_by_user_id then
    raise exception 'live_on_air_host_is_primary' using errcode = '55000';
  end if;

  select * into v_profile
  from public.profiles profile
  where profile.user_id = v_user_id
    and profile.deleted_at is null
    and profile.is_active
    and profile.account_state = 'active'
  limit 1;
  if v_profile.id is null then
    raise exception 'live_on_air_host_profile_unavailable' using errcode = '55000';
  end if;

  v_expires_at := least(
    greatest(
      coalesce(v_session.runtime_end_at, v_session.scheduled_end,
        v_session.scheduled_start + make_interval(mins => v_session.scheduled_duration_minutes))
        + interval '2 hours',
      v_now + interval '2 hours'
    ),
    v_now + interval '30 days'
  );

  insert into public.live_session_on_air_hosts(
    session_id, user_id, profile_id, status, note, assigned_by_user_id,
    assigned_at, expires_at, revoked_by_user_id, revoked_at
  ) values (
    p_session_id, v_user_id, v_profile.id, 'active', nullif(btrim(p_note), ''),
    auth.uid(), v_now, v_expires_at, null, null
  ) on conflict(session_id, user_id) do update set
    profile_id = excluded.profile_id,
    status = 'active',
    note = excluded.note,
    assigned_by_user_id = auth.uid(),
    assigned_at = v_now,
    expires_at = excluded.expires_at,
    revoked_by_user_id = null,
    revoked_at = null;

  insert into public.live_studio_operational_events(
    session_id, actor_user_id, event_type, severity, details
  ) values (
    p_session_id, auth.uid(), 'on_air_host_assigned', 'info',
    jsonb_build_object('hostUserId', v_user_id, 'expiresAt', v_expires_at)
  );
  insert into public.live_session_events(session_id, actor_user_id, event_type, metadata)
  values(p_session_id, auth.uid(), 'on_air_host_assigned', jsonb_build_object(
    'host_user_id', v_user_id,
    'host_profile_id', v_profile.id,
    'expires_at', v_expires_at
  ));

  return public.rpc_get_live_studio_team_v1(p_session_id);
end;
$$;

create or replace function public.rpc_admin_revoke_live_on_air_host_v1(
  p_session_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_host public.live_session_on_air_hosts;
begin
  if auth.uid() is null or not public.is_admin_user(auth.uid()) then
    raise exception 'live_studio_admin_required' using errcode = '42501';
  end if;
  if not public.live_studio_has_aal2_v1() then
    raise exception 'live_studio_step_up_required' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('live-on-air-hosts:' || p_session_id::text, 0));
  select * into v_host
  from public.live_session_on_air_hosts host
  where host.session_id = p_session_id
    and host.user_id = p_user_id
    and host.status = 'active'
  for update;
  if v_host.id is null then
    raise exception 'live_on_air_host_assignment_not_found' using errcode = 'P0002';
  end if;

  update public.live_session_on_air_hosts
  set status = 'revoked',
      revoked_by_user_id = auth.uid(),
      revoked_at = timezone('utc', now())
  where id = v_host.id;

  insert into public.live_studio_operational_events(
    session_id, actor_user_id, event_type, severity, details
  ) values (
    p_session_id, auth.uid(), 'on_air_host_revoked', 'warning',
    jsonb_build_object('hostUserId', p_user_id)
  );
  insert into public.live_session_events(session_id, actor_user_id, event_type, metadata)
  values(p_session_id, auth.uid(), 'on_air_host_revoked', jsonb_build_object(
    'host_user_id', p_user_id
  ));

  return public.rpc_get_live_studio_team_v1(p_session_id);
end;
$$;

-- Co-hosts can open the management surface and operate the room, but only
-- administrators can mutate the team roster.
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
  v_can_manage boolean := false;
begin
  if auth.uid() is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  select * into v_session from public.live_sessions where id = p_session_id;
  if v_session.id is null then
    raise exception 'live_session_not_found' using errcode = 'P0002';
  end if;
  v_can_manage := public.is_admin_user(auth.uid())
    or v_session.created_by_user_id = auth.uid()
    or public.live_session_has_active_delegated_host_v1(p_session_id, auth.uid())
    or public.has_live_capability(p_session_id, 'live.view_host_console', auth.uid());
  if not v_can_manage then
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
    'schemaVersion', 2,
    'serverNow', timezone('utc', now()),
    'sessionId', v_session.id,
    'title', v_session.title,
    'status', v_session.status,
    'canManageSession', v_can_manage and v_session.status not in ('ended', 'cancelled'),
    'canDelegateHosts', public.is_admin_user(auth.uid())
      and v_session.ownership_type = 'human'
      and v_session.status in ('scheduled','waiting_for_quorum','confirmed','backstage'),
    'canExtend', v_can_manage
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

revoke all on function public.rpc_get_live_studio_team_v1(uuid),
  public.rpc_admin_assign_live_on_air_host_v1(uuid, text, text),
  public.rpc_admin_revoke_live_on_air_host_v1(uuid, uuid)
from public, anon;
grant execute on function public.rpc_get_live_studio_team_v1(uuid),
  public.rpc_admin_assign_live_on_air_host_v1(uuid, text, text),
  public.rpc_admin_revoke_live_on_air_host_v1(uuid, uuid)
to authenticated, service_role;

commit;
