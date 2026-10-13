begin;

set local role postgres;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select plan(48);

select has_table('public', 'relationship_gist_ai_environment_policies', 'environment-bound AI policies exist');
select has_table('public', 'relationship_gist_ai_topic_calendar', 'approved topic calendar exists');
select has_table('public', 'relationship_gist_ai_generation_jobs', 'generation jobs are durable');
select has_table('public', 'relationship_gist_ai_job_events', 'job events are durable');
select has_table('public', 'relationship_gist_ai_draft_metadata', 'AI provenance metadata exists');
select has_table('public', 'relationship_gist_ai_source_suggestions', 'source suggestions are separate review records');
select has_table('public', 'relationship_gist_specialist_assignments', 'specialist assignments exist');
select has_table('public', 'relationship_gist_specialist_reviews', 'specialist reviews exist');
select ok(to_regprocedure('public.rpc_request_relationship_gist_ai_generation(uuid,uuid)') is not null, 'generation request RPC exists');
select ok(not has_function_privilege('anon', 'public.rpc_service_complete_relationship_gist_ai_job(uuid,text,jsonb,text,integer,integer,integer,bigint)', 'EXECUTE'), 'anonymous callers cannot complete AI jobs');

insert into auth.users(id, email) values
  ('c3400000-0000-4000-8000-000000000001', 'ai-author@example.invalid'),
  ('c3400000-0000-4000-8000-000000000002', 'ai-quality@example.invalid'),
  ('c3400000-0000-4000-8000-000000000003', 'ai-safety@example.invalid'),
  ('c3400000-0000-4000-8000-000000000004', 'ai-publisher@example.invalid'),
  ('c3400000-0000-4000-8000-000000000005', 'ai-specialist@example.invalid'),
  ('c3400000-0000-4000-8000-000000000006', 'ai-reader@example.invalid')
on conflict (id) do nothing;

select set_config('app.profile_guard_write', 'on', true);
insert into public.profiles(id, user_id, full_name) values
  ('c3400000-0000-4000-8000-000000000011', 'c3400000-0000-4000-8000-000000000001', 'AI author'),
  ('c3400000-0000-4000-8000-000000000012', 'c3400000-0000-4000-8000-000000000002', 'AI quality'),
  ('c3400000-0000-4000-8000-000000000013', 'c3400000-0000-4000-8000-000000000003', 'AI safety'),
  ('c3400000-0000-4000-8000-000000000014', 'c3400000-0000-4000-8000-000000000004', 'AI publisher'),
  ('c3400000-0000-4000-8000-000000000015', 'c3400000-0000-4000-8000-000000000005', 'AI specialist'),
  ('c3400000-0000-4000-8000-000000000016', 'c3400000-0000-4000-8000-000000000006', 'AI reader')
on conflict (user_id) do update set full_name = excluded.full_name;

insert into public.internal_admins(user_id, email, role) values
  ('c3400000-0000-4000-8000-000000000001', 'ai-author@example.invalid', 'super_admin'),
  ('c3400000-0000-4000-8000-000000000002', 'ai-quality@example.invalid', 'super_admin'),
  ('c3400000-0000-4000-8000-000000000003', 'ai-safety@example.invalid', 'moderation'),
  ('c3400000-0000-4000-8000-000000000004', 'ai-publisher@example.invalid', 'operations'),
  ('c3400000-0000-4000-8000-000000000005', 'ai-specialist@example.invalid', 'moderation')
on conflict (user_id) do update set role = excluded.role;

insert into public.relationship_gist_ai_environment_policies(
  environment, is_current, enabled, model, daily_job_budget, daily_token_budget,
  max_attempts, input_microusd_per_million, cached_input_microusd_per_million,
  output_microusd_per_million, configured_by_user_id
) values (
  'local', true, true, 'test-model', 10, 100000, 2,
  1000000, 500000, 2000000, 'c3400000-0000-4000-8000-000000000004'
);

insert into public.relationship_gist_specialist_assignments(user_id, review_type, assigned_by_user_id) values
  ('c3400000-0000-4000-8000-000000000005', 'safeguarding', 'c3400000-0000-4000-8000-000000000004'),
  ('c3400000-0000-4000-8000-000000000005', 'medical', 'c3400000-0000-4000-8000-000000000004');

create temporary table gist_ai_results(label text primary key, result jsonb not null) on commit drop;
create temporary table gist_ai_errors(label text primary key, error_message text not null) on commit drop;

select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'c3400000-0000-4000-8000-000000000001', true);
insert into gist_ai_results(label, result)
select 'topic', public.rpc_create_relationship_gist_ai_topic(
  'recognising-pressure', 'Recognising pressure without normalising it',
  'Draft clear safety-first guidance about coercive pressure and when readers should seek qualified help.',
  'safety', current_date + 1
);
select is((select result ->> 'status' from gist_ai_results where label = 'topic'), 'draft', 'new topic starts as a draft');

do $$ begin
  perform public.rpc_approve_relationship_gist_ai_topic((select (result ->> 'id')::uuid from gist_ai_results where label = 'topic'));
exception when others then insert into gist_ai_errors values ('topic-self-approval', sqlerrm); end $$;
select is((select error_message from gist_ai_errors where label = 'topic-self-approval'), 'gist_ai_topic_self_approval_forbidden', 'topic authors cannot approve their own topic');

select set_config('request.jwt.claim.sub', 'c3400000-0000-4000-8000-000000000002', true);
insert into gist_ai_results(label, result)
select 'approved-topic', public.rpc_approve_relationship_gist_ai_topic((select (result ->> 'id')::uuid from gist_ai_results where label = 'topic'));
select is((select result ->> 'status' from gist_ai_results where label = 'approved-topic'), 'approved', 'independent quality reviewer approves a topic');

select set_config('request.jwt.claim.sub', 'c3400000-0000-4000-8000-000000000001', true);
do $$ begin
  perform public.rpc_create_relationship_gist_ai_topic(
    'recognising-pressure-copy', 'Recognising pressure without normalising it!',
    'A duplicate brief that should be rejected before generation can consume provider budget.',
    'safety', current_date + 2
  );
exception when others then insert into gist_ai_errors values ('duplicate-topic', sqlerrm); end $$;
select is((select error_message from gist_ai_errors where label = 'duplicate-topic'), 'gist_ai_topic_duplicate', 'duplicate topics are rejected before generation');

insert into gist_ai_results(label, result)
select 'job-one', public.rpc_request_relationship_gist_ai_generation(
  (select (result ->> 'id')::uuid from gist_ai_results where label = 'topic'),
  'c3400000-0000-4000-8000-000000000101'
);
select is((select result ->> 'status' from gist_ai_results where label = 'job-one'), 'queued', 'approved topic creates a queued job');
select is(
  (public.rpc_request_relationship_gist_ai_generation(
    (select (result ->> 'id')::uuid from gist_ai_results where label = 'topic'),
    'c3400000-0000-4000-8000-000000000101'
  ) ->> 'id'),
  (select result ->> 'id' from gist_ai_results where label = 'job-one'),
  'idempotent request returns the existing job'
);

do $$ begin
  perform public.rpc_service_claim_relationship_gist_ai_job(
    (select (result ->> 'id')::uuid from gist_ai_results where label = 'job-one'), 'local'
  );
exception when others then insert into gist_ai_errors values ('non-service-claim', sqlerrm); end $$;
select is((select error_message from gist_ai_errors where label = 'non-service-claim'), 'service_role_required', 'editor identity cannot claim a service job');

select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claim.sub', '', true);
do $$ begin
  perform public.rpc_service_claim_relationship_gist_ai_job(
    (select (result ->> 'id')::uuid from gist_ai_results where label = 'job-one'), 'production'
  );
exception when others then insert into gist_ai_errors values ('environment-mismatch', sqlerrm); end $$;
select is((select error_message from gist_ai_errors where label = 'environment-mismatch'), 'gist_ai_environment_mismatch', 'service jobs cannot cross environments');

insert into gist_ai_results(label, result)
select 'claim-one', public.rpc_service_claim_relationship_gist_ai_job(
  (select (result ->> 'id')::uuid from gist_ai_results where label = 'job-one'), 'local'
);
select is((select result ->> 'perspective' from gist_ai_results where label = 'claim-one'), 'safety', 'claim returns the approved topic perspective');

do $$ begin
  perform public.rpc_service_complete_relationship_gist_ai_job(
    (select (result ->> 'id')::uuid from gist_ai_results where label = 'job-one'), 'local',
    jsonb_build_object(
      'schema_version','relationship_gist_ai_draft_v1','title','Unexpected perspective draft',
      'summary','This draft must fail.','body','This sufficiently long body must not be persisted because its perspective changed.',
      'takeaway','Fail closed.','perspective','general','discussion_prompt','Should this persist?',
      'suggested_sources','[]'::jsonb,
      'safety',jsonb_build_object('level','low','topics','[]'::jsonb,'requires_safety_review',false,
        'specialist_reviews','["none"]'::jsonb,'rationale','Low risk classification.')
    ), 'request-wrong-perspective', 10, 0, 10, 30
  );
exception when others then insert into gist_ai_errors values ('perspective-mismatch', sqlerrm); end $$;
select is((select error_message from gist_ai_errors where label = 'perspective-mismatch'), 'gist_ai_output_invalid', 'unexpected generated perspective is rejected at persistence');

insert into gist_ai_results(label, result)
select 'fail-one', public.rpc_service_fail_relationship_gist_ai_job(
  (select (result ->> 'id')::uuid from gist_ai_results where label = 'job-one'),
  'local', 'failed', 'perspective_mismatch', false, 'request-wrong-perspective'
);
select is((select result ->> 'status' from gist_ai_results where label = 'fail-one'), 'failed', 'invalid job is durably failed without publication');

select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'c3400000-0000-4000-8000-000000000001', true);
insert into gist_ai_results(label, result)
select 'job-two', public.rpc_request_relationship_gist_ai_generation(
  (select (result ->> 'id')::uuid from gist_ai_results where label = 'topic'),
  'c3400000-0000-4000-8000-000000000102'
);
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claim.sub', '', true);
insert into gist_ai_results(label, result)
select 'claim-two', public.rpc_service_claim_relationship_gist_ai_job(
  (select (result ->> 'id')::uuid from gist_ai_results where label = 'job-two'), 'local'
);
select is((select result ->> 'job_id' from gist_ai_results where label = 'claim-two'), (select result ->> 'id' from gist_ai_results where label = 'job-two'), 'service claims the replacement job');

insert into gist_ai_results(label, result)
select 'complete', public.rpc_service_complete_relationship_gist_ai_job(
  (select (result ->> 'id')::uuid from gist_ai_results where label = 'job-two'), 'local',
  jsonb_build_object(
    'schema_version','relationship_gist_ai_draft_v1',
    'title','When pressure is not consent',
    'summary','A safety-first draft for recognising coercive pressure.',
    'body','Consent must be freely given and can be withdrawn. Repeated pressure, threats, or fear are warning signs that require a safety-first response and qualified support.',
    'takeaway','Pressure is not consent, and safety comes before preserving a connection.',
    'perspective','safety',
    'discussion_prompt','What helps a boundary feel safe and respected?',
    'suggested_sources',jsonb_build_array(jsonb_build_object(
      'title','Consent guidance','url','https://example.org/consent','publisher','Example Safety Institute',
      'why_suggested','A discovery lead that an editor must independently verify.'
    )),
    'safety',jsonb_build_object(
      'level','high_risk','topics',jsonb_build_array('coercion','medical'),
      'requires_safety_review',true,'specialist_reviews',jsonb_build_array('safeguarding','medical'),
      'rationale','Coercion and references to qualified medical support require independent review.'
    )
  ), 'request-complete', 1000, 100, 500, 1950
);
select is((select result ->> 'status' from gist_ai_results where label = 'complete'), 'completed', 'valid output creates a completed draft job');
select is((select status from public.relationship_gist_revisions where id = (select (result ->> 'revision_id')::uuid from gist_ai_results where label = 'complete')), 'draft', 'AI can create only a draft revision');
select is((select primary_perspective from public.relationship_gist_revisions where id = (select (result ->> 'revision_id')::uuid from gist_ai_results where label = 'complete')), 'safety', 'persisted perspective matches the approved topic');
select is((select verification_status from public.relationship_gist_ai_source_suggestions where revision_id = (select (result ->> 'revision_id')::uuid from gist_ai_results where label = 'complete')), 'unverified', 'AI source suggestions are never treated as verified citations');
select is((select array_agg(review_type order by review_type) from public.relationship_gist_specialist_reviews where revision_id = (select (result ->> 'revision_id')::uuid from gist_ai_results where label = 'complete')), array['medical','safeguarding']::text[], 'sensitive topics create every required specialist review');
select ok((select input_tokens = 1000 and output_tokens = 500 and estimated_cost_microusd = 1950 from public.relationship_gist_ai_generation_jobs where id = (select (result ->> 'id')::uuid from gist_ai_results where label = 'job-two')), 'token and cost telemetry are persisted');

select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'c3400000-0000-4000-8000-000000000002', true);
select is(jsonb_array_length(public.rpc_get_relationship_gist_ai_review_queue()), 1, 'human review queue exposes the generated draft');

select set_config('request.jwt.claim.sub', 'c3400000-0000-4000-8000-000000000001', true);
insert into gist_ai_results(label, result)
select 'submit', public.rpc_transition_relationship_gist_revision((select (result ->> 'revision_id')::uuid from gist_ai_results where label = 'complete'), 'submit', null, null);
select is((select result ->> 'status' from gist_ai_results where label = 'submit'), 'in_review', 'editor submits the AI draft into the human workflow');

select set_config('request.jwt.claim.sub', 'c3400000-0000-4000-8000-000000000002', true);
do $$ begin
  perform public.rpc_transition_relationship_gist_revision((select (result ->> 'revision_id')::uuid from gist_ai_results where label = 'complete'), 'quality_approve', null, null);
exception when others then insert into gist_ai_errors values ('unverified-quality', sqlerrm); end $$;
select is((select error_message from gist_ai_errors where label = 'unverified-quality'), 'gist_ai_claims_verification_required', 'quality approval is blocked until claims are attested');

insert into gist_ai_results(label, result)
select 'claims', public.rpc_attest_relationship_gist_ai_claims((select (result ->> 'revision_id')::uuid from gist_ai_results where label = 'complete'));
select ok((select result ->> 'claims_verified_at' is not null from gist_ai_results where label = 'claims'), 'independent quality reviewer can attest checked claims');

insert into gist_ai_results(label, result)
select 'source', public.rpc_review_relationship_gist_ai_source(
  (select id from public.relationship_gist_ai_source_suggestions where revision_id = (select (result ->> 'revision_id')::uuid from gist_ai_results where label = 'complete')),
  'verified', 'Verified against the publisher page.'
);
select is((select result ->> 'status' from gist_ai_results where label = 'source'), 'verified', 'source suggestion requires an explicit human verification decision');

insert into gist_ai_results(label, result)
select 'quality', public.rpc_transition_relationship_gist_revision((select (result ->> 'revision_id')::uuid from gist_ai_results where label = 'complete'), 'quality_approve', null, null);
select is((select result ->> 'status' from gist_ai_results where label = 'quality'), 'in_review', 'sensitive draft remains in review after quality approval');

select set_config('request.jwt.claim.sub', 'c3400000-0000-4000-8000-000000000003', true);
do $$ begin
  perform public.rpc_transition_relationship_gist_revision((select (result ->> 'revision_id')::uuid from gist_ai_results where label = 'complete'), 'safety_approve', null, null);
exception when others then insert into gist_ai_errors values ('specialist-pending', sqlerrm); end $$;
select is((select error_message from gist_ai_errors where label = 'specialist-pending'), 'gist_ai_specialist_review_required', 'safety approval cannot bypass pending specialists');

select set_config('request.jwt.claim.sub', 'c3400000-0000-4000-8000-000000000005', true);
insert into gist_ai_results(label, result)
select 'specialist-one', public.rpc_approve_relationship_gist_specialist_review((select (result ->> 'revision_id')::uuid from gist_ai_results where label = 'complete'), 'safeguarding', 'Safety review complete.');
select is((select result ->> 'review_type' from gist_ai_results where label = 'specialist-one'), 'safeguarding', 'assigned safeguarding specialist can approve');
insert into gist_ai_results(label, result)
select 'specialist-two', public.rpc_approve_relationship_gist_specialist_review((select (result ->> 'revision_id')::uuid from gist_ai_results where label = 'complete'), 'medical', 'Medical claim boundaries reviewed.');
select is((select result ->> 'review_type' from gist_ai_results where label = 'specialist-two'), 'medical', 'assigned medical specialist can approve');

select set_config('request.jwt.claim.sub', 'c3400000-0000-4000-8000-000000000003', true);
insert into gist_ai_results(label, result)
select 'safety', public.rpc_transition_relationship_gist_revision((select (result ->> 'revision_id')::uuid from gist_ai_results where label = 'complete'), 'safety_approve', null, null);
select is((select result ->> 'status' from gist_ai_results where label = 'safety'), 'approved', 'independent safety approval completes review after specialists');

select set_config('request.jwt.claim.sub', 'c3400000-0000-4000-8000-000000000004', true);
insert into gist_ai_results(label, result)
select 'publish', public.rpc_transition_relationship_gist_revision((select (result ->> 'revision_id')::uuid from gist_ai_results where label = 'complete'), 'publish', null, null);
select is((select result ->> 'status' from gist_ai_results where label = 'publish'), 'published', 'only the independent human publisher can publish');
select is((select count(*)::integer from public.rpc_get_global_relationship_gists() where id = (select (result ->> 'legacy_gist_id')::uuid from gist_ai_results where label = 'complete')), 1, 'legacy reader RPC remains compatible with published AI-assisted content');

do $$ begin
  update public.relationship_gist_ai_job_events set event_type = 'tampered'
  where job_id = (select (result ->> 'id')::uuid from gist_ai_results where label = 'job-two');
exception when others then insert into gist_ai_errors values ('event-mutation', sqlerrm); end $$;
select is((select error_message from gist_ai_errors where label = 'event-mutation'), 'relationship_gist_ai_event_immutable', 'job event history is immutable');

insert into gist_ai_results(label, result)
select 'topic-budget', public.rpc_create_relationship_gist_ai_topic(
  'healthy-disagreement', 'Healthy disagreement without contempt',
  'Draft practical communication guidance about disagreement, repair, and avoiding contempt between partners.',
  'communication', current_date + 2
);
select set_config('request.jwt.claim.sub', 'c3400000-0000-4000-8000-000000000002', true);
select public.rpc_approve_relationship_gist_ai_topic((select (result ->> 'id')::uuid from gist_ai_results where label = 'topic-budget'));
update public.relationship_gist_ai_environment_policies set daily_job_budget = 1 where environment = 'local';
select set_config('request.jwt.claim.sub', 'c3400000-0000-4000-8000-000000000001', true);
insert into gist_ai_results(label, result)
select 'budget', public.rpc_request_relationship_gist_ai_generation(
  (select (result ->> 'id')::uuid from gist_ai_results where label = 'topic-budget'),
  'c3400000-0000-4000-8000-000000000103'
);
select is((select result ->> 'status' from gist_ai_results where label = 'budget'), 'budget_exceeded', 'exceeded budget is explicit and observable without a provider call');

insert into gist_ai_results(label, result)
select 'human-revision', public.rpc_create_relationship_gist_revision(
  (select (result ->> 'legacy_gist_id')::uuid from gist_ai_results where label = 'complete'), null,
  (select (result ->> 'revision_id')::uuid from gist_ai_results where label = 'complete'),
  'When pressure is not consent — editor revision', 'A human-edited safety-first revision.',
  'Consent must be freely given. This human edit narrows every claim and preserves an explicit route to qualified support.',
  'safety', true
);
select ok((select human_edited from public.relationship_gist_ai_draft_metadata where revision_id = (select (result ->> 'revision_id')::uuid from gist_ai_results where label = 'human-revision')), 'human revisions preserve provenance and are marked edited');
select ok((select metadata.claims_verified_at is null and source.verification_status = 'unverified'
  from public.relationship_gist_ai_draft_metadata metadata
  join public.relationship_gist_ai_source_suggestions source on source.revision_id = metadata.revision_id
  where metadata.revision_id = (select (result ->> 'revision_id')::uuid from gist_ai_results where label = 'human-revision')), 'human edits reset claims and source approvals');

insert into gist_ai_results(label, result)
select 'reject-edit', public.rpc_reject_relationship_gist_ai_draft(
  (select (result ->> 'revision_id')::uuid from gist_ai_results where label = 'human-revision'),
  'Editorial direction needs substantial revision.'
);
select ok((select result ->> 'status' = 'archived' from gist_ai_results where label = 'reject-edit')
  and (select status = 'completed' from public.relationship_gist_ai_generation_jobs where id = (select (result ->> 'id')::uuid from gist_ai_results where label = 'job-two')), 'rejecting a derived edit does not rewrite the completed source job');

select ok(not has_table_privilege('authenticated', 'public.relationship_gist_ai_generation_jobs', 'SELECT'), 'authenticated clients cannot query job tables directly');
select ok(to_regprocedure('public.rpc_get_global_relationship_gists()') is not null and to_regprocedure('public.rpc_upsert_relationship_gist_user_state(uuid,boolean,double precision,timestamp with time zone,boolean,text)') is not null, 'legacy reader contracts remain intact');
select is((select count(*)::integer from public.relationship_gist_ai_environment_policies where environment = 'production'), 0, 'local test creates no production AI policy or queue');

select * from finish();
rollback;
