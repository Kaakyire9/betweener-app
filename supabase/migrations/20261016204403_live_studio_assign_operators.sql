-- Session-scoped Studio operator assignments.
--
-- Authentication, MFA enrollment and global closed-beta access are not
-- programme assignments. This control plane gives an administrator one
-- atomic, expiring way to make an operator visible to exactly one Live.

begin;

create table public.live_studio_session_operators (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.live_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  operator_role text not null check (
    operator_role in ('viewer', 'producer', 'moderator')
  ),
  status text not null default 'active' check (
    status in ('active', 'revoked')
  ),
  note text check (note is null or char_length(note) <= 240),
  assigned_by_user_id uuid not null references auth.users(id) on delete restrict,
  assigned_at timestamptz not null default timezone('utc', now()),
  expires_at timestamptz not null,
  revoked_by_user_id uuid references auth.users(id) on delete restrict,
  revoked_at timestamptz,
  updated_at timestamptz not null default timezone('utc', now()),
  constraint live_studio_session_operators_unique unique (session_id, user_id),
  constraint live_studio_session_operators_expiry_valid check (expires_at > assigned_at),
  constraint live_studio_session_operators_revocation_valid check (
    (status = 'active' and revoked_at is null and revoked_by_user_id is null)
    or (status = 'revoked' and revoked_at is not null and revoked_by_user_id is not null)
  )
);

create index live_studio_session_operators_active_lookup_idx
  on public.live_studio_session_operators(session_id, user_id, expires_at)
  where status = 'active';

create index live_studio_session_operators_user_active_idx
  on public.live_studio_session_operators(user_id, expires_at, session_id)
  where status = 'active';

alter table public.live_studio_session_operators enable row level security;
alter table public.live_studio_session_operators force row level security;

revoke all on table public.live_studio_session_operators
from public, anon, authenticated, service_role;
grant all on table public.live_studio_session_operators to service_role;

create trigger live_studio_session_operators_updated_at
before update on public.live_studio_session_operators
for each row execute function public.set_updated_at();

create or replace function public.live_studio_session_operator_role_v1(
  p_session_id uuid,
  p_user_id uuid
)
returns text
language sql
stable
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
  select assignment.operator_role
  from public.live_studio_session_operators assignment
  where assignment.session_id = p_session_id
    and assignment.user_id = p_user_id
    and assignment.status = 'active'
    and assignment.expires_at > timezone('utc', now())
  limit 1;
$$;

revoke all on function public.live_studio_session_operator_role_v1(uuid, uuid)
from public, anon, authenticated, service_role;

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
  v_assignment_role text;
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

  v_assignment_role := public.live_studio_session_operator_role_v1(
    p_session_id,
    p_user_id
  );
  v_delegated_host := public.live_session_has_active_delegated_host_v1(
    p_session_id,
    p_user_id
  );
  v_role_allowed := v_assignment_role is not null
    or public.is_admin_user(p_user_id)
    or v_delegated_host
    or public.has_live_capability(p_session_id, 'live.view_host_console', p_user_id)
    or exists (
      select 1 from public.live_sessions session
      where session.id = p_session_id and session.created_by_user_id = p_user_id
    );
  if not v_role_allowed then return false; end if;

  -- A scoped assignment is its own closed-beta admission. Legacy account-wide
  -- access remains available for supervisors and existing producer canaries.
  select * into v_access from public.live_studio_access access
  where access.user_id = p_user_id
    and access.allowed
    and (access.expires_at is null or access.expires_at > timezone('utc', now()));

  v_rollout_allowed := v_assignment_role is not null
    or v_delegated_host
    or not coalesce(v_config.studio_closed_beta, true)
    or v_access.user_id is not null;
  if not v_rollout_allowed then return false; end if;

  if v_assignment_role is not null then
    return case p_capability
      when 'view' then true
      when 'control' then v_config.betweener_studio_control_enabled
        and v_assignment_role = 'producer'
      when 'publish' then v_config.studio_media_publishing_enabled
        and v_assignment_role = 'producer'
      when 'screen_share' then v_config.screen_share_enabled
        and v_assignment_role = 'producer'
      when 'external_audio' then v_config.studio_external_audio_enabled
        and v_assignment_role = 'producer'
      when 'moderate' then v_assignment_role = 'moderator'
      else false
    end;
  end if;

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

create or replace function public.live_studio_operator_role_v1(
  p_session_id uuid,
  p_user_id uuid
)
returns text
language sql
stable
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
  select case
    when not public.live_studio_is_authorized_v1(p_session_id, p_user_id, 'view')
      then null
    else coalesce(
      public.live_studio_session_operator_role_v1(p_session_id, p_user_id),
      (
        select access.operator_role
        from public.live_studio_access access
        where access.user_id = p_user_id
          and access.allowed
          and (access.expires_at is null or access.expires_at > timezone('utc', now()))
      ),
      case when public.is_admin_user(p_user_id) then 'supervisor' else 'viewer' end
    )
  end;
$$;

revoke all on function public.live_studio_operator_role_v1(uuid, uuid)
from public, anon, authenticated, service_role;

-- Apply the same AAL2 boundary to scoped producers as to legacy global
-- producers if a lower-level status transition is attempted.
create or replace function public.live_studio_enforce_step_up_transition_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
begin
  if new.status is distinct from old.status
    and new.status in ('live','ended')
    and auth.uid() is not null
    and public.live_studio_is_authorized_v1(old.id, auth.uid(), 'publish')
    and not public.live_studio_has_aal2_v1() then
    raise exception 'live_studio_step_up_required' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.live_studio_enforce_step_up_transition_v1()
from public, anon, authenticated, service_role;

create or replace function public.rpc_get_live_studio_session_operators_v1(
  p_session_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_catalog
set row_security = off
as $$
declare
  v_session public.live_sessions;
  v_default_expires_at timestamptz;
  v_operators jsonb;
begin
  if auth.uid() is null or not public.is_admin_user(auth.uid()) then
    raise exception 'live_studio_admin_required' using errcode = '42501';
  end if;

  select * into v_session
  from public.live_sessions session
  where session.id = p_session_id;
  if v_session.id is null then
    raise exception 'live_session_not_found' using errcode = 'P0002';
  end if;

  v_default_expires_at := least(
    greatest(
      coalesce(
        v_session.scheduled_end + interval '2 hours',
        v_session.scheduled_start
          + make_interval(mins => coalesce(v_session.scheduled_duration_minutes, 60))
          + interval '2 hours',
        timezone('utc', now()) + interval '8 hours'
      ),
      timezone('utc', now()) + interval '2 hours'
    ),
    timezone('utc', now()) + interval '30 days'
  );

  select coalesce(jsonb_agg(jsonb_build_object(
    'assignmentId', assignment.id,
    'userId', assignment.user_id,
    'email', account.email,
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
    'expiresAt', assignment.expires_at,
    'note', assignment.note
  ) order by
    case when assignment.status = 'active'
      and assignment.expires_at > timezone('utc', now()) then 0 else 1 end,
    assignment.assigned_at desc), '[]'::jsonb)
  into v_operators
  from public.live_studio_session_operators assignment
  join auth.users account on account.id = assignment.user_id
  left join public.profiles profile on profile.user_id = assignment.user_id
  where assignment.session_id = p_session_id;

  return jsonb_build_object(
    'schemaVersion', 1,
    'serverNow', timezone('utc', now()),
    'sessionId', v_session.id,
    'sessionTitle', v_session.title,
    'sessionStatus', v_session.status,
    'canAssign', v_session.status not in ('ended', 'cancelled'),
    'defaultExpiresAt', v_default_expires_at,
    'operators', v_operators
  );
end;
$$;

create or replace function public.rpc_admin_assign_live_studio_operator_v1(
  p_session_id uuid,
  p_email text,
  p_operator_role text,
  p_expires_at timestamptz default null,
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
  v_target_user_id uuid;
  v_target_profile public.profiles;
  v_default_expires_at timestamptz;
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
    or p_operator_role not in ('viewer', 'producer', 'moderator')
    or (p_note is not null and char_length(p_note) > 240) then
    raise exception 'live_studio_operator_assignment_invalid' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'live-studio-operators:' || p_session_id::text,
    0
  ));
  select * into v_session
  from public.live_sessions session
  where session.id = p_session_id
  for update;
  if v_session.id is null then
    raise exception 'live_session_not_found' using errcode = 'P0002';
  end if;
  if v_session.status in ('ended', 'cancelled') then
    raise exception 'live_studio_operator_assignment_closed' using errcode = '55000';
  end if;

  select account.id into v_target_user_id
  from auth.users account
  where lower(account.email) = lower(btrim(p_email))
    and account.deleted_at is null
  limit 1;
  if v_target_user_id is null then
    raise exception 'live_studio_operator_account_not_found' using errcode = 'P0002';
  end if;

  select * into v_target_profile
  from public.profiles profile
  where profile.user_id = v_target_user_id
    and profile.deleted_at is null
    and profile.is_active
    and profile.account_state = 'active'
  limit 1;
  if v_target_profile.id is null then
    raise exception 'live_studio_operator_profile_unavailable' using errcode = '55000';
  end if;

  v_default_expires_at := least(
    greatest(
      coalesce(
        v_session.scheduled_end + interval '2 hours',
        v_session.scheduled_start
          + make_interval(mins => coalesce(v_session.scheduled_duration_minutes, 60))
          + interval '2 hours',
        v_now + interval '8 hours'
      ),
      v_now + interval '2 hours'
    ),
    v_now + interval '30 days'
  );
  v_expires_at := coalesce(p_expires_at, v_default_expires_at);
  if v_expires_at <= v_now + interval '15 minutes'
    or v_expires_at > v_now + interval '30 days' then
    raise exception 'live_studio_operator_expiry_invalid' using errcode = '22023';
  end if;

  insert into public.live_studio_session_operators(
    session_id,
    user_id,
    operator_role,
    status,
    note,
    assigned_by_user_id,
    assigned_at,
    expires_at,
    revoked_by_user_id,
    revoked_at
  ) values (
    p_session_id,
    v_target_user_id,
    p_operator_role,
    'active',
    nullif(btrim(p_note), ''),
    auth.uid(),
    v_now,
    v_expires_at,
    null,
    null
  ) on conflict (session_id, user_id) do update set
    operator_role = excluded.operator_role,
    status = 'active',
    note = excluded.note,
    assigned_by_user_id = auth.uid(),
    assigned_at = v_now,
    expires_at = excluded.expires_at,
    revoked_by_user_id = null,
    revoked_at = null;

  delete from public.live_studio_operator_presence presence
  where presence.session_id = p_session_id
    and presence.user_id = v_target_user_id;

  insert into public.live_studio_operational_events(
    session_id,
    actor_user_id,
    event_type,
    severity,
    details
  ) values (
    p_session_id,
    auth.uid(),
    'operator_assigned',
    'info',
    jsonb_build_object(
      'operatorUserId', v_target_user_id,
      'operatorRole', p_operator_role,
      'expiresAt', v_expires_at
    )
  );

  return public.rpc_get_live_studio_session_operators_v1(p_session_id);
end;
$$;

create or replace function public.rpc_admin_revoke_live_studio_operator_v1(
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
  v_assignment public.live_studio_session_operators;
begin
  if auth.uid() is null or not public.is_admin_user(auth.uid()) then
    raise exception 'live_studio_admin_required' using errcode = '42501';
  end if;
  if not public.live_studio_has_aal2_v1() then
    raise exception 'live_studio_step_up_required' using errcode = '42501';
  end if;
  if p_session_id is null or p_user_id is null then
    raise exception 'live_studio_operator_assignment_invalid' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'live-studio-operators:' || p_session_id::text,
    0
  ));
  select * into v_assignment
  from public.live_studio_session_operators assignment
  where assignment.session_id = p_session_id
    and assignment.user_id = p_user_id
  for update;
  if v_assignment.id is null then
    raise exception 'live_studio_operator_assignment_not_found' using errcode = 'P0002';
  end if;

  update public.live_studio_session_operators
  set
    status = 'revoked',
    revoked_by_user_id = auth.uid(),
    revoked_at = timezone('utc', now())
  where id = v_assignment.id;

  delete from public.live_studio_operator_presence presence
  where presence.session_id = p_session_id
    and presence.user_id = p_user_id;

  insert into public.live_studio_operational_events(
    session_id,
    actor_user_id,
    event_type,
    severity,
    details
  ) values (
    p_session_id,
    auth.uid(),
    'operator_revoked',
    'warning',
    jsonb_build_object(
      'operatorUserId', p_user_id,
      'operatorRole', v_assignment.operator_role
    )
  );

  return public.rpc_get_live_studio_session_operators_v1(p_session_id);
end;
$$;

revoke all on function public.rpc_get_live_studio_session_operators_v1(uuid)
from public, anon;
revoke all on function public.rpc_admin_assign_live_studio_operator_v1(
  uuid, text, text, timestamptz, text
) from public, anon;
revoke all on function public.rpc_admin_revoke_live_studio_operator_v1(uuid, uuid)
from public, anon;

grant execute on function public.rpc_get_live_studio_session_operators_v1(uuid)
to authenticated;
grant execute on function public.rpc_admin_assign_live_studio_operator_v1(
  uuid, text, text, timestamptz, text
) to authenticated;
grant execute on function public.rpc_admin_revoke_live_studio_operator_v1(uuid, uuid)
to authenticated;

commit;
