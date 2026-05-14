-- Repair accepted Intent relationships that were created before
-- rpc_decide_intent_request became authoritative for match creation.
--
-- This fixes older profile-view accept flows where the request became accepted
-- and chat was possible, but no public.matches row existed. Without the match
-- row, Vibes can keep showing that person as discoverable.

update public.matches m
set status = 'ACCEPTED'::match_status,
    updated_at = now()
where status::text <> 'ACCEPTED'
  and exists (
    select 1
    from public.intent_requests ir
    where ir.status in ('accepted', 'matched')
      and (
        (ir.actor_id = m.user1_id and ir.recipient_id = m.user2_id)
        or (ir.actor_id = m.user2_id and ir.recipient_id = m.user1_id)
      )
  );

insert into public.matches (user1_id, user2_id, status, created_at, updated_at)
select distinct
  case when ir.actor_id::text < ir.recipient_id::text then ir.actor_id else ir.recipient_id end as user1_id,
  case when ir.actor_id::text < ir.recipient_id::text then ir.recipient_id else ir.actor_id end as user2_id,
  'ACCEPTED'::match_status,
  now(),
  now()
from public.intent_requests ir
where ir.status in ('accepted', 'matched')
  and ir.actor_id is not null
  and ir.recipient_id is not null
  and ir.actor_id <> ir.recipient_id
  and not exists (
    select 1
    from public.matches m
    where (m.user1_id = ir.actor_id and m.user2_id = ir.recipient_id)
       or (m.user1_id = ir.recipient_id and m.user2_id = ir.actor_id)
  )
on conflict (user1_id, user2_id)
do update set
  status = 'ACCEPTED'::match_status,
  updated_at = now();
