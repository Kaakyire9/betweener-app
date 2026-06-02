drop policy if exists "Circle Pulse media upload" on storage.objects;
create policy "Circle Pulse media upload"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'circle-pulse-media'
  and (storage.foldername(name))[1] is not null
  and public.can_manage_circle_pulse(
    ((storage.foldername(name))[1])::uuid,
    auth.uid()
  )
);

drop policy if exists "Circle Pulse media update" on storage.objects;
create policy "Circle Pulse media update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'circle-pulse-media'
  and (storage.foldername(name))[1] is not null
  and public.can_manage_circle_pulse(
    ((storage.foldername(name))[1])::uuid,
    auth.uid()
  )
)
with check (
  bucket_id = 'circle-pulse-media'
  and (storage.foldername(name))[1] is not null
  and public.can_manage_circle_pulse(
    ((storage.foldername(name))[1])::uuid,
    auth.uid()
  )
);

drop policy if exists "Circle Pulse media delete" on storage.objects;
create policy "Circle Pulse media delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'circle-pulse-media'
  and (storage.foldername(name))[1] is not null
  and public.can_manage_circle_pulse(
    ((storage.foldername(name))[1])::uuid,
    auth.uid()
  )
);

drop policy if exists "Circle Pulse media view" on storage.objects;
create policy "Circle Pulse media view"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'circle-pulse-media'
  and (storage.foldername(name))[1] is not null
  and (
    public.can_manage_circle_pulse(
      ((storage.foldername(name))[1])::uuid,
      auth.uid()
    )
    or public.is_circle_member(
      ((storage.foldername(name))[1])::uuid,
      auth.uid()
    )
    or public.is_circle_owner(
      ((storage.foldername(name))[1])::uuid,
      auth.uid()
    )
  )
);
