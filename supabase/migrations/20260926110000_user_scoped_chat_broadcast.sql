-- Scalable v1.2 chat change delivery. Additive for 1.1.1: legacy clients may
-- continue consuming Postgres Changes while v1.2 uses private Broadcast.

begin;

drop policy if exists "members receive own chat broadcasts" on realtime.messages;
create policy "members receive own chat broadcasts"
on realtime.messages
for select
to authenticated
using (
  realtime.messages.extension = 'broadcast'
  and realtime.topic() = 'user:' || (select auth.uid())::text || ':chat'
);

create or replace function public.broadcast_user_chat_change_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  topic_user_id uuid;
begin
  if tg_table_name = 'messages' then
    for topic_user_id in
      select distinct candidate.user_id
      from unnest(array[
        coalesce(new.sender_id, old.sender_id),
        coalesce(new.receiver_id, old.receiver_id)
      ]) candidate(user_id)
      where candidate.user_id is not null
    loop
      perform realtime.broadcast_changes(
        'user:' || topic_user_id::text || ':chat',
        tg_op,
        tg_op,
        tg_table_name,
        tg_table_schema,
        new,
        old
      );
    end loop;
  elsif tg_table_name = 'system_messages' then
    topic_user_id := coalesce(new.user_id, old.user_id);
    if topic_user_id is not null then
      perform realtime.broadcast_changes(
        'user:' || topic_user_id::text || ':chat',
        tg_op,
        tg_op,
        tg_table_name,
        tg_table_schema,
        new,
        old
      );
    end if;
  end if;
  return null;
end;
$$;

revoke all on function public.broadcast_user_chat_change_v1() from public, anon, authenticated;

drop trigger if exists broadcast_user_chat_messages_v1 on public.messages;
create trigger broadcast_user_chat_messages_v1
after insert or update or delete on public.messages
for each row execute function public.broadcast_user_chat_change_v1();

drop trigger if exists broadcast_user_chat_system_messages_v1 on public.system_messages;
create trigger broadcast_user_chat_system_messages_v1
after insert or update or delete on public.system_messages
for each row execute function public.broadcast_user_chat_change_v1();

commit;
