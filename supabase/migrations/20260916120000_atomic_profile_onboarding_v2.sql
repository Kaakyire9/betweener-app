-- Additive v1.2 onboarding contract. The legacy v1 RPC remains unchanged for
-- released clients. This transaction owns profile fields, interests, and the
-- final completion receipt so the app never observes a partial completion.

create table if not exists public.profile_onboarding_completion_receipts_v2 (
  user_id uuid primary key references auth.users(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  completion_request_id uuid not null unique,
  onboarding_variant text not null check (onboarding_variant in ('global', 'ghana')),
  interest_ids uuid[] not null,
  committed_at timestamptz not null default timezone('utc', now())
);

alter table public.profile_onboarding_completion_receipts_v2 enable row level security;
revoke all on table public.profile_onboarding_completion_receipts_v2
  from public, anon, authenticated;
grant select, insert on table public.profile_onboarding_completion_receipts_v2
  to service_role;

create or replace function public.rpc_service_complete_profile_onboarding_v2(
  p_user_id uuid,
  p_updates jsonb,
  p_interest_names text[],
  p_completion_request_id uuid,
  p_expected_updated_at timestamptz,
  p_evidence_snapshot jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog, auth
as $$
declare
  v_profile public.profiles%rowtype;
  v_receipt public.profile_onboarding_completion_receipts_v2%rowtype;
  v_result jsonb;
  v_interest_names text[];
  v_interest_ids uuid[];
  v_interest_count integer := 0;
  v_missing_fields text[];
  v_variant text;
begin
  if auth.role() <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_user_id is null
     or p_completion_request_id is null
     or jsonb_typeof(coalesce(p_updates, 'null'::jsonb)) <> 'object' then
    raise exception using errcode = '22023', message = 'INVALID_ONBOARDING_SUBMISSION';
  end if;

  select coalesce(array_agg(distinct lower(btrim(value)) order by lower(btrim(value))), '{}'::text[])
    into v_interest_names
  from unnest(coalesce(p_interest_names, '{}'::text[])) as interest_name(value)
  where nullif(btrim(value), '') is not null;

  if cardinality(v_interest_names) < 3 or cardinality(v_interest_names) > 5
     or cardinality(v_interest_names) <> cardinality(coalesce(p_interest_names, '{}'::text[])) then
    raise exception using errcode = '22023', message = 'ONBOARDING_INTERESTS_INVALID';
  end if;

  select coalesce(array_agg(candidate.id order by candidate.normalized_name), '{}'::uuid[]),
         count(*)::integer
    into v_interest_ids, v_interest_count
  from (
    select distinct on (lower(btrim(interest.name)))
      interest.id,
      lower(btrim(interest.name)) as normalized_name
    from public.interests interest
    where lower(btrim(interest.name)) = any(v_interest_names)
    order by lower(btrim(interest.name)), interest.id
  ) candidate;

  if v_interest_count <> cardinality(v_interest_names) then
    raise exception using errcode = '22023', message = 'ONBOARDING_INTEREST_CATALOG_MISMATCH';
  end if;

  select * into v_profile
  from public.profiles
  where user_id = p_user_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'PROFILE_NOT_FOUND';
  end if;

  select * into v_receipt
  from public.profile_onboarding_completion_receipts_v2
  where user_id = p_user_id;

  if found then
    if v_receipt.completion_request_id <> p_completion_request_id then
      raise exception using errcode = 'P0001', message = 'ONBOARDING_ALREADY_COMPLETED';
    end if;
    return jsonb_build_object(
      'ok', true,
      'committed', true,
      'already_completed', true,
      'completion_request_id', v_receipt.completion_request_id,
      'updated_at', v_profile.updated_at
    );
  end if;

  if coalesce(v_profile.profile_completed, false) then
    raise exception using errcode = 'P0001', message = 'ONBOARDING_ALREADY_COMPLETED';
  end if;
  if p_expected_updated_at is null
     or v_profile.updated_at is distinct from p_expected_updated_at then
    raise exception using errcode = '40001', message = 'PROFILE_WRITE_CONFLICT';
  end if;

  v_result := public.rpc_service_update_profile_with_guard_v3(
    p_user_id,
    p_updates,
    p_expected_updated_at,
    p_evidence_snapshot
  );
  if not coalesce((v_result->>'ok')::boolean, false) then
    return v_result || jsonb_build_object('committed', false);
  end if;

  select * into v_profile
  from public.profiles
  where user_id = p_user_id
  for update;

  v_variant := lower(btrim(coalesce(v_profile.onboarding_variant, '')));
  v_missing_fields := array_remove(array[
    case when v_profile.profile_moderation_state <> 'CLEAR' then 'profile' end,
    case when not coalesce(v_profile.phone_verified, false)
      or nullif(btrim(coalesce(v_profile.phone_number, '')), '') is null then 'phone_number' end,
    case when nullif(btrim(coalesce(v_profile.full_name, '')), '') is null then 'full_name' end,
    case when nullif(btrim(coalesce(v_profile.bio, '')), '') is null then 'bio' end,
    case when v_profile.age is null or v_profile.age < 18 or v_profile.age > 99 then 'age' end,
    case when v_profile.gender is null then 'gender' end,
    case when nullif(btrim(coalesce(v_profile.occupation, '')), '') is null then 'occupation' end,
    case when nullif(btrim(coalesce(v_profile.avatar_url, '')), '') is null then 'avatar_url' end,
    case when nullif(btrim(coalesce(v_profile.avatar_url, '')), '') is not null
      and not public.profile_media_reference_is_approved(
        p_user_id,
        v_profile.avatar_url
      ) then 'avatar_url' end,
    case when nullif(btrim(coalesce(v_profile.current_country, '')), '') is null then 'current_country' end,
    case when nullif(btrim(coalesce(v_profile.location, '')), '') is null then 'location' end,
    case when nullif(btrim(coalesce(v_profile.looking_for, '')), '') is null then 'looking_for' end,
    case when v_profile.min_age_interest is null or v_profile.min_age_interest < 18
      or v_profile.min_age_interest > 99 then 'min_age_interest' end,
    case when v_profile.max_age_interest is null or v_profile.max_age_interest < 18
      or v_profile.max_age_interest > 99
      or v_profile.max_age_interest < v_profile.min_age_interest then 'max_age_interest' end,
    case when v_variant not in ('global', 'ghana') then 'onboarding_variant' end
  ], null);

  if cardinality(v_missing_fields) > 0 then
    if v_profile.profile_moderation_state <> 'CLEAR' then
      return jsonb_build_object(
        'ok', false,
        'committed', false,
        'code', 'PROFILE_REVIEW_REQUIRED',
        'field_names', to_jsonb(v_missing_fields)
      );
    end if;

    -- An exception rolls back the guarded profile update above. Returning a
    -- normal error here would persist a partial profile without interests or
    -- a completion receipt, breaking the all-or-nothing V2 contract.
    raise exception using
      errcode = '22023',
      message = 'ONBOARDING_REQUIREMENTS_NOT_MET',
      detail = to_jsonb(v_missing_fields)::text;
  end if;

  delete from public.profile_interests
  where profile_id = v_profile.id;

  insert into public.profile_interests (profile_id, interest_id)
  select v_profile.id, interest_id
  from unnest(v_interest_ids) interest_id;

  perform set_config('app.profile_guard_write', 'on', true);
  perform set_config('app.server_managed_update', 'on', true);
  update public.profiles
  set profile_completed = true,
      identity_status = 'active',
      onboarding_completed_at = coalesce(onboarding_completed_at, timezone('utc', now())),
      identity_finalized_at = coalesce(identity_finalized_at, timezone('utc', now())),
      updated_at = timezone('utc', now())
  where id = v_profile.id
  returning * into v_profile;

  insert into public.profile_onboarding_completion_receipts_v2 (
    user_id,
    profile_id,
    completion_request_id,
    onboarding_variant,
    interest_ids
  ) values (
    p_user_id,
    v_profile.id,
    p_completion_request_id,
    v_variant,
    v_interest_ids
  );

  return jsonb_build_object(
    'ok', true,
    'committed', true,
    'already_completed', false,
    'completion_request_id', p_completion_request_id,
    'updated_at', v_profile.updated_at
  );
end;
$$;

revoke all on function public.rpc_service_complete_profile_onboarding_v2(
  uuid, jsonb, text[], uuid, timestamptz, jsonb
) from public, anon, authenticated;
grant execute on function public.rpc_service_complete_profile_onboarding_v2(
  uuid, jsonb, text[], uuid, timestamptz, jsonb
) to service_role;

comment on function public.rpc_service_complete_profile_onboarding_v2(
  uuid, jsonb, text[], uuid, timestamptz, jsonb
) is 'Atomically commits a guarded v1.2 profile, selected interests, identity finalization, and an idempotent completion receipt.';
