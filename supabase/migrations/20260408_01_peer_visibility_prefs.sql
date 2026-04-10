-- Per-user peer visibility preferences.
-- Lets a member archive a conversation or remove another member's historical traces
-- from their own surfaces without deleting shared records globally.

create table if not exists public.peer_visibility_prefs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  peer_user_id uuid not null references auth.users(id) on delete cascade,
  archived boolean not null default false,
  hidden boolean not null default false,
  updated_at timestamptz not null default timezone('utc'::text, now()),
  constraint peer_visibility_prefs_user_peer_unique unique (user_id, peer_user_id),
  constraint peer_visibility_prefs_no_self check (user_id <> peer_user_id)
);

create index if not exists peer_visibility_prefs_user_idx
  on public.peer_visibility_prefs (user_id);

create index if not exists peer_visibility_prefs_user_hidden_idx
  on public.peer_visibility_prefs (user_id, hidden);

create index if not exists peer_visibility_prefs_user_archived_idx
  on public.peer_visibility_prefs (user_id, archived);

alter table public.peer_visibility_prefs enable row level security;

drop policy if exists "Users can view own peer visibility prefs" on public.peer_visibility_prefs;
create policy "Users can view own peer visibility prefs" on public.peer_visibility_prefs
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can insert own peer visibility prefs" on public.peer_visibility_prefs;
create policy "Users can insert own peer visibility prefs" on public.peer_visibility_prefs
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update own peer visibility prefs" on public.peer_visibility_prefs;
create policy "Users can update own peer visibility prefs" on public.peer_visibility_prefs
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own peer visibility prefs" on public.peer_visibility_prefs;
create policy "Users can delete own peer visibility prefs" on public.peer_visibility_prefs
for delete
to authenticated
using (auth.uid() = user_id);
