-- Rotate Circle Home Picks without weakening compatibility or consent rules.
-- Fresh candidates rank before recently exposed candidates; when the eligible
-- pool is exhausted, the least-recently shown candidate returns first.

begin;

create or replace function public.rpc_get_circle_home_picks(p_limit integer default 6)
returns table (
  profile_id uuid,
  full_name text,
  age integer,
  avatar_url text,
  circle_id uuid,
  circle_name text,
  reason text
)
language plpgsql
stable
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
#variable_conflict use_column
declare
  v_viewer_id uuid;
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  select profile.id into v_viewer_id
  from public.profiles profile
  where profile.user_id = auth.uid()
    and profile.deleted_at is null
    and profile.account_state = 'active'
  limit 1;

  if v_viewer_id is null then return; end if;

  return query
  with viewer as (
    select profile.*
    from public.profiles profile
    where profile.id = v_viewer_id
  ), shared_contexts as (
    select
      candidate.id as candidate_id,
      candidate.full_name as candidate_name,
      candidate.age as candidate_age,
      candidate.avatar_url as candidate_avatar,
      candidate.last_active as candidate_last_active,
      candidate.verification_level as candidate_verification,
      circle_row.id as shared_circle_id,
      circle_row.name as shared_circle_name,
      coalesce(shared_interest.count, 0)::integer as shared_interest_count,
      case when viewer_context.priorities && coalesce(candidate_context.priorities, '{}') then 1 else 0 end as priority_overlap,
      case when lower(coalesce(viewer.city, '')) = lower(coalesce(candidate.city, '')) and candidate.city is not null then 1 else 0 end as same_city,
      case when nullif(btrim(viewer.looking_for), '') is not null
        and lower(btrim(viewer.looking_for)) = lower(btrim(coalesce(candidate.looking_for, ''))) then 1 else 0 end as same_intent,
      coalesce(exposure.count, 0)::integer as exposure_count,
      exposure.last_impression_at
    from viewer
    join public.circle_members viewer_member
      on viewer_member.profile_id = viewer.id
     and viewer_member.status = 'active'
     and viewer_member.is_visible is not false
    join public.circle_dating_preferences viewer_preference
      on viewer_preference.circle_id = viewer_member.circle_id
     and viewer_preference.profile_id = viewer.id
     and viewer_preference.opted_in
     and viewer_preference.open_to_intents
    join public.circles circle_row
      on circle_row.id = viewer_member.circle_id
     and circle_row.archived_at is null
    left join public.circle_member_context viewer_context
      on viewer_context.circle_id = circle_row.id
     and viewer_context.profile_id = viewer.id
    join public.circle_members candidate_member
      on candidate_member.circle_id = viewer_member.circle_id
     and candidate_member.profile_id <> viewer.id
     and candidate_member.status = 'active'
     and candidate_member.is_visible is not false
    join public.circle_dating_preferences candidate_preference
      on candidate_preference.circle_id = candidate_member.circle_id
     and candidate_preference.profile_id = candidate_member.profile_id
     and candidate_preference.opted_in
     and candidate_preference.open_to_intents
    join public.profiles candidate on candidate.id = candidate_member.profile_id
    left join public.circle_member_context candidate_context
      on candidate_context.circle_id = circle_row.id
     and candidate_context.profile_id = candidate.id
    left join lateral (
      select count(*) as count
      from public.profile_interests candidate_interest
      join public.profile_interests viewer_interest
        on viewer_interest.profile_id = viewer.id
       and viewer_interest.interest_id = candidate_interest.interest_id
      where candidate_interest.profile_id = candidate.id
    ) shared_interest on true
    left join lateral (
      select
        count(*) filter (
          where event_row.created_at >= timezone('utc', now()) - interval '7 days'
        ) as count,
        max(event_row.created_at) as last_impression_at
      from public.circle_discovery_events event_row
      where event_row.viewer_profile_id = viewer.id
        and event_row.target_profile_id = candidate.id
        and event_row.event_type = 'candidate_impression'
    ) exposure on true
    where public.is_romantically_eligible(viewer.id, candidate.id, 'circle', circle_row.id)
      and not exists (
        select 1 from public.matches match_row
        where lower(coalesce(match_row.status::text, '')) in ('pending', 'accepted')
          and ((match_row.user1_id = viewer.id and match_row.user2_id = candidate.id)
            or (match_row.user2_id = viewer.id and match_row.user1_id = candidate.id))
      )
      and not exists (
        select 1 from public.intent_requests request_row
        where request_row.status = 'pending'
          and request_row.expires_at > timezone('utc', now())
          and ((request_row.actor_id = viewer.id and request_row.recipient_id = candidate.id)
            or (request_row.recipient_id = viewer.id and request_row.actor_id = candidate.id))
      )
      and not exists (
        select 1 from public.circle_dating_passes pass_row
        where pass_row.actor_profile_id = viewer.id
          and pass_row.target_profile_id = candidate.id
          and pass_row.created_at > timezone('utc', now()) - interval '14 days'
      )
  ), scored as (
    select shared.*,
      (
        shared.shared_interest_count * 18
        + shared.priority_overlap * 16
        + shared.same_intent * 14
        + shared.same_city * 9
        + least(coalesce(shared.candidate_verification, 0), 3) * 4
        + case when shared.candidate_last_active >= timezone('utc', now()) - interval '24 hours' then 8
               when shared.candidate_last_active >= timezone('utc', now()) - interval '7 days' then 4 else 0 end
        - least(shared.exposure_count, 4) * 5
      )::numeric as internal_score,
      count(*) over (partition by shared.candidate_id)::integer as shared_circle_count,
      row_number() over (
        partition by shared.candidate_id
        order by shared.priority_overlap desc, shared.shared_interest_count desc,
          shared.same_intent desc, shared.shared_circle_id
      ) as context_rank
    from shared_contexts shared
  )
  select
    scored.candidate_id,
    coalesce(nullif(btrim(scored.candidate_name), ''), 'Circle member'),
    scored.candidate_age,
    scored.candidate_avatar,
    scored.shared_circle_id,
    scored.shared_circle_name,
    concat_ws(' · ',
      case when scored.shared_circle_count > 1 then scored.shared_circle_count::text || ' shared Circles'
           else scored.shared_circle_name end,
      case when scored.shared_interest_count > 0 then
        scored.shared_interest_count::text || case when scored.shared_interest_count = 1 then ' shared interest' else ' shared interests' end
      end,
      case when scored.priority_overlap > 0 then 'Similar priorities' end,
      case when scored.same_intent > 0 then 'Intent aligned' end
    )
  from scored
  where scored.context_rank = 1
  order by
    case when scored.last_impression_at >= timezone('utc', now()) - interval '12 hours' then 1 else 0 end,
    scored.last_impression_at asc nulls first,
    scored.internal_score desc,
    scored.candidate_last_active desc nulls last,
    scored.candidate_id
  limit greatest(1, least(coalesce(p_limit, 6), 12));
end;
$$;

revoke all on function public.rpc_get_circle_home_picks(integer) from public, anon;
grant execute on function public.rpc_get_circle_home_picks(integer) to authenticated;

commit;
