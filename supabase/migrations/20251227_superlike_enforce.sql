-- Allow users to update their own superlikes_left (if not already covered by existing policies)
create policy "Profiles update superlikes"
on public.profiles
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- RPC to atomically decrement superlikes_left (returns the new count)
create or replace function public.decrement_superlike(p_profile_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  new_count integer;
begin
  update public.profiles
  set superlikes_left = superlikes_left - 1,
      updated_at = now()
  where id = p_profile_id
    and superlikes_left > 0
  returning superlikes_left into new_count;

  if new_count is null then
    raise exception 'NO_SUPERLIKES';
  end if;

  return new_count;
end;
$$;

grant execute on function public.decrement_superlike(uuid) to authenticated;

-- Ensure mutual match logic also runs on swipe updates (upserts)
drop trigger if exists check_for_match_update on public.swipes;
create trigger check_for_match_update
after update on public.swipes
for each row
execute function public.handle_mutual_swipe();
