-- Cache the expensive legacy suggested-moves scoring result in the existing
-- daily delivery batch. Ranking and eligibility are unchanged.

begin;

create or replace function public.rpc_get_suggested_moves_v2(
  p_profile_id uuid,
  p_limit integer default 6
)
returns table (
  id uuid, full_name text, age integer, avatar_url text, short_tags text[],
  has_intro_video boolean, distance_km double precision,
  shared_interest_names text[], shared_interest_count integer,
  prompt_title text, prompt_answer text, bio_snippet text,
  same_region boolean, same_religion boolean, same_looking_for boolean,
  active_now boolean, recently_active boolean, candidate_tier integer,
  quality_band integer
)
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
#variable_conflict use_column
declare
  v_bucket_start timestamptz := date_trunc('day', timezone('utc', now())) at time zone 'utc';
  v_bucket_key text := to_char(timezone('utc', now()), 'YYYY-MM-DD');
  v_limit integer := greatest(1, least(coalesce(p_limit, 6), 12));
begin
  if auth.uid() is null or not exists (
    select 1 from public.profiles viewer
    where viewer.id = p_profile_id and viewer.user_id = auth.uid()
      and viewer.deleted_at is null and viewer.account_state = 'active'
  ) then
    raise exception 'viewer profile does not belong to authenticated user' using errcode = '42501';
  end if;

  -- Rebuild old-format batches once; new rows carry the immutable display
  -- payload so reads do not execute the scorer again.
  delete from public.profile_recommendation_batches batch
  where batch.viewer_profile_id = p_profile_id
    and batch.surface = 'intent_suggested'
    and batch.context_key = ''
    and batch.bucket_key = v_bucket_key
    and not (batch.metadata ? 'candidate');

  if not exists (
    select 1 from public.profile_recommendation_batches batch
    where batch.viewer_profile_id = p_profile_id
      and batch.surface = 'intent_suggested'
      and batch.context_key = ''
      and batch.bucket_key = v_bucket_key
  ) then
    insert into public.profile_recommendation_batches (
      viewer_profile_id, surface, context_key, bucket_key,
      candidate_profile_id, rank, metadata
    )
    with seed as (
      select base.*, base.ordinality::integer as source_rank
      from public.rpc_get_suggested_moves(
        p_profile_id, greatest(72, v_limit * 12)
      ) with ordinality as base
      where public.is_romantically_eligible(p_profile_id, base.id, 'global', null)
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
            seed.id
        )::integer as delivery_rank
      from seed
      left join lateral (
        select max(event_row.created_at) as last_prior_impression_at
        from public.suggested_move_events event_row
        where event_row.viewer_profile_id = p_profile_id
          and event_row.candidate_profile_id = seed.id
          and event_row.surface = 'intent_suggested'
          and event_row.event_type = 'impression'
          and event_row.created_at < v_bucket_start
      ) exposure on true
    )
    select p_profile_id, 'intent_suggested', '', v_bucket_key,
      ranked.id, ranked.delivery_rank,
      jsonb_build_object(
        'candidate', to_jsonb(ranked)
          - 'source_rank' - 'last_prior_impression_at' - 'delivery_rank'
      )
    from ranked
    where ranked.delivery_rank <= 36
    on conflict do nothing;
  end if;

  return query
  select
    batch.candidate_profile_id,
    batch.metadata #>> '{candidate,full_name}',
    (batch.metadata #>> '{candidate,age}')::integer,
    batch.metadata #>> '{candidate,avatar_url}',
    array(select jsonb_array_elements_text(coalesce(
      batch.metadata #> '{candidate,short_tags}', '[]'::jsonb
    ))),
    coalesce((batch.metadata #>> '{candidate,has_intro_video}')::boolean, false),
    (batch.metadata #>> '{candidate,distance_km}')::double precision,
    array(select jsonb_array_elements_text(coalesce(
      batch.metadata #> '{candidate,shared_interest_names}', '[]'::jsonb
    ))),
    coalesce((batch.metadata #>> '{candidate,shared_interest_count}')::integer, 0),
    batch.metadata #>> '{candidate,prompt_title}',
    batch.metadata #>> '{candidate,prompt_answer}',
    batch.metadata #>> '{candidate,bio_snippet}',
    coalesce((batch.metadata #>> '{candidate,same_region}')::boolean, false),
    coalesce((batch.metadata #>> '{candidate,same_religion}')::boolean, false),
    coalesce((batch.metadata #>> '{candidate,same_looking_for}')::boolean, false),
    coalesce((batch.metadata #>> '{candidate,active_now}')::boolean, false),
    coalesce((batch.metadata #>> '{candidate,recently_active}')::boolean, false),
    0::integer,
    coalesce((batch.metadata #>> '{candidate,quality_band}')::integer, 0)
  from public.profile_recommendation_batches batch
  where batch.viewer_profile_id = p_profile_id
    and batch.surface = 'intent_suggested'
    and batch.context_key = ''
    and batch.bucket_key = v_bucket_key
    and batch.metadata ? 'candidate'
  order by batch.rank
  limit v_limit;
end;
$$;

revoke all on function public.rpc_get_suggested_moves_v2(uuid, integer) from public, anon;
grant execute on function public.rpc_get_suggested_moves_v2(uuid, integer) to authenticated;

notify pgrst, 'reload schema';
commit;
