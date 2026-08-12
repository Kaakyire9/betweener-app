-- Storage object metadata is authoritative after upload. Picker MIME values are
-- provisional and may differ on Android/iOS (notably video/mp4 vs QuickTime or
-- application/octet-stream). Canonicalize safe, unencrypted attachments at the
-- database boundary instead of rejecting an otherwise valid atomic album.

create or replace function public.enforce_chat_attachment_canonical_identity()
returns trigger
language plpgsql
security definer
set search_path = public, storage, pg_catalog
as $$
declare
  v_message public.messages%rowtype;
  v_object storage.objects%rowtype;
  v_preview storage.objects%rowtype;
  v_expected_prefix text;
  v_expected_count integer;
  v_object_size bigint;
  v_preview_size bigint;
  v_object_mime text;
begin
  select message_row.* into v_message
  from public.messages message_row
  where message_row.id = new.message_id;

  if v_message.id is null
     or v_message.sender_id <> new.sender_id
     or v_message.receiver_id <> new.receiver_id
     or v_message.client_message_id is distinct from new.client_message_id then
    raise exception using errcode = '23514', message = 'attachment_message_identity_mismatch';
  end if;

  v_expected_count := greatest(1, least(coalesce(v_message.media_expected_count, 1), 10));
  if new.attachment_index < 0 or new.attachment_index >= v_expected_count then
    raise exception using errcode = '23514', message = 'attachment_album_position_invalid';
  end if;

  v_expected_prefix := new.sender_id::text || '/' || new.receiver_id::text || '/'
    || new.client_message_id || '/' || new.id::text || '-';
  if strpos(new.storage_path, v_expected_prefix) <> 1 then
    raise exception using errcode = '23514', message = 'attachment_storage_ownership_mismatch';
  end if;

  select object_row.* into v_object
  from storage.objects object_row
  where object_row.bucket_id = new.bucket_id
    and object_row.name = new.storage_path;
  if v_object.id is null or v_object.owner_id::text is distinct from new.sender_id::text then
    raise exception using errcode = '23514', message = 'attachment_storage_owner_invalid';
  end if;

  v_object_size := case
    when coalesce(v_object.metadata->>'size', '') ~ '^[0-9]+$'
      then (v_object.metadata->>'size')::bigint
    else null
  end;
  if v_object_size is null or new.byte_size is distinct from v_object_size then
    raise exception using errcode = '23514', message = 'attachment_authoritative_size_mismatch';
  end if;

  v_object_mime := lower(split_part(coalesce(
    v_object.metadata->>'mimetype',
    v_object.metadata->>'contentType',
    ''
  ), ';', 1));

  -- Encrypted view-once objects are intentionally opaque. For ordinary media,
  -- Storage owns the canonical MIME after the Edge validator has checked the
  -- object signature. Generic Storage MIME values cannot safely replace a more
  -- specific validated declaration.
  if not coalesce(new.is_view_once, false)
     and v_object_mime <> ''
     and v_object_mime not in ('application/octet-stream', 'binary/octet-stream') then
    if (new.attachment_type = 'image' and v_object_mime not like 'image/%')
       or (new.attachment_type = 'video' and v_object_mime not like 'video/%')
       or (new.attachment_type = 'audio' and v_object_mime not like 'audio/%') then
      raise exception using errcode = '23514', message = 'attachment_authoritative_mime_invalid';
    end if;
    new.mime_type := v_object_mime;
  end if;

  if nullif(new.preview_storage_path, '') is not null then
    if strpos(new.preview_storage_path, v_expected_prefix) <> 1 then
      raise exception using errcode = '23514', message = 'attachment_preview_ownership_mismatch';
    end if;
    select object_row.* into v_preview
    from storage.objects object_row
    where object_row.bucket_id = coalesce(new.preview_bucket_id, 'chat-media')
      and object_row.name = new.preview_storage_path;
    if v_preview.id is null or v_preview.owner_id::text is distinct from new.sender_id::text then
      raise exception using errcode = '23514', message = 'attachment_preview_owner_invalid';
    end if;
    v_preview_size := case
      when coalesce(v_preview.metadata->>'size', '') ~ '^[0-9]+$'
        then (v_preview.metadata->>'size')::bigint
      else null
    end;
    if v_preview_size is null or new.preview_byte_size is distinct from v_preview_size then
      raise exception using errcode = '23514', message = 'attachment_preview_size_mismatch';
    end if;
    if lower(split_part(coalesce(
      v_preview.metadata->>'mimetype',
      v_preview.metadata->>'contentType',
      ''
    ), ';', 1)) not in ('', 'image/jpeg') then
      raise exception using errcode = '23514', message = 'attachment_preview_mime_mismatch';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_chat_attachment_canonical_identity()
  from public, anon, authenticated;

comment on function public.enforce_chat_attachment_canonical_identity() is
  'Enforces canonical message/storage identity and replaces provisional MIME with authoritative Storage metadata for validated non-encrypted attachments.';
