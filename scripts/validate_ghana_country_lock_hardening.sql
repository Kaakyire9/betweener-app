-- Run after 20260715110000_ghana_country_lock_hardening.sql inside a disposable
-- transaction. The caller owns BEGIN/ROLLBACK so this can also be composed
-- with the migration for a zero-persistence local validation.

insert into auth.users (id)
values
  ('53000000-0000-0000-0000-000000000001'::uuid),
  ('53000000-0000-0000-0000-000000000002'::uuid);

insert into public.profiles (
  id,
  user_id,
  onboarding_variant,
  phone_number,
  phone_verified,
  current_country,
  current_country_code,
  origin_country,
  origin_country_code,
  origin_country_source,
  city,
  region,
  location_precision
)
values
  (
    '53000000-0000-0000-0000-000000000101'::uuid,
    '53000000-0000-0000-0000-000000000001'::uuid,
    'ghana',
    '+233240000001',
    true,
    'United Kingdom',
    'GB',
    null,
    null,
    'unknown',
    'Bristol',
    'England',
    'CITY'
  ),
  (
    '53000000-0000-0000-0000-000000000102'::uuid,
    '53000000-0000-0000-0000-000000000002'::uuid,
    'ghana',
    '+447000000002',
    true,
    'United Kingdom',
    'GB',
    'Ghana',
    'GH',
    'explicit',
    'Manchester',
    'England',
    'CITY'
  );

do $$
declare
  v_locked public.profiles%rowtype;
  v_legacy public.profiles%rowtype;
begin
  select * into v_locked
  from public.profiles
  where id = '53000000-0000-0000-0000-000000000101'::uuid;

  if v_locked.country_lock_policy <> 'ghana_locked'
    or v_locked.current_country_code <> 'GH'
    or v_locked.origin_country_code <> 'GH' then
    raise exception 'verified +233 Ghana route was not locked correctly: %', row_to_json(v_locked);
  end if;

  select * into v_legacy
  from public.profiles
  where id = '53000000-0000-0000-0000-000000000102'::uuid;

  if v_legacy.country_lock_policy <> 'none'
    or v_legacy.current_country_code <> 'GB'
    or v_legacy.origin_country_code <> 'GH' then
    raise exception '+44 Ghana experience should retain an editable UK residence: %', row_to_json(v_legacy);
  end if;
end;
$$;

insert into public.profile_private_locations (
  profile_id,
  user_id,
  latitude,
  longitude,
  accuracy_meters,
  captured_at,
  updated_at
)
values (
  '53000000-0000-0000-0000-000000000101'::uuid,
  '53000000-0000-0000-0000-000000000001'::uuid,
  51.4545,
  -2.5879,
  24,
  timezone('utc', now()),
  timezone('utc', now())
);

select public.record_profile_country_verification_observation(
  '53000000-0000-0000-0000-000000000001'::uuid,
  51.4545,
  -2.5879,
  24,
  false,
  'GB',
  'United Kingdom',
  'Bristol',
  'England',
  'nominatim',
  'unavailable'
);

do $$
declare
  v_profile public.profiles%rowtype;
begin
  select * into v_profile
  from public.profiles
  where id = '53000000-0000-0000-0000-000000000101'::uuid;

  if v_profile.country_lock_policy <> 'ghana_verification_pending_abroad'
    or v_profile.country_verification_target_code <> 'GB'
    or v_profile.current_country_code <> 'GH' then
    raise exception 'first foreign observation did not create a safe pending state: %', row_to_json(v_profile);
  end if;
end;
$$;

update private.profile_country_verification_observations
set observed_at = timezone('utc', now()) - interval '7 hours'
where profile_id = '53000000-0000-0000-0000-000000000101'::uuid
  and country_code = 'GB'
  and accepted;

update public.profiles
set country_verification_started_at = timezone('utc', now()) - interval '7 hours'
where id = '53000000-0000-0000-0000-000000000101'::uuid;

select public.record_profile_country_verification_observation(
  '53000000-0000-0000-0000-000000000001'::uuid,
  51.4545,
  -2.5879,
  24,
  false,
  'GB',
  'United Kingdom',
  'Bristol',
  'England',
  'nominatim',
  'unavailable'
);

do $$
declare
  v_profile public.profiles%rowtype;
  v_guarded boolean := false;
begin
  select * into v_profile
  from public.profiles
  where id = '53000000-0000-0000-0000-000000000101'::uuid;

  if v_profile.country_lock_policy <> 'ghana_unlocked_precise_abroad'
    or v_profile.current_country_code <> 'GB'
    or v_profile.current_country <> 'United Kingdom'
    or v_profile.origin_country_code <> 'GH'
    or v_profile.country_verified_at is null then
    raise exception 'second spaced observation did not verify the move: %', row_to_json(v_profile);
  end if;

  perform set_config('app.server_managed_update', 'off', true);
  perform set_config('request.jwt.claim.sub', '53000000-0000-0000-0000-000000000001', true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  begin
    update public.profiles
    set current_country = 'Nigeria', current_country_code = 'NG'
    where id = v_profile.id;
  exception
    when insufficient_privilege then
      v_guarded := true;
  end;

  if not v_guarded then
    raise exception 'authenticated client bypassed the server-managed current-country guard';
  end if;
end;
$$;
