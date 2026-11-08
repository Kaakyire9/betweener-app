begin;

set local role postgres;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select plan(20);

select has_table(
  'public',
  'live_studio_session_operators',
  'Session-scoped Studio operator assignments exist'
);
select has_column(
  'public',
  'live_studio_session_operators',
  'expires_at',
  'Operator assignments expire'
);
select has_column(
  'public',
  'live_studio_session_operators',
  'revoked_at',
  'Operator assignments retain revocation evidence'
);
select col_not_null(
  'public',
  'live_studio_session_operators',
  'session_id',
  'Every assignment belongs to one Live'
);
select col_not_null(
  'public',
  'live_studio_session_operators',
  'user_id',
  'Every assignment belongs to one account'
);
select col_not_null(
  'public',
  'live_studio_session_operators',
  'expires_at',
  'Assignment expiry is mandatory'
);
select has_index(
  'public',
  'live_studio_session_operators',
  'live_studio_session_operators_unique',
  'A user has one authoritative assignment per Live'
);

select ok(
  to_regprocedure('public.live_studio_session_operator_role_v1(uuid,uuid)') is not null,
  'Scoped role resolver exists'
);
select ok(
  to_regprocedure('public.rpc_get_live_studio_session_operators_v1(uuid)') is not null,
  'Admin assignment roster RPC exists'
);
select ok(
  to_regprocedure('public.rpc_admin_assign_live_studio_operator_v1(uuid,text,text,timestamptz,text)') is not null,
  'Admin assignment RPC exists'
);
select ok(
  to_regprocedure('public.rpc_admin_revoke_live_studio_operator_v1(uuid,uuid)') is not null,
  'Admin revocation RPC exists'
);

select ok(
  not has_table_privilege('anon', 'public.live_studio_session_operators', 'SELECT'),
  'Anonymous clients cannot read assignment records'
);
select ok(
  not has_table_privilege('authenticated', 'public.live_studio_session_operators', 'SELECT'),
  'Authenticated clients cannot bypass the guarded roster RPC'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.rpc_admin_assign_live_studio_operator_v1(uuid,text,text,timestamptz,text)',
    'EXECUTE'
  ),
  'Anonymous clients cannot assign operators'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.rpc_admin_assign_live_studio_operator_v1(uuid,text,text,timestamptz,text)',
    'EXECUTE'
  ),
  'Authenticated admins can reach the guarded assignment RPC'
);

select ok(
  position(
    'is_admin_user(auth.uid())'
    in pg_get_functiondef(
      'public.rpc_admin_assign_live_studio_operator_v1(uuid,text,text,timestamptz,text)'::regprocedure
    )
  ) > 0,
  'Assignment is guarded by the server-side admin boundary'
);
select ok(
  position(
    'live_studio_has_aal2_v1()'
    in pg_get_functiondef(
      'public.rpc_admin_assign_live_studio_operator_v1(uuid,text,text,timestamptz,text)'::regprocedure
    )
  ) > 0,
  'Assignment requires AAL2'
);
select ok(
  position(
    'live_studio_has_aal2_v1()'
    in pg_get_functiondef(
      'public.rpc_admin_revoke_live_studio_operator_v1(uuid,uuid)'::regprocedure
    )
  ) > 0,
  'Revocation requires AAL2'
);
select ok(
  position(
    'live_studio_session_operator_role_v1'
    in pg_get_functiondef(
      'public.live_studio_is_authorized_v1(uuid,uuid,text)'::regprocedure
    )
  ) > 0,
  'Studio authorization consumes the scoped assignment'
);
select ok(
  position(
    'v_assignment_role = ''producer'''
    in pg_get_functiondef(
      'public.live_studio_is_authorized_v1(uuid,uuid,text)'::regprocedure
    )
  ) > 0,
  'Only scoped producers receive control and publication capabilities'
);

select * from finish();
rollback;
