-- Keep Chemistry First realtime invalidations table-shape safe.
--
-- The original shared trigger used a SQL CASE containing both NEW.id and
-- NEW.conversation_id. Trigger records only expose columns from their source
-- table, so PostgreSQL could reject a conversation insert while resolving the
-- child-table field. Give parent and child rows dedicated trigger functions.

begin;

create or replace function public.bump_live_chemistry_conversation_update()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
begin
  insert into public.live_chemistry_updates(conversation_id, session_id, version)
  values(new.id, new.session_id, 1)
  on conflict(conversation_id) do update set
    session_id = excluded.session_id,
    version = public.live_chemistry_updates.version + 1,
    updated_at = timezone('utc', now());
  return new;
end;
$$;

create or replace function public.bump_live_chemistry_update()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_session_id uuid;
begin
  select conversation.session_id into v_session_id
  from public.live_chemistry_conversations conversation
  where conversation.id = new.conversation_id;

  if v_session_id is null then
    raise exception 'live_chemistry_conversation_not_found'
      using errcode = 'P0002';
  end if;

  insert into public.live_chemistry_updates(conversation_id, session_id, version)
  values(new.conversation_id, v_session_id, 1)
  on conflict(conversation_id) do update set
    session_id = excluded.session_id,
    version = public.live_chemistry_updates.version + 1,
    updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists live_chemistry_conversation_bump
on public.live_chemistry_conversations;

create trigger live_chemistry_conversation_bump
after insert or update on public.live_chemistry_conversations
for each row execute function public.bump_live_chemistry_conversation_update();

drop trigger if exists live_chemistry_readiness_bump
on public.live_chemistry_readiness;

create trigger live_chemistry_readiness_bump
after insert or update on public.live_chemistry_readiness
for each row execute function public.bump_live_chemistry_update();

revoke all on function public.bump_live_chemistry_conversation_update()
from public, anon, authenticated;
revoke all on function public.bump_live_chemistry_update()
from public, anon, authenticated;

comment on function public.bump_live_chemistry_conversation_update() is
  'Publishes a content-free Chemistry First invalidation from a conversation row.';
comment on function public.bump_live_chemistry_update() is
  'Publishes a content-free Chemistry First invalidation from a child row with conversation_id.';

commit;
