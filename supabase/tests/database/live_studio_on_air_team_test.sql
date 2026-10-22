begin;

set local role postgres;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select plan(21);

select has_table('public', 'live_session_on_air_hosts', 'On-air host assignments exist');
select has_table('public', 'live_studio_team_updates', 'Private team revision stream exists');
select has_column('public', 'live_session_on_air_hosts', 'expires_at', 'Co-host access expires');
select has_column('public', 'live_session_on_air_hosts', 'revoked_at', 'Co-host revocation is retained');
select has_index(
  'public',
  'live_session_on_air_hosts',
  'live_session_on_air_hosts_unique',
  'A person has one on-air host assignment per Live'
);

select ok(
  to_regprocedure('public.live_session_has_active_on_air_host_v1(uuid,uuid)') is not null,
  'Active on-air host resolver exists'
);
select ok(
  to_regprocedure('public.rpc_get_live_studio_team_v1(uuid)') is not null,
  'Studio team snapshot exists'
);
select ok(
  to_regprocedure('public.rpc_admin_assign_live_on_air_host_v1(uuid,text,text)') is not null,
  'On-air host assignment RPC exists'
);
select ok(
  to_regprocedure('public.rpc_admin_revoke_live_on_air_host_v1(uuid,uuid)') is not null,
  'On-air host revocation RPC exists'
);
select ok(
  to_regprocedure('private.live_studio_can_receive_team_updates_v1(uuid)') is not null,
  'Realtime authorization helper is private'
);
select ok(
  to_regprocedure('public.live_studio_can_receive_team_updates_v1(uuid,uuid)') is null,
  'Realtime authorization helper is not exposed as a public RPC'
);

select ok(
  not has_table_privilege('anon', 'public.live_session_on_air_hosts', 'SELECT'),
  'Anonymous clients cannot read the private host roster'
);
select ok(
  not has_table_privilege('authenticated', 'public.live_session_on_air_hosts', 'SELECT'),
  'Authenticated clients cannot bypass the host roster RPC'
);
select ok(
  has_table_privilege('authenticated', 'public.live_studio_team_updates', 'SELECT'),
  'Authorized clients can receive team revision signals through RLS'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.rpc_admin_assign_live_on_air_host_v1(uuid,text,text)',
    'EXECUTE'
  ),
  'Anonymous clients cannot assign co-hosts'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.rpc_admin_assign_live_on_air_host_v1(uuid,text,text)',
    'EXECUTE'
  ),
  'Authenticated admins can reach the guarded co-host RPC'
);
select ok(
  position(
    'is_admin_user(auth.uid())'
    in pg_get_functiondef(
      'public.rpc_admin_assign_live_on_air_host_v1(uuid,text,text)'::regprocedure
    )
  ) > 0,
  'Co-host assignment is server-side admin guarded'
);
select ok(
  position(
    'live_studio_has_aal2_v1()'
    in pg_get_functiondef(
      'public.rpc_admin_assign_live_on_air_host_v1(uuid,text,text)'::regprocedure
    )
  ) > 0,
  'Co-host assignment requires AAL2'
);
select ok(
  position(
    'live_session_has_active_on_air_host_v1'
    in pg_get_functiondef('public.resolve_live_capabilities(uuid,uuid)'::regprocedure)
  ) > 0,
  'Active co-hosts inherit the existing host capability set'
);
select ok(
  position(
    'update public.live_sessions'
    in lower(pg_get_functiondef(
      'public.rpc_admin_assign_live_on_air_host_v1(uuid,text,text)'::regprocedure
    ))
  ) = 0,
  'Co-host assignment never rewrites creator ownership'
);
select ok(
  position(
    '''live'''
    in pg_get_functiondef(
      'public.rpc_admin_assign_live_on_air_host_v1(uuid,text,text)'::regprocedure
    )
  ) > 0,
  'Co-host assignment remains available while on air'
);

select * from finish();
rollback;
