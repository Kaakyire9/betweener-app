-- Preserve provider-expression presentation across devices while keeping the
-- existing moderation, publication, and idempotency transaction intact.

update public.messages message_row
set media_kind = case
  when attachment_row.original_name like 'giphy-sticker-%' then 'giphy_sticker'
  when attachment_row.original_name like 'giphy-emoji-%' then 'giphy_emoji'
  when attachment_row.original_name like 'giphy-text-%' then 'giphy_text'
  else 'giphy_gif'
end
from public.message_attachments attachment_row
where attachment_row.message_id = message_row.id
  and message_row.message_type = 'image'
  and message_row.media_kind is null
  and attachment_row.mime_type = 'image/gif'
  and attachment_row.original_name like 'giphy-%';

create or replace function public.rpc_finalize_chat_attachment_batch_v4(
  p_sender_id uuid,
  p_receiver_id uuid,
  p_client_message_id text,
  p_attachment_type text,
  p_expected_count smallint,
  p_attachments jsonb,
  p_caption text,
  p_reply_to_message_id uuid,
  p_media_kind text,
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
  if p_media_kind is not null and (
    p_media_kind not in ('giphy_gif', 'giphy_sticker', 'giphy_emoji', 'giphy_text')
    or p_attachment_type <> 'image'
    or p_expected_count <> 1
  ) then
    raise exception using errcode = '22023', message = 'invalid_chat_expression_media_kind';
  end if;

  select finalized.* into strict v_message
  from public.rpc_finalize_chat_attachment_batch_v3(
    p_sender_id,
    p_receiver_id,
    p_client_message_id,
    p_attachment_type,
    p_expected_count,
    p_attachments,
    p_caption,
    p_reply_to_message_id,
    p_request_payload
  ) finalized;

  if p_media_kind is not null then
    update public.messages message_row
    set media_kind = p_media_kind
    where message_row.id = v_message.id
      and message_row.sender_id = p_sender_id
      and message_row.receiver_id = p_receiver_id
      and message_row.message_type = 'image'
    returning message_row.* into strict v_message;
  end if;

  return next v_message;
end;
$$;

revoke all on function public.rpc_finalize_chat_attachment_batch_v4(
  uuid, uuid, text, text, smallint, jsonb, text, uuid, text, jsonb
) from public, anon, authenticated;
grant execute on function public.rpc_finalize_chat_attachment_batch_v4(
  uuid, uuid, text, text, smallint, jsonb, text, uuid, text, jsonb
) to service_role;

comment on function public.rpc_finalize_chat_attachment_batch_v4(
  uuid, uuid, text, text, smallint, jsonb, text, uuid, text, jsonb
) is 'Atomically publishes one moderated attachment and preserves its allowlisted expression presentation.';
