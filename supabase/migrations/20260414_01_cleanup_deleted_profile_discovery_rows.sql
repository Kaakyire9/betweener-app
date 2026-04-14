-- Clean up stale active-discovery rows for profiles that were already deleted
-- before the hardened delete-account flow started removing these relationships.
-- This intentionally targets only active product surfaces, not audit/history data.

with deleted_profiles as (
  select id
  from public.profiles
  where deleted_at is not null
     or account_state = 'deleted'
)
delete from public.swipes s
using deleted_profiles dp
where s.swiper_id = dp.id
   or s.target_id = dp.id;

with deleted_profiles as (
  select id
  from public.profiles
  where deleted_at is not null
     or account_state = 'deleted'
)
delete from public.matches m
using deleted_profiles dp
where m.user1_id = dp.id
   or m.user2_id = dp.id;

with deleted_profiles as (
  select id
  from public.profiles
  where deleted_at is not null
     or account_state = 'deleted'
)
delete from public.intent_requests ir
using deleted_profiles dp
where ir.actor_id = dp.id
   or ir.recipient_id = dp.id;

with deleted_profiles as (
  select id
  from public.profiles
  where deleted_at is not null
     or account_state = 'deleted'
)
delete from public.circle_members cm
using deleted_profiles dp
where cm.profile_id = dp.id;

with deleted_profiles as (
  select id
  from public.profiles
  where deleted_at is not null
     or account_state = 'deleted'
)
delete from public.circles c
using deleted_profiles dp
where c.created_by_profile_id = dp.id;
