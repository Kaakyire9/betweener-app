begin;

create extension if not exists pgtap with schema extensions;
select plan(10);

insert into auth.users(id, email) values
  ('99000000-0000-4000-8000-000000000001', 'view-once-sender@example.test'),
  ('99000000-0000-4000-8000-000000000002', 'view-once-receiver@example.test');

select ok(
  (select not public from storage.buckets where id = 'view-once-moderation'),
  'view-once plaintext staging bucket is private'
);
select is(
  (select file_size_limit from storage.buckets where id = 'view-once-moderation'),
  15728624::bigint,
  'plaintext staging enforces the image size ceiling'
);
select ok(
  exists(
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'Members upload own view once moderation media'
  ),
  'authenticated senders have an owner-scoped staging upload policy'
);
select ok(
  not has_table_privilege('authenticated', 'public.view_once_moderation_receipts', 'SELECT'),
  'members cannot read server encryption receipts'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.rpc_service_list_stale_view_once_moderation_objects(integer)',
    'EXECUTE'
  ),
  'members cannot enumerate staged plaintext objects'
);

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
insert into public.view_once_moderation_receipts(
  sender_user_id, receiver_user_id, client_message_id, attachment_id,
  original_name, mime_type, plaintext_sha256, encrypted_storage_path,
  encrypted_byte_size, encrypted_key_sender, encrypted_key_receiver,
  encrypted_key_nonce, encrypted_media_nonce, encryption_public_key,
  moderation_provider, moderation_model
) values (
  '99000000-0000-4000-8000-000000000001',
  '99000000-0000-4000-8000-000000000002',
  'view-once-message-1', '99000000-0000-4000-8000-000000000010',
  'photo.jpg', 'image/jpeg', repeat('a', 64),
  '99000000-0000-4000-8000-000000000001/99000000-0000-4000-8000-000000000002/view-once-message-1/cipher.enc',
  1024, 'sender-wrapped-key', 'receiver-wrapped-key', 'key-nonce',
  'media-nonce', 'encryption-public-key', 'openai', 'omni-moderation-latest'
);
select is(
  (select count(*)::integer from public.view_once_moderation_receipts),
  1,
  'service role can persist an approved plaintext-to-ciphertext receipt'
);
select throws_ok(
  $$ insert into public.view_once_moderation_receipts(
       sender_user_id, receiver_user_id, client_message_id, attachment_id,
       mime_type, plaintext_sha256, encrypted_storage_path, encrypted_byte_size,
       encrypted_key_sender, encrypted_key_receiver, encrypted_key_nonce,
       encrypted_media_nonce, encryption_public_key, moderation_provider, moderation_model
     ) values (
       '99000000-0000-4000-8000-000000000001',
       '99000000-0000-4000-8000-000000000002',
       'view-once-message-1', '99000000-0000-4000-8000-000000000010',
       'image/jpeg', repeat('b', 64), 'different.enc', 1024,
       'a', 'b', 'c', 'd', 'e', 'openai', 'omni-moderation-latest'
     ) $$,
  '23505',
  null,
  'one receipt identity cannot be rebound to different plaintext'
);
select lives_ok(
  $$ select * from public.rpc_service_list_stale_view_once_moderation_objects(10) $$,
  'retention worker can enumerate expired plaintext staging objects'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '99000000-0000-4000-8000-000000000001', true);
select throws_ok(
  $$ select * from public.view_once_moderation_receipts $$,
  '42501',
  'permission denied for table view_once_moderation_receipts',
  'the sender cannot query service-only encryption receipts'
);
reset role;

select ok(
  (select expires_at > created_at from public.view_once_moderation_receipts limit 1),
  'server receipts expire after their retry window'
);

select * from finish();
rollback;
