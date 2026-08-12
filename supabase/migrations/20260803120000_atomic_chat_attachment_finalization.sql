-- Prompt 3: make attachment publication database-idempotent and bind the
-- accepted request to one canonical message in the same transaction.

alter table public.chat_attachment_finalization_keys
  add column if not exists finalization_key uuid not null default gen_random_uuid(),
  add column if not exists request_hash text,
  add column if not exists status text not null default 'claimed',
  add column if not exists canonical_message_id uuid references public.messages(id) on delete set null,
  add column if not exists completed_at timestamptz,
  add column if not exists replay_count integer not null default 0;

alter table public.chat_attachment_retention_runs
  add column if not exists abandoned_finalization_count integer not null default 0;

update public.chat_attachment_finalization_keys key_row
set request_hash = md5(key_row.request_payload::text)
where key_row.request_hash is null;

update public.chat_attachment_finalization_keys key_row
set canonical_message_id = message_row.id,
    status = 'completed',
    completed_at = coalesce(key_row.completed_at, message_row.created_at)
from public.messages message_row
where message_row.sender_id = key_row.sender_id
  and message_row.client_message_id = key_row.client_message_id
  and key_row.canonical_message_id is null;

alter table public.chat_attachment_finalization_keys
  alter column request_hash set not null,
  drop constraint if exists chat_attachment_finalization_status_valid,
  add constraint chat_attachment_finalization_status_valid
    check (status in ('claimed', 'completed', 'abandoned')),
  drop constraint if exists chat_attachment_finalization_completion_valid,
  add constraint chat_attachment_finalization_completion_valid check (
    (status = 'completed' and canonical_message_id is not null and completed_at is not null)
    or (status <> 'completed' and canonical_message_id is null and completed_at is null)
  );

create unique index if not exists chat_attachment_finalization_key_unique
  on public.chat_attachment_finalization_keys(finalization_key);
create unique index if not exists chat_attachment_finalization_message_unique
  on public.chat_attachment_finalization_keys(canonical_message_id)
  where canonical_message_id is not null;
drop index if exists public.chat_attachment_finalization_stale_idx;
create index chat_attachment_finalization_stale_idx
  on public.chat_attachment_finalization_keys(
    coalesce(last_replayed_at, created_at), sender_id, client_message_id
  )
  where status = 'claimed';

-- The message row is the album identity. This redundant composite key permits
-- a cross-table FK that proves every attachment has the same sender, receiver,
-- and client identity as its canonical message.
alter table public.messages
  drop constraint if exists messages_attachment_identity_unique,
  add constraint messages_attachment_identity_unique
    unique (id, sender_id, receiver_id, client_message_id);

alter table public.message_attachments
  drop constraint if exists message_attachments_canonical_identity_fkey,
  add constraint message_attachments_canonical_identity_fkey
    foreign key (message_id, sender_id, receiver_id, client_message_id)
    references public.messages(id, sender_id, receiver_id, client_message_id)
    on delete cascade
    not valid,
  drop constraint if exists message_attachments_album_index_v3_valid,
  add constraint message_attachments_album_index_v3_valid
    check (attachment_index between 0 and 9) not valid,
  drop constraint if exists message_attachments_validation_evidence_v3_valid,
  add constraint message_attachments_validation_evidence_v3_valid check (
    validation_status <> 'clean'
    or created_at < '2026-08-03 12:00:00+00'::timestamptz
    or (
      validation_details @> '{"byte_size_verified": true}'::jsonb
      and (
        validation_details @> '{"signature_verified": true}'::jsonb
        or validation_details @> '{"ciphertext_verified": true}'::jsonb
      )
    )
  ) not valid;

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
  if v_object_mime <> '' and v_object_mime is distinct from lower(new.mime_type) then
    raise exception using errcode = '23514', message = 'attachment_authoritative_mime_mismatch';
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

drop trigger if exists enforce_chat_attachment_canonical_identity
  on public.message_attachments;
create trigger enforce_chat_attachment_canonical_identity
before insert or update of message_id, sender_id, receiver_id, client_message_id,
  attachment_index, bucket_id, storage_path, byte_size, preview_bucket_id,
  preview_storage_path
on public.message_attachments
for each row execute function public.enforce_chat_attachment_canonical_identity();

create or replace function public.rpc_claim_chat_attachment_finalization(
  p_sender_id uuid,
  p_client_message_id text,
  p_request_payload jsonb
)
returns text
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_existing public.chat_attachment_finalization_keys%rowtype;
begin
  if auth.role() <> 'service_role' then
    raise exception using errcode = '42501', message = 'service_role_required';
  end if;
  if p_sender_id is null
     or nullif(btrim(coalesce(p_client_message_id, '')), '') is null
     or char_length(p_client_message_id) > 160
     or p_client_message_id !~ '^[A-Za-z0-9._-]+$'
     or p_request_payload is null
     or jsonb_typeof(p_request_payload) <> 'object' then
    raise exception using errcode = '22023', message = 'invalid_attachment_finalization_key';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_sender_id::text || ':' || p_client_message_id, 0)
  );

  select key_row.* into v_existing
  from public.chat_attachment_finalization_keys key_row
  where key_row.sender_id = p_sender_id
    and key_row.client_message_id = p_client_message_id
  for update;

  if v_existing.sender_id is null then
    insert into public.chat_attachment_finalization_keys (
      sender_id, client_message_id, request_payload, request_hash
    ) values (
      p_sender_id, p_client_message_id, p_request_payload, md5(p_request_payload::text)
    );
    return 'claimed';
  end if;

  if v_existing.request_payload is distinct from p_request_payload
     or v_existing.request_hash <> md5(p_request_payload::text) then
    raise exception using errcode = '22023', message = 'attachment_idempotency_conflict';
  end if;
  if v_existing.status = 'abandoned' then
    raise exception using errcode = '22023', message = 'attachment_finalization_abandoned';
  end if;

  update public.chat_attachment_finalization_keys
  set last_replayed_at = timezone('utc', now()),
      replay_count = replay_count + 1
  where sender_id = p_sender_id
    and client_message_id = p_client_message_id;
  return case when v_existing.canonical_message_id is null then 'replay' else 'completed' end;
end;
$$;

revoke all on function public.rpc_claim_chat_attachment_finalization(uuid, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.rpc_claim_chat_attachment_finalization(uuid, text, jsonb)
  to service_role;

create or replace function public.rpc_finalize_chat_attachment_batch_v3(
  p_sender_id uuid,
  p_receiver_id uuid,
  p_client_message_id text,
  p_attachment_type text,
  p_expected_count smallint,
  p_attachments jsonb,
  p_caption text,
  p_reply_to_message_id uuid,
  p_request_payload jsonb
)
returns setof public.messages
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_message public.messages%rowtype;
begin
  perform public.rpc_claim_chat_attachment_finalization(
    p_sender_id, p_client_message_id, p_request_payload
  );

  select finalized.* into strict v_message
  from public.rpc_finalize_chat_attachment_batch(
    p_sender_id, p_receiver_id, p_client_message_id, p_attachment_type,
    p_expected_count, p_attachments, p_caption, p_reply_to_message_id
  ) finalized;

  update public.chat_attachment_finalization_keys
  set status = 'completed',
      canonical_message_id = v_message.id,
      completed_at = coalesce(completed_at, timezone('utc', now()))
  where sender_id = p_sender_id
    and client_message_id = p_client_message_id
    and (canonical_message_id is null or canonical_message_id = v_message.id);
  if not found then
    raise exception using errcode = '22023', message = 'attachment_canonical_result_conflict';
  end if;

  return next v_message;
end;
$$;

revoke all on function public.rpc_finalize_chat_attachment_batch_v3(
  uuid, uuid, text, text, smallint, jsonb, text, uuid, jsonb
) from public, anon, authenticated;
grant execute on function public.rpc_finalize_chat_attachment_batch_v3(
  uuid, uuid, text, text, smallint, jsonb, text, uuid, jsonb
) to service_role;

create or replace function public.rpc_finalize_chat_attachment_v3(
  p_sender_id uuid,
  p_receiver_id uuid,
  p_client_message_id text,
  p_attachment_id uuid,
  p_attachment_type text,
  p_bucket_id text,
  p_storage_path text,
  p_original_name text,
  p_mime_type text,
  p_byte_size bigint,
  p_width integer,
  p_height integer,
  p_duration_ms integer,
  p_caption text,
  p_reply_to_message_id uuid,
  p_sha256 text,
  p_validation_details jsonb,
  p_is_view_once boolean,
  p_encrypted_key_sender text,
  p_encrypted_key_receiver text,
  p_encrypted_key_nonce text,
  p_encrypted_media_nonce text,
  p_encrypted_media_alg text,
  p_audio_waveform jsonb,
  p_sender_public_key text,
  p_request_payload jsonb
)
returns setof public.messages
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_message public.messages%rowtype;
begin
  perform public.rpc_claim_chat_attachment_finalization(
    p_sender_id, p_client_message_id, p_request_payload
  );

  select finalized.* into strict v_message
  from public.rpc_finalize_chat_attachment(
    p_sender_id, p_receiver_id, p_client_message_id, p_attachment_id,
    p_attachment_type, p_bucket_id, p_storage_path, p_original_name,
    p_mime_type, p_byte_size, p_width, p_height, p_duration_ms, p_caption,
    p_reply_to_message_id, p_sha256, p_validation_details, p_is_view_once,
    p_encrypted_key_sender, p_encrypted_key_receiver, p_encrypted_key_nonce,
    p_encrypted_media_nonce, p_encrypted_media_alg, p_audio_waveform,
    p_sender_public_key
  ) finalized;

  update public.chat_attachment_finalization_keys
  set status = 'completed',
      canonical_message_id = v_message.id,
      completed_at = coalesce(completed_at, timezone('utc', now()))
  where sender_id = p_sender_id
    and client_message_id = p_client_message_id
    and (canonical_message_id is null or canonical_message_id = v_message.id);
  if not found then
    raise exception using errcode = '22023', message = 'attachment_canonical_result_conflict';
  end if;

  return next v_message;
end;
$$;

revoke all on function public.rpc_finalize_chat_attachment_v3(
  uuid, uuid, text, uuid, text, text, text, text, text, bigint, integer,
  integer, integer, text, uuid, text, jsonb, boolean, text, text, text, text,
  text, jsonb, text, jsonb
) from public, anon, authenticated;
grant execute on function public.rpc_finalize_chat_attachment_v3(
  uuid, uuid, text, uuid, text, text, text, text, text, bigint, integer,
  integer, integer, text, uuid, text, jsonb, boolean, text, text, text, text,
  text, jsonb, text, jsonb
) to service_role;

create or replace function public.rpc_abandon_stale_chat_attachment_finalizations(
  p_limit integer default 100
)
returns integer
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_count integer;
  v_candidate record;
begin
  if auth.role() <> 'service_role' then
    raise exception using errcode = '42501', message = 'service_role_required';
  end if;

  v_count := 0;
  for v_candidate in
    select key_row.sender_id, key_row.client_message_id
    from public.chat_attachment_finalization_keys key_row
    where key_row.status = 'claimed'
      and coalesce(key_row.last_replayed_at, key_row.created_at)
        < timezone('utc', now()) - interval '24 hours'
      and not exists (
        select 1 from public.messages message_row
        where message_row.sender_id = key_row.sender_id
          and message_row.client_message_id = key_row.client_message_id
      )
    order by key_row.created_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 100), 500))
  loop
    update public.chat_attachment_finalization_keys
    set status = 'abandoned'
    where sender_id = v_candidate.sender_id
      and client_message_id = v_candidate.client_message_id;

    insert into public.chat_attachment_cleanup_queue (
      bucket_id, storage_path, reason, delete_after
    )
    select object_row.bucket_id, object_row.name, 'orphaned', timezone('utc', now())
    from storage.objects object_row
    where object_row.bucket_id in ('chat-media', 'voice-messages')
      and split_part(object_row.name, '/', 1) = v_candidate.sender_id::text
      and split_part(object_row.name, '/', 3) = v_candidate.client_message_id
      and not exists (
        select 1 from public.message_attachments attachment_row
        where attachment_row.bucket_id = object_row.bucket_id
          and attachment_row.storage_path = object_row.name
      )
    on conflict on constraint chat_attachment_cleanup_queue_bucket_id_storage_path_key
    do update set
      status = case
        when public.chat_attachment_cleanup_queue.status = 'deleted' then 'deleted'
        else 'scheduled'
      end,
      delete_after = least(
        public.chat_attachment_cleanup_queue.delete_after,
        excluded.delete_after
      ),
      updated_at = timezone('utc', now());

    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.rpc_abandon_stale_chat_attachment_finalizations(integer)
  from public, anon, authenticated;
grant execute on function public.rpc_abandon_stale_chat_attachment_finalizations(integer)
  to service_role;

comment on function public.rpc_finalize_chat_attachment_batch_v3(
  uuid, uuid, text, text, smallint, jsonb, text, uuid, jsonb
) is 'Atomically claims one exact request, publishes an album, and binds its canonical message result.';
comment on function public.rpc_finalize_chat_attachment_v3(
  uuid, uuid, text, uuid, text, text, text, text, text, bigint, integer,
  integer, integer, text, uuid, text, jsonb, boolean, text, text, text, text,
  text, jsonb, text, jsonb
) is 'Atomically claims one exact request, publishes one attachment, and binds its canonical message result.';
