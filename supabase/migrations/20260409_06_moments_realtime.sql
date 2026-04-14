-- Enable realtime for Moments surfaces so in-app notifications can subscribe.
-- Push notifications already work via triggers, but postgres_changes listeners
-- need these tables in the supabase_realtime publication.

alter table public.moments replica identity full;
alter table public.moment_reactions replica identity full;
alter table public.moment_comments replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'moments'
  ) then
    alter publication supabase_realtime add table public.moments;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'moment_reactions'
  ) then
    alter publication supabase_realtime add table public.moment_reactions;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'moment_comments'
  ) then
    alter publication supabase_realtime add table public.moment_comments;
  end if;
end $$;
