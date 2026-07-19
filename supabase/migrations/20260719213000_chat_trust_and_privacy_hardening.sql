-- Chat trust boundary hardening.
--
-- This migration is deliberately compatibility-first:
--   * one authoritative message INSERT policy replaces two permissive policies;
--   * only accepted matches can exchange user-authored messages;
--   * blocks are enforced in both directions at the database boundary;
--   * chat storage becomes private and object access is limited to participants;
--   * legacy two-segment storage paths remain readable through message ownership.

create or replace function public.can_users_chat(
  p_sender_user_id uuid,
  p_receiver_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select
    p_sender_user_id is not null
    and p_receiver_user_id is not null
    and p_sender_user_id <> p_receiver_user_id
    and exists (
      select 1
      from public.profiles sender_profile
      join public.profiles receiver_profile on true
      where sender_profile.user_id = p_sender_user_id
        and receiver_profile.user_id = p_receiver_user_id
        and sender_profile.deleted_at is null
        and receiver_profile.deleted_at is null
        and exists (
          select 1
          from public.matches match_row
          where match_row.status = 'ACCEPTED'::public.match_status
            and (
              (
                match_row.user1_id = sender_profile.id
                and match_row.user2_id = receiver_profile.id
              )
              or (
                match_row.user1_id = receiver_profile.id
                and match_row.user2_id = sender_profile.id
              )
              -- Preserve compatibility with any legacy rows that stored auth user ids.
              or (
                match_row.user1_id = p_sender_user_id
                and match_row.user2_id = p_receiver_user_id
              )
              or (
                match_row.user1_id = p_receiver_user_id
                and match_row.user2_id = p_sender_user_id
              )
            )
        )
        and not exists (
          select 1
          from public.blocks block_row
          where (
            block_row.blocker_id = p_sender_user_id
            and block_row.blocked_id = p_receiver_user_id
          ) or (
            block_row.blocker_id = p_receiver_user_id
            and block_row.blocked_id = p_sender_user_id
          )
        )
    );
$$;

revoke all on function public.can_users_chat(uuid, uuid) from public;
grant execute on function public.can_users_chat(uuid, uuid) to authenticated;
grant execute on function public.can_users_chat(uuid, uuid) to service_role;

drop policy if exists "Users can send messages" on public.messages;
drop policy if exists "messages_insert_own" on public.messages;
drop policy if exists "Authenticated matched users can send messages" on public.messages;

create policy "Authenticated matched users can send messages"
on public.messages
for insert
to authenticated
with check (
  auth.uid() = sender_id
  and public.can_users_chat(sender_id, receiver_id)
);

-- NOT VALID avoids blocking deployment on historical data while still enforcing
-- these limits for every new or updated row.
alter table public.messages
  drop constraint if exists messages_client_message_id_length;
alter table public.messages
  add constraint messages_client_message_id_length
  check (client_message_id is null or char_length(client_message_id) <= 160)
  not valid;

alter table public.messages
  drop constraint if exists messages_text_payload_size;
alter table public.messages
  add constraint messages_text_payload_size
  check (octet_length(text) <= 16384)
  not valid;

create or replace function public.can_access_chat_storage_object(
  p_bucket_id text,
  p_object_name text,
  p_user_id uuid default auth.uid()
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, storage, pg_catalog
as $$
declare
  v_parts text[];
  v_sender_id uuid;
  v_receiver_id uuid;
begin
  if p_user_id is null
     or p_bucket_id not in ('chat-media', 'voice-messages')
     or nullif(btrim(coalesce(p_object_name, '')), '') is null then
    return false;
  end if;

  -- Authenticated callers may only evaluate their own access. Service-role
  -- maintenance remains possible without turning this helper into an oracle.
  if auth.role() <> 'service_role' and p_user_id <> auth.uid() then
    return false;
  end if;

  v_parts := storage.foldername(p_object_name);

  -- New objects use sender/receiver/file. This permits authorization before the
  -- corresponding message row exists, while can_users_chat enforces match/block state.
  if cardinality(v_parts) >= 2
     and v_parts[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     and v_parts[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    v_sender_id := v_parts[1]::uuid;
    v_receiver_id := v_parts[2]::uuid;
    if p_user_id in (v_sender_id, v_receiver_id)
       and public.can_users_chat(v_sender_id, v_receiver_id) then
      return true;
    end if;
  end if;

  -- Existing objects used sender/file. Resolve those through the message row so
  -- old conversations remain available after the buckets become private.
  return exists (
    select 1
    from public.messages message_row
    where p_user_id in (message_row.sender_id, message_row.receiver_id)
      and (
        (p_bucket_id = 'voice-messages' and message_row.audio_path = p_object_name)
        or (
          p_bucket_id = 'chat-media'
          and (
            message_row.storage_path = p_object_name
            or message_row.encrypted_media_path = p_object_name
            or strpos(message_row.text, p_object_name) > 0
            or strpos(message_row.text, replace(p_object_name, ' ', '%20')) > 0
          )
        )
      )
  );
end;
$$;

revoke all on function public.can_access_chat_storage_object(text, text, uuid) from public;
grant execute on function public.can_access_chat_storage_object(text, text, uuid) to authenticated;
grant execute on function public.can_access_chat_storage_object(text, text, uuid) to service_role;

insert into storage.buckets (id, name, public)
values
  ('chat-media', 'chat-media', false),
  ('voice-messages', 'voice-messages', false)
on conflict (id) do update
set public = false;

-- Server-side ceilings complement client validation and prevent modified
-- clients from turning chat storage into an unbounded upload surface.
update storage.buckets
set file_size_limit = least(coalesce(file_size_limit, 104857600), 104857600)
where id = 'chat-media';

update storage.buckets
set file_size_limit = least(coalesce(file_size_limit, 26214400), 26214400)
where id = 'voice-messages';

drop policy if exists "Chat media read" on storage.objects;
drop policy if exists "Chat media upload" on storage.objects;
drop policy if exists "Chat media update" on storage.objects;
drop policy if exists "Chat media delete" on storage.objects;
drop policy if exists "voice messages read" on storage.objects;
drop policy if exists "voice messages upload" on storage.objects;
drop policy if exists "voice messages update" on storage.objects;
drop policy if exists "voice messages delete" on storage.objects;
drop policy if exists "Chat participants can read media" on storage.objects;
drop policy if exists "Chat participants can upload media" on storage.objects;
drop policy if exists "Chat senders can update media" on storage.objects;
drop policy if exists "Chat senders can delete media" on storage.objects;

create policy "Chat participants can read media"
on storage.objects
for select
to authenticated
using (public.can_access_chat_storage_object(bucket_id, name, auth.uid()));

create policy "Chat participants can upload media"
on storage.objects
for insert
to authenticated
with check (
  bucket_id in ('chat-media', 'voice-messages')
  and (storage.foldername(name))[1] = auth.uid()::text
  and public.can_access_chat_storage_object(bucket_id, name, auth.uid())
);

create policy "Chat senders can update media"
on storage.objects
for update
to authenticated
using (
  bucket_id in ('chat-media', 'voice-messages')
  and (storage.foldername(name))[1] = auth.uid()::text
  and public.can_access_chat_storage_object(bucket_id, name, auth.uid())
)
with check (
  bucket_id in ('chat-media', 'voice-messages')
  and (storage.foldername(name))[1] = auth.uid()::text
  and public.can_access_chat_storage_object(bucket_id, name, auth.uid())
);

create policy "Chat senders can delete media"
on storage.objects
for delete
to authenticated
using (
  bucket_id in ('chat-media', 'voice-messages')
  and (storage.foldername(name))[1] = auth.uid()::text
  and public.can_access_chat_storage_object(bucket_id, name, auth.uid())
);

comment on function public.can_users_chat(uuid, uuid) is
  'Authoritative direct-message eligibility: accepted match, active profiles and no block in either direction.';
comment on function public.can_access_chat_storage_object(text, text, uuid) is
  'Authorizes private chat-media and voice-message objects for conversation participants.';
