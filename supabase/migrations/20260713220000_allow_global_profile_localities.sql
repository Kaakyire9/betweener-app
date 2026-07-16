-- The locality hierarchy trigger validates profile locality IDs against either
-- global_localities or ghana_localities. The legacy Ghana-only foreign key must
-- therefore be removed; a single foreign key cannot reference both catalogs.

do $$
begin
  if to_regclass('public.global_localities') is null
     or to_regprocedure('public.enforce_profile_locality_hierarchy()') is null
     or not exists (
       select 1
       from pg_catalog.pg_trigger trigger_row
       join pg_catalog.pg_class table_row on table_row.oid = trigger_row.tgrelid
       join pg_catalog.pg_namespace schema_row on schema_row.oid = table_row.relnamespace
       where schema_row.nspname = 'public'
         and table_row.relname = 'profiles'
         and trigger_row.tgname = 'trg_profiles_enforce_locality_hierarchy'
         and not trigger_row.tgisinternal
         and trigger_row.tgenabled <> 'D'
     ) then
    raise exception 'Global locality validation must be installed before removing the Ghana-only foreign key.';
  end if;
end;
$$;

alter table public.profiles
  drop constraint if exists profiles_locality_geoname_id_fkey;

comment on column public.profiles.locality_geoname_id is
  'Canonical GeoNames ID validated by enforce_profile_locality_hierarchy against global_localities or ghana_localities.';
