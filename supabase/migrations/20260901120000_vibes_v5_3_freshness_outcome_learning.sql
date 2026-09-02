-- Vibes V5.3: freshness, session attribution, contextual taste, and outcome learning.
--
-- Supabase remains the product authority. The client supplies opaque request/session
-- identifiers, while eligibility, ordering, exposure state, and learning live here.

create table if not exists public.vibes_v5_3_requests (
  id uuid primary key,
  client_session_id uuid not null,
  viewer_profile_id uuid not null references public.profiles(id) on delete cascade,
  segment text not null check (segment in ('for_you', 'nearby', 'active_now')),
  refresh_ordinal integer not null default 0 check (refresh_ordinal >= 0),
  candidate_count integer not null default 0 check (candidate_count >= 0),
  model text not null default 'freshness_outcome_hybrid_3',
  created_at timestamptz not null default timezone('utc', now()),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists vibes_v5_3_requests_viewer_session_idx
  on public.vibes_v5_3_requests (viewer_profile_id, client_session_id, created_at desc);

create table if not exists public.vibes_v5_3_recommendations (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.vibes_v5_3_requests(id) on delete cascade,
  viewer_profile_id uuid not null references public.profiles(id) on delete cascade,
  target_profile_id uuid not null references public.profiles(id) on delete cascade,
  segment text not null check (segment in ('for_you', 'nearby', 'active_now')),
  rank integer not null check (rank > 0),
  score numeric,
  is_exploration boolean not null default false,
  freshness_bucket text not null default 'unseen',
  recommended_at timestamptz not null default timezone('utc', now()),
  shown_at timestamptz,
  closed_at timestamptz,
  dwell_ms integer check (dwell_ms is null or dwell_ms >= 0),
  outcome text check (outcome is null or outcome in (
    'pass', 'like', 'signal', 'intent', 'profile_open', 'intro_complete', 'dismissed'
  )),
  metadata jsonb not null default '{}'::jsonb,
  unique (request_id, target_profile_id)
);

create index if not exists vibes_v5_3_recommendations_freshness_idx
  on public.vibes_v5_3_recommendations (
    viewer_profile_id, target_profile_id, shown_at desc
  ) where shown_at is not null;

create index if not exists vibes_v5_3_recommendations_session_idx
  on public.vibes_v5_3_recommendations (viewer_profile_id, request_id, rank);

create table if not exists public.vibes_v5_3_client_events (
  client_event_id uuid primary key,
  viewer_profile_id uuid not null references public.profiles(id) on delete cascade,
  accepted_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.vibes_v5_3_feature_weights (
  viewer_profile_id uuid not null references public.profiles(id) on delete cascade,
  context text not null check (context in ('for_you', 'nearby', 'active_now', 'outcome')),
  feature_key text not null,
  feature_value text not null,
  weight double precision not null default 0,
  evidence_count integer not null default 0,
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (viewer_profile_id, context, feature_key, feature_value)
);

create index if not exists vibes_v5_3_feature_weights_lookup_idx
  on public.vibes_v5_3_feature_weights (
    viewer_profile_id, context, feature_key, feature_value
  );

alter table public.vibes_v5_3_requests enable row level security;
alter table public.vibes_v5_3_recommendations enable row level security;
alter table public.vibes_v5_3_client_events enable row level security;
alter table public.vibes_v5_3_feature_weights enable row level security;

revoke all on table public.vibes_v5_3_requests from public, anon, authenticated;
revoke all on table public.vibes_v5_3_recommendations from public, anon, authenticated;
revoke all on table public.vibes_v5_3_client_events from public, anon, authenticated;
revoke all on table public.vibes_v5_3_feature_weights from public, anon, authenticated;
grant select, insert, update, delete on table public.vibes_v5_3_requests to service_role;
grant select, insert, update, delete on table public.vibes_v5_3_recommendations to service_role;
grant select, insert, update, delete on table public.vibes_v5_3_client_events to service_role;
grant select, insert, update, delete on table public.vibes_v5_3_feature_weights to service_role;

create or replace function public.refresh_vibes_v5_3_contextual_taste(
  p_viewer_profile_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_viewer_user_id uuid;
  v_rows integer := 0;
begin
  select profile.user_id
    into v_viewer_user_id
  from public.profiles profile
  where profile.id = p_viewer_profile_id
    and profile.deleted_at is null
  limit 1;

  if v_viewer_user_id is null then
    return 0;
  end if;

  delete from public.vibes_v5_3_feature_weights weights
  where weights.viewer_profile_id = p_viewer_profile_id;

  with event_window as materialized (
    select
      event_row.target_profile_id,
      event_row.segment,
      event_row.event_type,
      event_row.dwell_ms,
      event_row.created_at
    from public.vibes_events event_row
    where event_row.viewer_profile_id = p_viewer_profile_id
      and event_row.target_profile_id is not null
      and event_row.created_at >= timezone('utc', now()) - interval '180 days'
  ),
  latest_decision as (
    select distinct on (event_row.target_profile_id, event_row.segment)
      event_row.target_profile_id,
      event_row.segment as context,
      event_row.created_at,
      case event_row.event_type
        when 'intent_sent' then 1.00
        when 'signal_sent' then 0.90
        when 'like' then 0.75
        when 'profile_saved' then 0.55
        when 'profile_unsaved' then -0.35
        when 'pass' then -0.85
        when 'undo' then 0.00
        else 0.00
      end::double precision as score
    from event_window event_row
    where event_row.event_type in (
      'intent_sent', 'signal_sent', 'like', 'profile_saved',
      'profile_unsaved', 'pass', 'undo'
    )
    order by event_row.target_profile_id, event_row.segment, event_row.created_at desc
  ),
  engagement as (
    select
      event_row.target_profile_id,
      event_row.segment as context,
      max(case event_row.event_type
        when 'intro_completed' then 0.28
        when 'full_profile_opened' then 0.16
        when 'intro_played' then 0.12
        when 'profile_opened' then
          case
            when coalesce(event_row.dwell_ms, 0) >= 12000 then 0.14
            when coalesce(event_row.dwell_ms, 0) >= 4000 then 0.10
            else 0.06
          end
        when 'card_seen' then
          case when coalesce(event_row.dwell_ms, 0) >= 12000 then 0.06 else 0.00 end
        else 0.00
      end)::double precision as score,
      max(event_row.created_at) as created_at
    from event_window event_row
    group by event_row.target_profile_id, event_row.segment
  ),
  segment_observations as (
    select
      engagement.target_profile_id,
      engagement.context,
      coalesce(decision.score, engagement.score)
        * exp(-greatest(
            extract(epoch from (timezone('utc', now()) - coalesce(decision.created_at, engagement.created_at))) / 86400.0,
            0
          ) / 75.0) as score
    from engagement
    left join latest_decision decision
      on decision.target_profile_id = engagement.target_profile_id
     and decision.context = engagement.context
  ),
  accepted_intents as (
    select
      case
        when request.actor_id = p_viewer_profile_id then request.recipient_id
        else request.actor_id
      end as target_profile_id,
      case when request.status = 'matched' then 1.00 else 0.82 end::double precision as score,
      request.created_at
    from public.intent_requests request
    where request.status in ('accepted', 'matched')
      and (request.actor_id = p_viewer_profile_id or request.recipient_id = p_viewer_profile_id)
  ),
  accepted_matches as (
    select
      case
        when match_row.user1_id = p_viewer_profile_id then match_row.user2_id
        else match_row.user1_id
      end as target_profile_id,
      1.00::double precision as score,
      match_row.updated_at as created_at
    from public.matches match_row
    where match_row.status::text = 'ACCEPTED'
      and (match_row.user1_id = p_viewer_profile_id or match_row.user2_id = p_viewer_profile_id)
  ),
  conversation_pairs as (
    select
      peer_profile.id as target_profile_id,
      count(*)::integer as message_count,
      count(*) filter (where message.sender_id = v_viewer_user_id)::integer as sent_count,
      count(*) filter (where message.receiver_id = v_viewer_user_id)::integer as received_count,
      min(message.created_at) as first_message_at,
      max(message.created_at) as last_message_at
    from public.messages message
    join public.profiles peer_profile
      on peer_profile.user_id = case
        when message.sender_id = v_viewer_user_id then message.receiver_id
        else message.sender_id
      end
     and peer_profile.deleted_at is null
    where (message.sender_id = v_viewer_user_id or message.receiver_id = v_viewer_user_id)
      and message.deleted_for_all = false
      and message.created_at >= timezone('utc', now()) - interval '365 days'
    group by peer_profile.id
  ),
  conversation_outcomes as (
    select
      pair.target_profile_id,
      case
        when pair.message_count >= 6
          and pair.sent_count >= 2
          and pair.received_count >= 2
          and pair.last_message_at - pair.first_message_at >= interval '2 hours' then 1.00
        when pair.message_count >= 3
          and pair.sent_count >= 1
          and pair.received_count >= 1 then 0.58
        else 0.00
      end::double precision as score,
      pair.last_message_at as created_at
    from conversation_pairs pair
  ),
  outcome_observations as (
    select
      outcome.target_profile_id,
      'outcome'::text as context,
      greatest(0.0, least(1.0, max(outcome.score)))
        * exp(-greatest(
            extract(epoch from (timezone('utc', now()) - max(outcome.created_at))) / 86400.0,
            0
          ) / 180.0) as score
    from (
      select * from accepted_intents
      union all select * from accepted_matches
      union all select * from conversation_outcomes
    ) outcome
    where outcome.target_profile_id is not null
      and outcome.score > 0
    group by outcome.target_profile_id
  ),
  observations as (
    select * from segment_observations
    union all
    select * from outcome_observations
  ),
  observation_features as (
    select distinct
      observation.target_profile_id,
      observation.context,
      observation.score,
      feature.feature_key,
      feature.feature_value
    from observations observation
    join public.profiles target
      on target.id = observation.target_profile_id
     and target.deleted_at is null
    cross join lateral (
      select 'intention'::text, public.normalize_vibes_v5_intention(target.looking_for)
      union all select 'personality', nullif(lower(btrim(target.personality_type)), '')
      union all select 'religion', nullif(lower(btrim(target.religion::text)), '')
      union all select 'smoking', nullif(lower(btrim(target.smoking)), '')
      union all select 'drinking', nullif(lower(btrim(target.drinking)), '')
      union all select 'exercise', nullif(lower(btrim(target.exercise_frequency)), '')
      union all select 'children', nullif(lower(btrim(target.wants_children)), '')
      union all select 'love_language', nullif(lower(btrim(target.love_language)), '')
      union all select 'intro_media', case when nullif(btrim(target.profile_video), '') is not null then 'yes' end
      union all
      select 'interest', nullif(lower(btrim(interest.name)), '')
      from public.profile_interests profile_interest
      join public.interests interest on interest.id = profile_interest.interest_id
      where profile_interest.profile_id = target.id
    ) feature(feature_key, feature_value)
    where feature.feature_value is not null
      and feature.feature_value not in (
        'not sure', 'not sure yet', 'other', 'unknown', 'n/a',
        'prefer not to say', 'rather not say'
      )
  ),
  context_baseline as (
    select context, avg(score)::double precision as score
    from observations
    group by context
  ),
  aggregated as (
    select
      feature.context,
      feature.feature_key,
      feature.feature_value,
      count(*)::integer as evidence_count,
      avg(feature.score - baseline.score)::double precision as centred_score
    from observation_features feature
    join context_baseline baseline on baseline.context = feature.context
    group by feature.context, feature.feature_key, feature.feature_value
  )
  insert into public.vibes_v5_3_feature_weights (
    viewer_profile_id,
    context,
    feature_key,
    feature_value,
    weight,
    evidence_count,
    updated_at
  )
  select
    p_viewer_profile_id,
    aggregated.context,
    aggregated.feature_key,
    aggregated.feature_value,
    greatest(-0.75, least(0.75,
      aggregated.centred_score
        * aggregated.evidence_count::double precision
        / (aggregated.evidence_count + case when aggregated.feature_key = 'interest' then 6.0 else 8.0 end)
    )),
    aggregated.evidence_count,
    timezone('utc', now())
  from aggregated
  where aggregated.evidence_count > 0;

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

revoke all on function public.refresh_vibes_v5_3_contextual_taste(uuid) from public, anon, authenticated;
grant execute on function public.refresh_vibes_v5_3_contextual_taste(uuid) to service_role;

-- Queue contextual refreshes when authoritative downstream outcomes change.
create or replace function public.trg_enqueue_vibes_v5_3_outcome_refresh()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_profile_ids uuid[] := '{}'::uuid[];
begin
  if tg_table_name = 'messages' then
    select coalesce(array_agg(distinct profile.id), '{}'::uuid[])
      into v_profile_ids
    from public.profiles profile
    where profile.user_id in (new.sender_id, new.receiver_id)
      and profile.deleted_at is null;
  elsif tg_table_name = 'matches' then
    v_profile_ids := array[new.user1_id, new.user2_id];
  elsif tg_table_name = 'intent_requests' then
    v_profile_ids := array[new.actor_id, new.recipient_id];
  end if;

  insert into public.vibes_v5_taste_refresh_queue (
    viewer_profile_id, requested_at, attempts, last_error
  )
  select distinct profile_id, timezone('utc', now()), 0, null
  from unnest(v_profile_ids) profile_id
  where profile_id is not null
  on conflict (viewer_profile_id) do update
    set requested_at = excluded.requested_at,
        attempts = 0,
        last_error = null;

  return new;
end;
$$;

drop trigger if exists vibes_v5_3_refresh_from_messages on public.messages;
create trigger vibes_v5_3_refresh_from_messages
after insert on public.messages
for each row execute function public.trg_enqueue_vibes_v5_3_outcome_refresh();

drop trigger if exists vibes_v5_3_refresh_from_matches on public.matches;
create trigger vibes_v5_3_refresh_from_matches
after insert or update of status on public.matches
for each row execute function public.trg_enqueue_vibes_v5_3_outcome_refresh();

drop trigger if exists vibes_v5_3_refresh_from_intents on public.intent_requests;
create trigger vibes_v5_3_refresh_from_intents
after insert or update of status on public.intent_requests
for each row execute function public.trg_enqueue_vibes_v5_3_outcome_refresh();

revoke all on function public.trg_enqueue_vibes_v5_3_outcome_refresh() from public, anon, authenticated;

-- Dwell updates must refresh both the pair summary and V5 taste snapshots.
drop trigger if exists vibes_v5_enqueue_taste_refresh on public.vibes_events;
create trigger vibes_v5_enqueue_taste_refresh
after insert or update of dwell_ms, metadata on public.vibes_events
for each row execute function public.trg_enqueue_vibes_v5_taste_refresh();

create or replace function public.rpc_process_vibes_v5_taste_jobs(p_limit integer default 100)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_job record;
  v_processed integer := 0;
  v_failed integer := 0;
begin
  for v_job in
    select queue.viewer_profile_id
    from public.vibes_v5_taste_refresh_queue queue
    where queue.requested_at <= timezone('utc', now())
    order by queue.requested_at asc
    limit greatest(1, least(coalesce(p_limit, 100), 500))
    for update skip locked
  loop
    begin
      perform public.refresh_vibes_v5_3_contextual_taste(v_job.viewer_profile_id);
      perform public.refresh_vibes_v5_viewer_taste(v_job.viewer_profile_id);
      v_processed := v_processed + 1;
    exception when others then
      update public.vibes_v5_taste_refresh_queue queue
      set attempts = queue.attempts + 1,
          last_error = left(sqlerrm, 500),
          requested_at = case
            when queue.attempts >= 4 then timezone('utc', now()) + interval '24 hours'
            else timezone('utc', now()) + make_interval(mins => least(60, (queue.attempts + 1) * 5))
          end
      where queue.viewer_profile_id = v_job.viewer_profile_id;
      v_failed := v_failed + 1;
    end;
  end loop;

  delete from public.vibes_v5_3_client_events client_event
  where client_event.accepted_at < timezone('utc', now()) - interval '30 days';

  delete from public.vibes_v5_3_requests request
  where request.created_at < timezone('utc', now()) - interval '180 days';

  return jsonb_build_object(
    'processed', v_processed,
    'failed', v_failed,
    'remaining', (select count(*) from public.vibes_v5_taste_refresh_queue),
    'oldest_requested_at', (select min(requested_at) from public.vibes_v5_taste_refresh_queue)
  );
end;
$$;

revoke all on function public.rpc_process_vibes_v5_taste_jobs(integer) from public, anon, authenticated;
grant execute on function public.rpc_process_vibes_v5_taste_jobs(integer) to service_role;

-- Durable, idempotent event entry point. The existing authoritative RPC keeps
-- notification, block, and ownership semantics unchanged.
create or replace function public.rpc_log_vibes_event_v5_3(
  p_client_event_id uuid,
  p_viewer_profile_id uuid,
  p_target_profile_id uuid,
  p_segment text default 'for_you',
  p_event_type text default 'card_seen',
  p_position integer default null,
  p_dwell_ms integer default null,
  p_session_id uuid default null,
  p_request_id uuid default null,
  p_recommendation_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_inserted uuid;
begin
  if p_client_event_id is null then
    raise exception 'client_event_id_required';
  end if;

  insert into public.vibes_v5_3_client_events (
    client_event_id, viewer_profile_id
  )
  values (p_client_event_id, p_viewer_profile_id)
  on conflict (client_event_id) do nothing
  returning client_event_id into v_inserted;

  if v_inserted is null then
    if not exists (
      select 1
      from public.vibes_v5_3_client_events client_event
      join public.profiles viewer on viewer.id = client_event.viewer_profile_id
      where client_event.client_event_id = p_client_event_id
        and client_event.viewer_profile_id = p_viewer_profile_id
        and viewer.user_id = auth.uid()
        and viewer.deleted_at is null
    ) then
      raise exception 'client_event_owner_mismatch' using errcode = '42501';
    end if;
    return true;
  end if;

  perform public.rpc_log_vibes_event(
    p_viewer_profile_id,
    p_target_profile_id,
    p_segment,
    p_event_type,
    p_position,
    p_dwell_ms,
    coalesce(p_metadata, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
      'client_event_id', p_client_event_id,
      'session_id', p_session_id,
      'request_id', p_request_id,
      'recommendation_id', p_recommendation_id,
      'telemetry_version', 'v5.3'
    ))
  );

  return true;
end;
$$;

revoke all on function public.rpc_log_vibes_event_v5_3(
  uuid, uuid, uuid, text, text, integer, integer, uuid, uuid, uuid, jsonb
) from public, anon;
grant execute on function public.rpc_log_vibes_event_v5_3(
  uuid, uuid, uuid, text, text, integer, integer, uuid, uuid, uuid, jsonb
) to authenticated, service_role;

create or replace function public.rpc_mark_vibes_recommendation_seen(
  p_recommendation_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  update public.vibes_v5_3_recommendations recommendation
  set shown_at = coalesce(recommendation.shown_at, timezone('utc', now()))
  from public.profiles viewer
  where recommendation.id = p_recommendation_id
    and viewer.id = recommendation.viewer_profile_id
    and viewer.user_id = auth.uid()
    and viewer.deleted_at is null;

  return found;
end;
$$;

revoke all on function public.rpc_mark_vibes_recommendation_seen(uuid) from public, anon;
grant execute on function public.rpc_mark_vibes_recommendation_seen(uuid) to authenticated, service_role;

create or replace function public.rpc_close_vibes_recommendation(
  p_recommendation_id uuid,
  p_dwell_ms integer,
  p_outcome text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_viewer_profile_id uuid;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if p_outcome is not null and p_outcome not in (
    'pass', 'like', 'signal', 'intent', 'profile_open', 'intro_complete', 'dismissed'
  ) then
    raise exception 'invalid_vibes_outcome';
  end if;

  update public.vibes_v5_3_recommendations recommendation
  set shown_at = coalesce(recommendation.shown_at, timezone('utc', now())),
      closed_at = timezone('utc', now()),
      dwell_ms = greatest(coalesce(recommendation.dwell_ms, 0), greatest(coalesce(p_dwell_ms, 0), 0)),
      outcome = coalesce(p_outcome, recommendation.outcome),
      metadata = recommendation.metadata || coalesce(p_metadata, '{}'::jsonb)
  from public.profiles viewer
  where recommendation.id = p_recommendation_id
    and viewer.id = recommendation.viewer_profile_id
    and viewer.user_id = auth.uid()
    and viewer.deleted_at is null
  returning recommendation.viewer_profile_id into v_viewer_profile_id;

  if v_viewer_profile_id is null then
    return false;
  end if;

  -- Upgrade the initial card_seen row with the actual end-of-exposure dwell.
  update public.vibes_events event_row
  set dwell_ms = greatest(coalesce(event_row.dwell_ms, 0), greatest(coalesce(p_dwell_ms, 0), 0)),
      metadata = event_row.metadata || jsonb_build_object(
        'exposure_closed', true,
        'exposure_outcome', p_outcome
      )
  where event_row.id = (
    select candidate.id
    from public.vibes_events candidate
    where candidate.viewer_profile_id = v_viewer_profile_id
      and candidate.event_type = 'card_seen'
      and candidate.metadata->>'recommendation_id' = p_recommendation_id::text
    order by candidate.created_at desc
    limit 1
  );

  return true;
end;
$$;

revoke all on function public.rpc_close_vibes_recommendation(uuid, integer, text, jsonb) from public, anon;
grant execute on function public.rpc_close_vibes_recommendation(uuid, integer, text, jsonb) to authenticated, service_role;

create or replace function public.get_vibes_recommendations_v5_3(
  p_user_id uuid,
  p_segment text default 'for_you',
  p_limit integer default 30,
  p_active_window_minutes integer default 30,
  p_client_session_id uuid default null,
  p_request_id uuid default null,
  p_refresh_ordinal integer default 0
)
returns table (
  id uuid,
  user_id uuid,
  full_name text,
  age integer,
  bio text,
  avatar_url text,
  profile_video text,
  location text,
  latitude double precision,
  longitude double precision,
  region text,
  tribe text,
  religion text,
  personality_type text,
  is_active boolean,
  online boolean,
  last_active timestamptz,
  verified boolean,
  verification_level integer,
  ai_score numeric,
  distance_km double precision,
  city text,
  current_country text,
  current_country_code text,
  location_precision text,
  recommendation_reasons jsonb
)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
#variable_conflict use_column
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 30), 50));
  v_seed_limit integer;
  v_segment text := coalesce(nullif(btrim(p_segment), ''), 'for_you');
  v_session_id uuid := coalesce(p_client_session_id, gen_random_uuid());
  v_request_id uuid := coalesce(p_request_id, gen_random_uuid());
  v_exploration_count integer;
begin
  if auth.uid() is null then
    return;
  end if;

  if v_segment not in ('for_you', 'nearby', 'active_now') then
    return;
  end if;

  if not exists (
    select 1
    from public.profiles viewer
    where viewer.id = p_user_id
      and viewer.user_id = auth.uid()
      and viewer.deleted_at is null
  ) then
    return;
  end if;

  if not exists (
    select 1
    from public.vibes_v5_3_feature_weights weight
    where weight.viewer_profile_id = p_user_id
  ) and (
    exists (
      select 1 from public.vibes_events event_row
      where event_row.viewer_profile_id = p_user_id
      limit 1
    )
    or exists (
      select 1 from public.intent_requests request
      where request.actor_id = p_user_id or request.recipient_id = p_user_id
      limit 1
    )
  ) then
    perform public.refresh_vibes_v5_3_contextual_taste(p_user_id);
  end if;

  v_seed_limit := least(50, greatest(v_limit * 2, 36));
  v_exploration_count := greatest(1, ceil(v_limit * 0.12)::integer);

  return query
  with base as materialized (
    select recommendation.*
    from public.get_vibes_recommendations_v5(
      p_user_id,
      v_segment,
      v_seed_limit,
      p_active_window_minutes
    ) recommendation
  ),
  exposure_stats as (
    select
      recommendation.target_profile_id,
      max(recommendation.shown_at) as last_shown_at,
      count(*) filter (
        where recommendation.shown_at >= timezone('utc', now()) - interval '24 hours'
      )::integer as shown_1d,
      count(*) filter (
        where recommendation.shown_at >= timezone('utc', now()) - interval '7 days'
      )::integer as shown_7d,
      bool_or(
        recommendation.shown_at is not null
        and request.client_session_id = v_session_id
      ) as shown_in_session
    from public.vibes_v5_3_recommendations recommendation
    join public.vibes_v5_3_requests request on request.id = recommendation.request_id
    where recommendation.viewer_profile_id = p_user_id
      and recommendation.shown_at is not null
      and recommendation.recommended_at >= timezone('utc', now()) - interval '30 days'
    group by recommendation.target_profile_id
  ),
  pair_feedback as (
    select
      event_row.target_profile_id,
      count(*) filter (where event_row.event_type = 'profile_opened')::integer as opens,
      count(*) filter (where event_row.event_type = 'full_profile_opened')::integer as full_opens,
      count(*) filter (where event_row.event_type in ('intro_played', 'intro_completed'))::integer as intros,
      count(*) filter (where event_row.event_type in ('signal_opened', 'intent_opened'))::integer as action_opens,
      count(*) filter (where coalesce(event_row.dwell_ms, 0) >= 12000)::integer as long_dwells,
      avg(coalesce(event_row.dwell_ms, 0))::double precision as avg_dwell_ms
    from public.vibes_events event_row
    where event_row.viewer_profile_id = p_user_id
      and event_row.created_at >= timezone('utc', now()) - interval '30 days'
    group by event_row.target_profile_id
  ),
  contextual_score as (
    select
      base.id as target_profile_id,
      coalesce(sum(weight.weight), 0)::double precision as score,
      coalesce(sum(weight.evidence_count), 0)::integer as evidence_count
    from base
    join public.profiles candidate on candidate.id = base.id
    left join lateral (
      select feature.feature_key, feature.feature_value
      from (
        select 'intention'::text, public.normalize_vibes_v5_intention(candidate.looking_for)
        union all select 'personality', nullif(lower(btrim(candidate.personality_type)), '')
        union all select 'religion', nullif(lower(btrim(candidate.religion::text)), '')
        union all select 'smoking', nullif(lower(btrim(candidate.smoking)), '')
        union all select 'drinking', nullif(lower(btrim(candidate.drinking)), '')
        union all select 'exercise', nullif(lower(btrim(candidate.exercise_frequency)), '')
        union all select 'children', nullif(lower(btrim(candidate.wants_children)), '')
        union all select 'love_language', nullif(lower(btrim(candidate.love_language)), '')
        union all select 'intro_media', case when nullif(btrim(candidate.profile_video), '') is not null then 'yes' end
        union all
        select 'interest', nullif(lower(btrim(interest.name)), '')
        from public.profile_interests profile_interest
        join public.interests interest on interest.id = profile_interest.interest_id
        where profile_interest.profile_id = candidate.id
      ) feature(feature_key, feature_value)
      where feature.feature_value is not null
    ) feature on true
    left join public.vibes_v5_3_feature_weights weight
      on weight.viewer_profile_id = p_user_id
     and weight.context in (v_segment, 'outcome')
     and weight.feature_key = feature.feature_key
     and weight.feature_value = feature.feature_value
    group by base.id
  ),
  scored as (
    select
      base.*,
      coalesce(exposure.shown_in_session, false) as shown_in_session,
      exposure.last_shown_at,
      coalesce(exposure.shown_1d, 0) as shown_1d,
      coalesce(exposure.shown_7d, 0) as shown_7d,
      case
        when exposure.last_shown_at is null then 0
        when exposure.last_shown_at < timezone('utc', now()) - interval '14 days' then 1
        when exposure.last_shown_at < timezone('utc', now()) - interval '7 days' then 2
        when exposure.last_shown_at < timezone('utc', now()) - interval '72 hours' then 3
        when exposure.last_shown_at < timezone('utc', now()) - interval '24 hours' then 4
        else 5
      end as freshness_tier,
      case
        when exposure.last_shown_at is null then 'unseen'
        when exposure.last_shown_at < timezone('utc', now()) - interval '14 days' then 'rested'
        when exposure.last_shown_at < timezone('utc', now()) - interval '7 days' then 'week'
        when exposure.last_shown_at < timezone('utc', now()) - interval '72 hours' then 'recent'
        when exposure.last_shown_at < timezone('utc', now()) - interval '24 hours' then 'cooldown'
        else 'same_day'
      end as freshness_bucket,
      greatest(0.0, least(100.0,
        coalesce(base.ai_score, 0)::double precision
        -- Neutralise V3's exact-pair re-engagement loop. These signals still
        -- teach feature taste; they no longer force the same person back up.
        - 0.72 * (
          least(coalesce(pair.opens, 0), 3) * 2.8
          + least(coalesce(pair.full_opens, 0), 3) * 1.8
          + least(coalesce(pair.intros, 0), 2) * 2.0
          + least(coalesce(pair.action_opens, 0), 3) * 1.9
          + least(coalesce(pair.long_dwells, 0), 3) * 1.4
          + least(coalesce(pair.avg_dwell_ms, 0) / 4000.0, 1.5) * 1.8
        )
        + least(7.0, greatest(-4.0, coalesce(contextual.score, 0) * 4.0))
      )) as adjusted_score,
      row_number() over (
        order by
          case when exposure.last_shown_at is null then 0 else 1 end,
          abs(hashtext(base.id::text || v_session_id::text || v_request_id::text)),
          coalesce(base.ai_score, 0) desc
      ) as exploration_rank
    from base
    left join exposure_stats exposure on exposure.target_profile_id = base.id
    left join pair_feedback pair on pair.target_profile_id = base.id
    left join contextual_score contextual on contextual.target_profile_id = base.id
  ),
  marked as (
    select
      scored.*,
      (
        scored.exploration_rank <= v_exploration_count
        and scored.freshness_tier <= 2
        and coalesce(scored.ai_score, 0) >= 35
      ) as is_exploration
    from scored
  ),
  lane_ranked as (
    select
      marked.*,
      row_number() over (
        partition by marked.is_exploration
        order by
          marked.shown_in_session,
          marked.freshness_tier,
          marked.adjusted_score desc,
          marked.last_active desc nulls last,
          marked.id
      ) as lane_rank
    from marked
  ),
  interleaved as (
    select
      lane_ranked.*,
      case
        when lane_ranked.is_exploration then lane_ranked.lane_rank * 7
        else lane_ranked.lane_rank + floor((lane_ranked.lane_rank - 1) / 6.0)::integer
      end as delivery_slot
    from lane_ranked
  ),
  selected as materialized (
    select
      interleaved.*,
      row_number() over (
        order by interleaved.delivery_slot, interleaved.is_exploration, interleaved.id
      )::integer as final_rank
    from interleaved
    order by interleaved.delivery_slot, interleaved.is_exploration, interleaved.id
    limit v_limit
  ),
  request_write as (
    insert into public.vibes_v5_3_requests as stored_request (
      id,
      client_session_id,
      viewer_profile_id,
      segment,
      refresh_ordinal,
      candidate_count,
      metadata
    )
    values (
      v_request_id,
      v_session_id,
      p_user_id,
      v_segment,
      greatest(coalesce(p_refresh_ordinal, 0), 0),
      (select count(*)::integer from selected),
      jsonb_build_object('seed_count', (select count(*) from base))
    )
    on conflict on constraint vibes_v5_3_requests_pkey do update
      set candidate_count = excluded.candidate_count,
          metadata = stored_request.metadata || excluded.metadata
    returning stored_request.id
  ),
  recommendation_write as (
    insert into public.vibes_v5_3_recommendations as stored_recommendation (
      request_id,
      viewer_profile_id,
      target_profile_id,
      segment,
      rank,
      score,
      is_exploration,
      freshness_bucket,
      metadata
    )
    select
      request_write.id,
      p_user_id,
      selected.id,
      v_segment,
      selected.final_rank,
      selected.adjusted_score,
      selected.is_exploration,
      selected.freshness_bucket,
      jsonb_build_object(
        'shown_in_session_before', selected.shown_in_session,
        'shown_1d', selected.shown_1d,
        'shown_7d', selected.shown_7d
      )
    from selected
    cross join request_write
    on conflict (request_id, target_profile_id) do update
      set rank = excluded.rank,
          score = excluded.score,
          is_exploration = excluded.is_exploration,
          freshness_bucket = excluded.freshness_bucket,
          metadata = excluded.metadata
    returning stored_recommendation.id, stored_recommendation.target_profile_id
  )
  select
    selected.id,
    selected.user_id,
    selected.full_name,
    selected.age,
    selected.bio,
    selected.avatar_url,
    selected.profile_video,
    selected.location,
    null::double precision as latitude,
    null::double precision as longitude,
    selected.region,
    selected.tribe,
    selected.religion,
    selected.personality_type,
    selected.is_active,
    selected.online,
    selected.last_active,
    selected.verified,
    selected.verification_level,
    round(selected.adjusted_score::numeric) as ai_score,
    selected.distance_km,
    selected.city,
    selected.current_country,
    selected.current_country_code,
    selected.location_precision,
    coalesce(selected.recommendation_reasons, '{}'::jsonb)
      || jsonb_build_object(
        'version', 'v5.3',
        'model', 'freshness_outcome_hybrid_3',
        'segment', v_segment,
        'session_id', v_session_id,
        'request_id', v_request_id,
        'recommendation_id', recommendation_write.id,
        'rank', selected.final_rank,
        'exploration', selected.is_exploration,
        'freshness_bucket', selected.freshness_bucket
      ) as recommendation_reasons
  from selected
  join recommendation_write on recommendation_write.target_profile_id = selected.id
  order by selected.final_rank;
end;
$$;

revoke all on function public.get_vibes_recommendations_v5_3(
  uuid, text, integer, integer, uuid, uuid, integer
) from public, anon;
grant execute on function public.get_vibes_recommendations_v5_3(
  uuid, text, integer, integer, uuid, uuid, integer
) to authenticated, service_role;

comment on function public.get_vibes_recommendations_v5_3(
  uuid, text, integer, integer, uuid, uuid, integer
) is
  'V5.3 reciprocal recommender with unseen-first session delivery, graduated cooldowns, 12% interleaved exploration, exact-pair loop neutralisation, contextual taste, downstream outcome learning, and privacy-safe attribution.';

create or replace function public.rpc_get_vibes_v5_3_health()
returns jsonb
language sql
security definer
set search_path = public, pg_catalog
as $$
  select jsonb_build_object(
    'queue_depth', (select count(*) from public.vibes_v5_taste_refresh_queue),
    'queue_oldest_requested_at', (select min(requested_at) from public.vibes_v5_taste_refresh_queue),
    'queue_failed_jobs', (select count(*) from public.vibes_v5_taste_refresh_queue where attempts > 0),
    'requests_24h', (
      select count(*) from public.vibes_v5_3_requests
      where created_at >= timezone('utc', now()) - interval '24 hours'
    ),
    'shown_24h', (
      select count(*) from public.vibes_v5_3_recommendations
      where shown_at >= timezone('utc', now()) - interval '24 hours'
    ),
    'unique_pairs_24h', (
      select count(*) from (
        select distinct viewer_profile_id, target_profile_id
        from public.vibes_v5_3_recommendations
        where shown_at >= timezone('utc', now()) - interval '24 hours'
      ) pairs
    ),
    'avg_unique_profiles_per_session_24h', (
      select coalesce(avg(session_rollup.unique_targets), 0)
      from (
        select
          request.viewer_profile_id,
          request.client_session_id,
          count(distinct recommendation.target_profile_id)::numeric as unique_targets
        from public.vibes_v5_3_requests request
        join public.vibes_v5_3_recommendations recommendation
          on recommendation.request_id = request.id
         and recommendation.shown_at is not null
        where request.created_at >= timezone('utc', now()) - interval '24 hours'
        group by request.viewer_profile_id, request.client_session_id
      ) session_rollup
    ),
    'pass_rate_24h', (
      select coalesce(
        count(*) filter (where outcome = 'pass')::numeric / nullif(count(*), 0),
        0
      )
      from public.vibes_v5_3_recommendations
      where shown_at >= timezone('utc', now()) - interval '24 hours'
    ),
    'positive_action_rate_24h', (
      select coalesce(
        count(*) filter (where outcome in ('like', 'signal', 'intent'))::numeric / nullif(count(*), 0),
        0
      )
      from public.vibes_v5_3_recommendations
      where shown_at >= timezone('utc', now()) - interval '24 hours'
    ),
    'accepted_intents_24h', (
      select count(*)
      from public.intent_requests
      where status in ('accepted', 'matched')
        and created_at >= timezone('utc', now()) - interval '24 hours'
    ),
    'accepted_matches_24h', (
      select count(*)
      from public.matches
      where status::text = 'ACCEPTED'
        and updated_at >= timezone('utc', now()) - interval '24 hours'
    ),
    'two_way_conversations_7d', (
      select count(*)
      from (
        select
          least(message.sender_id::text, message.receiver_id::text) as peer_a,
          greatest(message.sender_id::text, message.receiver_id::text) as peer_b
        from public.messages message
        where message.created_at >= timezone('utc', now()) - interval '7 days'
          and message.deleted_for_all = false
        group by
          least(message.sender_id::text, message.receiver_id::text),
          greatest(message.sender_id::text, message.receiver_id::text)
        having count(*) >= 4 and count(distinct message.sender_id) = 2
      ) conversation
    ),
    'blocks_24h', (
      select count(*) from public.blocks
      where created_at >= timezone('utc', now()) - interval '24 hours'
    ),
    'reports_24h', (
      select count(*) from public.reports
      where created_at >= timezone('utc', now()) - interval '24 hours'
    ),
    'same_day_repeat_rate', (
      select coalesce(
        sum(greatest(daily.exposures - daily.unique_targets, 0))::numeric
          / nullif(sum(daily.exposures), 0),
        0
      )
      from (
        select
          viewer_profile_id,
          date_trunc('day', shown_at) as day,
          count(*) as exposures,
          count(distinct target_profile_id) as unique_targets
        from public.vibes_v5_3_recommendations
        where shown_at >= timezone('utc', now()) - interval '7 days'
        group by viewer_profile_id, date_trunc('day', shown_at)
      ) daily
    ),
    'generated_at', timezone('utc', now())
  );
$$;

revoke all on function public.rpc_get_vibes_v5_3_health() from public, anon, authenticated;
grant execute on function public.rpc_get_vibes_v5_3_health() to service_role;
