begin;

set local role postgres;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select plan(8);

select ok(position('auth.role() = ''service_role''' in pg_get_functiondef(
  'public.relationship_gist_ai_clone_provenance()'::regprocedure
)) > 0, 'provenance cloning distinguishes AI completion from human edits');
select ok(position('job.status = ''processing''' in pg_get_functiondef(
  'public.relationship_gist_ai_clone_provenance()'::regprocedure
)) > 0, 'AI provenance bypass requires a matching processing job');
select ok(position('status = ''cancelled''' in pg_get_functiondef(
  'public.rpc_service_fail_relationship_gist_ai_job(uuid,text,text,text,boolean,text,integer,integer,integer,bigint)'::regprocedure
)) > 0, 'terminal generation failure resolves its brief');

insert into auth.users(id, email) values
  ('c3900000-0000-4000-8000-000000000001', 'rewrite-owner@example.invalid')
on conflict (id) do nothing;
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('app.profile_guard_write', 'on', true);
insert into public.profiles(id, user_id, full_name) values
  ('c3900000-0000-4000-8000-000000000011', 'c3900000-0000-4000-8000-000000000001', 'Rewrite owner')
on conflict (user_id) do update set full_name = excluded.full_name;
insert into public.internal_admins(user_id, email, role) values
  ('c3900000-0000-4000-8000-000000000001', 'rewrite-owner@example.invalid', 'super_admin')
on conflict (user_id) do update set role = excluded.role;

update public.relationship_gist_ai_environment_policies set is_current = false;
insert into public.relationship_gist_ai_environment_policies(
  environment, is_current, enabled, model, daily_job_budget, daily_token_budget,
  max_attempts, configured_by_user_id
) values ('local', true, true, 'test-model', 20, 200000, 2, 'c3900000-0000-4000-8000-000000000001');

insert into public.relationship_gists(
  id, title, short_body, body, perspective, status, published_at,
  created_by_profile_id, created_by_admin_id
) values (
  'c3900000-0000-4000-8000-000000000020', 'Source AI Gist', 'Published source summary.',
  'Published source guidance with enough text for an immutable AI rewrite.', 'general', 'published',
  timezone('utc'::text, now()), 'c3900000-0000-4000-8000-000000000011',
  'c3900000-0000-4000-8000-000000000001'
);
insert into public.relationship_gist_editions(id, legacy_gist_id, lifecycle_status) values (
  'c3900000-0000-4000-8000-000000000021', 'c3900000-0000-4000-8000-000000000020', 'published'
);
insert into public.relationship_gist_revisions(
  id, edition_id, revision_number, status, primary_perspective,
  authored_by_user_id, published_at
) values (
  'c3900000-0000-4000-8000-000000000022', 'c3900000-0000-4000-8000-000000000021',
  1, 'published', 'general', 'c3900000-0000-4000-8000-000000000001', timezone('utc'::text, now())
);
insert into public.relationship_gist_revision_variants(
  revision_id, perspective, title, short_body, body
) values (
  'c3900000-0000-4000-8000-000000000022', 'general', 'Source AI Gist',
  'Published source summary.', 'Published source guidance with enough text for an immutable AI rewrite.'
);
update public.relationship_gist_editions
set current_revision_id = 'c3900000-0000-4000-8000-000000000022',
    published_revision_id = 'c3900000-0000-4000-8000-000000000022'
where id = 'c3900000-0000-4000-8000-000000000021';

insert into public.relationship_gist_ai_topic_calendar(
  id, environment, topic_key, topic_title, topic_fingerprint, topic_brief,
  requested_perspective, planned_for, status, created_by_user_id,
  approved_by_user_id, approved_at, consumed_at
) values (
  'c3900000-0000-4000-8000-000000000030', 'local', 'source-ai-gist', 'Source AI Gist',
  'source ai gist', 'Original generated source topic used for rewrite persistence testing.',
  'general', current_date, 'consumed', 'c3900000-0000-4000-8000-000000000001',
  'c3900000-0000-4000-8000-000000000001', timezone('utc'::text, now()), timezone('utc'::text, now())
);
insert into public.relationship_gist_ai_generation_jobs(
  id, environment, topic_id, requested_by_user_id, idempotency_key, status,
  schema_version, prompt_version, provider, model, attempt_count,
  generated_revision_id, completed_at
) values (
  'c3900000-0000-4000-8000-000000000031', 'local', 'c3900000-0000-4000-8000-000000000030',
  'c3900000-0000-4000-8000-000000000001', 'c3900000-0000-4000-8000-000000000032',
  'completed', 'relationship_gist_ai_draft_v1', 'relationship_gist_editorial_prompt_v1',
  'openai', 'test-model', 1, 'c3900000-0000-4000-8000-000000000022', timezone('utc'::text, now())
);
insert into public.relationship_gist_ai_draft_metadata(
  revision_id, generation_job_id, schema_version, prompt_version, provider, model,
  takeaway, discussion_prompt, safety_level, safety_rationale
) values (
  'c3900000-0000-4000-8000-000000000022', 'c3900000-0000-4000-8000-000000000031',
  'relationship_gist_ai_draft_v1', 'relationship_gist_editorial_prompt_v1', 'openai', 'test-model',
  'Original takeaway.', 'Original discussion prompt?', 'low', 'Original low-risk classification.'
);

create temporary table gist_rewrite_results(label text primary key, result jsonb not null) on commit drop;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'c3900000-0000-4000-8000-000000000001', true);
insert into gist_rewrite_results(label, result)
select 'topic', public.rpc_create_relationship_gist_ai_revision_topic(
  'c3900000-0000-4000-8000-000000000022', 'Make the guidance warmer while preserving its practical takeaway.'
);
insert into gist_rewrite_results(label, result)
select 'job', public.rpc_request_relationship_gist_ai_generation(
  (select (result ->> 'topic_id')::uuid from gist_rewrite_results where label = 'topic'),
  'c3900000-0000-4000-8000-000000000040'
);
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claim.sub', '', true);
select public.rpc_service_claim_relationship_gist_ai_job(
  (select (result ->> 'id')::uuid from gist_rewrite_results where label = 'job'), 'local'
);
insert into gist_rewrite_results(label, result)
select 'complete', public.rpc_service_complete_relationship_gist_ai_job(
  (select (result ->> 'id')::uuid from gist_rewrite_results where label = 'job'), 'local',
  jsonb_build_object(
    'schema_version','relationship_gist_ai_draft_v1','title','A warmer source Gist',
    'summary','A warmer revision that preserves the practical guidance.',
    'body','Warmth and clarity can coexist when the guidance stays practical, respectful, and grounded.',
    'takeaway','Warm guidance can still be clear.','perspective','general',
    'discussion_prompt','What wording feels both warm and practical?','suggested_sources','[]'::jsonb,
    'safety',jsonb_build_object('level','low','topics','[]'::jsonb,'requires_safety_review',false,
      'specialist_reviews','["none"]'::jsonb,'rationale','This is low-risk general relationship guidance.')
  ), 'rewrite-provider-request', 200, 0, 150, 500
);

select is((select result ->> 'status' from gist_rewrite_results where label = 'complete'), 'completed',
  'AI rewrite of an AI-generated published Gist persists successfully');
select is((select source_revision_id from public.relationship_gist_revisions
  where id = (select (result ->> 'revision_id')::uuid from gist_rewrite_results where label = 'complete')),
  'c3900000-0000-4000-8000-000000000022'::uuid, 'new revision retains immutable source attribution');
select is((select generation_job_id from public.relationship_gist_ai_draft_metadata
  where revision_id = (select (result ->> 'revision_id')::uuid from gist_rewrite_results where label = 'complete')),
  (select (result ->> 'id')::uuid from gist_rewrite_results where label = 'job'),
  'new revision stores fresh generation provenance rather than cloned metadata');

select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'c3900000-0000-4000-8000-000000000001', true);
insert into gist_rewrite_results(label, result)
select 'failed-topic', public.rpc_create_relationship_gist_ai_revision_topic(
  'c3900000-0000-4000-8000-000000000022', 'Create a second rewrite used to verify terminal failure cleanup.'
);
insert into gist_rewrite_results(label, result)
select 'failed-job', public.rpc_request_relationship_gist_ai_generation(
  (select (result ->> 'topic_id')::uuid from gist_rewrite_results where label = 'failed-topic'),
  'c3900000-0000-4000-8000-000000000041'
);
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claim.sub', '', true);
select public.rpc_service_claim_relationship_gist_ai_job(
  (select (result ->> 'id')::uuid from gist_rewrite_results where label = 'failed-job'), 'local'
);
select public.rpc_service_fail_relationship_gist_ai_job(
  (select (result ->> 'id')::uuid from gist_rewrite_results where label = 'failed-job'),
  'local', 'failed', 'test_terminal_failure', false
);
select is((select status from public.relationship_gist_ai_topic_calendar
  where id = (select (result ->> 'topic_id')::uuid from gist_rewrite_results where label = 'failed-topic')),
  'cancelled', 'terminal failure resolves the approved brief without deleting its job');
select is((select count(*)::integer from public.relationship_gist_ai_generation_jobs
  where id = (select (result ->> 'id')::uuid from gist_rewrite_results where label = 'failed-job')),
  1, 'resolved failed job remains available for audit');

select * from finish();
rollback;
