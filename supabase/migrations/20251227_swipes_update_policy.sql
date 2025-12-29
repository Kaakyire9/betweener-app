-- Allow users to update their own swipes (needed for upsert to work under RLS)
create policy "Users can update swipes"
on public.swipes
for update
to authenticated
using (
  auth.uid() in (select user_id from profiles where id = swiper_id)
)
with check (
  auth.uid() in (select user_id from profiles where id = swiper_id)
);
