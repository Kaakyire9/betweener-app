-- Extend server-owned country integrity to every completed onboarding route.
-- Ghana +233 profiles retain the stricter two-observation travel workflow;
-- Global profiles require one accepted precise observation to change country.

alter table public.profiles
  drop constraint if exists profiles_country_lock_policy_check;

alter table public.profiles
  add constraint profiles_country_lock_policy_check
  check (
    country_lock_policy in (
      'none',
      'ghana_locked',
      'ghana_verification_pending_abroad',
      'ghana_unlocked_precise_abroad',
      'global_locked',
      'global_verified_precise'
    )
  );
create or replace function public.apply_profile_country_lock_policy(p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_profile public.profiles%rowtype;
  v_phone_digits text;
  v_is_verified_ghana_route boolean := false;
  v_is_completed_global_route boolean := false;
  v_next_policy text;
begin
  if p_profile_id is null then
    return;
  end if;

  select profile.* into v_profile
  from public.profiles as profile
  where profile.id = p_profile_id
  limit 1;

  if v_profile.id is null then
    return;
  end if;

  v_phone_digits := regexp_replace(coalesce(v_profile.phone_number, ''), '\D', '', 'g');
  v_is_verified_ghana_route :=
    lower(btrim(coalesce(v_profile.onboarding_variant, ''))) = 'ghana'
    and coalesce(v_profile.phone_verified, false)
    and v_phone_digits like '233%';
  v_is_completed_global_route :=
    lower(btrim(coalesce(v_profile.onboarding_variant, ''))) = 'global'
    and (
      coalesce(v_profile.profile_completed, false)
      or v_profile.onboarding_completed_at is not null
    )
    and coalesce(v_profile.current_country_code, '') ~ '^[A-Z]{2}$';

  v_next_policy := case
    when v_profile.country_lock_policy in (
      'ghana_locked',
      'ghana_verification_pending_abroad',
      'ghana_unlocked_precise_abroad',
      'global_locked',
      'global_verified_precise'
    ) then v_profile.country_lock_policy
    when v_is_verified_ghana_route then 'ghana_locked'
    when v_is_completed_global_route then 'global_locked'
    else 'none'
  end;

  perform set_config('app.server_managed_update', 'on', true);
  update public.profiles as profile
  set country_lock_policy = v_next_policy,
      current_country = case
        when v_next_policy = 'ghana_locked' then 'Ghana'
        else profile.current_country
      end,
      current_country_code = case
        when v_next_policy = 'ghana_locked' then 'GH'
        else profile.current_country_code
      end,
      origin_country = case
        when v_is_verified_ghana_route or v_next_policy like 'ghana_%' then 'Ghana'
        else profile.origin_country
      end,
      origin_country_code = case
        when v_is_verified_ghana_route or v_next_policy like 'ghana_%' then 'GH'
        else profile.origin_country_code
      end,
      origin_country_source = case
        when v_is_verified_ghana_route or v_next_policy like 'ghana_%' then 'explicit'
        else profile.origin_country_source
      end,
      updated_at = timezone('utc', now())
  where profile.id = p_profile_id
    and (
      profile.country_lock_policy is distinct from v_next_policy
      or (v_next_policy = 'ghana_locked' and profile.current_country is distinct from 'Ghana')
      or (v_next_policy = 'ghana_locked' and coalesce(profile.current_country_code, '') <> 'GH')
      or (
        (v_is_verified_ghana_route or v_next_policy like 'ghana_%')
        and (
          profile.origin_country is distinct from 'Ghana'
          or coalesce(profile.origin_country_code, '') <> 'GH'
          or coalesce(profile.origin_country_source, '') <> 'explicit'
        )
      )
    );
end;
$$;

revoke all on function public.apply_profile_country_lock_policy(uuid) from public, anon, authenticated;
grant execute on function public.apply_profile_country_lock_policy(uuid) to service_role;

create or replace function public.profiles_guard_sensitive_fields()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_country_lock_policy text := coalesce(old.country_lock_policy, 'none');
  v_phone_digits text := regexp_replace(coalesce(new.phone_number, old.phone_number, ''), '\D', '', 'g');
  v_verified_ghana_route boolean :=
    lower(btrim(coalesce(old.onboarding_variant, new.onboarding_variant, ''))) = 'ghana'
    and coalesce(old.phone_verified, new.phone_verified, false)
    and v_phone_digits like '233%';
  v_ghana_experience boolean :=
    lower(btrim(coalesce(old.onboarding_variant, new.onboarding_variant, ''))) = 'ghana'
    or v_country_lock_policy like 'ghana_%';
begin
  if auth.uid() is null
    or coalesce(auth.role(), '') in ('service_role', 'supabase_admin')
    or coalesce(current_setting('app.server_managed_update', true), '') = 'on' then
    return new;
  end if;

  if new.country_lock_policy is distinct from old.country_lock_policy then
    raise exception 'country_lock_policy is server-managed';
  end if;
  if new.country_verification_target_code is distinct from old.country_verification_target_code
    or new.country_verification_started_at is distinct from old.country_verification_started_at
    or new.country_verified_at is distinct from old.country_verified_at then
    raise exception 'country verification state is server-managed';
  end if;
  if old.onboarding_variant is not null
    and new.onboarding_variant is distinct from old.onboarding_variant then
    raise exception 'onboarding_variant is immutable after selection';
  end if;
  if old.onboarding_completed_at is not null
    and new.onboarding_variant is distinct from old.onboarding_variant then
    raise exception 'onboarding_variant is immutable after completion';
  end if;
  if new.verification_level is distinct from old.verification_level then
    raise exception 'verification_level is server-managed';
  end if;
  if new.phone_verified is distinct from old.phone_verified then
    raise exception 'phone_verified is server-managed';
  end if;
  if new.phone_verification_score is distinct from old.phone_verification_score then
    raise exception 'phone_verification_score is server-managed';
  end if;
  if new.superlikes_left is distinct from old.superlikes_left then
    raise exception 'superlikes_left is server-managed';
  end if;
  if new.superlikes_reset_at is distinct from old.superlikes_reset_at then
    raise exception 'superlikes_reset_at is server-managed';
  end if;
  if new.ai_score is distinct from old.ai_score then
    raise exception 'ai_score is server-managed';
  end if;
  if new.ai_score_updated_at is distinct from old.ai_score_updated_at then
    raise exception 'ai_score_updated_at is server-managed';
  end if;

  if v_verified_ghana_route or v_country_lock_policy = 'ghana_locked' then
    if new.current_country is distinct from 'Ghana'
      or coalesce(new.current_country_code, '') <> 'GH' then
      raise exception 'ghana_onboarding_current_country_locked' using errcode = '42501';
    end if;
  elsif v_country_lock_policy in (
    'ghana_verification_pending_abroad',
    'ghana_unlocked_precise_abroad',
    'global_locked',
    'global_verified_precise'
  ) then
    if new.current_country is distinct from old.current_country
      or new.current_country_code is distinct from old.current_country_code then
      raise exception 'verified_current_country_server_managed' using errcode = '42501';
    end if;
  end if;

  if v_ghana_experience then
    if new.origin_country is distinct from 'Ghana'
      or coalesce(new.origin_country_code, '') <> 'GH' then
      raise exception 'ghana_onboarding_origin_country_locked' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.profiles_guard_sensitive_fields() from public, anon, authenticated;

drop trigger if exists apply_profile_country_lock_policy on public.profiles;
create trigger apply_profile_country_lock_policy
after insert or update of
  onboarding_variant,
  onboarding_completed_at,
  profile_completed,
  phone_number,
  phone_verified,
  current_country,
  current_country_code,
  origin_country,
  origin_country_code
on public.profiles
for each row execute function public.trg_apply_profile_country_lock_policy();

create or replace function public.record_profile_country_verification_observation(
  p_user_id uuid,
  p_latitude double precision,
  p_longitude double precision,
  p_accuracy_meters double precision,
  p_mocked boolean,
  p_country_code text,
  p_country_name text,
  p_city text default null,
  p_region text default null,
  p_provider text default 'nominatim',
  p_device_integrity text default 'unavailable'
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_profile public.profiles%rowtype;
  v_private_location public.profile_private_locations%rowtype;
  v_now timestamptz := timezone('utc', now());
  v_country_code text := upper(btrim(coalesce(p_country_code, '')));
  v_country_name text := nullif(btrim(coalesce(p_country_name, '')), '');
  v_city text := nullif(btrim(coalesce(p_city, '')), '');
  v_region text := nullif(btrim(coalesce(p_region, '')), '');
  v_provider text := lower(btrim(coalesce(p_provider, 'nominatim')));
  v_device_integrity text := lower(btrim(coalesce(p_device_integrity, 'unavailable')));
  v_accuracy double precision;
  v_rejection_reason text;
  v_observation_id uuid;
  v_window_started_at timestamptz;
  v_first_accepted_at timestamptz;
  v_previous_accepted_at timestamptz;
  v_accepted_count integer := 0;
  v_is_ghana_managed boolean := false;
  v_next_policy text;
  v_location text;
  v_recent_attempts integer := 0;
begin
  if p_user_id is null then
    raise exception 'User is required' using errcode = '22023';
  end if;
  if p_latitude is null or p_latitude not between -90 and 90
    or p_longitude is null or p_longitude not between -180 and 180 then
    raise exception 'Invalid coordinates' using errcode = '22023';
  end if;
  if v_country_code !~ '^[A-Z]{2}$' then
    raise exception 'A valid reverse-geocoded country code is required' using errcode = '22023';
  end if;

  select profile.* into v_profile
  from public.profiles as profile
  where profile.user_id = p_user_id and profile.deleted_at is null
  limit 1;
  if v_profile.id is null then
    raise exception 'Profile not found' using errcode = 'P0002';
  end if;

  perform public.apply_profile_country_lock_policy(v_profile.id);
  select profile.* into v_profile from public.profiles as profile where profile.id = v_profile.id;
  if v_profile.country_lock_policy = 'none' then
    return jsonb_build_object(
      'ok', false,
      'status', 'not_managed',
      'message', 'Complete onboarding before verifying your current country.'
    );
  end if;

  v_is_ghana_managed := v_profile.country_lock_policy like 'ghana_%';

  select private_location.* into v_private_location
  from public.profile_private_locations as private_location
  where private_location.profile_id = v_profile.id
    and private_location.updated_at >= v_now - interval '10 minutes'
    and abs(private_location.latitude - p_latitude) < 0.000001
    and abs(private_location.longitude - p_longitude) < 0.000001
  limit 1;

  select count(*)::integer into v_recent_attempts
  from private.profile_country_verification_observations as observation
  where observation.profile_id = v_profile.id
    and observation.observed_at >= v_now - interval '1 hour';
  if v_recent_attempts >= 8 then
    return jsonb_build_object('ok', false, 'status', 'rejected', 'reason', 'rate_limited', 'message', 'Too many location checks. Please try again later.');
  end if;

  v_accuracy := v_private_location.accuracy_meters;
  v_rejection_reason := case
    when v_private_location.profile_id is null then 'precise_location_not_server_confirmed'
    when coalesce(p_mocked, false) then 'mocked_location_detected'
    when v_device_integrity = 'failed' then 'device_integrity_failed'
    when v_accuracy is null then 'accuracy_missing'
    when v_accuracy > 150 then 'accuracy_too_low'
    when p_accuracy_meters is not null and abs(p_accuracy_meters - v_accuracy) > 1 then 'accuracy_mismatch'
    when v_provider <> 'nominatim' then 'untrusted_reverse_geocoder'
    else null
  end;

  insert into private.profile_country_verification_observations (
    profile_id, user_id, country_code, country_name, city, region,
    latitude, longitude, accuracy_meters, mocked, device_integrity,
    provider, accepted, rejection_reason, observed_at, metadata
  ) values (
    v_profile.id, p_user_id, v_country_code, v_country_name, v_city, v_region,
    p_latitude, p_longitude, v_accuracy, coalesce(p_mocked, false), v_device_integrity,
    v_provider, v_rejection_reason is null, v_rejection_reason, v_now,
    jsonb_build_object('accuracy_source', 'profile_private_locations')
  ) returning id into v_observation_id;

  if v_rejection_reason is not null then
    return jsonb_build_object(
      'ok', false,
      'status', 'rejected',
      'reason', v_rejection_reason,
      'message', case v_rejection_reason
        when 'mocked_location_detected' then 'A simulated location cannot verify a country change.'
        when 'accuracy_too_low' then 'Location accuracy is too low. Move outdoors and try again.'
        when 'accuracy_missing' then 'Location accuracy could not be verified. Please try again outdoors.'
        else 'This location check could not be verified.'
      end
    );
  end if;

  v_location := concat_ws(', ', v_city, v_region, v_country_name);

  if v_country_code = upper(coalesce(v_profile.current_country_code, '')) then
    v_next_policy := case
      when v_is_ghana_managed and v_country_code = 'GH' then 'ghana_locked'
      when v_is_ghana_managed then 'ghana_unlocked_precise_abroad'
      else 'global_verified_precise'
    end;
    perform set_config('app.server_managed_update', 'on', true);
    update public.profiles as profile
    set country_lock_policy = v_next_policy,
        country_verification_target_code = null,
        country_verification_started_at = null,
        country_verified_at = v_now,
        city = coalesce(v_city, profile.city),
        region = coalesce(v_region, profile.region),
        location = coalesce(nullif(v_location, ''), profile.location),
        location_precision = 'EXACT',
        origin_country = case when v_is_ghana_managed then 'Ghana' else profile.origin_country end,
        origin_country_code = case when v_is_ghana_managed then 'GH' else profile.origin_country_code end,
        origin_country_source = case when v_is_ghana_managed then 'explicit' else profile.origin_country_source end,
        location_updated_at = v_now,
        updated_at = v_now
    where profile.id = v_profile.id;
    return jsonb_build_object('ok', true, 'status', 'confirmed_current', 'country_code', v_country_code, 'country_name', v_country_name, 'message', 'Your verified current country has been refreshed.');
  end if;

  -- Global profiles move after one accepted precise observation.
  if not v_is_ghana_managed then
    perform set_config('app.server_managed_update', 'on', true);
    update public.profiles as profile
    set country_lock_policy = 'global_verified_precise',
        current_country = coalesce(v_country_name, profile.current_country),
        current_country_code = v_country_code,
        city = v_city,
        region = v_region,
        location = nullif(v_location, ''),
        location_precision = 'EXACT',
        country_verification_target_code = null,
        country_verification_started_at = null,
        country_verified_at = v_now,
        locality_geoname_id = null,
        locality_district = null,
        locality_admin1_code = null,
        locality_provider = null,
        location_updated_at = v_now,
        updated_at = v_now
    where profile.id = v_profile.id;
    return jsonb_build_object('ok', true, 'status', 'verified', 'country_code', v_country_code, 'country_name', v_country_name, 'observations', 1, 'verified_at', v_now, 'message', 'Your current country has been securely verified and updated.');
  end if;

  if v_profile.country_verification_target_code is distinct from v_country_code
    or v_profile.country_verification_started_at is null
    or v_profile.country_verification_started_at < v_now - interval '7 days' then
    v_window_started_at := v_now;
  else
    v_window_started_at := v_profile.country_verification_started_at;
  end if;

  select min(observation.observed_at), count(*)::integer
  into v_first_accepted_at, v_accepted_count
  from private.profile_country_verification_observations as observation
  where observation.profile_id = v_profile.id
    and observation.accepted
    and observation.country_code = v_country_code
    and observation.observed_at >= v_window_started_at;

  select max(observation.observed_at) into v_previous_accepted_at
  from private.profile_country_verification_observations as observation
  where observation.profile_id = v_profile.id
    and observation.accepted
    and observation.country_code = v_country_code
    and observation.id <> v_observation_id
    and observation.observed_at >= v_window_started_at
    and observation.observed_at <= v_now - interval '6 hours';

  if v_previous_accepted_at is not null then
    v_next_policy := case when v_country_code = 'GH' then 'ghana_locked' else 'ghana_unlocked_precise_abroad' end;
    perform set_config('app.server_managed_update', 'on', true);
    update public.profiles as profile
    set country_lock_policy = v_next_policy,
        current_country = case when v_country_code = 'GH' then 'Ghana' else coalesce(v_country_name, profile.current_country) end,
        current_country_code = v_country_code,
        city = v_city,
        region = v_region,
        location = nullif(v_location, ''),
        location_precision = 'EXACT',
        origin_country = 'Ghana',
        origin_country_code = 'GH',
        origin_country_source = 'explicit',
        country_verification_target_code = null,
        country_verification_started_at = null,
        country_verified_at = v_now,
        locality_geoname_id = null,
        locality_district = null,
        locality_admin1_code = null,
        locality_provider = null,
        location_updated_at = v_now,
        updated_at = v_now
    where profile.id = v_profile.id;
    return jsonb_build_object('ok', true, 'status', 'verified', 'country_code', v_country_code, 'country_name', v_country_name, 'observations', v_accepted_count, 'verified_at', v_now, 'message', 'Your current country has been securely verified and updated.');
  end if;

  perform set_config('app.server_managed_update', 'on', true);
  update public.profiles as profile
  set country_lock_policy = 'ghana_verification_pending_abroad',
      country_verification_target_code = v_country_code,
      country_verification_started_at = v_window_started_at,
      origin_country = 'Ghana',
      origin_country_code = 'GH',
      origin_country_source = 'explicit',
      updated_at = v_now
  where profile.id = v_profile.id;
  return jsonb_build_object('ok', true, 'status', 'pending', 'country_code', v_country_code, 'country_name', v_country_name, 'observations', v_accepted_count, 'observations_required', 2, 'next_eligible_at', v_first_accepted_at + interval '6 hours', 'message', 'First location check confirmed. Check again after six hours to verify your move.');
end;
$$;

revoke all on function public.record_profile_country_verification_observation(
  uuid, double precision, double precision, double precision, boolean,
  text, text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.record_profile_country_verification_observation(
  uuid, double precision, double precision, double precision, boolean,
  text, text, text, text, text, text
) to service_role;

create or replace function public.get_my_country_verification_status()
returns jsonb
language sql
stable
security definer
set search_path = public, private, pg_catalog
as $$
  select jsonb_build_object(
    'policy', profile.country_lock_policy,
    'status', case
      when profile.country_lock_policy = 'ghana_verification_pending_abroad' then 'pending'
      when profile.country_lock_policy in ('ghana_unlocked_precise_abroad', 'global_verified_precise') then 'verified'
      when profile.country_lock_policy in ('ghana_locked', 'global_locked') then 'locked'
      else 'not_managed'
    end,
    'current_country', profile.current_country,
    'current_country_code', profile.current_country_code,
    'target_country_code', profile.country_verification_target_code,
    'started_at', profile.country_verification_started_at,
    'next_eligible_at', case
      when profile.country_lock_policy = 'ghana_verification_pending_abroad'
        and profile.country_verification_started_at is not null
        then profile.country_verification_started_at + interval '6 hours'
      else null
    end,
    'verified_at', profile.country_verified_at
  )
  from public.profiles as profile
  where profile.user_id = auth.uid()
    and profile.deleted_at is null
  limit 1;
$$;

revoke all on function public.get_my_country_verification_status() from public, anon;
grant execute on function public.get_my_country_verification_status() to authenticated, service_role;

-- Enrol existing completed routes. Ghana preserves its stricter +233 criteria;
-- Global profiles become managed without changing their stored country.
select public.apply_profile_country_lock_policy(profile.id)
from public.profiles as profile
where profile.deleted_at is null
  and (
    profile.country_lock_policy <> 'none'
    or (
      lower(btrim(coalesce(profile.onboarding_variant, ''))) = 'ghana'
      and coalesce(profile.phone_verified, false)
      and regexp_replace(coalesce(profile.phone_number, ''), '\D', '', 'g') like '233%'
    )
    or (
      lower(btrim(coalesce(profile.onboarding_variant, ''))) = 'global'
      and (coalesce(profile.profile_completed, false) or profile.onboarding_completed_at is not null)
      and coalesce(profile.current_country_code, '') ~ '^[A-Z]{2}$'
    )
  );
