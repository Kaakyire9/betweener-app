begin;

set local role postgres;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select plan(19);

select has_table('public', 'relationship_gist_ai_owner_review_events', 'owner-review audit events exist');
select ok(to_regprocedure('public.rpc_prepare_relationship_gist_ai_owner_topic(uuid)') is not null, 'owner brief preparation RPC exists');
select ok(to_regprocedure('public.rpc_publish_relationship_gist_ai_owner_review(uuid,text)') is not null, 'owner publication RPC exists');
select ok(not has_function_privilege('anon', 'public.rpc_publish_relationship_gist_ai_owner_review(uuid,text)', 'EXECUTE'), 'anonymous callers cannot publish');
select ok(not has_function_privilege('service_role', 'public.rpc_publish_relationship_gist_ai_owner_review(uuid,text)', 'EXECUTE'), 'AI service role cannot publish');
select ok(has_function_privilege('authenticated', 'public.rpc_publish_relationship_gist_ai_owner_review(uuid,text)', 'EXECUTE'), 'authenticated role can reach server-side owner authorization');

insert into auth.users(id, email) values
  ('c3500000-0000-4000-8000-000000000001', 'owner-review@example.invalid'),
  ('c3500000-0000-4000-8000-000000000002', 'owner-operations@example.invalid')
on conflict (id) do nothing;

select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('app.profile_guard_write', 'on', true);
insert into public.profiles(id, user_id, full_name) values
  ('c3500000-0000-4000-8000-000000000011', 'c3500000-0000-4000-8000-000000000001', 'Owner reviewer'),
  ('c3500000-0000-4000-8000-000000000012', 'c3500000-0000-4000-8000-000000000002', 'Operations editor')
on conflict (user_id) do update set full_name = excluded.full_name;

insert into public.internal_admins(user_id, email, role) values
  ('c3500000-0000-4000-8000-000000000001', 'owner-review@example.invalid', 'super_admin'),
  ('c3500000-0000-4000-8000-000000000002', 'owner-operations@example.invalid', 'operations')
on conflict (user_id) do update set role = excluded.role;

update public.relationship_gist_ai_environment_policies set is_current = false;
insert into public.relationship_gist_ai_environment_policies(
  environment, is_current, enabled, model, daily_job_budget, daily_token_budget,
  max_attempts, input_microusd_per_million, cached_input_microusd_per_million,
  output_microusd_per_million, configured_by_user_id
) values (
  'local', true, true, 'test-model', 10, 100000, 2,
  1000000, 500000, 2000000, 'c3500000-0000-4000-8000-000000000001'
);

create temporary table gist_owner_results(label text primary key, result jsonb not null) on commit drop;
create temporary table gist_owner_errors(label text primary key, error_message text not null) on commit drop;

select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'c3500000-0000-4000-8000-000000000002', true);
insert into gist_owner_results(label, result)
select 'operations-topic', public.rpc_create_relationship_gist_ai_topic(
  'owner-review-operations', 'Operations cannot self-authorise',
  'A complete editorial brief used to prove that operations cannot enter the owner-review path.',
  'general', current_date + 1
);
do $$ begin
  perform public.rpc_prepare_relationship_gist_ai_owner_topic(
    (select (result ->> 'id')::uuid from gist_owner_results where label = 'operations-topic')
  );
exception when others then
  insert into gist_owner_errors values ('operations-prepare', sqlerrm);
end $$;
select is((select error_message from gist_owner_errors where label = 'operations-prepare'), 'gist_ai_owner_review_forbidden', 'operations role cannot use owner review');

select set_config('request.jwt.claim.sub', 'c3500000-0000-4000-8000-000000000001', true);
insert into gist_owner_results(label, result)
select 'topic', public.rpc_create_relationship_gist_ai_topic(
  'owner-review-faith', 'Grace with healthy boundaries',
  'Draft concise faith-aware guidance about grace, coercion, healthy boundaries, and seeking qualified support.',
  'christian', current_date + 1
);
insert into gist_owner_results(label, result)
select 'prepared', public.rpc_prepare_relationship_gist_ai_owner_topic(
  (select (result ->> 'id')::uuid from gist_owner_results where label = 'topic')
);
select is((select result ->> 'status' from gist_owner_results where label = 'prepared'), 'approved', 'owner prepares their brief for generation');

insert into gist_owner_results(label, result)
select 'job', public.rpc_request_relationship_gist_ai_generation(
  (select (result ->> 'id')::uuid from gist_owner_results where label = 'topic'),
  'c3500000-0000-4000-8000-000000000101'
);

select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claim.sub', '', true);
select public.rpc_service_claim_relationship_gist_ai_job(
  (select (result ->> 'id')::uuid from gist_owner_results where label = 'job'), 'local'
);
insert into gist_owner_results(label, result)
select 'completed', public.rpc_service_complete_relationship_gist_ai_job(
  (select (result ->> 'id')::uuid from gist_owner_results where label = 'job'), 'local',
  jsonb_build_object(
    'schema_version','relationship_gist_ai_draft_v1',
    'title','Grace does not erase a boundary',
    'summary','Grace and healthy limits can exist together.',
    'body','Grace can support repair without asking anyone to tolerate coercion, repeated disrespect, or harm. A healthy boundary names what must change and leaves room for qualified support when safety is uncertain.',
    'takeaway','Compassion never requires abandoning safety.',
    'perspective','christian',
    'discussion_prompt','Which boundary helps care and honesty coexist?',
    'suggested_sources',jsonb_build_array(jsonb_build_object(
      'title','Healthy boundaries','url','https://example.org/boundaries',
      'publisher','Example Institute','why_suggested','A lead for manual editorial verification.'
    )),
    'safety',jsonb_build_object(
      'level','sensitive','topics',jsonb_build_array('faith','coercion'),
      'requires_safety_review',true,'specialist_reviews',jsonb_build_array('faith','safeguarding'),
      'rationale','Faith and coercion claims require explicit human acknowledgement.'
    )
  ), 'owner-review-provider-request', 500, 0, 250, 1000
);
select is((select result ->> 'status' from gist_owner_results where label = 'completed'), 'completed', 'AI worker still creates a draft only');

select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'c3500000-0000-4000-8000-000000000001', true);
do $$ begin
  perform public.rpc_publish_relationship_gist_ai_owner_review(
    (select (result ->> 'revision_id')::uuid from gist_owner_results where label = 'completed'),
    'I reviewed this Gist and accept publishing responsibility.'
  );
exception when others then
  insert into gist_owner_errors values ('premature-publish', sqlerrm);
end $$;
select is((select error_message from gist_owner_errors where label = 'premature-publish'), 'gist_ai_claims_verification_required', 'publication fails closed before manual review');

select public.rpc_owner_attest_relationship_gist_ai_claims(
  (select (result ->> 'revision_id')::uuid from gist_owner_results where label = 'completed')
);
select public.rpc_owner_review_relationship_gist_ai_source(
  (select id from public.relationship_gist_ai_source_suggestions
   where revision_id = (select (result ->> 'revision_id')::uuid from gist_owner_results where label = 'completed')),
  'verified', 'Checked manually against the publisher page.'
);
select public.rpc_owner_acknowledge_relationship_gist_ai_specialist_review(
  (select (result ->> 'revision_id')::uuid from gist_owner_results where label = 'completed'),
  'faith', 'Faith framing checked manually.'
);
select public.rpc_owner_acknowledge_relationship_gist_ai_specialist_review(
  (select (result ->> 'revision_id')::uuid from gist_owner_results where label = 'completed'),
  'safeguarding', 'Safety framing checked manually.'
);

do $$ begin
  perform public.rpc_publish_relationship_gist_ai_owner_review(
    (select (result ->> 'revision_id')::uuid from gist_owner_results where label = 'completed'),
    'publish it'
  );
exception when others then
  insert into gist_owner_errors values ('confirmation', sqlerrm);
end $$;
select is((select error_message from gist_owner_errors where label = 'confirmation'), 'gist_ai_owner_confirmation_required', 'exact owner responsibility confirmation is required');

insert into gist_owner_results(label, result)
select 'published', public.rpc_publish_relationship_gist_ai_owner_review(
  (select (result ->> 'revision_id')::uuid from gist_owner_results where label = 'completed'),
  'I reviewed this Gist and accept publishing responsibility.'
);
select is((select result ->> 'status' from gist_owner_results where label = 'published'), 'published', 'one owner can publish after every explicit check');
select ok((select quality_approved_by_user_id = 'c3500000-0000-4000-8000-000000000001'
  and safety_approved_by_user_id = 'c3500000-0000-4000-8000-000000000001'
  from public.relationship_gist_revisions
  where id = (select (result ->> 'revision_id')::uuid from gist_owner_results where label = 'completed')), 'owner quality and safety responsibility is recorded');
select is((select count(*)::integer from public.relationship_gist_ai_owner_review_events
  where revision_id = (select (result ->> 'revision_id')::uuid from gist_owner_results where label = 'completed')), 5, 'every owner review action is durably audited');
select is((select count(*)::integer from public.relationship_gist_editorial_audit_events
  where revision_id = (select (result ->> 'revision_id')::uuid from gist_owner_results where label = 'completed')
    and action = 'owner_review_published'), 1, 'publication has an immutable editorial audit event');
select is((select count(*)::integer from public.rpc_get_global_relationship_gists()
  where id = (select (result ->> 'legacy_gist_id')::uuid from gist_owner_results where label = 'completed')), 1, 'legacy reader sees owner-published content');
select ok((select verification_status = 'verified' and reviewed_by_user_id = 'c3500000-0000-4000-8000-000000000001'
  from public.relationship_gist_ai_source_suggestions
  where revision_id = (select (result ->> 'revision_id')::uuid from gist_owner_results where label = 'completed')), 'source verification remains an explicit human decision');

do $$ begin
  update public.relationship_gist_ai_owner_review_events set action = 'brief_prepared'
  where revision_id = (select (result ->> 'revision_id')::uuid from gist_owner_results where label = 'completed');
exception when others then
  insert into gist_owner_errors values ('audit-mutation', sqlerrm);
end $$;
select is((select error_message from gist_owner_errors where label = 'audit-mutation'), 'relationship_gist_ai_event_immutable', 'owner-review audit history is immutable');
select is((select count(*)::integer from public.relationship_gist_ai_environment_policies where environment = 'production'), 0, 'owner-review test creates no production policy');

select * from finish();
rollback;
