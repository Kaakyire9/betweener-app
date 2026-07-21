begin;

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
