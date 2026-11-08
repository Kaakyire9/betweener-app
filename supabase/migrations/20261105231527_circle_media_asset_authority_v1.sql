begin;

create table if not exists public.circle_media_assets (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references public.circles(id) on delete cascade,
  uploader_profile_id uuid references public.profiles(id) on delete set null,
  uploader_user_id uuid references auth.users(id) on delete set null,
  pulse_item_id uuid unique references public.circle_pulse_items(id) on delete set null,
  bucket_id text not null default 'circle-pulse-media',
  object_path text not null unique,
  poster_object_path text,
  poster_byte_size bigint,
  media_type text not null,
  mime_type text not null,
  byte_size bigint,
  width integer,
  height integer,
  duration_ms integer,
  status text not null default 'draft',
  expires_at timestamptz,
  published_at timestamptz,
  archived_at timestamptz,
  purge_after timestamptz,
  deleted_at timestamptz,
  legacy_imported_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint circle_media_assets_bucket_valid check (bucket_id = 'circle-pulse-media'),
  constraint circle_media_assets_media_type_valid check (media_type in ('image', 'video')),
  constraint circle_media_assets_mime_type_valid check (
    mime_type in ('image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime')
  ),
  constraint circle_media_assets_status_valid check (
    status in ('draft', 'ready', 'published', 'quarantined', 'rejected', 'archived', 'purge_pending', 'deleted')
  ),
  constraint circle_media_assets_size_valid check (byte_size is null or byte_size > 0),
  constraint circle_media_assets_poster_size_valid check (poster_byte_size is null or poster_byte_size > 0),
  constraint circle_media_assets_poster_path_valid check (
    (media_type = 'image' and poster_object_path is null)
    or (media_type = 'video' and poster_object_path = circle_id::text || '/' || id::text || '/poster.jpg')
    or (legacy_imported_at is not null and media_type = 'video' and poster_object_path is null)
  ),
  constraint circle_media_assets_dimensions_valid check (
    (width is null or width > 0) and (height is null or height > 0)
  ),
  constraint circle_media_assets_duration_valid check (duration_ms is null or duration_ms >= 0),
  constraint circle_media_assets_path_valid check (
    object_path = circle_id::text || '/' || id::text || '/source.' ||
      case mime_type
        when 'image/jpeg' then 'jpg'
        when 'image/png' then 'png'
        when 'image/webp' then 'webp'
        when 'video/quicktime' then 'mov'
        else 'mp4'
      end
    or (
      legacy_imported_at is not null
      and object_path !~* '^https?://'
      and split_part(object_path, '/', 1) = circle_id::text
    )
  ),
  constraint circle_media_assets_media_mime_match check (
    (media_type = 'image' and mime_type like 'image/%') or
    (media_type = 'video' and mime_type like 'video/%')
  )
);

create index if not exists circle_media_assets_circle_status_idx
  on public.circle_media_assets(circle_id, status, created_at desc);
create index if not exists circle_media_assets_uploader_idx
  on public.circle_media_assets(uploader_user_id, created_at desc);
create index if not exists circle_media_assets_lifecycle_idx
  on public.circle_media_assets(status, expires_at, purge_after)
  where status in ('published', 'archived', 'purge_pending');

alter table public.circle_media_assets enable row level security;
revoke all on table public.circle_media_assets from public, anon, authenticated;
grant all on table public.circle_media_assets to service_role;

alter table public.circle_pulse_items
  add column if not exists media_asset_id uuid references public.circle_media_assets(id) on delete restrict;

create unique index if not exists circle_pulse_items_media_asset_unique_idx
  on public.circle_pulse_items(media_asset_id)
  where media_asset_id is not null;

-- Preserve valid legacy Storage-backed media while removing arbitrary and
-- cross-Circle URLs from the visible Pulse before the guard becomes active.
insert into public.circle_media_assets (
  id,
  circle_id,
  uploader_profile_id,
  uploader_user_id,
  pulse_item_id,
  object_path,
  media_type,
  mime_type,
  byte_size,
  status,
  expires_at,
  published_at,
  legacy_imported_at,
  created_at,
  updated_at
)
select
  gen_random_uuid(),
  item.circle_id,
  item.created_by_profile_id,
  item.created_by_user_id,
  item.id,
  object.name,
  item.media_type,
  case
    when item.media_type = 'video' and lower(object.name) like '%.mov' then 'video/quicktime'
    when item.media_type = 'video' then 'video/mp4'
    when lower(object.name) like '%.png' then 'image/png'
    when lower(object.name) like '%.webp' then 'image/webp'
    else 'image/jpeg'
  end,
  case
    when coalesce(object.metadata->>'size', '') ~ '^[0-9]+$'
      then (object.metadata->>'size')::bigint
    else null
  end,
  'published',
  item.expires_at,
  coalesce(item.starts_at, item.created_at),
  timezone('utc', now()),
  item.created_at,
  timezone('utc', now())
from public.circle_pulse_items item
join storage.objects object
  on object.bucket_id = 'circle-pulse-media'
 and object.name = item.media_url
where item.item_type = 'media'
  and item.moment_id is null
  and item.media_asset_id is null
  and item.created_by_profile_id is not null
  and item.created_by_user_id is not null
  and item.media_type in ('image', 'video')
  and item.media_url !~* '^https?://'
  and split_part(object.name, '/', 1) = item.circle_id::text
on conflict (object_path) do nothing;

update public.circle_pulse_items item
set media_asset_id = asset.id,
    media_url = asset.object_path,
    image_url = case when asset.media_type = 'image' then asset.object_path else null end,
    media_type = asset.media_type,
    updated_at = timezone('utc', now())
from public.circle_media_assets asset
where asset.pulse_item_id = item.id
  and item.media_asset_id is null;

update public.circle_pulse_items
set status = 'archived',
    updated_at = timezone('utc', now())
where item_type = 'media'
  and moment_id is null
  and media_asset_id is null
  and status <> 'archived';

alter table public.circle_pulse_items
  drop constraint if exists circle_pulse_items_source_valid;

alter table public.circle_pulse_items
  add constraint circle_pulse_items_source_valid check (
    (item_type = 'prompt' and prompt_id is not null and gathering_id is null and moment_id is null and love_seat_id is null and media_asset_id is null)
    or (item_type = 'gathering' and gathering_id is not null and prompt_id is null and moment_id is null and love_seat_id is null and media_asset_id is null)
    or (item_type = 'host_note' and prompt_id is null and gathering_id is null and moment_id is null and love_seat_id is null and media_asset_id is null and nullif(btrim(coalesce(body, '')), '') is not null)
    or (item_type = 'media' and prompt_id is null and gathering_id is null and love_seat_id is null and ((moment_id is not null and media_asset_id is null) or (moment_id is null and media_asset_id is not null)))
    or (item_type = 'love_seat' and love_seat_id is not null and prompt_id is null and gathering_id is null and moment_id is null and media_asset_id is null)
    or (item_type = 'welcome' and prompt_id is null and gathering_id is null and moment_id is null and love_seat_id is null and media_asset_id is null)
  );

create or replace function private.circle_media_extension(p_mime_type text)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select case p_mime_type
    when 'image/jpeg' then 'jpg'
    when 'image/png' then 'png'
    when 'image/webp' then 'webp'
    when 'video/mp4' then 'mp4'
    when 'video/quicktime' then 'mov'
    else null
  end;
$$;

create or replace function private.create_circle_media_asset_draft(
  p_circle_id uuid,
  p_actor_profile_id uuid,
  p_media_type text,
  p_mime_type text,
  p_expected_byte_size bigint default null,
  p_width integer default null,
  p_height integer default null,
  p_duration_ms integer default null
)
returns table(asset_id uuid, bucket_id text, object_path text, poster_object_path text, max_byte_size bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_asset_id uuid := gen_random_uuid();
  v_media_type text := lower(btrim(coalesce(p_media_type, '')));
  v_mime_type text := lower(btrim(coalesce(p_mime_type, '')));
  v_extension text;
  v_max_byte_size bigint;
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.profiles profile
    where profile.id = p_actor_profile_id
      and profile.user_id = auth.uid()
      and profile.deleted_at is null
  ) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  if not public.is_circle_member(p_circle_id, auth.uid())
     and not public.is_circle_owner(p_circle_id, auth.uid()) then
    raise exception 'circle_membership_required' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.circles circle
    where circle.id = p_circle_id and circle.archived_at is null
  ) then
    raise exception 'circle_not_found';
  end if;

  v_extension := private.circle_media_extension(v_mime_type);
  if v_media_type not in ('image', 'video')
     or v_extension is null
     or (v_media_type = 'image' and v_mime_type not like 'image/%')
     or (v_media_type = 'video' and v_mime_type not like 'video/%') then
    raise exception 'unsupported_circle_media_type';
  end if;

  v_max_byte_size := case when v_media_type = 'video' then 26214400 else 8388608 end;
  if p_expected_byte_size is not null
     and (p_expected_byte_size <= 0 or p_expected_byte_size > v_max_byte_size) then
    raise exception 'circle_media_file_too_large';
  end if;
  if p_width is not null and p_width <= 0 then raise exception 'invalid_media_dimensions'; end if;
  if p_height is not null and p_height <= 0 then raise exception 'invalid_media_dimensions'; end if;
  if p_duration_ms is not null and p_duration_ms < 0 then raise exception 'invalid_media_duration'; end if;
  if v_media_type = 'video' and p_duration_ms is not null and p_duration_ms > 60000 then
    raise exception 'circle_media_video_too_long';
  end if;

  insert into public.circle_media_assets (
    id,
    circle_id,
    uploader_profile_id,
    uploader_user_id,
    object_path,
    poster_object_path,
    media_type,
    mime_type,
    byte_size,
    width,
    height,
    duration_ms
  ) values (
    v_asset_id,
    p_circle_id,
    p_actor_profile_id,
    auth.uid(),
    p_circle_id::text || '/' || v_asset_id::text || '/source.' || v_extension,
    case when v_media_type = 'video' then p_circle_id::text || '/' || v_asset_id::text || '/poster.jpg' else null end,
    v_media_type,
    v_mime_type,
    p_expected_byte_size,
    p_width,
    p_height,
    p_duration_ms
  );

  return query
  select v_asset_id, 'circle-pulse-media'::text,
    p_circle_id::text || '/' || v_asset_id::text || '/source.' || v_extension,
    case when v_media_type = 'video' then p_circle_id::text || '/' || v_asset_id::text || '/poster.jpg' else null end,
    v_max_byte_size;
end;
$$;

create or replace function private.finalize_circle_media_asset(p_asset_id uuid)
returns public.circle_media_assets
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_asset public.circle_media_assets%rowtype;
  v_object storage.objects%rowtype;
  v_poster storage.objects%rowtype;
  v_actual_size bigint;
  v_poster_size bigint;
  v_actual_mime text;
  v_max_byte_size bigint;
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  select * into v_asset
  from public.circle_media_assets asset
  where asset.id = p_asset_id
  for update;

  if v_asset.id is null then raise exception 'circle_media_asset_not_found'; end if;
  if v_asset.uploader_user_id <> auth.uid() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if not public.is_circle_member(v_asset.circle_id, auth.uid())
     and not public.is_circle_owner(v_asset.circle_id, auth.uid()) then
    raise exception 'circle_membership_required' using errcode = '42501';
  end if;
  if v_asset.status = 'ready' then return v_asset; end if;
  if v_asset.status <> 'draft' then raise exception 'circle_media_asset_not_draft'; end if;

  select * into v_object
  from storage.objects object
  where object.bucket_id = v_asset.bucket_id
    and object.name = v_asset.object_path
  limit 1;

  if v_object.id is null then raise exception 'circle_media_upload_missing'; end if;
  if coalesce(v_object.owner_id, '') <> auth.uid()::text then
    raise exception 'circle_media_upload_owner_mismatch' using errcode = '42501';
  end if;

  v_actual_size := case
    when coalesce(v_object.metadata->>'size', '') ~ '^[0-9]+$'
      then (v_object.metadata->>'size')::bigint
    else null
  end;
  v_actual_mime := lower(coalesce(nullif(v_object.metadata->>'mimetype', ''), v_asset.mime_type));
  v_max_byte_size := case when v_asset.media_type = 'video' then 26214400 else 8388608 end;

  if v_actual_size is null or v_actual_size <= 0 or v_actual_size > v_max_byte_size then
    raise exception 'circle_media_file_size_invalid';
  end if;
  if v_actual_mime <> v_asset.mime_type then
    raise exception 'circle_media_mime_mismatch';
  end if;
  if v_asset.byte_size is not null and v_asset.byte_size <> v_actual_size then
    raise exception 'circle_media_size_mismatch';
  end if;

  if v_asset.media_type = 'video' then
    select * into v_poster
    from storage.objects object
    where object.bucket_id = v_asset.bucket_id
      and object.name = v_asset.poster_object_path
    limit 1;
    if v_poster.id is null then raise exception 'circle_media_poster_missing'; end if;
    if coalesce(v_poster.owner_id, '') <> auth.uid()::text then
      raise exception 'circle_media_poster_owner_mismatch' using errcode = '42501';
    end if;
    v_poster_size := case
      when coalesce(v_poster.metadata->>'size', '') ~ '^[0-9]+$'
        then (v_poster.metadata->>'size')::bigint
      else null
    end;
    if v_poster_size is null or v_poster_size <= 0 or v_poster_size > 2097152 then
      raise exception 'circle_media_poster_size_invalid';
    end if;
    if lower(coalesce(v_poster.metadata->>'mimetype', '')) <> 'image/jpeg' then
      raise exception 'circle_media_poster_mime_invalid';
    end if;
  end if;

  update public.circle_media_assets
  set byte_size = v_actual_size,
      poster_byte_size = v_poster_size,
      status = 'ready',
      updated_at = timezone('utc', now())
  where id = p_asset_id
  returning * into v_asset;

  return v_asset;
end;
$$;

create or replace function private.publish_circle_media_asset(
  p_asset_id uuid,
  p_actor_profile_id uuid,
  p_title text,
  p_subtitle text default null,
  p_body text default null,
  p_priority integer default 0,
  p_starts_at timestamptz default null,
  p_expires_at timestamptz default null
)
returns public.circle_pulse_items
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_asset public.circle_media_assets%rowtype;
  v_item public.circle_pulse_items%rowtype;
  v_title text := nullif(btrim(coalesce(p_title, '')), '');
  v_expires_at timestamptz := coalesce(p_expires_at, timezone('utc', now()) + interval '90 days');
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;
  if v_title is null or char_length(v_title) > 140 then
    raise exception 'invalid_media_title';
  end if;
  if coalesce(p_starts_at, timezone('utc', now())) >= v_expires_at then
    raise exception 'invalid_expiry';
  end if;
  if not exists (
    select 1 from public.profiles profile
    where profile.id = p_actor_profile_id
      and profile.user_id = auth.uid()
      and profile.deleted_at is null
  ) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select * into v_asset
  from public.circle_media_assets asset
  where asset.id = p_asset_id
  for update;

  if v_asset.id is null then raise exception 'circle_media_asset_not_found'; end if;
  if v_asset.uploader_user_id <> auth.uid() or v_asset.uploader_profile_id <> p_actor_profile_id then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if not public.can_manage_circle_pulse(v_asset.circle_id, auth.uid()) then
    raise exception 'host_required' using errcode = '42501';
  end if;
  if v_asset.status = 'published' and v_asset.pulse_item_id is not null then
    select * into v_item from public.circle_pulse_items where id = v_asset.pulse_item_id;
    if v_item.id is not null then return v_item; end if;
  end if;
  if v_asset.status <> 'ready' then raise exception 'circle_media_asset_not_ready'; end if;

  insert into public.circle_pulse_items (
    circle_id,
    item_type,
    title,
    subtitle,
    body,
    image_url,
    media_url,
    media_type,
    media_asset_id,
    status,
    priority,
    starts_at,
    expires_at,
    created_by_profile_id,
    created_by_user_id
  ) values (
    v_asset.circle_id,
    'media',
    v_title,
    nullif(btrim(coalesce(p_subtitle, '')), ''),
    nullif(btrim(coalesce(p_body, '')), ''),
    case when v_asset.media_type = 'image' then v_asset.object_path else v_asset.poster_object_path end,
    v_asset.object_path,
    v_asset.media_type,
    v_asset.id,
    'active',
    coalesce(p_priority, 0),
    coalesce(p_starts_at, timezone('utc', now())),
    v_expires_at,
    p_actor_profile_id,
    auth.uid()
  ) returning * into v_item;

  update public.circle_media_assets
  set status = 'published',
      pulse_item_id = v_item.id,
      published_at = timezone('utc', now()),
      expires_at = v_expires_at,
      updated_at = timezone('utc', now())
  where id = v_asset.id;

  return v_item;
end;
$$;

create or replace function private.abandon_circle_media_asset(p_asset_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_asset public.circle_media_assets%rowtype;
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;
  select * into v_asset
  from public.circle_media_assets asset
  where asset.id = p_asset_id
  for update;
  if v_asset.id is null then return false; end if;
  if v_asset.uploader_user_id <> auth.uid() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if v_asset.status not in ('draft', 'ready') then return false; end if;
  update public.circle_media_assets
  set status = 'purge_pending',
      purge_after = timezone('utc', now()),
      updated_at = timezone('utc', now())
  where id = p_asset_id;
  return true;
end;
$$;

create or replace function private.guard_circle_pulse_media_asset()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_asset public.circle_media_assets%rowtype;
begin
  if new.item_type <> 'media' then
    new.media_asset_id := null;
    return new;
  end if;

  if new.moment_id is not null then
    new.media_asset_id := null;
    return new;
  end if;

  if new.media_asset_id is null then
    raise exception 'direct_media_requires_asset';
  end if;

  select * into v_asset
  from public.circle_media_assets asset
  where asset.id = new.media_asset_id;

  if v_asset.id is null
     or v_asset.circle_id <> new.circle_id
     or v_asset.status not in ('ready', 'published') then
    raise exception 'circle_media_asset_unavailable';
  end if;

  new.media_url := v_asset.object_path;
  new.image_url := case when v_asset.media_type = 'image' then v_asset.object_path else v_asset.poster_object_path end;
  new.media_type := v_asset.media_type;
  return new;
end;
$$;

drop trigger if exists circle_pulse_media_asset_guard on public.circle_pulse_items;
create trigger circle_pulse_media_asset_guard
before insert or update of item_type, moment_id, media_asset_id, media_url, image_url, media_type, circle_id
on public.circle_pulse_items
for each row execute function private.guard_circle_pulse_media_asset();

create or replace function private.sync_circle_media_asset_archive()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.media_asset_id is not null and new.status in ('archived', 'expired')
     and old.status is distinct from new.status then
    update public.circle_media_assets
    set status = 'archived',
        archived_at = coalesce(archived_at, timezone('utc', now())),
        purge_after = coalesce(purge_after, timezone('utc', now()) + interval '30 days'),
        updated_at = timezone('utc', now())
    where id = new.media_asset_id and status = 'published';
  end if;
  return new;
end;
$$;

drop trigger if exists circle_pulse_media_asset_archive_sync on public.circle_pulse_items;
create trigger circle_pulse_media_asset_archive_sync
after update of status on public.circle_pulse_items
for each row execute function private.sync_circle_media_asset_archive();

create or replace function public.rpc_create_circle_media_asset_draft(
  p_circle_id uuid,
  p_actor_profile_id uuid,
  p_media_type text,
  p_mime_type text,
  p_expected_byte_size bigint default null,
  p_width integer default null,
  p_height integer default null,
  p_duration_ms integer default null
)
returns table(asset_id uuid, bucket_id text, object_path text, poster_object_path text, max_byte_size bigint)
language sql
security definer
set search_path = ''
as $$
  select * from private.create_circle_media_asset_draft(
    p_circle_id,
    p_actor_profile_id,
    p_media_type,
    p_mime_type,
    p_expected_byte_size,
    p_width,
    p_height,
    p_duration_ms
  );
$$;

create or replace function public.rpc_finalize_circle_media_asset(p_asset_id uuid)
returns public.circle_media_assets
language sql
security definer
set search_path = ''
as $$
  select private.finalize_circle_media_asset(p_asset_id);
$$;

create or replace function public.rpc_publish_circle_media_asset(
  p_asset_id uuid,
  p_actor_profile_id uuid,
  p_title text,
  p_subtitle text default null,
  p_body text default null,
  p_priority integer default 0,
  p_starts_at timestamptz default null,
  p_expires_at timestamptz default null
)
returns public.circle_pulse_items
language sql
security definer
set search_path = ''
as $$
  select private.publish_circle_media_asset(
    p_asset_id,
    p_actor_profile_id,
    p_title,
    p_subtitle,
    p_body,
    p_priority,
    p_starts_at,
    p_expires_at
  );
$$;

create or replace function public.rpc_abandon_circle_media_asset(p_asset_id uuid)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select private.abandon_circle_media_asset(p_asset_id);
$$;

revoke all on function private.circle_media_extension(text) from public, anon, authenticated;
revoke all on function private.create_circle_media_asset_draft(uuid, uuid, text, text, bigint, integer, integer, integer) from public, anon;
revoke all on function private.finalize_circle_media_asset(uuid) from public, anon;
revoke all on function private.publish_circle_media_asset(uuid, uuid, text, text, text, integer, timestamptz, timestamptz) from public, anon;
revoke all on function private.abandon_circle_media_asset(uuid) from public, anon;
revoke all on function private.guard_circle_pulse_media_asset() from public, anon, authenticated;
revoke all on function private.sync_circle_media_asset_archive() from public, anon, authenticated;
grant usage on schema private to authenticated, service_role;
grant execute on function private.create_circle_media_asset_draft(uuid, uuid, text, text, bigint, integer, integer, integer) to authenticated, service_role;
grant execute on function private.finalize_circle_media_asset(uuid) to authenticated, service_role;
grant execute on function private.publish_circle_media_asset(uuid, uuid, text, text, text, integer, timestamptz, timestamptz) to authenticated, service_role;
grant execute on function private.abandon_circle_media_asset(uuid) to authenticated, service_role;

revoke all on function public.rpc_create_circle_media_asset_draft(uuid, uuid, text, text, bigint, integer, integer, integer) from public, anon;
revoke all on function public.rpc_finalize_circle_media_asset(uuid) from public, anon;
revoke all on function public.rpc_publish_circle_media_asset(uuid, uuid, text, text, text, integer, timestamptz, timestamptz) from public, anon;
revoke all on function public.rpc_abandon_circle_media_asset(uuid) from public, anon;
grant execute on function public.rpc_create_circle_media_asset_draft(uuid, uuid, text, text, bigint, integer, integer, integer) to authenticated, service_role;
grant execute on function public.rpc_finalize_circle_media_asset(uuid) to authenticated, service_role;
grant execute on function public.rpc_publish_circle_media_asset(uuid, uuid, text, text, text, integer, timestamptz, timestamptz) to authenticated, service_role;
grant execute on function public.rpc_abandon_circle_media_asset(uuid) to authenticated, service_role;

-- Pulse is a member-only surface. Remove the inherited/default anonymous
-- execution path from every existing Pulse RPC, including legacy writers.
do $$
declare
  v_function record;
begin
  for v_function in
    select procedure.oid::regprocedure as signature
    from pg_proc procedure
    join pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname like 'rpc_%circle_pulse%'
  loop
    execute format('revoke execute on function %s from public', v_function.signature);
    execute format('revoke execute on function %s from anon', v_function.signature);
    execute format('grant execute on function %s to authenticated', v_function.signature);
    execute format('grant execute on function %s to service_role', v_function.signature);
  end loop;
end;
$$;

commit;
