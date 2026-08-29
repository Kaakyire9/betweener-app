-- Keep the privacy-filtered Match Desk projection current when a member
-- changes introduction availability. Realtime receives only a content-free
-- version pulse; candidate identity remains RPC/capability filtered.

begin;

drop trigger if exists live_match_availability_insert_bump
on public.live_participants;

create trigger live_match_availability_insert_bump
after insert on public.live_participants
for each row
when (new.open_to_introductions)
execute function public.bump_live_match_round_update();

drop trigger if exists live_match_availability_update_bump
on public.live_participants;

create trigger live_match_availability_update_bump
after update of open_to_introductions on public.live_participants
for each row
when (old.open_to_introductions is distinct from new.open_to_introductions)
execute function public.bump_live_match_round_update();

commit;
