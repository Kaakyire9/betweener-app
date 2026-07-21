-- Future-proof chat attachments.
--
-- New clients finalize uploaded objects through a service-owned RPC so the
-- message and its attachment metadata are committed atomically. Existing
-- message columns remain in place while older app versions age out.

begin;

alter table public.messages
  drop constraint if exists message_type_valid;

alter table public.messages
  add constraint message_type_valid
  check (
    message_type = any (
      array[
        'text'::text,
        'voice'::text,
        'image'::text,
        'video'::text,
        'document'::text,
        'mood_sticker'::text,
        'location'::text,
        'view_once'::text
      ]
    )
  ) not valid;

-- New view-once messages keep their secrets outside the participant-readable
-- messages row. Legacy rows may continue to carry the old columns.
alter table public.messages
  drop constraint if exists message_encrypted_media_requires_keys;

alter table public.messages
  add constraint message_encrypted_media_requires_keys
  check (
    not encrypted_media
    or (
      is_view_once
      and message_type = any (array['image'::text, 'video'::text])
    )
  ) not valid;

create table if not exists public.message_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  client_message_id text not null,
  attachment_index smallint not null default 0,
  sender_id uuid not null references auth.users(id) on delete cascade,
  receiver_id uuid not null references auth.users(id) on delete cascade,
  bucket_id text not null default 'chat-media',
  storage_path text not null,
  attachment_type text not null,
  original_name text,
  mime_type text not null,
  byte_size bigint,
  width integer,
  height integer,
  duration_ms integer,
  thumbnail_storage_path text,
  sha256 text,
  lifecycle_status text not null default 'ready',
  validation_status text not null default 'clean',
  validation_details jsonb not null default '{}'::jsonb,
  is_view_once boolean not null default false,
  ready_at timestamptz,
  expires_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint message_attachments_participants_distinct check (sender_id <> receiver_id),
  constraint message_attachments_index_valid check (attachment_index between 0 and 20),
  constraint message_attachments_bucket_valid check (bucket_id in ('chat-media', 'voice-messages')),
  constraint message_attachments_type_valid check (attachment_type in ('image', 'video', 'document', 'audio')),
  constraint message_attachments_lifecycle_valid check (
    lifecycle_status in ('pending', 'ready', 'quarantined', 'failed', 'deleted', 'expired')
  ),
  constraint message_attachments_validation_valid check (
    validation_status in ('pending', 'clean', 'rejected', 'not_applicable')
  ),
  constraint message_attachments_byte_size_valid check (byte_size is null or byte_size between 0 and 104857600),
  constraint message_attachments_dimensions_valid check (
    (width is null or width between 1 and 20000)
    and (height is null or height between 1 and 20000)
  ),
  constraint message_attachments_duration_valid check (duration_ms is null or duration_ms between 0 and 7200000),
  constraint message_attachments_original_name_length check (original_name is null or char_length(original_name) <= 180),
  constraint message_attachments_mime_length check (char_length(mime_type) between 1 and 160),
  constraint message_attachments_path_length check (char_length(storage_path) between 10 and 500),
  unique (message_id, attachment_index),
  unique (sender_id, client_message_id, attachment_index),
  unique (bucket_id, storage_path)
);

create index if not exists message_attachments_message_idx
  on public.message_attachments(message_id, attachment_index);
create index if not exists message_attachments_participants_idx
  on public.message_attachments(sender_id, receiver_id, created_at desc);
create index if not exists message_attachments_cleanup_idx
  on public.message_attachments(lifecycle_status, expires_at)
  where lifecycle_status in ('deleted', 'expired') or expires_at is not null;

alter table public.message_attachments enable row level security;

-- Attachment rows intentionally have no direct authenticated grants. Clients
-- receive normal storage paths from messages; view-once paths remain private.
revoke all on table public.message_attachments from public, anon, authenticated;
grant all on table public.message_attachments to service_role;

create table if not exists public.message_attachment_secrets (
  attachment_id uuid primary key references public.message_attachments(id) on delete cascade,
  encrypted_key_sender text not null,
  encrypted_key_receiver text not null,
  encrypted_key_nonce text not null,
  encrypted_media_nonce text not null,
  encrypted_media_alg text not null default 'nacl-secretbox',
  created_at timestamptz not null default timezone('utc', now()),
  constraint message_attachment_secrets_algorithm_valid check (encrypted_media_alg in ('nacl-secretbox'))
);

alter table public.message_attachment_secrets enable row level security;
revoke all on table public.message_attachment_secrets from public, anon, authenticated;
grant all on table public.message_attachment_secrets to service_role;

create table if not exists public.chat_attachment_cleanup_queue (
  id bigint generated by default as identity primary key,
  attachment_id uuid references public.message_attachments(id) on delete cascade,
  bucket_id text not null,
  storage_path text not null,
  reason text not null,
  delete_after timestamptz not null default timezone('utc', now()),
  status text not null default 'scheduled',
  attempts integer not null default 0,
  processing_started_at timestamptz,
  last_error text,
  deleted_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint chat_attachment_cleanup_status_valid check (status in ('scheduled', 'processing', 'failed', 'deleted')),
  constraint chat_attachment_cleanup_reason_valid check (reason in ('message_deleted', 'view_once_consumed', 'orphaned', 'rejected', 'expired')),
  unique (bucket_id, storage_path)
);

create index if not exists chat_attachment_cleanup_due_idx
  on public.chat_attachment_cleanup_queue(status, delete_after, id)
  where status in ('scheduled', 'failed');

alter table public.chat_attachment_cleanup_queue enable row level security;
revoke all on table public.chat_attachment_cleanup_queue from public, anon, authenticated;
grant all on table public.chat_attachment_cleanup_queue to service_role;

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
  p_audio_waveform jsonb default null
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
      encrypted_media_alg
    ) values (
      v_attachment.id,
      p_encrypted_key_sender,
      p_encrypted_key_receiver,
      p_encrypted_key_nonce,
      p_encrypted_media_nonce,
      p_encrypted_media_alg
    )
    on conflict (attachment_id) do nothing;
  end if;

  return next v_message;
end;
$$;

revoke all on function public.rpc_finalize_chat_attachment(
  uuid, uuid, text, uuid, text, text, text, text, text, bigint, integer,
  integer, integer, text, uuid, text, jsonb, boolean, text, text, text, text, text, jsonb
) from public, anon, authenticated;
grant execute on function public.rpc_finalize_chat_attachment(
  uuid, uuid, text, uuid, text, text, text, text, text, bigint, integer,
  integer, integer, text, uuid, text, jsonb, boolean, text, text, text, text, text, jsonb
) to service_role;

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
  encrypted_media_alg text
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
    v_secret.encrypted_media_alg;
end;
$$;

revoke all on function public.rpc_claim_view_once_attachment(uuid) from public, anon;
grant execute on function public.rpc_claim_view_once_attachment(uuid) to authenticated;

create or replace function public.rpc_delete_chat_message_for_everyone(p_message_id uuid)
returns table (bucket_id text, storage_path text)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_sender_id uuid;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;

  select message_row.sender_id
  into v_sender_id
  from public.messages message_row
  where message_row.id = p_message_id
  for update;

  if v_sender_id is null then
    raise exception using errcode = 'P0002', message = 'message_not_found';
  end if;
  if v_sender_id <> auth.uid() then
    raise exception using errcode = '42501', message = 'only_sender_can_delete_message';
  end if;

  update public.messages
  set deleted_for_all = true,
      deleted_at = timezone('utc', now()),
      deleted_by = auth.uid(),
      text = '',
      storage_path = null,
      audio_path = null,
      encrypted_media_path = null,
      encrypted_key_sender = null,
      encrypted_key_receiver = null,
      encrypted_key_nonce = null,
      encrypted_media_nonce = null
  where id = p_message_id;

  update public.message_attachments attachment_row
  set lifecycle_status = 'deleted',
      deleted_at = timezone('utc', now()),
      expires_at = timezone('utc', now()),
      updated_at = timezone('utc', now())
  where attachment_row.message_id = p_message_id;

  insert into public.chat_attachment_cleanup_queue (
    attachment_id, bucket_id, storage_path, reason, delete_after
  )
  select
    attachment_row.id,
    attachment_row.bucket_id,
    attachment_row.storage_path,
    'message_deleted',
    timezone('utc', now())
  from public.message_attachments attachment_row
  where attachment_row.message_id = p_message_id
  on conflict on constraint chat_attachment_cleanup_queue_bucket_id_storage_path_key do update
    set reason = excluded.reason,
        delete_after = excluded.delete_after,
        status = 'scheduled',
        processing_started_at = null,
        last_error = null,
        updated_at = timezone('utc', now());

  return query
  select attachment_row.bucket_id, attachment_row.storage_path
  from public.message_attachments attachment_row
  where attachment_row.message_id = p_message_id;
end;
$$;

revoke all on function public.rpc_delete_chat_message_for_everyone(uuid) from public, anon;
grant execute on function public.rpc_delete_chat_message_for_everyone(uuid) to authenticated;

create or replace function public.rpc_claim_chat_attachment_cleanup(p_limit integer default 50)
returns table (
  queue_id bigint,
  attachment_id uuid,
  bucket_id text,
  storage_path text,
  reason text
)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception using errcode = '42501', message = 'service_role_required';
  end if;

  return query
  with claimed as (
    select queue_row.id
    from public.chat_attachment_cleanup_queue queue_row
    where queue_row.status in ('scheduled', 'failed')
      and queue_row.delete_after <= timezone('utc', now())
      and queue_row.attempts < 12
      and (
        queue_row.processing_started_at is null
        or queue_row.processing_started_at < timezone('utc', now()) - interval '15 minutes'
      )
    order by queue_row.delete_after, queue_row.id
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 50), 200))
  ), updated as (
    update public.chat_attachment_cleanup_queue queue_row
    set status = 'processing',
        attempts = queue_row.attempts + 1,
        processing_started_at = timezone('utc', now()),
        updated_at = timezone('utc', now())
    from claimed
    where queue_row.id = claimed.id
    returning queue_row.*
  )
  select updated.id, updated.attachment_id, updated.bucket_id, updated.storage_path, updated.reason
  from updated;
end;
$$;

revoke all on function public.rpc_claim_chat_attachment_cleanup(integer) from public, anon, authenticated;
grant execute on function public.rpc_claim_chat_attachment_cleanup(integer) to service_role;

create or replace function public.rpc_schedule_orphaned_chat_attachments(p_limit integer default 100)
returns integer
language plpgsql
security definer
set search_path = public, storage, pg_catalog
as $$
declare
  v_scheduled integer := 0;
begin
  if auth.role() <> 'service_role' then
    raise exception using errcode = '42501', message = 'service_role_required';
  end if;

  with orphaned as (
    select object_row.bucket_id, object_row.name
    from storage.objects object_row
    where object_row.bucket_id in ('chat-media', 'voice-messages')
      and object_row.created_at < timezone('utc', now()) - interval '24 hours'
      and cardinality(storage.foldername(object_row.name)) >= 4
      and not exists (
        select 1
        from public.message_attachments attachment_row
        where attachment_row.bucket_id = object_row.bucket_id
          and attachment_row.storage_path = object_row.name
      )
    order by object_row.created_at
    limit greatest(1, least(coalesce(p_limit, 100), 500))
  ), inserted as (
    insert into public.chat_attachment_cleanup_queue (
      attachment_id, bucket_id, storage_path, reason, delete_after
    )
    select null, orphaned.bucket_id, orphaned.name, 'orphaned', timezone('utc', now())
    from orphaned
    on conflict on constraint chat_attachment_cleanup_queue_bucket_id_storage_path_key do nothing
    returning 1
  )
  select count(*) into v_scheduled from inserted;

  return v_scheduled;
end;
$$;

revoke all on function public.rpc_schedule_orphaned_chat_attachments(integer) from public, anon, authenticated;
grant execute on function public.rpc_schedule_orphaned_chat_attachments(integer) to service_role;

-- Backfill durable lifecycle records for existing attachment messages. Legacy
-- view-once secrets are copied into the private table, while their old columns
-- remain temporarily for already-released clients.
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
  lifecycle_status,
  validation_status,
  validation_details,
  is_view_once,
  ready_at,
  created_at,
  updated_at
)
select
  gen_random_uuid(),
  message_row.id,
  coalesce(message_row.client_message_id, 'legacy-' || message_row.id::text),
  0,
  message_row.sender_id,
  message_row.receiver_id,
  case when message_row.message_type = 'voice' then 'voice-messages' else 'chat-media' end,
  coalesce(message_row.encrypted_media_path, message_row.storage_path, message_row.audio_path),
  case
    when message_row.message_type = 'voice' then 'audio'
    when message_row.message_type = 'document' then 'document'
    else message_row.message_type
  end,
  null,
  coalesce(message_row.encrypted_media_mime,
    case message_row.message_type
      when 'image' then 'image/unknown'
      when 'video' then 'video/unknown'
      when 'voice' then 'audio/unknown'
      else 'application/octet-stream'
    end
  ),
  message_row.encrypted_media_size,
  case when message_row.deleted_for_all then 'deleted' else 'ready' end,
  case when message_row.encrypted_media then 'not_applicable' else 'clean' end,
  jsonb_build_object('source', 'legacy_backfill'),
  message_row.is_view_once,
  message_row.created_at,
  message_row.created_at,
  timezone('utc', now())
from public.messages message_row
where coalesce(message_row.encrypted_media_path, message_row.storage_path, message_row.audio_path) is not null
  and message_row.message_type in ('image', 'video', 'document', 'voice')
on conflict (message_id, attachment_index) do nothing;

insert into public.message_attachment_secrets (
  attachment_id,
  encrypted_key_sender,
  encrypted_key_receiver,
  encrypted_key_nonce,
  encrypted_media_nonce,
  encrypted_media_alg
)
select
  attachment_row.id,
  message_row.encrypted_key_sender,
  message_row.encrypted_key_receiver,
  message_row.encrypted_key_nonce,
  message_row.encrypted_media_nonce,
  coalesce(message_row.encrypted_media_alg, 'nacl-secretbox')
from public.message_attachments attachment_row
join public.messages message_row on message_row.id = attachment_row.message_id
where attachment_row.is_view_once
  and message_row.encrypted_key_sender is not null
  and message_row.encrypted_key_receiver is not null
  and message_row.encrypted_key_nonce is not null
  and message_row.encrypted_media_nonce is not null
on conflict (attachment_id) do nothing;

comment on table public.message_attachments is
  'Canonical versioned metadata and lifecycle state for chat attachments. Direct client access is intentionally disabled.';
comment on table public.message_attachment_secrets is
  'Service-only view-once encryption material. Never expose through participant-readable message rows.';
comment on table public.chat_attachment_cleanup_queue is
  'Storage API deletion queue for deleted, expired, rejected, and consumed chat attachments.';

commit;
