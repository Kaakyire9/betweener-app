-- Betweener Live Phase 10C Odo Guarded Autopilot production health check.
-- Strictly read-only. It never enables Autopilot, claims an event, executes an
-- action, changes Live state, or returns generated copy/member context.

-- 1. Additive migration ledger.
with expected(version, purpose) as (values
  ('20260908120000', 'Odo Guarded Autopilot'),
  ('20260908121000', 'Guarded event priority compatibility'),
  ('20260908122000', 'Guarded storage boundary'),
  ('20260908123000', 'Safety policy clearance fence'),
  ('20260908124000', 'Authoritative scene version fence'),
  ('20260908125000', 'Intermission scene policy fence'),
  ('20260908130000', 'Runtime scene reconciliation')
)
select expected.version, expected.purpose,
  exists (select 1 from supabase_migrations.schema_migrations migration
    where migration.version = expected.version) as installed
from expected order by expected.version;

-- 2. Controlled rollout. An entirely disabled rollout is healthy. The legacy
-- and full-autopilot flags and all music authority must remain disabled.
select
  configuration.odo_enabled,
  configuration.shadow_mode,
  configuration.copilot_enabled,
  configuration.autopilot_enabled as legacy_autopilot_enabled,
  configuration.guarded_autopilot_enabled,
  configuration.full_autopilot_enabled,
  configuration.auto_narration_enabled,
  configuration.auto_scene_enabled,
  configuration.auto_spark_enabled,
  configuration.auto_audience_pulse_enabled,
  configuration.auto_intermission_enabled,
  configuration.guarded_autopilot_internal_only,
  configuration.music_enabled,
  configuration.circuit_breaker_open,
  not configuration.autopilot_enabled
    and not configuration.full_autopilot_enabled
    and not configuration.music_enabled
    and configuration.guarded_autopilot_internal_only
    and (
      not configuration.guarded_autopilot_enabled
      or (configuration.odo_enabled and configuration.shadow_mode)
    )
    and (
      configuration.guarded_autopilot_enabled
      or not (
        configuration.auto_narration_enabled
        or configuration.auto_scene_enabled
        or configuration.auto_spark_enabled
        or configuration.auto_audience_pulse_enabled
        or configuration.auto_intermission_enabled
      )
    ) as phase10c_invariant_healthy
from public.live_odo_configuration configuration
where configuration.id = true;

-- 3. Host/service execution boundaries.
with expected(name, signature, authenticated_execute, service_execute) as (values
  ('Host state',
    'public.rpc_get_live_odo_guarded_autopilot_v1(uuid)', true, true),
  ('Host enable',
    'public.rpc_enable_live_odo_guarded_autopilot_v1(uuid,jsonb)', true, true),
  ('Host takeover',
    'public.rpc_take_over_live_odo_v1(uuid)', true, true),
  ('Host resume',
    'public.rpc_resume_live_odo_autopilot_v1(uuid)', true, true),
  ('Host clock signal',
    'public.rpc_signal_live_odo_autopilot_clock_v1(uuid)', true, true),
  ('service event claim',
    'public.rpc_service_claim_live_odo_guarded_event_v1(uuid,uuid,uuid,text,text)', false, true),
  ('service action completion',
    'public.rpc_service_complete_live_odo_guarded_action_v1(uuid,uuid,jsonb,boolean,text,text,bigint,bigint,bigint,integer,boolean,text)', false, true),
  ('service action failure',
    'public.rpc_service_fail_live_odo_guarded_action_v1(uuid,uuid,text,boolean)', false, true),
  ('service policy pause',
    'public.rpc_service_pause_live_odo_policy_v1(uuid,text)', false, true),
  ('service policy clearance',
    'public.rpc_service_clear_live_odo_policy_pause_v1(uuid,text)', false, true),
  ('admin rollout configuration',
    'public.rpc_admin_update_live_odo_guarded_autopilot_v1(jsonb)', true, true),
  ('admin Host allowlist',
    'public.rpc_admin_set_live_odo_guarded_host_access_v1(uuid,boolean,text)', true, true)
), resolved as (
  select expected.*, to_regprocedure(expected.signature) procedure_oid
  from expected
)
select name, procedure_oid is not null as installed,
  case when procedure_oid is null then false else
    has_function_privilege('authenticated', procedure_oid, 'EXECUTE')
      = authenticated_execute end as authenticated_boundary_healthy,
  case when procedure_oid is null then false else
    has_function_privilege('service_role', procedure_oid, 'EXECUTE')
      = service_execute end as service_boundary_healthy
from resolved order by name;

-- 4. Storage and Realtime boundaries. Only the content-free invalidation table
-- is client readable; none of these tables is client or service-role writable.
with expected(name, authenticated_select) as (values
  ('live_odo_guarded_autopilot_host_allowlist', false),
  ('live_odo_guarded_autopilot_settings', false),
  ('live_odo_guarded_autopilot_updates', true),
  ('live_odo_guarded_autopilot_events', false),
  ('live_odo_guarded_autopilot_actions', false)
)
select expected.name,
  coalesce(metadata.relrowsecurity, false) as rls_enabled,
  has_table_privilege(
    'authenticated', format('public.%I', expected.name), 'SELECT'
  ) = expected.authenticated_select as authenticated_read_boundary_healthy,
  not has_table_privilege(
    'authenticated', format('public.%I', expected.name), 'INSERT'
  ) and not has_table_privilege(
    'authenticated', format('public.%I', expected.name), 'UPDATE'
  ) and not has_table_privilege(
    'authenticated', format('public.%I', expected.name), 'DELETE'
  ) as authenticated_direct_writes_denied,
  not has_table_privilege(
    'service_role', format('public.%I', expected.name), 'INSERT'
  ) and not has_table_privilege(
    'service_role', format('public.%I', expected.name), 'UPDATE'
  ) and not has_table_privilege(
    'service_role', format('public.%I', expected.name), 'DELETE'
  ) as service_direct_writes_denied
from expected
left join pg_class metadata
  on metadata.oid = to_regclass(format('public.%I', expected.name))
order by expected.name;

select
  exists (select 1 from pg_index where indexrelid =
    to_regclass('public.live_odo_guarded_autopilot_events_claim_idx')
    and indisvalid and indisready) as event_claim_index_healthy,
  exists (select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename = 'live_odo_guarded_autopilot_updates')
    as realtime_invalidation_healthy;

-- 5. Exact automatic authority contract. Unknown and all Tier 3 actions must
-- fail closed.
with allowed(action_type, risk_tier) as (values
  ('NO_ACTION', 0), ('WAIT', 0), ('SESSION_NARRATION', 1),
  ('ANNOUNCE_EXISTING_PAIR', 1), ('REQUEST_SCENE', 1),
  ('SHOW_CONVERSATION_SPARK', 2), ('SHOW_AUDIENCE_PULSE', 2),
  ('SHOW_INTERMISSION', 2), ('TIME_CUE', 1), ('TRANSITION_COPY', 1)
)
select action_type,
  public.live_odo_guarded_action_allowed_v1(action_type) as allowed,
  public.live_odo_guarded_action_risk_tier_v1(action_type) = risk_tier
    as risk_tier_healthy
from allowed order by action_type;

with forbidden(action_type) as (values
  ('OPEN_POOL'), ('CLOSE_POOL'), ('PAUSE_POOL'), ('RESUME_POOL'),
  ('CREATE_PAIR'), ('START_ROUND'), ('CLOSE_ROUND'), ('RETURN_TO_POOL'),
  ('PROMOTE_TO_STAGE'), ('REMOVE_FROM_STAGE'), ('MUTE_PARTICIPANT'),
  ('REMOVE_PARTICIPANT'), ('BAN_PARTICIPANT'), ('CREATE_PRIVATE_SPARK'),
  ('START_PRIVATE_SPARK'), ('END_PRIVATE_SPARK'),
  ('SUBMIT_PRIVATE_DECISION'), ('CREATE_MATCH'), ('END_SESSION'),
  ('START_SESSION'), ('ENABLE_RECORDING'), ('ENABLE_CAPTIONS_PRIVATE'),
  ('ISSUE_RTC_TOKEN'), ('SESSION_POOLING'), ('UNKNOWN_ACTION')
)
select count(*) filter (
  where public.live_odo_guarded_action_allowed_v1(action_type)
    or public.live_odo_guarded_action_risk_tier_v1(action_type) is not null
)::integer as forbidden_actions_incorrectly_allowed
from forbidden;

-- 6. Content-free operational telemetry.
select settings.enabled, state.autopilot_state, state.direction_mode,
  settings.limited_mode,
  count(*)::integer as sessions,
  max(settings.updated_at) as last_settings_update_at,
  max(settings.last_action_at) as last_automatic_action_at
from public.live_odo_guarded_autopilot_settings settings
join public.live_odo_session_state state on state.session_id = settings.session_id
group by settings.enabled, state.autopilot_state, state.direction_mode,
  settings.limited_mode
order by sessions desc;

select action.action_type, action.risk_tier, action.status,
  action.fallback_used,
  count(*) filter (where action.proposed_at >= now() - interval '24 hours')::integer
    as actions_24h,
  max(action.proposed_at) as last_action_at
from public.live_odo_guarded_autopilot_actions action
where action.proposed_at >= now() - interval '7 days'
group by action.action_type, action.risk_tier, action.status,
  action.fallback_used
order by actions_24h desc, action.action_type, action.status;

-- 7. Final Phase 10C gate. Every blocker count must be zero.
with migration_blockers as (
  select count(*)::bigint affected from (values
    ('20260908120000'), ('20260908121000'), ('20260908122000'),
    ('20260908123000'), ('20260908124000'), ('20260908125000'),
    ('20260908130000')
  ) expected(version)
  where not exists (
    select 1 from supabase_migrations.schema_migrations migration
    where migration.version = expected.version
  )
), configuration_blockers as (
  select case when exists (
    select 1 from public.live_odo_configuration configuration
    where configuration.id = true
      and not configuration.autopilot_enabled
      and not configuration.full_autopilot_enabled
      and not configuration.music_enabled
      and configuration.guarded_autopilot_internal_only
      and (
        not configuration.guarded_autopilot_enabled
        or (configuration.odo_enabled and configuration.shadow_mode)
      )
      and (
        configuration.guarded_autopilot_enabled
        or not (
          configuration.auto_narration_enabled
          or configuration.auto_scene_enabled
          or configuration.auto_spark_enabled
          or configuration.auto_audience_pulse_enabled
          or configuration.auto_intermission_enabled
        )
      )
  ) then 0::bigint else 1::bigint end affected
), boundary_blockers as (
  select count(*)::bigint affected from (values
    ('public.rpc_get_live_odo_guarded_autopilot_v1(uuid)', true, true),
    ('public.rpc_enable_live_odo_guarded_autopilot_v1(uuid,jsonb)', true, true),
    ('public.rpc_take_over_live_odo_v1(uuid)', true, true),
    ('public.rpc_resume_live_odo_autopilot_v1(uuid)', true, true),
    ('public.rpc_signal_live_odo_autopilot_clock_v1(uuid)', true, true),
    ('public.rpc_service_claim_live_odo_guarded_event_v1(uuid,uuid,uuid,text,text)', false, true),
    ('public.rpc_service_complete_live_odo_guarded_action_v1(uuid,uuid,jsonb,boolean,text,text,bigint,bigint,bigint,integer,boolean,text)', false, true),
    ('public.rpc_service_fail_live_odo_guarded_action_v1(uuid,uuid,text,boolean)', false, true),
    ('public.rpc_service_pause_live_odo_policy_v1(uuid,text)', false, true),
    ('public.rpc_service_clear_live_odo_policy_pause_v1(uuid,text)', false, true),
    ('public.rpc_admin_update_live_odo_guarded_autopilot_v1(jsonb)', true, true),
    ('public.rpc_admin_set_live_odo_guarded_host_access_v1(uuid,boolean,text)', true, true)
  ) expected(signature, authenticated_execute, service_execute)
  where to_regprocedure(expected.signature) is null
    or has_function_privilege(
      'authenticated', to_regprocedure(expected.signature), 'EXECUTE'
    ) <> expected.authenticated_execute
    or has_function_privilege(
      'service_role', to_regprocedure(expected.signature), 'EXECUTE'
    ) <> expected.service_execute
), storage_blockers as (
  select count(*)::bigint affected from (values
    ('live_odo_guarded_autopilot_host_allowlist', false),
    ('live_odo_guarded_autopilot_settings', false),
    ('live_odo_guarded_autopilot_updates', true),
    ('live_odo_guarded_autopilot_events', false),
    ('live_odo_guarded_autopilot_actions', false)
  ) expected(name, authenticated_select)
  where not exists (
      select 1 from pg_class metadata
      where metadata.oid = to_regclass(format('public.%I', expected.name))
        and metadata.relrowsecurity
    )
    or has_table_privilege(
      'authenticated', format('public.%I', expected.name), 'SELECT'
    ) <> expected.authenticated_select
    or has_table_privilege(
      'authenticated', format('public.%I', expected.name), 'INSERT'
    ) or has_table_privilege(
      'authenticated', format('public.%I', expected.name), 'UPDATE'
    ) or has_table_privilege(
      'authenticated', format('public.%I', expected.name), 'DELETE'
    ) or has_table_privilege(
      'service_role', format('public.%I', expected.name), 'INSERT'
    ) or has_table_privilege(
      'service_role', format('public.%I', expected.name), 'UPDATE'
    ) or has_table_privilege(
      'service_role', format('public.%I', expected.name), 'DELETE'
    )
), authority_blockers as (
  select count(*)::bigint affected from (values
    ('OPEN_POOL'), ('CLOSE_POOL'), ('PAUSE_POOL'), ('RESUME_POOL'),
    ('CREATE_PAIR'), ('START_ROUND'), ('CLOSE_ROUND'), ('RETURN_TO_POOL'),
    ('PROMOTE_TO_STAGE'), ('REMOVE_FROM_STAGE'), ('MUTE_PARTICIPANT'),
    ('REMOVE_PARTICIPANT'), ('BAN_PARTICIPANT'), ('CREATE_PRIVATE_SPARK'),
    ('START_PRIVATE_SPARK'), ('END_PRIVATE_SPARK'),
    ('SUBMIT_PRIVATE_DECISION'), ('CREATE_MATCH'), ('END_SESSION'),
    ('START_SESSION'), ('ENABLE_RECORDING'), ('ENABLE_CAPTIONS_PRIVATE'),
    ('ISSUE_RTC_TOKEN'), ('SESSION_POOLING'), ('UNKNOWN_ACTION')
  ) forbidden(action_type)
  where public.live_odo_guarded_action_allowed_v1(action_type)
    or public.live_odo_guarded_action_risk_tier_v1(action_type) is not null
), policy_clearance_blockers as (
  select case when exists (
    select 1 from pg_trigger trigger_row
    where trigger_row.tgname = 'live_odo_guarded_policy_pause_fence'
      and not trigger_row.tgisinternal
      and trigger_row.tgenabled <> 'D'
  ) and exists (
    select 1 from pg_trigger trigger_row
    where trigger_row.tgname = 'live_odo_scene_version_fence'
      and not trigger_row.tgisinternal
      and trigger_row.tgenabled <> 'D'
  ) then 0::bigint else 1::bigint end affected
), runtime_contract_blockers as (
  select case when exists (
    select 1 from pg_trigger trigger_row
    where trigger_row.tgname = 'live_odo_guarded_project_scene_action'
      and not trigger_row.tgisinternal
      and trigger_row.tgenabled <> 'D'
  ) and exists (
    select 1 from pg_trigger trigger_row
    where trigger_row.tgname = 'live_odo_guarded_activation_scene'
      and not trigger_row.tgisinternal
      and trigger_row.tgenabled <> 'D'
  ) and exists (
    select 1 from pg_trigger trigger_row
    where trigger_row.tgname = 'live_odo_participant_stage_composition_fence'
      and not trigger_row.tgisinternal
      and trigger_row.tgenabled <> 'D'
  ) then 0::bigint else 1::bigint end affected
), allowlist_blockers as (
  select count(*)::bigint affected
  from public.live_odo_guarded_autopilot_settings settings
  cross join public.live_odo_configuration configuration
  where configuration.id = true
    and configuration.guarded_autopilot_internal_only
    and settings.enabled
    and not exists (
      select 1 from public.live_odo_guarded_autopilot_host_allowlist access
      where access.user_id = settings.enabled_by_user_id
    )
), state_blockers as (
  select count(*)::bigint affected
  from public.live_odo_guarded_autopilot_settings settings
  join public.live_odo_session_state state on state.session_id = settings.session_id
  join public.live_sessions session_row on session_row.id = settings.session_id
  where session_row.status = 'live' and (
    (settings.enabled and not (
      (state.direction_mode = 'autopilot'
        and state.autopilot_state in ('starting','active','recovering'))
      or (state.direction_mode = 'manual'
        and state.autopilot_state in ('paused_by_host','paused_by_policy'))
    )) or (not settings.enabled and state.autopilot_state in (
      'starting','active','recovering'
    ))
  )
), stale_work_blockers as (
  select
    (select count(*) from public.live_odo_guarded_autopilot_events event_row
      where event_row.status = 'processing'
        and event_row.claimed_at < now() - interval '2 minutes')
    + (select count(*) from public.live_odo_guarded_autopilot_actions action
      where action.status in ('proposed','approved')
        and action.expires_at <= now())
    + (select count(*) from public.live_odo_ai_usage usage
      where usage.task in ('pair_narration','conversation_spark')
        and usage.status = 'started'
        and usage.started_at < now() - interval '2 minutes')
    as affected
), unsafe_action_blockers as (
  select count(*)::bigint affected
  from public.live_odo_guarded_autopilot_actions action
  where not public.live_odo_guarded_action_allowed_v1(action.action_type)
    or public.live_odo_guarded_action_risk_tier_v1(action.action_type)
      is distinct from action.risk_tier
    or action.payload::text ~*
      '(https?://|wss?://|rpc_[a-z0-9_]+|<script|service[_ -]?role|api[_ -]?key|access[_ -]?token)'
), director_event_blockers as (
  select count(*)::bigint affected
  from public.live_director_events event_row
  where event_row.source = 'odo' and (
    event_row.event_type not in (
      'SESSION_NARRATION_PUBLISHED','PAIR_INTRODUCTION_PUBLISHED',
      'SCENE_CHANGED','CONVERSATION_SPARK_PUBLISHED',
      'AUDIENCE_PULSE_LAUNCHED','ODO_INTERMISSION_STARTED',
      'TIME_CUE_PUBLISHED','TRANSITION_COPY_PUBLISHED'
    ) or event_row.action_id is null or not exists (
      select 1 from public.live_odo_guarded_autopilot_actions action
      where action.action_id = event_row.action_id
        and action.session_id = event_row.session_id
        and action.status = 'executed'
    )
  )
), density_blockers as (
  select count(*)::bigint affected from (
    select action.session_id
    from public.live_odo_guarded_autopilot_actions action
    cross join public.live_odo_configuration configuration
    where configuration.id = true and action.status = 'executed'
      and action.risk_tier > 0
      and action.executed_at >= now()
        - make_interval(secs => configuration.automatic_intervention_window_seconds)
    group by action.session_id, configuration.maximum_automatic_interventions_per_window
    having count(*) > configuration.maximum_automatic_interventions_per_window
  ) exceeded
), realtime_blockers as (
  select case when exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename = 'live_odo_guarded_autopilot_updates'
  ) then 0::bigint else 1::bigint end affected
), totals as (
  select migration_blockers.affected migration_release_blockers,
    configuration_blockers.affected configuration_release_blockers,
    boundary_blockers.affected boundary_release_blockers,
    storage_blockers.affected storage_release_blockers,
    authority_blockers.affected authority_release_blockers,
    policy_clearance_blockers.affected policy_clearance_release_blockers,
    runtime_contract_blockers.affected runtime_contract_release_blockers,
    allowlist_blockers.affected allowlist_release_blockers,
    state_blockers.affected state_release_blockers,
    stale_work_blockers.affected stale_work_release_blockers,
    unsafe_action_blockers.affected unsafe_action_release_blockers,
    director_event_blockers.affected director_event_release_blockers,
    density_blockers.affected density_release_blockers,
    realtime_blockers.affected realtime_release_blockers
  from migration_blockers, configuration_blockers, boundary_blockers,
    storage_blockers, authority_blockers, policy_clearance_blockers,
    runtime_contract_blockers, allowlist_blockers, state_blockers,
    stale_work_blockers, unsafe_action_blockers, director_event_blockers,
    density_blockers, realtime_blockers
)
select *,
  migration_release_blockers + configuration_release_blockers
    + boundary_release_blockers + storage_release_blockers
    + authority_release_blockers + policy_clearance_release_blockers
    + runtime_contract_release_blockers
    + allowlist_release_blockers
    + state_release_blockers + stale_work_release_blockers
    + unsafe_action_release_blockers + director_event_release_blockers
    + density_release_blockers + realtime_release_blockers
    as release_blockers,
  migration_release_blockers + configuration_release_blockers
    + boundary_release_blockers + storage_release_blockers
    + authority_release_blockers + policy_clearance_release_blockers
    + runtime_contract_release_blockers
    + allowlist_release_blockers
    + state_release_blockers + stale_work_release_blockers
    + unsafe_action_release_blockers + director_event_release_blockers
    + density_release_blockers + realtime_release_blockers = 0
    as healthy
from totals;
