-- Read-only postdeployment health check for Live Operator-grade Studio Phase B.
-- Safe for linked staging execution through `supabase db query --linked --file`.

with checks(check_name, passed) as (
  values
    (
      'run_cues_table_exists_with_rls',
      exists (
        select 1
        from pg_class relation
        join pg_namespace namespace on namespace.oid = relation.relnamespace
        where namespace.nspname = 'public'
          and relation.relname = 'live_studio_run_cues'
          and relation.relkind = 'r'
          and relation.relrowsecurity
      )
    ),
    (
      'private_messages_table_exists_with_rls',
      exists (
        select 1
        from pg_class relation
        join pg_namespace namespace on namespace.oid = relation.relnamespace
        where namespace.nspname = 'public'
          and relation.relname = 'live_studio_private_messages'
          and relation.relkind = 'r'
          and relation.relrowsecurity
      )
    ),
    (
      'operator_presence_table_exists_with_rls',
      exists (
        select 1
        from pg_class relation
        join pg_namespace namespace on namespace.oid = relation.relnamespace
        where namespace.nspname = 'public'
          and relation.relname = 'live_studio_operator_presence'
          and relation.relkind = 'r'
          and relation.relrowsecurity
      )
    ),
    (
      'operational_events_table_exists_with_rls',
      exists (
        select 1
        from pg_class relation
        join pg_namespace namespace on namespace.oid = relation.relnamespace
        where namespace.nspname = 'public'
          and relation.relname = 'live_studio_operational_events'
          and relation.relkind = 'r'
          and relation.relrowsecurity
      )
    ),
    (
      'phase_b_tables_have_no_authenticated_direct_access',
      not has_table_privilege('authenticated', 'public.live_studio_run_cues', 'SELECT,INSERT,UPDATE,DELETE')
      and not has_table_privilege('authenticated', 'public.live_studio_private_messages', 'SELECT,INSERT,UPDATE,DELETE')
      and not has_table_privilege('authenticated', 'public.live_studio_operator_presence', 'SELECT,INSERT,UPDATE,DELETE')
      and not has_table_privilege('authenticated', 'public.live_studio_operational_events', 'SELECT,INSERT,UPDATE,DELETE')
    ),
    (
      'phase_b_tables_have_no_anonymous_direct_access',
      not has_table_privilege('anon', 'public.live_studio_run_cues', 'SELECT,INSERT,UPDATE,DELETE')
      and not has_table_privilege('anon', 'public.live_studio_private_messages', 'SELECT,INSERT,UPDATE,DELETE')
      and not has_table_privilege('anon', 'public.live_studio_operator_presence', 'SELECT,INSERT,UPDATE,DELETE')
      and not has_table_privilege('anon', 'public.live_studio_operational_events', 'SELECT,INSERT,UPDATE,DELETE')
    ),
    (
      'step_up_transition_trigger_enabled',
      exists (
        select 1
        from pg_trigger trigger
        join pg_class relation on relation.oid = trigger.tgrelid
        join pg_namespace namespace on namespace.oid = relation.relnamespace
        join pg_proc procedure on procedure.oid = trigger.tgfoid
        where namespace.nspname = 'public'
          and relation.relname = 'live_sessions'
          and trigger.tgname = 'live_sessions_studio_step_up_transition_v1'
          and trigger.tgenabled = 'O'
          and procedure.proname = 'live_studio_enforce_step_up_transition_v1'
          and not trigger.tgisinternal
      )
    ),
    (
      'run_cue_updated_at_trigger_enabled',
      exists (
        select 1
        from pg_trigger trigger
        join pg_class relation on relation.oid = trigger.tgrelid
        join pg_namespace namespace on namespace.oid = relation.relnamespace
        join pg_proc procedure on procedure.oid = trigger.tgfoid
        where namespace.nspname = 'public'
          and relation.relname = 'live_studio_run_cues'
          and trigger.tgname = 'live_studio_run_cues_updated_at'
          and trigger.tgenabled = 'O'
          and procedure.proname = 'set_updated_at'
          and not trigger.tgisinternal
      )
    ),
    (
      'take_v2_exact_signature_exists',
      to_regprocedure('public.rpc_studio_take_live_program_v2(uuid,uuid,bigint,bigint,uuid,text,text,jsonb,text)') is not null
    ),
    (
      'take_v2_authenticated_only_boundary',
      has_function_privilege(
        'authenticated',
        'public.rpc_studio_take_live_program_v2(uuid,uuid,bigint,bigint,uuid,text,text,jsonb,text)',
        'EXECUTE'
      )
      and has_function_privilege(
        'service_role',
        'public.rpc_studio_take_live_program_v2(uuid,uuid,bigint,bigint,uuid,text,text,jsonb,text)',
        'EXECUTE'
      )
      and not has_function_privilege(
        'anon',
        'public.rpc_studio_take_live_program_v2(uuid,uuid,bigint,bigint,uuid,text,text,jsonb,text)',
        'EXECUTE'
      )
    ),
    (
      'legacy_take_not_authenticated_executable',
      not has_function_privilege(
        'authenticated',
        'public.rpc_studio_take_live_program_v1(uuid,uuid,bigint,bigint,uuid,text,text,jsonb,text)',
        'EXECUTE'
      )
      and not has_function_privilege(
        'anon',
        'public.rpc_studio_take_live_program_v1(uuid,uuid,bigint,bigint,uuid,text,text,jsonb,text)',
        'EXECUTE'
      )
    ),
    (
      'media_admission_v2_authenticated_only_boundary',
      has_function_privilege(
        'authenticated',
        'public.rpc_get_live_studio_media_admission_v2(uuid,uuid,text)',
        'EXECUTE'
      )
      and has_function_privilege(
        'service_role',
        'public.rpc_get_live_studio_media_admission_v2(uuid,uuid,text)',
        'EXECUTE'
      )
      and not has_function_privilege(
        'anon',
        'public.rpc_get_live_studio_media_admission_v2(uuid,uuid,text)',
        'EXECUTE'
      )
    ),
    (
      'legacy_media_admission_not_authenticated_executable',
      not has_function_privilege(
        'authenticated',
        'public.rpc_get_live_studio_media_admission_v1(uuid,uuid,text)',
        'EXECUTE'
      )
      and not has_function_privilege(
        'anon',
        'public.rpc_get_live_studio_media_admission_v1(uuid,uuid,text)',
        'EXECUTE'
      )
    ),
    (
      'operator_console_authenticated_only_boundary',
      has_function_privilege(
        'authenticated',
        'public.rpc_get_live_studio_operator_console_v1(uuid)',
        'EXECUTE'
      )
      and not has_function_privilege(
        'anon',
        'public.rpc_get_live_studio_operator_console_v1(uuid)',
        'EXECUTE'
      )
    ),
    (
      'operator_role_assignment_authenticated_only_boundary',
      has_function_privilege(
        'authenticated',
        'public.rpc_admin_set_live_studio_access_v2(uuid,boolean,text,jsonb,text,timestamp with time zone)',
        'EXECUTE'
      )
      and not has_function_privilege(
        'anon',
        'public.rpc_admin_set_live_studio_access_v2(uuid,boolean,text,jsonb,text,timestamp with time zone)',
        'EXECUTE'
      )
    ),
    (
      'emergency_safe_scene_authenticated_only_boundary',
      has_function_privilege(
        'authenticated',
        'public.rpc_studio_emergency_safe_scene_v1(uuid,text)',
        'EXECUTE'
      )
      and not has_function_privilege(
        'anon',
        'public.rpc_studio_emergency_safe_scene_v1(uuid,text)',
        'EXECUTE'
      )
    ),
    (
      'start_and_end_authenticated_only_boundary',
      has_function_privilege(
        'authenticated',
        'public.rpc_studio_start_live_session_v1(uuid)',
        'EXECUTE'
      )
      and has_function_privilege(
        'authenticated',
        'public.rpc_studio_end_live_session_v1(uuid)',
        'EXECUTE'
      )
      and not has_function_privilege(
        'anon',
        'public.rpc_studio_start_live_session_v1(uuid)',
        'EXECUTE'
      )
      and not has_function_privilege(
        'anon',
        'public.rpc_studio_end_live_session_v1(uuid)',
        'EXECUTE'
      )
    ),
    (
      'internal_step_up_helpers_not_client_executable',
      not has_function_privilege('authenticated', 'public.live_studio_has_aal2_v1()', 'EXECUTE')
      and not has_function_privilege('anon', 'public.live_studio_has_aal2_v1()', 'EXECUTE')
      and not has_function_privilege(
        'authenticated',
        'public.live_studio_enforce_step_up_transition_v1()',
        'EXECUTE'
      )
      and not has_function_privilege(
        'anon',
        'public.live_studio_enforce_step_up_transition_v1()',
        'EXECUTE'
      )
    )
)
select jsonb_build_object(
  'checkCount', count(*),
  'passedCount', count(*) filter (where passed),
  'failedCount', count(*) filter (where not passed),
  'failedChecks', coalesce(
    jsonb_agg(check_name order by check_name) filter (where not passed),
    '[]'::jsonb
  ),
  'checks', jsonb_object_agg(check_name, passed order by check_name)
) as phase_b_health
from checks;
