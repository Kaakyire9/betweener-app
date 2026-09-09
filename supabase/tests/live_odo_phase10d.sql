begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

select has_table('public','live_odo_full_quick_connect_settings',
  'full Quick Connect session settings exist');
select has_table('public','live_odo_full_quick_connect_actions',
  'full Quick Connect action ledger exists');
select has_table('public','live_odo_full_quick_connect_updates',
  'content-free full Quick Connect invalidation exists');
select has_column('public','live_odo_configuration',
  'full_quick_connect_autopilot_enabled','full Quick Connect has a separate rollout flag');
select has_column('public','live_odo_configuration',
  'full_quick_connect_internal_only','full Quick Connect has an internal-only fence');
select has_column('public','live_odo_configuration',
  'full_quick_connect_low_liquidity_seconds','low-liquidity pacing is server configured');
select has_column('public','live_odo_configuration',
  'full_quick_connect_maximum_runtime_minutes','maximum runtime is server configured');
select has_column('public','live_odo_configuration',
  'full_quick_connect_reconcile_seconds','reconciliation pacing is server configured');
select has_column('public','live_quick_connect_pairings','odo_conversation_spark',
  'private pair-scoped Odo Spark storage exists');
select has_column('public','live_quick_connect_pairings','odo_spark_published_at',
  'private Spark idempotency timestamp exists');

select ok((select relrowsecurity from pg_class
  where oid = 'public.live_odo_full_quick_connect_settings'::regclass),
  'full Quick Connect settings have RLS');
select ok((select relrowsecurity from pg_class
  where oid = 'public.live_odo_full_quick_connect_actions'::regclass),
  'full Quick Connect actions have RLS');
select ok((select relrowsecurity from pg_class
  where oid = 'public.live_odo_full_quick_connect_updates'::regclass),
  'full Quick Connect invalidations have RLS');
select ok(not has_table_privilege('authenticated',
  'public.live_odo_full_quick_connect_settings','INSERT,UPDATE,DELETE'),
  'authenticated cannot write settings directly');
select ok(not has_table_privilege('authenticated',
  'public.live_odo_full_quick_connect_actions','INSERT,UPDATE,DELETE'),
  'authenticated cannot forge lifecycle actions');
select ok(not has_table_privilege('service_role',
  'public.live_odo_full_quick_connect_settings','INSERT,UPDATE,DELETE'),
  'service role cannot bypass settings RPCs');
select ok(not has_table_privilege('service_role',
  'public.live_odo_full_quick_connect_actions','INSERT,UPDATE,DELETE'),
  'service role cannot bypass the reconciler');
select ok(has_function_privilege('authenticated',
  'public.rpc_get_live_odo_full_quick_connect_v1(uuid)','EXECUTE'),
  'authenticated Host projection is callable');
select ok(has_function_privilege('authenticated',
  'public.rpc_enable_live_odo_full_quick_connect_v1(uuid,jsonb)','EXECUTE'),
  'authenticated Host enable is callable');
select ok(has_function_privilege('authenticated',
  'public.rpc_finish_live_odo_quick_connect_v1(uuid)','EXECUTE'),
  'authenticated Host can request draining');
select ok(has_function_privilege('authenticated',
  'public.rpc_resume_live_odo_full_quick_connect_v1(uuid)','EXECUTE'),
  'authenticated Host resume is callable');
select ok(has_function_privilege('authenticated',
  'public.rpc_get_live_odo_quick_connect_public_v1(uuid)','EXECUTE'),
  'participant-safe public projection is callable');
select ok(not has_function_privilege('authenticated',
  'public.rpc_service_reconcile_live_odo_full_quick_connect_v1(uuid,uuid,uuid)',
  'EXECUTE'),'authenticated cannot call the lifecycle reconciler');
select ok(has_function_privilege('service_role',
  'public.rpc_service_reconcile_live_odo_full_quick_connect_v1(uuid,uuid,uuid)',
  'EXECUTE'),'service role has only the narrow lifecycle boundary');
select ok(has_function_privilege('authenticated',
  'public.rpc_admin_update_live_odo_full_quick_connect_v1(jsonb)','EXECUTE'),
  'admin configuration RPC is callable through authenticated authorization');
select ok(exists (select 1 from pg_publication_tables
  where pubname = 'supabase_realtime' and schemaname = 'public'
    and tablename = 'live_odo_full_quick_connect_updates'),
  'Realtime publishes only the content-free invalidation projection');
select ok((select not full_quick_connect_autopilot_enabled
    and full_quick_connect_internal_only
  from public.live_odo_configuration where id = true),
  '10D is off and internal-only by default');
select ok((select not full_autopilot_enabled and not music_enabled
  from public.live_odo_configuration where id = true),
  'full-show Autopilot and music authority remain disabled');

insert into auth.users(id,email) values
  ('da000000-0000-4000-8000-000000000001','full-quick-host@example.test'),
  ('da000000-0000-4000-8000-000000000002','full-quick-member@example.test');
select set_config('app.profile_guard_write','on',true);
insert into public.profiles(
  id,user_id,full_name,age,gender,profile_completed,verification_level,
  min_age_interest,max_age_interest,age_preference_confirmed_at,
  phone_verified,phone_number,identity_status,region
) values
  ('db000000-0000-4000-8000-000000000001','da000000-0000-4000-8000-000000000001',
   'Full Quick Host',35,'MALE',true,1,25,45,now(),true,'+447000010001','active','London'),
  ('db000000-0000-4000-8000-000000000002','da000000-0000-4000-8000-000000000002',
   'Full Quick Member',32,'FEMALE',true,1,25,45,now(),true,'+447000010002','active','London');
select set_config('app.profile_guard_write','off',true);
insert into public.live_sessions(
  id,title,format,status,context_type,created_by_user_id,
  created_by_profile_id,provider_call_id
) values (
  'dc000000-0000-4000-8000-000000000001','Full Quick test','quick_connect','live',
  'global','da000000-0000-4000-8000-000000000001',
  'db000000-0000-4000-8000-000000000001','odo_full_quick_test_call'
);
insert into public.live_participants(
  session_id,user_id,profile_id,origin_context_type,role,state,stage_slot
) values
  ('dc000000-0000-4000-8000-000000000001','da000000-0000-4000-8000-000000000001',
   'db000000-0000-4000-8000-000000000001','global','host','on_stage',1),
  ('dc000000-0000-4000-8000-000000000001','da000000-0000-4000-8000-000000000002',
   'db000000-0000-4000-8000-000000000002','global','audience','audience',null);
update public.live_odo_configuration set
  odo_enabled = true,
  copilot_enabled = true,
  guarded_autopilot_enabled = true,
  full_quick_connect_autopilot_enabled = true,
  full_quick_connect_internal_only = true,
  full_autopilot_enabled = false,
  auto_narration_enabled = true,
  auto_scene_enabled = true,
  auto_spark_enabled = true,
  auto_audience_pulse_enabled = false,
  auto_intermission_enabled = true,
  music_enabled = false,
  circuit_breaker_open = false,
  pricing_version = 'full-quick-test-v1'
where id = true;
insert into public.live_odo_guarded_autopilot_host_allowlist(user_id,note)
values ('da000000-0000-4000-8000-000000000001','10D pgTAP Host');

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','da000000-0000-4000-8000-000000000001',true);
select is(public.rpc_get_live_odo_full_quick_connect_v1(
  'dc000000-0000-4000-8000-000000000001')->>'available','true',
  'an allowlisted Quick Connect Host can see full Autopilot availability');
select is(public.rpc_get_live_odo_full_quick_connect_v1(
  'dc000000-0000-4000-8000-000000000001')->>'healthState','healthy',
  'pre-flight returns a stable high-level health state');
select ok(position('rpc_service_reconcile_live_odo_full_quick_connect_v1'
  in pg_get_functiondef('public.run_live_maintenance()'::regprocedure)) > 0,
  'the consolidated server maintenance clock can recover a due 10D session');
select is(public.rpc_enable_live_odo_full_quick_connect_v1(
  'dc000000-0000-4000-8000-000000000001','{}'::jsonb
)->>'enabled','true','the Host explicitly enables full Quick Connect Autopilot');
select is((select lifecycle_state from public.live_odo_full_quick_connect_settings
  where session_id = 'dc000000-0000-4000-8000-000000000001'),'preparing',
  'enable starts from the durable preparing state');
select is((select state from public.live_quick_connect_controls
  where session_id = 'dc000000-0000-4000-8000-000000000001'),'closed',
  'Host enable does not bypass the service lifecycle boundary');
select throws_ok(
  $$ select public.rpc_enable_live_odo_full_quick_connect_v1(
    'dc000000-0000-4000-8000-000000000001','{"unexpected":true}'::jsonb
  ) $$,'22023','live_odo_full_quick_settings_invalid',
  'unknown Host settings fail closed');
select throws_ok(
  $$ select public.rpc_service_reconcile_live_odo_full_quick_connect_v1(
    'dc000000-0000-4000-8000-000000000001',
    'da000000-0000-4000-8000-000000000001',
    'dd000000-0000-4000-8000-000000000001'
  ) $$,'42501','live_odo_service_role_required',
  'an authenticated request cannot impersonate the reconciler');

select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claim.sub','',true);
create temporary table full_quick_open as
select public.rpc_service_reconcile_live_odo_full_quick_connect_v1(
  'dc000000-0000-4000-8000-000000000001',
  'da000000-0000-4000-8000-000000000001',
  'dd000000-0000-4000-8000-000000000001'
) payload;
select is((select payload->>'allowed' from full_quick_open),'true',
  'the service reconciler accepts a fresh authorized wake');
select is((select payload->>'actionType' from full_quick_open),'OPEN_POOL',
  'Odo opens the authorized Quick Connect pool');
select is((select state from public.live_quick_connect_controls
  where session_id = 'dc000000-0000-4000-8000-000000000001'),'open',
  'the existing Quick Connect control is authoritative and open');
select is((select lifecycle_state from public.live_odo_full_quick_connect_settings
  where session_id = 'dc000000-0000-4000-8000-000000000001'),'active',
  'the durable lifecycle becomes active');
select is((select status from public.live_sessions
  where id = 'dc000000-0000-4000-8000-000000000001'),'live',
  'opening Quick Connect never changes the Live session lifecycle');
select is((select count(*)::integer from public.live_odo_full_quick_connect_actions
  where session_id = 'dc000000-0000-4000-8000-000000000001'
    and action_type = 'OPEN_POOL'),1,
  'the lifecycle action is idempotently audited');

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','da000000-0000-4000-8000-000000000001',true);
select is(public.rpc_take_over_live_odo_v1(
  'dc000000-0000-4000-8000-000000000001'
)->>'fullQuickConnectPaused','true','Take Control immediately pauses full Quick Connect');
select is((select lifecycle_state from public.live_odo_full_quick_connect_settings
  where session_id = 'dc000000-0000-4000-8000-000000000001'),'paused_by_host',
  'takeover is durably visible as a Host pause');
select is((select enabled from public.live_odo_full_quick_connect_settings
  where session_id = 'dc000000-0000-4000-8000-000000000001'),false,
  'takeover disables future automatic lifecycle work');
select is((select state from public.live_quick_connect_controls
  where session_id = 'dc000000-0000-4000-8000-000000000001'),'open',
  'takeover preserves the pool and any active pair');
select is(public.rpc_resume_live_odo_full_quick_connect_v1(
  'dc000000-0000-4000-8000-000000000001'
)->>'resumed','true','the Host may explicitly resume after takeover');
select is((select enabled from public.live_odo_full_quick_connect_settings
  where session_id = 'dc000000-0000-4000-8000-000000000001'),true,
  'explicit resume reenables lifecycle work');
select is((select lifecycle_state from public.live_odo_full_quick_connect_settings
  where session_id = 'dc000000-0000-4000-8000-000000000001'),'preparing',
  'resume returns through the fresh preparing fence');

update public.live_odo_configuration set circuit_breaker_open = true where id = true;
select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claim.sub','',true);
create temporary table full_quick_policy_pause as
select public.rpc_service_reconcile_live_odo_full_quick_connect_v1(
  'dc000000-0000-4000-8000-000000000001',
  'da000000-0000-4000-8000-000000000001',
  'dd000000-0000-4000-8000-000000000002'
) payload;
select is((select payload->>'allowed' from full_quick_policy_pause),'false',
  'the global circuit breaker rejects the next wake');
select is((select payload->>'reasonCode' from full_quick_policy_pause),'circuit_breaker_open',
  'the policy pause has a stable reason code');
select is((select lifecycle_state from public.live_odo_full_quick_connect_settings
  where session_id = 'dc000000-0000-4000-8000-000000000001'),'paused_by_policy',
  'the circuit breaker creates a durable policy pause');
select is((select enabled from public.live_odo_guarded_autopilot_settings
  where session_id = 'dc000000-0000-4000-8000-000000000001'),false,
  'policy pause also disables presentation Autopilot');
select ok((select direction_mode = 'manual' and autopilot_state = 'paused_by_policy'
  from public.live_odo_session_state
  where session_id = 'dc000000-0000-4000-8000-000000000001'),
  'policy pause returns control to the Host and fences the lease');
select is(public.rpc_service_clear_live_odo_policy_pause_v1(
  'dc000000-0000-4000-8000-000000000001','full_quick_safety_review_complete'
)->>'cleared','true','Safety may clear the policy fence without resuming Odo');
select is((select lifecycle_state from public.live_odo_full_quick_connect_settings
  where session_id = 'dc000000-0000-4000-8000-000000000001'),'paused_by_host',
  'clearance still requires an explicit Host resume');

update public.live_odo_configuration set circuit_breaker_open = false where id = true;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','da000000-0000-4000-8000-000000000001',true);
select is(public.rpc_resume_live_odo_full_quick_connect_v1(
  'dc000000-0000-4000-8000-000000000001'
)->>'resumed','true','Host may resume after Safety clearance');
select is(public.rpc_finish_live_odo_quick_connect_v1(
  'dc000000-0000-4000-8000-000000000001'
)->>'draining','true','Finish Current Connections starts a graceful drain');
select is((select state from public.live_quick_connect_controls
  where session_id = 'dc000000-0000-4000-8000-000000000001'),'ended',
  'a drain with no active pairs closes Quick Connect immediately');
select is((select status from public.live_sessions
  where id = 'dc000000-0000-4000-8000-000000000001'),'live',
  'finishing Quick Connect leaves the Live room running');

select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claim.sub','',true);
create temporary table full_quick_closing as
select public.rpc_service_reconcile_live_odo_full_quick_connect_v1(
  'dc000000-0000-4000-8000-000000000001',
  'da000000-0000-4000-8000-000000000001',
  'dd000000-0000-4000-8000-000000000003'
) payload;
select is((select payload->>'actionType' from full_quick_closing),'QUICK_CONNECT_CLOSING',
  'the reconciler observes authoritative drain completion');
select is((select lifecycle_state from public.live_odo_full_quick_connect_settings
  where session_id = 'dc000000-0000-4000-8000-000000000001'),'closing',
  'the lifecycle enters closing before finalization');
create temporary table full_quick_closed as
select public.rpc_service_reconcile_live_odo_full_quick_connect_v1(
  'dc000000-0000-4000-8000-000000000001',
  'da000000-0000-4000-8000-000000000001',
  'dd000000-0000-4000-8000-000000000004'
) payload;
select is((select payload->>'actionType' from full_quick_closed),'CLOSE_QUICK_CONNECT',
  'the final reconciliation closes only the Quick Connect segment');
select is((select lifecycle_state from public.live_odo_full_quick_connect_settings
  where session_id = 'dc000000-0000-4000-8000-000000000001'),'ended',
  'the full Quick Connect lifecycle ends durably');
select is((select enabled from public.live_odo_full_quick_connect_settings
  where session_id = 'dc000000-0000-4000-8000-000000000001'),false,
  'ended full Quick Connect has no remaining automatic authority');
select is((select status from public.live_sessions
  where id = 'dc000000-0000-4000-8000-000000000001'),'live',
  '10D cannot end the Live session');
select is((select count(*)::integer from public.live_director_events
  where session_id = 'dc000000-0000-4000-8000-000000000001'
    and payload ? 'question'),0,
  'pair-private Sparks never enter the room Director event stream');
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','da000000-0000-4000-8000-000000000001',true);
select is(public.rpc_get_live_odo_quick_connect_public_v1(
  'dc000000-0000-4000-8000-000000000001')->>'active','false',
  'participants receive only the safe inactive public projection after closure');

select * from finish();
rollback;
