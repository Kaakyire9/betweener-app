create or replace function public.rpc_get_my_recent_boost_analytics()
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_viewer_profile_id uuid;
  boost_row record;
  unique_viewer_count integer := 0;
  view_count integer := 0;
  unique_intro_viewer_count integer := 0;
  intro_count integer := 0;
  unique_saver_count integer := 0;
  save_count integer := 0;
  unique_intent_viewer_count integer := 0;
  intent_count integer := 0;
  like_count integer := 0;
  accepted_match_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select p.id
    into v_viewer_profile_id
  from public.profiles p
  where p.user_id = auth.uid()
    and p.deleted_at is null
  limit 1;

  if v_viewer_profile_id is null then
    raise exception 'profile required';
  end if;

  select
    pb.id,
    pb.starts_at,
    pb.ends_at,
    pb.created_at,
    pb.boost_type,
    pb.audience_mode,
    pb.focus_mode,
    pb.status
    into boost_row
  from public.profile_boosts pb
  where pb.user_id = v_viewer_profile_id
    and pb.created_at > timezone('utc'::text, now()) - interval '30 days'
  order by pb.ends_at desc, pb.created_at desc
  limit 1;

  if boost_row.id is null then
    return jsonb_build_object(
      'has_boost', false,
      'analytics_meta', jsonb_build_object(
        'trust_filter', 'trusted_viewers_only',
        'is_trust_filtered', true
      ),
      'metrics', jsonb_build_object(
        'unique_viewers', 0,
        'views', 0,
        'unique_intro_viewers', 0,
        'intro_opens', 0,
        'unique_savers', 0,
        'saves', 0,
        'unique_intent_viewers', 0,
        'intent_opens', 0,
        'likes', 0,
        'accepted_matches', 0
      )
    );
  end if;

  select
    count(distinct event_row.viewer_profile_id) filter (
      where event_row.event_type in ('profile_opened', 'full_profile_opened')
        and event_row.viewer_profile_id is not null
    )::integer,
    count(*) filter (where event_row.event_type in ('profile_opened', 'full_profile_opened'))::integer,
    count(distinct event_row.viewer_profile_id) filter (
      where event_row.event_type in ('intro_played', 'intro_completed')
        and event_row.viewer_profile_id is not null
    )::integer,
    count(*) filter (where event_row.event_type in ('intro_played', 'intro_completed'))::integer,
    count(distinct event_row.viewer_profile_id) filter (
      where event_row.event_type = 'profile_saved'
        and event_row.viewer_profile_id is not null
    )::integer,
    count(*) filter (where event_row.event_type = 'profile_saved')::integer,
    count(distinct event_row.viewer_profile_id) filter (
      where event_row.event_type = 'intent_opened'
        and event_row.viewer_profile_id is not null
    )::integer,
    count(*) filter (where event_row.event_type = 'intent_opened')::integer,
    count(*) filter (where event_row.event_type = 'like')::integer
    into unique_viewer_count,
      view_count,
      unique_intro_viewer_count,
      intro_count,
      unique_saver_count,
      save_count,
      unique_intent_viewer_count,
      intent_count,
      like_count
  from public.vibes_events event_row
  where event_row.target_profile_id = v_viewer_profile_id
    and event_row.created_at >= boost_row.starts_at
    and event_row.created_at <= least(boost_row.ends_at, timezone('utc'::text, now()))
    and public.is_trusted_boost_viewer(event_row.viewer_profile_id, v_viewer_profile_id);

  select count(*)::integer
    into accepted_match_count
  from public.matches match_row
  cross join lateral (
    select case
      when match_row.user1_id = v_viewer_profile_id then match_row.user2_id
      else match_row.user1_id
    end as counterpart_profile_id
  ) counterpart
  where match_row.status = 'ACCEPTED'
    and match_row.updated_at >= boost_row.starts_at
    and match_row.updated_at <= least(boost_row.ends_at + interval '24 hours', timezone('utc'::text, now()))
    and (
      match_row.user1_id = v_viewer_profile_id
      or match_row.user2_id = v_viewer_profile_id
    )
    and public.is_trusted_boost_viewer(counterpart.counterpart_profile_id, v_viewer_profile_id);

  return jsonb_build_object(
    'has_boost', true,
    'analytics_meta', jsonb_build_object(
      'trust_filter', 'trusted_viewers_only',
      'is_trust_filtered', true
    ),
    'boost', jsonb_build_object(
      'id', boost_row.id,
      'starts_at', boost_row.starts_at,
      'ends_at', boost_row.ends_at,
      'created_at', boost_row.created_at,
      'boost_type', boost_row.boost_type,
      'audience_mode', boost_row.audience_mode,
      'focus_mode', boost_row.focus_mode,
      'status', boost_row.status,
      'is_active', boost_row.starts_at <= timezone('utc'::text, now()) and boost_row.ends_at > timezone('utc'::text, now())
    ),
    'metrics', jsonb_build_object(
      'unique_viewers', unique_viewer_count,
      'views', view_count,
      'unique_intro_viewers', unique_intro_viewer_count,
      'intro_opens', intro_count,
      'unique_savers', unique_saver_count,
      'saves', save_count,
      'unique_intent_viewers', unique_intent_viewer_count,
      'intent_opens', intent_count,
      'likes', like_count,
      'accepted_matches', accepted_match_count
    )
  );
end;
$$;
