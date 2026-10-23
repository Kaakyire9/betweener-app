-- Betweener 1.2.0 grouped-media album health check.
-- Strictly read-only. Run after the unchanged 1.1.1 production health gate.
-- Every *_healthy boolean must be true and every release_blocker count zero.

select
  exists (
    select 1 from supabase_migrations.schema_migrations
    where version = '20260804120000'
  ) as album_schema_installed,
  exists (
    select 1 from supabase_migrations.schema_migrations
    where version = '20260919120000'
  ) as staging_cancellation_hardening_installed,
  to_regprocedure(
    'public.rpc_finalize_chat_media_album_v4(uuid,uuid,text,uuid,smallint,jsonb,text,uuid,jsonb)'
  ) is not null as album_finalizer_installed,
  to_regprocedure(
    'public.rpc_cancel_chat_attachment_batch(uuid,uuid,text,jsonb)'
  ) is not null as batch_cancellation_installed;

select
  not has_function_privilege(
    'authenticated',
    'public.rpc_finalize_chat_media_album_v4(uuid,uuid,text,uuid,smallint,jsonb,text,uuid,jsonb)',
    'EXECUTE'
  ) as authenticated_cannot_finalize,
  has_function_privilege(
    'service_role',
    'public.rpc_finalize_chat_media_album_v4(uuid,uuid,text,uuid,smallint,jsonb,text,uuid,jsonb)',
    'EXECUTE'
  ) as service_can_finalize,
  not has_function_privilege(
    'authenticated',
    'public.rpc_cancel_chat_attachment_batch(uuid,uuid,text,jsonb)',
    'EXECUTE'
  ) as authenticated_cannot_tombstone,
  has_function_privilege(
    'service_role',
    'public.rpc_cancel_chat_attachment_batch(uuid,uuid,text,jsonb)',
    'EXECUTE'
  ) as service_can_tombstone;

select count(*) as release_blocker_duplicate_album_identities
from (
  select sender_id, media_group_id
  from public.messages
  where media_group_id is not null
  group by sender_id, media_group_id
  having count(*) > 1
) duplicate_album;

select count(*) as release_blocker_invalid_ready_album_compositions
from (
  select
    message_row.id,
    message_row.media_expected_count,
    count(attachment_row.id) filter (
      where attachment_row.lifecycle_status <> 'deleted'
    ) as item_count,
    count(distinct attachment_row.attachment_index) filter (
      where attachment_row.lifecycle_status <> 'deleted'
    ) as distinct_position_count,
    min(attachment_row.attachment_index) filter (
      where attachment_row.lifecycle_status <> 'deleted'
    ) as first_position,
    max(attachment_row.attachment_index) filter (
      where attachment_row.lifecycle_status <> 'deleted'
    ) as last_position,
    bool_and(
      attachment_row.media_group_id = message_row.media_group_id
      and attachment_row.sender_id = message_row.sender_id
      and attachment_row.receiver_id = message_row.receiver_id
    ) filter (where attachment_row.lifecycle_status <> 'deleted') as ownership_healthy
  from public.messages message_row
  left join public.message_attachments attachment_row
    on attachment_row.message_id = message_row.id
  where message_row.media_group_id is not null
    and message_row.attachment_state = 'ready'
    and not coalesce(message_row.deleted_for_all, false)
  group by message_row.id, message_row.media_expected_count
  having count(attachment_row.id) filter (
      where attachment_row.lifecycle_status <> 'deleted'
    ) <> message_row.media_expected_count
    or count(distinct attachment_row.attachment_index) filter (
      where attachment_row.lifecycle_status <> 'deleted'
    ) <> message_row.media_expected_count
    or min(attachment_row.attachment_index) filter (
      where attachment_row.lifecycle_status <> 'deleted'
    ) <> 0
    or max(attachment_row.attachment_index) filter (
      where attachment_row.lifecycle_status <> 'deleted'
    ) <> message_row.media_expected_count - 1
    or not coalesce(bool_and(
      attachment_row.media_group_id = message_row.media_group_id
      and attachment_row.sender_id = message_row.sender_id
      and attachment_row.receiver_id = message_row.receiver_id
    ) filter (where attachment_row.lifecycle_status <> 'deleted'), false)
) invalid_album;

select count(*) as release_blocker_cancelled_albums_resurrected
from public.chat_attachment_cancellations cancellation
join public.messages message_row
  on message_row.sender_id = cancellation.sender_id
 and message_row.client_message_id = cancellation.client_message_id
where message_row.attachment_state = 'ready'
  and not coalesce(message_row.deleted_for_all, false);

select count(*) as operational_stale_assembling_albums
from public.messages
where media_group_id is not null
  and attachment_state = 'assembling'
  and created_at < timezone('utc', now()) - interval '15 minutes';

select
  status,
  count(*) as cleanup_items
from public.chat_attachment_cleanup_queue
where bucket_id in ('chat-media', 'chat-attachment-staging-v1-2')
group by status
order by status;
