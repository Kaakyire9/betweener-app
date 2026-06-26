drop function if exists public.rpc_debug_closure_to_clarity_pool(uuid);

create or replace function public.rpc_debug_closure_to_clarity_pool(
  p_intent_request_id uuid
)
returns jsonb
language plpgsql
security definer
stable
set search_path = public, pg_catalog
as $$
declare
  v_viewer_profile public.profiles%rowtype;
  v_target_profile public.profiles%rowtype;
  v_request public.intent_requests%rowtype;
  v_target_profile_id uuid;
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select profile.*
    into v_viewer_profile
  from public.profiles profile
  where profile.user_id = auth.uid()
    and profile.deleted_at is null
  limit 1;

  if v_viewer_profile.id is null then
    raise exception 'profile required';
  end if;

  select request_row.*
    into v_request
  from public.intent_requests request_row
  where request_row.id = p_intent_request_id
    and (
      request_row.actor_id = v_viewer_profile.id
      or request_row.recipient_id = v_viewer_profile.id
    )
  limit 1;

  if v_request.id is null then
    raise exception 'intent request not found';
  end if;

  v_target_profile_id := case
    when v_request.actor_id = v_viewer_profile.id then v_request.recipient_id
    else v_request.actor_id
  end;

  select profile.*
    into v_target_profile
  from public.profiles profile
  where profile.id = v_target_profile_id
    and profile.deleted_at is null
  limit 1;

  if v_target_profile.id is null then
    raise exception 'target profile not found';
  end if;

  with candidates as (
    select
      profile.id,
      profile.user_id,
      profile.gender,
      profile.age,
      profile.profile_completed,
      profile.discoverable_in_vibes,
      profile.deleted_at,
      profile.full_name,
      exists (
        select 1
        from public.intent_requests request_row
        where (
          (request_row.actor_id = v_viewer_profile.id and request_row.recipient_id = profile.id)
          or (request_row.actor_id = profile.id and request_row.recipient_id = v_viewer_profile.id)
        )
          and (
            request_row.status in ('pending', 'accepted', 'matched')
            or (
              request_row.status = 'passed'
              and request_row.created_at > now() - interval '21 days'
            )
          )
      ) as blocked_by_existing_intent,
      exists (
        select 1
        from public.matches match_row
        where (match_row.user1_id = v_viewer_profile.id and match_row.user2_id = profile.id)
           or (match_row.user1_id = profile.id and match_row.user2_id = v_viewer_profile.id)
      ) as blocked_by_match,
      exists (
        select 1
        from public.blocks block_row
        where (block_row.blocker_id = v_viewer_profile.user_id and block_row.blocked_id = profile.user_id)
           or (block_row.blocker_id = profile.user_id and block_row.blocked_id = v_viewer_profile.user_id)
      ) as blocked_by_block,
      coalesce((
        select swipe_row.action::text
        from public.swipes swipe_row
        where swipe_row.swiper_id = v_viewer_profile.id
          and swipe_row.target_id = profile.id
        order by swipe_row.created_at desc, swipe_row.id desc
        limit 1
      ), '') = 'PASS' as blocked_by_swipe_pass,
      (
        v_viewer_profile.gender is null
        or v_viewer_profile.gender not in ('MALE', 'FEMALE')
        or profile.gender is null
        or profile.gender not in ('MALE', 'FEMALE')
        or (v_viewer_profile.gender = 'MALE' and profile.gender = 'FEMALE')
        or (v_viewer_profile.gender = 'FEMALE' and profile.gender = 'MALE')
      ) as viewer_gender_ok,
      (
        v_target_profile.gender is null
        or v_target_profile.gender not in ('MALE', 'FEMALE')
        or profile.gender is null
        or profile.gender not in ('MALE', 'FEMALE')
        or (v_target_profile.gender = 'MALE' and profile.gender = 'FEMALE')
        or (v_target_profile.gender = 'FEMALE' and profile.gender = 'MALE')
      ) as target_gender_ok,
      (
        v_viewer_profile.min_age_interest is null
        or v_viewer_profile.max_age_interest is null
        or profile.age between v_viewer_profile.min_age_interest and v_viewer_profile.max_age_interest
      ) as viewer_age_ok,
      (
        v_target_profile.min_age_interest is null
        or v_target_profile.max_age_interest is null
        or profile.age between v_target_profile.min_age_interest and v_target_profile.max_age_interest
      ) as target_age_ok
    from public.profiles profile
    where profile.id <> v_viewer_profile.id
      and profile.id <> v_target_profile.id
      and profile.user_id is not null
      and profile.user_id <> v_viewer_profile.user_id
  ),
  base_pool as (
    select *
    from candidates
    where deleted_at is null
      and profile_completed is true
      and coalesce(discoverable_in_vibes, true) = true
      and full_name is not null
      and age is not null
  ),
  annotated as (
    select
      base_candidate.*,
      not (
        base_candidate.blocked_by_existing_intent
        or base_candidate.blocked_by_match
        or base_candidate.blocked_by_block
        or base_candidate.blocked_by_swipe_pass
      ) as passes_safety,
      (base_candidate.viewer_gender_ok and base_candidate.target_gender_ok) as passes_gender,
      (base_candidate.viewer_age_ok and base_candidate.target_age_ok) as passes_age
    from base_pool base_candidate
  ),
  counted as (
    select
      count(*)::integer as discoverable_pool_count,
      count(*) filter (where blocked_by_existing_intent)::integer as blocked_by_existing_intent_count,
      count(*) filter (where blocked_by_match)::integer as blocked_by_match_count,
      count(*) filter (where blocked_by_block)::integer as blocked_by_block_count,
      count(*) filter (where blocked_by_swipe_pass)::integer as blocked_by_swipe_pass_count,
      count(*) filter (where passes_safety)::integer as post_safety_pool_count,
      count(*) filter (where not viewer_gender_ok)::integer as blocked_by_viewer_gender_count,
      count(*) filter (where not target_gender_ok)::integer as blocked_by_target_gender_count,
      count(*) filter (where passes_safety and not passes_gender)::integer as blocked_by_gender_after_safety_count,
      count(*) filter (where passes_safety and passes_gender)::integer as post_gender_pool_count,
      count(*) filter (where passes_safety and passes_gender and not viewer_age_ok)::integer as blocked_by_viewer_age_count,
      count(*) filter (where passes_safety and passes_gender and not target_age_ok)::integer as blocked_by_target_age_count,
      count(*) filter (where passes_safety and passes_gender and passes_age)::integer as final_eligible_count,
      count(*) filter (where passes_safety and passes_gender and passes_age and viewer_age_ok and target_age_ok)::integer as tier_0_count,
      count(*) filter (where passes_safety and passes_gender and viewer_age_ok and not target_age_ok)::integer as tier_1_count,
      count(*) filter (where passes_safety and passes_gender and target_age_ok and not viewer_age_ok)::integer as tier_2_count,
      count(*) filter (where passes_safety and passes_gender and (not viewer_age_ok or not target_age_ok))::integer as tier_3_count
    from annotated
  ),
  samples as (
    select jsonb_build_object(
      'final_candidate_ids', coalesce(
        (
          select jsonb_agg(sample.id order by sample.id)
          from (
            select annotated.id
            from annotated
            where annotated.passes_safety
              and annotated.passes_gender
              and annotated.passes_age
            order by annotated.id
            limit 8
          ) sample
        ),
        '[]'::jsonb
      )
    ) as value
  )
  select jsonb_build_object(
    'request_id', p_intent_request_id,
    'request_status', v_request.status,
    'viewer_profile_id', v_viewer_profile.id,
    'viewer_gender', v_viewer_profile.gender,
    'target_profile_id', v_target_profile.id,
    'target_gender', v_target_profile.gender,
    'counts', to_jsonb(counted),
    'samples', samples.value
  )
    into v_result
  from counted
  cross join samples;

  return coalesce(v_result, '{}'::jsonb);
end;
$$;

revoke all on function public.rpc_debug_closure_to_clarity_pool(uuid) from public;
grant execute on function public.rpc_debug_closure_to_clarity_pool(uuid) to authenticated;
