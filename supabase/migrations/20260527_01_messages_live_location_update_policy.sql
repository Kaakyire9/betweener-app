alter table public.messages enable row level security;

drop policy if exists "Users can update sent live location messages" on public.messages;
create policy "Users can update sent live location messages"
on public.messages
for update
using (
  auth.uid() = sender_id
  and message_type = 'location'
)
with check (
  auth.uid() = sender_id
  and message_type = 'location'
);
