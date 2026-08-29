-- Read-only evidence for the Supabase-managed spatial_ref_sys advisory.
-- Attach this result and SQLSTATE 42501 to a Supabase support ticket. Do not
-- drop/reinstall PostGIS or move it in production merely to silence the lint.

with spatial_catalog as (
  select
    c.oid,
    n.nspname as schema_name,
    c.relname,
    pg_catalog.pg_get_userbyid(c.relowner) as owner_name,
    c.relrowsecurity,
    exists (
      select 1
      from pg_catalog.pg_depend d
      join pg_catalog.pg_extension e on e.oid = d.refobjid
      where d.classid = 'pg_class'::regclass
        and d.objid = c.oid
        and d.deptype = 'e'
        and e.extname = 'postgis'
    ) as managed_by_postgis
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'spatial_ref_sys'
    and c.relkind = 'r'
)
select
  current_user as diagnostic_role,
  schema_name,
  relname,
  owner_name,
  relrowsecurity as rls_enabled,
  managed_by_postgis,
  owner_name <> current_user as customer_migration_is_not_owner
from spatial_catalog;
