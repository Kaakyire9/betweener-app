-- Canonical worldwide locality cache. GeoNames is the initial provider, but
-- profiles depend only on the stable canonical columns below.

create table if not exists public.global_localities (
  geoname_id bigint primary key,
  name text not null,
  ascii_name text,
  country_code text not null check (country_code ~ '^[A-Z]{2}$'),
  country_name text not null,
  admin1_code text,
  admin1_name text,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  population bigint not null default 0 check (population >= 0),
  feature_code text not null,
  timezone text,
  normalized_name text generated always as (public.normalize_location_key(name)) stored,
  search_text text not null,
  provider text not null default 'geonames',
  refreshed_at timestamptz not null default timezone('utc', now())
);

alter table public.global_localities enable row level security;

create index if not exists idx_global_localities_country_name
  on public.global_localities (country_code, normalized_name, population desc);
create index if not exists idx_global_localities_country_rank
  on public.global_localities (country_code, population desc, name);

drop policy if exists "Authenticated users can read global localities" on public.global_localities;
create policy "Authenticated users can read global localities"
  on public.global_localities for select to authenticated using (true);

alter table public.profiles
  add column if not exists locality_admin1_code text,
  add column if not exists locality_provider text;

comment on table public.global_localities is
  'Country-aware canonical city/town cache. Provider writes occur through trusted server code.';
comment on column public.profiles.locality_geoname_id is
  'Stable GeoNames locality identifier for Ghana and worldwide city-level selections.';
comment on column public.profiles.locality_admin1_code is
  'Provider administrative level-1 code associated with the selected locality.';
comment on column public.profiles.locality_provider is
  'Canonical locality source, currently geonames; null for free text or GPS-only records.';

create or replace function public.enforce_profile_locality_hierarchy()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_global public.global_localities%rowtype;
  v_ghana public.ghana_localities%rowtype;
begin
  if new.location_precision::text = 'EXACT' then
    new.locality_geoname_id := null;
    new.locality_district := null;
    new.locality_admin1_code := null;
    new.locality_provider := null;
    return new;
  end if;

  if new.locality_geoname_id is null then
    new.locality_admin1_code := null;
    new.locality_provider := null;
    return new;
  end if;

  select * into v_global from public.global_localities
  where geoname_id = new.locality_geoname_id limit 1;
  if found then
    new.city := v_global.name;
    new.region := v_global.admin1_name;
    new.current_country := v_global.country_name;
    new.current_country_code := v_global.country_code;
    new.locality_district := v_global.admin1_name;
    new.locality_admin1_code := v_global.admin1_code;
    new.locality_provider := v_global.provider;
    new.latitude := v_global.latitude;
    new.longitude := v_global.longitude;
    new.location := v_global.name || ', ' || v_global.country_name;
    new.location_precision := 'CITY';
    return new;
  end if;

  select * into v_ghana from public.ghana_localities
  where geoname_id = new.locality_geoname_id limit 1;
  if found then
    new.city := v_ghana.name;
    new.region := v_ghana.region;
    new.current_country := 'Ghana';
    new.current_country_code := 'GH';
    new.locality_district := v_ghana.district;
    new.locality_admin1_code := null;
    new.locality_provider := 'geonames';
    new.latitude := v_ghana.latitude;
    new.longitude := v_ghana.longitude;
    new.location := v_ghana.name || ', Ghana';
    new.location_precision := 'CITY';
    return new;
  end if;

  raise exception 'Unknown canonical locality id: %', new.locality_geoname_id
    using errcode = '23503';
end;
$$;

drop trigger if exists trg_profiles_enforce_locality_hierarchy on public.profiles;
create trigger trg_profiles_enforce_locality_hierarchy
before insert or update on public.profiles
for each row execute function public.enforce_profile_locality_hierarchy();

create or replace function public.get_global_locality(p_geoname_id bigint)
returns table (
  geoname_id bigint,
  name text,
  country_code text,
  country_name text,
  admin1_code text,
  admin1_name text,
  latitude double precision,
  longitude double precision,
  population bigint,
  feature_code text,
  timezone text,
  provider text
)
language sql stable security definer
set search_path = public, pg_catalog
as $$
  select l.geoname_id, l.name, l.country_code, l.country_name,
    l.admin1_code, l.admin1_name, l.latitude, l.longitude,
    l.population, l.feature_code, l.timezone, l.provider
  from public.global_localities l
  where l.geoname_id = p_geoname_id
  limit 1;
$$;

revoke all on function public.get_global_locality(bigint) from public;
grant execute on function public.get_global_locality(bigint) to authenticated;
