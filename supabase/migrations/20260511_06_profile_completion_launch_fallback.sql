-- Launch hardening: keep completed users from being bounced back to onboarding
-- when older optional profile fields are missing or later cleared.
--
-- profile_completed should mean "can access the app", not "has every rich
-- discovery detail". Vibes quality can still be controlled by richer ranking
-- and discoverability rules.

create or replace function public.profiles_compute_profile_completed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  has_core_identity boolean;
  has_completion_marker boolean;
  has_profile_substance boolean;
begin
  has_core_identity :=
    (new.full_name is not null and btrim(new.full_name) <> '')
    and (new.age is not null)
    and (new.gender is not null)
    and (new.phone_verified is true and new.phone_number is not null);

  has_completion_marker :=
    new.onboarding_completed_at is not null
    or new.identity_finalized_at is not null
    or new.identity_status = 'active';

  has_profile_substance :=
    (new.bio is not null and btrim(new.bio) <> '')
    or (new.region is not null and btrim(new.region) <> '')
    or (new.location is not null and btrim(new.location) <> '')
    or (new.current_country is not null and btrim(new.current_country) <> '')
    or (new.avatar_url is not null and btrim(new.avatar_url) <> '');

  new.profile_completed :=
    has_core_identity
    and (
      has_completion_marker
      or has_profile_substance
    );

  return new;
end;
$$;

-- Backfill valid existing users that were completed before but got flipped
-- back to false by older trigger requirements.
update public.profiles
set updated_at = now()
where profile_completed is distinct from true
  and full_name is not null and btrim(full_name) <> ''
  and age is not null
  and gender is not null
  and phone_verified is true
  and phone_number is not null
  and (
    onboarding_completed_at is not null
    or identity_finalized_at is not null
    or identity_status = 'active'
    or bio is not null and btrim(bio) <> ''
    or region is not null and btrim(region) <> ''
    or location is not null and btrim(location) <> ''
    or current_country is not null and btrim(current_country) <> ''
    or avatar_url is not null and btrim(avatar_url) <> ''
  );
