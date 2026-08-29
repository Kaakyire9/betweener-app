-- Run after 20260820203000_harden_public_location_views.sql.
-- One row with every boolean true is the expected result.

with relation_security as (
  select
    n.nspname as schema_name,
    c.relname,
    c.relkind,
    c.relrowsecurity,
    coalesce(c.reloptions, array[]::text[]) as reloptions
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname in (
      'profile_location_features',
      'circle_location_features'
    )
)
select
  coalesce((
    select reloptions @> array['security_invoker=true']
    from relation_security
    where relname = 'profile_location_features' and relkind = 'v'
  ), false) as profile_location_security_invoker,
  coalesce((
    select reloptions @> array['security_invoker=true']
    from relation_security
    where relname = 'circle_location_features' and relkind = 'v'
  ), false) as circle_location_security_invoker,
  (
    select count(*) = 2
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in ('profiles', 'circles')
      and c.relkind = 'r'
      and c.relrowsecurity
  ) as base_relations_rls_enabled,
  pg_catalog.has_table_privilege(
    'authenticated', 'public.profile_location_features', 'SELECT'
  ) as profile_location_authenticated_readable,
  pg_catalog.has_table_privilege(
    'authenticated', 'public.circle_location_features', 'SELECT'
  ) as circle_location_authenticated_readable,
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
  ) as invoker_dependencies_readable,
  not (
    pg_catalog.has_table_privilege('anon', 'public.profile_location_features', 'INSERT')
    or pg_catalog.has_table_privilege('authenticated', 'public.profile_location_features', 'UPDATE')
    or pg_catalog.has_table_privilege('anon', 'public.circle_location_features', 'DELETE')
    or pg_catalog.has_table_privilege('authenticated', 'public.circle_location_features', 'INSERT')
  ) as client_write_privileges_removed;
