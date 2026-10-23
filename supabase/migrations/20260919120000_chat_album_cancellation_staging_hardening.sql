-- Prompt 4 production hardening.
-- Backward-compatible expansion: allow the existing cancellation contract to
-- tombstone v1.2 image uploads while they are still in the private moderation
-- staging bucket. Existing chat-media and voice-message callers are unchanged.

begin;

create or replace function public.rpc_cancel_chat_attachment_batch(
  p_sender_id uuid,
  p_receiver_id uuid,
  p_client_message_id text,
  p_attachments jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_message public.messages%rowtype;
  v_item jsonb;
  v_expected_prefix text;
  v_bucket_id text;
begin
  if auth.role() <> 'service_role' then
    raise exception using errcode = '42501', message = 'service_role_required';
  end if;
  if p_sender_id is null or p_receiver_id is null
     or nullif(btrim(coalesce(p_client_message_id, '')), '') is null
     or char_length(p_client_message_id) > 160
     or p_client_message_id !~ '^[A-Za-z0-9._-]+$'
     or jsonb_typeof(p_attachments) <> 'array'
     or jsonb_array_length(p_attachments) not between 1 and 10 then
    raise exception using errcode = '22023', message = 'invalid_attachment_cancellation';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_sender_id::text || ':' || p_client_message_id, 0)
  );

  insert into public.chat_attachment_cancellations (
    sender_id, receiver_id, client_message_id
  ) values (
    p_sender_id, p_receiver_id, p_client_message_id
  )
  on conflict (sender_id, client_message_id) do nothing;

  for v_item in select value from jsonb_array_elements(p_attachments)
  loop
    v_bucket_id := coalesce(v_item->>'bucketId', '');
    v_expected_prefix := p_sender_id::text || '/' || p_receiver_id::text || '/'
      || p_client_message_id || '/' || (v_item->>'attachmentId') || '-';
    if v_bucket_id not in (
         'chat-media', 'voice-messages', 'chat-attachment-staging-v1-2'
       )
       or strpos(coalesce(v_item->>'storagePath', ''), v_expected_prefix) <> 1
       or (
         nullif(v_item->>'previewStoragePath', '') is not null
         and strpos(v_item->>'previewStoragePath', v_expected_prefix) <> 1
       ) then
      raise exception using errcode = '22023', message = 'invalid_attachment_cancellation_path';
    end if;

    insert into public.chat_attachment_cleanup_queue (
      attachment_id, bucket_id, storage_path, reason, delete_after
    ) values (
      null, v_bucket_id, v_item->>'storagePath', 'orphaned',
      timezone('utc', now())
    )
    on conflict (bucket_id, storage_path) do update set
      status = 'scheduled',
      delete_after = excluded.delete_after,
      processing_started_at = null,
      last_error = null,
      updated_at = timezone('utc', now());

    if nullif(v_item->>'previewStoragePath', '') is not null then
      insert into public.chat_attachment_cleanup_queue (
        attachment_id, bucket_id, storage_path, reason, delete_after
      ) values (
        null,
        case
          when v_bucket_id = 'chat-attachment-staging-v1-2'
            then 'chat-attachment-staging-v1-2'
          else 'chat-media'
        end,
        v_item->>'previewStoragePath',
        'orphaned',
        timezone('utc', now())
      )
      on conflict (bucket_id, storage_path) do update set
        status = 'scheduled',
        delete_after = excluded.delete_after,
        processing_started_at = null,
        last_error = null,
        updated_at = timezone('utc', now());
    end if;
  end loop;

  select message_row.*
  into v_message
  from public.messages message_row
  where message_row.sender_id = p_sender_id
    and message_row.client_message_id = p_client_message_id
  for update;

  if v_message.id is not null then
    if v_message.receiver_id <> p_receiver_id then
      raise exception using errcode = '22023', message = 'attachment_cancellation_conflict';
    end if;

    if not coalesce(v_message.deleted_for_all, false) then
      update public.messages
      set deleted_for_all = true,
          deleted_at = timezone('utc', now()),
          deleted_by = p_sender_id,
          text = '',
          storage_path = null,
          audio_path = null,
          encrypted_media_path = null,
          encrypted_key_sender = null,
          encrypted_key_receiver = null,
          encrypted_key_nonce = null,
          encrypted_media_nonce = null
      where id = v_message.id;

      update public.message_attachments attachment_row
      set lifecycle_status = 'deleted',
          deleted_at = timezone('utc', now()),
          expires_at = timezone('utc', now())
      where attachment_row.message_id = v_message.id
        and attachment_row.lifecycle_status <> 'deleted';
    end if;
  end if;

  insert into public.chat_attachment_lifecycle_events (
    message_id, client_message_id, actor_user_id, event_type, from_state, to_state,
    details
  ) values (
    v_message.id, p_client_message_id, p_sender_id, 'cancel_requested',
    case when v_message.id is null then null else v_message.attachment_state end,
    'cancelled', jsonb_build_object(
      'receiverId', p_receiver_id,
      'supportsStagingBucket', true
    )
  );

  return true;
end;
$$;

revoke all on function public.rpc_cancel_chat_attachment_batch(uuid, uuid, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.rpc_cancel_chat_attachment_batch(uuid, uuid, text, jsonb)
  to service_role;

comment on function public.rpc_cancel_chat_attachment_batch(uuid, uuid, text, jsonb) is
  'Atomically tombstones an attachment send and schedules private source cleanup, including v1.2 moderation staging objects.';

commit;
