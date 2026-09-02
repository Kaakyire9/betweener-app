-- Server-authoritative Relationship Compass candidate ranking and daily delivery.
-- Requires 20260901133000_recommendation_rotation_foundation.sql.

begin;

-- Relationship Compass candidate authority. The RPC applies reciprocal global
-- eligibility, hard "must" choices, interaction suppression, Compass scoring,
-- deterministic daily exploration, and 7/21-day exposure freshness.
create or replace function public.rpc_get_relationship_compass_profiles(
  p_limit integer default 9
)
returns table (
  id uuid,
  user_id uuid,
  full_name text,
  avatar_url text,
  photos text[],
  looking_for text,
  current_country text,
  current_country_code text,
  city text,
  location text,
  region text,
  religion public.religion,
  gender public.gender,
  has_children text,
  wants_children text,
  verification_level integer
)
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
#variable_conflict use_column
declare
  v_viewer public.profiles%rowtype;
  v_compass jsonb;
  v_bucket_start timestamptz := date_trunc('day', timezone('utc', now())) at time zone 'utc';
  v_bucket_key text;
  v_limit integer := greatest(1, least(coalesce(p_limit, 9), 12));
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;
  select profile.* into v_viewer
  from public.profiles profile
  where profile.user_id = auth.uid()
    and profile.deleted_at is null
    and profile.account_state = 'active'
  limit 1;
  if v_viewer.id is null then
    raise exception 'profile required' using errcode = '42501';
  end if;

  v_compass := case
    when jsonb_typeof(coalesce(v_viewer.relationship_compass, '{}')) = 'object'
      then coalesce(v_viewer.relationship_compass, '{}')
    else '{}'::jsonb
  end;
  if v_compass = '{}'::jsonb then return; end if;
  v_bucket_key := to_char(timezone('utc', now()), 'YYYY-MM-DD') || ':' ||
    substring(md5(coalesce(v_compass ->> 'updatedAt', 'initial')) from 1 for 12);

  if not exists (
    select 1 from public.profile_recommendation_batches batch
    where batch.viewer_profile_id = v_viewer.id
      and batch.surface = 'relationship_compass'
      and batch.context_key = ''
      and batch.bucket_key = v_bucket_key
  ) then
    insert into public.profile_recommendation_batches (
      viewer_profile_id, surface, context_key, bucket_key, candidate_profile_id, rank
    )
    with eligible as (
      select
        candidate.id,
        candidate.last_active,
        coalesce(candidate.verification_level, 0) as verification_level,
        coalesce(shared_interests.count, 0)::integer as shared_interest_count,
        exposure.last_prior_impression_at,
        (
          case
            when v_compass ->> 'intention' = 'marriage'
              and lower(coalesce(candidate.looking_for, '')) ~ '(marriage|serious|long)' then 22
            when v_compass ->> 'intention' = 'long_term'
              and lower(coalesce(candidate.looking_for, '')) ~ '(long|serious|partner|marriage)' then 19
            when v_compass ->> 'intention' = 'serious'
              and lower(coalesce(candidate.looking_for, '')) ~ '(serious|long|marriage|relationship)' then 17
            when v_compass ->> 'intention' = 'open'
              and lower(coalesce(candidate.looking_for, '')) ~ '(open|see|chemistry|friend)' then 10
            else 2
          end
          + case
              when nullif(btrim(coalesce(v_compass #>> '{geography,city}', '')), '') is not null
                and lower(coalesce(candidate.city, candidate.location, '')) like
                  '%' || lower(btrim(v_compass #>> '{geography,city}')) || '%' then 20
              when v_compass #>> '{geography,mode}' in ('nearby', 'same_city')
                and lower(coalesce(candidate.city, candidate.location, '')) =
                  lower(coalesce(v_viewer.city, v_viewer.location, '')) then 16
              when v_compass #>> '{geography,mode}' = 'uk'
                and lower(coalesce(candidate.current_country_code, candidate.current_country, '')) in
                  ('gb', 'uk', 'united kingdom') then 15
              when v_compass #>> '{geography,mode}' = 'ghana_diaspora'
                and (
                  lower(coalesce(candidate.current_country_code, candidate.current_country, '')) in ('gh', 'ghana')
                  or lower(coalesce(candidate.current_country_code, candidate.current_country, '')) =
                    lower(coalesce(v_viewer.current_country_code, v_viewer.current_country, ''))
                ) then 14
              when v_compass #>> '{geography,mode}' = 'long_distance' then 6
              else 0
            end
          + case when candidate.religion is not null and candidate.religion = v_viewer.religion then
              case v_compass #>> '{priorities,religion}' when 'essential' then 15 when 'nice' then 8 else 0 end
            else 0 end
          + case when candidate.wants_children is not null and
              lower(candidate.wants_children) = lower(coalesce(v_viewer.wants_children, '')) then
              case v_compass #>> '{priorities,family}' when 'essential' then 13 when 'nice' then 7 else 0 end
            else 0 end
          + least(coalesce(shared_interests.count, 0), 4) *
            case v_compass #>> '{priorities,interests}' when 'essential' then 6 when 'nice' then 3 else 1 end
          + case when lower(coalesce(candidate.smoking, '')) = lower(coalesce(v_viewer.smoking, ''))
                    and nullif(btrim(coalesce(candidate.smoking, '')), '') is not null then 3 else 0 end
          + case when lower(coalesce(candidate.drinking, '')) = lower(coalesce(v_viewer.drinking, ''))
                    and nullif(btrim(coalesce(candidate.drinking, '')), '') is not null then 3 else 0 end
          + case when v_compass #>> '{priorities,education}' <> 'open'
                    and nullif(btrim(coalesce(candidate.education, '')), '') is not null then 3 else 0 end
          + case when v_compass #>> '{priorities,career}' <> 'open'
                    and nullif(btrim(coalesce(candidate.occupation, '')), '') is not null then 3 else 0 end
          + least(coalesce(candidate.verification_level, 0), 3) * 3
          + case when candidate.last_active >= timezone('utc', now()) - interval '24 hours' then 8
                 when candidate.last_active >= timezone('utc', now()) - interval '7 days' then 4 else 0 end
          + (get_byte(decode(md5(v_viewer.id::text || candidate.id::text || v_bucket_key), 'hex'), 0)::numeric / 255) * 4
        )::numeric as compass_score
      from public.profiles candidate
      left join lateral (
        select count(*) as count
        from public.profile_interests candidate_interest
        join public.profile_interests viewer_interest
          on viewer_interest.profile_id = v_viewer.id
         and viewer_interest.interest_id = candidate_interest.interest_id
        where candidate_interest.profile_id = candidate.id
      ) shared_interests on true
      left join lateral (
        select max(event_row.created_at) as last_prior_impression_at
        from public.profile_recommendation_events event_row
        where event_row.viewer_profile_id = v_viewer.id
          and event_row.candidate_profile_id = candidate.id
          and event_row.surface = 'relationship_compass'
          and event_row.event_type = 'impression'
          and event_row.created_at < v_bucket_start
      ) exposure on true
      where public.is_romantically_eligible(v_viewer.id, candidate.id, 'global', null)
        and (
          v_compass #>> '{flexibility,verified}' <> 'must'
          or coalesce(candidate.verification_level, 0) > 0
        )
        and (
          v_compass #>> '{flexibility,religion}' <> 'must'
          or (v_viewer.religion is not null and candidate.religion = v_viewer.religion)
        )
        and (
          v_compass #>> '{flexibility,children}' <> 'must'
          or (
            nullif(btrim(coalesce(v_viewer.wants_children, '')), '') is not null
            and lower(candidate.wants_children) = lower(v_viewer.wants_children)
          )
        )
        and not exists (
          select 1 from public.matches match_row
          where lower(coalesce(match_row.status::text, '')) in ('pending', 'accepted')
            and ((match_row.user1_id = v_viewer.id and match_row.user2_id = candidate.id)
              or (match_row.user2_id = v_viewer.id and match_row.user1_id = candidate.id))
        )
        and not exists (
          select 1 from public.intent_requests request_row
          where ((request_row.actor_id = v_viewer.id and request_row.recipient_id = candidate.id)
              or (request_row.recipient_id = v_viewer.id and request_row.actor_id = candidate.id))
            and (
              request_row.status in ('pending', 'accepted', 'matched')
              or (request_row.status = 'passed' and request_row.created_at > timezone('utc', now()) - interval '21 days')
            )
        )
        and not exists (
          select 1
          from public.swipes swipe_row
          where swipe_row.swiper_id = v_viewer.id
            and swipe_row.target_id = candidate.id
            and upper(swipe_row.action::text) = 'PASS'
            and swipe_row.created_at > timezone('utc', now()) - interval '30 days'
        )
    ), ranked as (
      select eligible.*,
        row_number() over (
          order by
            case
              when eligible.last_prior_impression_at is null then 0
              when eligible.last_prior_impression_at < v_bucket_start - interval '21 days' then 1
              when eligible.last_prior_impression_at < v_bucket_start - interval '7 days' then 2
              else 3
            end,
            eligible.compass_score desc,
            eligible.last_active desc nulls last,
            eligible.id
        )::integer as delivery_rank
      from eligible
    )
    select v_viewer.id, 'relationship_compass', '', v_bucket_key, ranked.id, ranked.delivery_rank
    from ranked
    where ranked.delivery_rank <= 36
    on conflict do nothing;
  end if;

  return query
  select
    candidate.id, candidate.user_id, candidate.full_name, candidate.avatar_url,
    candidate.photos, candidate.looking_for, candidate.current_country,
    candidate.current_country_code, candidate.city, candidate.location,
    candidate.region, candidate.religion, candidate.gender,
    candidate.has_children, candidate.wants_children, candidate.verification_level
  from public.profile_recommendation_batches batch
  join public.profiles candidate on candidate.id = batch.candidate_profile_id
  where batch.viewer_profile_id = v_viewer.id
    and batch.surface = 'relationship_compass'
    and batch.context_key = ''
    and batch.bucket_key = v_bucket_key
    and public.is_romantically_eligible(v_viewer.id, candidate.id, 'global', null)
    and not exists (
      select 1 from public.matches match_row
      where lower(coalesce(match_row.status::text, '')) in ('pending', 'accepted')
        and ((match_row.user1_id = v_viewer.id and match_row.user2_id = candidate.id)
          or (match_row.user2_id = v_viewer.id and match_row.user1_id = candidate.id))
    )
    and not exists (
      select 1 from public.intent_requests request_row
      where ((request_row.actor_id = v_viewer.id and request_row.recipient_id = candidate.id)
          or (request_row.recipient_id = v_viewer.id and request_row.actor_id = candidate.id))
        and request_row.status in ('pending', 'accepted', 'matched')
    )
  order by batch.rank
  limit v_limit;
end;
$$;

revoke all on function public.rpc_get_relationship_compass_profiles(integer) from public, anon;
grant execute on function public.rpc_get_relationship_compass_profiles(integer) to authenticated;

notify pgrst, 'reload schema';

commit;
