-- Repair legacy coarse profile location labels so location surfaces fall back to
-- city when we have one, otherwise country. Keep region data only as metadata.

drop function if exists public.backfill_profile_location_labels(uuid[]);

create or replace function public.backfill_profile_location_labels(
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
  with source as (
    select
      profile.id,
      profile.location_precision::text as location_precision,
      nullif(btrim(coalesce(profile.city, '')), '') as city_raw,
      nullif(btrim(coalesce(profile.region, '')), '') as region_raw,
      nullif(btrim(coalesce(profile.location, '')), '') as location_raw,
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
      and (p_profile_ids is null or profile.id = any(p_profile_ids))
  ),
  classified as (
    select
      source.*,
      nullif(lower(btrim(split_part(coalesce(source.city_raw, ''), ',', 1))), '') as city_head,
      nullif(lower(btrim(split_part(coalesce(source.region_raw, ''), ',', 1))), '') as region_head,
      nullif(lower(btrim(split_part(coalesce(source.location_raw, ''), ',', 1))), '') as location_head,
      nullif(lower(btrim(coalesce(source.current_country_norm, ''))), '') as country_head,
      nullif(lower(btrim(coalesce(source.current_country_code_norm, ''))), '') as country_code_head
    from source
  ),
  cleaned as (
    select
      classified.id,
      classified.location_precision,
      classified.current_country_norm,
      case
        when classified.city_raw is null then null
        when classified.city_head is null then null
        when classified.city_head = any(array[
          'africa',
          'north america',
          'south america',
          'europe',
          'asia',
          'oceania',
          'middle east'
        ]) then null
        when classified.city_head ~ '(region|district|province|state|county|municipality|metropolitan)' then null
        when classified.country_head is not null and classified.city_head = classified.country_head then null
        when classified.country_code_head is not null and classified.city_head = classified.country_code_head then null
        when classified.region_head is not null and classified.city_head = classified.region_head then null
        when classified.country_code_head = 'gh' and classified.city_head = any(array[
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
        ]) then null
        else classified.city_raw
      end as next_city,
      case
        when classified.region_raw is null then null
        when classified.region_head is null then null
        when classified.region_head = any(array[
          'africa',
          'north america',
          'south america',
          'europe',
          'asia',
          'oceania',
          'middle east'
        ]) then null
        when classified.country_head is not null and classified.region_head = classified.country_head then null
        when classified.country_code_head is not null and classified.region_head = classified.country_code_head then null
        else classified.region_raw
      end as next_region,
      case
        when classified.location_raw is null then null
        when classified.location_head is null then null
        when classified.location_head = any(array[
          'africa',
          'north america',
          'south america',
          'europe',
          'asia',
          'oceania',
          'middle east'
        ]) then null
        when classified.location_head ~ '(region|district|province|state|county|municipality|metropolitan)' then null
        when classified.country_head is not null and classified.location_head = classified.country_head then classified.current_country_norm
        when classified.country_code_head is not null and classified.location_head = classified.country_code_head then classified.current_country_norm
        when classified.region_head is not null and classified.location_head = classified.region_head then null
        when classified.country_code_head = 'gh' and classified.location_head = any(array[
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
        ]) then null
        else classified.location_raw
      end as next_location_seed
    from classified
  ),
  resolved as (
    select
      cleaned.id,
      cleaned.next_city,
      cleaned.next_region,
      case
        when cleaned.location_precision = 'CITY'
          and cleaned.next_city is null
          and cleaned.current_country_norm is not null
          then cleaned.current_country_norm
        else coalesce(
          cleaned.next_location_seed,
          cleaned.next_city,
          cleaned.current_country_norm
        )
      end as next_location
    from cleaned
  ),
  updated as (
    update public.profiles profile
    set city = resolved.next_city,
        region = resolved.next_region,
        location = resolved.next_location,
        updated_at = timezone('utc'::text, now())
    from resolved
    where profile.id = resolved.id
      and (
        profile.city is distinct from resolved.next_city
        or profile.region is distinct from resolved.next_region
        or profile.location is distinct from resolved.next_location
      )
    returning 1
  )
  select count(*) into v_rows
  from updated;

  return v_rows;
end;
$$;

select public.backfill_profile_location_labels();

revoke all on function public.backfill_profile_location_labels(uuid[]) from public;
