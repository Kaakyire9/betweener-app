-- Promote remaining Ghana city-level locality labels that are still trapped in
-- profiles.region after older manual saves. Limit this to safe locality labels
-- where location is still only the country fallback.

drop function if exists public.backfill_profile_ghana_locality_promotions(uuid[]);

create or replace function public.backfill_profile_ghana_locality_promotions(
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
      nullif(lower(btrim(split_part(coalesce(profile.region, ''), ',', 1))), '') as region_head
    from public.profiles profile
    where profile.deleted_at is null
      and coalesce(profile.location_precision::text, '') = 'CITY'
      and nullif(btrim(coalesce(profile.city, '')), '') is null
      and nullif(btrim(coalesce(profile.region, '')), '') is not null
      and public.normalize_vibes_country_code(
        profile.current_country,
        profile.current_country_code
      ) = 'GH'
      and lower(coalesce(public.normalize_vibes_country_name(
        profile.current_country,
        profile.current_country_code
      ), '')) = 'ghana'
      and lower(coalesce(profile.location, '')) = 'ghana'
      and (p_profile_ids is null or profile.id = any(p_profile_ids))
  ),
  promoted as (
    select
      candidates.id,
      candidates.region_raw as next_city,
      candidates.region_raw as next_location
    from candidates
    where candidates.region_head is not null
      and candidates.region_head !~ '(region|district|province|state|county|municipality|metropolitan)'
      and candidates.region_head <> any(array[
        'africa',
        'north america',
        'south america',
        'europe',
        'asia',
        'oceania',
        'middle east',
        'ghana',
        'gh',
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

select public.backfill_profile_ghana_locality_promotions();

revoke all on function public.backfill_profile_ghana_locality_promotions(uuid[]) from public;
