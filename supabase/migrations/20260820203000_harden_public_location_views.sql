-- Resolve the two actionable Supabase Security Advisor findings without
-- recreating the views or changing their result shapes. The PostGIS-owned
-- public.spatial_ref_sys advisory cannot be changed by a customer migration;
-- attempting to alter it aborts with SQLSTATE 42501 on managed Supabase.

begin;

-- security_invoker makes base-table grants and RLS authoritative. ALTER VIEW
-- preserves the view OID, dependent functions, generated API types and shape.
alter view public.profile_location_features set (security_invoker = true);
alter view public.circle_location_features set (security_invoker = true);

-- Both views are projections and must never be a client-side write surface.
-- Preserve the existing read contract for anon/authenticated callers; RLS on
-- profiles and circles now decides which underlying rows each caller can see.
revoke all privileges on table public.profile_location_features
  from public, anon, authenticated, service_role;
revoke all privileges on table public.circle_location_features
  from public, anon, authenticated, service_role;

grant select on table public.profile_location_features
  to anon, authenticated, service_role;
grant select on table public.circle_location_features
  to anon, authenticated, service_role;

comment on view public.profile_location_features is
  'RLS-aware normalized location projection for profiles; read-only to API roles.';
comment on view public.circle_location_features is
  'RLS-aware normalized location projection for circles; read-only to API roles.';

-- Fail atomically if the intended protections were not installed. This keeps a
-- partially hardened schema from being recorded as a successful migration.
do $$
declare
  v_profile_options text[];
  v_circle_options text[];
begin
  select coalesce(c.reloptions, array[]::text[])
    into v_profile_options
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'profile_location_features'
    and c.relkind = 'v';

  select coalesce(c.reloptions, array[]::text[])
    into v_circle_options
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'circle_location_features'
    and c.relkind = 'v';

  if not coalesce(v_profile_options @> array['security_invoker=true'], false) then
    raise exception 'profile_location_features_security_invoker_missing';
  end if;

  if not coalesce(v_circle_options @> array['security_invoker=true'], false) then
    raise exception 'circle_location_features_security_invoker_missing';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in ('profiles', 'circles')
      and c.relkind = 'r'
      and c.relrowsecurity
    group by n.nspname
    having count(*) = 2
  ) then
    raise exception 'public_location_view_base_relation_rls_missing';
  end if;

  -- A security-invoker view needs the caller to retain SELECT on its base
  -- relation and EXECUTE on helper functions. Assert the pre-existing API
  -- contract instead of silently turning a security fix into an outage.
  if not (
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
  ) then
    raise exception 'public_location_view_invoker_dependency_privilege_missing';
  end if;

  if pg_catalog.has_table_privilege('anon', 'public.profile_location_features', 'INSERT')
     or pg_catalog.has_table_privilege('authenticated', 'public.profile_location_features', 'UPDATE')
     or pg_catalog.has_table_privilege('anon', 'public.circle_location_features', 'DELETE')
     or pg_catalog.has_table_privilege('authenticated', 'public.circle_location_features', 'INSERT') then
    raise exception 'public_location_surface_write_privilege_present';
  end if;
end
$$;

commit;
