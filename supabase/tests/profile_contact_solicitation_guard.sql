begin;

create extension if not exists pgtap with schema extensions;
select plan(55);

select set_config('app.profile_guard_write', 'on', true);
insert into auth.users(id, email) values
  ('91000000-0000-4000-8000-000000000001', 'guard-owner@example.test'),
  ('91000000-0000-4000-8000-000000000002', 'guard-other@example.test'),
  ('91000000-0000-4000-8000-000000000003', 'guard-review@example.test'),
  ('91000000-0000-4000-8000-000000000004', 'guard-legacy@example.test');
insert into public.profiles(
  id, user_id, full_name, age, gender, bio, phone_number, phone_verified,
  identity_status, profile_completed, discoverable_in_vibes,
  profile_moderation_state, account_state, is_active
) values
  ('92000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001',
    'Guard Owner', 30, 'MALE', 'I enjoy hiking.', '+447000000001', true,
    'active', true, true, 'CLEAR', 'active', true),
  ('92000000-0000-4000-8000-000000000002', '91000000-0000-4000-8000-000000000002',
    'Guard Other', 29, 'FEMALE', 'I enjoy cooking.', '+447000000002', true,
    'active', true, true, 'CLEAR', 'active', true),
  ('92000000-0000-4000-8000-000000000003', '91000000-0000-4000-8000-000000000003',
    'Guard Review', 31, 'FEMALE', 'I enjoy books.', '+447000000003', true,
    'active', true, false, 'REVIEW_REQUIRED', 'active', true),
  ('92000000-0000-4000-8000-000000000004', '91000000-0000-4000-8000-000000000004',
    'Guard Legacy', 28, 'FEMALE', 'Message me on Signal +44 7000 000004',
    '+447000000004', true, 'active', true, true, 'CLEAR', 'active', true);
insert into public.profile_prompts(
  profile_id, prompt_key, prompt_title, answer, prompt_type, reveal_policy
) values (
  '92000000-0000-4000-8000-000000000001', 'guard_test',
  'A safe prompt', 'A safe answer', 'standard', 'never'
);
select set_config('app.profile_guard_write', 'off', true);

select ok(not exists (
  select 1
  from pg_catalog.pg_proc procedure_row,
    lateral aclexplode(coalesce(procedure_row.proacl, acldefault('f', procedure_row.proowner))) acl
  where procedure_row.oid = 'public.rpc_service_update_profile_with_guard(uuid,jsonb)'::regprocedure
    and acl.grantee = 0 and acl.privilege_type = 'EXECUTE'
), 'PUBLIC cannot execute bridge');
select ok(not has_function_privilege('anon', 'public.rpc_service_update_profile_with_guard(uuid,jsonb)', 'EXECUTE'), 'anon cannot execute bridge');
select ok(not has_function_privilege('authenticated', 'public.rpc_service_update_profile_with_guard(uuid,jsonb)', 'EXECUTE'), 'authenticated cannot execute bridge');
select ok(has_function_privilege('service_role', 'public.rpc_service_update_profile_with_guard(uuid,jsonb)', 'EXECUTE'), 'service_role can execute bridge');
select ok(
  not has_function_privilege(
    'anon',
    'public.rpc_backfill_profile_contact_guard(integer,uuid,boolean)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.rpc_backfill_profile_contact_guard(integer,uuid,boolean)',
    'EXECUTE'
  ),
  'client roles cannot execute backfill'
);
select ok(
  not has_function_privilege(
    'anon', 'public.rpc_enforce_profile_contact_guard(uuid)', 'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated', 'public.rpc_enforce_profile_contact_guard(uuid)', 'EXECUTE'
  ),
  'client roles cannot execute targeted legacy enforcement'
);
select ok(
  has_function_privilege(
    'service_role', 'public.rpc_enforce_profile_contact_guard(uuid)', 'EXECUTE'
  ),
  'service role can execute targeted legacy enforcement'
);
select is(
  public.profile_guard_assess(
    'See my exclusive on my onlyfan$. I''m online on Signal +1 239 219 2426'
  )->>'decision',
  'RESTRICT_PROFILE',
  'explicit paid-platform and messaging redirection is restricted'
);
select ok(
  (public.profile_guard_assess('I''m online on Signal')->'categories')
    ? 'EXTERNAL_MESSAGING',
  'first-person messaging availability is detected'
);
select ok(
  (public.profile_guard_assess('See my exclusive on my onlyfan$')->'categories')
    ? 'PAID_CONTENT_PROMOTION',
  'explicit paid-platform promotion is detected'
);
select is(
  public.profile_guard_assess(
    'I build software for OnlyFans creators.'
  )->>'decision',
  'ALLOW',
  'non-promotional professional platform context remains allowed'
);
select ok(
  (public.profile_guard_assess(
    'I sell private membership photos away from this app. Ask me how to subscribe.'
  )->'categories') ? 'PAID_CONTENT_PROMOTION',
  'content-commerce wording is caught without the semantic provider'
);
select ok(
  (public.profile_guard_assess('See my O n l y F a n s page.')->'categories')
    ? 'PAID_CONTENT_PROMOTION',
  'spaced paid-platform wording is caught deterministically'
);

set local role anon;
select results_eq(
  $$
    with attempted_update as (
      update public.profiles
      set bio = 'anon write'
      where id = '92000000-0000-4000-8000-000000000001'
      returning 1
    )
    select count(*) from attempted_update
  $$,
  $$ values (0::bigint) $$,
  'anon direct update affects no rows'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '91000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$ update public.profiles set bio = 'direct owner write' where id = '92000000-0000-4000-8000-000000000001' $$,
  'released owner can save a deterministic-safe profile edit during compatibility window'
);
select throws_ok(
  $$ update public.profiles set username = 'contact_me_elsewhere' where id = '92000000-0000-4000-8000-000000000001' $$,
  '42501', 'PROFILE_HANDLE_RPC_REQUIRED', 'owner direct username redirection is denied'
);
select throws_ok(
  $$ update public.profiles set personality_type = 'Ask how to subscribe' where id = '92000000-0000-4000-8000-000000000001' $$,
  '42501', 'PROFILE_CONTENT_NOT_ALLOWED', 'owner direct secondary solicitation is denied'
);
select throws_ok(
  $$ update public.profile_prompts set hint_text = 'find me elsewhere'
     where profile_id = '92000000-0000-4000-8000-000000000001' $$,
  '42501', 'PROFILE_GUARD_REQUIRED', 'owner direct prompt-hint update is denied'
);
select set_config('request.jwt.claim.sub', '91000000-0000-4000-8000-000000000003', true);
select throws_ok(
  $$ update public.profiles set profile_moderation_state = 'CLEAR' where id = '92000000-0000-4000-8000-000000000003' $$,
  '42501', 'PROFILE_MODERATION_STATE_SERVER_MANAGED', 'owner cannot clear moderation state directly'
);
select set_config('request.jwt.claim.sub', '91000000-0000-4000-8000-000000000001', true);
select throws_ok(
  $$ select public.rpc_service_update_profile_with_guard('91000000-0000-4000-8000-000000000002', '{"bio":"wrong user"}'::jsonb) $$,
  null, null, 'authenticated caller cannot invoke bridge for another user'
);
select throws_ok(
  $$ insert into public.profile_moderation_events(user_id, profile_id, risk_score, decision, source, detector_version)
     values ('91000000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000001', 0, 'ALLOW', 'profile_write', 'test') $$,
  null, null, 'authenticated cannot mutate moderation evidence'
);
select throws_ok(
  $$ select public.rpc_resolve_profile_guard_review('92000000-0000-4000-8000-000000000003', 'CLEAR', 'not-admin') $$,
  '42501', 'ADMIN_REQUIRED', 'non-admin cannot resolve review'
);
reset role;

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select ok(
  has_function_privilege(
    'service_role',
    'public.rpc_service_update_profile_with_guard_v2(uuid,jsonb,timestamptz)',
    'EXECUTE'
  ),
  'service role can execute the concurrency-safe bridge'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.rpc_service_update_profile_with_guard_v2(uuid,jsonb,timestamptz)',
    'EXECUTE'
  ),
  'authenticated cannot execute the concurrency-safe bridge'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.rpc_service_consume_profile_guard_rate_limit(uuid)',
    'EXECUTE'
  ),
  'service role can consume the semantic rate limit'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.rpc_service_consume_profile_guard_rate_limit(uuid)',
    'EXECUTE'
  ),
  'authenticated cannot consume the semantic rate limit'
);
select is(
  (public.rpc_service_update_profile_with_guard_v2(
    '91000000-0000-4000-8000-000000000001',
    '{"bio":"Concurrency-safe profile update."}'::jsonb,
    (select updated_at from public.profiles
      where user_id = '91000000-0000-4000-8000-000000000001')
  )->>'ok')::boolean,
  true,
  'concurrency-safe bridge accepts the current profile version'
);
select throws_ok(
  $$ select public.rpc_service_update_profile_with_guard_v2(
       '91000000-0000-4000-8000-000000000001',
       '{"bio":"Stale update."}'::jsonb,
       '2000-01-01 00:00:00+00'::timestamptz
     ) $$,
  '40001', 'PROFILE_WRITE_CONFLICT', 'concurrency-safe bridge rejects a stale profile version'
);
select ok(
  (public.rpc_service_consume_profile_guard_rate_limit(
    '91000000-0000-4000-8000-000000000001'
  )->>'allowed')::boolean,
  'semantic limiter initially permits a request'
);
select ok(
  (
    select bool_and((public.rpc_service_consume_profile_guard_rate_limit(
      '91000000-0000-4000-8000-000000000001'
    )->>'allowed')::boolean)
    from generate_series(1, 11)
  ),
  'semantic limiter permits twelve requests per window'
);
select ok(
  not (public.rpc_service_consume_profile_guard_rate_limit(
    '91000000-0000-4000-8000-000000000001'
  )->>'allowed')::boolean,
  'semantic limiter rejects the thirteenth request'
);
select is(
  (public.rpc_service_update_profile_with_guard(
    '91000000-0000-4000-8000-000000000001', '{"bio":"I enjoy museums.","city":"Accra","region":"Greater Accra","current_country":"Ghana","location":"Accra, Greater Accra, Ghana"}'::jsonb
  )->>'ok')::boolean,
  true,
  'service bridge accepts an owner-safe guarded update'
);
select is(
  public.profile_guard_assess(
    '{"pace":"balanced","updatedAt":"2026-09-01T15:04:57.497Z","radius":80}'
  )->>'decision',
  'ALLOW',
  'structured ISO timestamps are not classified as phone numbers'
);
select isnt(
  public.profile_guard_assess('Call me on +44 7000 000001')->>'decision',
  'ALLOW',
  'real phone numbers remain blocked after timestamp normalization'
);
select throws_ok(
  $$ select public.rpc_service_update_profile_with_guard(
       '91000000-0000-4000-8000-000000000001',
       '{"verification_level":99}'::jsonb
     ) $$,
  '42501', 'PROFILE_FIELD_NOT_ALLOWED', 'bridge rejects a non-allowlisted security field'
);
select throws_ok(
  $$ select public.rpc_service_update_profile_with_guard(
       '91000000-0000-4000-8000-000000000001',
       '{"city":"Subscribe Now","location":"Subscribe Now, Ghana"}'::jsonb
     ) $$,
  '22023', 'INVALID_STRUCTURED_PROFILE_FIELD', 'structured location rejects promotional prose'
);
select is(
  public.rpc_service_update_profile_with_guard(
    '91000000-0000-4000-8000-000000000001',
    '{"bio":"Message me on WhatsApp +44 7000 000001"}'::jsonb
  )->>'code',
  'PROFILE_CONTENT_NOT_ALLOWED',
  'unsafe guarded update receives a moderation decision'
);
reset role;

select ok(not public.can_profile_surface_publicly('92000000-0000-4000-8000-000000000001'), 'ACTION_REQUIRED or RESTRICTED profile is absent publicly');
select ok(not public.can_profile_surface_publicly('92000000-0000-4000-8000-000000000003'), 'REVIEW_REQUIRED profile is absent publicly');

select set_config('app.profile_guard_write', 'on', true);
update public.profiles set profile_moderation_state = 'ACTION_REQUIRED', discoverable_in_vibes = false
where id = '92000000-0000-4000-8000-000000000003';
select set_config('app.profile_guard_write', 'off', true);
select ok(not public.can_profile_surface_publicly('92000000-0000-4000-8000-000000000003'), 'ACTION_REQUIRED profile is absent publicly');
select set_config('app.profile_guard_write', 'on', true);
update public.profiles set profile_moderation_state = 'REVIEW_REQUIRED', discoverable_in_vibes = false
where id = '92000000-0000-4000-8000-000000000003';
select set_config('app.profile_guard_write', 'off', true);

select set_config('app.profile_guard_write', 'on', true);
update public.profiles set profile_moderation_state = 'SUSPENDED', discoverable_in_vibes = false
where id = '92000000-0000-4000-8000-000000000002';
select set_config('app.profile_guard_write', 'off', true);
select ok(not public.can_profile_surface_publicly('92000000-0000-4000-8000-000000000002'), 'SUSPENDED profile is absent publicly');

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select is(
  (public.rpc_service_update_profile_with_guard(
    '91000000-0000-4000-8000-000000000001', '{"bio":"I enjoy safe community events."}'::jsonb
  )->>'ok')::boolean,
  true,
  'safe correction is accepted'
);
reset role;
select is((select profile_moderation_state from public.profiles where id = '92000000-0000-4000-8000-000000000001'), 'CLEAR', 'safe correction clears deterministic action state');

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select is(
  (public.rpc_service_update_profile_with_guard(
    '91000000-0000-4000-8000-000000000003', '{"bio":"A corrected, safe profile."}'::jsonb
  )->>'ok')::boolean,
  true,
  'safe correction can be stored while review is pending'
);
reset role;
select is((select profile_moderation_state from public.profiles where id = '92000000-0000-4000-8000-000000000003'), 'REVIEW_REQUIRED', 'safe correction does not clear REVIEW_REQUIRED');

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select lives_ok(
  $$ select public.rpc_apply_profile_guard_semantic_decision(
    '91000000-0000-4000-8000-000000000003', 'spam',
    '{"normal_dating_profile":0.1,"external_contact":0,"external_redirection":0,"commercial_solicitation":0,"paid_content_promotion":0,"sexual_service_solicitation":0,"financial_solicitation":0,"spam":0.9}'::jsonb
  ) $$,
  'service role can record an authorized semantic management action'
);
reset role;

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select is(
  public.rpc_enforce_profile_contact_guard(
    '92000000-0000-4000-8000-000000000004'
  )->>'decision',
  'RESTRICT_PROFILE',
  'targeted legacy enforcement applies the deterministic decision'
);
select is(
  public.rpc_enforce_profile_contact_guard(
    '92000000-0000-4000-8000-000000000004'
  )->>'decision',
  'RESTRICT_PROFILE',
  'repeat enforcement preserves the original remediation lifecycle'
);
reset role;
select is(
  (select profile_moderation_state from public.profiles
   where id = '92000000-0000-4000-8000-000000000004'),
  'RESTRICTED',
  'targeted legacy enforcement restricts the profile'
);
select is(
  (select discoverable_in_vibes from public.profiles
   where id = '92000000-0000-4000-8000-000000000004'),
  false,
  'targeted legacy enforcement removes public discovery'
);
select is(
  (select (metadata->>'prior_discoverable')::boolean
   from public.profile_moderation_events
   where profile_id = '92000000-0000-4000-8000-000000000004'
     and source = 'moderation_action'
   order by created_at desc
   limit 1),
  true,
  'legacy enforcement records prior discoverability without raw profile text'
);

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select is(
  (public.rpc_service_update_profile_with_guard(
    '91000000-0000-4000-8000-000000000004',
    '{"bio":"I enjoy safe community events."}'::jsonb
  )->>'ok')::boolean,
  true,
  'legacy profile can submit a safe correction'
);
reset role;
select is(
  (select profile_moderation_state from public.profiles
   where id = '92000000-0000-4000-8000-000000000004'),
  'CLEAR',
  'safe legacy correction clears deterministic restriction'
);
select is(
  (select discoverable_in_vibes from public.profiles
   where id = '92000000-0000-4000-8000-000000000004'),
  true,
  'safe legacy correction restores prior discoverability'
);
select isnt(
  (select resolved_at from public.profile_moderation_events
   where profile_id = '92000000-0000-4000-8000-000000000004'
     and source = 'moderation_action'
   order by created_at desc
   limit 1),
  null::timestamptz,
  'safe legacy correction resolves its moderation event'
);

select * from finish();
rollback;
