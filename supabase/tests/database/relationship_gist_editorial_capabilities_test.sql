begin;

set local role postgres;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select plan(23);

insert into auth.users(id, email) values
  ('a1100000-0000-4000-8000-000000000001', 'gist-operations@example.invalid'),
  ('a1100000-0000-4000-8000-000000000002', 'gist-moderation@example.invalid'),
  ('a1100000-0000-4000-8000-000000000003', 'gist-support@example.invalid'),
  ('a1100000-0000-4000-8000-000000000004', 'gist-super@example.invalid'),
  ('a1100000-0000-4000-8000-000000000005', 'gist-member@example.invalid')
on conflict (id) do nothing;

insert into public.internal_admins(user_id, email, role) values
  ('a1100000-0000-4000-8000-000000000001', 'gist-operations@example.invalid', 'operations'),
  ('a1100000-0000-4000-8000-000000000002', 'gist-moderation@example.invalid', 'moderation'),
  ('a1100000-0000-4000-8000-000000000003', 'gist-support@example.invalid', 'support'),
  ('a1100000-0000-4000-8000-000000000004', 'gist-super@example.invalid', 'super_admin')
on conflict (user_id) do update set role = excluded.role;

select ok(
  to_regprocedure('public.has_relationship_gist_editorial_capability(text,uuid)') is not null,
  'action-specific editorial predicate exists'
);
select ok(
  to_regprocedure('public.rpc_get_my_relationship_gist_editorial_permissions()') is not null,
  'client-readable editorial permission RPC exists'
);
select ok(
  not has_function_privilege('anon', 'public.rpc_get_my_relationship_gist_editorial_permissions()', 'EXECUTE'),
  'anonymous users cannot inspect editorial permissions'
);
select ok(
  has_function_privilege('authenticated', 'public.rpc_get_my_relationship_gist_editorial_permissions()', 'EXECUTE'),
  'authenticated users can request their own fail-closed permission map'
);

select ok(public.has_relationship_gist_editorial_capability('read', 'a1100000-0000-4000-8000-000000000001'), 'operations can read');
select ok(public.has_relationship_gist_editorial_capability('draft', 'a1100000-0000-4000-8000-000000000001'), 'operations can draft');
select ok(public.has_relationship_gist_editorial_capability('publish', 'a1100000-0000-4000-8000-000000000001'), 'operations can publish');
select ok(public.has_relationship_gist_editorial_capability('archive', 'a1100000-0000-4000-8000-000000000001'), 'operations can archive');
select ok(not public.has_relationship_gist_editorial_capability('quality_approve', 'a1100000-0000-4000-8000-000000000001'), 'operations cannot quality-approve');
select ok(not public.has_relationship_gist_editorial_capability('safety_review', 'a1100000-0000-4000-8000-000000000001'), 'operations cannot safety-review');

select ok(public.has_relationship_gist_editorial_capability('read', 'a1100000-0000-4000-8000-000000000002'), 'moderation can read');
select ok(public.has_relationship_gist_editorial_capability('safety_review', 'a1100000-0000-4000-8000-000000000002'), 'moderation can safety-review');
select ok(not public.has_relationship_gist_editorial_capability('draft', 'a1100000-0000-4000-8000-000000000002'), 'moderation cannot draft');
select ok(not public.has_relationship_gist_editorial_capability('quality_approve', 'a1100000-0000-4000-8000-000000000002'), 'moderation cannot quality-approve');
select ok(not public.has_relationship_gist_editorial_capability('publish', 'a1100000-0000-4000-8000-000000000002'), 'moderation cannot publish');
select ok(not public.has_relationship_gist_editorial_capability('archive', 'a1100000-0000-4000-8000-000000000002'), 'moderation cannot archive');

select ok(
  not exists (
    select 1 from unnest(array['read','draft','quality_approve','safety_review','publish','archive']) action
    where public.has_relationship_gist_editorial_capability(action, 'a1100000-0000-4000-8000-000000000003')
  ),
  'support has no Relationship Gist editorial authority'
);
select ok(
  not exists (
    select 1 from unnest(array['read','draft','quality_approve','safety_review','publish','archive']) action
    where public.has_relationship_gist_editorial_capability(action, 'a1100000-0000-4000-8000-000000000005')
  ),
  'non-admin members have no Relationship Gist editorial authority'
);
select ok(
  not exists (
    select 1 from unnest(array['read','draft','quality_approve','safety_review','publish','archive']) action
    where not public.has_relationship_gist_editorial_capability(action, 'a1100000-0000-4000-8000-000000000004')
  ),
  'super-admin has all explicitly defined actions'
);

select ok(
  position('is_admin_user' in pg_get_functiondef(
    'public.rpc_admin_get_relationship_gists()'::regprocedure
  )) = 0,
  'editorial list no longer uses broad admin authorization'
);
select ok(
  position('is_admin_user' in pg_get_functiondef(
    'public.rpc_upsert_relationship_gist_editorial(uuid,uuid,text,text,text,text,text)'::regprocedure
  )) = 0,
  'editorial upsert no longer uses broad admin authorization'
);
select ok(
  position('is_admin_user' in pg_get_functiondef(
    'public.rpc_publish_relationship_gist(uuid)'::regprocedure
  )) = 0,
  'publication no longer uses broad admin authorization'
);

select ok(
  not has_function_privilege('anon', 'public.rpc_admin_get_relationship_gists()', 'EXECUTE'),
  'anonymous users cannot invoke the editorial queue'
);

select * from finish();
rollback;
