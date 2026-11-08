-- Fixed account-deletion masking through the existing trusted profile guard.
begin;

create function public.rpc_mask_account_deletion_profile(p_request_id uuid)
returns uuid
language plpgsql
security invoker
-- Existing profile triggers resolve public helpers and extensions.unaccent.
set search_path = pg_catalog, public, extensions, pg_temp
as $$
declare
  v_request public.account_deletion_requests;
  v_profile_id uuid;
  v_now timestamptz := clock_timestamp();
  v_previous_guard text := current_setting('app.profile_guard_write', true);
begin
  if current_user <> 'service_role'
     or coalesce(auth.jwt()->>'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'ACCOUNT_DELETION_SERVICE_REQUIRED';
  end if;

  select * into v_request
  from public.account_deletion_requests
  where id = p_request_id
  for update;
  if v_request.id is null or v_request.status not in ('requested', 'failed') then
    raise exception using errcode = '22023', message = 'ACCOUNT_DELETION_REQUEST_INVALID';
  end if;

  select id into v_profile_id
  from public.profiles
  where user_id = v_request.user_id
  for update;
  if v_profile_id is null then
    return null;
  end if;
  if v_request.profile_id is not null and v_request.profile_id <> v_profile_id then
    raise exception using errcode = '22023', message = 'ACCOUNT_DELETION_PROFILE_MISMATCH';
  end if;

  perform set_config('app.profile_guard_write', 'on', true);
  update public.profiles set
    deleted_at = coalesce(deleted_at, v_now),
    discoverable_in_vibes = false,
    is_active = false,
    online = false,
    account_state = 'deleted',
    paused_at = null,
    pause_reason = 'account_deleted',
    account_state_updated_at = v_now,
    profile_completed = false,
    updated_at = v_now,
    ai_score = null,
    ai_score_updated_at = null,
    avatar_url = null,
    bio = null,
    city = null,
    current_country = null,
    current_country_code = null,
    education = null,
    full_name = null,
    future_ghana_plans = null,
    gender = null,
    has_children = null,
    height = null,
    languages_spoken = null,
    last_active = null,
    last_ghana_visit = null,
    latitude = null,
    living_situation = null,
    location = null,
    location_updated_at = null,
    longitude = null,
    looking_for = null,
    love_language = null,
    matchmaking_mode = false,
    max_age_interest = null,
    min_age_interest = null,
    occupation = null,
    personality_type = null,
    pets = null,
    phone_number = null,
    phone_verification_score = null,
    phone_verified = false,
    photos = '{}'::text[],
    profile_video = null,
    public_key = null,
    region = null,
    religion = null,
    search_name = null,
    smoking = null,
    tribe = null,
    username = null,
    verification_level = 0,
    wants_children = null,
    years_in_diaspora = null
  where id = v_profile_id and user_id = v_request.user_id;
  perform set_config('app.profile_guard_write', coalesce(v_previous_guard, ''), true);

  update public.account_deletion_requests
  set profile_id = v_profile_id
  where id = v_request.id and profile_id is null;
  return v_profile_id;
end;
$$;

revoke all on function public.rpc_mask_account_deletion_profile(uuid) from public, anon, authenticated, service_role;
grant execute on function public.rpc_mask_account_deletion_profile(uuid) to service_role;
notify pgrst, 'reload schema';
commit;
