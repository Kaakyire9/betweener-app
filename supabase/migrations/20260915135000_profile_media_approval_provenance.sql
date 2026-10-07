-- Bind every newly accepted public profile-media URL to a service-owned
-- finalization record. A bucket-shaped URL alone is not proof of moderation.

create table if not exists public.approved_profile_media_objects (
  object_path text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  public_url text not null unique,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  byte_size bigint not null check (byte_size > 0 and byte_size <= 15728640),
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  approved_at timestamptz not null default timezone('utc', now())
);

alter table public.approved_profile_media_objects enable row level security;
revoke all on table public.approved_profile_media_objects
  from public, anon, authenticated;
grant select, insert, delete on table public.approved_profile_media_objects
  to service_role;

create or replace function public.rpc_service_register_approved_profile_media(
  p_user_id uuid,
  p_object_path text,
  p_public_url text,
  p_sha256 text,
  p_byte_size bigint,
  p_mime_type text
)
returns boolean
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  v_existing public.approved_profile_media_objects%rowtype;
  v_extension text;
begin
  if auth.role() <> 'service_role'
     and not (session_user = 'postgres' and current_user = 'postgres') then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;
  if p_user_id is null
     or p_sha256 !~ '^[0-9a-f]{64}$'
     or p_byte_size <= 0 or p_byte_size > 15728640
     or p_mime_type not in ('image/jpeg', 'image/png', 'image/webp') then
    raise exception using errcode = '22023', message = 'INVALID_APPROVED_PROFILE_MEDIA';
  end if;
  v_extension := case p_mime_type
    when 'image/png' then 'png'
    when 'image/webp' then 'webp'
    else 'jpg'
  end;
  if p_object_path <> p_user_id::text || '/' || p_sha256 || '.' || v_extension
     or p_public_url not like
       '%/storage/v1/object/public/moderated-profile-media/' || p_object_path then
    raise exception using errcode = '22023', message = 'INVALID_APPROVED_PROFILE_MEDIA';
  end if;

  select * into v_existing
  from public.approved_profile_media_objects approved
  where approved.object_path = p_object_path;
  if found then
    if v_existing.user_id <> p_user_id
       or v_existing.public_url <> p_public_url
       or v_existing.sha256 <> p_sha256
       or v_existing.byte_size <> p_byte_size
       or v_existing.mime_type <> p_mime_type then
      raise exception using errcode = '23505', message = 'APPROVED_PROFILE_MEDIA_CONFLICT';
    end if;
    return true;
  end if;

  insert into public.approved_profile_media_objects(
    object_path, user_id, public_url, sha256, byte_size, mime_type
  ) values (
    p_object_path, p_user_id, p_public_url, p_sha256, p_byte_size, p_mime_type
  );
  return true;
end;
$$;

revoke all on function public.rpc_service_register_approved_profile_media(
  uuid, text, text, text, bigint, text
) from public, anon, authenticated;
grant execute on function public.rpc_service_register_approved_profile_media(
  uuid, text, text, text, bigint, text
) to service_role;

create or replace function public.profile_media_reference_is_approved(
  p_user_id uuid,
  p_url text
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select p_url is null
    or btrim(p_url) = ''
    or exists (
      select 1
      from public.approved_profile_media_objects approved
      where approved.user_id = p_user_id
        and approved.public_url = p_url
    );
$$;

revoke all on function public.profile_media_reference_is_approved(uuid, text)
  from public, anon, authenticated;
grant execute on function public.profile_media_reference_is_approved(uuid, text)
  to service_role;

comment on table public.approved_profile_media_objects is
  'Service-owned provenance registry binding approved public profile URLs to immutable content-addressed media.';
