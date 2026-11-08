begin;

set local role postgres;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select plan(43);

select has_table('public', 'relationship_gist_editions', 'stable Gist editions exist');
select has_table('public', 'relationship_gist_revisions', 'immutable Gist revisions exist');
select has_table('public', 'relationship_gist_revision_variants', 'perspective variants exist');
select has_table('public', 'relationship_gist_editorial_audit_events', 'editorial audit events exist');
select ok(to_regprocedure('public.rpc_create_relationship_gist_revision(uuid,uuid,uuid,text,text,text,text,boolean)') is not null, 'revision creation RPC exists');
select ok(to_regprocedure('public.rpc_transition_relationship_gist_revision(uuid,text,timestamp with time zone,text)') is not null, 'transition RPC exists');
select ok(to_regprocedure('public.rpc_get_my_saved_relationship_gists(text)') is not null, 'saved library RPC exists');
select ok(to_regprocedure('public.rpc_get_global_relationship_gists()') is not null, 'legacy global reader RPC remains');
select ok(to_regprocedure('public.rpc_upsert_relationship_gist_user_state(uuid,boolean,double precision,timestamp with time zone,boolean,text)') is not null, 'legacy state RPC remains');
select ok(not has_function_privilege('anon', 'public.rpc_create_relationship_gist_revision(uuid,uuid,uuid,text,text,text,text,boolean)', 'EXECUTE'), 'anonymous revision creation is denied');

insert into auth.users(id, email) values
  ('c3300000-0000-4000-8000-000000000001', 'gist-author@example.invalid'),
  ('c3300000-0000-4000-8000-000000000002', 'gist-quality@example.invalid'),
  ('c3300000-0000-4000-8000-000000000003', 'gist-safety@example.invalid'),
  ('c3300000-0000-4000-8000-000000000004', 'gist-publisher@example.invalid'),
  ('c3300000-0000-4000-8000-000000000005', 'gist-reader@example.invalid')
on conflict (id) do nothing;

select set_config('app.profile_guard_write', 'on', true);
insert into public.profiles(id, user_id, full_name) values
  ('c3300000-0000-4000-8000-000000000011', 'c3300000-0000-4000-8000-000000000001', 'Gist author'),
  ('c3300000-0000-4000-8000-000000000012', 'c3300000-0000-4000-8000-000000000002', 'Gist quality'),
  ('c3300000-0000-4000-8000-000000000013', 'c3300000-0000-4000-8000-000000000003', 'Gist safety'),
  ('c3300000-0000-4000-8000-000000000014', 'c3300000-0000-4000-8000-000000000004', 'Gist publisher'),
  ('c3300000-0000-4000-8000-000000000015', 'c3300000-0000-4000-8000-000000000005', 'Gist reader')
on conflict (user_id) do update set full_name = excluded.full_name;

insert into public.internal_admins(user_id, email, role) values
  ('c3300000-0000-4000-8000-000000000001', 'gist-author@example.invalid', 'super_admin'),
  ('c3300000-0000-4000-8000-000000000002', 'gist-quality@example.invalid', 'super_admin'),
  ('c3300000-0000-4000-8000-000000000003', 'gist-safety@example.invalid', 'moderation'),
  ('c3300000-0000-4000-8000-000000000004', 'gist-publisher@example.invalid', 'operations')
on conflict (user_id) do update set role = excluded.role;

create temporary table gist_v2_results(label text primary key, result jsonb not null) on commit drop;
create temporary table gist_v2_errors(label text primary key, error_code text not null, error_message text not null) on commit drop;

select set_config('request.jwt.claim.sub', 'c3300000-0000-4000-8000-000000000001', true);
insert into gist_v2_results(label, result)
select 'create', public.rpc_create_relationship_gist_revision(
  null, null, null, 'Respecting a clear no', 'Boundaries protect clarity.',
  'A clear no deserves respect. Healthy connection never requires pressure or persuasion.',
  'general', true
);

insert into gist_v2_results(label, result)
select 'variant', public.rpc_add_relationship_gist_revision_variant(
  (select (result ->> 'revision_id')::uuid from gist_v2_results where label = 'create'),
  'Respecting a clear no', 'Boundaries protect dignity.',
  'Christian reflection can honour dignity while keeping consent and safety non-negotiable.',
  'christian'
);

select is((select result ->> 'status' from gist_v2_results where label = 'create'), 'draft', 'new edition starts as a draft');
select is((select count(*)::integer from public.relationship_gist_revision_variants where revision_id = (select (result ->> 'revision_id')::uuid from gist_v2_results where label = 'create')), 2, 'one revision can hold immutable perspective variants');
select is(
  (select perspectives from public.rpc_admin_get_relationship_gist_editions() where revision_id = (select (result ->> 'revision_id')::uuid from gist_v2_results where label = 'create')),
  array['christian','general']::text[],
  'editorial workspace exposes every explicit perspective on a revision'
);

insert into gist_v2_results(label, result)
select 'submit', public.rpc_transition_relationship_gist_revision(
  (select (result ->> 'revision_id')::uuid from gist_v2_results where label = 'create'),
  'submit', null, null
);
select is((select result ->> 'status' from gist_v2_results where label = 'submit'), 'in_review', 'draft submits into review');

do $$ begin
  perform public.rpc_transition_relationship_gist_revision(
    (select (result ->> 'revision_id')::uuid from gist_v2_results where label = 'create'),
    'quality_approve', null, null
  );
exception when others then
  insert into gist_v2_errors values ('self-quality', sqlstate, sqlerrm);
end $$;
select is((select error_message from gist_v2_errors where label = 'self-quality'), 'gist_self_approval_forbidden', 'authors cannot quality-approve their own revision');

select set_config('request.jwt.claim.sub', 'c3300000-0000-4000-8000-000000000002', true);
insert into gist_v2_results(label, result)
select 'quality', public.rpc_transition_relationship_gist_revision(
  (select (result ->> 'revision_id')::uuid from gist_v2_results where label = 'create'),
  'quality_approve', null, null
);
select is((select result ->> 'status' from gist_v2_results where label = 'quality'), 'in_review', 'sensitive content remains in review after quality approval');

select set_config('request.jwt.claim.sub', 'c3300000-0000-4000-8000-000000000004', true);
do $$ begin
  perform public.rpc_transition_relationship_gist_revision(
    (select (result ->> 'revision_id')::uuid from gist_v2_results where label = 'create'),
    'publish', null, null
  );
exception when others then
  insert into gist_v2_errors values ('premature-publish', sqlstate, sqlerrm);
end $$;
select is((select error_message from gist_v2_errors where label = 'premature-publish'), 'gist_revision_not_approved', 'unreviewed sensitive revisions cannot publish');

select set_config('request.jwt.claim.sub', 'c3300000-0000-4000-8000-000000000002', true);
do $$ begin
  perform public.rpc_transition_relationship_gist_revision(
    (select (result ->> 'revision_id')::uuid from gist_v2_results where label = 'create'),
    'safety_approve', null, null
  );
exception when others then
  insert into gist_v2_errors values ('same-reviewer', sqlstate, sqlerrm);
end $$;
select is((select error_message from gist_v2_errors where label = 'same-reviewer'), 'gist_separation_of_duties_required', 'quality reviewer cannot provide the additional safety approval');

select set_config('request.jwt.claim.sub', 'c3300000-0000-4000-8000-000000000003', true);
insert into gist_v2_results(label, result)
select 'safety', public.rpc_transition_relationship_gist_revision(
  (select (result ->> 'revision_id')::uuid from gist_v2_results where label = 'create'),
  'safety_approve', null, null
);
select is((select result ->> 'status' from gist_v2_results where label = 'safety'), 'approved', 'independent safety approval completes sensitive review');

select set_config('request.jwt.claim.sub', 'c3300000-0000-4000-8000-000000000001', true);
do $$ begin
  perform public.rpc_transition_relationship_gist_revision(
    (select (result ->> 'revision_id')::uuid from gist_v2_results where label = 'create'),
    'publish', null, null
  );
exception when others then
  insert into gist_v2_errors values ('author-publish', sqlstate, sqlerrm);
end $$;
select is((select error_message from gist_v2_errors where label = 'author-publish'), 'gist_publication_separation_required', 'author cannot perform final publication');

select set_config('request.jwt.claim.sub', 'c3300000-0000-4000-8000-000000000004', true);
insert into gist_v2_results(label, result)
select 'schedule', public.rpc_transition_relationship_gist_revision(
  (select (result ->> 'revision_id')::uuid from gist_v2_results where label = 'create'),
  'schedule', timezone('utc'::text, now()) + interval '1 day', null
);
select is((select result ->> 'status' from gist_v2_results where label = 'schedule'), 'scheduled', 'approved revision can be scheduled with a server timestamp');

insert into gist_v2_results(label, result)
select 'cancel', public.rpc_transition_relationship_gist_revision(
  (select (result ->> 'revision_id')::uuid from gist_v2_results where label = 'create'),
  'cancel_schedule', null, null
);
select is((select result ->> 'status' from gist_v2_results where label = 'cancel'), 'approved', 'future schedule can be cancelled safely');

insert into gist_v2_results(label, result)
select 'publish-one', public.rpc_transition_relationship_gist_revision(
  (select (result ->> 'revision_id')::uuid from gist_v2_results where label = 'create'),
  'publish', null, null
);
select is((select result ->> 'status' from gist_v2_results where label = 'publish-one'), 'published', 'independent publisher can publish an approved revision');
select is((select status from public.relationship_gists where id = (select (result ->> 'legacy_gist_id')::uuid from gist_v2_results where label = 'create')), 'published', 'legacy Gist identity is materialized for installed clients');
select is((select count(*)::integer from public.rpc_get_global_relationship_gists() where id = (select (result ->> 'legacy_gist_id')::uuid from gist_v2_results where label = 'create')), 2, 'legacy reader RPC exposes both published perspective variants');
select ok((select targeting_enforced = false from public.relationship_gist_editions where id = (select (result ->> 'edition_id')::uuid from gist_v2_results where label = 'create')), 'audience targeting remains explicitly disabled');

insert into public.relationship_gist_user_states(profile_id, gist_id, saved, progress, last_opened_at, last_perspective)
values (
  (select id from public.profiles where user_id = 'c3300000-0000-4000-8000-000000000005'),
  (select (result ->> 'legacy_gist_id')::uuid from gist_v2_results where label = 'create'),
  true, 0.45, timezone('utc'::text, now()), 'christian'
);
select set_config('request.jwt.claim.sub', 'c3300000-0000-4000-8000-000000000005', true);
select is((select availability from public.rpc_get_my_saved_relationship_gists('christian') limit 1), 'available', 'saved library returns published content');
select is((select selected_perspective from public.rpc_get_my_saved_relationship_gists('christian') limit 1), 'christian', 'saved library honours explicit perspective selection');
select is((select progress from public.rpc_get_my_saved_relationship_gists('christian') limit 1), 0.45::double precision, 'saved library preserves reading history');

select set_config('request.jwt.claim.sub', 'c3300000-0000-4000-8000-000000000001', true);
insert into gist_v2_results(label, result)
select 'create-two', public.rpc_create_relationship_gist_revision(
  (select (result ->> 'edition_id')::uuid from gist_v2_results where label = 'create'),
  null,
  (select (result ->> 'revision_id')::uuid from gist_v2_results where label = 'create'),
  'Respecting a clear no', 'Clarity protects connection.',
  'Revision two keeps consent clear and makes respectful boundaries practical every day.',
  'general', false
);
select is((select (result ->> 'revision_number')::integer from gist_v2_results where label = 'create-two'), 2, 'new edits create a monotonically numbered revision');
insert into gist_v2_results(label, result)
select 'submit-two', public.rpc_transition_relationship_gist_revision((select (result ->> 'revision_id')::uuid from gist_v2_results where label = 'create-two'), 'submit', null, null);
select set_config('request.jwt.claim.sub', 'c3300000-0000-4000-8000-000000000002', true);
insert into gist_v2_results(label, result)
select 'quality-two', public.rpc_transition_relationship_gist_revision((select (result ->> 'revision_id')::uuid from gist_v2_results where label = 'create-two'), 'quality_approve', null, null);
select set_config('request.jwt.claim.sub', 'c3300000-0000-4000-8000-000000000004', true);
insert into gist_v2_results(label, result)
select 'publish-two', public.rpc_transition_relationship_gist_revision((select (result ->> 'revision_id')::uuid from gist_v2_results where label = 'create-two'), 'publish', null, null);
select is((select status from public.relationship_gist_revisions where id = (select (result ->> 'revision_id')::uuid from gist_v2_results where label = 'create')), 'superseded', 'publishing a new revision supersedes the previous revision');
select is((select body from public.relationship_gists where id = (select (result ->> 'legacy_gist_id')::uuid from gist_v2_results where label = 'create')), 'Revision two keeps consent clear and makes respectful boundaries practical every day.', 'new publication updates content without changing the legacy Gist ID');

select set_config('request.jwt.claim.sub', 'c3300000-0000-4000-8000-000000000001', true);
insert into gist_v2_results(label, result)
select 'rollback', public.rpc_create_relationship_gist_rollback_revision(
  (select (result ->> 'edition_id')::uuid from gist_v2_results where label = 'create'),
  (select (result ->> 'revision_id')::uuid from gist_v2_results where label = 'create'),
  'Restore the earlier editorial framing for a fresh review.'
);
select is((select result ->> 'status' from gist_v2_results where label = 'rollback'), 'draft', 'rollback creates a new draft instead of mutating history');
select is((select count(*)::integer from public.relationship_gist_revision_variants where revision_id = (select (result ->> 'revision_id')::uuid from gist_v2_results where label = 'rollback')), 2, 'rollback copies all perspective variants into the new revision');

do $$ begin
  update public.relationship_gist_revision_variants set title = 'Mutated'
  where revision_id = (select (result ->> 'revision_id')::uuid from gist_v2_results where label = 'create')
    and perspective = 'general';
exception when others then
  insert into gist_v2_errors values ('immutable-variant', sqlstate, sqlerrm);
end $$;
select is((select error_message from gist_v2_errors where label = 'immutable-variant'), 'relationship_gist_variant_immutable', 'published variant content is immutable');

do $$ begin
  insert into public.relationship_gist_revisions(
    edition_id, revision_number, status, authored_by_user_id, audience_rules
  ) values (
    (select (result ->> 'edition_id')::uuid from gist_v2_results where label = 'create'),
    99, 'draft', 'c3300000-0000-4000-8000-000000000001', '{"country":"GH"}'::jsonb
  );
exception when others then
  insert into gist_v2_errors values ('targeting-disabled', sqlstate, sqlerrm);
end $$;
select is((select error_code from gist_v2_errors where label = 'targeting-disabled'), '23514', 'unenforced audience targeting cannot be persisted');

do $$ begin
  perform public.rpc_upsert_relationship_gist_editorial(
    (select (result ->> 'legacy_gist_id')::uuid from gist_v2_results where label = 'create'),
    (select id from public.profiles where user_id = 'c3300000-0000-4000-8000-000000000001'),
    'Bypass attempt', null, 'This publication must not bypass the review workflow.',
    'general', 'published'
  );
exception when others then
  insert into gist_v2_errors values ('legacy-publish', sqlstate, sqlerrm);
end $$;
select is((select error_message from gist_v2_errors where label = 'legacy-publish'), 'gist_v2_review_required', 'legacy editorial RPC cannot bypass review');
select ok((select count(*) >= 10 from public.relationship_gist_editorial_audit_events where edition_id = (select (result ->> 'edition_id')::uuid from gist_v2_results where label = 'create')), 'workflow transitions produce durable audit history');

select set_config('request.jwt.claim.sub', 'c3300000-0000-4000-8000-000000000004', true);
insert into gist_v2_results(label, result)
select 'unpublish', public.rpc_transition_relationship_gist_revision(
  (select (result ->> 'revision_id')::uuid from gist_v2_results where label = 'create-two'),
  'unpublish', null, 'Editorial withdrawal test'
);
select is((select result ->> 'status' from gist_v2_results where label = 'unpublish'), 'unpublished', 'published revision can be explicitly unpublished');
select set_config('request.jwt.claim.sub', 'c3300000-0000-4000-8000-000000000005', true);
select is((select availability from public.rpc_get_my_saved_relationship_gists('christian') limit 1), 'unavailable', 'saved identity remains visible when content becomes unavailable');
select is((select unavailable_reason from public.rpc_get_my_saved_relationship_gists('christian') limit 1), 'This Gist is no longer published.', 'saved library explains why content is unavailable');
select is((select count(*)::integer from public.relationship_gist_editions where legacy_gist_id = (select (result ->> 'legacy_gist_id')::uuid from gist_v2_results where label = 'create')), 1, 'one stable edition remains bound to the legacy Gist identity');
select is((select count(distinct revision_number)::integer from public.relationship_gist_revisions where edition_id = (select (result ->> 'edition_id')::uuid from gist_v2_results where label = 'create')), 3, 'revision numbers remain unique across edits and rollback');

select * from finish();
rollback;
