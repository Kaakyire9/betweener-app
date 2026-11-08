with checks(name, passed) as (
  values
    ('host_table_exists', to_regclass('public.live_session_on_air_hosts') is not null),
    ('updates_table_exists', to_regclass('public.live_studio_team_updates') is not null),
    ('host_table_rls', coalesce((
      select relrowsecurity and relforcerowsecurity
      from pg_class
      where oid = 'public.live_session_on_air_hosts'::regclass
    ), false)),
    ('updates_table_rls', coalesce((
      select relrowsecurity and relforcerowsecurity
      from pg_class
      where oid = 'public.live_studio_team_updates'::regclass
    ), false)),
    ('host_roster_private',
      not has_table_privilege('authenticated', 'public.live_session_on_air_hosts', 'select')
      and not has_table_privilege('anon', 'public.live_session_on_air_hosts', 'select')),
    ('updates_authenticated_select',
      has_table_privilege('authenticated', 'public.live_studio_team_updates', 'select')),
    ('helper_private',
      to_regprocedure('private.live_studio_can_receive_team_updates_v1(uuid)') is not null),
    ('helper_not_public',
      to_regprocedure('public.live_studio_can_receive_team_updates_v1(uuid,uuid)') is null),
    ('team_snapshot_rpc',
      to_regprocedure('public.rpc_get_live_studio_team_v1(uuid)') is not null),
    ('assign_rpc',
      to_regprocedure('public.rpc_admin_assign_live_on_air_host_v1(uuid,text,text)') is not null),
    ('revoke_rpc',
      to_regprocedure('public.rpc_admin_revoke_live_on_air_host_v1(uuid,uuid)') is not null),
    ('anon_cannot_assign', not has_function_privilege(
      'anon',
      'public.rpc_admin_assign_live_on_air_host_v1(uuid,text,text)',
      'execute'
    )),
    ('authenticated_can_assign_guarded_rpc', has_function_privilege(
      'authenticated',
      'public.rpc_admin_assign_live_on_air_host_v1(uuid,text,text)',
      'execute'
    )),
    ('assign_admin_guard', position(
      'is_admin_user(auth.uid())'
      in pg_get_functiondef(
        'public.rpc_admin_assign_live_on_air_host_v1(uuid,text,text)'::regprocedure
      )
    ) > 0),
    ('assign_aal2_guard', position(
      'live_studio_has_aal2_v1()'
      in pg_get_functiondef(
        'public.rpc_admin_assign_live_on_air_host_v1(uuid,text,text)'::regprocedure
      )
    ) > 0),
    ('realtime_policy_uses_private_helper', coalesce((
      select position('private.live_studio_can_receive_team_updates_v1' in qual) > 0
      from pg_policies
      where schemaname = 'public'
        and tablename = 'live_studio_team_updates'
        and policyname = 'live_studio_team_updates_select_authorized'
    ), false)),
    ('realtime_publication', exists(
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'live_studio_team_updates'
    )),
    ('team_revision_triggers', (
      select count(*) = 2
      from pg_trigger
      where not tgisinternal
        and tgname in (
          'live_studio_session_operators_team_revision',
          'live_session_on_air_hosts_team_revision'
        )
    )),
    ('cohost_capabilities', position(
      'live_session_has_active_on_air_host_v1'
      in pg_get_functiondef('public.resolve_live_capabilities(uuid,uuid)'::regprocedure)
    ) > 0),
    ('mobile_manage_contract', position(
      'canManageSession'
      in pg_get_functiondef('public.rpc_get_live_hosting_management_v1(uuid)'::regprocedure)
    ) > 0)
)
select
  count(*) as checks,
  count(*) filter (where passed) as passed,
  count(*) filter (where not passed) as blockers,
  coalesce(
    jsonb_agg(name order by name) filter (where not passed),
    '[]'::jsonb
  ) as failed
from checks;
