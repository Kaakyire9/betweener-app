-- Betweener Live Phase 10F: rollout authority, safety pre-flight, provider
-- cleanup and the read-safe contract reserved for Phase 10G Studio.

begin;

create or replace function public.live_odo_always_on_safety_preflight_v1(
  p_opportunity_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
  select configuration.id is not null
    and not configuration.circuit_breaker_open
    and (
      configuration.safety_coverage_mode = 'automated'
      or (
        configuration.safety_coverage_mode = 'selected_test_cohort'
        and not exists (
          select 1
          from public.live_quick_connect_opportunity_members member
          where member.opportunity_id = p_opportunity_id
            and member.state = 'accepted'
            and not exists (
              select 1 from public.live_odo_always_on_access access
              where access.user_id = member.user_id
                and access.allowed
                and (access.expires_at is null
                  or access.expires_at > timezone('utc', now()))
            )
        )
      )
    )
    and (
      select count(*) >= configuration.minimum_cohort_size
      from public.live_quick_connect_opportunity_members member
      where member.opportunity_id = p_opportunity_id and member.state = 'accepted'
    )
    and not exists (
      select 1
      from public.live_quick_connect_opportunity_members member
      where member.opportunity_id = p_opportunity_id
        and member.state = 'accepted'
        and public.live_quick_connect_has_active_safety_hold(member.user_id)
    )
  from public.live_odo_always_on_configuration configuration
  where configuration.id = true;
$$;

revoke all on function public.live_odo_always_on_safety_preflight_v1(uuid)
from public, anon, authenticated, service_role;

alter function public.rpc_service_prepare_live_quick_connect_opportunity_session_v1(uuid, uuid)
rename to live_odo_prepare_always_on_session_base_10f_v1;

revoke all on function public.live_odo_prepare_always_on_session_base_10f_v1(uuid, uuid)
from public, anon, authenticated, service_role;

create or replace function public.rpc_service_prepare_live_quick_connect_opportunity_session_v1(
  p_opportunity_id uuid,
  p_worker_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
begin
  if not public.live_odo_is_service_role() then
    raise exception 'live_odo_service_role_required' using errcode = '42501';
  end if;
  if not public.live_odo_always_on_safety_preflight_v1(p_opportunity_id) then
    return jsonb_build_object('prepared', false,
      'reasonCode', 'safety_coverage_preflight_failed');
  end if;
  return public.live_odo_prepare_always_on_session_base_10f_v1(
    p_opportunity_id, p_worker_id
  );
end;
$$;

alter function public.rpc_service_finalize_live_quick_connect_opportunity_session_v1(
  uuid, uuid, boolean, text
)
rename to live_odo_finalize_always_on_session_base_10f_v1;

revoke all on function public.live_odo_finalize_always_on_session_base_10f_v1(
  uuid, uuid, boolean, text
) from public, anon, authenticated, service_role;

create or replace function public.rpc_service_finalize_live_quick_connect_opportunity_session_v1(
  p_opportunity_id uuid,
  p_worker_id uuid,
  p_stream_ready boolean,
  p_failure_reason_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
begin
  if not public.live_odo_is_service_role() then
    raise exception 'live_odo_service_role_required' using errcode = '42501';
  end if;
  if coalesce(p_stream_ready, false)
    and not public.live_odo_always_on_safety_preflight_v1(p_opportunity_id) then
    return public.live_odo_finalize_always_on_session_base_10f_v1(
      p_opportunity_id, p_worker_id, false, 'safety_coverage_preflight_failed'
    );
  end if;
  return public.live_odo_finalize_always_on_session_base_10f_v1(
    p_opportunity_id, p_worker_id, p_stream_ready, p_failure_reason_code
  );
end;
$$;

revoke all on function public.rpc_service_prepare_live_quick_connect_opportunity_session_v1(
  uuid, uuid
), public.rpc_service_finalize_live_quick_connect_opportunity_session_v1(
  uuid, uuid, boolean, text
) from public, anon, authenticated;
grant execute on function public.rpc_service_prepare_live_quick_connect_opportunity_session_v1(uuid, uuid),
  public.rpc_service_finalize_live_quick_connect_opportunity_session_v1(uuid, uuid, boolean, text)
to service_role;

alter function public.rpc_service_maintain_live_quick_connect_opportunities_v1()
rename to live_odo_maintain_opportunities_base_10f_v1;

revoke all on function public.live_odo_maintain_opportunities_base_10f_v1()
from public, anon, authenticated, service_role;

create or replace function public.rpc_service_maintain_live_quick_connect_opportunities_v1()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_row record;
  v_invalidated integer := 0;
  v_base jsonb;
begin
  if not public.live_odo_is_service_role() then
    raise exception 'live_odo_service_role_required' using errcode = '42501';
  end if;
  for v_row in
    select availability.user_id, availability.reserved_opportunity_id
    from public.live_quick_connect_availability availability
    left join public.profiles profile
      on profile.id = availability.profile_id and profile.user_id = availability.user_id
    where availability.status in ('available','reserved')
      and availability.expires_at > v_now
      and (
        profile.id is null or profile.deleted_at is not null
        or profile.account_state <> 'active' or not coalesce(profile.is_active, true)
        or public.live_quick_connect_has_active_safety_hold(availability.user_id)
        or exists (
          select 1 from public.live_private_sparks spark
          where availability.user_id in (
            spark.participant_a_user_id, spark.participant_b_user_id
          ) and spark.state in ('awaiting_consent','active')
        )
        or exists (
          select 1
          from public.live_participants participant
          join public.live_sessions session on session.id = participant.session_id
          where participant.user_id = availability.user_id
            and participant.state not in ('left','removed','banned')
            and session.status in ('backstage','live','ending')
            and session.id is distinct from (
              select opportunity.live_session_id
              from public.live_quick_connect_opportunities opportunity
              where opportunity.id = availability.reserved_opportunity_id
            )
        )
      )
    order by availability.user_id
    for update of availability skip locked
  loop
    if v_row.reserved_opportunity_id is not null then
      update public.live_quick_connect_opportunity_members set
        state = 'invalidated', responded_at = v_now,
        response_reason_code = 'automatic_availability_invalidation',
        version = version + 1
      where opportunity_id = v_row.reserved_opportunity_id
        and user_id = v_row.user_id and state in ('invited','accepted');
      delete from public.live_quick_connect_opportunity_reservations
      where user_id = v_row.user_id
        and opportunity_id = v_row.reserved_opportunity_id;
    end if;
    update public.live_quick_connect_availability set
      status = 'invalidated', reserved_opportunity_id = null,
      version = version + 1
    where user_id = v_row.user_id;
    perform public.live_odo_always_on_bump_user_v1(v_row.user_id);
    v_invalidated := v_invalidated + 1;
  end loop;
  v_base := public.live_odo_maintain_opportunities_base_10f_v1();
  return v_base || jsonb_build_object('invalidatedAvailability', v_invalidated);
end;
$$;

revoke all on function public.rpc_service_maintain_live_quick_connect_opportunities_v1()
from public, anon, authenticated;
grant execute on function public.rpc_service_maintain_live_quick_connect_opportunities_v1()
to service_role;

create or replace function public.rpc_service_get_live_odo_always_on_cleanup_work_v1(
  p_limit integer default 4
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
begin
  if not public.live_odo_is_service_role() then
    raise exception 'live_odo_service_role_required' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'sessionId', work.session_id,
      'providerCallType', work.provider_call_type,
      'providerCallId', work.provider_call_id
    ) order by work.updated_at)
    from (
      select always_on.session_id, session.provider_call_type,
        session.provider_call_id, always_on.updated_at
      from public.live_odo_always_on_sessions always_on
      join public.live_sessions session on session.id = always_on.session_id
      where always_on.lifecycle_state in ('ended','failed')
        and always_on.stream_resource_ended_at is null
        and always_on.stream_cleanup_attempts < 8
      order by always_on.updated_at, always_on.session_id
      limit greatest(1, least(coalesce(p_limit, 4), 8))
    ) work
  ), '[]'::jsonb);
end;
$$;

create or replace function public.rpc_service_complete_live_odo_always_on_cleanup_v1(
  p_session_id uuid,
  p_succeeded boolean,
  p_reason_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare v_opportunity_id uuid;
begin
  if not public.live_odo_is_service_role() then
    raise exception 'live_odo_service_role_required' using errcode = '42501';
  end if;
  if p_session_id is null or p_succeeded is null
    or (p_reason_code is not null and p_reason_code !~ '^[a-z][a-z0-9_]{0,119}$') then
    raise exception 'live_always_on_cleanup_invalid' using errcode = '22023';
  end if;
  update public.live_odo_always_on_sessions set
    stream_cleanup_attempts = stream_cleanup_attempts + 1,
    stream_resource_ended_at = case when p_succeeded
      then coalesce(stream_resource_ended_at, timezone('utc', now()))
      else stream_resource_ended_at end,
    version = version + 1
  where session_id = p_session_id and lifecycle_state in ('ended','failed')
  returning opportunity_id into v_opportunity_id;
  if v_opportunity_id is null then
    return jsonb_build_object('completed', false, 'reasonCode', 'cleanup_not_required');
  end if;
  insert into public.live_quick_connect_opportunity_events(
    opportunity_id, event_type, reason_code, metadata
  ) values (
    v_opportunity_id, 'stream_cleanup',
    case when p_succeeded then 'stream_resource_ended'
      else coalesce(p_reason_code, 'stream_cleanup_retryable') end,
    jsonb_build_object('sessionId', p_session_id, 'succeeded', p_succeeded)
  );
  return jsonb_build_object('completed', p_succeeded,
    'reasonCode', case when p_succeeded then 'stream_resource_ended'
      else coalesce(p_reason_code, 'stream_cleanup_retryable') end);
end;
$$;

revoke all on function public.rpc_service_get_live_odo_always_on_cleanup_work_v1(integer),
  public.rpc_service_complete_live_odo_always_on_cleanup_v1(uuid, boolean, text)
from public, anon, authenticated;
grant execute on function public.rpc_service_get_live_odo_always_on_cleanup_work_v1(integer),
  public.rpc_service_complete_live_odo_always_on_cleanup_v1(uuid, boolean, text)
to service_role;

alter table public.live_odo_show_sessions
  add column if not exists program_output_source text not null default 'host_camera';
alter table public.live_odo_show_sessions
  add constraint live_odo_show_program_output_source_check check (
    program_output_source in (
      'host_camera','active_pair','quick_connect_pool','odo_stage',
      'audience_pulse','branded_visual','screen_share'
    )
  );

create or replace function public.live_odo_sync_program_output_source_v1()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
begin
  if tg_op = 'INSERT'
    or new.current_scene is distinct from old.current_scene
    or new.program_output_source is null then
    new.program_output_source := case new.current_scene
      when 'host_focus' then 'host_camera'
      when 'host_plus_pool' then 'quick_connect_pool'
      when 'pool_focus' then 'quick_connect_pool'
      when 'pair_forming' then 'quick_connect_pool'
      when 'quick_connect_active' then 'active_pair'
      when 'audience_pulse' then 'audience_pulse'
      when 'odo_stage' then 'odo_stage'
      else 'branded_visual' end;
  end if;
  return new;
end;
$$;

create trigger live_odo_show_program_output_source_sync
before insert or update of current_scene on public.live_odo_show_sessions
for each row execute function public.live_odo_sync_program_output_source_v1();

revoke all on function public.live_odo_sync_program_output_source_v1()
from public, anon, authenticated, service_role;

create or replace function public.rpc_get_live_odo_system_program_snapshot_v1(
  p_session_id uuid
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
  v_runtime public.live_odo_always_on_sessions;
  v_show public.live_odo_show_sessions;
  v_odo public.live_odo_session_state;
  v_control public.live_quick_connect_controls;
  v_music public.live_music_session_state;
  v_pool integer := 0;
  v_active integer := 0;
  v_completed integer := 0;
  v_holds integer := 0;
begin
  if not public.live_odo_is_service_role()
    and (auth.uid() is null or not public.is_admin_user(auth.uid())) then
    raise exception 'live_odo_studio_snapshot_forbidden' using errcode = '42501';
  end if;
  select * into v_session from public.live_sessions where id = p_session_id;
  if v_session.id is null or not public.live_is_odo_always_on_session_v1(p_session_id) then
    raise exception 'live_odo_system_session_not_found' using errcode = 'P0002';
  end if;
  select * into v_runtime from public.live_odo_always_on_sessions where session_id = p_session_id;
  select * into v_show from public.live_odo_show_sessions where session_id = p_session_id;
  select * into v_odo from public.live_odo_session_state where session_id = p_session_id;
  select * into v_control from public.live_quick_connect_controls where session_id = p_session_id;
  select * into v_music from public.live_music_session_state where session_id = p_session_id;
  select count(*)::integer into v_pool
  from public.live_quick_connect_participants participant
  where participant.session_id = p_session_id and participant.state = 'waiting'
    and participant.connection_state = 'connected'
    and participant.last_seen_at >= timezone('utc', now()) - interval '45 seconds';
  select count(*)::integer into v_active
  from public.live_quick_connect_pairings pairing
  where pairing.session_id = p_session_id and pairing.state in ('active','reconnect_grace');
  select count(*)::integer into v_completed
  from public.live_quick_connect_rounds round_row
  where round_row.session_id = p_session_id and round_row.state = 'completed';
  select count(*)::integer into v_holds
  from public.live_participants participant
  where participant.session_id = p_session_id
    and participant.state not in ('left','removed','banned')
    and public.live_quick_connect_has_active_safety_hold(participant.user_id);
  return jsonb_build_object(
    'schemaVersion', 1,
    'session', jsonb_build_object(
      'id', v_session.id, 'status', v_session.status,
      'ownershipType', v_session.ownership_type,
      'systemSessionKind', v_session.system_session_kind,
      'startedAt', v_session.started_at, 'scheduledEnd', v_session.scheduled_end
    ),
    'controller', jsonb_build_object(
      'source', coalesce(v_show.control_source, 'system'),
      'leaseExpiresAt', v_show.control_lease_expires_at,
      'generation', coalesce(v_odo.lease_generation, 0),
      'autopilotState', coalesce(v_odo.autopilot_state, 'off')
    ),
    'show', jsonb_build_object(
      'state', v_show.show_state, 'scene', v_show.current_scene,
      'programSource', v_show.program_source,
      'programOutputSource', v_show.program_output_source,
      'energyMode', v_show.energy_mode, 'stateVersion', coalesce(v_show.version, 0)
    ),
    'quickConnect', jsonb_build_object(
      'state', v_control.state, 'poolCount', v_pool,
      'eligiblePairCount', public.live_odo_full_quick_eligible_pairs_v1(p_session_id),
      'activePairCount', v_active, 'completedRoundCount', v_completed
    ),
    'music', jsonb_build_object(
      'status', coalesce(v_music.status, 'stopped'), 'mood', v_music.mood,
      'trackId', v_music.track_id, 'volume', coalesce(v_music.effective_volume, 0),
      'stateVersion', coalesce(v_music.version, 0)
    ),
    'audiencePulse', jsonb_build_object(
      'open', exists (select 1 from public.live_audience_polls poll
        where poll.session_id = p_session_id and poll.state = 'open')
    ),
    'director', jsonb_build_object(
      'latestSequence', coalesce(v_odo.latest_sequence, 0),
      'stateVersion', coalesce(v_odo.state_version, 0)
    ),
    'lifecycle', jsonb_build_object(
      'state', v_runtime.lifecycle_state,
      'maximumRuntimeEndsAt', v_runtime.maximum_runtime_ends_at,
      'lowLiquiditySince', v_runtime.low_liquidity_since,
      'emptySince', v_runtime.empty_since
    ),
    'safety', jsonb_build_object(
      'status', case when v_holds = 0 then 'healthy' else 'degraded' end,
      'activeHoldCount', v_holds
    )
  );
end;
$$;

revoke all on function public.rpc_get_live_odo_system_program_snapshot_v1(uuid)
from public, anon;
grant execute on function public.rpc_get_live_odo_system_program_snapshot_v1(uuid)
to authenticated, service_role;

create or replace function public.rpc_admin_set_live_odo_always_on_access_v1(
  p_user_id uuid,
  p_allowed boolean,
  p_note text default null,
  p_expires_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
begin
  if auth.uid() is null or not public.is_admin_user(auth.uid()) then
    raise exception 'live_odo_admin_required' using errcode = '42501';
  end if;
  if p_user_id is null or p_allowed is null
    or (p_note is not null and char_length(p_note) > 240)
    or (p_expires_at is not null and p_expires_at <= timezone('utc', now())) then
    raise exception 'live_odo_always_on_access_invalid' using errcode = '22023';
  end if;
  insert into public.live_odo_always_on_access(
    user_id, allowed, note, granted_by_user_id, expires_at
  ) values (
    p_user_id, p_allowed, nullif(btrim(p_note), ''), auth.uid(), p_expires_at
  ) on conflict(user_id) do update set
    allowed = excluded.allowed, note = excluded.note,
    granted_by_user_id = excluded.granted_by_user_id,
    expires_at = excluded.expires_at;
  insert into public.live_odo_trace_events(trace_type, reason_code, metadata)
  values ('configuration_updated', 'always_on_access_updated',
    jsonb_build_object('userId', p_user_id, 'allowed', p_allowed));
  return jsonb_build_object('userId', p_user_id, 'allowed', p_allowed,
    'expiresAt', p_expires_at);
end;
$$;

create or replace function public.rpc_admin_update_live_odo_always_on_v1(p_patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_configuration public.live_odo_always_on_configuration;
  v_markets text[];
  v_durations integer[];
begin
  if auth.uid() is null or not public.is_admin_user(auth.uid()) then
    raise exception 'live_odo_admin_required' using errcode = '42501';
  end if;
  if not public.live_odo_jsonb_has_exact_keys_v1(
    p_patch, array[]::text[], array[
      'availabilityEnabled','shadowDetectionEnabled','invitationsEnabled',
      'systemSessionCreationEnabled','odoStartEnabled','musicEnabled',
      'automaticEndingEnabled','circuitBreakerOpen','internalOnly',
      'safetyCoverageMode','verifiedUsersOnly','allowedMarkets',
      'availabilityDurationsMinutes','defaultAvailabilityMinutes',
      'candidateScanLimit','edgeScanLimit','minimumCohortSize',
      'maximumCohortSize','invitationTtlSeconds','opportunityTtlSeconds',
      'workerLeaseSeconds','invitationCooldownMinutes','postSessionCooldownMinutes',
      'notTonightHours','maximumInvitationsPerDay','presenceFreshnessSeconds',
      'lowLiquiditySeconds','emptyRoomSeconds','maximumSessionRuntimeMinutes'
    ]
  ) then
    raise exception 'live_odo_always_on_configuration_patch_invalid' using errcode = '22023';
  end if;
  if p_patch ? 'allowedMarkets' then
    if jsonb_typeof(p_patch -> 'allowedMarkets') <> 'array'
      or exists (select 1 from jsonb_array_elements(p_patch -> 'allowedMarkets') item(value)
        where jsonb_typeof(value) <> 'string'
          or trim(both '"' from value::text) !~ '^[a-z0-9][a-z0-9:_-]{0,79}$') then
      raise exception 'live_odo_always_on_configuration_patch_invalid' using errcode = '22023';
    end if;
    select array_agg(value order by ordinal) into v_markets
    from jsonb_array_elements_text(p_patch -> 'allowedMarkets') with ordinality item(value, ordinal);
  end if;
  if p_patch ? 'availabilityDurationsMinutes' then
    if jsonb_typeof(p_patch -> 'availabilityDurationsMinutes') <> 'array' then
      raise exception 'live_odo_always_on_configuration_patch_invalid' using errcode = '22023';
    end if;
    select array_agg(value::integer order by ordinal) into v_durations
    from jsonb_array_elements_text(p_patch -> 'availabilityDurationsMinutes')
      with ordinality item(value, ordinal);
  end if;
  update public.live_odo_always_on_configuration set
    availability_enabled = case when p_patch ? 'availabilityEnabled'
      then (p_patch ->> 'availabilityEnabled')::boolean else availability_enabled end,
    shadow_detection_enabled = case when p_patch ? 'shadowDetectionEnabled'
      then (p_patch ->> 'shadowDetectionEnabled')::boolean else shadow_detection_enabled end,
    invitations_enabled = case when p_patch ? 'invitationsEnabled'
      then (p_patch ->> 'invitationsEnabled')::boolean else invitations_enabled end,
    system_session_creation_enabled = case when p_patch ? 'systemSessionCreationEnabled'
      then (p_patch ->> 'systemSessionCreationEnabled')::boolean else system_session_creation_enabled end,
    odo_start_enabled = case when p_patch ? 'odoStartEnabled'
      then (p_patch ->> 'odoStartEnabled')::boolean else odo_start_enabled end,
    music_enabled = case when p_patch ? 'musicEnabled'
      then (p_patch ->> 'musicEnabled')::boolean else music_enabled end,
    automatic_ending_enabled = case when p_patch ? 'automaticEndingEnabled'
      then (p_patch ->> 'automaticEndingEnabled')::boolean else automatic_ending_enabled end,
    circuit_breaker_open = case when p_patch ? 'circuitBreakerOpen'
      then (p_patch ->> 'circuitBreakerOpen')::boolean else circuit_breaker_open end,
    internal_only = case when p_patch ? 'internalOnly'
      then (p_patch ->> 'internalOnly')::boolean else internal_only end,
    safety_coverage_mode = case when p_patch ? 'safetyCoverageMode'
      then p_patch ->> 'safetyCoverageMode' else safety_coverage_mode end,
    verified_users_only = case when p_patch ? 'verifiedUsersOnly'
      then (p_patch ->> 'verifiedUsersOnly')::boolean else verified_users_only end,
    allowed_markets = coalesce(v_markets, allowed_markets),
    availability_durations_minutes = coalesce(v_durations, availability_durations_minutes),
    default_availability_minutes = case when p_patch ? 'defaultAvailabilityMinutes'
      then (p_patch ->> 'defaultAvailabilityMinutes')::integer else default_availability_minutes end,
    candidate_scan_limit = case when p_patch ? 'candidateScanLimit'
      then (p_patch ->> 'candidateScanLimit')::integer else candidate_scan_limit end,
    edge_scan_limit = case when p_patch ? 'edgeScanLimit'
      then (p_patch ->> 'edgeScanLimit')::integer else edge_scan_limit end,
    minimum_cohort_size = case when p_patch ? 'minimumCohortSize'
      then (p_patch ->> 'minimumCohortSize')::integer else minimum_cohort_size end,
    maximum_cohort_size = case when p_patch ? 'maximumCohortSize'
      then (p_patch ->> 'maximumCohortSize')::integer else maximum_cohort_size end,
    invitation_ttl_seconds = case when p_patch ? 'invitationTtlSeconds'
      then (p_patch ->> 'invitationTtlSeconds')::integer else invitation_ttl_seconds end,
    opportunity_ttl_seconds = case when p_patch ? 'opportunityTtlSeconds'
      then (p_patch ->> 'opportunityTtlSeconds')::integer else opportunity_ttl_seconds end,
    worker_lease_seconds = case when p_patch ? 'workerLeaseSeconds'
      then (p_patch ->> 'workerLeaseSeconds')::integer else worker_lease_seconds end,
    invitation_cooldown_minutes = case when p_patch ? 'invitationCooldownMinutes'
      then (p_patch ->> 'invitationCooldownMinutes')::integer else invitation_cooldown_minutes end,
    post_session_cooldown_minutes = case when p_patch ? 'postSessionCooldownMinutes'
      then (p_patch ->> 'postSessionCooldownMinutes')::integer else post_session_cooldown_minutes end,
    not_tonight_hours = case when p_patch ? 'notTonightHours'
      then (p_patch ->> 'notTonightHours')::integer else not_tonight_hours end,
    maximum_invitations_per_day = case when p_patch ? 'maximumInvitationsPerDay'
      then (p_patch ->> 'maximumInvitationsPerDay')::integer else maximum_invitations_per_day end,
    presence_freshness_seconds = case when p_patch ? 'presenceFreshnessSeconds'
      then (p_patch ->> 'presenceFreshnessSeconds')::integer else presence_freshness_seconds end,
    low_liquidity_seconds = case when p_patch ? 'lowLiquiditySeconds'
      then (p_patch ->> 'lowLiquiditySeconds')::integer else low_liquidity_seconds end,
    empty_room_seconds = case when p_patch ? 'emptyRoomSeconds'
      then (p_patch ->> 'emptyRoomSeconds')::integer else empty_room_seconds end,
    maximum_session_runtime_minutes = case when p_patch ? 'maximumSessionRuntimeMinutes'
      then (p_patch ->> 'maximumSessionRuntimeMinutes')::integer else maximum_session_runtime_minutes end
  where id = true returning * into v_configuration;
  insert into public.live_odo_trace_events(trace_type, reason_code, metadata)
  values ('configuration_updated', 'always_on_configuration_updated',
    jsonb_build_object('changedKeys', (select jsonb_agg(key order by key)
      from jsonb_object_keys(p_patch) key)));
  return jsonb_build_object(
    'availabilityEnabled', v_configuration.availability_enabled,
    'shadowDetectionEnabled', v_configuration.shadow_detection_enabled,
    'invitationsEnabled', v_configuration.invitations_enabled,
    'systemSessionCreationEnabled', v_configuration.system_session_creation_enabled,
    'odoStartEnabled', v_configuration.odo_start_enabled,
    'musicEnabled', v_configuration.music_enabled,
    'automaticEndingEnabled', v_configuration.automatic_ending_enabled,
    'circuitBreakerOpen', v_configuration.circuit_breaker_open,
    'internalOnly', v_configuration.internal_only,
    'safetyCoverageMode', v_configuration.safety_coverage_mode,
    'verifiedUsersOnly', v_configuration.verified_users_only,
    'allowedMarkets', v_configuration.allowed_markets,
    'minimumCohortSize', v_configuration.minimum_cohort_size,
    'maximumCohortSize', v_configuration.maximum_cohort_size
  );
exception when invalid_text_representation or numeric_value_out_of_range
  or check_violation or not_null_violation then
  raise exception 'live_odo_always_on_configuration_patch_invalid' using errcode = '22023';
end;
$$;

revoke all on function public.rpc_admin_set_live_odo_always_on_access_v1(
  uuid, boolean, text, timestamptz
), public.rpc_admin_update_live_odo_always_on_v1(jsonb)
from public, anon;
grant execute on function public.rpc_admin_set_live_odo_always_on_access_v1(
  uuid, boolean, text, timestamptz
), public.rpc_admin_update_live_odo_always_on_v1(jsonb)
to authenticated, service_role;

comment on function public.rpc_get_live_odo_system_program_snapshot_v1(uuid) is
  'Phase 10G-ready admin/service snapshot. It exposes aggregate programme health and no private roster, compatibility graph, prompt, ballot, or private decision.';

commit;
