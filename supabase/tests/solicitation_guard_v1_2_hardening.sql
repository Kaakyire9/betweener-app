begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions, pg_catalog;
set local role postgres;
select extensions.plan(23);

select extensions.has_function('public', 'rpc_submit_ugc_content_report_v1',
  array['text', 'uuid', 'text', 'jsonb'], 'public UGC reporting RPC exists');
select extensions.has_function('public', 'rpc_service_match_unsafe_media_hash',
  array['text'], 'unsafe hash matcher exists');
select extensions.has_function('public', 'rpc_record_current_legal_acceptance_v1',
  array['text', 'text', 'text'], 'legal acceptance RPC exists');
select extensions.has_function('public', 'rpc_service_claim_moderation_evidence_retention',
  array['integer', 'interval'], 'retention claim RPC exists');
select extensions.has_function('public', 'configure_moderation_evidence_retention_worker',
  array['text', 'text'], 'retention scheduler configurator exists');
select extensions.has_function('public', 'invoke_moderation_evidence_retention_worker',
  array[]::text[], 'retention scheduler invocation exists');
select extensions.has_function('public', 'disable_moderation_evidence_retention_worker',
  array[]::text[], 'retention scheduler stop control exists');
select extensions.has_table('public', 'unsafe_media_hash_blocklist', 'unsafe hash list exists');
select extensions.has_table('public', 'moderation_evidence_retention_runs',
  'retention runs are durable');
select extensions.ok(not has_table_privilege('authenticated', 'public.unsafe_media_hash_blocklist', 'SELECT'),
  'members cannot enumerate unsafe hashes');
select extensions.ok(not has_function_privilege('authenticated',
  'public.rpc_service_match_unsafe_media_hash(text)', 'EXECUTE'),
  'members cannot probe unsafe hashes');
select extensions.ok(has_function_privilege('authenticated',
  'public.rpc_submit_ugc_content_report_v1(text,uuid,text,jsonb)', 'EXECUTE'),
  'members can report public UGC');
select extensions.ok(not has_function_privilege('authenticated',
  'public.rpc_service_claim_moderation_evidence_retention(integer,interval)', 'EXECUTE'),
  'members cannot claim moderation evidence');
select extensions.ok(not has_function_privilege('authenticated',
  'public.configure_moderation_evidence_retention_worker(text,text)', 'EXECUTE'),
  'members cannot configure the retention scheduler');
select extensions.ok(not has_function_privilege('authenticated',
  'public.disable_moderation_evidence_retention_worker()', 'EXECUTE'),
  'members cannot disable the retention scheduler');

insert into auth.users(id, email) values
  ('91000000-0000-4000-8000-000000000001', 'guard-v12@example.test');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '91000000-0000-4000-8000-000000000001', true);
select extensions.ok(public.rpc_record_current_legal_acceptance_v1('terms-v1', 'privacy-v1', '1.2.0'),
  'authenticated member can record legal acceptance');
select extensions.ok(public.rpc_record_current_legal_acceptance_v1('terms-v1', 'privacy-v1', '1.2.0'),
  'legal acceptance is idempotent');
set local role postgres;

select extensions.is((select count(*)::integer from public.legal_acceptances
  where user_id = '91000000-0000-4000-8000-000000000001'), 1,
  'duplicate acceptance creates one audit row');

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
insert into public.content_moderation_events(
  id, actor_user_id, content_type, decision, status, provider, provider_model,
  created_at
) values (
  '92000000-0000-4000-8000-000000000001',
  '91000000-0000-4000-8000-000000000001',
  'private_message', 'ALLOW', 'AUTO_CLOSED', 'pgtap', 'pgtap',
  timezone('utc', now()) - interval '100 days'
);
create temporary table first_retention_claim as
select public.rpc_service_claim_moderation_evidence_retention(
  250, interval '30 days'
) as result;
select extensions.isnt((select evidence_retention_claim_id
  from public.content_moderation_events
  where id = '92000000-0000-4000-8000-000000000001'), null,
  'eligible evidence is claimed');
select extensions.is((select count(*)::integer
  from public.moderation_evidence_retention_runs run
  where run.id = (select (result ->> 'run_id')::uuid from first_retention_claim)), 1,
  'claim creates one durable run');
create temporary table second_retention_claim as
select public.rpc_service_claim_moderation_evidence_retention(
  250, interval '30 days'
) as result;
select extensions.is((select evidence_retention_claim_id::text
  from public.content_moderation_events
  where id = '92000000-0000-4000-8000-000000000001'),
  (select result ->> 'run_id' from first_retention_claim),
  'an active claim cannot be reclaimed by an overlapping run');
insert into public.unsafe_media_hash_blocklist(sha256, category, source)
values (repeat('a', 64), 'CSAM', 'pgtap');
select extensions.is((public.rpc_service_match_unsafe_media_hash(repeat('a', 64))->>'matched')::boolean,
  true, 'known unsafe hash matches');
select extensions.is((public.rpc_service_match_unsafe_media_hash(repeat('b', 64))->>'matched')::boolean,
  false, 'unknown hash does not match');
set local role postgres;

select * from extensions.finish();
rollback;
