begin;

set local role postgres;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select plan(16);

select has_table('public', 'relationship_gist_ai_image_jobs', 'image jobs are durable');
select has_table('public', 'relationship_gist_revision_images', 'revision image assets are durable');
select has_column('public', 'relationship_gist_ai_environment_policies', 'image_enabled', 'image generation has an independent server gate');
select has_column('public', 'relationship_gist_ai_environment_policies', 'daily_image_job_budget', 'image generation has a daily budget');
select ok(to_regprocedure('public.rpc_request_relationship_gist_ai_image_generation(uuid,text,uuid)') is not null, 'image request RPC exists');
select ok(to_regprocedure('public.rpc_service_claim_relationship_gist_ai_image_job(uuid,text)') is not null, 'service image claim RPC exists');
select ok(to_regprocedure('public.rpc_service_complete_relationship_gist_ai_image_job(uuid,text,text,text,integer,integer,text,text,text,integer,integer,bigint)') is not null, 'service image completion RPC exists');
select ok(to_regprocedure('public.rpc_review_relationship_gist_ai_image(uuid,text,text)') is not null, 'human image review RPC exists');
select ok(to_regprocedure('public.rpc_get_relationship_gist_cover(uuid,text)') is not null, 'reader cover RPC exists');
select ok(not has_function_privilege('anon', 'public.rpc_get_relationship_gist_cover(uuid,text)', 'EXECUTE'), 'anonymous readers cannot resolve covers');
select ok(has_function_privilege('authenticated', 'public.rpc_get_relationship_gist_cover(uuid,text)', 'EXECUTE'), 'authenticated readers can resolve approved covers');
select ok(not has_function_privilege('authenticated', 'public.rpc_service_complete_relationship_gist_ai_image_job(uuid,text,text,text,integer,integer,text,text,text,integer,integer,bigint)', 'EXECUTE'), 'clients cannot complete image jobs');
select ok(has_function_privilege('service_role', 'public.rpc_service_complete_relationship_gist_ai_image_job(uuid,text,text,text,integer,integer,text,text,text,integer,integer,bigint)', 'EXECUTE'), 'service worker can complete image jobs');
select ok(not has_table_privilege('authenticated', 'public.relationship_gist_ai_image_jobs', 'SELECT'), 'clients cannot inspect image job internals');
select ok(not has_table_privilege('authenticated', 'public.relationship_gist_revision_images', 'INSERT'), 'clients cannot insert image assets');
select is((select public from storage.buckets where id = 'relationship-gist-covers'), false, 'cover bucket remains private');

select * from finish();
rollback;
