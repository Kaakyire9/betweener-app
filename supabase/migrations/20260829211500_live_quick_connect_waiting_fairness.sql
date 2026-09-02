-- Keep FIFO fairness accurate when a participant recovers through heartbeat
-- instead of explicitly tapping Join pool again.

begin;

create or replace function public.prepare_live_quick_connect_waiting_entry()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
begin
  if new.state = 'waiting'
     and new.connection_state = 'connected'
     and (
       old.state is distinct from 'waiting'
       or old.connection_state is distinct from 'connected'
     ) then
    new.waiting_since := timezone('utc', now());
  end if;
  return new;
end;
$$;

revoke all on function public.prepare_live_quick_connect_waiting_entry()
from public, anon, authenticated;

drop trigger if exists live_quick_participant_prepare_waiting_entry
on public.live_quick_connect_participants;
create trigger live_quick_participant_prepare_waiting_entry
before update of state, connection_state on public.live_quick_connect_participants
for each row execute function public.prepare_live_quick_connect_waiting_entry();

create index if not exists live_quick_participant_ready_lease_idx
on public.live_quick_connect_participants(
  session_id, waiting_since, user_id, last_seen_at
)
where state = 'waiting' and connection_state = 'connected';

commit;
