-- Betweener Live Phase B: operator-grade Studio controls.
-- Additive control-plane data stays private and is exposed only through
-- capability checked RPCs. Privileged Studio operations require AAL2.

begin;

alter table public.live_studio_access
  add column if not exists operator_role text;

update public.live_studio_access
set operator_role = case
  when can_control and can_moderate then 'supervisor'
  when can_control or can_publish then 'producer'
  when can_moderate then 'moderator'
  else 'viewer'
end
where operator_role is null;

alter table public.live_studio_access
  alter column operator_role set default 'viewer',
  alter column operator_role set not null,
  drop constraint if exists live_studio_access_operator_role_valid,
  add constraint live_studio_access_operator_role_valid check (
    operator_role in ('viewer','producer','moderator','supervisor')
  ),
  drop constraint if exists live_studio_access_operator_boundary_valid,
  add constraint live_studio_access_operator_boundary_valid check (
    operator_role = 'supervisor'
    or (operator_role = 'producer' and not can_moderate)
    or (operator_role = 'moderator' and not can_control and not can_publish
      and not can_screen_share and not can_use_external_audio)
    or (operator_role = 'viewer' and not can_control and not can_publish
      and not can_screen_share and not can_use_external_audio and not can_moderate)
  );

create table public.live_studio_run_cues (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.live_sessions(id) on delete cascade,
  position integer not null check (position between 1 and 500),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  notes text check (notes is null or char_length(notes) <= 1000),
  cue_type text not null default 'note' check (
    cue_type in ('note','scene','speaker','music','moderation','break','end')
  ),
  status text not null default 'pending' check (
    status in ('pending','ready','live','complete','skipped')
  ),
  expected_at timestamptz,
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (session_id, position)
);

create table public.live_studio_private_messages (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.live_sessions(id) on delete cascade,
  sender_user_id uuid not null references auth.users(id) on delete restrict,
  audience text not null check (audience in ('all','producers','moderators')),
  body text not null check (char_length(btrim(body)) between 1 and 500),
  created_at timestamptz not null default timezone('utc', now())
);

create table public.live_studio_operator_presence (
  session_id uuid not null references public.live_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  controller_instance_id uuid not null,
  operator_role text not null check (
    operator_role in ('viewer','producer','moderator','supervisor')
  ),
  readiness text not null default 'standby' check (
    readiness in ('standby','ready','primary','offline')
  ),
  last_seen_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  primary key (session_id, user_id, controller_instance_id)
);

create table public.live_studio_operational_events (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.live_sessions(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  event_type text not null check (event_type ~ '^[a-z][a-z0-9_]{2,63}$'),
  severity text not null default 'info' check (
    severity in ('info','warning','critical')
  ),
  details jsonb not null default '{}'::jsonb check (
    jsonb_typeof(details) = 'object' and octet_length(details::text) <= 4096
  ),
  requires_acknowledgement boolean not null default false,
  acknowledged_at timestamptz,
  acknowledged_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now())
);

create index live_studio_run_cues_session_order_idx
  on public.live_studio_run_cues(session_id, position);
create index live_studio_messages_session_created_idx
  on public.live_studio_private_messages(session_id, created_at desc);
create index live_studio_presence_session_seen_idx
  on public.live_studio_operator_presence(session_id, last_seen_at desc);
create index live_studio_events_session_created_idx
  on public.live_studio_operational_events(session_id, created_at desc);

alter table public.live_studio_run_cues enable row level security;
alter table public.live_studio_private_messages enable row level security;
alter table public.live_studio_operator_presence enable row level security;
alter table public.live_studio_operational_events enable row level security;

revoke all on table public.live_studio_run_cues,
  public.live_studio_private_messages,
  public.live_studio_operator_presence,
  public.live_studio_operational_events
from public, anon, authenticated, service_role;

create trigger live_studio_run_cues_updated_at
before update on public.live_studio_run_cues
for each row execute function public.set_updated_at();

create or replace function public.live_studio_has_aal2_v1()
returns boolean
language sql
stable
security invoker
set search_path = public, pg_catalog
as $$
  select coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2';
$$;

revoke all on function public.live_studio_has_aal2_v1()
from public, anon, authenticated, service_role;

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
    and exists (
      select 1 from public.live_studio_access access
      where access.user_id = auth.uid() and access.allowed and access.can_publish
        and (access.expires_at is null or access.expires_at > timezone('utc', now()))
    )
    and not public.live_studio_has_aal2_v1() then
    raise exception 'live_studio_step_up_required' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.live_studio_enforce_step_up_transition_v1()
from public, anon, authenticated, service_role;

drop trigger if exists live_sessions_studio_step_up_transition_v1 on public.live_sessions;
create trigger live_sessions_studio_step_up_transition_v1
before update of status on public.live_sessions
for each row execute function public.live_studio_enforce_step_up_transition_v1();

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
    else coalesce((
      select access.operator_role
      from public.live_studio_access access
      where access.user_id = p_user_id
        and access.allowed
        and (access.expires_at is null or access.expires_at > timezone('utc', now()))
    ), case when public.is_admin_user(p_user_id) then 'supervisor' else 'viewer' end)
  end;
$$;

revoke all on function public.live_studio_operator_role_v1(uuid, uuid)
from public, anon, authenticated, service_role;

create or replace function public.rpc_admin_set_live_studio_access_v2(
  p_user_id uuid,
  p_allowed boolean,
  p_operator_role text,
  p_capabilities jsonb default '{}'::jsonb,
  p_note text default null,
  p_expires_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare v_access public.live_studio_access;
begin
  if auth.uid() is null or not public.is_admin_user(auth.uid()) then
    raise exception 'live_studio_admin_required' using errcode = '42501';
  end if;
  if p_user_id is null or p_allowed is null
    or p_operator_role not in ('viewer','producer','moderator','supervisor')
    or jsonb_typeof(coalesce(p_capabilities, '{}'::jsonb)) <> 'object'
    or exists (select 1 from jsonb_object_keys(coalesce(p_capabilities, '{}'::jsonb)) key
      where key not in ('view','control','publish','screenShare','externalAudio','moderate'))
    or (p_note is not null and char_length(p_note) > 240)
    or (p_expires_at is not null and p_expires_at <= timezone('utc', now())) then
    raise exception 'live_studio_access_invalid' using errcode = '22023';
  end if;
  insert into public.live_studio_access(
    user_id, allowed, operator_role, can_view, can_control, can_publish,
    can_screen_share, can_use_external_audio, can_moderate, note,
    expires_at, created_by_user_id
  ) values (
    p_user_id, p_allowed, p_operator_role,
    p_allowed and coalesce((p_capabilities ->> 'view')::boolean, true),
    p_allowed and p_operator_role in ('producer','supervisor')
      and coalesce((p_capabilities ->> 'control')::boolean, false),
    p_allowed and p_operator_role in ('producer','supervisor')
      and coalesce((p_capabilities ->> 'publish')::boolean, false),
    p_allowed and p_operator_role in ('producer','supervisor')
      and coalesce((p_capabilities ->> 'screenShare')::boolean, false),
    p_allowed and p_operator_role in ('producer','supervisor')
      and coalesce((p_capabilities ->> 'externalAudio')::boolean, false),
    p_allowed and p_operator_role in ('moderator','supervisor')
      and coalesce((p_capabilities ->> 'moderate')::boolean, false),
    nullif(btrim(p_note), ''), p_expires_at, auth.uid()
  ) on conflict (user_id) do update set
    allowed = excluded.allowed, operator_role = excluded.operator_role,
    can_view = excluded.can_view, can_control = excluded.can_control,
    can_publish = excluded.can_publish, can_screen_share = excluded.can_screen_share,
    can_use_external_audio = excluded.can_use_external_audio,
    can_moderate = excluded.can_moderate, note = excluded.note,
    expires_at = excluded.expires_at, created_by_user_id = auth.uid();
  select * into v_access from public.live_studio_access where user_id = p_user_id;
  return jsonb_build_object(
    'userId', v_access.user_id, 'allowed', v_access.allowed,
    'operatorRole', v_access.operator_role, 'canView', v_access.can_view,
    'canControl', v_access.can_control, 'canPublish', v_access.can_publish,
    'canScreenShare', v_access.can_screen_share,
    'canUseExternalAudio', v_access.can_use_external_audio,
    'canModerate', v_access.can_moderate, 'expiresAt', v_access.expires_at
  );
end;
$$;

-- Preserve the v1 admin contract while assigning a coherent operator role.
create or replace function public.rpc_admin_set_live_studio_access_v1(
  p_user_id uuid,
  p_allowed boolean,
  p_capabilities jsonb default '{}'::jsonb,
  p_note text default null,
  p_expires_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare v_role text;
begin
  v_role := case
    when coalesce((p_capabilities ->> 'moderate')::boolean, false)
      and (coalesce((p_capabilities ->> 'control')::boolean, false)
        or coalesce((p_capabilities ->> 'publish')::boolean, false)) then 'supervisor'
    when coalesce((p_capabilities ->> 'moderate')::boolean, false) then 'moderator'
    when coalesce((p_capabilities ->> 'control')::boolean, false)
      or coalesce((p_capabilities ->> 'publish')::boolean, false)
      or coalesce((p_capabilities ->> 'screenShare')::boolean, false)
      or coalesce((p_capabilities ->> 'externalAudio')::boolean, false) then 'producer'
    else 'viewer'
  end;
  return public.rpc_admin_set_live_studio_access_v2(
    p_user_id, p_allowed, v_role, p_capabilities, p_note, p_expires_at
  );
end;
$$;

create or replace function public.rpc_get_live_studio_operator_console_v1(
  p_session_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_role text;
  v_now timestamptz := timezone('utc', now());
begin
  if auth.uid() is null
    or not public.live_studio_is_authorized_v1(p_session_id, auth.uid(), 'view') then
    raise exception 'live_studio_console_forbidden' using errcode = '42501';
  end if;
  v_role := public.live_studio_operator_role_v1(p_session_id, auth.uid());
  return jsonb_build_object(
    'schemaVersion', 1,
    'serverNow', v_now,
    'operatorRole', v_role,
    'aal2', public.live_studio_has_aal2_v1(),
    'cues', coalesce((select jsonb_agg(jsonb_build_object(
      'id', cue.id, 'position', cue.position, 'title', cue.title,
      'notes', cue.notes, 'cueType', cue.cue_type, 'status', cue.status,
      'expectedAt', cue.expected_at
    ) order by cue.position) from public.live_studio_run_cues cue
      where cue.session_id = p_session_id), '[]'::jsonb),
    'messages', coalesce((select jsonb_agg(message_row.payload order by message_row.created_at)
      from (select message.created_at, jsonb_build_object(
        'id', message.id, 'senderUserId', message.sender_user_id,
        'audience', message.audience, 'body', message.body,
        'createdAt', message.created_at
      ) payload from public.live_studio_private_messages message
      where message.session_id = p_session_id
        and (message.audience = 'all'
          or (message.audience = 'producers' and v_role in ('producer','supervisor'))
          or (message.audience = 'moderators' and v_role in ('moderator','supervisor')))
      order by message.created_at desc limit 50) message_row), '[]'::jsonb),
    'operators', coalesce((select jsonb_agg(jsonb_build_object(
      'userId', presence.user_id, 'controllerInstanceId', presence.controller_instance_id,
      'operatorRole', presence.operator_role, 'readiness', presence.readiness,
      'lastSeenAt', presence.last_seen_at
    ) order by presence.last_seen_at desc) from public.live_studio_operator_presence presence
      where presence.session_id = p_session_id
        and presence.last_seen_at >= v_now - interval '45 seconds'), '[]'::jsonb),
    'alerts', coalesce((select jsonb_agg(event_row.payload order by event_row.created_at desc)
      from (select event.created_at, jsonb_build_object(
        'id', event.id, 'eventType', event.event_type, 'severity', event.severity,
        'details', event.details, 'requiresAcknowledgement', event.requires_acknowledgement,
        'acknowledgedAt', event.acknowledged_at, 'createdAt', event.created_at
      ) payload from public.live_studio_operational_events event
      where event.session_id = p_session_id
        and (event.severity <> 'info' or event.created_at >= v_now - interval '15 minutes')
      order by event.created_at desc limit 50) event_row), '[]'::jsonb)
  );
end;
$$;

create or replace function public.rpc_studio_operator_heartbeat_v1(
  p_session_id uuid,
  p_controller_instance_id uuid,
  p_readiness text default 'standby'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare v_role text;
begin
  if auth.uid() is null or p_controller_instance_id is null
    or p_readiness not in ('standby','ready','primary','offline')
    or not public.live_studio_is_authorized_v1(p_session_id, auth.uid(), 'view') then
    raise exception 'live_studio_presence_forbidden' using errcode = '42501';
  end if;
  v_role := public.live_studio_operator_role_v1(p_session_id, auth.uid());
  insert into public.live_studio_operator_presence(
    session_id, user_id, controller_instance_id, operator_role, readiness, last_seen_at
  ) values (p_session_id, auth.uid(), p_controller_instance_id, v_role, p_readiness, timezone('utc', now()))
  on conflict (session_id, user_id, controller_instance_id) do update set
    operator_role = excluded.operator_role,
    readiness = excluded.readiness,
    last_seen_at = excluded.last_seen_at;
  return jsonb_build_object('ok', true, 'operatorRole', v_role);
end;
$$;

create or replace function public.rpc_studio_upsert_run_cue_v1(
  p_session_id uuid, p_cue_id uuid, p_position integer, p_title text,
  p_notes text default null, p_cue_type text default 'note',
  p_status text default 'pending', p_expected_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare v_id uuid := coalesce(p_cue_id, gen_random_uuid());
begin
  if auth.uid() is null
    or not public.live_studio_is_authorized_v1(p_session_id, auth.uid(), 'control') then
    raise exception 'live_studio_cue_forbidden' using errcode = '42501';
  end if;
  insert into public.live_studio_run_cues(
    id, session_id, position, title, notes, cue_type, status, expected_at, created_by_user_id
  ) values (
    v_id, p_session_id, p_position, btrim(p_title), nullif(btrim(p_notes), ''),
    p_cue_type, p_status, p_expected_at, auth.uid()
  ) on conflict (id) do update set
    position = excluded.position, title = excluded.title, notes = excluded.notes,
    cue_type = excluded.cue_type, status = excluded.status, expected_at = excluded.expected_at
  where public.live_studio_run_cues.session_id = p_session_id;
  return v_id;
end;
$$;

create or replace function public.rpc_studio_post_private_message_v1(
  p_session_id uuid, p_audience text, p_body text
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare v_id bigint; v_role text;
begin
  if auth.uid() is null
    or not public.live_studio_is_authorized_v1(p_session_id, auth.uid(), 'view') then
    raise exception 'live_studio_message_forbidden' using errcode = '42501';
  end if;
  v_role := public.live_studio_operator_role_v1(p_session_id, auth.uid());
  if p_audience not in ('all','producers','moderators')
    or (p_audience = 'producers' and v_role not in ('producer','supervisor'))
    or (p_audience = 'moderators' and v_role not in ('moderator','supervisor')) then
    raise exception 'live_studio_message_audience_forbidden' using errcode = '42501';
  end if;
  insert into public.live_studio_private_messages(session_id, sender_user_id, audience, body)
  values (p_session_id, auth.uid(), p_audience, btrim(p_body)) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.rpc_studio_record_operational_event_v1(
  p_session_id uuid, p_event_type text, p_severity text default 'info',
  p_details jsonb default '{}'::jsonb, p_requires_acknowledgement boolean default false
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare v_id bigint;
begin
  if auth.uid() is null
    or not public.live_studio_is_authorized_v1(p_session_id, auth.uid(), 'view') then
    raise exception 'live_studio_event_forbidden' using errcode = '42501';
  end if;
  insert into public.live_studio_operational_events(
    session_id, actor_user_id, event_type, severity, details, requires_acknowledgement
  ) values (
    p_session_id, auth.uid(), p_event_type, p_severity, coalesce(p_details, '{}'::jsonb),
    p_requires_acknowledgement
  ) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.rpc_studio_acknowledge_alert_v1(
  p_session_id uuid, p_event_id bigint
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
begin
  if auth.uid() is null
    or not public.live_studio_is_authorized_v1(p_session_id, auth.uid(), 'moderate') then
    raise exception 'live_studio_alert_forbidden' using errcode = '42501';
  end if;
  update public.live_studio_operational_events set
    acknowledged_at = timezone('utc', now()), acknowledged_by_user_id = auth.uid()
  where id = p_event_id and session_id = p_session_id and acknowledged_at is null;
  return found;
end;
$$;

create or replace function public.rpc_studio_emergency_safe_scene_v1(
  p_session_id uuid, p_reason text default 'operator_emergency'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare v_show public.live_odo_show_sessions; v_command_id uuid := gen_random_uuid();
begin
  if auth.uid() is null or not (
    public.live_studio_is_authorized_v1(p_session_id, auth.uid(), 'control')
    or public.live_studio_is_authorized_v1(p_session_id, auth.uid(), 'moderate')
  ) then raise exception 'live_studio_safe_scene_forbidden' using errcode = '42501'; end if;
  if p_reason is null or char_length(btrim(p_reason)) not between 3 and 120 then
    raise exception 'live_studio_safe_scene_invalid' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('live_program:' || p_session_id::text, 0));
  select * into v_show from public.live_odo_show_sessions where session_id = p_session_id for update;
  if v_show.session_id is null then raise exception 'live_studio_program_not_found' using errcode = 'P0002'; end if;
  update public.live_odo_show_sessions set
    previous_program_state = jsonb_build_object(
      'scene', current_scene, 'targetCanvas', target_canvas,
      'sourceAssignments', source_assignments, 'transition', program_transition,
      'programVersion', program_version
    ),
    current_scene = 'branded_intermission', source_assignments = '{}'::jsonb,
    program_transition = 'cut', control_source = 'studio_host',
    scene_entered_at = timezone('utc', now()), last_reason_code = p_reason,
    last_program_command_id = v_command_id, program_version = program_version + 1,
    version = version + 1
  where session_id = p_session_id returning * into v_show;
  insert into public.live_studio_operational_events(
    session_id, actor_user_id, event_type, severity, details, requires_acknowledgement
  ) values (
    p_session_id, auth.uid(), 'emergency_safe_scene', 'critical',
    jsonb_build_object('reason', p_reason, 'programVersion', v_show.program_version), true
  );
  return public.live_program_command_result_v1(true, 'emergency_safe_scene', p_session_id);
end;
$$;

create or replace function public.rpc_studio_take_live_program_v2(
  p_session_id uuid, p_controller_instance_id uuid,
  p_expected_controller_generation bigint, p_expected_program_version bigint,
  p_command_id uuid, p_scene text, p_target_canvas text,
  p_source_assignments jsonb, p_transition text default 'auto'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
begin
  if not public.live_studio_has_aal2_v1() then
    raise exception 'live_studio_step_up_required' using errcode = '42501';
  end if;
  return public.rpc_studio_take_live_program_v1(
    p_session_id, p_controller_instance_id, p_expected_controller_generation,
    p_expected_program_version, p_command_id, p_scene, p_target_canvas,
    p_source_assignments, p_transition
  );
end;
$$;

create or replace function public.rpc_get_live_studio_media_admission_v2(
  p_session_id uuid, p_controller_instance_id uuid, p_source_kind text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
begin
  if not public.live_studio_has_aal2_v1() then
    raise exception 'live_studio_step_up_required' using errcode = '42501';
  end if;
  return public.rpc_get_live_studio_media_admission_v1(
    p_session_id, p_controller_instance_id, p_source_kind
  );
end;
$$;

create or replace function public.rpc_studio_start_live_session_v1(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare v_session public.live_sessions; v_guard integer := 0;
begin
  if auth.uid() is null or not public.live_studio_has_aal2_v1()
    or not public.live_studio_is_authorized_v1(p_session_id, auth.uid(), 'publish') then
    raise exception 'live_studio_step_up_required' using errcode = '42501';
  end if;
  loop
    select * into v_session from public.live_sessions where id = p_session_id;
    if v_session.id is null then raise exception 'live_session_not_found' using errcode = 'P0002'; end if;
    exit when v_session.status in ('live','ending');
    v_guard := v_guard + 1;
    if v_guard > 5 then raise exception 'live_session_start_unavailable:%', v_session.status; end if;
    select * into v_session from public.rpc_transition_live_session(
      p_session_id, v_session.version,
      case v_session.status
        when 'scheduled' then 'confirmed'
        when 'waiting_for_quorum' then 'confirmed'
        when 'confirmed' then 'backstage'
        when 'backstage' then 'live'
        else v_session.status
      end
    );
  end loop;
  insert into public.live_studio_operational_events(
    session_id, actor_user_id, event_type, severity, details
  ) values (p_session_id, auth.uid(), 'session_published', 'info', '{}'::jsonb);
  return public.rpc_get_live_studio_snapshot_v1(p_session_id);
end;
$$;

create or replace function public.rpc_studio_end_live_session_v1(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare v_result jsonb;
begin
  if auth.uid() is null or not public.live_studio_has_aal2_v1()
    or not public.live_studio_is_authorized_v1(p_session_id, auth.uid(), 'publish') then
    raise exception 'live_studio_step_up_required' using errcode = '42501';
  end if;
  v_result := public.rpc_end_live_session_v1(p_session_id);
  insert into public.live_studio_operational_events(
    session_id, actor_user_id, event_type, severity, details
  ) values (p_session_id, auth.uid(), 'session_ended', 'warning', '{}'::jsonb);
  return v_result;
end;
$$;

revoke all on function public.rpc_get_live_studio_operator_console_v1(uuid),
  public.rpc_admin_set_live_studio_access_v2(uuid, boolean, text, jsonb, text, timestamptz),
  public.rpc_studio_operator_heartbeat_v1(uuid, uuid, text),
  public.rpc_studio_upsert_run_cue_v1(uuid, uuid, integer, text, text, text, text, timestamptz),
  public.rpc_studio_post_private_message_v1(uuid, text, text),
  public.rpc_studio_record_operational_event_v1(uuid, text, text, jsonb, boolean),
  public.rpc_studio_acknowledge_alert_v1(uuid, bigint),
  public.rpc_studio_emergency_safe_scene_v1(uuid, text),
  public.rpc_studio_take_live_program_v2(uuid, uuid, bigint, bigint, uuid, text, text, jsonb, text),
  public.rpc_get_live_studio_media_admission_v2(uuid, uuid, text),
  public.rpc_studio_start_live_session_v1(uuid),
  public.rpc_studio_end_live_session_v1(uuid)
from public, anon;

grant execute on function public.rpc_get_live_studio_operator_console_v1(uuid),
  public.rpc_admin_set_live_studio_access_v2(uuid, boolean, text, jsonb, text, timestamptz),
  public.rpc_studio_operator_heartbeat_v1(uuid, uuid, text),
  public.rpc_studio_upsert_run_cue_v1(uuid, uuid, integer, text, text, text, text, timestamptz),
  public.rpc_studio_post_private_message_v1(uuid, text, text),
  public.rpc_studio_record_operational_event_v1(uuid, text, text, jsonb, boolean),
  public.rpc_studio_acknowledge_alert_v1(uuid, bigint),
  public.rpc_studio_emergency_safe_scene_v1(uuid, text),
  public.rpc_studio_take_live_program_v2(uuid, uuid, bigint, bigint, uuid, text, text, jsonb, text),
  public.rpc_get_live_studio_media_admission_v2(uuid, uuid, text),
  public.rpc_studio_start_live_session_v1(uuid),
  public.rpc_studio_end_live_session_v1(uuid)
to authenticated, service_role;

-- Close direct authenticated bypasses. The v2 wrappers call these as owner.
revoke execute on function public.rpc_studio_take_live_program_v1(
  uuid, uuid, bigint, bigint, uuid, text, text, jsonb, text
) from authenticated;
revoke execute on function public.rpc_get_live_studio_media_admission_v1(uuid, uuid, text)
from authenticated;

commit;
