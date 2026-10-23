-- v1.2 staging blocker closure: immutable chat publication and profile-media provenance.

insert into storage.buckets (id, name, public, file_size_limit)
values ('chat-attachment-staging-v1-2', 'chat-attachment-staging-v1-2', false, 94371840)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

drop policy if exists "v1.2 members stage own chat attachments" on storage.objects;
create policy "v1.2 members stage own chat attachments"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'chat-attachment-staging-v1-2'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "v1.2 members read own staged chat attachments" on storage.objects;
create policy "v1.2 members read own staged chat attachments"
on storage.objects for select to authenticated
using (
  bucket_id = 'chat-attachment-staging-v1-2'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "v1.2 members delete own staged chat attachments" on storage.objects;
create policy "v1.2 members delete own staged chat attachments"
on storage.objects for delete to authenticated
using (
  bucket_id = 'chat-attachment-staging-v1-2'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Intentionally no authenticated UPDATE policy. A staged object is write-once.

create or replace function public.profile_media_reference_is_approved(
  p_user_id uuid,
  p_url text
)
returns boolean
language sql
immutable
set search_path = public, pg_catalog
as $$
  select p_url is null
    or btrim(p_url) = ''
    or (
      p_url like 'https://%'
      and position(
        '/storage/v1/object/public/moderated-profile-media/' || p_user_id::text || '/'
        in p_url
      ) > 0
    );
$$;

revoke all on function public.profile_media_reference_is_approved(uuid, text)
  from public, anon, authenticated;
grant execute on function public.profile_media_reference_is_approved(uuid, text)
  to service_role;

create or replace function public.enforce_profile_media_provenance_v1_2()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_url text;
  v_previous text[] := '{}'::text[];
  v_proposed text[];
begin
  if tg_op = 'UPDATE' and new.avatar_url is not distinct from old.avatar_url
     and new.hero_image_url is not distinct from old.hero_image_url
     and coalesce(new.photos, '{}'::text[]) is not distinct from coalesce(old.photos, '{}'::text[]) then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    v_previous := array_remove(array_cat(
      array[old.avatar_url, old.hero_image_url], coalesce(old.photos, '{}'::text[])
    ), null);
  end if;
  v_proposed := array_remove(array_cat(
    array[new.avatar_url, new.hero_image_url], coalesce(new.photos, '{}'::text[])
  ), null);

  foreach v_url in array v_proposed loop
    if not (v_url = any(v_previous)
      or public.profile_media_reference_is_approved(new.user_id, v_url)) then
      raise exception using
        errcode = '22023',
        message = 'PROFILE_MEDIA_GUARDED_CLIENT_REQUIRED';
    end if;
  end loop;
  return new;
end;
$$;

revoke all on function public.enforce_profile_media_provenance_v1_2()
  from public, anon, authenticated;

drop trigger if exists enforce_profile_media_provenance_v1_2 on public.profiles;
create trigger enforce_profile_media_provenance_v1_2
before insert or update of avatar_url, hero_image_url, photos on public.profiles
for each row execute function public.enforce_profile_media_provenance_v1_2();

comment on function public.enforce_profile_media_provenance_v1_2() is
  'Allows unchanged legacy profile media to remain visible, but accepts every new media reference only from the immutable moderated-profile-media publication path.';
