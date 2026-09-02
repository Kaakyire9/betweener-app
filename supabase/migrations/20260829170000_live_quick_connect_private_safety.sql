-- Betweener Live Phase 7 safety extension.
-- Hosts remain facilitators. Every private Quick Connect round creates a
-- private, user-scoped safety checkpoint before either member may rotate again.

begin;

update public.live_quick_connect_controls
set creator_mode = 'facilitator'
where creator_mode <> 'facilitator';

alter table public.live_quick_connect_controls
  drop constraint if exists live_quick_control_creator_mode_valid;
alter table public.live_quick_connect_controls
  add constraint live_quick_control_creator_mode_valid
  check (creator_mode = 'facilitator');

alter table public.live_quick_connect_participants
  drop constraint if exists live_quick_participant_state_valid;
alter table public.live_quick_connect_participants
  add constraint live_quick_participant_state_valid check (state in (
    'waiting', 'paired', 'disconnected', 'left', 'unavailable', 'safety_check'
  ));

create table public.live_quick_connect_safety_checks (
  id uuid primary key default gen_random_uuid(),
  pairing_id uuid not null references public.live_quick_connect_pairings(id) on delete cascade,
  session_id uuid not null references public.live_sessions(id) on delete cascade,
  reviewer_user_id uuid not null references auth.users(id) on delete cascade,
  reviewed_user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending',
  experience text,
  reason text,
  block_requested boolean not null default false,
  report_id uuid references public.live_reports(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz,
  constraint live_quick_safety_users_distinct check (reviewer_user_id <> reviewed_user_id),
  constraint live_quick_safety_status_valid check (status in ('pending', 'completed')),
  constraint live_quick_safety_experience_valid check (
    experience is null or experience in ('respectful', 'uncomfortable', 'safety_concern')
  ),
  constraint live_quick_safety_reason_valid check (
    reason is null or reason in (
      'requested_nudity', 'sexual_pressure', 'harassment_disrespect',
      'hate_threats', 'impersonation_deception', 'other'
    )
  ),
  constraint live_quick_safety_completion_valid check (
    (status = 'pending' and experience is null and completed_at is null)
    or
    (
      status = 'completed'
      and experience is not null
      and completed_at is not null
      and (
        (experience = 'safety_concern' and reason is not null)
        or (experience <> 'safety_concern' and reason is null)
      )
    )
  ),
  constraint live_quick_safety_pairing_reviewer_unique unique(pairing_id, reviewer_user_id)
);

create index live_quick_safety_pending_user_idx
on public.live_quick_connect_safety_checks(reviewer_user_id, session_id, created_at desc)
where status = 'pending';

create index live_quick_safety_report_idx
on public.live_quick_connect_safety_checks(report_id)
where report_id is not null;

alter table public.live_quick_connect_safety_checks enable row level security;
alter table public.live_quick_connect_safety_checks force row level security;
revoke all on public.live_quick_connect_safety_checks from public, anon, authenticated;
grant all on public.live_quick_connect_safety_checks to service_role;

create or replace function public.live_quick_connect_open_safety_checks()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
begin
  if new.state not in ('completed', 'round_incomplete', 'cancelled')
     or old.state not in ('active', 'reconnect_grace') then
    return new;
  end if;

  insert into public.live_quick_connect_safety_checks(
    pairing_id, session_id, reviewer_user_id, reviewed_user_id
  ) values
    (new.id, new.session_id, new.participant_a_user_id, new.participant_b_user_id),
    (new.id, new.session_id, new.participant_b_user_id, new.participant_a_user_id)
  on conflict(pairing_id, reviewer_user_id) do nothing;

  -- Keep both people out of another rotation until their own private check is
  -- complete. The pairing reference is deliberately retained for recovery.
  update public.live_quick_connect_participants participant
  set state = 'safety_check',
      reconnect_deadline = null,
      last_seen_at = timezone('utc', now())
  where participant.session_id = new.session_id
    and participant.current_pairing_id = new.id
    and participant.user_id in (new.participant_a_user_id, new.participant_b_user_id);

  return new;
end;
$$;

revoke all on function public.live_quick_connect_open_safety_checks()
from public, anon, authenticated;

create trigger live_quick_pairing_open_safety_checks
after update of state on public.live_quick_connect_pairings
for each row
when (old.state is distinct from new.state)
execute function public.live_quick_connect_open_safety_checks();

-- Preserve the mature queue projection and add a safety-aware public wrapper.
alter function public.rpc_get_live_quick_connect(uuid)
rename to rpc_get_live_quick_connect_without_safety;

revoke all on function public.rpc_get_live_quick_connect_without_safety(uuid)
from public, anon, authenticated;

create or replace function public.rpc_get_live_quick_connect(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_user_id uuid := auth.uid();
  v_snapshot jsonb;
  v_check public.live_quick_connect_safety_checks;
  v_pairing public.live_quick_connect_pairings;
  v_other public.profiles;
  v_session public.live_sessions;
  v_my_decision text;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  v_snapshot := public.rpc_get_live_quick_connect_without_safety(p_session_id);

  select safety.* into v_check
  from public.live_quick_connect_safety_checks safety
  where safety.session_id = p_session_id
    and safety.reviewer_user_id = v_user_id
    and safety.status = 'pending'
  order by safety.created_at desc
  limit 1;

  if v_check.id is null then
    if v_snapshot -> 'pairing' is not null
       and jsonb_typeof(v_snapshot -> 'pairing') = 'object' then
      v_snapshot := jsonb_set(v_snapshot, '{pairing,safety_reviewed}', 'false'::jsonb, true);
    end if;
    return v_snapshot;
  end if;

  select pairing.* into v_pairing
  from public.live_quick_connect_pairings pairing
  where pairing.id = v_check.pairing_id;

  select session.* into v_session
  from public.live_sessions session
  where session.id = p_session_id;

  select profile.* into v_other
  from public.profiles profile
  where profile.id = case
    when v_user_id = v_pairing.participant_a_user_id then v_pairing.participant_b_profile_id
    else v_pairing.participant_a_profile_id
  end;

  select decision.decision into v_my_decision
  from public.live_quick_connect_decisions decision
  where decision.pairing_id = v_pairing.id
    and decision.user_id = v_user_id;

  return v_snapshot || jsonb_build_object(
    'session_id', p_session_id,
    'state', 'safety_check',
    'connection_state', 'left_session',
    'server_now', timezone('utc', now()),
    'queue_status', 'current_private_conversation',
    'pairing', jsonb_build_object(
      'id', v_pairing.id,
      'chemistry_first_enabled', coalesce(v_session.chemistry_first_enabled, false),
      'state', v_pairing.state,
      'starts_at', v_pairing.starts_at,
      'ends_at', v_pairing.ends_at,
      'reconnect_deadline', v_pairing.reconnect_deadline,
      'my_decision', v_my_decision,
      'shared_outcome', v_pairing.shared_outcome,
      'safety_reviewed', false,
      'other_person', jsonb_build_object(
        'user_id', v_other.user_id,
        'profile_id', v_other.id,
        'full_name', v_other.full_name,
        'avatar_url', v_other.avatar_url,
        'age', v_other.age,
        'city', coalesce(v_other.city, v_other.location),
        'looking_for', coalesce(
          v_other.relationship_compass ->> 'intention',
          v_other.looking_for
        )
      ),
      'provider_call_type', v_pairing.provider_call_type,
      'provider_call_id', v_pairing.provider_call_id
    )
  );
end;
$$;

revoke all on function public.rpc_get_live_quick_connect(uuid)
from public, anon, authenticated;
grant execute on function public.rpc_get_live_quick_connect(uuid) to authenticated;

-- A Live host is always a facilitator. Pool admission is only for guests.
create or replace function public.rpc_join_live_quick_connect(p_session_id uuid)
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
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  select session.* into v_session
  from public.live_sessions session
  where session.id = p_session_id;

  if v_session.id is null
     or v_session.format <> 'quick_connect'
     or v_session.status not in ('live', 'backstage') then
    raise exception 'live_quick_connect_session_invalid' using errcode = '23514';
  end if;

  if v_session.created_by_user_id = v_user_id then
    raise exception 'live_quick_connect_host_facilitator_required' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.live_quick_connect_safety_checks safety
    where safety.session_id = p_session_id
      and safety.reviewer_user_id = v_user_id
      and safety.status = 'pending'
  ) then
    return public.rpc_get_live_quick_connect(p_session_id);
  end if;

  select control.* into v_control
  from public.live_quick_connect_controls control
  where control.session_id = p_session_id;

  if v_control.session_id is null then
    raise exception 'live_quick_connect_control_missing' using errcode = 'P0002';
  end if;
  if v_control.state in ('draining', 'ended') then
    raise exception 'live_quick_connect_not_accepting_members' using errcode = '55000';
  end if;

  return public.rpc_join_live_quick_connect_uncontrolled(p_session_id);
end;
$$;

revoke all on function public.rpc_join_live_quick_connect(uuid) from public, anon;
grant execute on function public.rpc_join_live_quick_connect(uuid) to authenticated;

-- Keep the existing owner/configuration checks as a private implementation,
-- while making facilitator-only policy explicit at the public boundary.
alter function public.rpc_configure_live_quick_connect(uuid, integer, text)
rename to rpc_configure_live_quick_connect_with_creator_mode;

revoke all on function public.rpc_configure_live_quick_connect_with_creator_mode(uuid, integer, text)
from public, anon, authenticated;

create or replace function public.rpc_configure_live_quick_connect(
  p_session_id uuid,
  p_round_seconds integer,
  p_creator_mode text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
begin
  if p_creator_mode is distinct from 'facilitator' then
    raise exception 'live_quick_connect_host_facilitator_required' using errcode = '42501';
  end if;
  return public.rpc_configure_live_quick_connect_with_creator_mode(
    p_session_id,
    p_round_seconds,
    'facilitator'
  );
end;
$$;

revoke all on function public.rpc_configure_live_quick_connect(uuid, integer, text)
from public, anon;
grant execute on function public.rpc_configure_live_quick_connect(uuid, integer, text)
to authenticated;

create or replace function public.rpc_submit_live_quick_connect_safety_check(
  p_pairing_id uuid,
  p_experience text,
  p_reason text default null,
  p_block boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_user_id uuid := auth.uid();
  v_pairing public.live_quick_connect_pairings;
  v_check public.live_quick_connect_safety_checks;
  v_report public.live_reports;
  v_profile_id uuid;
  v_reason text := nullif(btrim(p_reason), '');
  v_report_reason text;
  v_now timestamptz := timezone('utc', now());
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_experience is null
     or p_experience not in ('respectful', 'uncomfortable', 'safety_concern') then
    raise exception 'live_quick_connect_safety_experience_invalid' using errcode = '22023';
  end if;
  if v_reason is not null and v_reason not in (
    'requested_nudity', 'sexual_pressure', 'harassment_disrespect',
    'hate_threats', 'impersonation_deception', 'other'
  ) then
    raise exception 'live_quick_connect_safety_reason_invalid' using errcode = '22023';
  end if;
  if (p_experience = 'safety_concern') <> (v_reason is not null) then
    raise exception 'live_quick_connect_safety_reason_required' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('quick-pair:' || p_pairing_id::text, 0));

  select pairing.* into v_pairing
  from public.live_quick_connect_pairings pairing
  where pairing.id = p_pairing_id
  for update;

  if v_pairing.id is null
     or v_user_id not in (v_pairing.participant_a_user_id, v_pairing.participant_b_user_id) then
    raise exception 'live_quick_connect_safety_forbidden' using errcode = '42501';
  end if;

  if v_pairing.state in ('active', 'reconnect_grace') then
    if p_experience <> 'safety_concern' then
      raise exception 'live_quick_connect_safety_round_active' using errcode = '55000';
    end if;

    update public.live_quick_connect_rounds round_row
    set state = 'cancelled', completed_at = v_now, version = round_row.version + 1
    where round_row.id = v_pairing.round_id
      and round_row.state in ('open', 'active');

    update public.live_quick_connect_pairings pairing
    set state = 'round_incomplete', completed_at = v_now,
        shared_outcome = null, version = pairing.version + 1
    where pairing.id = p_pairing_id;

    select pairing.* into v_pairing
    from public.live_quick_connect_pairings pairing
    where pairing.id = p_pairing_id;
  end if;

  select safety.* into v_check
  from public.live_quick_connect_safety_checks safety
  where safety.pairing_id = p_pairing_id
    and safety.reviewer_user_id = v_user_id
  for update;

  if v_check.id is null then
    raise exception 'live_quick_connect_safety_check_missing' using errcode = 'P0002';
  end if;

  if v_check.status = 'completed' then
    if v_check.experience = p_experience
       and v_check.reason is not distinct from v_reason
       and v_check.block_requested = coalesce(p_block, false) then
      return jsonb_build_object(
        'completed', true,
        'reported', v_check.report_id is not null,
        'blocked', v_check.block_requested
      );
    end if;
    raise exception 'live_quick_connect_safety_check_already_completed' using errcode = '23514';
  end if;

  if coalesce(p_block, false) then
    insert into public.blocks(blocker_id, blocked_id)
    values(v_user_id, v_check.reviewed_user_id)
    on conflict(blocker_id, blocked_id) do nothing;
  end if;

  if p_experience = 'safety_concern' then
    v_profile_id := case
      when v_user_id = v_pairing.participant_a_user_id then v_pairing.participant_a_profile_id
      else v_pairing.participant_b_profile_id
    end;
    v_report_reason := case v_reason
      when 'requested_nudity' then 'sexual_content'
      when 'sexual_pressure' then 'sexual_content'
      when 'harassment_disrespect' then 'harassment'
      when 'hate_threats' then 'hate'
      when 'impersonation_deception' then 'impersonation'
      else 'other'
    end;

    insert into public.live_reports(
      session_id, reporter_user_id, reporter_profile_id, target_user_id,
      client_report_id, reason, details
    ) values (
      v_pairing.session_id, v_user_id, v_profile_id, v_check.reviewed_user_id,
      v_check.id, v_report_reason,
      'Quick Connect private safety report: ' || v_reason
    )
    on conflict(session_id, reporter_user_id, client_report_id) do update
      set reason = excluded.reason
    returning * into v_report;

    insert into public.live_session_events(
      session_id, actor_user_id, event_type, metadata
    ) values (
      v_pairing.session_id,
      v_user_id,
      'private_safety_report_submitted',
      jsonb_build_object(
        'reportId', v_report.id,
        'pairingId', v_pairing.id,
        'targetUserId', v_check.reviewed_user_id
      )
    );
  end if;

  update public.live_quick_connect_safety_checks safety
  set status = 'completed',
      experience = p_experience,
      reason = v_reason,
      block_requested = coalesce(p_block, false),
      report_id = v_report.id,
      completed_at = v_now
  where safety.id = v_check.id;

  -- Completion exits only the private rotation pool, never the public Live.
  update public.live_quick_connect_participants participant
  set state = 'left', connection_state = 'left_session',
      current_pairing_id = null, reconnect_deadline = null, last_seen_at = v_now
  where participant.session_id = v_pairing.session_id
    and participant.user_id = v_user_id;

  return jsonb_build_object(
    'completed', true,
    'reported', v_report.id is not null,
    'blocked', coalesce(p_block, false)
  );
end;
$$;

revoke all on function public.rpc_submit_live_quick_connect_safety_check(uuid, text, text, boolean)
from public, anon;
grant execute on function public.rpc_submit_live_quick_connect_safety_check(uuid, text, text, boolean)
to authenticated;

create or replace function public.rpc_list_live_quick_connect_safety_reports(
  p_session_id uuid
)
returns table(
  report_id uuid,
  pairing_id uuid,
  target_user_id uuid,
  reason text,
  details text,
  status text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
begin
  if not public.has_live_capability(p_session_id, 'live.view_safety_console') then
    raise exception 'live_safety_console_forbidden' using errcode = '42501';
  end if;

  return query
  select report.id, safety.pairing_id, report.target_user_id,
    report.reason, report.details, report.status, report.created_at
  from public.live_quick_connect_safety_checks safety
  join public.live_reports report on report.id = safety.report_id
  where safety.session_id = p_session_id
  order by report.created_at desc;
end;
$$;

revoke all on function public.rpc_list_live_quick_connect_safety_reports(uuid)
from public, anon;
grant execute on function public.rpc_list_live_quick_connect_safety_reports(uuid)
to authenticated;

comment on table public.live_quick_connect_safety_checks is
  'Private mandatory post-round safety checks. Responses are never public or shared with the other participant.';
comment on function public.rpc_submit_live_quick_connect_safety_check(uuid, text, text, boolean) is
  'Pairing-scoped, idempotent safety review with optional block and moderator-visible report.';

commit;
