begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions, pg_catalog;
set local role postgres;
select extensions.plan(27);

select extensions.ok(exists (
  select 1 from storage.buckets
  where id = 'chat-attachment-staging-v1-2' and not public
), 'chat attachment staging is private');
select extensions.ok(not exists (
  select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
    and cmd = 'UPDATE' and coalesce(with_check, qual, '') like '%chat-attachment-staging-v1-2%'
), 'chat attachment staging objects cannot be overwritten');
select extensions.ok(exists (
  select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
    and cmd = 'INSERT' and roles @> array['authenticated']::name[]
    and with_check like '%chat-attachment-staging-v1-2%'
), 'sender-scoped chat staging upload policy exists');
select extensions.ok(exists (
  select 1 from pg_trigger where tgrelid = 'public.profiles'::regclass
    and tgname = 'enforce_profile_media_provenance_v1_2' and not tgisinternal
), 'profile media provenance trigger is active');
select extensions.ok(not public.profile_media_reference_is_approved(
  'a1000000-0000-4000-8000-000000000001',
  'https://test.supabase.co/storage/v1/object/public/moderated-profile-media/a1000000-0000-4000-8000-000000000001/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.jpg'
), 'bucket-shaped URL without a service approval record is rejected');
select extensions.ok(not public.profile_media_reference_is_approved(
  'a1000000-0000-4000-8000-000000000001',
  'https://test.supabase.co/storage/v1/object/public/profiles/a1000000-0000-4000-8000-000000000001/bypass.jpg'
), 'legacy public profile path is not approved provenance');
select extensions.has_table('public', 'approved_profile_media_objects',
  'approved profile-media provenance registry exists');
select extensions.has_function('public', 'rpc_service_register_approved_profile_media',
  array['uuid', 'text', 'text', 'text', 'bigint', 'text'],
  'service-owned profile-media registration RPC exists');

select extensions.has_table('public', 'media_hash_provider_capabilities',
  'provider capability state exists');
select extensions.has_function('public', 'rpc_service_get_media_hash_capabilities',
  array[]::text[], 'provider capability RPC exists');
set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select extensions.is(
  public.rpc_service_get_media_hash_capabilities() ->> 'provider_status',
  'HASH_PROVIDER_NOT_CONNECTED',
  'no external provider is honestly reported as not connected'
);
select extensions.is(
  (public.rpc_service_get_media_hash_capabilities() ->> 'external_provider_connected')::boolean,
  false,
  'synthetic/internal exact hashes are not represented as external coverage'
);
select extensions.ok(public.rpc_service_configure_test_hash_provider(true, 'staging'),
  'synthetic TEST provider can be enabled for staging');
select extensions.throws_ok(
  $$ select public.rpc_service_configure_test_hash_provider(true, 'production') $$,
  '22023', 'TEST_PROVIDER_NON_PRODUCTION_ONLY',
  'synthetic TEST provider cannot be enabled for production'
);
set local role postgres;

insert into auth.users(id, email) values
  ('a1000000-0000-4000-8000-000000000001', 'hold-owner@example.test'),
  ('a1000000-0000-4000-8000-000000000002', 'ordinary-admin@example.test');

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select public.rpc_service_register_approved_profile_media(
  'a1000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000001/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.jpg',
  'https://test.supabase.co/storage/v1/object/public/moderated-profile-media/a1000000-0000-4000-8000-000000000001/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.jpg',
  'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  42,
  'image/jpeg'
);
select extensions.ok(public.profile_media_reference_is_approved(
  'a1000000-0000-4000-8000-000000000001',
  'https://test.supabase.co/storage/v1/object/public/moderated-profile-media/a1000000-0000-4000-8000-000000000001/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.jpg'
), 'exact service-registered immutable profile URL is accepted');
set local role postgres;

insert into public.profiles(user_id, avatar_url, profile_completed, identity_status)
values (
  'a1000000-0000-4000-8000-000000000001',
  'https://test.supabase.co/storage/v1/object/public/moderated-profile-media/a1000000-0000-4000-8000-000000000001/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.jpg',
  true,
  'active'
)
on conflict (user_id) do update set
  avatar_url = excluded.avatar_url,
  profile_completed = excluded.profile_completed,
  identity_status = excluded.identity_status;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true);
select extensions.throws_ok(
  $$ update public.profiles
     set avatar_url = 'https://test.supabase.co/storage/v1/object/public/profiles/a1000000-0000-4000-8000-000000000001/bypass.jpg'
     where user_id = auth.uid() $$,
  '22023', 'PROFILE_MEDIA_GUARDED_CLIENT_REQUIRED',
  'legacy direct profile-media bypass is rejected'
);
update public.profiles set age = 31 where user_id = auth.uid();
select extensions.is((select age from public.profiles where user_id = auth.uid()),
  31, 'legacy non-media profile editing remains available');
set local role postgres;

select extensions.ok(not has_table_privilege('authenticated',
  'public.child_safety_evidence_transitions', 'SELECT'),
  'ordinary authenticated users cannot read evidence transition history');
select extensions.ok(not has_table_privilege('authenticated',
  'public.child_safety_reviewers', 'SELECT'),
  'ordinary authenticated users cannot enumerate child-safety reviewers');
select extensions.ok(not has_table_privilege('authenticated',
  'public.approved_profile_media_objects', 'SELECT'),
  'ordinary authenticated users cannot enumerate approved media provenance');

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
insert into public.content_moderation_events(
  id, actor_user_id, content_type, decision, status, categories,
  provider, provider_model, created_at, evidence_state, evidence_hold, legal_hold
) values
  ('a2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001',
    'chat_image', 'ALLOW', 'AUTO_CLOSED', '{}', 'test', 'test',
    timezone('utc', now()) - interval '100 days', 'RESOLVED', false, false),
  ('a2000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000001',
    'chat_image', 'REVIEW', 'PENDING_REVIEW', '{}', 'test', 'test',
    timezone('utc', now()) - interval '100 days', 'REVIEW_REQUIRED', false, false),
  ('a2000000-0000-4000-8000-000000000003', 'a1000000-0000-4000-8000-000000000001',
    'chat_image', 'BLOCK', 'AUTO_CLOSED', '{}', 'test', 'test',
    timezone('utc', now()) - interval '100 days', 'EVIDENCE_HOLD', true, false),
  ('a2000000-0000-4000-8000-000000000004', 'a1000000-0000-4000-8000-000000000001',
    'chat_image', 'BLOCK', 'AUTO_CLOSED', '{}', 'test', 'test',
    timezone('utc', now()) - interval '100 days', 'EVIDENCE_HOLD', false, true),
  ('a2000000-0000-4000-8000-000000000005', 'a1000000-0000-4000-8000-000000000001',
    'chat_image', 'BLOCK', 'AUTO_CLOSED', '{}', 'test', 'test',
    timezone('utc', now()) - interval '100 days', 'RESOLVED', false, false);

select public.rpc_service_claim_moderation_evidence_retention(250, interval '30 days');
select extensions.isnt((select evidence_retention_claim_id from public.content_moderation_events
  where id = 'a2000000-0000-4000-8000-000000000001'), null,
  'ordinary expired evidence is eligible for retention');
select extensions.is((select evidence_retention_claim_id from public.content_moderation_events
  where id = 'a2000000-0000-4000-8000-000000000002'), null,
  'pending review evidence is retained');
select extensions.is((select evidence_retention_claim_id from public.content_moderation_events
  where id = 'a2000000-0000-4000-8000-000000000003'), null,
  'evidence hold is retained');
select extensions.is((select evidence_retention_claim_id from public.content_moderation_events
  where id = 'a2000000-0000-4000-8000-000000000004'), null,
  'legal hold is retained');
select extensions.isnt((select evidence_retention_claim_id from public.content_moderation_events
  where id = 'a2000000-0000-4000-8000-000000000005'), null,
  'resolved non-held expired evidence is eligible for retention');

insert into public.content_moderation_events(
  id, actor_user_id, content_type, decision, status, categories,
  provider, provider_model, storage_bucket, storage_path
) values (
  'a2000000-0000-4000-8000-000000000006', 'a1000000-0000-4000-8000-000000000001',
  'chat_image', 'BLOCK', 'AUTO_CLOSED', array['known_illegal_media'],
  'synthetic-test', 'sha256-test', 'moderation-quarantine', 'synthetic/benign-fixture.png'
);
select extensions.is((select evidence_state from public.content_moderation_events
  where id = 'a2000000-0000-4000-8000-000000000006'), 'REVIEW_REQUIRED',
  'severe synthetic match enters specialist review state');
select extensions.is((select count(*)::integer from public.child_safety_evidence_transitions
  where event_id = 'a2000000-0000-4000-8000-000000000006'), 4,
  'child-safety evidence state changes have a complete audit trail');

select * from extensions.finish();
rollback;
