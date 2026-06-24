-- Promote safe legacy manual city values that were stored in profiles.region
-- into profiles.city so card surfaces can render City + Flag instead of only
-- Country + Flag. Keep this conservative: only promote when there is evidence
-- the label is a locality, not a broad/admin area.

drop function if exists public.backfill_profile_region_city_promotions(uuid[]);

create or replace function public.backfill_profile_region_city_promotions(
  p_profile_ids uuid[] default null
)
returns integer
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_rows integer := 0;
begin
  with candidates as (
    select
      profile.id,
      nullif(btrim(coalesce(profile.region, '')), '') as region_raw,
      nullif(lower(btrim(split_part(coalesce(profile.region, ''), ',', 1))), '') as region_head,
      public.normalize_vibes_country_name(
        profile.current_country,
        profile.current_country_code
      ) as current_country_norm,
      public.normalize_vibes_country_code(
        profile.current_country,
        profile.current_country_code
      ) as current_country_code_norm
    from public.profiles profile
    where profile.deleted_at is null
      and coalesce(profile.location_precision::text, '') = 'CITY'
      and nullif(btrim(coalesce(profile.city, '')), '') is null
      and nullif(btrim(coalesce(profile.region, '')), '') is not null
      and (
        profile.location is null
        or nullif(lower(btrim(coalesce(profile.location, ''))), '') = nullif(lower(btrim(coalesce(profile.current_country, ''))), '')
        or nullif(lower(btrim(coalesce(profile.location, ''))), '') = lower(coalesce(profile.current_country_code, ''))
      )
      and (p_profile_ids is null or profile.id = any(p_profile_ids))
  ),
  eligible as (
    select
      candidates.*
    from candidates
    where candidates.region_head is not null
      and candidates.region_head <> any(array[
        'africa',
        'north america',
        'south america',
        'europe',
        'asia',
        'oceania',
        'middle east',
        'england',
        'scotland',
        'wales',
        'northern ireland'
      ])
      and candidates.region_head !~ '(region|district|province|state|county|municipality|metropolitan)'
      and (
        candidates.current_country_norm is null
        or candidates.region_head <> lower(candidates.current_country_norm)
      )
      and (
        candidates.current_country_code_norm is null
        or candidates.region_head <> lower(candidates.current_country_code_norm)
      )
      and not (
        candidates.current_country_code_norm = 'GH'
        and candidates.region_head = any(array[
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
        ])
      )
  ),
  supported_by_profiles as (
    select
      eligible.id,
      count(*)::integer as support_rows
    from eligible
    join public.profiles profile_support
      on profile_support.deleted_at is null
     and profile_support.id <> eligible.id
     and nullif(lower(btrim(coalesce(profile_support.city, ''))), '') = eligible.region_head
     and (
       (
         eligible.current_country_code_norm is not null
         and public.normalize_vibes_country_code(
           profile_support.current_country,
           profile_support.current_country_code
         ) = eligible.current_country_code_norm
       )
       or (
         eligible.current_country_code_norm is null
         and eligible.current_country_norm is not null
         and lower(coalesce(public.normalize_vibes_country_name(
           profile_support.current_country,
           profile_support.current_country_code
         ), '')) = lower(eligible.current_country_norm)
       )
     )
    group by eligible.id
  ),
  supported_by_ghana_locations as (
    select
      eligible.id,
      count(*)::integer as support_rows
    from eligible
    join public.ghana_locations ghana_location
      on eligible.current_country_code_norm = 'GH'
     and lower(btrim(ghana_location.name)) = eligible.region_head
     and lower(btrim(coalesce(ghana_location.type, ''))) not in (
       'region',
       'district',
       'province',
       'state',
       'county',
       'municipality',
       'metropolitan'
     )
     and lower(btrim(coalesce(ghana_location.type, ''))) !~ '(region|district|province|state|county|municipality|metropolitan)'
    group by eligible.id
  ),
  promoted as (
    select
      eligible.id,
      eligible.region_raw as next_city,
      eligible.region_raw as next_location
    from eligible
    left join supported_by_profiles profile_support
      on profile_support.id = eligible.id
    left join supported_by_ghana_locations ghana_support
      on ghana_support.id = eligible.id
    where coalesce(profile_support.support_rows, 0) > 0
       or coalesce(ghana_support.support_rows, 0) > 0
  ),
  updated as (
    update public.profiles profile
    set city = promoted.next_city,
        location = promoted.next_location,
        updated_at = timezone('utc'::text, now())
    from promoted
    where profile.id = promoted.id
      and (
        profile.city is distinct from promoted.next_city
        or profile.location is distinct from promoted.next_location
      )
    returning 1
  )
  select count(*) into v_rows
  from updated;

  return v_rows;
end;
$$;

select public.backfill_profile_region_city_promotions();

revoke all on function public.backfill_profile_region_city_promotions(uuid[]) from public;
