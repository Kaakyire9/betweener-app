-- Production hardening for durable chat attachments.
-- One transaction validates and publishes a complete attachment set. Replays
-- are idempotent; conflicting reuse of an idempotency key is rejected.

begin;

alter table public.message_attachments
  add column if not exists preview_bucket_id text,
  add column if not exists preview_storage_path text,
  add column if not exists preview_mime_type text,
  add column if not exists preview_byte_size bigint,
  add column if not exists preview_width integer,
  add column if not exists preview_height integer,
  add column if not exists state_version integer not null default 1;

alter table public.message_attachments
  drop constraint if exists message_attachments_preview_valid,
  add constraint message_attachments_preview_valid check (
    (
      preview_storage_path is null
      and preview_bucket_id is null
      and preview_mime_type is null
      and preview_byte_size is null
      and preview_width is null
      and preview_height is null
    )
    or (
      attachment_type in ('image', 'video')
      and preview_bucket_id = 'chat-media'
      and preview_mime_type = 'image/jpeg'
      and char_length(preview_storage_path) between 10 and 500
      and preview_byte_size between 1 and 1048576
      and preview_width between 1 and 2000
      and preview_height between 1 and 2000
    )
  ) not valid;

alter table public.messages
  add column if not exists attachment_state text not null default 'ready',
  add column if not exists attachment_set_hash text,
  add column if not exists attachment_state_version integer not null default 1;

alter table public.messages
  drop constraint if exists messages_attachment_state_valid,
  add constraint messages_attachment_state_valid check (
    attachment_state in ('assembling', 'ready', 'failed', 'cancelled', 'deleted')
  ) not valid;

create table if not exists public.chat_attachment_lifecycle_events (
  id bigint generated always as identity primary key,
  message_id uuid references public.messages(id) on delete cascade,
  attachment_id uuid references public.message_attachments(id) on delete cascade,
  client_message_id text not null,
  actor_user_id uuid,
  event_type text not null,
  from_state text,
  to_state text,
  state_version integer,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  constraint chat_attachment_event_type_valid check (
    event_type in (
      'batch_committed', 'idempotent_replay', 'state_transition',
      'cancel_requested', 'cleanup_scheduled', 'recovery_requested'
    )
  )
);

create index if not exists chat_attachment_lifecycle_message_idx
  on public.chat_attachment_lifecycle_events(message_id, created_at desc);
create index if not exists chat_attachment_lifecycle_client_idx
  on public.chat_attachment_lifecycle_events(client_message_id, created_at desc);

alter table public.chat_attachment_lifecycle_events enable row level security;
revoke all on table public.chat_attachment_lifecycle_events from public, anon, authenticated;
revoke all on table public.chat_attachment_lifecycle_events from service_role;
grant select, insert on table public.chat_attachment_lifecycle_events to service_role;

create table if not exists public.chat_attachment_cancellations (
  sender_id uuid not null,
  receiver_id uuid not null,
  client_message_id text not null,
  cancelled_at timestamptz not null default timezone('utc', now()),
  primary key (sender_id, client_message_id)
);

alter table public.chat_attachment_cancellations enable row level security;
revoke all on table public.chat_attachment_cancellations from public, anon, authenticated;
revoke all on table public.chat_attachment_cancellations from service_role;
grant select, insert on table public.chat_attachment_cancellations to service_role;

create or replace function public.enforce_chat_message_attachment_state_transition()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
declare
  v_allowed boolean := false;
begin
  if old.attachment_set_hash is not null
     and new.attachment_set_hash is distinct from old.attachment_set_hash then
    raise exception using
      errcode = '23514',
      message = 'immutable_attachment_set_hash';
  end if;

  if coalesce(new.deleted_for_all, false)
     and not coalesce(old.deleted_for_all, false)
     and old.attachment_state in ('ready', 'failed', 'cancelled') then
    new.attachment_state := 'deleted';
  end if;

  if new.attachment_state = old.attachment_state then
    return new;
  end if;

  v_allowed := case old.attachment_state
    when 'assembling' then new.attachment_state in ('ready', 'failed', 'cancelled')
    when 'ready' then new.attachment_state = 'deleted'
    when 'failed' then new.attachment_state in ('assembling', 'cancelled', 'deleted')
    when 'cancelled' then new.attachment_state = 'deleted'
    when 'deleted' then false
    else false
  end;

  if not v_allowed then
    raise exception using
      errcode = '23514',
      message = 'invalid_message_attachment_state_transition',
      detail = old.attachment_state || ' -> ' || new.attachment_state;
  end if;

  new.attachment_state_version := old.attachment_state_version + 1;
  return new;
end;
$$;

revoke all on function public.enforce_chat_message_attachment_state_transition()
  from public, anon, authenticated;

drop trigger if exists enforce_chat_message_attachment_state_transition
  on public.messages;
create trigger enforce_chat_message_attachment_state_transition
before update of attachment_state, attachment_set_hash, deleted_for_all on public.messages
for each row execute function public.enforce_chat_message_attachment_state_transition();

create or replace function public.enforce_chat_attachment_state_transition()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_allowed boolean := false;
begin
  if new.lifecycle_status = old.lifecycle_status then
    return new;
  end if;

  v_allowed := case old.lifecycle_status
    when 'pending' then new.lifecycle_status in ('ready', 'quarantined', 'failed', 'deleted')
    when 'ready' then new.lifecycle_status in ('quarantined', 'expired', 'deleted')
    when 'quarantined' then new.lifecycle_status in ('ready', 'failed', 'deleted')
    when 'failed' then new.lifecycle_status in ('pending', 'deleted')
    when 'expired' then new.lifecycle_status = 'deleted'
    when 'deleted' then false
    else false
  end;

  if not v_allowed then
    raise exception using
      errcode = '23514',
      message = 'invalid_attachment_state_transition',
      detail = old.lifecycle_status || ' -> ' || new.lifecycle_status;
  end if;

  new.state_version := old.state_version + 1;
  new.updated_at := timezone('utc', now());
  insert into public.chat_attachment_lifecycle_events (
    message_id, attachment_id, client_message_id, actor_user_id, event_type,
    from_state, to_state, state_version, details
  ) values (
    new.message_id, new.id, new.client_message_id, auth.uid(), 'state_transition',
    old.lifecycle_status, new.lifecycle_status, new.state_version,
    jsonb_build_object('source', 'database_transition_guard')
  );
  return new;
end;
$$;

revoke all on function public.enforce_chat_attachment_state_transition()
  from public, anon, authenticated;

drop trigger if exists enforce_chat_attachment_state_transition
  on public.message_attachments;
create trigger enforce_chat_attachment_state_transition
before update of lifecycle_status on public.message_attachments
for each row execute function public.enforce_chat_attachment_state_transition();

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

  perform pg_advisory_xact_lock(hashtextextended(p_sender_id::text || ':' || p_client_message_id, 0));

  insert into public.chat_attachment_cancellations (
    sender_id, receiver_id, client_message_id
  ) values (
    p_sender_id, p_receiver_id, p_client_message_id
  )
  on conflict (sender_id, client_message_id) do nothing;

  for v_item in select value from jsonb_array_elements(p_attachments)
  loop
    v_expected_prefix := p_sender_id::text || '/' || p_receiver_id::text || '/'
      || p_client_message_id || '/' || (v_item->>'attachmentId') || '-';
    if coalesce(v_item->>'bucketId', '') not in ('chat-media', 'voice-messages')
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
      null, v_item->>'bucketId', v_item->>'storagePath', 'orphaned',
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
        null, 'chat-media', v_item->>'previewStoragePath', 'orphaned',
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
    'cancelled', jsonb_build_object('receiverId', p_receiver_id)
  );

  return true;
end;
$$;

revoke all on function public.rpc_cancel_chat_attachment_batch(uuid, uuid, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.rpc_cancel_chat_attachment_batch(uuid, uuid, text, jsonb)
  to service_role;

create or replace function public.rpc_finalize_chat_attachment_batch(
  p_sender_id uuid,
  p_receiver_id uuid,
  p_client_message_id text,
  p_attachment_type text,
  p_expected_count smallint,
  p_attachments jsonb,
  p_caption text default '',
  p_reply_to_message_id uuid default null
)
returns setof public.messages
language plpgsql
security definer
set search_path = public, storage, pg_catalog
as $$
declare
  v_message public.messages%rowtype;
  v_item jsonb;
  v_index integer;
  v_count integer;
  v_object_metadata jsonb;
  v_preview_metadata jsonb;
  v_object_size bigint;
  v_preview_size bigint;
  v_type_limit bigint;
  v_expected_path_prefix text;
  v_set_hash text;
  v_media_items jsonb := '[]'::jsonb;
  v_text text := left(coalesce(p_caption, ''), 16384);
begin
  if auth.role() <> 'service_role' then
    raise exception using errcode = '42501', message = 'service_role_required';
  end if;
  if p_sender_id is null or p_receiver_id is null or p_sender_id = p_receiver_id then
    raise exception using errcode = '22023', message = 'invalid_chat_participants';
  end if;
  if not public.can_users_chat(p_sender_id, p_receiver_id) then
    raise exception using errcode = '42501', message = 'messaging_unavailable';
  end if;
  if nullif(btrim(coalesce(p_client_message_id, '')), '') is null
     or char_length(p_client_message_id) > 160
     or p_client_message_id !~ '^[A-Za-z0-9._-]+$' then
    raise exception using errcode = '22023', message = 'invalid_client_message_id';
  end if;
  if p_attachment_type not in ('image', 'video', 'document', 'audio')
     or p_expected_count not between 1 and 10
     or jsonb_typeof(p_attachments) <> 'array'
     or jsonb_array_length(p_attachments) <> p_expected_count then
    raise exception using errcode = '22023', message = 'invalid_attachment_batch';
  end if;
  if p_expected_count > 1 and p_attachment_type <> 'image' then
    raise exception using errcode = '22023', message = 'album_images_only';
  end if;

  -- Serializes duplicate finalizers without blocking unrelated messages.
  perform pg_advisory_xact_lock(hashtextextended(p_sender_id::text || ':' || p_client_message_id, 0));

  if exists (
    select 1
    from public.chat_attachment_cancellations cancellation
    where cancellation.sender_id = p_sender_id
      and cancellation.client_message_id = p_client_message_id
  ) then
    raise exception using errcode = '22023', message = 'attachment_batch_cancelled';
  end if;

  select md5(
    jsonb_agg(
      jsonb_build_object(
        'id', item->>'attachmentId',
        'index', (item->>'attachmentIndex')::integer,
        'bucket', item->>'bucketId',
        'path', item->>'storagePath',
        'mime', lower(item->>'mimeType'),
        'size', item->>'byteSize',
        'width', item->>'width',
        'height', item->>'height',
        'durationMs', item->>'durationMs',
        'sha256', lower(item->>'sha256'),
        'preview', item->>'previewStoragePath',
        'previewSize', item->>'previewByteSize',
        'previewWidth', item->>'previewWidth',
        'previewHeight', item->>'previewHeight',
        'waveform', item->'waveform'
      )
      order by (item->>'attachmentIndex')::integer
    )::text
  )
  into v_set_hash
  from jsonb_array_elements(p_attachments) item;

  select message_row.*
  into v_message
  from public.messages message_row
  where message_row.sender_id = p_sender_id
    and message_row.client_message_id = p_client_message_id
  for update;

  if v_message.id is not null then
    if v_message.receiver_id <> p_receiver_id
       or v_message.message_type <> (
         case when p_attachment_type = 'audio' then 'voice' else p_attachment_type end
       )
       or v_message.attachment_set_hash is distinct from v_set_hash
       or v_message.attachment_state <> 'ready'
       or coalesce(v_message.deleted_for_all, false) then
      raise exception using errcode = '22023', message = 'attachment_idempotency_conflict';
    end if;
    insert into public.chat_attachment_lifecycle_events (
      message_id, client_message_id, actor_user_id, event_type, from_state, to_state,
      details
    ) values (
      v_message.id, p_client_message_id, p_sender_id, 'idempotent_replay',
      'ready', 'ready', jsonb_build_object('attachmentSetHash', v_set_hash)
    );
    return next v_message;
    return;
  end if;

  v_count := 0;
  for v_item in select value from jsonb_array_elements(p_attachments)
  loop
    v_index := (v_item->>'attachmentIndex')::integer;
    if v_index <> v_count
       or (v_item->>'attachmentType') <> p_attachment_type
       or (v_item->>'bucketId') <> (
         case when p_attachment_type = 'audio' then 'voice-messages' else 'chat-media' end
       )
       or (v_item->>'attachmentId') is null
       or (v_item->>'storagePath') is null then
      raise exception using errcode = '22023', message = 'invalid_attachment_batch_item';
    end if;

    v_expected_path_prefix := p_sender_id::text || '/' || p_receiver_id::text || '/'
      || p_client_message_id || '/' || (v_item->>'attachmentId') || '-';
    if strpos(v_item->>'storagePath', v_expected_path_prefix) <> 1 then
      raise exception using errcode = '22023', message = 'invalid_attachment_storage_path';
    end if;

    select object_row.metadata into v_object_metadata
    from storage.objects object_row
    where object_row.bucket_id = v_item->>'bucketId'
      and object_row.name = v_item->>'storagePath'
    limit 1;
    if v_object_metadata is null then
      raise exception using errcode = '22023', message = 'attachment_object_not_found';
    end if;
    v_object_size := case
      when coalesce(v_object_metadata->>'size', '') ~ '^[0-9]+$'
        then (v_object_metadata->>'size')::bigint
      else null
    end;
    v_type_limit := case p_attachment_type
      when 'image' then 15728640
      when 'video' then 94371840
      when 'document' then 52428800
      when 'audio' then 26214400
    end;
    if v_object_size is null or v_object_size <= 0 or v_object_size > v_type_limit then
      raise exception using errcode = '22023', message = 'attachment_size_invalid';
    end if;

    if p_attachment_type in ('image', 'video') then
      if nullif(v_item->>'previewStoragePath', '') is null
         or strpos(v_item->>'previewStoragePath', v_expected_path_prefix) <> 1
         or lower(coalesce(v_item->>'previewMimeType', '')) <> 'image/jpeg' then
        raise exception using errcode = '22023', message = 'attachment_preview_required';
      end if;
      select object_row.metadata into v_preview_metadata
      from storage.objects object_row
      where object_row.bucket_id = 'chat-media'
        and object_row.name = v_item->>'previewStoragePath'
      limit 1;
      v_preview_size := case
        when coalesce(v_preview_metadata->>'size', '') ~ '^[0-9]+$'
          then (v_preview_metadata->>'size')::bigint
        else null
      end;
      if v_preview_size is null or v_preview_size <= 0 or v_preview_size > 1048576 then
        raise exception using errcode = '22023', message = 'attachment_preview_invalid';
      end if;
    end if;
    v_count := v_count + 1;
  end loop;

  if p_attachment_type = 'document' and nullif(btrim(v_text), '') is null then
    v_text := 'Attachment';
  end if;

  insert into public.messages (
    text, client_message_id, sender_id, receiver_id, is_read, message_type,
    reply_to_message_id, storage_path, media_expected_count, media_items,
    attachment_state, attachment_set_hash, audio_path, audio_duration,
    audio_waveform
  ) values (
    v_text, p_client_message_id, p_sender_id, p_receiver_id, false,
    case when p_attachment_type = 'audio' then 'voice' else p_attachment_type end,
    p_reply_to_message_id,
    case when p_attachment_type = 'audio' then null else p_attachments->0->>'storagePath' end,
    p_expected_count, '[]'::jsonb, 'assembling', v_set_hash,
    case when p_attachment_type = 'audio' then p_attachments->0->>'storagePath' end,
    case when p_attachment_type = 'audio'
      then coalesce(nullif(p_attachments->0->>'durationMs', '')::integer, 0)::double precision / 1000
    end,
    case when p_attachment_type = 'audio'
      then coalesce(p_attachments->0->'waveform', '[]'::jsonb)
    end
  )
  returning * into v_message;

  for v_item in select value from jsonb_array_elements(p_attachments)
  loop
    v_index := (v_item->>'attachmentIndex')::integer;
    insert into public.message_attachments (
      id, message_id, client_message_id, attachment_index, sender_id, receiver_id,
      bucket_id, storage_path, attachment_type, original_name, mime_type,
      byte_size, width, height, duration_ms, sha256, lifecycle_status,
      validation_status, validation_details, is_view_once, ready_at,
      preview_bucket_id, preview_storage_path, preview_mime_type,
      preview_byte_size, preview_width, preview_height
    ) values (
      (v_item->>'attachmentId')::uuid, v_message.id, p_client_message_id, v_index,
      p_sender_id, p_receiver_id, v_item->>'bucketId', v_item->>'storagePath',
      p_attachment_type, nullif(left(btrim(coalesce(v_item->>'originalName', '')), 180), ''),
      lower(v_item->>'mimeType'), (v_item->>'byteSize')::bigint,
      nullif(v_item->>'width', '')::integer, nullif(v_item->>'height', '')::integer,
      nullif(v_item->>'durationMs', '')::integer, nullif(lower(v_item->>'sha256'), ''),
      'ready', 'clean', coalesce(v_item->'validationDetails', '{}'::jsonb), false,
      timezone('utc', now()),
      case when nullif(v_item->>'previewStoragePath', '') is not null then 'chat-media' end,
      nullif(v_item->>'previewStoragePath', ''), nullif(v_item->>'previewMimeType', ''),
      nullif(v_item->>'previewByteSize', '')::bigint,
      nullif(v_item->>'previewWidth', '')::integer,
      nullif(v_item->>'previewHeight', '')::integer
    );
  end loop;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'attachmentId', attachment_row.id,
      'index', attachment_row.attachment_index,
      'type', attachment_row.attachment_type,
      'storagePath', attachment_row.storage_path,
      'mimeType', attachment_row.mime_type,
      'width', attachment_row.width,
      'height', attachment_row.height,
      'byteSize', attachment_row.byte_size,
      'previewStoragePath', attachment_row.preview_storage_path
    ) order by attachment_row.attachment_index
  ), '[]'::jsonb)
  into v_media_items
  from public.message_attachments attachment_row
  where attachment_row.message_id = v_message.id;

  update public.messages
  set media_items = case when p_attachment_type = 'audio' then '[]'::jsonb else v_media_items end,
      attachment_state = 'ready'
  where id = v_message.id
  returning * into v_message;

  insert into public.chat_attachment_lifecycle_events (
    message_id, client_message_id, actor_user_id, event_type, from_state, to_state,
    details
  ) values (
    v_message.id, p_client_message_id, p_sender_id, 'batch_committed',
    'assembling', 'ready',
    jsonb_build_object(
      'attachmentSetHash', v_set_hash,
      'expectedCount', p_expected_count,
      'committedCount', v_count
    )
  );

  return next v_message;
end;
$$;

revoke all on function public.rpc_finalize_chat_attachment_batch(
  uuid, uuid, text, text, smallint, jsonb, text, uuid
) from public, anon, authenticated;
grant execute on function public.rpc_finalize_chat_attachment_batch(
  uuid, uuid, text, text, smallint, jsonb, text, uuid
) to service_role;

create or replace function public.refresh_chat_message_media_items(p_message_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_items jsonb;
begin
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'attachmentId', attachment_row.id,
        'index', attachment_row.attachment_index,
        'type', attachment_row.attachment_type,
        'storagePath', attachment_row.storage_path,
        'mimeType', attachment_row.mime_type,
        'width', attachment_row.width,
        'height', attachment_row.height,
        'byteSize', attachment_row.byte_size,
        'previewStoragePath', attachment_row.preview_storage_path
      ) order by attachment_row.attachment_index
    ),
    '[]'::jsonb
  )
  into v_items
  from public.message_attachments attachment_row
  where attachment_row.message_id = p_message_id
    and attachment_row.attachment_type in ('image', 'video')
    and not attachment_row.is_view_once
    and attachment_row.lifecycle_status = 'ready';

  update public.messages message_row
  set media_items = v_items
  where message_row.id = p_message_id
    and message_row.media_items is distinct from v_items;
end;
$$;

-- Preview objects follow the same deletion lifecycle as originals.
create or replace function public.schedule_chat_attachment_preview_cleanup()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if new.preview_storage_path is not null
     and new.lifecycle_status in ('deleted', 'expired')
     and new.lifecycle_status is distinct from old.lifecycle_status then
    insert into public.chat_attachment_cleanup_queue (
      attachment_id, bucket_id, storage_path, reason, delete_after
    ) values (
      new.id, 'chat-media', new.preview_storage_path,
      case when new.lifecycle_status = 'expired' then 'expired' else 'message_deleted' end,
      timezone('utc', now())
    )
    on conflict (bucket_id, storage_path) do update set
      status = 'scheduled',
      delete_after = excluded.delete_after,
      processing_started_at = null,
      last_error = null,
      updated_at = timezone('utc', now());
  end if;
  return new;
end;
$$;

revoke all on function public.schedule_chat_attachment_preview_cleanup()
  from public, anon, authenticated;

drop trigger if exists schedule_chat_attachment_preview_cleanup
  on public.message_attachments;
create trigger schedule_chat_attachment_preview_cleanup
after update of lifecycle_status on public.message_attachments
for each row execute function public.schedule_chat_attachment_preview_cleanup();

alter table public.message_attachments validate constraint message_attachments_preview_valid;
alter table public.messages validate constraint messages_attachment_state_valid;

comment on column public.messages.attachment_set_hash is
  'Immutable fingerprint proving idempotent attachment-set finalisation.';
comment on table public.chat_attachment_lifecycle_events is
  'Service-only append-only evidence for attachment publication, replay, cancellation, recovery, and cleanup.';

commit;
