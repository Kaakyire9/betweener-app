begin;

create extension if not exists pgtap with schema extensions;
select plan(12);

insert into auth.users(id, email) values
  ('93000000-0000-4000-8000-000000000001', 'guard-admin@example.test'),
  ('93000000-0000-4000-8000-000000000002', 'guard-member@example.test'),
  ('93000000-0000-4000-8000-000000000003', 'guard-outsider@example.test');
insert into public.internal_admins(user_id, email, role)
values ('93000000-0000-4000-8000-000000000001', 'guard-admin@example.test', 'moderation');

select set_config('app.profile_guard_write', 'on', true);
insert into public.profiles(
  id, user_id, full_name, age, gender, bio, phone_number, phone_verified,
  identity_status, profile_completed, discoverable_in_vibes,
  profile_moderation_state, account_state, is_active
) values (
  '94000000-0000-4000-8000-000000000001',
  '93000000-0000-4000-8000-000000000002',
  'Guard Queue Member', 30, 'MALE', 'A safe current biography.',
  '+447000000099', true, 'active', true, true, 'CLEAR', 'active', true
);
select set_config('app.profile_guard_write', 'off', true);

select ok(
  not has_function_privilege('anon', 'public.rpc_admin_get_profile_guard_review_queue(boolean,integer)', 'EXECUTE'),
  'anonymous users cannot read the guard review queue'
);
select ok(
  has_function_privilege('authenticated', 'public.rpc_admin_get_profile_guard_review_queue(boolean,integer)', 'EXECUTE'),
  'authenticated admins can invoke the guarded queue RPC'
);

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select lives_ok(
  $$ select public.rpc_apply_profile_guard_semantic_decision(
    '93000000-0000-4000-8000-000000000002',
    'external_redirection',
    '{"normal_dating_profile":0.05,"external_contact":0.1,"external_redirection":0.9,"commercial_solicitation":0.2,"paid_content_promotion":0.5,"sexual_service_solicitation":0,"financial_solicitation":0,"spam":0.1}'::jsonb,
    '{"profile_updates":{"bio":"Ask me how to subscribe away from this app."}}'::jsonb
  ) $$,
  'service role creates a semantic review with submitted evidence'
);
reset role;

select is(
  (select evidence_snapshot->'profile_updates'->>'bio'
   from public.profile_moderation_events
   where profile_id = '94000000-0000-4000-8000-000000000001'
   order by created_at desc limit 1),
  'Ask me how to subscribe away from this app.',
  'the exact submitted guarded field is retained as immutable evidence'
);
select ok(
  exists(select 1 from public.system_messages
    where user_id = '93000000-0000-4000-8000-000000000001'
      and event_type = 'admin_queue_item'
      and metadata->>'queue_type' = 'profile_guard_review'),
  'admins receive a new queue notification'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '93000000-0000-4000-8000-000000000003', true);
select throws_ok(
  $$ select * from public.rpc_admin_get_profile_guard_review_queue(false, 100) $$,
  '42501', 'ADMIN_REQUIRED', 'non-admin cannot read the review queue'
);
select set_config('request.jwt.claim.sub', '93000000-0000-4000-8000-000000000001', true);
select is(
  (select count(*)::integer from public.rpc_admin_get_profile_guard_review_queue(false, 100)),
  1,
  'admin sees the pending review'
);
select lives_ok(
  $$ select public.rpc_admin_resolve_profile_guard_review(
    (select review_id from public.rpc_admin_get_profile_guard_review_queue(false, 100) limit 1),
    'CLEAR', 'CONTENT_REVIEWED_SAFE', 'Reviewed against the submitted snapshot.'
  ) $$,
  'admin can clear an event-scoped review'
);
reset role;

select is(
  (select profile_moderation_state from public.profiles
   where id = '94000000-0000-4000-8000-000000000001'),
  'CLEAR',
  'clearing the final review restores the clear state'
);
select is(
  (select discoverable_in_vibes from public.profiles
   where id = '94000000-0000-4000-8000-000000000001'),
  true,
  'clearing the final review restores prior discoverability'
);
select is(
  (select reviewed_by from public.profile_moderation_events
   where profile_id = '94000000-0000-4000-8000-000000000001'
   order by created_at desc limit 1),
  '93000000-0000-4000-8000-000000000001'::uuid,
  'the authenticated reviewer identity is audited'
);
select ok(
  exists(select 1 from public.system_messages
    where user_id = '93000000-0000-4000-8000-000000000002'
      and event_type = 'profile_guard_review_resolved'),
  'the affected member receives a resolution notification'
);

select * from finish();
rollback;
