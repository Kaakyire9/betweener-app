create index if not exists idx_messages_sender_created_at_desc
  on public.messages (sender_id, created_at desc);

create index if not exists idx_messages_receiver_created_at_desc
  on public.messages (receiver_id, created_at desc);

create index if not exists idx_messages_receiver_unread_created_at_desc
  on public.messages (receiver_id, created_at desc)
  where is_read = false;
