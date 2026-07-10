-- Stage 4: expose backend-owned circle detail location affinity so the
-- circle detail screen can consume the same source of truth as Explore.

drop function if exists public.get_circle_location_affinity(uuid, uuid, text);

create or replace function public.get_circle_location_affinity(
  p_profile_id uuid,
  p_circle_id uuid,
  p_scope text default 'my_country'
)
returns table (
  reason_code text,
  strength double precision,
  short_text text
)
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  with viewer as (
    select
      f.*,
      coalesce(
        array_remove(
          array[
            public.normalize_location_key(f.current_country_code),
            public.normalize_location_key(f.current_country),
            public.normalize_location_key(f.region)
          ],
          null
        ),
        array[]::text[]
      ) as diaspora_keys
    from public.profile_location_features f
    where f.profile_id = p_profile_id
      and f.user_id = auth.uid()
    limit 1
  ),
  scoped as (
    select
      c.circle_id,
      c.city,
      c.region,
      c.country_name,
      c.country_code,
      c.visibility_scope,
      c.diaspora_tags,
      c.city_key,
      c.region_key,
      c.country_key,
      c.normalized_country_code,
      v.city_key as viewer_city_key,
      v.region_key as viewer_region_key,
      v.country_key as viewer_country_key,
      v.country_code as viewer_country_code,
      (
        c.city_key is not null
        and v.city_key is not null
        and c.city_key = v.city_key
      ) as same_city,
      (
        c.region_key is not null
        and v.region_key is not null
        and c.region_key = v.region_key
      ) as same_region,
      (
        (c.normalized_country_code <> '' and v.country_code <> '' and c.normalized_country_code = v.country_code)
        or (c.country_key is not null and v.country_key is not null and c.country_key = v.country_key)
      ) as same_country,
      (
        c.visibility_scope = 'diaspora'
        or cardinality(coalesce(c.diaspora_tags, '{}'::text[])) > 0
        or exists (
          select 1
          from unnest(coalesce(c.diaspora_tags, '{}'::text[])) as tag(value)
          where public.normalize_location_key(tag.value) = any(v.diaspora_keys)
        )
      ) as diaspora_match
    from public.circle_location_features c
    join viewer v on true
    where c.circle_id = p_circle_id
    limit 1
  )
  select
    case
      when lower(coalesce(p_scope, 'my_country')) = 'diaspora' and scoped.diaspora_match then 'diaspora_circle'
      when scoped.same_city then 'same_city'
      when scoped.same_region then 'same_region'
      when scoped.same_country then 'same_country'
      when scoped.diaspora_match then 'diaspora_circle'
      else null
    end as reason_code,
    case
      when lower(coalesce(p_scope, 'my_country')) = 'diaspora' and scoped.diaspora_match then 28
      when scoped.same_city then 30
      when scoped.same_region then 16
      when scoped.same_country then 35
      when scoped.diaspora_match then 12
      else null
    end as strength,
    case
      when lower(coalesce(p_scope, 'my_country')) = 'diaspora' and scoped.diaspora_match then
        case
          when scoped.region is not null then scoped.region || ' diaspora circle'
          else 'Diaspora circle for you'
        end
      when scoped.same_city then 'Near you in ' || scoped.city
      when scoped.same_region then scoped.region || '-based circle'
      when scoped.same_country then
        case
          when scoped.country_name is not null then scoped.country_name || '-based circle'
          else 'In your country'
        end
      when scoped.diaspora_match then
        case
          when scoped.region is not null then scoped.region || ' diaspora circle'
          else 'Diaspora circle for you'
        end
      else null
    end as short_text
  from scoped
  where
    (lower(coalesce(p_scope, 'my_country')) = 'diaspora' and scoped.diaspora_match)
    or scoped.same_city
    or scoped.same_region
    or scoped.same_country
    or scoped.diaspora_match;
$$;

revoke all on function public.get_circle_location_affinity(uuid, uuid, text) from public;
grant execute on function public.get_circle_location_affinity(uuid, uuid, text) to authenticated;
