-- Production workflow for semantic Profile Guard reviews.
-- Adds immutable evidence, an authenticated-admin queue, notifications, and
-- event-scoped review decisions while preserving the existing profile resolver.

begin;

alter table public.profile_moderation_events
  add column if not exists evidence_snapshot jsonb not null default '{}'::jsonb;

alter table public.profile_moderation_events
  drop constraint if exists profile_moderation_events_evidence_snapshot_object_check;
alter table public.profile_moderation_events
  add constraint profile_moderation_events_evidence_snapshot_object_check
  check (jsonb_typeof(evidence_snapshot) = 'object');

-- Existing reviews predate immutable evidence. Preserve an explicitly labelled
-- snapshot of the current values so admins never mistake it for original input.
update public.profile_moderation_events event_row
set evidence_snapshot = jsonb_build_object(
  'capture', 'migration_current_profile_snapshot',
  'profile_updates', jsonb_strip_nulls(jsonb_build_object(
    'full_name', profile.full_name,
    'bio', profile.bio,
    'occupation', profile.occupation,
    'education', profile.education,
    'looking_for', profile.looking_for,
    'roots_note', profile.roots_note,
    'future_ghana_plans', profile.future_ghana_plans
  ))
)
from public.profiles profile
where event_row.profile_id = profile.id
  and event_row.decision = 'HUMAN_REVIEW'
  and event_row.evidence_snapshot = '{}'::jsonb;

create or replace function public.rpc_apply_profile_guard_semantic_decision(
  p_user_id uuid,
  p_category text,
  p_semantic_scores jsonb,
  p_evidence_snapshot jsonb
)
returns void
language plpgsql security definer
set search_path = public, pg_catalog, auth
as $$
declare
  v_profile public.profiles%rowtype;
  v_score numeric;
  v_event_id uuid;
  v_prior_discoverable boolean;
  v_evidence jsonb := jsonb_strip_nulls(coalesce(p_evidence_snapshot, '{}'::jsonb));
  v_field_names text[] := array[]::text[];
  v_allowed_categories constant text[] := array[
    'external_contact','external_redirection','commercial_solicitation',
    'paid_content_promotion','sexual_service_solicitation',
    'financial_solicitation','spam'
  ];
begin
  if auth.role() <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if not (p_category = any(v_allowed_categories))
     or jsonb_typeof(p_semantic_scores) <> 'object'
     or jsonb_typeof(v_evidence) <> 'object'
     or exists (
       select 1 from jsonb_object_keys(v_evidence) key_name
       where key_name not in ('profile_updates', 'prompt_update')
     )
     or pg_column_size(v_evidence) > 32768 then
    raise exception using errcode = '22023', message = 'INVALID_SEMANTIC_DECISION';
  end if;
  if v_evidence ? 'profile_updates'
     and jsonb_typeof(v_evidence->'profile_updates') <> 'object' then
    raise exception using errcode = '22023', message = 'INVALID_SEMANTIC_DECISION';
  end if;
  if v_evidence ? 'prompt_update'
     and jsonb_typeof(v_evidence->'prompt_update') <> 'object' then
    raise exception using errcode = '22023', message = 'INVALID_SEMANTIC_DECISION';
  end if;
  begin
    v_score := (p_semantic_scores->>p_category)::numeric;
  exception when others then
    raise exception using errcode = '22023', message = 'INVALID_SEMANTIC_DECISION';
  end;
  if v_score < 0.65 or v_score > 1 then
    raise exception using errcode = '22023', message = 'INVALID_SEMANTIC_DECISION';
  end if;

  select * into v_profile from public.profiles where user_id = p_user_id for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'PROFILE_NOT_FOUND';
  end if;
  if v_profile.profile_moderation_state = 'REVIEW_REQUIRED' then
    select coalesce(bool_or(coalesce((event_row.metadata->>'prior_discoverable')::boolean, false)), false)
    into v_prior_discoverable
    from public.profile_moderation_events event_row
    where event_row.profile_id = v_profile.id
      and event_row.decision = 'HUMAN_REVIEW'
      and event_row.reviewed_at is null;
  else
    v_prior_discoverable := v_profile.discoverable_in_vibes;
  end if;

  select coalesce(array_agg(key_name order by key_name), array[]::text[])
  into v_field_names
  from jsonb_object_keys(coalesce(v_evidence->'profile_updates', '{}'::jsonb)) key_name;
  if v_evidence ? 'prompt_update' then
    v_field_names := array_append(v_field_names, 'profile_prompt');
  end if;
  if cardinality(v_field_names) = 0 then
    v_field_names := array['semantic'];
  end if;

  insert into public.profile_moderation_events(
    user_id, profile_id, field_names, categories, risk_score, decision,
    source, detector_version, metadata, evidence_snapshot
  ) values (
    p_user_id, v_profile.id, v_field_names, array[p_category], v_score,
    'HUMAN_REVIEW', 'profile_write', '2.1.0',
    jsonb_build_object(
      'semantic_used', true,
      'score_keys', array(select jsonb_object_keys(p_semantic_scores)),
      'prior_discoverable', v_prior_discoverable,
      'evidence_capture', 'submitted_guarded_fields'
    ),
    v_evidence
  ) returning id into v_event_id;

  perform set_config('app.profile_guard_write', 'on', true);
  update public.profiles
  set profile_moderation_state = 'REVIEW_REQUIRED',
      discoverable_in_vibes = false,
      updated_at = timezone('utc', now())
  where id = v_profile.id;

  perform public.notify_internal_admin_queue_item(
    'profile_guard_review',
    v_event_id,
    'A profile needs Solicitation Guard review.',
    jsonb_build_object(
      'profile_id', v_profile.id,
      'category', p_category,
      'risk_score', v_score,
      'route', '/admin?tab=profile_guard&review=' || v_event_id::text
    )
  );
end;
$$;
revoke all on function public.rpc_apply_profile_guard_semantic_decision(uuid, text, jsonb, jsonb)
from public, anon, authenticated;
grant execute on function public.rpc_apply_profile_guard_semantic_decision(uuid, text, jsonb, jsonb)
to service_role;

create or replace function public.rpc_admin_get_profile_guard_review_queue(
  p_include_resolved boolean default false,
  p_limit integer default 100
)
returns table(
  review_id uuid,
  profile_id uuid,
  user_id uuid,
  full_name text,
  avatar_url text,
  current_profile_text jsonb,
  evidence_snapshot jsonb,
  field_names text[],
  categories text[],
  risk_score numeric,
  detector_version text,
  semantic_used boolean,
  profile_moderation_state text,
  discoverable_in_vibes boolean,
  prior_discoverable boolean,
  created_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid,
  review_outcome text,
  resolution_reason_code text,
  review_notes text
)
language plpgsql stable security definer
set search_path = public, pg_catalog, auth
set row_security = off
as $$
begin
  if auth.uid() is null or not public.is_admin_user(auth.uid()) then
    raise exception using errcode = '42501', message = 'ADMIN_REQUIRED';
  end if;
  if p_limit < 1 or p_limit > 200 then
    raise exception using errcode = '22023', message = 'INVALID_LIMIT';
  end if;

  return query
  select
    event_row.id,
    event_row.profile_id,
    event_row.user_id,
    profile.full_name,
    profile.avatar_url,
    jsonb_strip_nulls(jsonb_build_object(
      'full_name', profile.full_name,
      'bio', profile.bio,
      'occupation', profile.occupation,
      'education', profile.education,
      'looking_for', profile.looking_for,
      'roots_note', profile.roots_note,
      'future_ghana_plans', profile.future_ghana_plans
    )),
    event_row.evidence_snapshot,
    event_row.field_names,
    event_row.categories,
    event_row.risk_score,
    event_row.detector_version,
    coalesce((event_row.metadata->>'semantic_used')::boolean, false),
    profile.profile_moderation_state,
    profile.discoverable_in_vibes,
    coalesce((event_row.metadata->>'prior_discoverable')::boolean, false),
    event_row.created_at,
    event_row.reviewed_at,
    event_row.reviewed_by,
    event_row.review_outcome,
    event_row.metadata->>'resolution_reason_code',
    event_row.metadata->>'review_notes'
  from public.profile_moderation_events event_row
  join public.profiles profile on profile.id = event_row.profile_id
  where event_row.decision = 'HUMAN_REVIEW'
    and (p_include_resolved or event_row.reviewed_at is null)
  order by
    (event_row.reviewed_at is null) desc,
    event_row.created_at desc
  limit p_limit;
end;
$$;
revoke all on function public.rpc_admin_get_profile_guard_review_queue(boolean, integer)
from public, anon;
grant execute on function public.rpc_admin_get_profile_guard_review_queue(boolean, integer)
to authenticated;

create or replace function public.rpc_admin_resolve_profile_guard_review(
  p_review_id uuid,
  p_state text,
  p_reason_code text,
  p_notes text default null
)
returns jsonb
language plpgsql security definer
set search_path = public, pg_catalog, auth
as $$
declare
  v_event public.profile_moderation_events%rowtype;
  v_has_other_open_review boolean := false;
  v_restore_discoverable boolean := false;
  v_final_state text;
begin
  if auth.uid() is null or not public.is_admin_user(auth.uid()) then
    raise exception using errcode = '42501', message = 'ADMIN_REQUIRED';
  end if;
  if p_state not in ('CLEAR', 'RESTRICTED', 'SUSPENDED') then
    raise exception using errcode = '22023', message = 'INVALID_REVIEW_STATE';
  end if;
  if nullif(btrim(coalesce(p_reason_code, '')), '') is null then
    raise exception using errcode = '22023', message = 'REASON_REQUIRED';
  end if;

  select * into v_event
  from public.profile_moderation_events event_row
  where event_row.id = p_review_id
    and event_row.decision = 'HUMAN_REVIEW'
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'REVIEW_NOT_FOUND';
  end if;
  if v_event.reviewed_at is not null then
    raise exception using errcode = 'P0001', message = 'REVIEW_ALREADY_RESOLVED';
  end if;

  perform 1 from public.profiles profile where profile.id = v_event.profile_id for update;

  update public.profile_moderation_events
  set reviewed_at = timezone('utc', now()),
      reviewed_by = auth.uid(),
      review_outcome = p_state,
      resolved_at = timezone('utc', now()),
      metadata = metadata || jsonb_strip_nulls(jsonb_build_object(
        'resolution_reason_code', left(btrim(p_reason_code), 80),
        'review_notes', nullif(left(btrim(coalesce(p_notes, '')), 1000), '')
      ))
  where id = v_event.id;

  select exists (
    select 1 from public.profile_moderation_events other_event
    where other_event.profile_id = v_event.profile_id
      and other_event.id <> v_event.id
      and other_event.decision = 'HUMAN_REVIEW'
      and other_event.reviewed_at is null
  ) into v_has_other_open_review;

  v_restore_discoverable := coalesce(
    (v_event.metadata->>'prior_discoverable')::boolean,
    false
  );
  if p_state = 'CLEAR' and v_has_other_open_review and v_restore_discoverable then
    update public.profile_moderation_events
    set metadata = metadata || jsonb_build_object('prior_discoverable', true)
    where profile_id = v_event.profile_id
      and id <> v_event.id
      and decision = 'HUMAN_REVIEW'
      and reviewed_at is null;
  end if;
  v_final_state := case
    when p_state = 'CLEAR' and v_has_other_open_review then 'REVIEW_REQUIRED'
    else p_state
  end;

  perform set_config('app.profile_guard_write', 'on', true);
  update public.profiles
  set profile_moderation_state = v_final_state,
      discoverable_in_vibes = case
        when v_final_state = 'CLEAR' then v_restore_discoverable
        else false
      end,
      updated_at = timezone('utc', now())
  where id = v_event.profile_id;

  insert into public.system_messages(user_id, peer_user_id, event_type, text, metadata)
  values (
    v_event.user_id,
    v_event.user_id,
    'profile_guard_review_resolved',
    case
      when v_final_state = 'CLEAR' then 'Your profile review is complete and your profile is eligible again.'
      when v_final_state = 'REVIEW_REQUIRED' then 'One profile review is complete. Another review is still pending.'
      else 'Your profile review is complete. Please update your profile before it can appear publicly.'
    end,
    jsonb_build_object(
      'review_id', v_event.id,
      'profile_id', v_event.profile_id,
      'outcome', p_state,
      'reason_code', left(btrim(p_reason_code), 80)
    )
  );

  return jsonb_build_object(
    'ok', true,
    'review_id', v_event.id,
    'profile_id', v_event.profile_id,
    'review_outcome', p_state,
    'profile_moderation_state', v_final_state,
    'other_open_review', v_has_other_open_review
  );
end;
$$;
revoke all on function public.rpc_admin_resolve_profile_guard_review(uuid, text, text, text)
from public, anon;
grant execute on function public.rpc_admin_resolve_profile_guard_review(uuid, text, text, text)
to authenticated;

create or replace function public.rpc_admin_dashboard_overview()
returns jsonb
language plpgsql security definer
set search_path = public, pg_catalog, auth
as $$
declare
  result jsonb;
begin
  if not public.is_internal_admin() then
    raise exception using errcode = '42501', message = 'ADMIN_REQUIRED';
  end if;
  select jsonb_build_object(
    'pending_verifications', (select count(*)::int from public.verification_requests where status = 'pending'),
    'rejected_unread', (select count(*)::int from public.verification_requests where status = 'rejected' and coalesce(user_notified, false) = false),
    'open_reports', (select count(*)::int from public.reports where upper(coalesce(status, 'PENDING')) in ('PENDING', 'REVIEWING')),
    'open_profile_guard_reviews', (select count(*)::int from public.profile_moderation_events where decision = 'HUMAN_REVIEW' and reviewed_at is null),
    'active_subscriptions', (select count(*)::int from public.subscriptions where is_active = true),
    'silver_active', (select count(*)::int from public.subscriptions where is_active = true and type = 'SILVER'),
    'gold_active', (select count(*)::int from public.subscriptions where is_active = true and type = 'GOLD'),
    'members_total', (select count(*)::int from public.profiles where deleted_at is null),
    'members_last_7d', (select count(*)::int from public.profiles where deleted_at is null and created_at >= timezone('utc', now()) - interval '7 days')
  ) into result;
  return coalesce(result, '{}'::jsonb);
end;
$$;
revoke all on function public.rpc_admin_dashboard_overview() from public, anon;
grant execute on function public.rpc_admin_dashboard_overview() to authenticated, service_role;

commit;
