begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions, pg_catalog;
set local role postgres;
select extensions.plan(5);

select extensions.ok(
  has_function_privilege(
    'service_role',
    'public.rpc_cancel_chat_attachment_batch(uuid,uuid,text,jsonb)',
    'EXECUTE'
  ),
  'the service boundary can cancel an attachment batch'
);

select extensions.ok(
  not has_function_privilege(
    'authenticated',
    'public.rpc_cancel_chat_attachment_batch(uuid,uuid,text,jsonb)',
    'EXECUTE'
  ),
  'clients cannot create cancellation tombstones directly'
);

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);

select extensions.lives_ok(
  $$
    select public.rpc_cancel_chat_attachment_batch(
      '98000000-0000-4000-8000-000000000001',
      '98000000-0000-4000-8000-000000000002',
      'album-cancel-staging-1',
      jsonb_build_array(jsonb_build_object(
        'attachmentId', '98000000-0000-4000-8000-000000000010',
        'bucketId', 'chat-attachment-staging-v1-2',
        'storagePath',
          '98000000-0000-4000-8000-000000000001/98000000-0000-4000-8000-000000000002/album-cancel-staging-1/98000000-0000-4000-8000-000000000010-photo.jpg',
        'previewStoragePath',
          '98000000-0000-4000-8000-000000000001/98000000-0000-4000-8000-000000000002/album-cancel-staging-1/98000000-0000-4000-8000-000000000010-preview.jpg'
      ))
    )
  $$,
  'an all-image v1.2 staging batch is tombstoned atomically'
);

set local role postgres;

select extensions.is(
  (
    select count(*)::integer
    from public.chat_attachment_cancellations
    where sender_id = '98000000-0000-4000-8000-000000000001'
      and client_message_id = 'album-cancel-staging-1'
  ),
  1,
  'the cancelled album cannot later be finalised'
);

select extensions.is(
  (
    select count(*)::integer
    from public.chat_attachment_cleanup_queue
    where bucket_id = 'chat-attachment-staging-v1-2'
      and storage_path like '%/album-cancel-staging-1/%'
  ),
  2,
  'both staged source and preview are scheduled for cleanup'
);

select * from extensions.finish();
rollback;
