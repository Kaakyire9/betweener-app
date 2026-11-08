begin;

set local role postgres;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select plan(5);

select ok(
  to_regprocedure('public.rpc_service_get_live_broadcast_snapshot_v1(uuid,uuid,bigint)') is not null,
  'Fenced compositor snapshot RPC exists'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.rpc_service_get_live_broadcast_snapshot_v1(uuid,uuid,bigint)',
    'EXECUTE'
  ),
  'Anonymous callers cannot read compositor snapshots'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.rpc_service_get_live_broadcast_snapshot_v1(uuid,uuid,bigint)',
    'EXECUTE'
  ),
  'Members cannot read compositor snapshots'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.rpc_service_get_live_broadcast_snapshot_v1(uuid,uuid,bigint)',
    'EXECUTE'
  ),
  'Service role can read fenced compositor snapshots'
);
select function_returns(
  'public',
  'rpc_service_get_live_broadcast_snapshot_v1',
  array['uuid', 'uuid', 'bigint'],
  'jsonb',
  'Compositor snapshot returns JSON'
);

select * from finish();
rollback;
