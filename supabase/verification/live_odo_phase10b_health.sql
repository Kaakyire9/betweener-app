-- Betweener Live Phase 10B Odo Copilot production health check.
-- Strictly read-only. It never requests, uses, dismisses, or publishes a
-- suggestion and never returns generated copy or member context.

-- 1. Additive migration ledger.
with expected(version, purpose) as (values
  ('20260908100000', 'Host-controlled Odo Copilot'),
  ('20260908110000', 'Copilot operational completion')
)
select expected.version, expected.purpose,
  exists (select 1 from supabase_migrations.schema_migrations migration
    where migration.version = expected.version) as installed
from expected order by expected.version;

-- 2. Rollout state. Off and selectively enabled states can both be healthy;
-- autopilot and music must remain disabled throughout Phase 10B.
select
  configuration.odo_enabled,
  configuration.shadow_mode,
  configuration.copilot_enabled,
  configuration.autopilot_enabled,
  configuration.conversation_spark_enabled,
  configuration.audience_pulse_enabled,
  configuration.pair_narration_enabled,
  configuration.scene_suggestions_enabled,
  configuration.transition_copy_enabled,
  configuration.music_enabled,
  configuration.circuit_breaker_open,
  configuration.pricing_version,
  configuration.odo_enabled
    and configuration.shadow_mode
    and configuration.copilot_enabled
    and not configuration.autopilot_enabled
    and not configuration.music_enabled
    and (
      configuration.conversation_spark_enabled
      or configuration.audience_pulse_enabled
      or configuration.pair_narration_enabled
      or configuration.scene_suggestions_enabled
      or configuration.transition_copy_enabled
    ) as odo_tab_should_show,
  configuration.odo_enabled
    and configuration.shadow_mode
    and configuration.copilot_enabled
    and configuration.scene_suggestions_enabled
    and not configuration.autopilot_enabled
    and not configuration.music_enabled as scene_button_should_show,
  configuration.shadow_mode
    and not configuration.autopilot_enabled
    and not configuration.music_enabled
    and (
      configuration.copilot_enabled
      or (
        not configuration.conversation_spark_enabled
        and not configuration.audience_pulse_enabled
        and not configuration.pair_narration_enabled
        and not configuration.scene_suggestions_enabled
        and not configuration.transition_copy_enabled
      )
    ) as phase10b_invariant_healthy
from public.live_odo_configuration configuration
where configuration.id = true;

-- 3. Host and service boundaries.
with expected(name, signature, authenticated_execute, service_execute) as (
  values
    ('begin Copilot call',
      'public.rpc_service_begin_live_odo_copilot_call_v1(uuid,uuid,uuid,uuid,text,uuid,text,text,text,text)',
      false, true),
    ('complete Copilot call',
      'public.rpc_service_complete_live_odo_copilot_call_v1(uuid,uuid,jsonb,boolean,text,text,bigint,bigint,bigint,integer,boolean,text)',
      false, true),
    ('Host Copilot state',
      'public.rpc_get_live_odo_copilot_v1(uuid,integer)', true, true),
    ('Host suggestion feedback',
      'public.rpc_manage_live_odo_copilot_suggestion_v1(uuid,text)', true, true),
    ('Host suggestion use',
      'public.rpc_use_live_odo_copilot_suggestion_v1(uuid)', true, true)
), resolved as (
  select expected.*, to_regprocedure(expected.signature) procedure_oid from expected
)
select name, procedure_oid is not null installed,
  case when procedure_oid is null then false else
    has_function_privilege('authenticated', procedure_oid, 'EXECUTE')
      = authenticated_execute end authenticated_boundary_healthy,
  case when procedure_oid is null then false else
    has_function_privilege('service_role', procedure_oid, 'EXECUTE')
      = service_execute end service_boundary_healthy
from resolved order by name;

select
  coalesce(metadata.relrowsecurity, false) as suggestion_rls_enabled,
  not has_table_privilege(
    'authenticated', 'public.live_odo_copilot_suggestions', 'INSERT'
  ) and not has_table_privilege(
    'authenticated', 'public.live_odo_copilot_suggestions', 'UPDATE'
  ) and not has_table_privilege(
    'authenticated', 'public.live_odo_copilot_suggestions', 'DELETE'
  ) as authenticated_direct_writes_denied,
  not has_table_privilege(
    'service_role', 'public.live_odo_copilot_suggestions', 'INSERT'
  ) and not has_table_privilege(
    'service_role', 'public.live_odo_copilot_suggestions', 'UPDATE'
  ) and not has_table_privilege(
    'service_role', 'public.live_odo_copilot_suggestions', 'DELETE'
  ) as service_direct_writes_denied,
  exists (select 1 from pg_index where indexrelid =
    to_regclass('public.live_odo_copilot_session_ready_idx')
    and indisvalid and indisready) as session_ready_index_healthy,
  exists (select 1 from pg_index where indexrelid =
    to_regclass('public.live_odo_copilot_round_ready_idx')
    and indisvalid and indisready) as round_ready_index_healthy
from pg_class metadata
where metadata.oid = 'public.live_odo_copilot_suggestions'::regclass;

-- 4. Operational context. Generated payloads are deliberately excluded.
select
  suggestion.task,
  suggestion.suggestion_type,
  suggestion.status,
  suggestion.fallback_used,
  count(*) filter (where suggestion.created_at >= now() - interval '24 hours')::integer
    as suggestions_24h,
  count(*) filter (where suggestion.status = 'ready'
    and suggestion.expires_at <= now())::integer as expired_ready,
  count(*) filter (where suggestion.status = 'used')::integer as used,
  max(suggestion.created_at) as last_suggestion_at
from public.live_odo_copilot_suggestions suggestion
where suggestion.created_at >= now() - interval '7 days'
group by suggestion.task, suggestion.suggestion_type, suggestion.status,
  suggestion.fallback_used
order by suggestions_24h desc, suggestion.task, suggestion.status;

select
  usage.status,
  usage.model_class,
  usage.model,
  usage.fallback_used,
  count(*) filter (where usage.started_at >= now() - interval '24 hours')::integer
    as calls_24h,
  coalesce(sum(usage.input_tokens) filter (
    where usage.started_at >= now() - interval '24 hours'), 0)::bigint
    as input_tokens_24h,
  coalesce(sum(usage.output_tokens) filter (
    where usage.started_at >= now() - interval '24 hours'), 0)::bigint
    as output_tokens_24h,
  coalesce(sum(usage.estimated_cost_micros) filter (
    where usage.started_at >= now() - interval '24 hours'), 0)::bigint
    as estimated_cost_micros_24h,
  max(usage.started_at) as last_call_at
from public.live_odo_ai_usage usage
where usage.task in (
  'conversation_spark','audience_pulse','pair_narration','scene_suggestion',
  'transition_copy','session_welcome','session_closing'
)
group by usage.status, usage.model_class, usage.model, usage.fallback_used
order by calls_24h desc, usage.status, usage.model;

-- 5. Final Phase 10B gate. Every blocker count must be zero.
with migration_blockers as (
  select count(*)::bigint affected from (values
    ('20260908100000'), ('20260908110000')
  ) expected(version)
  where not exists (
    select 1 from supabase_migrations.schema_migrations migration
    where migration.version = expected.version
  )
), configuration_blockers as (
  select case when exists (
    select 1 from public.live_odo_configuration configuration
    where configuration.id = true
      and configuration.shadow_mode
      and not configuration.autopilot_enabled
      and not configuration.music_enabled
      and (not configuration.odo_enabled
        or configuration.pricing_version <> 'unconfigured')
      and (
        configuration.copilot_enabled
        or (
          not configuration.conversation_spark_enabled
          and not configuration.audience_pulse_enabled
          and not configuration.pair_narration_enabled
          and not configuration.scene_suggestions_enabled
          and not configuration.transition_copy_enabled
        )
      )
  ) then 0::bigint else 1::bigint end affected
), rollout_state as (
  select
    coalesce(bool_or(
      configuration.odo_enabled
      and configuration.shadow_mode
      and configuration.copilot_enabled
      and not configuration.autopilot_enabled
      and not configuration.music_enabled
      and (
        configuration.conversation_spark_enabled
        or configuration.audience_pulse_enabled
        or configuration.pair_narration_enabled
        or configuration.scene_suggestions_enabled
        or configuration.transition_copy_enabled
      )
    ), false) as odo_tab_should_show,
    coalesce(bool_or(
      configuration.odo_enabled
      and configuration.shadow_mode
      and configuration.copilot_enabled
      and configuration.scene_suggestions_enabled
      and not configuration.autopilot_enabled
      and not configuration.music_enabled
    ), false) as scene_button_should_show
  from public.live_odo_configuration configuration
  where configuration.id = true
), boundary_blockers as (
  select count(*)::bigint affected from (values
    ('public.rpc_service_begin_live_odo_copilot_call_v1(uuid,uuid,uuid,uuid,text,uuid,text,text,text,text)', false, true),
    ('public.rpc_service_complete_live_odo_copilot_call_v1(uuid,uuid,jsonb,boolean,text,text,bigint,bigint,bigint,integer,boolean,text)', false, true),
    ('public.rpc_get_live_odo_copilot_v1(uuid,integer)', true, true),
    ('public.rpc_manage_live_odo_copilot_suggestion_v1(uuid,text)', true, true),
    ('public.rpc_use_live_odo_copilot_suggestion_v1(uuid)', true, true)
  ) expected(signature, authenticated_execute, service_execute)
  where to_regprocedure(expected.signature) is null
    or has_function_privilege(
      'authenticated', to_regprocedure(expected.signature), 'EXECUTE'
    ) <> expected.authenticated_execute
    or has_function_privilege(
      'service_role', to_regprocedure(expected.signature), 'EXECUTE'
    ) <> expected.service_execute
), storage_blockers as (
  select case when exists (
    select 1 from pg_class metadata
    where metadata.oid = to_regclass('public.live_odo_copilot_suggestions')
      and metadata.relrowsecurity
  ) and not has_table_privilege(
    'authenticated', 'public.live_odo_copilot_suggestions', 'INSERT'
  ) and not has_table_privilege(
    'authenticated', 'public.live_odo_copilot_suggestions', 'UPDATE'
  ) and not has_table_privilege(
    'authenticated', 'public.live_odo_copilot_suggestions', 'DELETE'
  ) and not has_table_privilege(
    'service_role', 'public.live_odo_copilot_suggestions', 'INSERT'
  ) and not has_table_privilege(
    'service_role', 'public.live_odo_copilot_suggestions', 'UPDATE'
  ) and not has_table_privilege(
    'service_role', 'public.live_odo_copilot_suggestions', 'DELETE'
  ) then 0::bigint else 1::bigint end affected
), operational_contract_blockers as (
  select count(*)::bigint affected from (values
    ('live_odo_session_initial_direction_mode'),
    ('live_odo_configuration_sync_copilot_direction_mode'),
    ('live_odo_participant_stage_composition_fence'),
    ('live_odo_copilot_suggestion_normalize'),
    ('live_odo_copilot_suggestion_task_metric')
  ) expected(trigger_name)
  where not exists (
    select 1 from pg_trigger trigger_row
    where trigger_row.tgname = expected.trigger_name
      and not trigger_row.tgisinternal
      and trigger_row.tgenabled <> 'D'
  )
), direction_mode_blockers as (
  select count(*)::bigint affected
  from public.live_odo_session_state state
  cross join public.live_odo_configuration configuration
  where configuration.id = true
    and state.direction_mode is distinct from
      case when configuration.copilot_enabled then 'hybrid' else 'manual' end
), stale_call_blockers as (
  select count(*)::bigint affected from public.live_odo_ai_usage usage
  where usage.task in (
      'conversation_spark','audience_pulse','pair_narration','scene_suggestion',
      'transition_copy','session_welcome','session_closing'
    ) and usage.status = 'started'
    and usage.started_at < now() - interval '2 minutes'
), unsafe_suggestion_blockers as (
  select count(*)::bigint affected
  from public.live_odo_copilot_suggestions suggestion
  where suggestion.content_gate_reason_code not in (
      'content_safe','content_not_present','content_replaced'
    )
    or suggestion.payload::text ~*
      '(https?://|wss?://|rpc_[a-z0-9_]+|<script|service[_ -]?role|api[_ -]?key|access[_ -]?token)'
), action_authority_blockers as (
  select count(*)::bigint affected
  from public.live_director_events event_row
  where event_row.source = 'odo'
    or (event_row.event_type in (
      'CONVERSATION_SPARK_PUBLISHED','AUDIENCE_PULSE_LAUNCHED',
      'PAIR_INTRODUCTION_PUBLISHED','SCENE_CHANGED','TRANSITION_COPY_PUBLISHED',
      'SESSION_WELCOME_PUBLISHED','SESSION_CLOSING_PUBLISHED'
    ) and event_row.source <> 'host')
), orphaned_use_blockers as (
  select count(*)::bigint affected
  from public.live_odo_copilot_suggestions suggestion
  where suggestion.status = 'used' and (
    (suggestion.suggestion_type = 'conversation_spark' and not exists (
      select 1 from public.live_match_rounds round_row
      where round_row.id = suggestion.round_id
        and round_row.session_id = suggestion.session_id
        and round_row.conversation_spark = suggestion.payload
    ))
    or (suggestion.suggestion_type = 'audience_pulse' and not exists (
      select 1 from public.live_audience_polls poll
      where poll.session_id = suggestion.session_id
        and poll.client_request_id = suggestion.action_id
    ))
    or (suggestion.suggestion_type not in (
      'conversation_spark','audience_pulse'
    ) and not exists (
      select 1 from public.live_director_events event_row
      where event_row.session_id = suggestion.session_id
        and event_row.action_id = suggestion.action_id
        and event_row.source = 'host'
    ))
  )
), totals as (
  select rollout_state.odo_tab_should_show,
    rollout_state.scene_button_should_show,
    migration_blockers.affected migration_release_blockers,
    configuration_blockers.affected configuration_release_blockers,
    boundary_blockers.affected boundary_release_blockers,
    storage_blockers.affected storage_release_blockers,
    operational_contract_blockers.affected operational_contract_release_blockers,
    direction_mode_blockers.affected direction_mode_release_blockers,
    stale_call_blockers.affected stale_call_release_blockers,
    unsafe_suggestion_blockers.affected unsafe_suggestion_release_blockers,
    action_authority_blockers.affected action_authority_release_blockers,
    orphaned_use_blockers.affected orphaned_use_release_blockers
  from rollout_state, migration_blockers, configuration_blockers, boundary_blockers,
    storage_blockers, operational_contract_blockers, direction_mode_blockers,
    stale_call_blockers, unsafe_suggestion_blockers, action_authority_blockers,
    orphaned_use_blockers
)
select *,
  migration_release_blockers + configuration_release_blockers
    + boundary_release_blockers + storage_release_blockers
    + operational_contract_release_blockers + direction_mode_release_blockers
    + stale_call_release_blockers + unsafe_suggestion_release_blockers
    + action_authority_release_blockers + orphaned_use_release_blockers
    as release_blockers,
  migration_release_blockers + configuration_release_blockers
    + boundary_release_blockers + storage_release_blockers
    + operational_contract_release_blockers + direction_mode_release_blockers
    + stale_call_release_blockers + unsafe_suggestion_release_blockers
    + action_authority_release_blockers + orphaned_use_release_blockers = 0
    as healthy
from totals;
