-- Normalize region-only location drift before launch.
--
-- Older profile-edit logic stored a Ghana region in all three fields:
-- region, city, and location. That made Vibes show "Ashanti + GH flag" as if it
-- were the user's current city/country. Keep the region, clear the fake city,
-- and make the display-level location country-first.

with ghana_region_profiles as (
  select id
  from public.profiles
  where deleted_at is null
    and (
      upper(coalesce(current_country_code, '')) = 'GH'
      or lower(coalesce(current_country, '')) = 'ghana'
    )
    and lower(coalesce(region, '')) in (
      'ahafo',
      'ashanti',
      'bono',
      'bono east',
      'central',
      'eastern',
      'greater accra',
      'north east',
      'northern',
      'oti',
      'savannah',
      'upper east',
      'upper west',
      'volta',
      'western',
      'western north'
    )
    and (
      lower(coalesce(city, '')) = lower(coalesce(region, ''))
      or lower(coalesce(location, '')) = lower(coalesce(region, ''))
      or coalesce(current_country, '') = ''
      or coalesce(current_country_code, '') = ''
    )
)
update public.profiles p
set
  city = case
    when lower(coalesce(p.city, '')) = lower(coalesce(p.region, '')) then null
    else p.city
  end,
  location = 'Ghana',
  current_country = 'Ghana',
  current_country_code = 'GH',
  latitude = case
    when lower(coalesce(p.city, '')) = lower(coalesce(p.region, '')) then null
    else p.latitude
  end,
  longitude = case
    when lower(coalesce(p.city, '')) = lower(coalesce(p.region, '')) then null
    else p.longitude
  end,
  location_updated_at = coalesce(p.location_updated_at, now()),
  updated_at = now()
from ghana_region_profiles grp
where p.id = grp.id;
