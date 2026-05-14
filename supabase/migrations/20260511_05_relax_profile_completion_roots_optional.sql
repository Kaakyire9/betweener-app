-- Profile completion hardening for launch.
-- Roots/tribe are meaningful identity fields, but they should not be required
-- for a completed account. Profile Edit can legitimately clear roots, and the
-- older trigger then flips completed users back into onboarding.

create or replace function public.profiles_compute_profile_completed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  has_required_fields boolean;
begin
  has_required_fields :=
    (new.full_name is not null and btrim(new.full_name) <> '')
    and (new.age is not null)
    and (new.gender is not null)
    and (new.bio is not null and btrim(new.bio) <> '')
    and (new.region is not null and btrim(new.region) <> '')
    and (new.religion is not null)
    and (new.min_age_interest is not null and new.max_age_interest is not null)
    and (new.phone_verified is true and new.phone_number is not null);

  new.profile_completed := has_required_fields;
  return new;
end;
$$;

-- Re-run completion/discoverability triggers for rows that are otherwise valid.
update public.profiles
set updated_at = now()
where profile_completed is distinct from true
  and full_name is not null and btrim(full_name) <> ''
  and age is not null
  and gender is not null
  and bio is not null and btrim(bio) <> ''
  and region is not null and btrim(region) <> ''
  and religion is not null
  and min_age_interest is not null
  and max_age_interest is not null
  and phone_verified is true
  and phone_number is not null;
