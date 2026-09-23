-- Replace lifetime raw-attempt escalation with reversible, rolling risk points.
-- Existing callers and the 1.1.1 compatibility path keep the same table/RPC contract.

alter table public.content_safety_actor_state
  add column if not exists enforcement_points_30d numeric(8,2) not null default 0,
  add column if not exists enforcement_tier text not null default 'CLEAR',
  add column if not exists enforcement_recalculated_at timestamptz;

alter table public.content_safety_actor_state
  drop constraint if exists content_safety_actor_state_enforcement_tier_check;
alter table public.content_safety_actor_state
  add constraint content_safety_actor_state_enforcement_tier_check
  check (enforcement_tier in ('CLEAR', 'WARN', 'RESTRICT_24H', 'RESTRICT_7D', 'RESTRICT_30D'))
  not valid;
alter table public.content_safety_actor_state
  validate constraint content_safety_actor_state_enforcement_tier_check;

create or replace function public.content_safety_event_weight(
  p_decision text,
  p_status text,
  p_categories text[],
  p_failure_reason text
)
returns numeric
language sql
immutable
set search_path = public, pg_catalog
as $$
  select case
    when p_status = 'APPROVED' or nullif(btrim(coalesce(p_failure_reason, '')), '') is not null then 0
    when coalesce(p_categories, '{}') && array['known_illegal_media', 'csam']::text[] then 10
    when coalesce(p_categories, '{}') && array[
      'threatening_violence', 'sexual_service_solicitation', 'financial_solicitation'
    ]::text[] then 2.5
    when p_decision = 'BLOCK' then 1
    when p_decision = 'REVIEW' and p_status in ('PENDING_REVIEW', 'REJECTED') then 0.5
    else 0
  end;
$$;

revoke all on function public.content_safety_event_weight(text, text, text[], text)
  from public, anon, authenticated;
grant execute on function public.content_safety_event_weight(text, text, text[], text)
  to service_role;

create or replace function public.recalculate_content_safety_actor_state(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  v_points numeric(8,2) := 0;
  v_blocked integer := 0;
  v_reviews integer := 0;
  v_last_incident timestamptz;
  v_tier text := 'CLEAR';
  v_restricted_until timestamptz;
begin
  if p_user_id is null then return; end if;

  select
    coalesce(sum(public.content_safety_event_weight(
      event_row.decision, event_row.status, event_row.categories, event_row.failure_reason
    )), 0)::numeric(8,2),
    count(*) filter (
      where event_row.decision = 'BLOCK'
        and public.content_safety_event_weight(
          event_row.decision, event_row.status, event_row.categories, event_row.failure_reason
        ) > 0
    )::integer,
    count(*) filter (
      where event_row.decision = 'REVIEW'
        and public.content_safety_event_weight(
          event_row.decision, event_row.status, event_row.categories, event_row.failure_reason
        ) > 0
    )::integer,
    max(event_row.created_at) filter (
      where public.content_safety_event_weight(
        event_row.decision, event_row.status, event_row.categories, event_row.failure_reason
      ) > 0
    )
  into v_points, v_blocked, v_reviews, v_last_incident
  from public.content_moderation_events event_row
  where event_row.actor_user_id = p_user_id
    and event_row.created_at >= timezone('utc', now()) - interval '30 days';

  if v_points >= 10 then
    v_tier := 'RESTRICT_30D';
    v_restricted_until := timezone('utc', now()) + interval '30 days';
  elsif v_points >= 6 then
    v_tier := 'RESTRICT_7D';
    v_restricted_until := timezone('utc', now()) + interval '7 days';
  elsif v_points >= 3 then
    v_tier := 'RESTRICT_24H';
    v_restricted_until := timezone('utc', now()) + interval '24 hours';
  elsif v_points > 0 then
    v_tier := 'WARN';
    v_restricted_until := null;
  end if;

  insert into public.content_safety_actor_state(
    user_id, blocked_attempts, review_attempts, restricted_until,
    last_incident_at, updated_at, enforcement_points_30d,
    enforcement_tier, enforcement_recalculated_at
  ) values (
    p_user_id, v_blocked, v_reviews, v_restricted_until,
    v_last_incident, timezone('utc', now()), v_points,
    v_tier, timezone('utc', now())
  )
  on conflict (user_id) do update set
    blocked_attempts = excluded.blocked_attempts,
    review_attempts = excluded.review_attempts,
    restricted_until = excluded.restricted_until,
    last_incident_at = excluded.last_incident_at,
    updated_at = excluded.updated_at,
    enforcement_points_30d = excluded.enforcement_points_30d,
    enforcement_tier = excluded.enforcement_tier,
    enforcement_recalculated_at = excluded.enforcement_recalculated_at;
end;
$$;

revoke all on function public.recalculate_content_safety_actor_state(uuid)
  from public, anon, authenticated;
grant execute on function public.recalculate_content_safety_actor_state(uuid)
  to service_role;

create or replace function public.trg_recalculate_content_safety_actor_state()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $$
begin
  if pg_trigger_depth() > 1 then return new; end if;
  perform public.recalculate_content_safety_actor_state(new.actor_user_id);
  if tg_op = 'UPDATE' and old.actor_user_id is distinct from new.actor_user_id then
    perform public.recalculate_content_safety_actor_state(old.actor_user_id);
  end if;
  return new;
end;
$$;

revoke all on function public.trg_recalculate_content_safety_actor_state()
  from public, anon, authenticated;

drop trigger if exists recalculate_content_safety_actor_state_on_event
  on public.content_moderation_events;
create trigger recalculate_content_safety_actor_state_on_event
after insert or update of decision, status, categories, failure_reason, actor_user_id
on public.content_moderation_events
for each row execute function public.trg_recalculate_content_safety_actor_state();

create or replace function public.trg_normalize_content_safety_actor_state()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $$
begin
  if pg_trigger_depth() > 1 then return new; end if;
  perform public.recalculate_content_safety_actor_state(new.user_id);
  return new;
end;
$$;

revoke all on function public.trg_normalize_content_safety_actor_state()
  from public, anon, authenticated;

drop trigger if exists normalize_content_safety_actor_state_after_legacy_write
  on public.content_safety_actor_state;
create trigger normalize_content_safety_actor_state_after_legacy_write
after insert or update of blocked_attempts, review_attempts, restricted_until
on public.content_safety_actor_state
for each row execute function public.trg_normalize_content_safety_actor_state();

create or replace function public.rpc_admin_reverse_content_moderation_event(
  p_event_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  v_event public.content_moderation_events%rowtype;
begin
  if auth.uid() is null or not public.is_admin_user(auth.uid()) then
    raise exception using errcode = '42501', message = 'ADMIN_REQUIRED';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 5 or char_length(p_reason) > 1000 then
    raise exception using errcode = '22023', message = 'APPEAL_REASON_INVALID';
  end if;

  select * into v_event
  from public.content_moderation_events event_row
  where event_row.id = p_event_id
  for update;
  if not found then raise exception using errcode = 'P0002', message = 'MODERATION_EVENT_NOT_FOUND'; end if;
  if v_event.status = 'APPROVED' then
    return jsonb_build_object('ok', true, 'event_id', p_event_id, 'idempotent', true);
  end if;
  if v_event.status not in ('AUTO_CLOSED', 'REJECTED') then
    raise exception using errcode = '22023', message = 'MODERATION_EVENT_NOT_REVERSIBLE';
  end if;

  update public.content_moderation_events
  set status = 'APPROVED',
      reviewed_at = timezone('utc', now()),
      reviewed_by = auth.uid(),
      review_outcome = 'APPROVE',
      review_notes = left(btrim(p_reason), 1000)
  where id = p_event_id;

  return jsonb_build_object('ok', true, 'event_id', p_event_id, 'idempotent', false);
end;
$$;

revoke all on function public.rpc_admin_reverse_content_moderation_event(uuid, text)
  from public, anon;
grant execute on function public.rpc_admin_reverse_content_moderation_event(uuid, text)
  to authenticated;

-- Recalculate only actors with recent incidents; older lifetime counters no longer punish users.
do $$
declare v_user_id uuid;
begin
  for v_user_id in
    select distinct event_row.actor_user_id
    from public.content_moderation_events event_row
    where event_row.created_at >= timezone('utc', now()) - interval '30 days'
  loop
    perform public.recalculate_content_safety_actor_state(v_user_id);
  end loop;
end;
$$;

update public.content_safety_actor_state
set blocked_attempts = 0,
    review_attempts = 0,
    restricted_until = null,
    last_incident_at = null,
    enforcement_points_30d = 0,
    enforcement_tier = 'CLEAR',
    enforcement_recalculated_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
where enforcement_recalculated_at is null;
