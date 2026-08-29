-- Align hosted-match eligibility with the confirmed-preference semantics used
-- by Vibes V5.2. Legacy/default age ranges are not explicit consent and must
-- not silently remove otherwise valid Live introduction pairs.

begin;

create or replace function public.live_match_pair_is_eligible(
  p_session_id uuid,
  p_user_a uuid,
  p_user_b uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
  select p_user_a is not null
    and p_user_b is not null
    and p_user_a <> p_user_b
    and exists (
      select 1
      from public.live_participants a
      join public.live_participants b on b.session_id = a.session_id
      join public.profiles pa on pa.id = a.profile_id
      join public.profiles pb on pb.id = b.profile_id
      where a.session_id = p_session_id
        and a.user_id = p_user_a
        and b.user_id = p_user_b
        and a.open_to_introductions
        and b.open_to_introductions
        and a.role <> 'host'
        and b.role <> 'host'
        and a.state in ('audience', 'stage_requested', 'backstage', 'on_stage')
        and b.state in ('audience', 'stage_requested', 'backstage', 'on_stage')
        and pa.deleted_at is null
        and pb.deleted_at is null
        and pa.profile_completed
        and pb.profile_completed
        and coalesce(pa.is_active, true)
        and coalesce(pb.is_active, true)
        and (
          upper(btrim(coalesce(pa.gender::text, ''))) not in ('MALE', 'FEMALE')
          or upper(btrim(coalesce(pb.gender::text, ''))) not in ('MALE', 'FEMALE')
          or upper(btrim(pa.gender::text)) <> upper(btrim(pb.gender::text))
        )
        and (
          pa.age_preference_confirmed_at is null
          or pa.min_age_interest is null
          or pb.age is null
          or pb.age >= pa.min_age_interest
        )
        and (
          pa.age_preference_confirmed_at is null
          or pa.max_age_interest is null
          or pb.age is null
          or pb.age <= pa.max_age_interest
        )
        and (
          pb.age_preference_confirmed_at is null
          or pb.min_age_interest is null
          or pa.age is null
          or pa.age >= pb.min_age_interest
        )
        and (
          pb.age_preference_confirmed_at is null
          or pb.max_age_interest is null
          or pa.age is null
          or pa.age <= pb.max_age_interest
        )
        and not exists (
          select 1
          from public.blocks blocked
          where (blocked.blocker_id = p_user_a and blocked.blocked_id = p_user_b)
             or (blocked.blocker_id = p_user_b and blocked.blocked_id = p_user_a)
        )
    );
$$;

revoke all on function public.live_match_pair_is_eligible(uuid, uuid, uuid)
from public, anon, authenticated;

commit;
