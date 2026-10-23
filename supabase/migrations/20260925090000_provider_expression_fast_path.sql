-- Keep provider-expression publication to one PostgREST round trip by
-- consuming the private-message quota inside the same transaction as insert.

begin;

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
  v_rate_limit jsonb;
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

  -- Lost-response retries remain free and return the canonical row.
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

  v_rate_limit := public.rpc_service_consume_content_guard_rate_limit(
    p_sender_user_id,
    'private_message'
  );
  if not coalesce((v_rate_limit->>'allowed')::boolean, false) then
    return jsonb_build_object(
      'ok', false,
      'code', 'MESSAGE_GUARD_RATE_LIMITED',
      'retry_after_seconds', coalesce((v_rate_limit->>'retry_after_seconds')::integer, 1)
    );
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

comment on function public.rpc_service_send_provider_expression(uuid, uuid, text, jsonb, text, uuid) is
  'Atomically rate-limits and publishes an idempotent GIPHY reference without proxying provider media.';

commit;
