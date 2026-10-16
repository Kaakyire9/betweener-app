-- Allow one Circle to serve a resident audience and its diaspora without changing
-- legacy reach_scope or discovery RPC signatures.

alter table public.circles
  add column if not exists reach_scopes text[] not null default '{}'::text[];

update public.circles
set reach_scopes = array[lower(btrim(coalesce(reach_scope, 'country')))]::text[]
where cardinality(reach_scopes) = 0;

alter table public.circles
  drop constraint if exists circles_reach_scopes_check,
  add constraint circles_reach_scopes_check check (
    cardinality(reach_scopes) between 1 and 2
    and reach_scopes <@ array['local', 'country', 'diaspora', 'global']::text[]
    and not ('local' = any(reach_scopes) and 'country' = any(reach_scopes))
    and (not ('global' = any(reach_scopes)) or cardinality(reach_scopes) = 1)
  );

create or replace function public.normalize_circle_reach_scopes(
  p_reach_scopes text[],
  p_fallback text default 'country'
)
returns text[]
language plpgsql
immutable
set search_path = public, pg_catalog
as $$
declare
  v_scopes text[];
  v_fallback text := lower(btrim(coalesce(p_fallback, 'country')));
begin
  if v_fallback not in ('local', 'country', 'diaspora', 'global') then
    v_fallback := 'country';
  end if;

  select coalesce(array_agg(scope order by
    case scope when 'global' then 1 when 'local' then 2 when 'country' then 3 else 4 end
  ), '{}'::text[])
  into v_scopes
  from (
    select distinct lower(btrim(value)) as scope
    from unnest(coalesce(p_reach_scopes, '{}'::text[])) value
    where lower(btrim(value)) in ('local', 'country', 'diaspora', 'global')
  ) normalized;

  if 'global' = any(v_scopes) then
    return array['global']::text[];
  end if;
  if 'local' = any(v_scopes) and 'country' = any(v_scopes) then
    v_scopes := array_remove(v_scopes, 'country');
  end if;
  if cardinality(v_scopes) = 0 then
    return array[v_fallback]::text[];
  end if;
  return v_scopes;
end;
$$;

revoke all on function public.normalize_circle_reach_scopes(text[], text)
from public, anon, authenticated, service_role;

create or replace function public.normalize_circle_reach_scopes_on_write()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if tg_op = 'INSERT' and cardinality(coalesce(new.reach_scopes, '{}'::text[])) = 0 then
    new.reach_scopes := array[coalesce(new.reach_scope, 'country')]::text[];
  elsif tg_op = 'UPDATE'
    and new.reach_scopes is not distinct from old.reach_scopes
    and new.reach_scope is distinct from old.reach_scope then
    -- Installed clients that only know reach_scope intentionally reset to one scope.
    new.reach_scopes := array[coalesce(new.reach_scope, 'country')]::text[];
  end if;

  new.reach_scopes := public.normalize_circle_reach_scopes(new.reach_scopes, new.reach_scope);
  new.reach_scope := case
    when 'global' = any(new.reach_scopes) then 'global'
    when 'local' = any(new.reach_scopes) then 'local'
    when 'country' = any(new.reach_scopes) then 'country'
    else 'diaspora'
  end;

  if ('local' = any(new.reach_scopes) or 'country' = any(new.reach_scopes))
    and new.country_code is null
    and nullif(btrim(coalesce(new.country_name, '')), '') is null then
    raise exception 'circle_country_required' using errcode = '22023';
  end if;
  if 'local' = any(new.reach_scopes)
    and nullif(btrim(coalesce(new.city, '')), '') is null then
    raise exception 'circle_city_required' using errcode = '22023';
  end if;
  if 'diaspora' = any(new.reach_scopes)
    and cardinality(coalesce(new.diaspora_origin_country_codes, '{}'::text[])) = 0 then
    raise exception 'circle_diaspora_origin_required' using errcode = '22023';
  end if;

  if coalesce(new.access_policy, 'open') <> 'invite_only' then
    new.visibility_scope := new.reach_scope;
  end if;
  return new;
end;
$$;

drop trigger if exists circles_normalize_reach_scopes on public.circles;
create trigger circles_normalize_reach_scopes
before insert or update of reach_scope, reach_scopes, country_code, country_name, city,
  diaspora_origin_country_codes, diaspora_destination_country_codes
on public.circles
for each row execute function public.normalize_circle_reach_scopes_on_write();

revoke all on function public.normalize_circle_reach_scopes_on_write()
from public, anon, authenticated, service_role;

create index if not exists circles_reach_scopes_gin_idx
  on public.circles using gin(reach_scopes);

create or replace function public.rpc_create_circle_request_v3(
  p_name text,
  p_description text default null,
  p_short_description text default null,
  p_circle_type text default 'gold_community',
  p_reach_scope text default 'country',
  p_reach_scopes text[] default '{}'::text[],
  p_access_policy text default 'open',
  p_country_code text default null,
  p_country_name text default null,
  p_region text default null,
  p_city text default null,
  p_diaspora_origin_country_codes text[] default '{}'::text[],
  p_diaspora_destination_country_codes text[] default '{}'::text[],
  p_membership_eligibility_policy text default 'recommend_only',
  p_live_discovery_policy text default 'members_only',
  p_culture_tags text[] default '{}'::text[],
  p_faith_tags text[] default '{}'::text[],
  p_interest_tags text[] default '{}'::text[],
  p_audience_tags text[] default '{}'::text[],
  p_rules text default null
)
returns public.circles
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_circle public.circles;
  v_scopes text[] := public.normalize_circle_reach_scopes(p_reach_scopes, p_reach_scope);
  v_primary text;
begin
  v_primary := case
    when 'global' = any(v_scopes) then 'global'
    when 'local' = any(v_scopes) then 'local'
    when 'country' = any(v_scopes) then 'country'
    else 'diaspora'
  end;
  if 'diaspora' = any(v_scopes)
    and cardinality(coalesce(p_diaspora_origin_country_codes, '{}'::text[])) = 0 then
    raise exception 'circle_diaspora_origin_required' using errcode = '22023';
  end if;

  v_circle := public.rpc_create_circle_request_v2(
    p_name => p_name,
    p_description => p_description,
    p_short_description => p_short_description,
    p_circle_type => p_circle_type,
    p_reach_scope => v_primary,
    p_access_policy => p_access_policy,
    p_country_code => p_country_code,
    p_country_name => p_country_name,
    p_region => p_region,
    p_city => p_city,
    p_diaspora_origin_country_codes => p_diaspora_origin_country_codes,
    p_diaspora_destination_country_codes => p_diaspora_destination_country_codes,
    p_membership_eligibility_policy => p_membership_eligibility_policy,
    p_live_discovery_policy => p_live_discovery_policy,
    p_culture_tags => p_culture_tags,
    p_faith_tags => p_faith_tags,
    p_interest_tags => p_interest_tags,
    p_audience_tags => p_audience_tags,
    p_rules => p_rules
  );
  update public.circles set reach_scopes = v_scopes where id = v_circle.id returning * into v_circle;
  return v_circle;
end;
$$;

create or replace function public.rpc_update_circle_request_v3(
  p_circle_id uuid,
  p_name text,
  p_description text default null,
  p_short_description text default null,
  p_circle_type text default 'gold_community',
  p_reach_scope text default 'country',
  p_reach_scopes text[] default '{}'::text[],
  p_access_policy text default 'open',
  p_country_code text default null,
  p_country_name text default null,
  p_region text default null,
  p_city text default null,
  p_diaspora_origin_country_codes text[] default '{}'::text[],
  p_diaspora_destination_country_codes text[] default '{}'::text[],
  p_membership_eligibility_policy text default 'recommend_only',
  p_live_discovery_policy text default 'members_only',
  p_culture_tags text[] default '{}'::text[],
  p_faith_tags text[] default '{}'::text[],
  p_interest_tags text[] default '{}'::text[],
  p_audience_tags text[] default '{}'::text[],
  p_rules text default null
)
returns public.circles
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_circle public.circles;
  v_scopes text[] := public.normalize_circle_reach_scopes(p_reach_scopes, p_reach_scope);
  v_primary text;
begin
  v_primary := case
    when 'global' = any(v_scopes) then 'global'
    when 'local' = any(v_scopes) then 'local'
    when 'country' = any(v_scopes) then 'country'
    else 'diaspora'
  end;
  if 'diaspora' = any(v_scopes)
    and cardinality(coalesce(p_diaspora_origin_country_codes, '{}'::text[])) = 0 then
    raise exception 'circle_diaspora_origin_required' using errcode = '22023';
  end if;

  v_circle := public.rpc_update_circle_request_v2(
    p_circle_id => p_circle_id,
    p_name => p_name,
    p_description => p_description,
    p_short_description => p_short_description,
    p_circle_type => p_circle_type,
    p_reach_scope => v_primary,
    p_access_policy => p_access_policy,
    p_country_code => p_country_code,
    p_country_name => p_country_name,
    p_region => p_region,
    p_city => p_city,
    p_diaspora_origin_country_codes => p_diaspora_origin_country_codes,
    p_diaspora_destination_country_codes => p_diaspora_destination_country_codes,
    p_membership_eligibility_policy => p_membership_eligibility_policy,
    p_live_discovery_policy => p_live_discovery_policy,
    p_culture_tags => p_culture_tags,
    p_faith_tags => p_faith_tags,
    p_interest_tags => p_interest_tags,
    p_audience_tags => p_audience_tags,
    p_rules => p_rules
  );
  update public.circles set reach_scopes = v_scopes where id = v_circle.id returning * into v_circle;
  return v_circle;
end;
$$;

revoke all on function public.rpc_create_circle_request_v3(text,text,text,text,text,text[],text,text,text,text,text,text[],text[],text,text,text[],text[],text[],text[],text)
from public, anon;
revoke all on function public.rpc_update_circle_request_v3(uuid,text,text,text,text,text,text[],text,text,text,text,text,text[],text[],text,text,text[],text[],text[],text[],text)
from public, anon;
grant execute on function public.rpc_create_circle_request_v3(text,text,text,text,text,text[],text,text,text,text,text,text[],text[],text,text,text[],text[],text[],text[],text)
to authenticated, service_role;
grant execute on function public.rpc_update_circle_request_v3(uuid,text,text,text,text,text,text[],text,text,text,text,text,text[],text[],text,text,text[],text[],text[],text[],text)
to authenticated, service_role;

create or replace function public.get_ranked_circles_for_profile(
  p_profile_id uuid,
  p_scope text default 'my_country',
  p_limit integer default 48
)
returns table(
  id uuid, name text, slug text, description text, short_description text,
  visibility text, category text, created_by_profile_id uuid, cover_image_url text,
  icon_url text, image_path text, image_updated_at timestamptz, circle_type text,
  status text, visibility_scope text, country_code text, country_name text,
  region text, city text, diaspora_tags text[], culture_tags text[], faith_tags text[],
  interest_tags text[], audience_tags text[], is_official boolean, is_partner boolean,
  is_featured boolean, requires_join_approval boolean, member_count integer,
  active_this_week_count integer, gathering_count integer, archived_at timestamptz,
  relevance_score double precision, location_insight text
)
language sql
stable
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
  with viewer as (
    select profile.id,
      upper(btrim(coalesce(profile.current_country_code, ''))) as current_country_code,
      upper(btrim(coalesce(profile.origin_country_code, ''))) as origin_country_code,
      public.normalize_location_key(profile.current_country) as current_country_key,
      public.normalize_location_key(profile.city) as city_key,
      public.normalize_location_key(profile.region) as region_key
    from public.profiles profile
    where profile.id = p_profile_id and profile.user_id = auth.uid()
      and profile.deleted_at is null and profile.account_state = 'active'
      and coalesce(profile.is_active, true)
    limit 1
  ), candidates as (
    select circle.*, viewer.current_country_code as viewer_country_code,
      viewer.origin_country_code as viewer_origin_country_code,
      viewer.city_key as viewer_city_key, viewer.region_key as viewer_region_key,
      case when cardinality(circle.reach_scopes) > 0 then circle.reach_scopes
        else array[lower(btrim(coalesce(nullif(circle.reach_scope, ''), nullif(circle.visibility_scope, ''), 'country')))]::text[]
      end as resolved_reaches,
      ((viewer.current_country_code <> '' and upper(btrim(coalesce(circle.country_code, ''))) <> ''
          and viewer.current_country_code = upper(btrim(circle.country_code)))
        or (viewer.current_country_key is not null and public.normalize_location_key(circle.country_name) is not null
          and viewer.current_country_key = public.normalize_location_key(circle.country_name))) as same_country,
      (viewer.city_key is not null and public.normalize_location_key(circle.city) is not null
        and viewer.city_key = public.normalize_location_key(circle.city)) as same_city,
      (viewer.region_key is not null and public.normalize_location_key(circle.region) is not null
        and viewer.region_key = public.normalize_location_key(circle.region)) as same_region,
      (viewer.origin_country_code <> '' and viewer.current_country_code <> ''
        and viewer.current_country_code <> viewer.origin_country_code
        and exists (select 1 from unnest(coalesce(circle.diaspora_origin_country_codes, '{}'::text[])) origin(code)
          where upper(btrim(origin.code)) = viewer.origin_country_code)
        and (cardinality(coalesce(circle.diaspora_destination_country_codes, '{}'::text[])) = 0
          or exists (select 1 from unnest(coalesce(circle.diaspora_destination_country_codes, '{}'::text[])) destination(code)
            where upper(btrim(destination.code)) = viewer.current_country_code))) as diaspora_match
    from public.circles circle join viewer on true
    where circle.status = 'approved' and circle.archived_at is null
      and coalesce(circle.access_policy, 'open') <> 'invite_only'
      and coalesce(circle.visibility, 'public') <> 'private'
      and coalesce(circle.visibility_scope, 'country') <> 'invite_only'
  ), scoped as (
    select candidate.* from candidates candidate
    where case lower(btrim(coalesce(p_scope, 'my_country')))
      when 'global' then 'global' = any(candidate.resolved_reaches)
      when 'diaspora' then 'global' = any(candidate.resolved_reaches)
        or ('diaspora' = any(candidate.resolved_reaches) and candidate.diaspora_match)
      when 'near_me' then 'global' = any(candidate.resolved_reaches)
        or ('country' = any(candidate.resolved_reaches) and candidate.same_country)
        or ('local' = any(candidate.resolved_reaches) and candidate.same_country and candidate.same_city)
      else 'global' = any(candidate.resolved_reaches)
        or ('country' = any(candidate.resolved_reaches) and candidate.same_country)
        or ('local' = any(candidate.resolved_reaches) and candidate.same_country and candidate.same_city)
    end
  ), ranked as (
    select scoped.*,
      (case when scoped.is_official then 25 else 0 end
        + case when scoped.is_featured then 20 else 0 end
        + least(18, greatest(0, coalesce(scoped.active_this_week_count, 0)))
        + least(12, floor(greatest(0, coalesce(scoped.member_count, 0)) / 10.0))
        + case when 'local' = any(scoped.resolved_reaches) and scoped.same_city then 45
          when 'country' = any(scoped.resolved_reaches) and scoped.same_country then 35
          when 'diaspora' = any(scoped.resolved_reaches) and scoped.diaspora_match then 32
          when 'global' = any(scoped.resolved_reaches) then 10
          when scoped.same_region then 16 else 0 end)::double precision as computed_relevance_score,
      case when 'local' = any(scoped.resolved_reaches) and scoped.same_city then 'Near you in ' || scoped.city
        when 'country' = any(scoped.resolved_reaches) and scoped.same_country then
          coalesce(nullif(btrim(scoped.country_name), '') || '-based circle', 'In your country')
        when 'diaspora' = any(scoped.resolved_reaches) and scoped.diaspora_match then 'A diaspora Circle for you'
        when 'global' = any(scoped.resolved_reaches) then 'Open globally' else null end as computed_location_insight
    from scoped
  )
  select ranked.id, ranked.name, ranked.slug, ranked.description, ranked.short_description,
    ranked.visibility, ranked.category, ranked.created_by_profile_id, ranked.cover_image_url,
    ranked.icon_url, ranked.image_path, ranked.image_updated_at, ranked.circle_type,
    ranked.status, ranked.visibility_scope, ranked.country_code, ranked.country_name,
    ranked.region, ranked.city, ranked.diaspora_tags, ranked.culture_tags, ranked.faith_tags,
    ranked.interest_tags, ranked.audience_tags, ranked.is_official, ranked.is_partner,
    ranked.is_featured, ranked.requires_join_approval, ranked.member_count,
    ranked.active_this_week_count, ranked.gathering_count, ranked.archived_at,
    ranked.computed_relevance_score, ranked.computed_location_insight
  from ranked
  order by ranked.computed_relevance_score desc, ranked.is_featured desc,
    ranked.member_count desc, ranked.created_at desc
  limit least(greatest(coalesce(p_limit, 48), 1), 100);
$$;

revoke all on function public.get_ranked_circles_for_profile(uuid, text, integer)
from public, anon;
grant execute on function public.get_ranked_circles_for_profile(uuid, text, integer)
to authenticated, service_role;

comment on column public.circles.reach_scopes is
  'Discovery audiences. Global is exclusive; Local or Country may be combined with Diaspora.';
comment on function public.get_ranked_circles_for_profile(uuid, text, integer) is
  'Returns approved public Circles when any configured reach segment matches the authenticated viewer.';
