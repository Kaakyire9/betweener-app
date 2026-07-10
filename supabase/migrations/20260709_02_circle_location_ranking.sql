-- Stage 3: move discover-circle location ranking into Supabase so Explore
-- can consume one ranked source of truth with lightweight client fallback.

create or replace view public.profile_location_features as
select
  p.id as profile_id,
  p.user_id,
  p.city,
  p.region,
  p.current_country,
  p.current_country_code,
  public.normalize_location_key(p.city) as city_key,
  public.normalize_location_key(p.region) as region_key,
  public.normalize_location_key(coalesce(p.current_country_code, p.current_country)) as country_key,
  upper(btrim(coalesce(p.current_country_code, ''))) as country_code,
  case
    when upper(btrim(coalesce(p.current_country_code, ''))) <> '' then upper(btrim(coalesce(p.current_country_code, ''))) <> 'GH'
    when public.normalize_location_key(p.current_country) is not null then public.normalize_location_key(p.current_country) <> 'ghana'
    else false
  end as is_abroad
from public.profiles p
where p.deleted_at is null;

create or replace view public.circle_location_features as
select
  c.id as circle_id,
  c.name,
  c.slug,
  c.description,
  c.short_description,
  c.visibility,
  c.category,
  c.created_by_profile_id,
  c.cover_image_url,
  c.icon_url,
  c.image_path,
  c.image_updated_at,
  c.circle_type,
  c.status,
  c.visibility_scope,
  c.country_code,
  c.country_name,
  c.region,
  c.city,
  c.diaspora_tags,
  c.culture_tags,
  c.faith_tags,
  c.interest_tags,
  c.audience_tags,
  c.is_official,
  c.is_partner,
  c.is_featured,
  c.requires_join_approval,
  c.member_count,
  c.active_this_week_count,
  c.gathering_count,
  c.archived_at,
  c.created_at,
  public.normalize_location_key(c.city) as city_key,
  public.normalize_location_key(c.region) as region_key,
  public.normalize_location_key(coalesce(c.country_code, c.country_name)) as country_key,
  upper(btrim(coalesce(c.country_code, ''))) as normalized_country_code
from public.circles c;

drop function if exists public.get_ranked_circles_for_profile(uuid, text, integer);

create or replace function public.get_ranked_circles_for_profile(
  p_profile_id uuid,
  p_scope text default 'my_country',
  p_limit integer default 48
)
returns table (
  id uuid,
  name text,
  slug text,
  description text,
  short_description text,
  visibility text,
  category text,
  created_by_profile_id uuid,
  cover_image_url text,
  icon_url text,
  image_path text,
  image_updated_at timestamptz,
  circle_type text,
  status text,
  visibility_scope text,
  country_code text,
  country_name text,
  region text,
  city text,
  diaspora_tags text[],
  culture_tags text[],
  faith_tags text[],
  interest_tags text[],
  audience_tags text[],
  is_official boolean,
  is_partner boolean,
  is_featured boolean,
  requires_join_approval boolean,
  member_count integer,
  active_this_week_count integer,
  gathering_count integer,
  archived_at timestamptz,
  relevance_score double precision,
  location_insight text
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
      c.*,
      v.city as viewer_city,
      v.region as viewer_region,
      v.current_country as viewer_country,
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
    where c.status = 'approved'
      and c.archived_at is null
      and (
        lower(coalesce(p_scope, 'my_country')) = 'global'
        or (
          lower(coalesce(p_scope, 'my_country')) = 'diaspora'
          and (
            c.visibility_scope = 'diaspora'
            or cardinality(coalesce(c.diaspora_tags, '{}'::text[])) > 0
            or exists (
              select 1
              from unnest(coalesce(c.diaspora_tags, '{}'::text[])) as tag(value)
              where public.normalize_location_key(tag.value) = any(v.diaspora_keys)
            )
          )
        )
        or (
          lower(coalesce(p_scope, 'my_country')) in ('my_country', 'near_me')
          and (
            c.visibility_scope = 'global'
            or v.country_code = ''
            or c.normalized_country_code = ''
            or c.normalized_country_code = v.country_code
            or (c.country_key is not null and v.country_key is not null and c.country_key = v.country_key)
          )
          and (
            lower(coalesce(p_scope, 'my_country')) <> 'near_me'
            or c.visibility_scope = 'global'
            or v.city_key is null
            or c.city_key is null
            or c.city_key = v.city_key
          )
        )
      )
  ),
  ranked as (
    select
      scoped.*,
      (
        case when scoped.is_official then 25 else 0 end
        + case when scoped.is_featured then 20 else 0 end
        + least(18, greatest(0, coalesce(scoped.active_this_week_count, 0)))
        + least(12, floor(greatest(0, coalesce(scoped.member_count, 0)) / 10.0))
        + case
            when lower(coalesce(p_scope, 'my_country')) = 'diaspora' and scoped.diaspora_match then 28
            when scoped.same_city then 30
            when scoped.same_region then 16
            when scoped.same_country then 35
            when scoped.diaspora_match then 12
            else 0
          end
        + case
            when lower(coalesce(p_scope, 'my_country')) = 'near_me' and scoped.visibility_scope = 'local' then 15
            when lower(coalesce(p_scope, 'my_country')) = 'my_country' and scoped.visibility_scope = 'country' then 12
            when lower(coalesce(p_scope, 'my_country')) = 'global' and scoped.visibility_scope = 'global' then 20
            when lower(coalesce(p_scope, 'my_country')) <> 'global' and scoped.visibility_scope = 'global' then -8
            else 0
          end
      )::double precision as relevance_score,
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
      end as location_insight
    from scoped
  )
  select
    ranked.circle_id as id,
    ranked.name,
    ranked.slug,
    ranked.description,
    ranked.short_description,
    ranked.visibility,
    ranked.category,
    ranked.created_by_profile_id,
    ranked.cover_image_url,
    ranked.icon_url,
    ranked.image_path,
    ranked.image_updated_at,
    ranked.circle_type,
    ranked.status,
    ranked.visibility_scope,
    ranked.country_code,
    ranked.country_name,
    ranked.region,
    ranked.city,
    ranked.diaspora_tags,
    ranked.culture_tags,
    ranked.faith_tags,
    ranked.interest_tags,
    ranked.audience_tags,
    ranked.is_official,
    ranked.is_partner,
    ranked.is_featured,
    ranked.requires_join_approval,
    ranked.member_count,
    ranked.active_this_week_count,
    ranked.gathering_count,
    ranked.archived_at,
    ranked.relevance_score,
    ranked.location_insight
  from ranked
  order by ranked.relevance_score desc, ranked.is_featured desc, ranked.member_count desc, ranked.created_at desc
  limit greatest(coalesce(p_limit, 48), 1);
$$;

revoke all on function public.get_ranked_circles_for_profile(uuid, text, integer) from public;
grant execute on function public.get_ranked_circles_for_profile(uuid, text, integer) to authenticated;
