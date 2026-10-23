begin;

set local role postgres;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select plan(18);

select ok(
  to_regprocedure('public.relationship_gist_ai_clone_provenance()') is not null,
  'exact provenance trigger-function signature exists'
);
select ok(
  to_regprocedure('public.relationship_gist_ai_enforce_review_gate()') is not null,
  'exact review-gate trigger-function signature exists'
);

select ok(
  not exists (
    select 1
    from pg_catalog.pg_proc function_definition
    cross join lateral pg_catalog.aclexplode(
      coalesce(
        function_definition.proacl,
        pg_catalog.acldefault('f', function_definition.proowner)
      )
    ) function_acl
    where function_definition.oid =
      'public.relationship_gist_ai_clone_provenance()'::regprocedure::oid
      and function_acl.grantee = 0
      and function_acl.privilege_type = 'EXECUTE'
  ),
  'PUBLIC cannot execute the provenance trigger function'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.relationship_gist_ai_clone_provenance()',
    'EXECUTE'
  ),
  'anonymous callers cannot execute the provenance trigger function'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.relationship_gist_ai_clone_provenance()',
    'EXECUTE'
  ),
  'authenticated callers cannot execute the provenance trigger function'
);
select ok(
  not has_function_privilege(
    'service_role',
    'public.relationship_gist_ai_clone_provenance()',
    'EXECUTE'
  ),
  'service role cannot directly execute the provenance trigger function'
);

select ok(
  not exists (
    select 1
    from pg_catalog.pg_proc function_definition
    cross join lateral pg_catalog.aclexplode(
      coalesce(
        function_definition.proacl,
        pg_catalog.acldefault('f', function_definition.proowner)
      )
    ) function_acl
    where function_definition.oid =
      'public.relationship_gist_ai_enforce_review_gate()'::regprocedure::oid
      and function_acl.grantee = 0
      and function_acl.privilege_type = 'EXECUTE'
  ),
  'PUBLIC cannot execute the review-gate trigger function'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.relationship_gist_ai_enforce_review_gate()',
    'EXECUTE'
  ),
  'anonymous callers cannot execute the review-gate trigger function'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.relationship_gist_ai_enforce_review_gate()',
    'EXECUTE'
  ),
  'authenticated callers cannot execute the review-gate trigger function'
);
select ok(
  not has_function_privilege(
    'service_role',
    'public.relationship_gist_ai_enforce_review_gate()',
    'EXECUTE'
  ),
  'service role cannot directly execute the review-gate trigger function'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_trigger trigger_definition
    where trigger_definition.tgname = 'relationship_gist_ai_clone_provenance_trigger'
      and trigger_definition.tgrelid = 'public.relationship_gist_revisions'::regclass
      and trigger_definition.tgfoid =
        'public.relationship_gist_ai_clone_provenance()'::regprocedure::oid
      and not trigger_definition.tgisinternal
      and trigger_definition.tgenabled <> 'D'
  ),
  'provenance trigger remains enabled and bound to its exact function'
);
select ok(
  exists (
    select 1
    from pg_catalog.pg_trigger trigger_definition
    where trigger_definition.tgname = 'relationship_gist_ai_review_gate_trigger'
      and trigger_definition.tgrelid = 'public.relationship_gist_revisions'::regclass
      and trigger_definition.tgfoid =
        'public.relationship_gist_ai_enforce_review_gate()'::regprocedure::oid
      and not trigger_definition.tgisinternal
      and trigger_definition.tgenabled <> 'D'
  ),
  'review-gate trigger remains enabled and bound to its exact function'
);

select ok(
  to_regprocedure('public.rpc_get_global_relationship_gists()') is not null,
  'legacy Gist reader RPC remains available'
);
select ok(
  to_regprocedure(
    'public.rpc_upsert_relationship_gist_user_state(uuid,boolean,double precision,timestamp with time zone,boolean,text)'
  ) is not null,
  'legacy Gist reader-state RPC signature remains available'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.rpc_get_global_relationship_gists()',
    'EXECUTE'
  ),
  'authenticated readers retain access to the legacy Gist reader RPC'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.rpc_get_my_relationship_gist_editorial_permissions()',
    'EXECUTE'
  ),
  'authenticated editorial clients retain access to the guarded permissions RPC'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.rpc_get_my_relationship_gist_editorial_permissions()',
    'EXECUTE'
  ),
  'anonymous callers remain excluded from editorial permissions'
);
select ok(
  to_regprocedure(
    'public.rpc_transition_relationship_gist_revision(uuid,text,timestamp with time zone,text)'
  ) is not null,
  'editorial transition RPC signature remains available'
);

select * from finish();
rollback;
