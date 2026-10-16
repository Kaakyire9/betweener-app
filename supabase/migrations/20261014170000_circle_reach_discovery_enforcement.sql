-- Enforce Circle reach as a server-owned discovery boundary. Membership remains
-- separately governed by access_policy and membership_eligibility_policy.

create or replace function public.get_ranked_circles_for_profile(
  p_profile_id uuid,
  p_scope text default 'my_country',
  p_limit integer default 48
)
returns table(
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
set row_security = off
as $$
  with viewer as (
    select
      profile.id,
      profile.user_id,
      upper(btrim(coalesce(profile.current_country_code, ''))) as current_country_code,
      upper(btrim(coalesce(profile.origin_country_code, ''))) as origin_country_code,
      public.normalize_location_key(profile.current_country) as current_country_key,
      public.normalize_location_key(profile.city) as city_key,
      public.normalize_location_key(profile.region) as region_key
    from public.profiles profile
    where profile.id = p_profile_id
      and profile.user_id = auth.uid()
      and profile.deleted_at is null
      and profile.account_state = 'active'
      and coalesce(profile.is_active, true)
    limit 1
  ),
  candidates as (
    select
      circle.*,
      viewer.current_country_code as viewer_country_code,
      viewer.origin_country_code as viewer_origin_country_code,
      viewer.city_key as viewer_city_key,
      viewer.region_key as viewer_region_key,
      lower(btrim(coalesce(nullif(circle.reach_scope, ''), nullif(circle.visibility_scope, ''), 'country'))) as resolved_reach,
      (
        (
          viewer.current_country_code <> ''
          and upper(btrim(coalesce(circle.country_code, ''))) <> ''
          and viewer.current_country_code = upper(btrim(circle.country_code))
        )
        or (
          viewer.current_country_key is not null
          and public.normalize_location_key(circle.country_name) is not null
          and viewer.current_country_key = public.normalize_location_key(circle.country_name)
        )
      ) as same_country,
      (
        viewer.city_key is not null
        and public.normalize_location_key(circle.city) is not null
        and viewer.city_key = public.normalize_location_key(circle.city)
      ) as same_city,
      (
        viewer.region_key is not null
        and public.normalize_location_key(circle.region) is not null
        and viewer.region_key = public.normalize_location_key(circle.region)
      ) as same_region,
      (
        viewer.origin_country_code <> ''
        and viewer.current_country_code <> ''
        and viewer.current_country_code <> viewer.origin_country_code
        and exists (
          select 1
          from unnest(coalesce(circle.diaspora_origin_country_codes, '{}'::text[])) origin(code)
          where upper(btrim(origin.code)) = viewer.origin_country_code
        )
        and (
          (
            cardinality(coalesce(circle.diaspora_destination_country_codes, '{}'::text[])) = 0
            and viewer.current_country_code <> viewer.origin_country_code
          )
          or exists (
            select 1
            from unnest(coalesce(circle.diaspora_destination_country_codes, '{}'::text[])) destination(code)
            where upper(btrim(destination.code)) = viewer.current_country_code
          )
        )
      ) as diaspora_match
    from public.circles circle
    join viewer on true
    where circle.status = 'approved'
      and circle.archived_at is null
      and coalesce(circle.access_policy, 'open') <> 'invite_only'
      and coalesce(circle.visibility, 'public') <> 'private'
      and coalesce(circle.visibility_scope, 'country') <> 'invite_only'
  ),
  scoped as (
    select candidate.*
    from candidates candidate
    where case lower(btrim(coalesce(p_scope, 'my_country')))
      when 'global' then candidate.resolved_reach = 'global'
      when 'diaspora' then candidate.resolved_reach = 'global'
        or (candidate.resolved_reach = 'diaspora' and candidate.diaspora_match)
      when 'near_me' then candidate.resolved_reach = 'global'
        or (candidate.resolved_reach = 'country' and candidate.same_country)
        or (candidate.resolved_reach = 'local' and candidate.same_country and candidate.same_city)
      else candidate.resolved_reach = 'global'
        or (candidate.resolved_reach = 'country' and candidate.same_country)
        or (candidate.resolved_reach = 'local' and candidate.same_country and candidate.same_city)
    end
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
            when scoped.resolved_reach = 'local' and scoped.same_city then 45
            when scoped.resolved_reach = 'country' and scoped.same_country then 35
            when scoped.resolved_reach = 'diaspora' and scoped.diaspora_match then 32
            when scoped.resolved_reach = 'global' then 10
            when scoped.same_region then 16
            else 0
          end
      )::double precision as computed_relevance_score,
      case
        when scoped.resolved_reach = 'local' and scoped.same_city then 'Near you in ' || scoped.city
        when scoped.resolved_reach = 'country' and scoped.same_country then
          coalesce(nullif(btrim(scoped.country_name), '') || '-based circle', 'In your country')
        when scoped.resolved_reach = 'diaspora' and scoped.diaspora_match then 'A diaspora Circle for you'
        when scoped.resolved_reach = 'global' then 'Open globally'
        else null
      end as computed_location_insight
    from scoped
  )
  select
    ranked.id,
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
    ranked.computed_relevance_score,
    ranked.computed_location_insight
  from ranked
  order by ranked.computed_relevance_score desc, ranked.is_featured desc, ranked.member_count desc, ranked.created_at desc
  limit least(greatest(coalesce(p_limit, 48), 1), 100);
$$;

revoke all on function public.get_ranked_circles_for_profile(uuid, text, integer)
from public, anon;
grant execute on function public.get_ranked_circles_for_profile(uuid, text, integer)
to authenticated, service_role;

comment on function public.get_ranked_circles_for_profile(uuid, text, integer) is
  'Returns approved public Circles only when their Local, Country, Diaspora or Global reach matches the authenticated viewer. Missing viewer location fails closed for targeted reach.';
