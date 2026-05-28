alter table public.profiles
  add column if not exists origin_country text,
  add column if not exists origin_country_code text,
  add column if not exists origin_country_source text not null default 'unknown';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_origin_country_source_check'
  ) then
    alter table public.profiles
      add constraint profiles_origin_country_source_check
      check (origin_country_source in ('unknown', 'explicit', 'residence_backfill'));
  end if;
end
$$;

create index if not exists profiles_origin_country_code_idx
  on public.profiles (origin_country_code)
  where origin_country_code is not null;

create index if not exists profiles_origin_country_idx
  on public.profiles (origin_country)
  where origin_country is not null;

update public.profiles
set
  origin_country = 'Ghana',
  origin_country_code = 'GH',
  origin_country_source = 'residence_backfill'
where coalesce(nullif(btrim(coalesce(origin_country_code, '')), ''), nullif(btrim(coalesce(origin_country, '')), '')) is null
  and (
    upper(coalesce(current_country_code, '')) = 'GH'
    or lower(btrim(coalesce(current_country, ''))) = 'ghana'
  );
