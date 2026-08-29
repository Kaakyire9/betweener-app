-- Run before 20260820203000_harden_public_location_views.sql.
-- One row with every boolean true means the migration can preserve the
-- existing API read contract while closing both actionable view advisories.

select
  current_setting('server_version_num')::integer >= 150000
    as postgres_supports_security_invoker,
  to_regclass('public.profile_location_features') is not null
    as profile_location_view_present,
  to_regclass('public.circle_location_features') is not null
    as circle_location_view_present,
  (
    select count(*) = 2
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in ('profiles', 'circles')
      and c.relkind = 'r'
      and c.relrowsecurity
  ) as base_relations_rls_enabled,
  (
    pg_catalog.has_table_privilege('anon', 'public.profiles', 'SELECT')
    and pg_catalog.has_table_privilege('authenticated', 'public.profiles', 'SELECT')
    and pg_catalog.has_table_privilege('anon', 'public.circles', 'SELECT')
    and pg_catalog.has_table_privilege('authenticated', 'public.circles', 'SELECT')
    and pg_catalog.has_function_privilege(
      'anon', 'public.normalize_location_key(text)', 'EXECUTE'
    )
    and pg_catalog.has_function_privilege(
      'authenticated', 'public.normalize_location_key(text)', 'EXECUTE'
    )
  ) as invoker_dependencies_readable;
