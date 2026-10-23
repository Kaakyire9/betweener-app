-- Moderated chat images are copied into chat-media by the service role. Storage
-- therefore cannot use owner_id to prove the end-user identity. Bind every
-- service-published object to an exact, private approval record instead.

create table if not exists public.approved_chat_media_objects (
  object_path text primary key,
  sender_id uuid not null references auth.users(id) on delete cascade,
  receiver_id uuid not null references auth.users(id) on delete cascade,
  client_message_id text not null
    check (char_length(client_message_id) between 1 and 160
      and client_message_id ~ '^[A-Za-z0-9._-]+$'),
  attachment_id uuid not null,
  variant text not null check (variant in ('original', 'preview')),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  byte_size bigint not null check (byte_size > 0 and byte_size <= 15728640),
  mime_type text not null
    check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'image/gif')),
  approved_at timestamptz not null default timezone('utc', now()),
  unique (sender_id, client_message_id, attachment_id, variant)
);

alter table public.approved_chat_media_objects enable row level security;
revoke all on table public.approved_chat_media_objects
  from public, anon, authenticated;
grant select, insert, delete on table public.approved_chat_media_objects
  to service_role;

create or replace function public.rpc_service_register_approved_chat_media(
  p_sender_id uuid,
  p_receiver_id uuid,
  p_client_message_id text,
  p_attachment_id uuid,
  p_variant text,
  p_object_path text,
  p_sha256 text,
  p_byte_size bigint,
  p_mime_type text
)
returns boolean
language plpgsql
security definer
set search_path = public, storage, auth, pg_catalog
as $$
declare
  v_existing public.approved_chat_media_objects%rowtype;
  v_object storage.objects%rowtype;
  v_extension text;
  v_expected_path text;
  v_object_size bigint;
  v_object_mime text;
begin
  if auth.role() <> 'service_role'
     and not (session_user = 'postgres' and current_user = 'postgres') then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;
  if p_sender_id is null
     or p_receiver_id is null
     or p_attachment_id is null
     or nullif(btrim(coalesce(p_client_message_id, '')), '') is null
     or char_length(p_client_message_id) > 160
     or p_client_message_id !~ '^[A-Za-z0-9._-]+$'
     or p_variant not in ('original', 'preview')
     or p_sha256 !~ '^[0-9a-f]{64}$'
     or p_byte_size <= 0 or p_byte_size > 15728640
     or p_mime_type not in ('image/jpeg', 'image/png', 'image/webp', 'image/gif')
     or (p_variant = 'preview' and p_mime_type <> 'image/jpeg') then
    raise exception using errcode = '22023', message = 'INVALID_APPROVED_CHAT_MEDIA';
  end if;

  v_extension := case p_mime_type
    when 'image/png' then 'png'
    when 'image/webp' then 'webp'
    when 'image/gif' then 'gif'
    else 'jpg'
  end;
  v_expected_path := p_sender_id::text || '/' || p_receiver_id::text || '/'
    || p_client_message_id || '/' || p_attachment_id::text || '-'
    || case when p_variant = 'preview' then 'preview-' else '' end
    || p_sha256 || '.' || v_extension;
  if p_object_path is distinct from v_expected_path then
    raise exception using errcode = '22023', message = 'INVALID_APPROVED_CHAT_MEDIA_PATH';
  end if;

  select object_row.* into v_object
  from storage.objects object_row
  where object_row.bucket_id = 'chat-media'
    and object_row.name = p_object_path;
  v_object_size := case
    when coalesce(v_object.metadata->>'size', '') ~ '^[0-9]+$'
      then (v_object.metadata->>'size')::bigint
    else null
  end;
  v_object_mime := lower(split_part(coalesce(
    v_object.metadata->>'mimetype',
    v_object.metadata->>'contentType',
    ''
  ), ';', 1));
  if v_object.id is null
     or v_object_size is distinct from p_byte_size
     or v_object_mime is distinct from p_mime_type then
    raise exception using errcode = '23514', message = 'APPROVED_CHAT_MEDIA_OBJECT_MISMATCH';
  end if;

  select * into v_existing
  from public.approved_chat_media_objects approved
  where approved.object_path = p_object_path;
  if found then
    if v_existing.sender_id <> p_sender_id
       or v_existing.receiver_id <> p_receiver_id
       or v_existing.client_message_id <> p_client_message_id
       or v_existing.attachment_id <> p_attachment_id
       or v_existing.variant <> p_variant
       or v_existing.sha256 <> p_sha256
       or v_existing.byte_size <> p_byte_size
       or v_existing.mime_type <> p_mime_type then
      raise exception using errcode = '23505', message = 'APPROVED_CHAT_MEDIA_CONFLICT';
    end if;
    return true;
  end if;

  insert into public.approved_chat_media_objects(
    object_path, sender_id, receiver_id, client_message_id, attachment_id,
    variant, sha256, byte_size, mime_type
  ) values (
    p_object_path, p_sender_id, p_receiver_id, p_client_message_id,
    p_attachment_id, p_variant, p_sha256, p_byte_size, p_mime_type
  );
  return true;
end;
$$;

revoke all on function public.rpc_service_register_approved_chat_media(
  uuid, uuid, text, uuid, text, text, text, bigint, text
) from public, anon, authenticated;
grant execute on function public.rpc_service_register_approved_chat_media(
  uuid, uuid, text, uuid, text, text, text, bigint, text
) to service_role;

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
  v_preview_mime text;
  v_object_approved boolean := false;
  v_preview_approved boolean := false;
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
  v_object_size := case
    when coalesce(v_object.metadata->>'size', '') ~ '^[0-9]+$'
      then (v_object.metadata->>'size')::bigint
    else null
  end;
  v_object_mime := lower(split_part(coalesce(
    v_object.metadata->>'mimetype',
    v_object.metadata->>'contentType',
    ''
  ), ';', 1));
  if v_object.id is not null and new.bucket_id = 'chat-media' then
    select exists (
      select 1
      from public.approved_chat_media_objects approved
      where approved.object_path = new.storage_path
        and approved.sender_id = new.sender_id
        and approved.receiver_id = new.receiver_id
        and approved.client_message_id = new.client_message_id
        and approved.attachment_id = new.id
        and approved.variant = 'original'
        and approved.byte_size = v_object_size
        and approved.mime_type = v_object_mime
    ) into v_object_approved;
  end if;
  if v_object.id is null or (
    v_object.owner_id::text is distinct from new.sender_id::text
    and not v_object_approved
  ) then
    raise exception using errcode = '23514', message = 'attachment_storage_owner_invalid';
  end if;

  if v_object_size is null or new.byte_size is distinct from v_object_size then
    raise exception using errcode = '23514', message = 'attachment_authoritative_size_mismatch';
  end if;

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
    v_preview_size := case
      when coalesce(v_preview.metadata->>'size', '') ~ '^[0-9]+$'
        then (v_preview.metadata->>'size')::bigint
      else null
    end;
    v_preview_mime := lower(split_part(coalesce(
      v_preview.metadata->>'mimetype',
      v_preview.metadata->>'contentType',
      ''
    ), ';', 1));
    if v_preview.id is not null
       and coalesce(new.preview_bucket_id, 'chat-media') = 'chat-media' then
      select exists (
        select 1
        from public.approved_chat_media_objects approved
        where approved.object_path = new.preview_storage_path
          and approved.sender_id = new.sender_id
          and approved.receiver_id = new.receiver_id
          and approved.client_message_id = new.client_message_id
          and approved.attachment_id = new.id
          and approved.variant = 'preview'
          and approved.byte_size = v_preview_size
          and approved.mime_type = v_preview_mime
      ) into v_preview_approved;
    end if;
    if v_preview.id is null or (
      v_preview.owner_id::text is distinct from new.sender_id::text
      and not v_preview_approved
    ) then
      raise exception using errcode = '23514', message = 'attachment_preview_owner_invalid';
    end if;
    if v_preview_size is null or new.preview_byte_size is distinct from v_preview_size then
      raise exception using errcode = '23514', message = 'attachment_preview_size_mismatch';
    end if;
    if v_preview_mime not in ('', 'image/jpeg') then
      raise exception using errcode = '23514', message = 'attachment_preview_mime_mismatch';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_chat_attachment_canonical_identity()
  from public, anon, authenticated;

comment on table public.approved_chat_media_objects is
  'Private service-owned provenance for content-addressed moderated chat-media objects.';
comment on function public.enforce_chat_attachment_canonical_identity() is
  'Accepts sender-owned legacy objects or exact service-approved moderated objects while enforcing canonical message, path, size, and MIME identity.';
