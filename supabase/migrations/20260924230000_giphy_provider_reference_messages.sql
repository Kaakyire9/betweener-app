-- Provider-backed chat expressions store only durable provider identity.
-- GIPHY bytes and media URLs remain provider-hosted and are rendered by the
-- official client SDK; they are never copied into Betweener Storage.

begin;

alter table public.messages
  add column if not exists provider_media jsonb;

create or replace function public.is_valid_chat_provider_media(
  p_provider_media jsonb,
  p_media_kind text default null
)
returns boolean
language sql
immutable
strict
set search_path = pg_catalog
as $$
  select
    jsonb_typeof(p_provider_media) = 'object'
    and p_provider_media ?& array[
      'schemaVersion', 'provider', 'providerMediaId', 'title', 'width', 'height', 'kind'
    ]::text[]
    and (p_provider_media - array[
      'schemaVersion', 'provider', 'providerMediaId', 'title', 'width', 'height', 'kind'
    ]::text[]) = '{}'::jsonb
    and jsonb_typeof(p_provider_media->'schemaVersion') = 'number'
    and p_provider_media->>'schemaVersion' = '1'
    and p_provider_media->>'provider' = 'giphy'
    and coalesce(p_provider_media->>'providerMediaId', '') ~ '^[A-Za-z0-9_-]{1,100}$'
    and jsonb_typeof(p_provider_media->'title') = 'string'
    and char_length(btrim(p_provider_media->>'title')) between 1 and 160
    and p_provider_media->>'kind' in ('giphy_gif', 'giphy_sticker', 'giphy_emoji', 'giphy_text')
    and (p_media_kind is null or p_provider_media->>'kind' = p_media_kind)
    and (
      p_provider_media->'width' = 'null'::jsonb
      or (
        jsonb_typeof(p_provider_media->'width') = 'number'
        and (p_provider_media->>'width') ~ '^[0-9]+$'
        and (p_provider_media->>'width')::integer between 1 and 8192
      )
    )
    and (
      p_provider_media->'height' = 'null'::jsonb
      or (
        jsonb_typeof(p_provider_media->'height') = 'number'
        and (p_provider_media->>'height') ~ '^[0-9]+$'
        and (p_provider_media->>'height')::integer between 1 and 8192
      )
    );
$$;

revoke all on function public.is_valid_chat_provider_media(jsonb, text)
  from public, anon, authenticated;
grant execute on function public.is_valid_chat_provider_media(jsonb, text)
  to service_role;

alter table public.messages
  drop constraint if exists messages_provider_media_valid;
alter table public.messages
  add constraint messages_provider_media_valid check (
    provider_media is null
    or (
      public.is_valid_chat_provider_media(provider_media, media_kind)
      and message_type = 'image'
      and media_kind in ('giphy_gif', 'giphy_sticker', 'giphy_emoji', 'giphy_text')
      and storage_path is null
      and coalesce(jsonb_array_length(media_items), 0) = 0
      and not is_view_once
      and not encrypted_media
    )
  ) not valid;
alter table public.messages validate constraint messages_provider_media_valid;

create or replace function public.enforce_chat_provider_media_write()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $$
begin
  if (tg_op = 'INSERT' and new.provider_media is not null)
     or (tg_op = 'UPDATE' and new.provider_media is distinct from old.provider_media) then
    if auth.role() <> 'service_role'
       or current_setting('request.chat_provider_expression_write', true) is distinct from 'true' then
      raise exception using errcode = '42501', message = 'CHAT_PROVIDER_MEDIA_WRITE_FORBIDDEN';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_chat_provider_media_write()
  from public, anon, authenticated;

drop trigger if exists enforce_chat_provider_media_write on public.messages;
create trigger enforce_chat_provider_media_write
before insert or update of provider_media on public.messages
for each row execute function public.enforce_chat_provider_media_write();

create or replace function public.rpc_service_send_provider_expression(
  p_sender_user_id uuid,
  p_receiver_user_id uuid,
  p_client_message_id text,
  p_provider_media jsonb,
  p_media_kind text,
  p_reply_to_message_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  v_existing public.messages%rowtype;
  v_message public.messages%rowtype;
  v_restricted_until timestamptz;
begin
  if auth.role() <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_sender_user_id is null
     or p_receiver_user_id is null
     or p_sender_user_id = p_receiver_user_id
     or nullif(btrim(p_client_message_id), '') is null
     or char_length(p_client_message_id) > 200
     or not coalesce(public.is_valid_chat_provider_media(p_provider_media, p_media_kind), false) then
    raise exception using errcode = '22023', message = 'INVALID_PROVIDER_EXPRESSION';
  end if;

  select * into v_existing
  from public.messages message_row
  where message_row.sender_id = p_sender_user_id
    and message_row.client_message_id = p_client_message_id
  limit 1;
  if found then
    if v_existing.receiver_id is distinct from p_receiver_user_id
       or v_existing.provider_media is distinct from p_provider_media
       or v_existing.media_kind is distinct from p_media_kind
       or v_existing.reply_to_message_id is distinct from p_reply_to_message_id then
      raise exception using errcode = '23505', message = 'MESSAGE_IDEMPOTENCY_CONFLICT';
    end if;
    return jsonb_build_object('ok', true, 'message', to_jsonb(v_existing), 'idempotent', true);
  end if;

  select actor_state.restricted_until into v_restricted_until
  from public.content_safety_actor_state actor_state
  where actor_state.user_id = p_sender_user_id;
  if v_restricted_until > timezone('utc', now()) then
    return jsonb_build_object(
      'ok', false,
      'code', 'MESSAGING_TEMPORARILY_RESTRICTED',
      'restricted_until', v_restricted_until
    );
  end if;

  if exists (
    select 1 from public.blocks block_row
    where (block_row.blocker_id = p_sender_user_id and block_row.blocked_id = p_receiver_user_id)
       or (block_row.blocker_id = p_receiver_user_id and block_row.blocked_id = p_sender_user_id)
  ) then
    raise exception using errcode = '42501', message = 'MESSAGING_BLOCKED';
  end if;

  if p_reply_to_message_id is not null and not exists (
    select 1
    from public.messages reply_row
    where reply_row.id = p_reply_to_message_id
      and (
        (reply_row.sender_id = p_sender_user_id and reply_row.receiver_id = p_receiver_user_id)
        or (reply_row.sender_id = p_receiver_user_id and reply_row.receiver_id = p_sender_user_id)
      )
  ) then
    raise exception using errcode = '22023', message = 'INVALID_PROVIDER_EXPRESSION';
  end if;

  perform set_config('request.chat_provider_expression_write', 'true', true);
  insert into public.messages (
    text, client_message_id, sender_id, receiver_id, is_read,
    message_type, reply_to_message_id, storage_path, media_kind,
    provider_media, media_items, attachment_state
  ) values (
    '', p_client_message_id, p_sender_user_id, p_receiver_user_id, false,
    'image', p_reply_to_message_id, null, p_media_kind,
    p_provider_media, '[]'::jsonb, 'ready'
  )
  returning * into v_message;

  return jsonb_build_object('ok', true, 'message', to_jsonb(v_message));
end;
$$;

revoke all on function public.rpc_service_send_provider_expression(
  uuid, uuid, text, jsonb, text, uuid
) from public, anon, authenticated;
grant execute on function public.rpc_service_send_provider_expression(
  uuid, uuid, text, jsonb, text, uuid
) to service_role;

comment on column public.messages.provider_media is
  'Validated provider identity only. Provider media URLs and bytes must not be persisted here.';
comment on function public.rpc_service_send_provider_expression(uuid, uuid, text, jsonb, text, uuid) is
  'Publishes an idempotent GIPHY reference message without proxying or storing provider media.';

commit;
