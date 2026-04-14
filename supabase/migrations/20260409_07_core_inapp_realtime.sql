-- Enable realtime for core in-app toast sources.
-- InAppToasts subscribes directly to these tables in the foreground.
-- Without publication membership, the listeners stay silent even though
-- push notifications and trigger-based alerts can still work.

alter table public.messages replica identity full;
alter table public.swipes replica identity full;
alter table public.matches replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'swipes'
  ) then
    alter publication supabase_realtime add table public.swipes;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'matches'
  ) then
    alter publication supabase_realtime add table public.matches;
  end if;
end $$;
