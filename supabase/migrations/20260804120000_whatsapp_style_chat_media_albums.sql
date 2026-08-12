-- Prompt 4: stable mixed-media album identity and atomic publication.

alter table public.messages
  add column if not exists media_group_id uuid,
  add column if not exists media_caption text;

alter table public.message_attachments
  add column if not exists media_group_id uuid;

create unique index if not exists messages_sender_media_group_unique
  on public.messages(sender_id, media_group_id)
  where media_group_id is not null;

create unique index if not exists message_attachments_media_group_position_unique
  on public.message_attachments(media_group_id, attachment_index)
  where media_group_id is not null;

create index if not exists message_attachments_media_group_lookup
  on public.message_attachments(media_group_id, message_id);

create or replace function public.enforce_chat_media_album_attachment_identity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_group_id uuid;
  v_expected_count smallint;
begin
  if new.media_group_id is null then return new; end if;
  select message_row.media_group_id, message_row.media_expected_count
  into v_group_id, v_expected_count
  from public.messages message_row
  where message_row.id = new.message_id;
  if v_group_id is distinct from new.media_group_id
     or v_expected_count is null
     or new.attachment_index < 0
     or new.attachment_index >= v_expected_count then
    raise exception using errcode = '23514', message = 'chat_media_album_attachment_identity_invalid';
  end if;
  return new;
end;
$$;

drop trigger if exists message_attachments_enforce_album_identity on public.message_attachments;
create trigger message_attachments_enforce_album_identity
before insert or update of message_id, media_group_id, attachment_index
on public.message_attachments
for each row execute function public.enforce_chat_media_album_attachment_identity();

revoke all on function public.enforce_chat_media_album_attachment_identity()
  from public, anon, authenticated;

alter table public.messages
  drop constraint if exists messages_media_caption_length;
alter table public.messages
  add constraint messages_media_caption_length
  check (media_caption is null or char_length(media_caption) <= 4096) not valid;
alter table public.messages validate constraint messages_media_caption_length;

create table if not exists public.chat_media_album_item_cancellations (
  sender_id uuid not null,
  receiver_id uuid not null,
  client_message_id text not null,
  attachment_id uuid not null,
  cancelled_at timestamptz not null default timezone('utc', now()),
  primary key (sender_id, client_message_id, attachment_id)
);

alter table public.chat_media_album_item_cancellations enable row level security;
revoke all on table public.chat_media_album_item_cancellations from public, anon, authenticated;
grant select, insert on table public.chat_media_album_item_cancellations to service_role;

create or replace function public.rpc_cancel_chat_media_album_item(
  p_sender_id uuid,
  p_receiver_id uuid,
  p_client_message_id text,
  p_attachment_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception using errcode = '42501', message = 'service_role_required';
  end if;
  if p_sender_id is null or p_receiver_id is null or p_attachment_id is null
     or nullif(btrim(coalesce(p_client_message_id, '')), '') is null then
    raise exception using errcode = '22023', message = 'invalid_album_item_cancellation';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_sender_id::text || ':' || p_client_message_id, 0));
  if exists (
    select 1 from public.chat_attachment_finalization_keys key_row
    where key_row.sender_id = p_sender_id
      and key_row.client_message_id = p_client_message_id
  ) then
    raise exception using errcode = '23505', message = 'attachment_composition_locked';
  end if;

  insert into public.chat_media_album_item_cancellations (
    sender_id, receiver_id, client_message_id, attachment_id
  ) values (
    p_sender_id, p_receiver_id, p_client_message_id, p_attachment_id
  )
  on conflict (sender_id, client_message_id, attachment_id) do nothing;

  return jsonb_build_object('cancelled', true, 'attachmentId', p_attachment_id);
end;
$$;

revoke all on function public.rpc_cancel_chat_media_album_item(uuid, uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.rpc_cancel_chat_media_album_item(uuid, uuid, text, uuid)
  to service_role;

create or replace function public.rpc_finalize_chat_media_album_v4(
  p_sender_id uuid,
  p_receiver_id uuid,
  p_client_message_id text,
  p_media_group_id uuid,
  p_expected_count smallint,
  p_attachments jsonb,
  p_caption text,
  p_reply_to_message_id uuid,
  p_request_payload jsonb
)
returns setof public.messages
language plpgsql
security definer
set search_path = public, storage, pg_catalog
as $$
declare
  v_message public.messages%rowtype;
  v_item jsonb;
  v_index integer := 0;
  v_kind text;
  v_metadata jsonb;
  v_preview_metadata jsonb;
  v_object_size bigint;
  v_preview_size bigint;
  v_limit bigint;
  v_prefix text;
  v_set_hash text;
  v_media_items jsonb := '[]'::jsonb;
  v_caption text := left(coalesce(p_caption, ''), 4096);
begin
  if auth.role() <> 'service_role' then
    raise exception using errcode = '42501', message = 'service_role_required';
  end if;
  if p_sender_id is null or p_receiver_id is null or p_sender_id = p_receiver_id
     or p_media_group_id is null then
    raise exception using errcode = '22023', message = 'invalid_album_identity';
  end if;
  if not public.can_users_chat(p_sender_id, p_receiver_id) then
    raise exception using errcode = '42501', message = 'messaging_unavailable';
  end if;
  if nullif(btrim(coalesce(p_client_message_id, '')), '') is null
     or char_length(p_client_message_id) > 160
     or p_client_message_id !~ '^[A-Za-z0-9._-]+$' then
    raise exception using errcode = '22023', message = 'invalid_client_message_id';
  end if;
  if p_expected_count not between 2 and 10
     or jsonb_typeof(p_attachments) <> 'array'
     or jsonb_array_length(p_attachments) <> p_expected_count then
    raise exception using errcode = '22023', message = 'invalid_media_album';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_sender_id::text || ':' || p_client_message_id, 0));
  perform public.rpc_claim_chat_attachment_finalization(
    p_sender_id, p_client_message_id, p_request_payload
  );

  if exists (
    select 1 from public.chat_attachment_cancellations cancellation
    where cancellation.sender_id = p_sender_id
      and cancellation.client_message_id = p_client_message_id
  ) then
    raise exception using errcode = '22023', message = 'attachment_batch_cancelled';
  end if;
  if exists (
    select 1
    from public.chat_media_album_item_cancellations cancellation
    join jsonb_array_elements(p_attachments) item
      on item->>'attachmentId' = cancellation.attachment_id::text
    where cancellation.sender_id = p_sender_id
      and cancellation.client_message_id = p_client_message_id
  ) then
    raise exception using errcode = '22023', message = 'attachment_album_item_cancelled';
  end if;

  select md5(jsonb_agg(jsonb_build_object(
    'id', item->>'attachmentId',
    'index', (item->>'attachmentIndex')::integer,
    'type', item->>'attachmentType',
    'bucket', item->>'bucketId',
    'path', item->>'storagePath',
    'mime', lower(item->>'mimeType'),
    'size', item->>'byteSize',
    'preview', item->>'previewStoragePath'
  ) order by (item->>'attachmentIndex')::integer)::text)
  into v_set_hash
  from jsonb_array_elements(p_attachments) item;

  select row_value.* into v_message
  from public.messages row_value
  where row_value.sender_id = p_sender_id
    and (row_value.client_message_id = p_client_message_id
      or row_value.media_group_id = p_media_group_id)
  order by (row_value.client_message_id = p_client_message_id) desc
  limit 1
  for update;

  if v_message.id is not null then
    if v_message.receiver_id <> p_receiver_id
       or v_message.media_group_id <> p_media_group_id
       or v_message.attachment_set_hash is distinct from v_set_hash
       or v_message.attachment_state <> 'ready'
       or coalesce(v_message.deleted_for_all, false) then
      raise exception using errcode = '22023', message = 'attachment_idempotency_conflict';
    end if;
    update public.chat_attachment_finalization_keys
    set status = 'completed', canonical_message_id = v_message.id,
        completed_at = coalesce(completed_at, timezone('utc', now()))
    where sender_id = p_sender_id and client_message_id = p_client_message_id
      and (canonical_message_id is null or canonical_message_id = v_message.id);
    return next v_message;
    return;
  end if;

  v_index := 0;
  for v_item in select value from jsonb_array_elements(p_attachments)
  loop
    v_kind := v_item->>'attachmentType';
    if (v_item->>'attachmentIndex')::integer <> v_index
       or v_kind not in ('image', 'video')
       or v_item->>'bucketId' <> 'chat-media'
       or nullif(v_item->>'attachmentId', '') is null
       or nullif(v_item->>'storagePath', '') is null then
      raise exception using errcode = '22023', message = 'invalid_media_album_item';
    end if;
    v_prefix := p_sender_id::text || '/' || p_receiver_id::text || '/'
      || p_client_message_id || '/' || (v_item->>'attachmentId') || '-';
    if strpos(v_item->>'storagePath', v_prefix) <> 1
       or strpos(coalesce(v_item->>'previewStoragePath', ''), v_prefix) <> 1
       or lower(coalesce(v_item->>'previewMimeType', '')) <> 'image/jpeg' then
      raise exception using errcode = '22023', message = 'invalid_media_album_path';
    end if;

    select object_row.metadata into v_metadata
    from storage.objects object_row
    where object_row.bucket_id = 'chat-media'
      and object_row.name = v_item->>'storagePath'
    limit 1;
    v_object_size := case when coalesce(v_metadata->>'size', '') ~ '^[0-9]+$'
      then (v_metadata->>'size')::bigint end;
    v_limit := case v_kind when 'image' then 15728640 else 94371840 end;
    if v_object_size is null or v_object_size <= 0 or v_object_size > v_limit then
      raise exception using errcode = '22023', message = 'attachment_size_invalid';
    end if;

    select object_row.metadata into v_preview_metadata
    from storage.objects object_row
    where object_row.bucket_id = 'chat-media'
      and object_row.name = v_item->>'previewStoragePath'
    limit 1;
    v_preview_size := case when coalesce(v_preview_metadata->>'size', '') ~ '^[0-9]+$'
      then (v_preview_metadata->>'size')::bigint end;
    if v_preview_size is null or v_preview_size <= 0 or v_preview_size > 1048576 then
      raise exception using errcode = '22023', message = 'attachment_preview_invalid';
    end if;
    v_index := v_index + 1;
  end loop;

  insert into public.messages (
    text, client_message_id, sender_id, receiver_id, is_read, message_type,
    reply_to_message_id, storage_path, media_expected_count, media_items,
    attachment_state, attachment_set_hash, media_group_id, media_caption
  ) values (
    v_caption, p_client_message_id, p_sender_id, p_receiver_id, false, 'image',
    p_reply_to_message_id, p_attachments->0->>'storagePath', p_expected_count,
    '[]'::jsonb, 'assembling', v_set_hash, p_media_group_id, nullif(v_caption, '')
  ) returning * into v_message;

  for v_item in select value from jsonb_array_elements(p_attachments)
  loop
    v_kind := v_item->>'attachmentType';
    insert into public.message_attachments (
      id, message_id, client_message_id, attachment_index, sender_id, receiver_id,
      bucket_id, storage_path, attachment_type, original_name, mime_type,
      byte_size, width, height, duration_ms, sha256, lifecycle_status,
      validation_status, validation_details, is_view_once, ready_at,
      preview_bucket_id, preview_storage_path, preview_mime_type,
      preview_byte_size, preview_width, preview_height, media_group_id
    ) values (
      (v_item->>'attachmentId')::uuid, v_message.id, p_client_message_id,
      (v_item->>'attachmentIndex')::integer, p_sender_id, p_receiver_id,
      'chat-media', v_item->>'storagePath', v_kind,
      nullif(left(btrim(coalesce(v_item->>'originalName', '')), 180), ''),
      lower(v_item->>'mimeType'), (v_item->>'byteSize')::bigint,
      nullif(v_item->>'width', '')::integer, nullif(v_item->>'height', '')::integer,
      nullif(v_item->>'durationMs', '')::integer, nullif(lower(v_item->>'sha256'), ''),
      'ready', 'clean', coalesce(v_item->'validationDetails', '{}'::jsonb), false,
      timezone('utc', now()), 'chat-media', v_item->>'previewStoragePath',
      'image/jpeg', nullif(v_item->>'previewByteSize', '')::bigint,
      nullif(v_item->>'previewWidth', '')::integer,
      nullif(v_item->>'previewHeight', '')::integer, p_media_group_id
    );
  end loop;

  select coalesce(jsonb_agg(jsonb_build_object(
    'attachmentId', attachment_row.id,
    'index', attachment_row.attachment_index,
    'type', attachment_row.attachment_type,
    'storagePath', attachment_row.storage_path,
    'mimeType', attachment_row.mime_type,
    'width', attachment_row.width,
    'height', attachment_row.height,
    'byteSize', attachment_row.byte_size,
    'durationMs', attachment_row.duration_ms,
    'previewStoragePath', attachment_row.preview_storage_path
  ) order by attachment_row.attachment_index), '[]'::jsonb)
  into v_media_items
  from public.message_attachments attachment_row
  where attachment_row.message_id = v_message.id
    and attachment_row.media_group_id = p_media_group_id;

  update public.messages
  set media_items = v_media_items, attachment_state = 'ready'
  where id = v_message.id
  returning * into v_message;

  update public.chat_attachment_finalization_keys
  set status = 'completed', canonical_message_id = v_message.id,
      completed_at = coalesce(completed_at, timezone('utc', now()))
  where sender_id = p_sender_id and client_message_id = p_client_message_id
    and (canonical_message_id is null or canonical_message_id = v_message.id);
  if not found then
    raise exception using errcode = '22023', message = 'attachment_canonical_result_conflict';
  end if;

  insert into public.chat_attachment_lifecycle_events (
    message_id, client_message_id, actor_user_id, event_type, from_state, to_state, details
  ) values (
    v_message.id, p_client_message_id, p_sender_id, 'album_committed', 'assembling', 'ready',
    jsonb_build_object('mediaGroupId', p_media_group_id, 'expectedCount', p_expected_count,
      'attachmentSetHash', v_set_hash)
  );

  return next v_message;
end;
$$;

revoke all on function public.rpc_finalize_chat_media_album_v4(
  uuid, uuid, text, uuid, smallint, jsonb, text, uuid, jsonb
) from public, anon, authenticated;
grant execute on function public.rpc_finalize_chat_media_album_v4(
  uuid, uuid, text, uuid, smallint, jsonb, text, uuid, jsonb
) to service_role;

comment on function public.rpc_finalize_chat_media_album_v4(
  uuid, uuid, text, uuid, smallint, jsonb, text, uuid, jsonb
) is 'Atomically publishes one immutable ordered image/video album. Captions are album-scoped.';
