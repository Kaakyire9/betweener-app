-- Dedicated least-privilege child-safety evidence hold and audit trail.

alter table public.content_moderation_events
  add column if not exists evidence_state text,
  add column if not exists evidence_hold boolean not null default false,
  add column if not exists legal_hold boolean not null default false,
  add column if not exists evidence_resolved_at timestamptz,
  add column if not exists evidence_resolved_by uuid references auth.users(id) on delete set null,
  add column if not exists evidence_resolution_reason text;

update public.content_moderation_events
set evidence_state = case
  when status = 'PENDING_REVIEW' then 'REVIEW_REQUIRED'
  else 'RESOLVED'
end
where evidence_state is null;

alter table public.content_moderation_events
  alter column evidence_state set default 'RESOLVED',
  alter column evidence_state set not null,
  drop constraint if exists content_moderation_evidence_state_check,
  add constraint content_moderation_evidence_state_check check (evidence_state in (
    'QUARANTINED', 'REJECTED', 'EVIDENCE_HOLD', 'REVIEW_REQUIRED', 'RESOLVED'
  ));

create table if not exists public.child_safety_reviewers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  granted_at timestamptz not null default timezone('utc', now()),
  granted_by uuid references auth.users(id) on delete set null
);
alter table public.child_safety_reviewers enable row level security;
revoke all on table public.child_safety_reviewers from public, anon, authenticated;
grant select, insert, update, delete on table public.child_safety_reviewers to service_role;

create table if not exists public.child_safety_evidence_transitions (
  id bigint generated always as identity primary key,
  event_id uuid not null references public.content_moderation_events(id) on delete cascade,
  from_state text,
  to_state text not null check (to_state in (
    'QUARANTINED', 'REJECTED', 'EVIDENCE_HOLD', 'REVIEW_REQUIRED', 'RESOLVED'
  )),
  actor_user_id uuid references auth.users(id) on delete set null,
  reason text not null,
  created_at timestamptz not null default timezone('utc', now())
);
create index if not exists child_safety_evidence_transitions_event_idx
  on public.child_safety_evidence_transitions(event_id, created_at);
alter table public.child_safety_evidence_transitions enable row level security;
revoke all on table public.child_safety_evidence_transitions from public, anon, authenticated;
grant select, insert on table public.child_safety_evidence_transitions to service_role;

create or replace function public.is_child_safety_reviewer(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select exists (
    select 1 from public.child_safety_reviewers reviewer
    where reviewer.user_id = p_user_id
  );
$$;
revoke all on function public.is_child_safety_reviewer(uuid) from public, anon;
grant execute on function public.is_child_safety_reviewer(uuid) to authenticated, service_role;

create or replace function public.child_safety_initialize_evidence_hold()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if not (new.categories && array['known_illegal_media', 'suspected_child_sexual_content']::text[]) then
    return new;
  end if;
  insert into public.child_safety_evidence_transitions(event_id, from_state, to_state, reason)
  values
    (new.id, null, 'QUARANTINED', 'server_quarantine_created'),
    (new.id, 'QUARANTINED', 'REJECTED', 'publication_rejected'),
    (new.id, 'REJECTED', 'EVIDENCE_HOLD', 'safety_evidence_preserved'),
    (new.id, 'EVIDENCE_HOLD', 'REVIEW_REQUIRED', 'specialist_review_required');
  update public.content_moderation_events
  set evidence_state = 'REVIEW_REQUIRED',
      evidence_hold = true,
      legal_hold = true,
      status = 'PENDING_REVIEW'
  where id = new.id;
  return new;
end;
$$;
revoke all on function public.child_safety_initialize_evidence_hold()
  from public, anon, authenticated;

drop trigger if exists child_safety_initialize_evidence_hold on public.content_moderation_events;
create trigger child_safety_initialize_evidence_hold
after insert on public.content_moderation_events
for each row execute function public.child_safety_initialize_evidence_hold();

create or replace function public.child_safety_protect_evidence_hold()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if old.evidence_hold and current_setting('app.child_safety_resolution', true) <> 'on'
     and (not new.evidence_hold or new.evidence_state is distinct from old.evidence_state
       or new.storage_bucket is distinct from old.storage_bucket
       or new.storage_path is distinct from old.storage_path
       or new.evidence_redacted_at is distinct from old.evidence_redacted_at
       or new.status is distinct from old.status
       or new.reviewed_at is distinct from old.reviewed_at
       or new.reviewed_by is distinct from old.reviewed_by) then
    raise exception using errcode = '42501', message = 'CHILD_SAFETY_REVIEWER_REQUIRED';
  end if;
  return new;
end;
$$;
revoke all on function public.child_safety_protect_evidence_hold()
  from public, anon, authenticated;

drop trigger if exists child_safety_protect_evidence_hold on public.content_moderation_events;
create trigger child_safety_protect_evidence_hold
before update on public.content_moderation_events
for each row execute function public.child_safety_protect_evidence_hold();

create or replace function public.rpc_child_safety_resolve_evidence(
  p_event_id uuid,
  p_reason text,
  p_release_legal_hold boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  v_event public.content_moderation_events%rowtype;
begin
  if not public.is_child_safety_reviewer(auth.uid()) then
    raise exception using errcode = '42501', message = 'CHILD_SAFETY_REVIEWER_REQUIRED';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 10 then
    raise exception using errcode = '22023', message = 'RESOLUTION_REASON_REQUIRED';
  end if;
  select * into v_event from public.content_moderation_events
  where id = p_event_id and evidence_hold for update;
  if not found then raise exception using errcode = 'P0002', message = 'EVIDENCE_HOLD_NOT_FOUND'; end if;

  perform set_config('app.child_safety_resolution', 'on', true);
  update public.content_moderation_events
  set evidence_state = 'RESOLVED',
      evidence_hold = not p_release_legal_hold,
      legal_hold = not p_release_legal_hold,
      evidence_resolved_at = timezone('utc', now()),
      evidence_resolved_by = auth.uid(),
      evidence_resolution_reason = left(btrim(p_reason), 1000),
      status = 'REJECTED',
      reviewed_at = timezone('utc', now()),
      reviewed_by = auth.uid(),
      review_outcome = 'REJECT',
      review_notes = left(btrim(p_reason), 1000)
  where id = p_event_id;

  insert into public.child_safety_evidence_transitions(
    event_id, from_state, to_state, actor_user_id, reason
  ) values (
    p_event_id, v_event.evidence_state, 'RESOLVED', auth.uid(), left(btrim(p_reason), 1000)
  );
  return jsonb_build_object(
    'ok', true, 'event_id', p_event_id, 'state', 'RESOLVED',
    'legal_hold', not p_release_legal_hold
  );
end;
$$;

revoke all on function public.rpc_child_safety_resolve_evidence(uuid, text, boolean)
  from public, anon;
grant execute on function public.rpc_child_safety_resolve_evidence(uuid, text, boolean)
  to authenticated, service_role;

create or replace function public.rpc_admin_get_content_moderation_events(p_limit integer default 100)
returns table(
  event_id uuid, actor_user_id uuid, actor_profile_id uuid, actor_name text,
  target_user_id uuid, target_name text, content_type text, content_id uuid,
  client_content_id text, decision text, status text, categories text[],
  risk_score numeric, extracted_text text, evidence_snapshot jsonb,
  storage_bucket text, storage_path text, provider text, provider_model text,
  failure_reason text, created_at timestamptz, reviewed_at timestamptz,
  review_outcome text, review_notes text
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_can_see_child_evidence boolean := public.is_child_safety_reviewer(auth.uid());
begin
  if not public.is_admin_user(auth.uid()) then
    raise exception using errcode = '42501', message = 'ADMIN_REQUIRED';
  end if;
  return query
  select
    event_row.id, event_row.actor_user_id, actor_profile.id, actor_profile.full_name,
    event_row.target_user_id, target_profile.full_name, event_row.content_type,
    event_row.content_id, event_row.client_content_id, event_row.decision,
    event_row.status, event_row.categories, event_row.risk_score,
    case when event_row.evidence_hold and not v_can_see_child_evidence
      then null else event_row.extracted_text end,
    case when event_row.evidence_hold and not v_can_see_child_evidence
      then jsonb_build_object('restricted', true, 'evidence_state', event_row.evidence_state)
      else event_row.evidence_snapshot end,
    case when event_row.evidence_hold and not v_can_see_child_evidence
      then null else event_row.storage_bucket end,
    case when event_row.evidence_hold and not v_can_see_child_evidence
      then null else event_row.storage_path end,
    event_row.provider, event_row.provider_model, event_row.failure_reason,
    event_row.created_at, event_row.reviewed_at, event_row.review_outcome,
    event_row.review_notes
  from public.content_moderation_events event_row
  left join public.profiles actor_profile on actor_profile.user_id = event_row.actor_user_id
  left join public.profiles target_profile on target_profile.user_id = event_row.target_user_id
  order by (event_row.status = 'PENDING_REVIEW') desc, event_row.created_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 500));
end;
$$;

revoke all on function public.rpc_admin_get_content_moderation_events(integer)
  from public, anon;
grant execute on function public.rpc_admin_get_content_moderation_events(integer)
  to authenticated;

comment on table public.child_safety_evidence_transitions is
  'Audit-only state transitions for suspected child-safety evidence. This does not assert legal confirmation and does not perform external reporting.';
