begin;

set local role postgres;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select plan(17);

-- Linked-project pgTAP connects through the CLI login role. Pair the guarded
-- fixture write flag with the service role claim expected by the profile guard.
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('app.profile_guard_write', 'on', true);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
)
select
  fixture.id,
  '00000000-0000-0000-0000-000000000000'::uuid,
  'authenticated',
  'authenticated',
  fixture.email,
  '',
  timezone('utc', now()),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  timezone('utc', now()),
  timezone('utc', now())
from (values
  ('ca510000-0000-0000-0000-000000000001'::uuid, 'live-host@example.invalid'),
  ('ca510000-0000-0000-0000-000000000002'::uuid, 'ghana-resident@example.invalid'),
  ('ca510000-0000-0000-0000-000000000003'::uuid, 'ghana-diaspora@example.invalid'),
  ('ca510000-0000-0000-0000-000000000004'::uuid, 'unrelated-origin@example.invalid'),
  ('ca510000-0000-0000-0000-000000000005'::uuid, 'missing-location@example.invalid'),
  ('ca510000-0000-0000-0000-000000000006'::uuid, 'existing-member@example.invalid')
) fixture(id, email);

insert into public.profiles (
  id, user_id, full_name, current_country, current_country_code,
  origin_country, origin_country_code, city, account_state, is_active
)
values
  ('ca520000-0000-0000-0000-000000000001', 'ca510000-0000-0000-0000-000000000001', 'Live Host', 'Ghana', 'GH', 'Ghana', 'GH', 'Accra', 'active', true),
  ('ca520000-0000-0000-0000-000000000002', 'ca510000-0000-0000-0000-000000000002', 'Ghana Resident', 'Ghana', 'GH', 'Ghana', 'GH', 'Accra', 'active', true),
  ('ca520000-0000-0000-0000-000000000003', 'ca510000-0000-0000-0000-000000000003', 'Ghana Diaspora', 'United Kingdom', 'GB', 'Ghana', 'GH', 'London', 'active', true),
  ('ca520000-0000-0000-0000-000000000004', 'ca510000-0000-0000-0000-000000000004', 'Unrelated Origin', 'United Kingdom', 'GB', 'Nigeria', 'NG', 'London', 'active', true),
  ('ca520000-0000-0000-0000-000000000005', 'ca510000-0000-0000-0000-000000000005', 'Missing Location', null, null, null, null, null, 'active', true),
  ('ca520000-0000-0000-0000-000000000006', 'ca510000-0000-0000-0000-000000000006', 'Existing Member', 'United States', 'US', 'Nigeria', 'NG', 'New York', 'active', true);

select set_config('app.profile_guard_write', 'off', true);

insert into public.circles (
  id, name, slug, visibility, visibility_scope, status, created_by_profile_id,
  created_by_user_id, reach_scope, reach_scopes, country_code,
  country_name, diaspora_origin_country_codes,
  diaspora_destination_country_codes, access_policy,
  live_discovery_policy
)
values
  ('ca530000-0000-0000-0000-000000000001', 'Ghana Country Canary', 'ghana-country-canary', 'public', 'country', 'approved',
   'ca520000-0000-0000-0000-000000000001', 'ca510000-0000-0000-0000-000000000001',
   'country', array['country'], 'GH', 'Ghana', '{}', '{}', 'open', 'discoverable_join_required'),
  ('ca530000-0000-0000-0000-000000000002', 'Ghana Diaspora Canary', 'ghana-diaspora-canary', 'public', 'diaspora', 'approved',
   'ca520000-0000-0000-0000-000000000001', 'ca510000-0000-0000-0000-000000000001',
   'diaspora', array['diaspora'], 'GH', 'Ghana', array['GH'], '{}', 'open', 'discoverable_join_required'),
  ('ca530000-0000-0000-0000-000000000003', 'Invite Only Canary', 'invite-only-canary', 'private', 'invite_only', 'approved',
   'ca520000-0000-0000-0000-000000000001', 'ca510000-0000-0000-0000-000000000001',
   'country', array['country'], 'GH', 'Ghana', '{}', '{}', 'invite_only', 'discoverable_join_required');

insert into public.circle_members(circle_id, profile_id, user_id, role, status)
values
  ('ca530000-0000-0000-0000-000000000001', 'ca520000-0000-0000-0000-000000000001', 'ca510000-0000-0000-0000-000000000001', 'host', 'active'),
  ('ca530000-0000-0000-0000-000000000002', 'ca520000-0000-0000-0000-000000000001', 'ca510000-0000-0000-0000-000000000001', 'host', 'active'),
  ('ca530000-0000-0000-0000-000000000003', 'ca520000-0000-0000-0000-000000000001', 'ca510000-0000-0000-0000-000000000001', 'host', 'active'),
  ('ca530000-0000-0000-0000-000000000001', 'ca520000-0000-0000-0000-000000000006', 'ca510000-0000-0000-0000-000000000006', 'member', 'active');

insert into public.live_sessions (
  id, title, format, status, context_type, context_id, circle_id,
  created_by_user_id, created_by_profile_id, provider_call_id,
  scheduled_start, scheduled_end
)
values
  ('ca540000-0000-0000-0000-000000000001', 'Ghana Country Live', 'circle_live', 'scheduled', 'circle', 'ca530000-0000-0000-0000-000000000001', 'ca530000-0000-0000-0000-000000000001',
   'ca510000-0000-0000-0000-000000000001', 'ca520000-0000-0000-0000-000000000001', 'canary-country-live', now() + interval '1 hour', now() + interval '2 hours'),
  ('ca540000-0000-0000-0000-000000000002', 'Ghana Diaspora Live', 'circle_live', 'scheduled', 'circle', 'ca530000-0000-0000-0000-000000000002', 'ca530000-0000-0000-0000-000000000002',
   'ca510000-0000-0000-0000-000000000001', 'ca520000-0000-0000-0000-000000000001', 'canary-diaspora-live', now() + interval '1 hour', now() + interval '2 hours'),
  ('ca540000-0000-0000-0000-000000000003', 'Invite Only Live', 'circle_live', 'scheduled', 'circle', 'ca530000-0000-0000-0000-000000000003', 'ca530000-0000-0000-0000-000000000003',
   'ca510000-0000-0000-0000-000000000001', 'ca520000-0000-0000-0000-000000000001', 'canary-invite-live', now() + interval '1 hour', now() + interval '2 hours'),
  ('ca540000-0000-0000-0000-000000000004', 'Direct Ghana Live', 'special_event', 'scheduled', 'global', null, null,
   'ca510000-0000-0000-0000-000000000001', 'ca520000-0000-0000-0000-000000000001', 'canary-direct-country', now() + interval '1 hour', now() + interval '2 hours'),
  ('ca540000-0000-0000-0000-000000000005', 'Direct Global Live', 'special_event', 'scheduled', 'global', null, null,
   'ca510000-0000-0000-0000-000000000001', 'ca520000-0000-0000-0000-000000000001', 'canary-direct-global', now() + interval '1 hour', now() + interval '2 hours');

update public.live_session_audience_policies
set policy_mode = 'explicit', reach_scopes = array['country'],
    country_code = 'GH', country_name = 'Ghana'
where session_id = 'ca540000-0000-0000-0000-000000000004';

select ok(public.live_circle_reach_matches_user_v1('ca530000-0000-0000-0000-000000000001', 'ca510000-0000-0000-0000-000000000002'), 'Ghana resident matches Ghana country Reach');
select ok(not public.live_circle_reach_matches_user_v1('ca530000-0000-0000-0000-000000000002', 'ca510000-0000-0000-0000-000000000002'), 'Ghana resident is not treated as diaspora');
select ok(public.live_circle_reach_matches_user_v1('ca530000-0000-0000-0000-000000000002', 'ca510000-0000-0000-0000-000000000003'), 'Ghana-origin member abroad matches Ghana diaspora Reach');
select ok(not public.live_circle_reach_matches_user_v1('ca530000-0000-0000-0000-000000000001', 'ca510000-0000-0000-0000-000000000003'), 'Ghana-origin member abroad does not match Ghana country Reach');
select ok(not public.live_circle_reach_matches_user_v1('ca530000-0000-0000-0000-000000000002', 'ca510000-0000-0000-0000-000000000004'), 'Unrelated origin does not match Ghana diaspora Reach');
select ok(not public.live_circle_reach_matches_user_v1('ca530000-0000-0000-0000-000000000001', 'ca510000-0000-0000-0000-000000000005'), 'Missing location does not match targeted Reach');
select ok(public.live_circle_reach_matches_user_v1('ca530000-0000-0000-0000-000000000001', 'ca510000-0000-0000-0000-000000000006'), 'Existing member retains Circle Reach access after moving');

select ok(not public.live_audience_policy_matches_user_v1('ca540000-0000-0000-0000-000000000001', 'ca510000-0000-0000-0000-000000000002', 'admission'), 'Reach discovery does not bypass Circle membership for admission');
select ok(public.live_audience_policy_matches_user_v1('ca540000-0000-0000-0000-000000000001', 'ca510000-0000-0000-0000-000000000006', 'admission'), 'Active Circle member is admitted');
select ok(public.live_audience_policy_matches_user_v1('ca540000-0000-0000-0000-000000000004', 'ca510000-0000-0000-0000-000000000002', 'admission'), 'Direct country Live admits matching resident');
select ok(not public.live_audience_policy_matches_user_v1('ca540000-0000-0000-0000-000000000004', 'ca510000-0000-0000-0000-000000000003', 'admission'), 'Direct country Live rejects a non-resident diaspora viewer');
select ok(public.live_audience_policy_matches_user_v1('ca540000-0000-0000-0000-000000000005', 'ca510000-0000-0000-0000-000000000004', 'admission'), 'Direct global Live admits an authenticated member');

select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'ca510000-0000-0000-0000-000000000002', true);
select is((select count(*) from public.rpc_list_discoverable_circle_live_previews(24) where session_id = any(array['ca540000-0000-0000-0000-000000000001'::uuid, 'ca540000-0000-0000-0000-000000000002'::uuid, 'ca540000-0000-0000-0000-000000000003'::uuid])), 1::bigint, 'Ghana resident discovers only the Ghana country Live');
select set_config('request.jwt.claim.sub', 'ca510000-0000-0000-0000-000000000003', true);
select is((select count(*) from public.rpc_list_discoverable_circle_live_previews(24) where session_id = any(array['ca540000-0000-0000-0000-000000000001'::uuid, 'ca540000-0000-0000-0000-000000000002'::uuid, 'ca540000-0000-0000-0000-000000000003'::uuid])), 1::bigint, 'Ghana diaspora viewer discovers only the Ghana diaspora Live');
select set_config('request.jwt.claim.sub', 'ca510000-0000-0000-0000-000000000004', true);
select is((select count(*) from public.rpc_list_discoverable_circle_live_previews(24) where session_id = any(array['ca540000-0000-0000-0000-000000000001'::uuid, 'ca540000-0000-0000-0000-000000000002'::uuid, 'ca540000-0000-0000-0000-000000000003'::uuid])), 0::bigint, 'Unrelated origin discovers no Ghana-targeted Live');
select set_config('request.jwt.claim.sub', 'ca510000-0000-0000-0000-000000000006', true);
select is((select count(*) from public.rpc_list_discoverable_circle_live_previews(24) where session_id = any(array['ca540000-0000-0000-0000-000000000001'::uuid, 'ca540000-0000-0000-0000-000000000002'::uuid, 'ca540000-0000-0000-0000-000000000003'::uuid])), 1::bigint, 'Existing member discovers their Circle Live despite current location');

select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'anon', true);
select throws_ok(
  $$select count(*) from public.rpc_list_discoverable_circle_live_previews(24)$$,
  '42501',
  'unauthenticated',
  'Anonymous discovery is rejected'
);

select * from finish();
rollback;
