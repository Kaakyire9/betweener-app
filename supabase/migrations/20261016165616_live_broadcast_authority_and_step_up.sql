-- Betweener Live publication authority and step-up hardening.
-- Publication is an explicit, idempotent server command. A scheduled time
-- never publishes a room and a Studio grant no longer changes mobile policy.

begin;

alter table public.live_sessions
  add column if not exists broadcast_authority text not null default 'mobile_host',
  add column if not exists broadcast_authority_set_at timestamptz,
  add column if not exists broadcast_authority_set_by_user_id uuid
    references auth.users(id) on delete set null;

alter table public.live_sessions
  drop constraint if exists live_sessions_broadcast_authority_valid,
  add constraint live_sessions_broadcast_authority_valid check (
    broadcast_authority in ('mobile_host', 'studio_producer')
  );

-- Preserve the active Phase B canary/operator expectation without applying an
-- account-wide Studio policy to every future Live created by that user.
update public.live_sessions session
set
  broadcast_authority = 'studio_producer',
  broadcast_authority_set_at = timezone('utc', now())
where session.status = 'backstage'
  and exists (
    select 1
    from public.live_studio_access access
    where access.user_id = session.created_by_user_id
      and access.allowed
      and access.can_publish
      and (access.expires_at is null or access.expires_at > timezone('utc', now()))
  );

create table public.live_publication_commands (
  session_id uuid not null references public.live_sessions(id) on delete cascade,
  command_id uuid not null,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  command_type text not null check (
    command_type in ('open_backstage', 'start_live', 'end_live', 'set_authority')
  ),
  result_status text not null,
  result_version bigint not null,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (session_id, command_id)
);

alter table public.live_publication_commands enable row level security;
alter table public.live_publication_commands force row level security;
revoke all on table public.live_publication_commands
from public, anon, authenticated, service_role;
grant all on table public.live_publication_commands to service_role;

create or replace function public.live_publication_control_snapshot_v1(
  p_session_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_session public.live_sessions;
  v_is_studio_publisher boolean := false;
  v_has_start_capability boolean := false;
  v_aal text := coalesce(auth.jwt() ->> 'aal', 'aal1');
begin
  select * into v_session
  from public.live_sessions session
  where session.id = p_session_id;

  if v_session.id is null then
    raise exception 'live_session_not_found' using errcode = 'P0002';
  end if;
  if p_user_id is null or (
    not public.can_view_live_session(p_session_id, p_user_id)
    and not public.live_studio_is_authorized_v1(p_session_id, p_user_id, 'view')
  ) then
    raise exception 'live_session_forbidden' using errcode = '42501';
  end if;

  v_has_start_capability := public.has_live_capability(
    p_session_id,
    'live.start_session',
    p_user_id
  );
  v_is_studio_publisher := public.live_studio_is_authorized_v1(
    p_session_id,
    p_user_id,
    'publish'
  );

  return jsonb_build_object(
    'schemaVersion', 1,
    'serverNow', timezone('utc', now()),
    'sessionId', v_session.id,
    'status', v_session.status,
    'version', v_session.version,
    'scheduledStart', v_session.scheduled_start,
    'startWindowClosesAt', case
      when v_session.scheduled_start is null then null
      else v_session.scheduled_start + interval '30 minutes'
    end,
    'broadcastAuthority', v_session.broadcast_authority,
    'currentAal', v_aal,
    'canOpenBackstage', (
      v_has_start_capability
      or (v_session.broadcast_authority = 'studio_producer' and v_is_studio_publisher)
    ),
    'canStart', case
      when v_session.broadcast_authority = 'studio_producer' then v_is_studio_publisher
      else v_has_start_capability
    end,
    'canSetAuthority', (
      v_is_studio_publisher
      or v_session.created_by_user_id = p_user_id
      or public.is_admin_user(p_user_id)
    ),
    'requiresStepUp', v_aal <> 'aal2' and case
      when v_session.broadcast_authority = 'studio_producer' then v_is_studio_publisher
      else v_has_start_capability
    end,
    'controlSurface', case
      when v_session.broadcast_authority = 'studio_producer' then 'studio'
      else 'mobile'
    end
  );
end;
$$;

create or replace function public.rpc_get_live_publication_control_v1(
  p_session_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
  select public.live_publication_control_snapshot_v1(p_session_id, auth.uid());
$$;

create or replace function public.live_record_publication_command_v1(
  p_session_id uuid,
  p_command_id uuid,
  p_command_type text,
  p_result_status text,
  p_result_version bigint
)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
begin
  insert into public.live_publication_commands(
    session_id,
    command_id,
    actor_user_id,
    command_type,
    result_status,
    result_version
  ) values (
    p_session_id,
    p_command_id,
    auth.uid(),
    p_command_type,
    p_result_status,
    p_result_version
  )
  on conflict (session_id, command_id) do nothing;
end;
$$;

create or replace function public.live_assert_publication_command_v1(
  p_session_id uuid,
  p_command_id uuid,
  p_command_type text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_existing public.live_publication_commands;
begin
  select * into v_existing
  from public.live_publication_commands command
  where command.session_id = p_session_id
    and command.command_id = p_command_id;

  if v_existing.session_id is null then
    return false;
  end if;
  if v_existing.actor_user_id <> auth.uid()
     or v_existing.command_type <> p_command_type then
    raise exception 'live_publication_command_conflict' using errcode = '23505';
  end if;
  return true;
end;
$$;

create or replace function public.rpc_open_live_backstage_v1(
  p_session_id uuid,
  p_expected_version bigint,
  p_command_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_session public.live_sessions;
begin
  if auth.uid() is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if public.live_assert_publication_command_v1(
    p_session_id,
    p_command_id,
    'open_backstage'
  ) then
    return public.live_publication_control_snapshot_v1(p_session_id, auth.uid());
  end if;

  perform pg_advisory_xact_lock(hashtextextended('live-publication:' || p_session_id::text, 0));
  select * into v_session
  from public.live_sessions session
  where session.id = p_session_id
  for update;

  if v_session.id is null then
    raise exception 'live_session_not_found' using errcode = 'P0002';
  end if;
  if not public.has_live_capability(p_session_id, 'live.start_session')
     and not (
       v_session.broadcast_authority = 'studio_producer'
       and public.live_studio_is_authorized_v1(p_session_id, auth.uid(), 'publish')
     ) then
    raise exception 'live_backstage_forbidden' using errcode = '42501';
  end if;
  if v_session.status in ('backstage', 'live', 'ending') then
    perform public.live_record_publication_command_v1(
      p_session_id, p_command_id, 'open_backstage', v_session.status, v_session.version
    );
    return public.live_publication_control_snapshot_v1(p_session_id, auth.uid());
  end if;
  if v_session.version <> p_expected_version then
    raise exception 'live_session_version_conflict' using errcode = '40001';
  end if;
  if v_session.status not in ('scheduled', 'waiting_for_quorum', 'confirmed') then
    raise exception 'live_backstage_unavailable:%', v_session.status using errcode = '23514';
  end if;

  if v_session.status in ('scheduled', 'waiting_for_quorum') then
    select * into v_session
    from public.rpc_transition_live_session(v_session.id, v_session.version, 'confirmed');
  end if;
  if v_session.status = 'confirmed' then
    select * into v_session
    from public.rpc_transition_live_session(v_session.id, v_session.version, 'backstage');
  end if;

  perform public.live_record_publication_command_v1(
    p_session_id, p_command_id, 'open_backstage', v_session.status, v_session.version
  );
  return public.live_publication_control_snapshot_v1(p_session_id, auth.uid());
end;
$$;

create or replace function public.rpc_start_live_session_v2(
  p_session_id uuid,
  p_expected_version bigint,
  p_command_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_session public.live_sessions;
  v_authorized boolean := false;
begin
  if auth.uid() is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if public.live_assert_publication_command_v1(
    p_session_id,
    p_command_id,
    'start_live'
  ) then
    return public.live_publication_control_snapshot_v1(p_session_id, auth.uid());
  end if;

  perform pg_advisory_xact_lock(hashtextextended('live-publication:' || p_session_id::text, 0));
  select * into v_session
  from public.live_sessions session
  where session.id = p_session_id
  for update;

  if v_session.id is null then
    raise exception 'live_session_not_found' using errcode = 'P0002';
  end if;
  if v_session.status in ('live', 'ending') then
    perform public.live_record_publication_command_v1(
      p_session_id, p_command_id, 'start_live', v_session.status, v_session.version
    );
    return public.live_publication_control_snapshot_v1(p_session_id, auth.uid());
  end if;
  if v_session.version <> p_expected_version then
    raise exception 'live_session_version_conflict' using errcode = '40001';
  end if;
  if v_session.status <> 'backstage' then
    raise exception 'live_backstage_required' using errcode = '55000';
  end if;
  if v_session.scheduled_start is not null
     and timezone('utc', now()) < v_session.scheduled_start then
    raise exception 'live_session_not_due' using errcode = '22023';
  end if;
  if v_session.scheduled_start is not null
     and timezone('utc', now()) > v_session.scheduled_start + interval '30 minutes' then
    raise exception 'live_start_window_expired' using errcode = '55000';
  end if;

  v_authorized := case
    when v_session.broadcast_authority = 'studio_producer' then
      public.live_studio_is_authorized_v1(p_session_id, auth.uid(), 'publish')
    else public.has_live_capability(p_session_id, 'live.start_session')
  end;

  if not v_authorized then
    if v_session.broadcast_authority = 'studio_producer' then
      raise exception 'live_studio_controls_publication' using errcode = '42501';
    end if;
    raise exception 'live_session_transition_forbidden' using errcode = '42501';
  end if;
  if not public.live_studio_has_aal2_v1() then
    raise exception 'live_step_up_required' using errcode = '42501';
  end if;

  select * into v_session
  from public.rpc_transition_live_session(v_session.id, v_session.version, 'live');

  perform public.live_record_publication_command_v1(
    p_session_id, p_command_id, 'start_live', v_session.status, v_session.version
  );
  insert into public.live_studio_operational_events(
    session_id, actor_user_id, event_type, severity, details
  ) values (
    p_session_id,
    auth.uid(),
    'session_published',
    'info',
    jsonb_build_object('broadcastAuthority', v_session.broadcast_authority)
  );

  return public.live_publication_control_snapshot_v1(p_session_id, auth.uid());
end;
$$;

create or replace function public.rpc_end_live_session_v2(
  p_session_id uuid,
  p_expected_version bigint,
  p_command_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_session public.live_sessions;
  v_authorized boolean := false;
begin
  if auth.uid() is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if public.live_assert_publication_command_v1(
    p_session_id,
    p_command_id,
    'end_live'
  ) then
    return public.live_publication_control_snapshot_v1(p_session_id, auth.uid());
  end if;

  perform pg_advisory_xact_lock(hashtextextended('live-publication:' || p_session_id::text, 0));
  select * into v_session
  from public.live_sessions session
  where session.id = p_session_id
  for update;

  if v_session.id is null then
    raise exception 'live_session_not_found' using errcode = 'P0002';
  end if;
  if v_session.status = 'ended' then
    perform public.live_record_publication_command_v1(
      p_session_id, p_command_id, 'end_live', v_session.status, v_session.version
    );
    return public.live_publication_control_snapshot_v1(p_session_id, auth.uid());
  end if;
  if v_session.version <> p_expected_version then
    raise exception 'live_session_version_conflict' using errcode = '40001';
  end if;

  v_authorized := case
    when v_session.broadcast_authority = 'studio_producer' then
      public.live_studio_is_authorized_v1(p_session_id, auth.uid(), 'publish')
    else public.has_live_capability(p_session_id, 'live.end_session')
  end;
  if not v_authorized then
    if v_session.broadcast_authority = 'studio_producer' then
      raise exception 'live_studio_controls_publication' using errcode = '42501';
    end if;
    raise exception 'live_session_transition_forbidden' using errcode = '42501';
  end if;
  if not public.live_studio_has_aal2_v1() then
    raise exception 'live_step_up_required' using errcode = '42501';
  end if;

  perform public.rpc_end_live_session_v1(p_session_id);
  select * into v_session from public.live_sessions where id = p_session_id;
  perform public.live_record_publication_command_v1(
    p_session_id, p_command_id, 'end_live', v_session.status, v_session.version
  );
  insert into public.live_studio_operational_events(
    session_id, actor_user_id, event_type, severity, details
  ) values (
    p_session_id,
    auth.uid(),
    'session_ended',
    'warning',
    jsonb_build_object('broadcastAuthority', v_session.broadcast_authority)
  );
  return public.live_publication_control_snapshot_v1(p_session_id, auth.uid());
end;
$$;

create or replace function public.rpc_set_live_broadcast_authority_v1(
  p_session_id uuid,
  p_expected_version bigint,
  p_broadcast_authority text,
  p_command_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_session public.live_sessions;
begin
  if auth.uid() is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_broadcast_authority not in ('mobile_host', 'studio_producer') then
    raise exception 'live_broadcast_authority_invalid' using errcode = '22023';
  end if;
  if public.live_assert_publication_command_v1(
    p_session_id,
    p_command_id,
    'set_authority'
  ) then
    return public.live_publication_control_snapshot_v1(p_session_id, auth.uid());
  end if;

  perform pg_advisory_xact_lock(hashtextextended('live-publication:' || p_session_id::text, 0));
  select * into v_session
  from public.live_sessions session
  where session.id = p_session_id
  for update;

  if v_session.id is null then
    raise exception 'live_session_not_found' using errcode = 'P0002';
  end if;
  if v_session.version <> p_expected_version then
    raise exception 'live_session_version_conflict' using errcode = '40001';
  end if;
  if v_session.status not in ('draft', 'scheduled', 'waiting_for_quorum', 'confirmed', 'backstage') then
    raise exception 'live_broadcast_authority_locked' using errcode = '55000';
  end if;
  if not public.live_studio_has_aal2_v1() then
    raise exception 'live_step_up_required' using errcode = '42501';
  end if;
  if p_broadcast_authority = 'studio_producer' then
    if not public.live_studio_is_authorized_v1(p_session_id, auth.uid(), 'publish') then
      raise exception 'live_studio_publish_access_required' using errcode = '42501';
    end if;
  elsif v_session.created_by_user_id <> auth.uid()
        and not public.is_admin_user(auth.uid()) then
    raise exception 'live_broadcast_authority_forbidden' using errcode = '42501';
  end if;

  update public.live_sessions
  set
    broadcast_authority = p_broadcast_authority,
    broadcast_authority_set_at = timezone('utc', now()),
    broadcast_authority_set_by_user_id = auth.uid(),
    version = version + 1
  where id = p_session_id
  returning * into v_session;

  perform public.live_record_publication_command_v1(
    p_session_id, p_command_id, 'set_authority', v_session.status, v_session.version
  );
  insert into public.live_studio_operational_events(
    session_id, actor_user_id, event_type, severity, details
  ) values (
    p_session_id,
    auth.uid(),
    'broadcast_authority_changed',
    'warning',
    jsonb_build_object('broadcastAuthority', p_broadcast_authority)
  );
  return public.live_publication_control_snapshot_v1(p_session_id, auth.uid());
end;
$$;

-- The trigger remains a defence-in-depth guard, but no longer keys policy off
-- an actor-global Studio grant. Both publication surfaces require AAL2.
create or replace function public.live_studio_enforce_step_up_transition_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
begin
  if new.status is distinct from old.status
     and new.status in ('live', 'ended')
     and auth.uid() is not null
     and not public.live_studio_has_aal2_v1() then
    raise exception 'live_step_up_required' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- Compatibility wrappers keep already-deployed Studio builds functional while
-- new builds use the command-id/version API directly.
create or replace function public.rpc_studio_start_live_session_v1(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_session public.live_sessions;
begin
  select * into v_session from public.live_sessions where id = p_session_id;
  if v_session.id is null then
    raise exception 'live_session_not_found' using errcode = 'P0002';
  end if;
  if v_session.status in ('scheduled', 'waiting_for_quorum', 'confirmed') then
    perform public.rpc_open_live_backstage_v1(
      p_session_id,
      v_session.version,
      gen_random_uuid()
    );
    select * into v_session from public.live_sessions where id = p_session_id;
  end if;
  perform public.rpc_start_live_session_v2(
    p_session_id,
    v_session.version,
    gen_random_uuid()
  );
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
declare
  v_session public.live_sessions;
begin
  select * into v_session from public.live_sessions where id = p_session_id;
  if v_session.id is null then
    raise exception 'live_session_not_found' using errcode = 'P0002';
  end if;
  perform public.rpc_end_live_session_v2(
    p_session_id,
    v_session.version,
    gen_random_uuid()
  );
  return public.rpc_get_live_studio_snapshot_v1(p_session_id);
end;
$$;

-- Live reminders are recipient-scoped. Hosts receive operational prompts;
-- attendees receive only events for which they saved a place.
alter table public.live_notification_campaigns
  drop constraint if exists live_notification_campaign_kind_valid,
  add constraint live_notification_campaign_kind_valid check (kind in (
    'starting_soon',
    'host_backstage_available',
    'host_starts_soon',
    'host_due',
    'host_guests_waiting',
    'attendee_starting_soon',
    'attendee_delayed',
    'live_now',
    'missed'
  ));

alter table public.live_in_app_announcements
  drop constraint if exists live_in_app_announcements_kind_check,
  add constraint live_in_app_announcements_kind_check check (kind in (
    'starting_soon',
    'host_backstage_available',
    'host_starts_soon',
    'host_due',
    'host_guests_waiting',
    'attendee_starting_soon',
    'attendee_delayed',
    'live_now',
    'missed'
  ));

create table public.live_notification_campaign_recipients (
  campaign_id uuid not null references public.live_notification_campaigns(id) on delete cascade,
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  recipient_role text not null check (recipient_role in ('host', 'attendee')),
  created_at timestamptz not null default timezone('utc', now()),
  primary key (campaign_id, recipient_user_id)
);

create index live_notification_campaign_recipients_user_idx
  on public.live_notification_campaign_recipients(recipient_user_id, created_at desc);

alter table public.live_notification_campaign_recipients enable row level security;
alter table public.live_notification_campaign_recipients force row level security;
revoke all on table public.live_notification_campaign_recipients
from public, anon, authenticated;
grant select on table public.live_notification_campaign_recipients to authenticated;
grant all on table public.live_notification_campaign_recipients to service_role;
create policy live_notification_campaign_recipients_select_self
on public.live_notification_campaign_recipients for select to authenticated
using (recipient_user_id = auth.uid());

drop policy if exists live_in_app_announcements_select_authenticated
on public.live_in_app_announcements;
create policy live_in_app_announcements_select_recipient
on public.live_in_app_announcements for select to authenticated
using (exists (
  select 1
  from public.live_notification_campaign_recipients recipient
  where recipient.campaign_id = live_in_app_announcements.id
    and recipient.recipient_user_id = auth.uid()
));

create or replace function public.publish_live_in_app_announcement_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
begin
  if new.kind like 'host_%' then
    insert into public.live_notification_campaign_recipients(
      campaign_id, recipient_user_id, recipient_role
    )
    select new.id, session.created_by_user_id, 'host'
    from public.live_sessions session
    where session.id = new.session_id
    on conflict(campaign_id, recipient_user_id) do nothing;
  else
    insert into public.live_notification_campaign_recipients(
      campaign_id, recipient_user_id, recipient_role
    )
    select new.id, participant.user_id, 'attendee'
    from public.live_participants participant
    where participant.session_id = new.session_id
      and participant.rsvp_status in ('going', 'waitlisted')
      and participant.role not in ('host', 'internal_admin')
      and participant.user_id is not null
    on conflict(campaign_id, recipient_user_id) do nothing;
  end if;

  insert into public.live_in_app_announcements(id, session_id, kind, title, body)
  values(new.id, new.session_id, new.kind, new.title, new.body)
  on conflict(id) do nothing;
  return new;
end;
$$;

insert into public.live_notification_campaign_recipients(
  campaign_id, recipient_user_id, recipient_role
)
select campaign.id, session.created_by_user_id, 'host'
from public.live_notification_campaigns campaign
join public.live_sessions session on session.id = campaign.session_id
where campaign.kind like 'host_%'
on conflict(campaign_id, recipient_user_id) do nothing;

insert into public.live_notification_campaign_recipients(
  campaign_id, recipient_user_id, recipient_role
)
select campaign.id, participant.user_id, 'attendee'
from public.live_notification_campaigns campaign
join public.live_participants participant on participant.session_id = campaign.session_id
where campaign.kind not like 'host_%'
  and participant.rsvp_status in ('going', 'waitlisted')
  and participant.role not in ('host', 'internal_admin')
  and participant.user_id is not null
on conflict(campaign_id, recipient_user_id) do nothing;

create or replace function public.rpc_service_list_live_campaign_tokens_v1(
  p_campaign_id uuid,
  p_after_token_id uuid default null,
  p_limit integer default 500
)
returns table(
  id uuid,
  user_id uuid,
  token text,
  app_version text,
  app_environment text,
  application_id text,
  expo_project_id uuid,
  installation_id uuid,
  provenance_status text,
  quarantined_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role_required' using errcode = '42501';
  end if;
  return query
  select
    push.id,
    push.user_id,
    push.token,
    push.app_version,
    push.app_environment,
    push.application_id,
    push.expo_project_id,
    push.installation_id,
    push.provenance_status,
    push.quarantined_at
  from public.live_notification_campaign_recipients recipient
  join public.push_tokens push on push.user_id = recipient.recipient_user_id
  where recipient.campaign_id = p_campaign_id
    and (p_after_token_id is null or push.id > p_after_token_id)
  order by push.id
  limit least(greatest(coalesce(p_limit, 500), 1), 500);
end;
$$;

create or replace function public.rpc_service_claim_live_notification_campaign_v1(
  p_campaign_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_campaign public.live_notification_campaigns;
  v_session public.live_sessions;
  v_valid boolean := false;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role_required' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('live-notification:' || p_campaign_id::text, 0));
  select * into v_campaign from public.live_notification_campaigns
  where id = p_campaign_id for update;
  if v_campaign.id is null then
    raise exception 'live_notification_campaign_not_found' using errcode = 'P0002';
  end if;
  if v_campaign.status = 'completed'
     or v_campaign.next_attempt_at > v_now
     or (v_campaign.status = 'processing' and v_campaign.claimed_at > v_now - interval '10 minutes') then
    return null;
  end if;
  select * into v_session from public.live_sessions where id = v_campaign.session_id;
  v_valid := v_session.id is not null
    and coalesce(v_session.schedule_revision, 0) = v_campaign.schedule_revision
    and case v_campaign.kind
      when 'starting_soon' then v_session.status in ('scheduled','waiting_for_quorum','confirmed','backstage')
        and v_session.scheduled_start > v_now and v_session.scheduled_start <= v_now + interval '15 minutes'
      when 'attendee_starting_soon' then v_session.status in ('scheduled','waiting_for_quorum','confirmed','backstage')
        and v_session.scheduled_start > v_now and v_session.scheduled_start <= v_now + interval '15 minutes'
      when 'host_backstage_available' then v_session.status in ('scheduled','waiting_for_quorum','confirmed','backstage')
        and v_session.scheduled_start > v_now and v_session.scheduled_start <= v_now + interval '30 minutes'
      when 'host_starts_soon' then v_session.status in ('scheduled','waiting_for_quorum','confirmed','backstage')
        and v_session.scheduled_start > v_now and v_session.scheduled_start <= v_now + interval '5 minutes'
      when 'host_due' then v_session.status in ('scheduled','waiting_for_quorum','confirmed','backstage')
        and v_session.scheduled_start <= v_now and v_session.scheduled_start > v_now - interval '5 minutes'
      when 'host_guests_waiting' then v_session.status in ('scheduled','waiting_for_quorum','confirmed','backstage')
        and v_session.scheduled_start <= v_now - interval '5 minutes'
        and v_session.scheduled_start > v_now - interval '30 minutes'
      when 'attendee_delayed' then v_session.status in ('scheduled','waiting_for_quorum','confirmed','backstage')
        and v_session.scheduled_start <= v_now - interval '5 minutes'
        and v_session.scheduled_start > v_now - interval '30 minutes'
      when 'live_now' then v_session.status in ('live','ending')
      when 'missed' then v_session.status = 'cancelled' and v_session.cancellation_reason = 'host_no_show'
      else false
    end;
  if not v_valid then
    update public.live_notification_campaigns
    set status = 'completed', completed_at = v_now,
        failure_reason = 'superseded', updated_at = v_now
    where id = p_campaign_id;
    return null;
  end if;
  update public.live_notification_campaigns
  set status = 'processing', attempt_count = attempt_count + 1,
      claimed_at = v_now, failure_reason = null, updated_at = v_now
  where id = p_campaign_id returning * into v_campaign;
  return jsonb_build_object(
    'id', v_campaign.id,
    'sessionId', v_campaign.session_id,
    'kind', v_campaign.kind,
    'title', v_campaign.title,
    'body', v_campaign.body,
    'data', v_campaign.data,
    'attemptCount', v_campaign.attempt_count
  );
end;
$$;

alter table public.live_sessions
  drop constraint if exists live_sessions_cancellation_reason_valid,
  add constraint live_sessions_cancellation_reason_valid check (
    cancellation_reason is null or cancellation_reason in (
      'plans_changed', 'host_unavailable', 'not_enough_people',
      'safety', 'other', 'host_no_show'
    )
  );

create or replace function public.enqueue_live_notification_campaigns_v1()
returns integer
language plpgsql
security definer
set search_path = public, private, pg_catalog
set row_security = off
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_created integer := 0;
  v_count integer := 0;
  v_campaign record;
begin
  with missed as (
    update public.live_sessions session
    set status = 'cancelled',
        cancelled_at = coalesce(session.cancelled_at, v_now),
        cancellation_reason = 'host_no_show'
    where session.ownership_type = 'human'
      and session.status in ('scheduled','waiting_for_quorum','confirmed','backstage')
      and session.scheduled_start is not null
      and session.scheduled_start <= v_now - interval '30 minutes'
    returning session.id, session.created_by_user_id
  )
  insert into public.live_session_events(session_id, actor_user_id, event_type, to_state, metadata)
  select id, created_by_user_id, 'session_missed', 'cancelled',
    jsonb_build_object('reason', 'host_no_show')
  from missed;

  with affected_users as (
    update public.live_session_pool_offers offer
    set state = 'withdrawn',
        responded_at = coalesce(offer.responded_at, v_now)
    where offer.state = 'pending'
      and exists (
        select 1 from public.live_sessions session
        where session.cancellation_reason = 'host_no_show'
          and session.cancelled_at >= v_now - interval '2 minutes'
          and session.id in (offer.source_session_id, offer.destination_session_id)
      )
    returning offer.user_id
  )
  insert into public.live_pool_offer_updates(user_id, version, updated_at)
  select distinct affected.user_id, 1, v_now
  from affected_users affected
  on conflict(user_id) do update set
    version = public.live_pool_offer_updates.version + 1,
    updated_at = excluded.updated_at;

  update public.live_session_pools pool
  set state = 'cancelled', cancelled_at = coalesce(pool.cancelled_at, v_now)
  where pool.state in ('preview','offered','active')
    and exists (
      select 1
      from public.live_session_pool_members member
      join public.live_sessions session on session.id = member.session_id
      where member.pool_id = pool.id
        and session.cancellation_reason = 'host_no_show'
        and session.cancelled_at >= v_now - interval '2 minutes'
    );

  update public.gatherings gathering
  set status = 'cancelled', cancelled_at = coalesce(gathering.cancelled_at, v_now)
  where exists (
    select 1 from public.live_sessions session
    where session.id = gathering.live_session_id
      and session.cancellation_reason = 'host_no_show'
      and session.cancelled_at >= v_now - interval '2 minutes'
  );

  update public.circle_pulse_items pulse
  set status = 'archived'
  where pulse.status in ('draft','active')
    and exists (
      select 1
      from public.gatherings gathering
      join public.live_sessions session on session.id = gathering.live_session_id
      where gathering.id = pulse.gathering_id
        and session.cancellation_reason = 'host_no_show'
        and session.cancelled_at >= v_now - interval '2 minutes'
    );

  insert into public.live_notification_campaigns(
    session_id, kind, schedule_revision, title, body, data
  )
  select session.id, candidate.kind, coalesce(session.schedule_revision, 0),
    candidate.title, candidate.body, candidate.data
  from public.live_sessions session
  cross join lateral (
    values
      ('host_backstage_available', session.title || ' backstage is ready',
        'Run your camera, microphone and connection checks before showtime.',
        jsonb_build_object('type','live_starting_soon','session_id',session.id,'route','/live/backstage/' || session.id::text)),
      ('host_starts_soon', session.title || ' starts in 5 minutes',
        'Finish preflight and prepare to open the public stage.',
        jsonb_build_object('type','live_starting_soon','session_id',session.id,'route','/live/backstage/' || session.id::text)),
      ('host_due', 'Ready to open ' || session.title || '?',
        'Your scheduled start time is here. Open the public stage when you are ready.',
        jsonb_build_object('type','live_starting_soon','session_id',session.id,'route','/live/backstage/' || session.id::text)),
      ('host_guests_waiting', 'Guests are waiting for ' || session.title,
        'Start now, reschedule, or cancel so your guests know what to expect.',
        jsonb_build_object('type','live_starting_soon','session_id',session.id,'route','/live/backstage/' || session.id::text)),
      ('attendee_starting_soon', session.title || ' starts soon',
        'Your place is saved. The room opens in about 15 minutes.',
        jsonb_build_object('type','live_starting_soon','session_id',session.id,'route','/live/event/' || session.id::text)),
      ('attendee_delayed', session.title || ' is delayed',
        'The Host is still preparing. Your place remains saved.',
        jsonb_build_object('type','live_starting_soon','session_id',session.id,'route','/live/event/' || session.id::text))
  ) as candidate(kind, title, body, data)
  where session.ownership_type = 'human'
    and session.status in ('scheduled','waiting_for_quorum','confirmed','backstage')
    and session.scheduled_start is not null
    and (
      candidate.kind like 'host_%'
      or session.context_type in ('global','match_night','diaspora','special_event','invite_only')
    )
    and case candidate.kind
      when 'host_backstage_available' then session.scheduled_start > v_now
        and session.scheduled_start <= v_now + interval '30 minutes'
      when 'host_starts_soon' then session.scheduled_start > v_now
        and session.scheduled_start <= v_now + interval '5 minutes'
      when 'host_due' then session.scheduled_start <= v_now
        and session.scheduled_start > v_now - interval '5 minutes'
      when 'host_guests_waiting' then session.scheduled_start <= v_now - interval '5 minutes'
        and session.scheduled_start > v_now - interval '30 minutes'
        and exists (select 1 from public.live_participants participant
          where participant.session_id = session.id
            and participant.rsvp_status in ('going','waitlisted'))
      when 'attendee_starting_soon' then session.scheduled_start > v_now
        and session.scheduled_start <= v_now + interval '15 minutes'
      when 'attendee_delayed' then session.scheduled_start <= v_now - interval '5 minutes'
        and session.scheduled_start > v_now - interval '30 minutes'
      else false
    end
  on conflict(session_id, kind, schedule_revision) do nothing;
  get diagnostics v_created = row_count;

  insert into public.live_notification_campaigns(
    session_id, kind, schedule_revision, title, body, data
  )
  select session.id, 'live_now', coalesce(session.schedule_revision, 0),
    session.title || ' is Live', 'The room is open now. Step into Betweener Live.',
    jsonb_build_object('type','live_now','session_id',session.id,'route','/live/' || session.id::text)
  from public.live_sessions session
  where session.ownership_type = 'human'
    and session.context_type in ('global','match_night','diaspora','special_event','invite_only')
    and session.status in ('live','ending')
    and coalesce(session.started_at, session.scheduled_start) >= v_now - interval '12 hours'
  on conflict(session_id, kind, schedule_revision) do nothing;
  get diagnostics v_count = row_count;
  v_created := v_created + v_count;

  insert into public.live_notification_campaigns(
    session_id, kind, schedule_revision, title, body, data
  )
  select session.id, 'missed', coalesce(session.schedule_revision, 0),
    session.title || ' did not start',
    'The Host did not open the room. You can view the event for any update.',
    jsonb_build_object('type','live_starting_soon','session_id',session.id,'route','/live/event/' || session.id::text)
  from public.live_sessions session
  where session.status = 'cancelled'
    and session.context_type in ('global','match_night','diaspora','special_event','invite_only')
    and session.cancellation_reason = 'host_no_show'
    and session.cancelled_at >= v_now - interval '12 hours'
  on conflict(session_id, kind, schedule_revision) do nothing;
  get diagnostics v_count = row_count;
  v_created := v_created + v_count;

  update public.live_notification_campaigns campaign
  set status = 'completed', completed_at = v_now,
      failure_reason = 'no_recipients', updated_at = v_now
  where campaign.status in ('pending','failed')
    and not exists (select 1 from public.live_notification_campaign_recipients recipient
      where recipient.campaign_id = campaign.id);

  for v_campaign in
    select campaign.id
    from public.live_notification_campaigns campaign
    where campaign.status in ('pending','failed')
      and campaign.next_attempt_at <= v_now
      and campaign.attempt_count < 5
      and exists (select 1 from public.live_notification_campaign_recipients recipient
        where recipient.campaign_id = campaign.id)
    order by campaign.created_at
    limit 20
  loop
    perform private.send_push_webhook(jsonb_build_object('campaign_id', v_campaign.id));
  end loop;
  return v_created;
end;
$$;

revoke all on function public.live_publication_control_snapshot_v1(uuid, uuid),
  public.live_record_publication_command_v1(uuid, uuid, text, text, bigint),
  public.live_assert_publication_command_v1(uuid, uuid, text)
from public, anon, authenticated, service_role;

revoke all on function public.rpc_get_live_publication_control_v1(uuid),
  public.rpc_open_live_backstage_v1(uuid, bigint, uuid),
  public.rpc_start_live_session_v2(uuid, bigint, uuid),
  public.rpc_end_live_session_v2(uuid, bigint, uuid),
  public.rpc_set_live_broadcast_authority_v1(uuid, bigint, text, uuid)
from public, anon;

revoke all on function public.rpc_service_list_live_campaign_tokens_v1(uuid, uuid, integer)
from public, anon, authenticated;
grant execute on function public.rpc_service_list_live_campaign_tokens_v1(uuid, uuid, integer)
to service_role;

revoke all on function public.publish_live_in_app_announcement_v1()
from public, anon, authenticated, service_role;

grant execute on function public.rpc_get_live_publication_control_v1(uuid),
  public.rpc_open_live_backstage_v1(uuid, bigint, uuid),
  public.rpc_start_live_session_v2(uuid, bigint, uuid),
  public.rpc_end_live_session_v2(uuid, bigint, uuid),
  public.rpc_set_live_broadcast_authority_v1(uuid, bigint, text, uuid)
to authenticated, service_role;

-- Direct client lifecycle transitions are no longer a publication API.
revoke execute on function public.rpc_transition_live_session(uuid, bigint, text)
from authenticated;

comment on column public.live_sessions.broadcast_authority is
  'Single authoritative surface allowed to publish/end this Live.';
comment on table public.live_publication_commands is
  'Private idempotency ledger for high-impact Live lifecycle commands.';

commit;
