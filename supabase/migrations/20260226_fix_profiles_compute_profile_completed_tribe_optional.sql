-- Fix: profiles_compute_profile_completed was requiring tribe for all profiles.
-- This caused profile_completed to flip back to false (and therefore discoverable_in_vibes to be forced false)
-- for non-Ghana users who never set a tribe.
--
-- We now require tribe only for Ghana profiles (based on current_country/current_country_code/region).

CREATE OR REPLACE FUNCTION public.profiles_compute_profile_completed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  has_required_fields boolean;
  requires_tribe boolean;
BEGIN
  requires_tribe :=
    coalesce(new.current_country_code, '') = 'GH'
    OR (new.current_country IS NOT NULL AND lower(new.current_country) LIKE '%ghana%')
    OR (new.region IS NOT NULL AND new.region = ANY (ARRAY[
      'Ahafo',
      'Ashanti',
      'Bono',
      'Bono East',
      'Central',
      'Eastern',
      'Greater Accra',
      'North East',
      'Northern',
      'Oti',
      'Savannah',
      'Upper East',
      'Upper West',
      'Volta',
      'Western',
      'Western North'
    ]));

  has_required_fields :=
    (new.full_name IS NOT NULL AND trim(new.full_name) <> '')
    AND (new.age IS NOT NULL)
    AND (new.gender IS NOT NULL)
    AND (new.bio IS NOT NULL AND trim(new.bio) <> '')
    AND (new.region IS NOT NULL AND trim(new.region) <> '')
    AND (
      NOT requires_tribe
      OR (new.tribe IS NOT NULL AND trim(new.tribe) <> '')
    )
    AND (new.religion IS NOT NULL)
    AND (new.min_age_interest IS NOT NULL AND new.max_age_interest IS NOT NULL)
    AND (new.phone_verified IS TRUE AND new.phone_number IS NOT NULL);

  new.profile_completed := has_required_fields;
  RETURN new;
END;
$$;

-- Backfill: re-run triggers for profiles that were hidden only because tribe was empty.
-- This intentionally touches only rows likely affected by the previous logic.
UPDATE public.profiles
SET updated_at = updated_at
WHERE profile_completed IS DISTINCT FROM true
  AND (tribe IS NULL OR btrim(tribe) = '')
  AND NOT (
    coalesce(current_country_code, '') = 'GH'
    OR (current_country IS NOT NULL AND lower(current_country) LIKE '%ghana%')
    OR (region IS NOT NULL AND region = ANY (ARRAY[
      'Ahafo',
      'Ashanti',
      'Bono',
      'Bono East',
      'Central',
      'Eastern',
      'Greater Accra',
      'North East',
      'Northern',
      'Oti',
      'Savannah',
      'Upper East',
      'Upper West',
      'Volta',
      'Western',
      'Western North'
    ]))
  );

