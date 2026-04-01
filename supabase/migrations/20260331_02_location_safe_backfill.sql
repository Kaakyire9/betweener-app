-- Safely improve older saved location rows without guessing from raw coordinates.
-- This only fixes rows where we already have a richer saved label, for example:
--   city = 'Ashanti Region', region = 'Ashanti Region', location = 'Oforikrom, Ashanti Region'
-- In that case we can safely derive city = 'Oforikrom' from the existing location label.

with parsed as (
  select
    p.id,
    nullif(trim(split_part(coalesce(p.location, ''), ',', 1)), '') as location_first_part,
    nullif(trim(split_part(coalesce(p.location, ''), ',', 2)), '') as location_second_part,
    nullif(trim(p.city), '') as city_value,
    nullif(trim(p.region), '') as region_value,
    nullif(trim(p.location), '') as location_value
  from public.profiles p
  where p.location_precision = 'EXACT'
),
safe_candidates as (
  select
    id,
    location_first_part,
    location_second_part,
    city_value,
    region_value,
    location_value
  from parsed
  where location_first_part is not null
    and location_value like '%,%'
    and location_first_part !~* '\b(region|district|province|state|county|municipality|metropolitan)\b'
    and lower(location_first_part) not in (
      'africa',
      'north america',
      'south america',
      'europe',
      'asia',
      'oceania',
      'middle east'
    )
    and (
      city_value is null
      or lower(city_value) = lower(coalesce(region_value, ''))
      or lower(city_value) = lower(coalesce(location_value, ''))
    )
)
update public.profiles p
set
  city = s.location_first_part,
  region = coalesce(
    p.region,
    case
      when s.location_second_part ~* '\b(region|district|province|state|county|municipality|metropolitan)\b'
        then s.location_second_part
      else null
    end
  ),
  location = case
    when coalesce(trim(p.region), '') <> ''
      and lower(trim(p.region)) <> lower(s.location_first_part)
      then s.location_first_part || ', ' || trim(p.region)
    when s.location_second_part is not null
      and lower(s.location_second_part) <> lower(s.location_first_part)
      then s.location_first_part || ', ' || s.location_second_part
    else s.location_first_part
  end,
  location_updated_at = timezone('utc'::text, now())
from safe_candidates s
where p.id = s.id;

-- Optional review query for rows that are still suspicious after the safe backfill.
-- Run manually in SQL editor when needed.
--
-- select
--   id,
--   full_name,
--   city,
--   region,
--   location,
--   current_country,
--   current_country_code,
--   latitude,
--   longitude,
--   location_updated_at
-- from public.profiles
-- where location_precision = 'EXACT'
--   and (
--     coalesce(trim(city), '') = ''
--     or lower(trim(city)) = lower(coalesce(trim(region), ''))
--     or lower(trim(city)) = lower(coalesce(trim(location), ''))
--     or trim(city) ~* '\b(region|district|province|state|county|municipality|metropolitan)\b'
--   )
-- order by location_updated_at desc nulls last;
