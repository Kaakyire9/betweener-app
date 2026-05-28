create table if not exists public.chat_typing_state (
  user_id uuid not null references auth.users(id) on delete cascade,
  peer_user_id uuid not null references auth.users(id) on delete cascade,
  typing_until timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, peer_user_id),
  constraint chat_typing_state_not_self check (user_id <> peer_user_id)
);

create index if not exists idx_chat_typing_state_peer_user_id
  on public.chat_typing_state (peer_user_id, updated_at desc);

alter table public.chat_typing_state enable row level security;

drop policy if exists "chat_typing_state_select_participants" on public.chat_typing_state;
create policy "chat_typing_state_select_participants"
on public.chat_typing_state
for select
to authenticated
using (user_id = auth.uid() or peer_user_id = auth.uid());

drop policy if exists "chat_typing_state_insert_owner" on public.chat_typing_state;
create policy "chat_typing_state_insert_owner"
on public.chat_typing_state
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "chat_typing_state_update_owner" on public.chat_typing_state;
create policy "chat_typing_state_update_owner"
on public.chat_typing_state
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "chat_typing_state_delete_owner" on public.chat_typing_state;
create policy "chat_typing_state_delete_owner"
on public.chat_typing_state
for delete
to authenticated
using (user_id = auth.uid());

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.chat_typing_state;
    exception when duplicate_object then null;
    end;
  end if;
end;
$$;
