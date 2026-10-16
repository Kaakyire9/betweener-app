begin;

set local role postgres;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select plan(18);

select has_column('public', 'relationship_gist_ai_topic_calendar', 'source_revision_id',
  'AI topic can reference the published revision it will revise');
select has_column('public', 'relationship_gist_ai_topic_calendar', 'revision_instruction',
  'AI revision instructions are stored with provenance');
select ok(to_regprocedure('public.rpc_publish_relationship_gist_owner_review(uuid,text,boolean)') is not null,
  'manual owner-review publication RPC exists');
select ok(to_regprocedure('public.rpc_create_relationship_gist_ai_revision_topic(uuid,text)') is not null,
  'immutable AI revision topic RPC exists');
select ok(to_regprocedure('public.rpc_admin_get_relationship_gist_editions_v2()') is not null,
  'editorial projection with AI provenance exists');
select ok(not has_function_privilege('anon', 'public.rpc_publish_relationship_gist_owner_review(uuid,text,boolean)', 'EXECUTE'),
  'anonymous callers cannot owner-publish manual Gists');
select ok(not has_function_privilege('service_role', 'public.rpc_publish_relationship_gist_owner_review(uuid,text,boolean)', 'EXECUTE'),
  'AI service role cannot owner-publish manual Gists');
select ok(has_function_privilege('authenticated', 'public.rpc_publish_relationship_gist_owner_review(uuid,text,boolean)', 'EXECUTE'),
  'authenticated editors can reach server-authoritative owner review');
select ok(not has_function_privilege('anon', 'public.rpc_create_relationship_gist_ai_revision_topic(uuid,text)', 'EXECUTE'),
  'anonymous callers cannot request AI revisions');
select ok(not has_function_privilege('service_role', 'public.rpc_create_relationship_gist_ai_revision_topic(uuid,text)', 'EXECUTE'),
  'AI service role cannot create editorial revision briefs');
select ok(has_function_privilege('authenticated', 'public.rpc_create_relationship_gist_ai_revision_topic(uuid,text)', 'EXECUTE'),
  'authenticated editors can reach the AI revision authorization boundary');
select ok(position('authored_by_user_id is distinct from v_actor' in pg_get_functiondef(
  'public.rpc_publish_relationship_gist_owner_review(uuid,text,boolean)'::regprocedure
)) > 0, 'manual owner publication is limited to the authors own revision');
select ok(position('relationship_gist_ai_draft_metadata' in pg_get_functiondef(
  'public.rpc_publish_relationship_gist_owner_review(uuid,text,boolean)'::regprocedure
)) > 0, 'manual owner publication cannot bypass the AI review checklist');
select ok(position('published_revision_id = revision.id' in pg_get_functiondef(
  'public.rpc_create_relationship_gist_ai_revision_topic(uuid,text)'::regprocedure
)) > 0, 'AI revision requests require the current published revision');
select ok(position('source_revision_id' in pg_get_functiondef(
  'public.rpc_service_complete_relationship_gist_ai_job(uuid,text,jsonb,text,integer,integer,integer,bigint)'::regprocedure
)) > 0, 'AI completion supports immutable revision provenance');
select ok(position('lock_version = lock_version + 1' in pg_get_functiondef(
  'public.rpc_service_complete_relationship_gist_ai_job(uuid,text,jsonb,text,integer,integer,integer,bigint)'::regprocedure
)) > 0, 'AI revision completion advances edition concurrency state');
select ok(position('revision.status in (''draft'', ''in_review'', ''approved'')' in pg_get_functiondef(
  'public.rpc_get_relationship_gist_ai_review_queue()'::regprocedure
)) > 0, 'AI review queue excludes published and historical revisions');
select ok(position('job_summary' in pg_get_functiondef(
  'public.rpc_get_relationship_gist_ai_studio()'::regprocedure
)) > 0, 'AI studio exposes compact operational totals');

select * from finish();
rollback;
