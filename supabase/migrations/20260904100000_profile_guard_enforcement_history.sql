-- Admin visibility for deterministic Profile Guard enforcement.
-- Keeps automatic blocks separate from the actionable HUMAN_REVIEW queue and
-- captures immutable submitted evidence for future deterministic decisions.

begin;

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
  and event_row.decision in ('REQUIRE_REWRITE', 'RESTRICT_PROFILE')
  and event_row.evidence_snapshot = '{}'::jsonb;

create or replace function public.rpc_service_update_profile_with_guard_v3(
  p_user_id uuid,
  p_updates jsonb,
  p_expected_updated_at timestamptz,
  p_evidence_snapshot jsonb
)
returns jsonb
language plpgsql security definer
set search_path = public, pg_catalog, auth
as $$
declare
  v_result jsonb;
  v_evidence jsonb := jsonb_strip_nulls(coalesce(p_evidence_snapshot, '{}'::jsonb));
begin
  if auth.role() <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if jsonb_typeof(v_evidence) <> 'object'
     or exists (
       select 1 from jsonb_object_keys(v_evidence) key_name
       where key_name not in ('profile_updates')
     )
     or (v_evidence ? 'profile_updates'
       and jsonb_typeof(v_evidence->'profile_updates') <> 'object')
     or pg_column_size(v_evidence) > 32768 then
    raise exception using errcode = '22023', message = 'INVALID_GUARD_EVIDENCE';
  end if;

  v_result := public.rpc_service_update_profile_with_guard_v2(
    p_user_id, p_updates, p_expected_updated_at
  );

  if coalesce((v_result->>'ok')::boolean, false) = false then
    update public.profile_moderation_events event_row
    set evidence_snapshot = v_evidence,
        metadata = event_row.metadata || jsonb_build_object(
          'evidence_capture', 'submitted_guarded_fields'
        )
    where event_row.id = (
      select candidate.id
      from public.profile_moderation_events candidate
      where candidate.user_id = p_user_id
        and candidate.source = 'profile_write'
        and candidate.decision in ('REQUIRE_REWRITE', 'RESTRICT_PROFILE')
        and candidate.evidence_snapshot = '{}'::jsonb
      order by candidate.created_at desc
      limit 1
    );
  end if;

  return v_result;
end;
$$;
revoke all on function public.rpc_service_update_profile_with_guard_v3(
  uuid, jsonb, timestamptz, jsonb
) from public, anon, authenticated;
grant execute on function public.rpc_service_update_profile_with_guard_v3(
  uuid, jsonb, timestamptz, jsonb
) to service_role;

create or replace function public.rpc_service_insert_profile_prompt_with_guard_v3(
  p_user_id uuid,
  p_expected_updated_at timestamptz,
  p_prompt_key text,
  p_prompt_title text,
  p_answer text,
  p_prompt_type text default 'standard',
  p_guess_mode text default null,
  p_guess_options jsonb default null,
  p_hint_text text default null,
  p_reveal_policy text default 'never',
  p_evidence_snapshot jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql security definer
set search_path = public, pg_catalog, auth
as $$
declare
  v_result jsonb;
  v_evidence jsonb := jsonb_strip_nulls(coalesce(p_evidence_snapshot, '{}'::jsonb));
begin
  if auth.role() <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if jsonb_typeof(v_evidence) <> 'object'
     or exists (
       select 1 from jsonb_object_keys(v_evidence) key_name
       where key_name not in ('prompt_update')
     )
     or (v_evidence ? 'prompt_update'
       and jsonb_typeof(v_evidence->'prompt_update') <> 'object')
     or pg_column_size(v_evidence) > 32768 then
    raise exception using errcode = '22023', message = 'INVALID_GUARD_EVIDENCE';
  end if;

  v_result := public.rpc_service_insert_profile_prompt_with_guard_v2(
    p_user_id, p_expected_updated_at, p_prompt_key, p_prompt_title, p_answer,
    p_prompt_type, p_guess_mode, p_guess_options, p_hint_text, p_reveal_policy
  );

  if coalesce((v_result->>'ok')::boolean, false) = false then
    update public.profile_moderation_events event_row
    set evidence_snapshot = v_evidence,
        metadata = event_row.metadata || jsonb_build_object(
          'evidence_capture', 'submitted_guarded_fields'
        )
    where event_row.id = (
      select candidate.id
      from public.profile_moderation_events candidate
      where candidate.user_id = p_user_id
        and candidate.source = 'profile_write'
        and 'profile_prompt' = any(candidate.field_names)
        and candidate.decision in ('REQUIRE_REWRITE', 'RESTRICT_PROFILE')
        and candidate.evidence_snapshot = '{}'::jsonb
      order by candidate.created_at desc
      limit 1
    );
  end if;

  return v_result;
end;
$$;
revoke all on function public.rpc_service_insert_profile_prompt_with_guard_v3(
  uuid, timestamptz, text, text, text, text, text, jsonb, text, text, jsonb
) from public, anon, authenticated;
grant execute on function public.rpc_service_insert_profile_prompt_with_guard_v3(
  uuid, timestamptz, text, text, text, text, text, jsonb, text, text, jsonb
) to service_role;

create or replace function public.rpc_admin_get_profile_guard_enforcement_history(
  p_limit integer default 100
)
returns table(
  event_id uuid,
  profile_id uuid,
  user_id uuid,
  full_name text,
  avatar_url text,
  current_profile_text jsonb,
  evidence_snapshot jsonb,
  field_names text[],
  categories text[],
  risk_score numeric,
  decision text,
  source text,
  detector_version text,
  semantic_used boolean,
  targeted_enforcement boolean,
  profile_moderation_state text,
  discoverable_in_vibes boolean,
  enforcement_count integer,
  first_enforced_at timestamptz,
  last_enforced_at timestamptz,
  resolved_at timestamptz
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
  with ranked as (
    select
      event_row.*,
      row_number() over (
        partition by event_row.profile_id order by event_row.created_at desc, event_row.id desc
      ) as profile_rank,
      count(*) over (partition by event_row.profile_id)::integer as incident_count,
      min(event_row.created_at) over (partition by event_row.profile_id) as first_seen_at,
      max(event_row.created_at) over (partition by event_row.profile_id) as last_seen_at
    from public.profile_moderation_events event_row
    where event_row.decision in ('REQUIRE_REWRITE', 'RESTRICT_PROFILE')
  )
  select
    ranked.id,
    ranked.profile_id,
    ranked.user_id,
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
    ranked.evidence_snapshot,
    ranked.field_names,
    ranked.categories,
    ranked.risk_score,
    ranked.decision,
    ranked.source,
    ranked.detector_version,
    coalesce((ranked.metadata->>'semantic_used')::boolean, false),
    coalesce((ranked.metadata->>'targeted_enforcement')::boolean, false),
    profile.profile_moderation_state,
    profile.discoverable_in_vibes,
    ranked.incident_count,
    ranked.first_seen_at,
    ranked.last_seen_at,
    ranked.resolved_at
  from ranked
  join public.profiles profile on profile.id = ranked.profile_id
  where ranked.profile_rank = 1
  order by ranked.last_seen_at desc
  limit p_limit;
end;
$$;
revoke all on function public.rpc_admin_get_profile_guard_enforcement_history(integer)
from public, anon;
grant execute on function public.rpc_admin_get_profile_guard_enforcement_history(integer)
to authenticated;

commit;
