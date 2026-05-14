-- Diagnostic helper for message delivery receipts.
-- The push-notifications Edge Function now marks messages.delivered_at when
-- Expo accepts at least one push ticket for a message notification. This helper
-- lets either side of the conversation verify the state safely.

drop function if exists public.rpc_debug_message_delivery_receipt(uuid);

create or replace function public.rpc_debug_message_delivery_receipt(
  p_message_id uuid
)
returns jsonb
language plpgsql
security definer
stable
set search_path = public, pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'authentication required';
  end if;

  select jsonb_build_object(
    'id', m.id,
    'sender_id', m.sender_id,
    'receiver_id', m.receiver_id,
    'is_read', m.is_read,
    'delivered_at', m.delivered_at,
    'created_at', m.created_at,
    'message_type', m.message_type
  )
    into v_result
  from public.messages m
  where m.id = p_message_id
    and (m.sender_id = v_user_id or m.receiver_id = v_user_id)
  limit 1;

  return coalesce(v_result, '{}'::jsonb);
end;
$$;

revoke all on function public.rpc_debug_message_delivery_receipt(uuid) from public;
grant execute on function public.rpc_debug_message_delivery_receipt(uuid) to authenticated;
