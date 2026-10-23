-- Additive profile-media moderation contract for app 1.2.0.
-- This migration deliberately does not alter the 1.1.1 profile write trigger,
-- legacy profile buckets, RLS policies, or profile-guard-update function.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-media-staging-v1-2',
  'profile-media-staging-v1-2',
  false,
  15728640,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "v1.2 users stage own profile media" on storage.objects;
create policy "v1.2 users stage own profile media"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'profile-media-staging-v1-2'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "v1.2 users read own staged profile media" on storage.objects;
create policy "v1.2 users read own staged profile media"
on storage.objects for select to authenticated
using (
  bucket_id = 'profile-media-staging-v1-2'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "v1.2 users delete own staged profile media" on storage.objects;
create policy "v1.2 users delete own staged profile media"
on storage.objects for delete to authenticated
using (
  bucket_id = 'profile-media-staging-v1-2'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- No authenticated UPDATE policy: staged bytes are immutable. Clients upload
-- unique paths with upsert=false, and the service scans the exact downloaded bytes.

create table if not exists public.profile_media_guard_events_v1_2 (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_request_id text not null,
  slot text not null check (slot in ('avatar', 'gallery')),
  item_index integer not null default 0 check (item_index >= 0),
  decision text not null check (decision in ('ALLOW', 'REPLACE', 'RETRY_LATER')),
  reason_code text not null,
  categories text[] not null default '{}',
  risk_score numeric(5,4) not null default 0 check (risk_score between 0 and 1),
  sha256 text check (sha256 is null or sha256 ~ '^[a-f0-9]{64}$'),
  mime_type text,
  byte_size integer check (byte_size is null or byte_size > 0),
  provider text not null default 'unknown',
  provider_model text not null default 'unknown',
  provider_request_id text,
  failure_reason text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default timezone('utc', now()),
  unique (user_id, client_request_id, slot, item_index)
);

create index if not exists profile_media_guard_events_v1_2_recent_idx
  on public.profile_media_guard_events_v1_2(created_at desc);
create index if not exists profile_media_guard_events_v1_2_user_idx
  on public.profile_media_guard_events_v1_2(user_id, created_at desc);

alter table public.profile_media_guard_events_v1_2 enable row level security;
revoke all on table public.profile_media_guard_events_v1_2
  from public, anon, authenticated;
grant select, insert, update on table public.profile_media_guard_events_v1_2 to service_role;

create or replace function public.rpc_service_apply_profile_media_v1_2(
  p_user_id uuid,
  p_avatar_url text,
  p_hero_image_url text,
  p_photos text[],
  p_client_request_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  v_profile public.profiles%rowtype;
  v_url text;
  v_approved_prefix text := '/storage/v1/object/public/moderated-profile-media/'
    || p_user_id::text || '/';
  v_current_urls text[];
begin
  if auth.role() <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_user_id is null or nullif(btrim(coalesce(p_client_request_id, '')), '') is null then
    raise exception using errcode = '22023', message = 'PROFILE_MEDIA_REQUEST_INVALID';
  end if;
  if cardinality(coalesce(p_photos, '{}'::text[])) > 6 then
    raise exception using errcode = '22023', message = 'PROFILE_MEDIA_LIMIT_EXCEEDED';
  end if;

  select * into v_profile
  from public.profiles profile
  where profile.user_id = p_user_id and profile.deleted_at is null
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'PROFILE_NOT_FOUND';
  end if;

  v_current_urls := array_remove(array_cat(
    array[v_profile.avatar_url, v_profile.hero_image_url],
    coalesce(v_profile.photos, '{}'::text[])
  ), null);

  foreach v_url in array array_remove(array_cat(
    array[p_avatar_url, p_hero_image_url],
    coalesce(p_photos, '{}'::text[])
  ), null) loop
    if not (
      v_url = any(v_current_urls)
      or (v_url like 'https://%' and position(v_approved_prefix in v_url) > 0)
    ) then
      raise exception using errcode = '22023', message = 'PROFILE_MEDIA_URL_NOT_APPROVED';
    end if;
  end loop;

  perform set_config('app.profile_guard_write', 'on', true);
  update public.profiles
  set avatar_url = nullif(btrim(coalesce(p_avatar_url, '')), ''),
      hero_image_url = nullif(btrim(coalesce(p_hero_image_url, '')), ''),
      photos = coalesce(p_photos, '{}'::text[]),
      updated_at = timezone('utc', now())
  where id = v_profile.id;

  return jsonb_build_object(
    'ok', true,
    'profileId', v_profile.id,
    'avatarUrl', nullif(btrim(coalesce(p_avatar_url, '')), ''),
    'heroImageUrl', nullif(btrim(coalesce(p_hero_image_url, '')), ''),
    'photos', to_jsonb(coalesce(p_photos, '{}'::text[])),
    'clientRequestId', left(p_client_request_id, 160)
  );
end;
$$;

revoke all on function public.rpc_service_apply_profile_media_v1_2(
  uuid, text, text, text[], text
) from public, anon, authenticated;
grant execute on function public.rpc_service_apply_profile_media_v1_2(
  uuid, text, text, text[], text
) to service_role;

comment on function public.rpc_service_apply_profile_media_v1_2(
  uuid, text, text, text[], text
) is 'App 1.2 service-only atomic publication of already-moderated avatar/gallery media.';
