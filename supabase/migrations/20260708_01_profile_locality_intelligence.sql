alter table public.profiles
  add column if not exists locality_geoname_id bigint,
  add column if not exists locality_district text,
  add column if not exists roots_region text,
  add column if not exists roots_locality text,
  add column if not exists roots_locality_geoname_id bigint;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_locality_geoname_id_fkey'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_locality_geoname_id_fkey
      foreign key (locality_geoname_id)
      references public.ghana_localities (geoname_id)
      on delete set null;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_roots_locality_geoname_id_fkey'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_roots_locality_geoname_id_fkey
      foreign key (roots_locality_geoname_id)
      references public.ghana_localities (geoname_id)
      on delete set null;
  end if;
end $$;

create index if not exists idx_profiles_locality_geoname_id
  on public.profiles (locality_geoname_id)
  where deleted_at is null;

create index if not exists idx_profiles_roots_locality_geoname_id
  on public.profiles (roots_locality_geoname_id)
  where deleted_at is null;

drop function if exists public.search_ghana_localities(text, text, integer);

create or replace function public.search_ghana_localities(
  p_region text default null,
  p_query text default null,
  p_limit integer default 40
)
returns table (
  geoname_id bigint,
  name text,
  region text,
  district text,
  population bigint,
  latitude double precision,
  longitude double precision,
  feature_code text
)
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  with input as (
    select
      nullif(regexp_replace(lower(btrim(coalesce(p_region, ''))), '\s+', ' ', 'g'), '') as region_query,
      nullif(regexp_replace(lower(btrim(regexp_replace(coalesce(p_query, ''), '[^a-zA-Z0-9\s-]+', ' ', 'g'))), '\s+', ' ', 'g'), '') as query_norm,
      greatest(1, least(coalesce(p_limit, 40), 120)) as limit_value
  ),
  tokens as (
    select
      input.region_query,
      input.query_norm,
      array_remove(regexp_split_to_array(coalesce(input.query_norm, ''), '\s+'), '') as query_tokens,
      input.limit_value
    from input
  ),
  ranked as (
    select
      locality.geoname_id,
      locality.name,
      locality.region,
      locality.district,
      locality.population,
      locality.latitude,
      locality.longitude,
      locality.feature_code,
      locality.rank_weight,
      case
        when tokenized.query_norm is null then locality.rank_weight
        else (
          case
            when locality.normalized_name = tokenized.query_norm then 900
            when tokenized.query_norm = any(locality.normalized_aliases) then 860
            when locality.normalized_name like tokenized.query_norm || '%' then 780
            when exists (
              select 1
              from unnest(locality.normalized_aliases) alias_value
              where alias_value like tokenized.query_norm || '%'
            ) then 740
            when locality.search_text like '%' || tokenized.query_norm || '%' then 620
            when not exists (
              select 1
              from unnest(tokenized.query_tokens) token
              where token <> '' and locality.search_text not like '%' || token || '%'
            ) then 540
            else -100000
          end + locality.rank_weight
        )
      end as search_score,
      tokenized.limit_value
    from public.ghana_localities locality
    cross join tokens tokenized
    where (tokenized.region_query is null or locality.normalized_region = tokenized.region_query)
      and (
        tokenized.query_norm is null
        or locality.normalized_name like '%' || tokenized.query_norm || '%'
        or locality.search_text like '%' || tokenized.query_norm || '%'
        or exists (
          select 1
          from unnest(tokenized.query_tokens) token
          where token <> '' and locality.normalized_name like token || '%'
        )
        or not exists (
          select 1
          from unnest(tokenized.query_tokens) token
          where token <> '' and locality.search_text not like '%' || token || '%'
        )
      )
  )
  select
    ranked.geoname_id,
    ranked.name,
    ranked.region,
    ranked.district,
    ranked.population,
    ranked.latitude,
    ranked.longitude,
    ranked.feature_code
  from ranked
  where ranked.search_score > -100000
  order by
    ranked.search_score desc,
    ranked.rank_weight desc,
    ranked.population desc,
    ranked.name asc,
    ranked.geoname_id asc
  limit (select limit_value from tokens limit 1);
$$;

revoke all on function public.search_ghana_localities(text, text, integer) from public;
grant execute on function public.search_ghana_localities(text, text, integer) to authenticated;
