-- Server-side pre-encryption moderation for view-once chat images.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'view-once-moderation',
  'view-once-moderation',
  false,
  15728624,
  array['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Accept the common image/jpg alias when service code canonicalizes it to JPEG.
update storage.buckets
set allowed_mime_types = array['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']
where id = 'moderation-quarantine';

drop policy if exists "Members upload own view once moderation media" on storage.objects;
create policy "Members upload own view once moderation media"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'view-once-moderation'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Members read own view once moderation media" on storage.objects;
create policy "Members read own view once moderation media"
on storage.objects for select to authenticated
using (
  bucket_id = 'view-once-moderation'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Members update own view once moderation media" on storage.objects;
create policy "Members update own view once moderation media"
on storage.objects for update to authenticated
using (
  bucket_id = 'view-once-moderation'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'view-once-moderation'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Members delete own view once moderation media" on storage.objects;
create policy "Members delete own view once moderation media"
on storage.objects for delete to authenticated
using (
  bucket_id = 'view-once-moderation'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create table if not exists public.view_once_moderation_receipts (
  id uuid primary key default gen_random_uuid(),
  sender_user_id uuid not null references auth.users(id) on delete cascade,
  receiver_user_id uuid not null references auth.users(id) on delete cascade,
  client_message_id text not null,
  attachment_id uuid not null,
  original_name text,
  mime_type text not null,
  plaintext_sha256 text not null check (plaintext_sha256 ~ '^[a-f0-9]{64}$'),
  encrypted_storage_path text not null,
  encrypted_byte_size integer not null check (encrypted_byte_size > 0),
  encrypted_key_sender text not null,
  encrypted_key_receiver text not null,
  encrypted_key_nonce text not null,
  encrypted_media_nonce text not null,
  encryption_public_key text not null,
  moderation_provider text not null,
  moderation_model text not null,
  moderation_categories text[] not null default '{}',
  moderation_risk_score numeric(5,4) not null default 0
    check (moderation_risk_score between 0 and 1),
  created_at timestamptz not null default timezone('utc', now()),
  expires_at timestamptz not null default timezone('utc', now()) + interval '24 hours',
  finalized_at timestamptz,
  unique (sender_user_id, client_message_id, attachment_id),
  constraint view_once_moderation_receipt_participants_check
    check (sender_user_id <> receiver_user_id),
  constraint view_once_moderation_receipt_expiry_check
    check (expires_at > created_at)
);

create index if not exists view_once_moderation_receipts_expiry_idx
  on public.view_once_moderation_receipts(expires_at)
  where finalized_at is null;

alter table public.view_once_moderation_receipts enable row level security;
revoke all on table public.view_once_moderation_receipts from public, anon, authenticated;
grant select, insert, update, delete on table public.view_once_moderation_receipts to service_role;

create or replace function public.rpc_service_list_stale_view_once_moderation_objects(
  p_limit integer default 250
)
returns table(storage_path text)
language plpgsql
security definer
set search_path = public, storage, auth
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  return query
  select object_row.name
  from storage.objects object_row
  where object_row.bucket_id = 'view-once-moderation'
    and object_row.created_at < timezone('utc', now()) - interval '20 minutes'
  order by object_row.created_at
  limit greatest(1, least(coalesce(p_limit, 250), 1000));
end;
$$;

revoke all on function public.rpc_service_list_stale_view_once_moderation_objects(integer)
  from public, anon, authenticated;
grant execute on function public.rpc_service_list_stale_view_once_moderation_objects(integer)
  to service_role;

comment on table public.view_once_moderation_receipts is
  'Service-only receipts binding an approved plaintext image to ciphertext produced by the moderation service.';
