-- Betweener Live Phase 10B operational completion.
-- Makes Copilot available on a session's first Host read, keeps hybrid mode in
-- sync, fences scene suggestions to stage composition, and adds task metrics.

begin;

create or replace function public.live_odo_set_initial_direction_mode_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
begin
  if exists (
    select 1 from public.live_odo_configuration configuration
    where configuration.id = true and configuration.copilot_enabled
  ) then
    new.direction_mode := 'hybrid';
  end if;
  return new;
end;
$$;

drop trigger if exists live_odo_session_initial_direction_mode
  on public.live_odo_session_state;
create trigger live_odo_session_initial_direction_mode
before insert on public.live_odo_session_state
for each row execute function public.live_odo_set_initial_direction_mode_v1();

create or replace function public.live_odo_sync_copilot_direction_mode_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_direction_mode text := case when new.copilot_enabled then 'hybrid' else 'manual' end;
begin
  if old.copilot_enabled is not distinct from new.copilot_enabled then
    return new;
  end if;
  update public.live_odo_copilot_suggestions suggestion
  set status = 'superseded', superseded_at = timezone('utc', now())
  where suggestion.status = 'ready'
    and exists (
      select 1 from public.live_odo_session_state state
      where state.session_id = suggestion.session_id
        and state.direction_mode is distinct from v_direction_mode
    );
  update public.live_odo_session_state
  set direction_mode = v_direction_mode, state_version = state_version + 1
  where direction_mode is distinct from v_direction_mode;
  return new;
end;
$$;

drop trigger if exists live_odo_configuration_sync_copilot_direction_mode
  on public.live_odo_configuration;
create trigger live_odo_configuration_sync_copilot_direction_mode
after update of copilot_enabled on public.live_odo_configuration
for each row
when (old.copilot_enabled is distinct from new.copilot_enabled)
execute function public.live_odo_sync_copilot_direction_mode_v1();

update public.live_odo_copilot_suggestions suggestion
set status = 'superseded', superseded_at = timezone('utc', now())
where suggestion.status = 'ready'
  and exists (
    select 1
    from public.live_odo_session_state state
    cross join public.live_odo_configuration configuration
    where configuration.id = true
      and state.session_id = suggestion.session_id
      and state.direction_mode is distinct from
        case when configuration.copilot_enabled then 'hybrid' else 'manual' end
  );

update public.live_odo_session_state state
set direction_mode = case when configuration.copilot_enabled then 'hybrid' else 'manual' end,
  state_version = state.state_version + 1
from public.live_odo_configuration configuration
where configuration.id = true
  and state.direction_mode is distinct from
    case when configuration.copilot_enabled then 'hybrid' else 'manual' end;

create or replace function public.live_odo_fence_stage_composition_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_session_id uuid := coalesce(new.session_id, old.session_id);
  v_changed boolean := tg_op in ('INSERT','DELETE');
begin
  if tg_op = 'UPDATE' then
    v_changed := old.session_id is distinct from new.session_id
      or old.state is distinct from new.state
      or old.role is distinct from new.role
      or old.stage_slot is distinct from new.stage_slot;
  end if;
  if not v_changed then return coalesce(new, old); end if;

  with superseded as (
    update public.live_odo_copilot_suggestions suggestion
    set status = 'superseded', superseded_at = timezone('utc', now())
    where suggestion.session_id = v_session_id
      and suggestion.task = 'scene_suggestion'
      and suggestion.status = 'ready'
    returning suggestion.*
  )
  insert into public.live_odo_trace_events(
    session_id, call_id, action_id, trace_type, reason_code, metadata
  )
  select session_id, call_id, action_id,
    'odo_copilot_suggestion_superseded', 'stage_composition_changed',
    jsonb_build_object('task', task, 'suggestionId', id)
  from superseded;

  update public.live_odo_session_state
  set state_version = state_version + 1
  where session_id = v_session_id;
  return coalesce(new, old);
end;
$$;

drop trigger if exists live_odo_participant_stage_composition_fence
  on public.live_participants;
create trigger live_odo_participant_stage_composition_fence
after insert or delete or update of session_id, state, role, stage_slot
on public.live_participants
for each row execute function public.live_odo_fence_stage_composition_v1();

create or replace function public.live_odo_normalize_copilot_suggestion_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_current_scene text;
  v_session_format text;
  v_target_scene text;
begin
  if new.suggestion_type <> 'scene_suggestion' then return new; end if;
  select state.current_scene, session_row.format
  into v_current_scene, v_session_format
  from public.live_odo_session_state state
  join public.live_sessions session_row on session_row.id = state.session_id
  where state.session_id = new.session_id;

  v_target_scene := new.payload->>'scene';
  if v_session_format = 'hosted_match_night'
    and v_target_scene = 'quick_connect_active' then
    v_target_scene := 'pair_forming';
    new.payload := jsonb_build_object('scene', v_target_scene);
  end if;
  if v_target_scene = v_current_scene then
    new.suggestion_type := 'no_action';
    new.reason_code := 'scene_already_suitable';
    new.title := 'No scene change';
    new.rationale := 'The current scene still fits the room.';
    new.payload := '{}'::jsonb;
  end if;
  return new;
end;
$$;

drop trigger if exists live_odo_copilot_suggestion_normalize
  on public.live_odo_copilot_suggestions;
create trigger live_odo_copilot_suggestion_normalize
before insert on public.live_odo_copilot_suggestions
for each row execute function public.live_odo_normalize_copilot_suggestion_v1();

create or replace function public.live_odo_record_copilot_task_metric_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_trace_type text;
begin
  if tg_op = 'INSERT' and new.suggestion_type <> 'no_action' then
    v_trace_type := case new.task
      when 'conversation_spark' then 'odo_spark_generated'
      when 'audience_pulse' then 'odo_pulse_generated'
      when 'pair_narration' then 'odo_narration_generated'
      when 'scene_suggestion' then 'odo_scene_suggested'
      else null end;
  elsif tg_op = 'UPDATE' and old.status <> 'used' and new.status = 'used' then
    v_trace_type := case new.task
      when 'conversation_spark' then 'odo_spark_used'
      when 'audience_pulse' then 'odo_pulse_used'
      when 'pair_narration' then 'odo_narration_used'
      when 'scene_suggestion' then 'odo_scene_used'
      else null end;
  end if;

  if v_trace_type is not null then
    insert into public.live_odo_trace_events(
      session_id, call_id, action_id, trace_type, reason_code, metadata
    ) values (
      new.session_id, new.call_id, new.action_id, v_trace_type,
      case when tg_op = 'INSERT' then 'suggestion_created' else 'host_approved' end,
      jsonb_build_object('task', new.task, 'suggestionId', new.id)
    );
  end if;
  if tg_op = 'INSERT' and new.task = 'conversation_spark' and new.fallback_used then
    insert into public.live_odo_trace_events(
      session_id, call_id, action_id, trace_type, reason_code, metadata
    ) values (
      new.session_id, new.call_id, new.action_id, 'odo_spark_fallback_used',
      'deterministic_fallback', jsonb_build_object('suggestionId', new.id)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists live_odo_copilot_suggestion_task_metric
  on public.live_odo_copilot_suggestions;
create trigger live_odo_copilot_suggestion_task_metric
after insert or update of status on public.live_odo_copilot_suggestions
for each row execute function public.live_odo_record_copilot_task_metric_v1();

create or replace function public.rpc_get_live_odo_copilot_v1(
  p_session_id uuid,
  p_limit integer default 20
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_config public.live_odo_configuration;
  v_state public.live_odo_session_state;
  v_authorized boolean;
begin
  if auth.uid() is null or p_limit not between 1 and 50 then
    raise exception 'live_odo_copilot_request_invalid' using errcode = '22023';
  end if;
  v_authorized := public.is_admin_user(auth.uid()) or public.has_live_capability(
    p_session_id, 'live.view_host_console', auth.uid()
  );
  if not v_authorized then
    raise exception 'live_odo_copilot_host_required' using errcode = '42501';
  end if;
  select * into v_config from public.live_odo_configuration where id = true;
  insert into public.live_odo_session_state(session_id)
  select session_row.id from public.live_sessions session_row
  where session_row.id = p_session_id
  on conflict (session_id) do nothing;
  select * into v_state from public.live_odo_session_state where session_id = p_session_id;
  if v_state.session_id is null then
    raise exception 'live_odo_state_missing' using errcode = 'P0002';
  end if;

  with expired as (
    update public.live_odo_copilot_suggestions suggestion
    set status = 'expired'
    where suggestion.session_id = p_session_id
      and suggestion.status = 'ready'
      and suggestion.expires_at <= timezone('utc', now())
    returning suggestion.*
  )
  insert into public.live_odo_trace_events(
    session_id, call_id, action_id, trace_type, reason_code, metadata
  ) select session_id, call_id, action_id, 'odo_copilot_suggestion_expired',
    'suggestion_ttl_elapsed', jsonb_build_object('task',task,'suggestionId',id)
  from expired;

  return jsonb_build_object(
    'schemaVersion', 1,
    'enabled', public.live_odo_copilot_task_enabled_v1(v_config, 'transition_copy')
      or public.live_odo_copilot_task_enabled_v1(v_config, 'conversation_spark')
      or public.live_odo_copilot_task_enabled_v1(v_config, 'audience_pulse')
      or public.live_odo_copilot_task_enabled_v1(v_config, 'pair_narration')
      or public.live_odo_copilot_task_enabled_v1(v_config, 'scene_suggestion'),
    'temporarilyUnavailable', v_config.circuit_breaker_open,
    'unavailableReason', case when v_config.circuit_breaker_open
      then 'circuit_breaker_open' else null end,
    'directionMode', v_state.direction_mode,
    'currentScene', v_state.current_scene,
    'features', jsonb_build_object(
      'conversationSpark', public.live_odo_copilot_task_enabled_v1(v_config, 'conversation_spark'),
      'audiencePulse', public.live_odo_copilot_task_enabled_v1(v_config, 'audience_pulse'),
      'pairNarration', public.live_odo_copilot_task_enabled_v1(v_config, 'pair_narration'),
      'sceneSuggestions', public.live_odo_copilot_task_enabled_v1(v_config, 'scene_suggestion'),
      'transitionCopy', public.live_odo_copilot_task_enabled_v1(v_config, 'transition_copy')
    ),
    'suggestions', coalesce((
      select jsonb_agg(public.live_odo_copilot_suggestion_json_v1(candidate)
        order by candidate.created_at desc)
      from (
        select * from public.live_odo_copilot_suggestions suggestion
        where suggestion.session_id = p_session_id
          and suggestion.status = 'ready'
          and suggestion.expires_at > timezone('utc', now())
          and suggestion.suggestion_type <> 'no_action'
        order by suggestion.created_at desc limit p_limit
      ) candidate
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.live_odo_build_copilot_context_v1(
  p_session_id uuid,
  p_task text,
  p_round_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_session public.live_sessions;
  v_state public.live_odo_session_state;
  v_profile_a uuid;
  v_profile_b uuid;
  v_round_version bigint;
  v_round_state text;
  v_round_kind text;
  v_context_round_id uuid := p_round_id;
  v_signals jsonb := '[]'::jsonb;
  v_profiles jsonb := '[]'::jsonb;
  v_spark jsonb;
  v_templates jsonb := '[]'::jsonb;
  v_fallback jsonb;
  v_participant_count integer;
  v_on_stage_count integer;
  v_audience_count integer;
  v_backstage_count integer;
  v_stage_request_count integer;
  v_host_on_stage boolean;
  v_scene text;
begin
  if not public.live_odo_is_service_role() then
    raise exception 'live_odo_service_role_required' using errcode = '42501';
  end if;
  if p_task not in (
    'conversation_spark','audience_pulse','pair_narration','scene_suggestion',
    'transition_copy','session_welcome','session_closing'
  ) then raise exception 'live_odo_copilot_task_invalid' using errcode = '22023'; end if;

  select * into v_session from public.live_sessions where id = p_session_id;
  select * into v_state from public.live_odo_session_state where session_id = p_session_id;
  if v_session.id is null or v_state.session_id is null then
    raise exception 'live_odo_state_missing' using errcode = 'P0002';
  end if;

  select count(*) filter (where participant.state not in ('left','removed','banned')),
    count(*) filter (where participant.state = 'on_stage'),
    count(*) filter (where participant.state = 'audience'),
    count(*) filter (where participant.state = 'backstage'),
    count(*) filter (where participant.state = 'stage_requested'),
    coalesce(bool_or(participant.role = 'host' and participant.state = 'on_stage'), false)
  into v_participant_count, v_on_stage_count, v_audience_count,
    v_backstage_count, v_stage_request_count, v_host_on_stage
  from public.live_participants participant
  where participant.session_id = p_session_id;

  if p_round_id is not null then
    select round_row.participant_a_profile_id, round_row.participant_b_profile_id,
      round_row.version, round_row.state, 'hosted',
      coalesce((select jsonb_agg(signal->>'code' order by signal->>'code')
        from jsonb_array_elements(round_row.connection_signals) signal
        where signal->>'code' ~ '^[a-z][a-z0-9_]{0,63}$'), '[]'::jsonb),
      round_row.conversation_spark
    into v_profile_a, v_profile_b, v_round_version, v_round_state,
      v_round_kind, v_signals, v_spark
    from public.live_match_rounds round_row
    where round_row.id = p_round_id and round_row.session_id = p_session_id
      and round_row.state in ('both_accepted','public_introduction');
  elsif p_task = 'scene_suggestion' then
    select round_row.id, round_row.state, 'hosted'
    into v_context_round_id, v_round_state, v_round_kind
    from public.live_match_rounds round_row
    where round_row.session_id = p_session_id
      and round_row.state = 'public_introduction'
    order by round_row.updated_at desc, round_row.id
    limit 1;
  end if;

  if p_task in ('conversation_spark','pair_narration') and v_profile_a is null then
    raise exception 'live_odo_copilot_round_unavailable' using errcode = '23514';
  end if;
  if p_task = 'pair_narration' and v_round_state <> 'public_introduction' then
    raise exception 'live_odo_copilot_round_unavailable' using errcode = '23514';
  end if;

  if v_profile_a is not null then
    select jsonb_agg(jsonb_build_object(
      'profileId', profile.id,
      'displayName', left(coalesce(nullif(btrim(profile.full_name), ''), 'Member'), 80),
      'ageBand', null,
      'languages', coalesce((select jsonb_agg(language order by language)
        from (select left(btrim(language), 40) language
          from unnest(coalesce(profile.languages_spoken, array[]::text[])) language
          where btrim(language) <> '' order by language limit 8) safe_languages), '[]'::jsonb),
      'conversationInterests', coalesce((select jsonb_agg(name order by name)
        from (select left(interest.name, 60) name
          from public.profile_interests profile_interest
          join public.interests interest on interest.id = profile_interest.interest_id
          where profile_interest.profile_id = profile.id
          order by interest.name limit 12) safe_interests), '[]'::jsonb),
      'culturalAffinityTags', '[]'::jsonb,
      'liveIntent', null
    ) order by profile.id)
    into v_profiles
    from public.profiles profile where profile.id in (v_profile_a, v_profile_b);
  end if;

  if p_task = 'audience_pulse' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'templateKey', template.template_key, 'prompt', template.prompt,
      'options', template.options
    ) order by template.display_order, template.template_key), '[]'::jsonb)
    into v_templates
    from public.live_audience_poll_templates template where template.enabled;
  end if;

  if p_task = 'scene_suggestion' then
    if v_round_state = 'public_introduction' then
      if v_on_stage_count >= 2 and v_state.current_scene <> 'pair_forming' then
        v_scene := 'PAIR_FOCUS';
      end if;
    elsif v_on_stage_count >= 3 and v_state.current_scene <> 'pool_focus' then
      v_scene := 'COMMUNITY_WIDE';
    elsif v_on_stage_count <= 1 and v_state.current_scene <> 'host_focus' then
      v_scene := 'HOST_FOCUS';
    end if;
  end if;

  v_fallback := case p_task
    when 'conversation_spark' then jsonb_build_object(
      'decision','suggest','reasonCode','deterministic_fallback',
      'context',coalesce(v_spark->>'context','A light conversation starter'),
      'question',coalesce(v_spark->>'question','What is something you have enjoyed recently?'),
      'copy',null,'locale','en','templateKey',null,'durationSeconds',null,
      'scene',null,'signalCodesUsed',v_signals)
    when 'audience_pulse' then jsonb_build_object(
      'decision',case when jsonb_array_length(v_templates) > 0 then 'suggest' else 'no_action' end,
      'reasonCode','deterministic_fallback','context',null,'question',null,'copy',null,
      'locale','en','templateKey',v_templates->0->>'templateKey','durationSeconds',60,
      'scene',null,'signalCodesUsed','[]'::jsonb)
    when 'pair_narration' then jsonb_build_object(
      'decision','suggest','reasonCode','deterministic_fallback','context',null,'question',null,
      'copy','Let us welcome our next pair to the conversation.','locale','en',
      'templateKey',null,'durationSeconds',null,'scene',null,'signalCodesUsed',v_signals)
    when 'scene_suggestion' then jsonb_build_object(
      'decision',case when v_scene is null then 'no_action' else 'suggest' end,
      'reasonCode',case when v_scene is null then 'scene_already_suitable'
        else 'deterministic_scene_composition' end,
      'context',null,'question',null,'copy',null,'locale','en','templateKey',null,
      'durationSeconds',null,'scene',v_scene,'signalCodesUsed','[]'::jsonb)
    when 'session_welcome' then jsonb_build_object(
      'decision','suggest','reasonCode','deterministic_fallback','context',null,'question',null,
      'copy','Welcome, everyone. Settle in and enjoy meeting the room.','locale','en',
      'templateKey',null,'durationSeconds',null,'scene',null,'signalCodesUsed','[]'::jsonb)
    when 'session_closing' then jsonb_build_object(
      'decision','suggest','reasonCode','deterministic_fallback','context',null,'question',null,
      'copy','Thank you for joining. Take care and enjoy the rest of your evening.','locale','en',
      'templateKey',null,'durationSeconds',null,'scene',null,'signalCodesUsed','[]'::jsonb)
    else jsonb_build_object(
      'decision','suggest','reasonCode','deterministic_fallback','context',null,'question',null,
      'copy','We will move into the next part of the session shortly.','locale','en',
      'templateKey',null,'durationSeconds',null,'scene',null,'signalCodesUsed','[]'::jsonb)
  end;

  return jsonb_build_object(
    'profiles', coalesce(v_profiles, '[]'::jsonb),
    'allowedSignalCodes', coalesce(v_signals, '[]'::jsonb),
    'roundVersion', v_round_version,
    'deterministicFallback', v_fallback,
    'taskContext', jsonb_build_object(
      'sessionStatus', v_session.status,
      'sessionFormat', v_session.format,
      'currentScene', v_state.current_scene,
      'directionMode', v_state.direction_mode,
      'participantCount', v_participant_count,
      'onStageParticipantCount', v_on_stage_count,
      'audienceCount', v_audience_count,
      'backstageCount', v_backstage_count,
      'stageRequestCount', v_stage_request_count,
      'hostOnStage', v_host_on_stage,
      'roundId', v_context_round_id,
      'roundKind', v_round_kind,
      'roundState', v_round_state,
      'allowedSignalCodes', coalesce(v_signals, '[]'::jsonb),
      'pulseTemplates', v_templates,
      'allowedScenes', jsonb_build_array(
        'HOST_FOCUS','PAIR_FOCUS','COMMUNITY_WIDE','INTERMISSION','CLOSING'
      )
    )
  );
end;
$$;

revoke all on function public.live_odo_set_initial_direction_mode_v1()
  from public, anon, authenticated, service_role;
revoke all on function public.live_odo_sync_copilot_direction_mode_v1()
  from public, anon, authenticated, service_role;
revoke all on function public.live_odo_fence_stage_composition_v1()
  from public, anon, authenticated, service_role;
revoke all on function public.live_odo_normalize_copilot_suggestion_v1()
  from public, anon, authenticated, service_role;
revoke all on function public.live_odo_record_copilot_task_metric_v1()
  from public, anon, authenticated, service_role;
revoke all on function public.live_odo_build_copilot_context_v1(uuid,text,uuid)
  from public, anon, authenticated;
revoke all on function public.rpc_get_live_odo_copilot_v1(uuid,integer)
  from public, anon;
grant execute on function public.rpc_get_live_odo_copilot_v1(uuid,integer)
  to authenticated, service_role;

comment on function public.rpc_get_live_odo_copilot_v1(uuid,integer) is
  'Host-private Phase 10B state read with authorized, idempotent session-state initialization.';
comment on function public.live_odo_fence_stage_composition_v1() is
  'Invalidates ready scene suggestions whenever the authoritative stage composition changes.';

commit;
