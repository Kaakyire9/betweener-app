begin;

alter table public.message_attachment_secrets
  add column if not exists sender_public_key text;

drop function if exists public.rpc_finalize_chat_attachment(
  uuid,
  uuid,
  text,
  uuid,
  text,
  text,
  text,
  text,
  text,
  bigint,
  integer,
  integer,
  integer,
  text,
  uuid,
  text,
  jsonb,
  boolean,
  text,
  text,
  text,
  text,
  text,
  jsonb
);

update public.message_attachment_secrets secret_row
set sender_public_key = profile_row.public_key
from public.message_attachments attachment_row
join public.messages message_row
  on message_row.id = attachment_row.message_id
join public.profiles profile_row
  on profile_row.user_id = message_row.sender_id
where attachment_row.id = secret_row.attachment_id
  and attachment_row.is_view_once
  and secret_row.sender_public_key is null
  and nullif(btrim(coalesce(profile_row.public_key, '')), '') is not null;

create or replace function public.rpc_finalize_chat_attachment(
  p_sender_id uuid,
  p_receiver_id uuid,
  p_client_message_id text,
  p_attachment_id uuid,
  p_attachment_type text,
  p_bucket_id text,
  p_storage_path text,
  p_original_name text,
  p_mime_type text,
  p_byte_size bigint default null,
  p_width integer default null,
  p_height integer default null,
  p_duration_ms integer default null,
  p_caption text default '',
  p_reply_to_message_id uuid default null,
  p_sha256 text default null,
  p_validation_details jsonb default '{}'::jsonb,
  p_is_view_once boolean default false,
  p_encrypted_key_sender text default null,
  p_encrypted_key_receiver text default null,
  p_encrypted_key_nonce text default null,
  p_encrypted_media_nonce text default null,
  p_encrypted_media_alg text default null,
  p_audio_waveform jsonb default null,
  p_sender_public_key text default null
)
returns setof public.messages
language plpgsql
security definer
set search_path = public, storage, pg_catalog
as $$
declare
  v_message public.messages%rowtype;
  v_attachment public.message_attachments%rowtype;
  v_object_metadata jsonb;
  v_object_size bigint;
  v_expected_prefix text;
  v_text text := coalesce(p_caption, '');
  v_type_limit bigint;
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
  if p_attachment_id is null then
    raise exception using errcode = '22023', message = 'attachment_id_required';
  end if;
  if p_attachment_type not in ('image', 'video', 'document', 'audio') then
    raise exception using errcode = '22023', message = 'unsupported_attachment_type';
  end if;
  if p_bucket_id not in ('chat-media', 'voice-messages') then
    raise exception using errcode = '22023', message = 'unsupported_attachment_bucket';
  end if;
  if (p_attachment_type = 'audio') <> (p_bucket_id = 'voice-messages') then
    raise exception using errcode = '22023', message = 'attachment_bucket_mismatch';
  end if;
  if p_is_view_once and p_attachment_type not in ('image', 'video') then
    raise exception using errcode = '22023', message = 'view_once_media_only';
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
  v_type_limit := case p_attachment_type
    when 'image' then 15728640
    when 'video' then 94371840
    when 'document' then 52428800
    when 'audio' then 26214400
  end;
  if v_object_size is null or v_object_size <= 0 or v_object_size > v_type_limit then
    raise exception using errcode = '22023', message = 'attachment_size_invalid';
  end if;
  if nullif(btrim(coalesce(p_mime_type, '')), '') is null or char_length(p_mime_type) > 160 then
    raise exception using errcode = '22023', message = 'attachment_mime_invalid';
  end if;
  if p_attachment_type = 'image' and lower(p_mime_type) not like 'image/%' then
    raise exception using errcode = '22023', message = 'attachment_mime_mismatch';
  end if;
  if p_attachment_type = 'video' and lower(p_mime_type) not like 'video/%' then
    raise exception using errcode = '22023', message = 'attachment_mime_mismatch';
  end if;
  if p_attachment_type = 'audio' and lower(p_mime_type) not like 'audio/%' then
    raise exception using errcode = '22023', message = 'attachment_mime_mismatch';
  end if;
  if p_is_view_once and (
    p_encrypted_key_sender is null
    or p_encrypted_key_receiver is null
    or p_encrypted_key_nonce is null
    or p_encrypted_media_nonce is null
    or p_encrypted_media_alg <> 'nacl-secretbox'
    or nullif(btrim(coalesce(p_sender_public_key, '')), '') is null
  ) then
    raise exception using errcode = '22023', message = 'view_once_secrets_missing';
  end if;

  select message_row.*
  into v_message
  from public.messages message_row
  where message_row.sender_id = p_sender_id
    and message_row.client_message_id = p_client_message_id
  limit 1;

  if v_message.id is null then
    if p_attachment_type = 'document' and nullif(btrim(v_text), '') is null then
      v_text := 'Attachment: ' || coalesce(nullif(btrim(p_original_name), ''), 'Document');
    end if;

    insert into public.messages (
      text,
      client_message_id,
      sender_id,
      receiver_id,
      is_read,
      message_type,
      reply_to_message_id,
      storage_path,
      is_view_once,
      encrypted_media,
      encrypted_media_mime,
      encrypted_media_size,
      audio_path,
      audio_duration,
      audio_waveform
    ) values (
      left(v_text, 16384),
      p_client_message_id,
      p_sender_id,
      p_receiver_id,
      false,
      case when p_attachment_type = 'audio' then 'voice' else p_attachment_type end,
      p_reply_to_message_id,
      case when p_is_view_once then null else p_storage_path end,
      p_is_view_once,
      p_is_view_once,
      case when p_is_view_once then p_mime_type else null end,
      case when p_is_view_once then v_object_size::integer else null end,
      case when p_attachment_type = 'audio' then p_storage_path else null end,
      case when p_attachment_type = 'audio' then coalesce(p_duration_ms, 0)::double precision / 1000 else null end,
      case when p_attachment_type = 'audio' then coalesce(p_audio_waveform, '[]'::jsonb) else null end
    )
    returning * into v_message;
  elsif v_message.receiver_id <> p_receiver_id
     or v_message.message_type <> (
       case when p_attachment_type = 'audio' then 'voice' else p_attachment_type end
     )
     or coalesce(v_message.deleted_for_all, false) then
    raise exception using errcode = '22023', message = 'attachment_idempotency_conflict';
  end if;

  insert into public.message_attachments (
    id,
    message_id,
    client_message_id,
    attachment_index,
    sender_id,
    receiver_id,
    bucket_id,
    storage_path,
    attachment_type,
    original_name,
    mime_type,
    byte_size,
    width,
    height,
    duration_ms,
    sha256,
    lifecycle_status,
    validation_status,
    validation_details,
    is_view_once,
    ready_at
  ) values (
    p_attachment_id,
    v_message.id,
    p_client_message_id,
    0,
    p_sender_id,
    p_receiver_id,
    p_bucket_id,
    p_storage_path,
    p_attachment_type,
    nullif(left(btrim(coalesce(p_original_name, '')), 180), ''),
    lower(p_mime_type),
    v_object_size,
    p_width,
    p_height,
    p_duration_ms,
    nullif(lower(btrim(coalesce(p_sha256, ''))), ''),
    'ready',
    case when p_is_view_once then 'not_applicable' else 'clean' end,
    coalesce(p_validation_details, '{}'::jsonb),
    p_is_view_once,
    timezone('utc', now())
  )
  on conflict (sender_id, client_message_id, attachment_index)
  do update set
    updated_at = timezone('utc', now())
  returning * into v_attachment;

  if p_is_view_once then
    insert into public.message_attachment_secrets (
      attachment_id,
      encrypted_key_sender,
      encrypted_key_receiver,
      encrypted_key_nonce,
      encrypted_media_nonce,
      encrypted_media_alg,
      sender_public_key
    ) values (
      v_attachment.id,
      p_encrypted_key_sender,
      p_encrypted_key_receiver,
      p_encrypted_key_nonce,
      p_encrypted_media_nonce,
      p_encrypted_media_alg,
      p_sender_public_key
    )
    on conflict (attachment_id) do update set
      sender_public_key = coalesce(public.message_attachment_secrets.sender_public_key, excluded.sender_public_key);
  end if;

  return next v_message;
end;
$$;

revoke all on function public.rpc_finalize_chat_attachment(
  uuid, uuid, text, uuid, text, text, text, text, text, bigint, integer,
  integer, integer, text, uuid, text, jsonb, boolean, text, text, text, text, text, jsonb, text
) from public, anon, authenticated;
grant execute on function public.rpc_finalize_chat_attachment(
  uuid, uuid, text, uuid, text, text, text, text, text, bigint, integer,
  integer, integer, text, uuid, text, jsonb, boolean, text, text, text, text, text, jsonb, text
) to service_role;

drop function if exists public.rpc_claim_view_once_attachment(uuid);

create or replace function public.rpc_claim_view_once_attachment(p_message_id uuid)
returns table (
  attachment_id uuid,
  bucket_id text,
  storage_path text,
  attachment_type text,
  mime_type text,
  byte_size bigint,
  encrypted_key_receiver text,
  encrypted_key_nonce text,
  encrypted_media_nonce text,
  encrypted_media_alg text,
  sender_public_key text
)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_message public.messages%rowtype;
  v_attachment public.message_attachments%rowtype;
  v_secret public.message_attachment_secrets%rowtype;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;

  select message_row.*
  into v_message
  from public.messages message_row
  where message_row.id = p_message_id
  for update;

  if v_message.id is null then
    raise exception using errcode = 'P0002', message = 'view_once_message_not_found';
  end if;
  if v_message.receiver_id <> auth.uid()
     or not v_message.is_view_once
     or not v_message.encrypted_media then
    raise exception using errcode = '42501', message = 'view_once_access_denied';
  end if;
  if exists (
    select 1 from public.message_views view_row
    where view_row.message_id = p_message_id
      and view_row.viewer_id = auth.uid()
  ) then
    raise exception using errcode = '22023', message = 'view_once_already_consumed';
  end if;

  select attachment_row.*
  into v_attachment
  from public.message_attachments attachment_row
  where attachment_row.message_id = p_message_id
    and attachment_row.is_view_once
    and attachment_row.lifecycle_status = 'ready'
  order by attachment_row.attachment_index
  limit 1;

  if v_attachment.id is null then
    raise exception using errcode = 'P0002', message = 'view_once_attachment_not_found';
  end if;

  select secret_row.*
  into v_secret
  from public.message_attachment_secrets secret_row
  where secret_row.attachment_id = v_attachment.id;

  if v_secret.attachment_id is null then
    raise exception using errcode = 'P0002', message = 'view_once_secret_not_found';
  end if;
  if nullif(btrim(coalesce(v_secret.sender_public_key, '')), '') is null then
    raise exception using errcode = 'P0002', message = 'view_once_sender_key_not_found';
  end if;

  insert into public.message_views (message_id, viewer_id)
  values (p_message_id, auth.uid());

  update public.messages
  set delivered_at = coalesce(public.messages.delivered_at, timezone('utc', now())),
      read_at = coalesce(public.messages.read_at, timezone('utc', now())),
      is_read = true
  where public.messages.id = p_message_id;

  update public.message_attachments
  set expires_at = timezone('utc', now()) + interval '5 minutes',
      updated_at = timezone('utc', now())
  where id = v_attachment.id;

  insert into public.chat_attachment_cleanup_queue (
    attachment_id, bucket_id, storage_path, reason, delete_after
  ) values (
    v_attachment.id,
    v_attachment.bucket_id,
    v_attachment.storage_path,
    'view_once_consumed',
    timezone('utc', now()) + interval '5 minutes'
  )
  on conflict on constraint chat_attachment_cleanup_queue_bucket_id_storage_path_key do update
    set reason = excluded.reason,
        delete_after = excluded.delete_after,
        status = 'scheduled',
        processing_started_at = null,
        last_error = null,
        updated_at = timezone('utc', now());

  return query select
    v_attachment.id,
    v_attachment.bucket_id,
    v_attachment.storage_path,
    v_attachment.attachment_type,
    v_attachment.mime_type,
    v_attachment.byte_size,
    v_secret.encrypted_key_receiver,
    v_secret.encrypted_key_nonce,
    v_secret.encrypted_media_nonce,
    v_secret.encrypted_media_alg,
    v_secret.sender_public_key;
end;
$$;

revoke all on function public.rpc_claim_view_once_attachment(uuid) from public, anon;
grant execute on function public.rpc_claim_view_once_attachment(uuid) to authenticated;

commit;
