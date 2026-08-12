-- Durable chat media albums. One logical message owns up to ten indexed image
-- attachments, preserving a single unread/reaction/reply/delete lifecycle.

alter table public.messages
  add column if not exists media_items jsonb not null default '[]'::jsonb,
  add column if not exists media_expected_count smallint;

alter table public.messages
  drop constraint if exists messages_media_items_valid,
  add constraint messages_media_items_valid check (
    jsonb_typeof(media_items) = 'array'
    and jsonb_array_length(media_items) <= 10
  ) not valid;

alter table public.messages
  drop constraint if exists messages_media_expected_count_valid,
  add constraint messages_media_expected_count_valid check (
    media_expected_count is null or media_expected_count between 1 and 10
  ) not valid;

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
        'byteSize', attachment_row.byte_size
      ) order by attachment_row.attachment_index
    ),
    '[]'::jsonb
  )
  into v_items
  from public.message_attachments attachment_row
  where attachment_row.message_id = p_message_id
    and attachment_row.attachment_type = 'image'
    and not attachment_row.is_view_once
    and attachment_row.lifecycle_status = 'ready';

  update public.messages message_row
  set media_items = v_items
  where message_row.id = p_message_id
    and message_row.media_items is distinct from v_items;
end;
$$;

revoke all on function public.refresh_chat_message_media_items(uuid) from public, anon, authenticated;
grant execute on function public.refresh_chat_message_media_items(uuid) to service_role;

create or replace function public.sync_chat_message_media_items()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if tg_op = 'DELETE' then
    perform public.refresh_chat_message_media_items(old.message_id);
    return old;
  end if;
  perform public.refresh_chat_message_media_items(new.message_id);
  return new;
end;
$$;

drop trigger if exists message_attachments_sync_media_items on public.message_attachments;
create trigger message_attachments_sync_media_items
after insert or update or delete
on public.message_attachments
for each row execute function public.sync_chat_message_media_items();

create or replace function public.rpc_append_chat_album_attachment(
  p_sender_id uuid,
  p_receiver_id uuid,
  p_client_message_id text,
  p_attachment_id uuid,
  p_attachment_index smallint,
  p_expected_count smallint,
  p_bucket_id text,
  p_storage_path text,
  p_original_name text,
  p_mime_type text,
  p_byte_size bigint default null,
  p_width integer default null,
  p_height integer default null,
  p_sha256 text default null,
  p_validation_details jsonb default '{}'::jsonb
)
returns setof public.messages
language plpgsql
security definer
set search_path = public, storage, pg_catalog
as $$
declare
  v_message public.messages%rowtype;
  v_object_metadata jsonb;
  v_object_size bigint;
  v_expected_prefix text;
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
  if p_attachment_index not between 1 and 9
     or p_expected_count not between 2 and 10
     or p_attachment_index >= p_expected_count then
    raise exception using errcode = '22023', message = 'invalid_album_position';
  end if;
  if p_bucket_id <> 'chat-media' or lower(coalesce(p_mime_type, '')) not like 'image/%' then
    raise exception using errcode = '22023', message = 'album_images_only';
  end if;

  select message_row.*
  into v_message
  from public.messages message_row
  where message_row.sender_id = p_sender_id
    and message_row.client_message_id = p_client_message_id
  for update;

  if v_message.id is null
     or v_message.receiver_id <> p_receiver_id
     or v_message.message_type <> 'image'
     or coalesce(v_message.is_view_once, false)
     or coalesce(v_message.deleted_for_all, false) then
    raise exception using errcode = '22023', message = 'album_message_invalid';
  end if;

  v_expected_prefix := p_sender_id::text || '/' || p_receiver_id::text || '/'
    || p_client_message_id || '/' || p_attachment_id::text || '-';
  if strpos(coalesce(p_storage_path, ''), v_expected_prefix) <> 1
     or char_length(p_storage_path) > 500 then
    raise exception using errcode = '22023', message = 'invalid_attachment_storage_path';
  end if;

  select object_row.metadata
  into v_object_metadata
  from storage.objects object_row
  where object_row.bucket_id = p_bucket_id
    and object_row.name = p_storage_path
  limit 1;

  if v_object_metadata is null then
    raise exception using errcode = '22023', message = 'attachment_object_not_found';
  end if;
  v_object_size := case
    when coalesce(v_object_metadata->>'size', '') ~ '^[0-9]+$'
      then (v_object_metadata->>'size')::bigint
    else p_byte_size
  end;
  if v_object_size is null or v_object_size <= 0 or v_object_size > 15728640 then
    raise exception using errcode = '22023', message = 'attachment_size_invalid';
  end if;

  update public.messages
  set media_expected_count = greatest(coalesce(media_expected_count, 1), p_expected_count)
  where id = v_message.id;

  insert into public.message_attachments (
    id, message_id, client_message_id, attachment_index, sender_id, receiver_id,
    bucket_id, storage_path, attachment_type, original_name, mime_type,
    byte_size, width, height, sha256, lifecycle_status, validation_status,
    validation_details, is_view_once, ready_at
  ) values (
    p_attachment_id, v_message.id, p_client_message_id, p_attachment_index,
    p_sender_id, p_receiver_id, p_bucket_id, p_storage_path, 'image',
    nullif(left(btrim(coalesce(p_original_name, '')), 180), ''),
    lower(p_mime_type), v_object_size, p_width, p_height,
    nullif(lower(btrim(coalesce(p_sha256, ''))), ''), 'ready', 'clean',
    coalesce(p_validation_details, '{}'::jsonb), false, timezone('utc', now())
  )
  on conflict (sender_id, client_message_id, attachment_index)
  do update set updated_at = timezone('utc', now());

  select message_row.* into v_message
  from public.messages message_row
  where message_row.id = v_message.id;
  return next v_message;
end;
$$;

revoke all on function public.rpc_append_chat_album_attachment(
  uuid, uuid, text, uuid, smallint, smallint, text, text, text, text,
  bigint, integer, integer, text, jsonb
) from public, anon, authenticated;
grant execute on function public.rpc_append_chat_album_attachment(
  uuid, uuid, text, uuid, smallint, smallint, text, text, text, text,
  bigint, integer, integer, text, jsonb
) to service_role;

do $$
declare
  v_message_id uuid;
begin
  for v_message_id in
    select distinct attachment_row.message_id
    from public.message_attachments attachment_row
    where attachment_row.attachment_type = 'image'
      and not attachment_row.is_view_once
  loop
    perform public.refresh_chat_message_media_items(v_message_id);
  end loop;
end;
$$;

alter table public.messages validate constraint messages_media_items_valid;
alter table public.messages validate constraint messages_media_expected_count_valid;

comment on column public.messages.media_items is
  'Server-owned ordered image attachment metadata for a single image or chat album.';
comment on column public.messages.media_expected_count is
  'Expected number of images while a durable album finishes uploading.';
