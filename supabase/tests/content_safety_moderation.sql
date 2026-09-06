begin;

create extension if not exists pgtap with schema extensions;
select plan(23);

insert into auth.users(id, email) values
  ('97000000-0000-4000-8000-000000000001', 'content-admin@example.test'),
  ('97000000-0000-4000-8000-000000000002', 'content-sender@example.test'),
  ('97000000-0000-4000-8000-000000000003', 'content-receiver@example.test'),
  ('97000000-0000-4000-8000-000000000004', 'content-outsider@example.test');
insert into public.internal_admins(user_id, email, role)
values ('97000000-0000-4000-8000-000000000001', 'content-admin@example.test', 'moderation');

select set_config('app.profile_guard_write', 'on', true);
insert into public.profiles(
  id, user_id, full_name, age, gender, phone_number, phone_verified,
  identity_status, profile_completed, discoverable_in_vibes,
  profile_moderation_state, account_state, is_active
) values
  ('98000000-0000-4000-8000-000000000002', '97000000-0000-4000-8000-000000000002',
   'Content Sender', 30, 'MALE', '+447000000102', true, 'active', true, true, 'CLEAR', 'active', true),
  ('98000000-0000-4000-8000-000000000003', '97000000-0000-4000-8000-000000000003',
   'Content Receiver', 31, 'FEMALE', '+447000000103', true, 'active', true, true, 'CLEAR', 'active', true);
select set_config('app.profile_guard_write', 'off', true);

select is(
  public.content_safety_assess_private_message('Would you like to visit the museum Saturday?')->>'decision',
  'ALLOW', 'ordinary private conversation is allowed by the deterministic floor'
);
select is(
  public.content_safety_assess_private_message('Subscribe to my private photos on onlyfans')->>'decision',
  'BLOCK', 'explicit paid-content solicitation is blocked deterministically'
);
select ok(
  not has_function_privilege('authenticated',
    'public.rpc_service_send_moderated_private_message(uuid,uuid,text,text,text,uuid,text,text,text[],numeric,text,text,text,text)',
    'EXECUTE'),
  'authenticated clients cannot invoke the service insertion bridge'
);
select ok(
  not has_table_privilege('authenticated', 'public.content_moderation_events', 'SELECT'),
  'members cannot read private moderation evidence'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '97000000-0000-4000-8000-000000000002', true);
select throws_ok(
  $$ insert into public.messages(sender_id, receiver_id, client_message_id, text, message_type)
     values ('97000000-0000-4000-8000-000000000002', '97000000-0000-4000-8000-000000000003',
       'direct-unsafe', 'Pay me for my private onlyfans photos', 'text') $$,
  '22023', 'MESSAGE_CONTENT_NOT_ALLOWED',
  'legacy direct inserts cannot bypass the deterministic safety floor'
);
reset role;

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select is(
  (public.rpc_service_send_moderated_private_message(
    '97000000-0000-4000-8000-000000000002', '97000000-0000-4000-8000-000000000003',
    'safe-1', 'Museum on Saturday?', 'text', null, null, 'ALLOW', '{}', 0,
    'openai', 'omni-moderation-latest', 'request-safe', null
  )->>'ok')::boolean,
  true, 'service bridge inserts an allowed moderated message'
);
select is(
  (public.rpc_service_send_moderated_private_message(
    '97000000-0000-4000-8000-000000000002', '97000000-0000-4000-8000-000000000003',
    'blocked-1', 'Subscribe to my private photos', 'text', null, null, 'BLOCK',
    array['paid_content_promotion'], 0.95, 'openai', 'gpt-5-mini', 'request-blocked', null
  )->>'code'),
  'MESSAGE_CONTENT_NOT_ALLOWED', 'blocked content is not delivered'
);
reset role;

select ok(
  not exists(select 1 from public.messages where client_message_id = 'blocked-1'),
  'blocked private-message content never enters the messages table'
);
select is(
  (select evidence_snapshot->>'text' from public.content_moderation_events
   where client_content_id = 'blocked-1'),
  'Subscribe to my private photos', 'blocked evidence retains the exact attempted text'
);

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select public.rpc_service_send_moderated_private_message(
  '97000000-0000-4000-8000-000000000002', '97000000-0000-4000-8000-000000000003',
  'blocked-1', 'Subscribe to my private photos', 'text', null, null, 'BLOCK',
  array['paid_content_promotion'], 0.95, 'openai', 'gpt-5-mini', 'request-blocked', null
);
select is(
  (select count(*)::integer from public.content_moderation_events where client_content_id = 'blocked-1'),
  1, 'moderation event recording is idempotent'
);
select public.rpc_service_send_moderated_private_message(
  '97000000-0000-4000-8000-000000000002', '97000000-0000-4000-8000-000000000003',
  'blocked-2', 'Send money for access', 'text', null, null, 'BLOCK',
  array['financial_solicitation'], 0.95, 'openai', 'gpt-5-mini', 'request-blocked-2', null
);
select public.rpc_service_send_moderated_private_message(
  '97000000-0000-4000-8000-000000000002', '97000000-0000-4000-8000-000000000003',
  'blocked-3', 'Pay for private membership', 'text', null, null, 'BLOCK',
  array['paid_content_promotion'], 0.95, 'openai', 'gpt-5-mini', 'request-blocked-3', null
);
select ok(
  (select restricted_until > timezone('utc', now()) from public.content_safety_actor_state
   where user_id = '97000000-0000-4000-8000-000000000002'),
  'three unique blocked attempts temporarily restrict messaging'
);
select is(
  (public.rpc_service_send_moderated_private_message(
    '97000000-0000-4000-8000-000000000002', '97000000-0000-4000-8000-000000000003',
    'safe-after-restriction', 'Hello', 'text', null, null, 'ALLOW', '{}', 0,
    'openai', 'omni-moderation-latest', null, null
  )->>'code'),
  'MESSAGING_TEMPORARILY_RESTRICTED', 'active repeat-offender restriction blocks later sends'
);

update public.content_safety_actor_state set restricted_until = null
where user_id = '97000000-0000-4000-8000-000000000002';
select public.rpc_service_send_moderated_private_message(
  '97000000-0000-4000-8000-000000000002', '97000000-0000-4000-8000-000000000003',
  'review-1', 'Ask me about an opportunity elsewhere', 'text', null, null, 'REVIEW',
  array['commercial_solicitation'], 0.68, 'openai', 'gpt-5-mini', 'request-review', null
);
select public.rpc_service_record_content_moderation_event(
  '97000000-0000-4000-8000-000000000002', null, 'profile_image', null,
  'profile-image-1', 'profile-photos', '97000000-0000-4000-8000-000000000002/test.jpg',
  'REVIEW', array['external_contact'], 0.7, '+44 7700 900000',
  '{"scores":{"external_contact":0.7}}', 'openai', 'gpt-5-mini', 'request-image', null
);
select is(
  (public.rpc_service_edit_moderated_private_message(
    '97000000-0000-4000-8000-000000000002',
    (select id from public.messages where client_message_id = 'safe-1'),
    'Museum on Sunday?', 'REVIEW', array['ambiguous_context'], 0.55,
    'openai', 'gpt-5-mini', 'request-edit', null
  )->>'code'),
  'MESSAGE_REVIEW_REQUIRED', 'ambiguous edits are held without changing the delivered message'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '97000000-0000-4000-8000-000000000004', true);
select throws_ok(
  $$ select * from public.rpc_admin_get_content_moderation_events(100) $$,
  '42501', 'ADMIN_REQUIRED', 'non-admin cannot read content moderation evidence'
);
select set_config('request.jwt.claim.sub', '97000000-0000-4000-8000-000000000001', true);
select is(
  (select count(*)::integer from public.rpc_admin_get_content_moderation_events(100)
   where status = 'PENDING_REVIEW'),
  3, 'admin queue includes pending message, edit, and image reviews'
);
select lives_ok(
  $$ select public.rpc_admin_resolve_content_moderation_event(
    (select event_id from public.rpc_admin_get_content_moderation_events(100)
     where client_content_id = 'review-1'),
    'APPROVE', 'Benign after contextual review.'
  ) $$,
  'admin can approve and release a held private message'
);
select lives_ok(
  $$ select public.rpc_admin_resolve_content_moderation_event(
    (select event_id from public.rpc_admin_get_content_moderation_events(100)
     where content_type = 'private_message_edit'),
    'APPROVE', 'Benign edit after contextual review.'
  ) $$,
  'admin can approve a non-stale held private-message edit'
);
reset role;

select ok(
  exists(select 1 from public.messages where client_message_id = 'review-1'),
  'approved held message is delivered exactly once'
);
select is(
  (select reviewed_by from public.content_moderation_events where client_content_id = 'review-1'),
  '97000000-0000-4000-8000-000000000001'::uuid,
  'moderation resolution records the authenticated reviewer'
);
select is(
  (select text from public.messages where client_message_id = 'safe-1'),
  'Museum on Sunday?', 'approved held edit updates the delivered message'
);
select ok(
  (select not public from storage.buckets where id = 'moderation-quarantine'),
  'image evidence quarantine is private'
);
select ok(
  not has_function_privilege('authenticated',
    'public.trg_enforce_private_message_safety_floor()', 'EXECUTE'),
  'members cannot execute the trigger helper directly'
);
select is(
  (select count(*)::integer from public.system_messages
   where user_id = '97000000-0000-4000-8000-000000000001'
     and event_type = 'admin_queue_item'
     and metadata->>'queue_type' = 'content_moderation'),
  3, 'each pending content review creates an admin queue notification'
);

select * from finish();
rollback;
