create or replace function public.rpc_get_circle_profile_suggestions(
  p_profile_id uuid,
  p_limit integer default 8
)
returns table (
  profile_id uuid,
  full_name text,
  age integer,
  avatar_url text,
  circle_id uuid,
  circle_name text,
  reason text,
  score integer
)
language plpgsql
security definer
stable
set search_path = public, pg_catalog
set row_security = off
as $$
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.profiles viewer_profile
    where viewer_profile.id = p_profile_id
      and viewer_profile.user_id = auth.uid()
      and viewer_profile.deleted_at is null
  ) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  return query
  with viewer as (
    select viewer_profile.*
    from public.profiles viewer_profile
    where viewer_profile.id = p_profile_id
  ),
  viewer_circles as (
    select distinct member.circle_id
    from public.circle_members member
    where member.profile_id = p_profile_id
      and member.status = 'active'
      and member.is_visible is not false
  ),
  viewer_signal_taste as (
    select distinct candidate_interest.interest_id
    from public.profile_signals signal
    join public.profile_interests candidate_interest
      on candidate_interest.profile_id = signal.target_profile_id
    where signal.profile_id = p_profile_id
      and (
        signal.liked is true
        or coalesce(signal.opened_profile_count, 0) > 0
        or coalesce(signal.dwell_score, 0) > 0
        or signal.intro_video_started is true
        or signal.intro_video_completed is true
      )
  ),
  raw_candidates as (
    select
      candidate.id as profile_id,
      candidate.full_name,
      candidate.age,
      candidate.avatar_url,
      candidate.user_id,
      candidate.city,
      candidate.region,
      candidate.current_country,
      candidate.current_country_code,
      candidate.religion,
      candidate.looking_for,
      candidate.min_age_interest,
      candidate.max_age_interest,
      candidate.bio,
      candidate.photos,
      candidate.profile_video,
      candidate.verification_level,
      candidate.last_active,
      candidate.profile_completed,
      circle_row.id as circle_id,
      circle_row.name as circle_name,
      member.joined_at
    from viewer
    join viewer_circles viewer_circle on true
    join public.circle_members member
      on member.circle_id = viewer_circle.circle_id
     and member.status = 'active'
     and member.is_visible is not false
     and member.profile_id <> p_profile_id
    join public.profiles candidate
      on candidate.id = member.profile_id
     and candidate.deleted_at is null
     and coalesce(candidate.is_active, true)
     and coalesce(candidate.discoverable_in_vibes, true)
     and coalesce(candidate.matchmaking_mode, false) = false
     and candidate.user_id is not null
    join public.circles circle_row
      on circle_row.id = member.circle_id
     and circle_row.archived_at is null
    where not exists (
        select 1
        from public.blocks block_row
        where (block_row.blocker_id = viewer.user_id and block_row.blocked_id = candidate.user_id)
           or (block_row.blocker_id = candidate.user_id and block_row.blocked_id = viewer.user_id)
      )
      and not exists (
        select 1
        from public.matches match_row
        where lower(coalesce(match_row.status::text, '')) in ('pending', 'accepted')
          and (
            (match_row.user1_id = viewer.id and match_row.user2_id = candidate.id)
            or (match_row.user1_id = candidate.id and match_row.user2_id = viewer.id)
          )
      )
      and (
        viewer.gender is null
        or viewer.gender not in ('MALE', 'FEMALE')
        or candidate.gender is null
        or candidate.gender not in ('MALE', 'FEMALE')
        or (viewer.gender = 'MALE' and candidate.gender = 'FEMALE')
        or (viewer.gender = 'FEMALE' and candidate.gender = 'MALE')
      )
  ),
  candidate_rollup as (
    select
      raw.profile_id,
      raw.full_name,
      raw.age,
      raw.avatar_url,
      raw.user_id,
      raw.city,
      raw.region,
      raw.current_country,
      raw.current_country_code,
      raw.religion,
      raw.looking_for,
      raw.min_age_interest,
      raw.max_age_interest,
      raw.bio,
      raw.photos,
      raw.profile_video,
      raw.verification_level,
      raw.last_active,
      raw.profile_completed,
      (array_agg(raw.circle_id order by raw.joined_at desc nulls last, raw.circle_name))[1] as circle_id,
      (array_agg(raw.circle_name order by raw.joined_at desc nulls last, raw.circle_name))[1] as circle_name,
      count(distinct raw.circle_id)::integer as shared_circle_count
    from raw_candidates raw
    group by
      raw.profile_id,
      raw.full_name,
      raw.age,
      raw.avatar_url,
      raw.user_id,
      raw.city,
      raw.region,
      raw.current_country,
      raw.current_country_code,
      raw.religion,
      raw.looking_for,
      raw.min_age_interest,
      raw.max_age_interest,
      raw.bio,
      raw.photos,
      raw.profile_video,
      raw.verification_level,
      raw.last_active,
      raw.profile_completed
  ),
  scored as (
    select
      candidate.profile_id,
      candidate.full_name,
      candidate.age,
      candidate.avatar_url,
      candidate.circle_id,
      candidate.circle_name,
      candidate.shared_circle_count,
      coalesce(shared.shared_interest_count, 0) as shared_interest_count,
      coalesce(taste.taste_interest_count, 0) as taste_interest_count,
      coalesce(signal.signal_score, 0) as signal_score,
      coalesce(vibes.vibes_score, 0) as vibes_score,
      coalesce(suggested.suggested_score, 0) as suggested_score,
      coalesce(intent.intent_score, 0) as intent_score,
      coalesce(vibes.recent_pass, false) as recent_pass,
      (
        100
        + least(candidate.shared_circle_count * 12, 30)
        + least(coalesce(shared.shared_interest_count, 0) * 10, 30)
        + least(coalesce(taste.taste_interest_count, 0) * 8, 24)
        + case
            when nullif(btrim(coalesce(candidate.looking_for, '')), '') is not null
             and lower(candidate.looking_for) = lower(viewer.looking_for) then 18
            else 0
          end
        + case
            when candidate.age between coalesce(viewer.min_age_interest, 18) and coalesce(viewer.max_age_interest, 99) then 14
            else 0
          end
        + case
            when viewer.age between coalesce(candidate.min_age_interest, 18) and coalesce(candidate.max_age_interest, 99) then 10
            else 0
          end
        + case
            when nullif(btrim(coalesce(candidate.city, '')), '') is not null
             and lower(candidate.city) = lower(viewer.city) then 16
            when nullif(btrim(coalesce(candidate.current_country_code, '')), '') is not null
             and upper(candidate.current_country_code) = upper(viewer.current_country_code) then 11
            when nullif(btrim(coalesce(candidate.current_country, '')), '') is not null
             and lower(candidate.current_country) = lower(viewer.current_country) then 9
            when nullif(btrim(coalesce(candidate.region, '')), '') is not null
             and lower(candidate.region) = lower(viewer.region) then 6
            else 0
          end
        + case
            when candidate.religion is not null and candidate.religion = viewer.religion then 10
            else 0
          end
        + case
            when coalesce(candidate.verification_level, 0) > 0 then 8
            else 0
          end
        + case
            when candidate.last_active >= timezone('utc'::text, now()) - interval '30 minutes' then 12
            when candidate.last_active >= timezone('utc'::text, now()) - interval '24 hours' then 8
            when candidate.last_active >= timezone('utc'::text, now()) - interval '7 days' then 4
            else 0
          end
        + case when coalesce(candidate.profile_completed, false) then 6 else 0 end
        + case when nullif(btrim(coalesce(candidate.bio, '')), '') is not null then 4 else 0 end
        + case when cardinality(coalesce(candidate.photos, array[]::text[])) > 0 then 4 else 0 end
        + case when nullif(btrim(coalesce(candidate.profile_video, '')), '') is not null then 6 else 0 end
        + coalesce(signal.signal_score, 0)
        + coalesce(vibes.vibes_score, 0)
        + coalesce(suggested.suggested_score, 0)
        + coalesce(intent.intent_score, 0)
        - case when coalesce(vibes.recent_pass, false) then 45 else 0 end
      )::integer as score,
      concat_ws(
        ' - ',
        'Shared Circle',
        case when coalesce(shared.shared_interest_count, 0) > 0 then 'Shared interests' end,
        case
          when nullif(btrim(coalesce(candidate.looking_for, '')), '') is not null
           and lower(candidate.looking_for) = lower(viewer.looking_for) then 'Intent aligned'
        end,
        case
          when nullif(btrim(coalesce(candidate.city, '')), '') is not null
           and lower(candidate.city) = lower(viewer.city) then 'Nearby context'
          when nullif(btrim(coalesce(candidate.current_country_code, '')), '') is not null
           and upper(candidate.current_country_code) = upper(viewer.current_country_code) then 'Country context'
        end,
        case when coalesce(vibes.vibes_score, 0) > 0 or coalesce(signal.signal_score, 0) > 0 then 'Warm signal' end,
        case when candidate.last_active >= timezone('utc'::text, now()) - interval '24 hours' then 'Active recently' end
      ) as reason
    from candidate_rollup candidate
    cross join viewer
    left join lateral (
      select count(*)::integer as shared_interest_count
      from public.profile_interests candidate_interest
      join public.profile_interests viewer_interest
        on viewer_interest.interest_id = candidate_interest.interest_id
       and viewer_interest.profile_id = viewer.id
      where candidate_interest.profile_id = candidate.profile_id
    ) shared on true
    left join lateral (
      select count(*)::integer as taste_interest_count
      from public.profile_interests candidate_interest
      join viewer_signal_taste taste_interest
        on taste_interest.interest_id = candidate_interest.interest_id
      where candidate_interest.profile_id = candidate.profile_id
    ) taste on true
    left join lateral (
      select coalesce(sum(
        case
          when signal.liked is true then 18 else 0
        end
        + least(coalesce(signal.opened_profile_count, 0) * 4, 12)
        + least(coalesce(signal.dwell_score, 0), 12)
        + case when signal.intro_video_completed is true then 10 when signal.intro_video_started is true then 5 else 0 end
      ), 0)::integer as signal_score
      from public.profile_signals signal
      where signal.profile_id = viewer.id
        and signal.target_profile_id = candidate.profile_id
        and signal.last_interacted_at >= timezone('utc'::text, now()) - interval '180 days'
    ) signal on true
    left join lateral (
      select
        coalesce(sum(
          case event.event_type
            when 'like' then 18
            when 'signal_sent' then 18
            when 'intent_sent' then 18
            when 'profile_opened' then 8
            when 'intro_completed' then 8
            when 'intro_played' then 5
            when 'signal_opened' then 5
            when 'intent_opened' then 5
            when 'pass' then -18
            else 0
          end
          + case when coalesce(event.dwell_ms, 0) >= 8000 then 4 else 0 end
        ), 0)::integer as vibes_score,
        bool_or(event.event_type = 'pass' and event.created_at >= timezone('utc'::text, now()) - interval '14 days') as recent_pass
      from public.vibes_events event
      where event.viewer_profile_id = viewer.id
        and event.target_profile_id = candidate.profile_id
        and event.created_at >= timezone('utc'::text, now()) - interval '180 days'
    ) vibes on true
    left join lateral (
      select coalesce(sum(
        case event.event_type
          when 'intent_sent' then 18
          when 'intent_opened' then 8
          when 'opener_revealed' then 6
          when 'preview_profile' then 5
          when 'impression' then 1
          else 0
        end
      ), 0)::integer as suggested_score
      from public.suggested_move_events event
      where event.viewer_profile_id = viewer.id
        and event.candidate_profile_id = candidate.profile_id
        and event.created_at >= timezone('utc'::text, now()) - interval '180 days'
    ) suggested on true
    left join lateral (
      select coalesce(sum(
        case request.status
          when 'accepted' then 22
          when 'pending' then 8
          when 'passed' then -25
          when 'cancelled' then -8
          else 0
        end
      ), 0)::integer as intent_score
      from public.intent_requests request
      where (
          (request.actor_id = viewer.id and request.recipient_id = candidate.profile_id)
          or (request.actor_id = candidate.profile_id and request.recipient_id = viewer.id)
        )
        and request.created_at >= timezone('utc'::text, now()) - interval '180 days'
    ) intent on true
  )
  select
    scored.profile_id,
    coalesce(nullif(btrim(scored.full_name), ''), 'Circle member') as full_name,
    scored.age,
    scored.avatar_url,
    scored.circle_id,
    coalesce(nullif(btrim(scored.circle_name), ''), 'Shared Circle') as circle_name,
    coalesce(nullif(btrim(scored.reason), ''), 'Shared Circle') as reason,
    scored.score
  from scored
  order by
    scored.score desc,
    scored.shared_interest_count desc,
    scored.shared_circle_count desc,
    scored.full_name nulls last,
    scored.profile_id
  limit greatest(1, least(coalesce(p_limit, 8), 24));
end;
$$;

revoke all on function public.rpc_get_circle_profile_suggestions(uuid, integer) from public;
grant execute on function public.rpc_get_circle_profile_suggestions(uuid, integer) to authenticated;
