-- Stable Circle Home Picks and daily Circle discovery ordering.
-- Requires 20260901133000_recommendation_rotation_foundation.sql.

begin;

-- Circle Home Picks use a 72-hour field. The existing compatibility model is
-- the seed; batching prevents a freshly logged impression from changing the
-- portraits on the next render.
create or replace function public.rpc_get_circle_home_picks_v2(p_limit integer default 6)
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
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
#variable_conflict use_column
declare
  v_viewer_id uuid;
  v_bucket_start timestamptz := to_timestamp(
    floor(extract(epoch from timezone('utc', now())) / 259200) * 259200
  );
  v_bucket_key text := floor(extract(epoch from timezone('utc', now())) / 259200)::bigint::text;
  v_limit integer := greatest(1, least(coalesce(p_limit, 6), 12));
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select profile.id into v_viewer_id
  from public.profiles profile
  where profile.user_id = auth.uid() and profile.deleted_at is null
    and profile.account_state = 'active'
  limit 1;
  if v_viewer_id is null then return; end if;

  if not exists (
    select 1 from public.profile_recommendation_batches batch
    where batch.viewer_profile_id = v_viewer_id
      and batch.surface = 'circle_home_picks'
      and batch.context_key = ''
      and batch.bucket_key = v_bucket_key
  ) then
    insert into public.profile_recommendation_batches (
      viewer_profile_id, surface, context_key, bucket_key, candidate_profile_id, rank, metadata
    )
    with seed as (
      select base.*, base.ordinality::integer as source_rank
      from public.rpc_get_circle_home_picks(12) with ordinality as base
    ), ranked as (
      select seed.*,
        exposure.last_prior_impression_at,
        row_number() over (
          order by
            case
              when exposure.last_prior_impression_at is null then 0
              when exposure.last_prior_impression_at < v_bucket_start - interval '14 days' then 1
              when exposure.last_prior_impression_at < v_bucket_start - interval '72 hours' then 2
              else 3
            end,
            seed.source_rank,
            seed.profile_id
        )::integer as delivery_rank
      from seed
      left join lateral (
        select max(event_row.created_at) as last_prior_impression_at
        from public.circle_discovery_events event_row
        where event_row.viewer_profile_id = v_viewer_id
          and event_row.target_profile_id = seed.profile_id
          and event_row.event_type = 'candidate_impression'
          and event_row.metadata ->> 'surface' = 'circle_home_picks'
          and event_row.created_at < v_bucket_start
      ) exposure on true
    )
    select v_viewer_id, 'circle_home_picks', '', v_bucket_key,
      ranked.profile_id, ranked.delivery_rank,
      jsonb_build_object('circle_id', ranked.circle_id)
    from ranked
    on conflict do nothing;
  end if;

  return query
  with seed as (
    select base.* from public.rpc_get_circle_home_picks(12) base
  )
  select seed.profile_id, seed.full_name, seed.age, seed.avatar_url,
    seed.circle_id, seed.circle_name, seed.reason
  from public.profile_recommendation_batches batch
  join seed on seed.profile_id = batch.candidate_profile_id
  where batch.viewer_profile_id = v_viewer_id
    and batch.surface = 'circle_home_picks'
    and batch.context_key = ''
    and batch.bucket_key = v_bucket_key
  order by batch.rank
  limit v_limit;
end;
$$;

revoke all on function public.rpc_get_circle_home_picks_v2(integer) from public, anon;
grant execute on function public.rpc_get_circle_home_picks_v2(integer) to authenticated;

-- Circle discovery remains a complete eligible member list. The daily batch
-- stabilizes order and rotates the front of the list without removing members.
create or replace function public.rpc_get_circle_dating_candidates_v2(
  p_circle_id uuid,
  p_limit integer default 40
)
returns table (
  profile_id uuid,
  full_name text,
  age integer,
  avatar_url text,
  city text,
  country text,
  looking_for text,
  verification_level integer,
  reason text
)
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
#variable_conflict use_column
declare
  v_viewer_id uuid;
  v_bucket_start timestamptz := date_trunc('day', timezone('utc', now())) at time zone 'utc';
  v_bucket_key text := to_char(timezone('utc', now()), 'YYYY-MM-DD');
  v_context_key text := coalesce(p_circle_id::text, '');
  v_limit integer := greatest(1, least(coalesce(p_limit, 40), 40));
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select profile.id into v_viewer_id
  from public.profiles profile
  where profile.user_id = auth.uid() and profile.deleted_at is null
    and profile.account_state = 'active'
  limit 1;
  if v_viewer_id is null then return; end if;

  if not exists (
    select 1 from public.profile_recommendation_batches batch
    where batch.viewer_profile_id = v_viewer_id
      and batch.surface = 'circle_discovery'
      and batch.context_key = v_context_key
      and batch.bucket_key = v_bucket_key
  ) then
    insert into public.profile_recommendation_batches (
      viewer_profile_id, surface, context_key, bucket_key, candidate_profile_id, rank
    )
    with seed as (
      select base.*, base.ordinality::integer as source_rank
      from public.rpc_get_circle_dating_candidates(p_circle_id, 40) with ordinality as base
    ), ranked as (
      select seed.*,
        exposure.last_prior_impression_at,
        row_number() over (
          order by
            case
              when exposure.last_prior_impression_at is null then 0
              when exposure.last_prior_impression_at < v_bucket_start - interval '14 days' then 1
              when exposure.last_prior_impression_at < v_bucket_start - interval '3 days' then 2
              else 3
            end,
            seed.source_rank,
            seed.profile_id
        )::integer as delivery_rank
      from seed
      left join lateral (
        select max(event_row.created_at) as last_prior_impression_at
        from public.circle_discovery_events event_row
        where event_row.circle_id = p_circle_id
          and event_row.viewer_profile_id = v_viewer_id
          and event_row.target_profile_id = seed.profile_id
          and event_row.event_type = 'candidate_impression'
          and coalesce(event_row.metadata ->> 'surface', 'circle_discover') = 'circle_discover'
          and event_row.created_at < v_bucket_start
      ) exposure on true
    )
    select v_viewer_id, 'circle_discovery', v_context_key, v_bucket_key,
      ranked.profile_id, ranked.delivery_rank
    from ranked
    on conflict do nothing;
  end if;

  return query
  with seed as (
    select base.* from public.rpc_get_circle_dating_candidates(p_circle_id, 40) base
  )
  select seed.profile_id, seed.full_name, seed.age, seed.avatar_url,
    seed.city, seed.country, seed.looking_for, seed.verification_level, seed.reason
  from public.profile_recommendation_batches batch
  join seed on seed.profile_id = batch.candidate_profile_id
  where batch.viewer_profile_id = v_viewer_id
    and batch.surface = 'circle_discovery'
    and batch.context_key = v_context_key
    and batch.bucket_key = v_bucket_key
  order by batch.rank
  limit v_limit;
end;
$$;

revoke all on function public.rpc_get_circle_dating_candidates_v2(uuid, integer) from public, anon;
grant execute on function public.rpc_get_circle_dating_candidates_v2(uuid, integer) to authenticated;

notify pgrst, 'reload schema';

commit;
