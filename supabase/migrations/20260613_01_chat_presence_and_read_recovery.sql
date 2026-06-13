create or replace function public.rpc_mark_chat_thread_read(
  p_peer_user_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_count integer := 0;
begin
  if v_user_id is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  if p_peer_user_id is null or p_peer_user_id = v_user_id then
    raise exception 'invalid_peer';
  end if;

  update public.messages message_row
  set delivered_at = coalesce(message_row.delivered_at, timezone('utc'::text, now())),
      read_at = coalesce(message_row.read_at, timezone('utc'::text, now())),
      is_read = true
  where message_row.sender_id = p_peer_user_id
    and message_row.receiver_id = v_user_id
    and (
      coalesce(message_row.is_read, false) = false
      or message_row.read_at is null
      or message_row.delivered_at is null
    );

  get diagnostics v_count = row_count;

  update public.chat_conversation_summaries summary
  set unread_count = 0,
      updated_at = timezone('utc'::text, now())
  where summary.owner_user_id = v_user_id
    and summary.peer_user_id = p_peer_user_id
    and summary.unread_count <> 0;

  return v_count;
end;
$$;

revoke all on function public.rpc_mark_chat_thread_read(uuid) from public;
grant execute on function public.rpc_mark_chat_thread_read(uuid) to authenticated;
