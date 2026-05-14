-- Diagnostic helper for Vibes Recommendation Engine v2.
-- This is intentionally read-only and auth-scoped so we can understand why a
-- profile's Vibes pool is thin without exposing other users' data broadly.

drop function if exists public.rpc_debug_vibes_recommendation_pool(uuid, integer);

create or replace function public.rpc_debug_vibes_recommendation_pool(
  p_profile_id uuid,
  p_active_window_minutes integer default 30
)
returns jsonb
language plpgsql
security definer
stable
set search_path = public, pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_cutoff timestamptz := now() - (greatest(5, least(coalesce(p_active_window_minutes, 30), 240)) || ' minutes')::interval;
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'authentication required';
  end if;

  select *
    into v_profile
  from public.profiles p
  where p.id = p_profile_id
    and p.user_id = v_user_id
  limit 1;

  if v_profile.id is null then
    raise exception 'profile not found';
  end if;

  with candidates as (
    select
      p.id,
      p.user_id,
      p.profile_completed,
      p.discoverable_in_vibes,
      p.matchmaking_mode,
      p.deleted_at,
      p.gender,
      p.age,
      p.last_active,
      p.online,
      exists (
        select 1
        from public.blocks b
        where (b.blocker_id = v_user_id and b.blocked_id = p.user_id)
           or (b.blocker_id = p.user_id and b.blocked_id = v_user_id)
      ) as blocked,
      exists (
        select 1
        from public.matches mt
        where mt.status in ('PENDING', 'ACCEPTED')
          and (
            (mt.user1_id = p_profile_id and mt.user2_id = p.id)
            or (mt.user1_id = p.id and mt.user2_id = p_profile_id)
          )
      ) as matched_or_pending,
      exists (
        select 1
        from public.intent_requests ir
        where ir.status = 'pending'
          and ir.expires_at > now()
          and (
            (ir.actor_id = p_profile_id and ir.recipient_id = p.id)
            or (ir.actor_id = p.id and ir.recipient_id = p_profile_id)
          )
      ) as pending_intent,
      exists (
        select 1
        from public.profile_signal_gestures psg
        where psg.status in ('sent', 'seen')
          and psg.expires_at > now()
          and (
            (psg.sender_profile_id = p_profile_id and psg.receiver_profile_id = p.id)
            or (psg.sender_profile_id = p.id and psg.receiver_profile_id = p_profile_id)
          )
      ) as active_signal,
      exists (
        select 1
        from public.swipes s
        where s.swiper_id = p_profile_id
          and s.target_id = p.id
          and s.action::text in ('LIKE', 'SUPERLIKE')
      ) as already_liked,
      exists (
        select 1
        from public.swipes s
        where s.swiper_id = p_profile_id
          and s.target_id = p.id
          and s.action::text = 'PASS'
          and s.created_at >= now() - interval '21 days'
      ) as recent_pass,
      (
        v_profile.gender is null
        or v_profile.gender not in ('MALE', 'FEMALE')
        or p.gender is null
        or (v_profile.gender = 'MALE' and p.gender = 'FEMALE')
        or (v_profile.gender = 'FEMALE' and p.gender = 'MALE')
      ) as gender_ok,
      (v_profile.min_age_interest is null or p.age >= v_profile.min_age_interest) as min_age_ok,
      (v_profile.max_age_interest is null or p.age <= v_profile.max_age_interest) as max_age_ok,
      (p.last_active is not null and p.last_active >= v_cutoff) as active_window_ok
    from public.profiles p
    where p.id <> p_profile_id
      and p.user_id is not null
      and p.user_id <> v_user_id
  ),
  counted as (
    select
      count(*) as total_profiles,
      count(*) filter (where profile_completed is true) as completed,
      count(*) filter (where deleted_at is null and profile_completed is true and coalesce(discoverable_in_vibes, true) = true and coalesce(matchmaking_mode, false) = false) as base_visible,
      count(*) filter (where blocked) as blocked,
      count(*) filter (where matched_or_pending) as matched_or_pending,
      count(*) filter (where pending_intent) as pending_intent,
      count(*) filter (where active_signal) as active_signal,
      count(*) filter (where already_liked) as already_liked,
      count(*) filter (where recent_pass) as recent_pass_21d,
      count(*) filter (where not gender_ok) as gender_filtered,
      count(*) filter (where not min_age_ok or not max_age_ok) as age_filtered,
      count(*) filter (where active_window_ok) as active_window_candidates,
      count(*) filter (
        where deleted_at is null
          and profile_completed is true
          and coalesce(discoverable_in_vibes, true) = true
          and coalesce(matchmaking_mode, false) = false
          and not blocked
          and not matched_or_pending
          and not pending_intent
          and not active_signal
          and not already_liked
          and not recent_pass
          and gender_ok
          and min_age_ok
          and max_age_ok
      ) as for_you_eligible,
      count(*) filter (
        where deleted_at is null
          and profile_completed is true
          and coalesce(discoverable_in_vibes, true) = true
          and coalesce(matchmaking_mode, false) = false
          and not blocked
          and not matched_or_pending
          and not pending_intent
          and not active_signal
          and not already_liked
          and not recent_pass
          and gender_ok
          and min_age_ok
          and max_age_ok
          and active_window_ok
      ) as active_now_eligible
    from candidates
  )
  select jsonb_build_object(
    'profile_id', p_profile_id,
    'active_window_minutes', greatest(5, least(coalesce(p_active_window_minutes, 30), 240)),
    'counts', to_jsonb(counted)
  )
  into v_result
  from counted;

  return coalesce(v_result, '{}'::jsonb);
end;
$$;

revoke all on function public.rpc_debug_vibes_recommendation_pool(uuid, integer) from public;
grant execute on function public.rpc_debug_vibes_recommendation_pool(uuid, integer) to authenticated;
