-- Atomic, service-owned onboarding completion. External moderation runs in the
-- Edge Function first; this transaction re-runs the authoritative deterministic
-- Guard, writes the allowlisted profile fields, and finalizes identity together.

create or replace function public.rpc_service_complete_profile_onboarding_with_guard_v1(
  p_user_id uuid,
  p_updates jsonb,
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
  v_result jsonb;
begin
  if auth.role() <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_user_id is null
     or jsonb_typeof(coalesce(p_updates, 'null'::jsonb)) <> 'object' then
    raise exception using errcode = '22023', message = 'INVALID_ONBOARDING_SUBMISSION';
  end if;

  select * into v_profile
  from public.profiles
  where user_id = p_user_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'PROFILE_NOT_FOUND';
  end if;

  -- A lost response can be retried safely. Once completion committed, this
  -- endpoint never applies a second payload or reopens onboarding fields.
  if coalesce(v_profile.profile_completed, false) then
    return jsonb_build_object(
      'ok', true,
      'completed', true,
      'already_completed', true,
      'updated_at', v_profile.updated_at
    );
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
    return v_result || jsonb_build_object('completed', false);
  end if;

  select * into v_profile
  from public.profiles
  where user_id = p_user_id
  for update;

  if v_profile.profile_moderation_state <> 'CLEAR' then
    raise exception using errcode = '42501', message = 'PROFILE_REVIEW_REQUIRED';
  end if;
  if not coalesce(v_profile.phone_verified, false)
     or nullif(btrim(coalesce(v_profile.phone_number, '')), '') is null
     or nullif(btrim(coalesce(v_profile.full_name, '')), '') is null
     or nullif(btrim(coalesce(v_profile.bio, '')), '') is null
     or v_profile.age is null
     or v_profile.gender is null then
    raise exception using errcode = '42501', message = 'ONBOARDING_REQUIREMENTS_NOT_MET';
  end if;

  perform set_config('app.profile_guard_write', 'on', true);
  perform set_config('app.server_managed_update', 'on', true);
  update public.profiles
  set profile_completed = true,
      identity_status = 'active',
      onboarding_completed_at = coalesce(
        onboarding_completed_at,
        timezone('utc', now())
      ),
      identity_finalized_at = coalesce(
        identity_finalized_at,
        timezone('utc', now())
      ),
      updated_at = timezone('utc', now())
  where id = v_profile.id
  returning * into v_profile;

  if not coalesce(v_profile.profile_completed, false)
     or v_profile.identity_status <> 'active' then
    raise exception using errcode = '42501', message = 'ONBOARDING_REQUIREMENTS_NOT_MET';
  end if;

  return jsonb_build_object(
    'ok', true,
    'completed', true,
    'already_completed', false,
    'updated_at', v_profile.updated_at
  );
end;
$$;

revoke all on function public.rpc_service_complete_profile_onboarding_with_guard_v1(
  uuid, jsonb, timestamptz, jsonb
) from public, anon, authenticated;
grant execute on function public.rpc_service_complete_profile_onboarding_with_guard_v1(
  uuid, jsonb, timestamptz, jsonb
) to service_role;

comment on function public.rpc_service_complete_profile_onboarding_with_guard_v1(
  uuid, jsonb, timestamptz, jsonb
) is 'Atomically applies a guarded first-time profile submission and finalizes onboarding; service role only.';
