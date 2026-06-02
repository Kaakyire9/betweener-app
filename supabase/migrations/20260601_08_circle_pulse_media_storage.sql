insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'circle-pulse-media',
  'circle-pulse-media',
  false,
  52428800,
  array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Circle Pulse media upload" on storage.objects;
create policy "Circle Pulse media upload"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'circle-pulse-media'
  and exists (
    select 1
    from public.circles c
    where c.id::text = (storage.foldername(name))[1]
      and public.can_manage_circle_pulse(c.id, auth.uid())
  )
);

drop policy if exists "Circle Pulse media update" on storage.objects;
create policy "Circle Pulse media update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'circle-pulse-media'
  and exists (
    select 1
    from public.circles c
    where c.id::text = (storage.foldername(name))[1]
      and public.can_manage_circle_pulse(c.id, auth.uid())
  )
)
with check (
  bucket_id = 'circle-pulse-media'
  and exists (
    select 1
    from public.circles c
    where c.id::text = (storage.foldername(name))[1]
      and public.can_manage_circle_pulse(c.id, auth.uid())
  )
);

drop policy if exists "Circle Pulse media delete" on storage.objects;
create policy "Circle Pulse media delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'circle-pulse-media'
  and exists (
    select 1
    from public.circles c
    where c.id::text = (storage.foldername(name))[1]
      and public.can_manage_circle_pulse(c.id, auth.uid())
  )
);

drop policy if exists "Circle Pulse media view" on storage.objects;
create policy "Circle Pulse media view"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'circle-pulse-media'
  and exists (
    select 1
    from public.circles c
    where c.id::text = (storage.foldername(name))[1]
      and (
        public.can_manage_circle_pulse(c.id, auth.uid())
        or public.is_circle_member(c.id, auth.uid())
        or public.is_circle_owner(c.id, auth.uid())
      )
  )
);
