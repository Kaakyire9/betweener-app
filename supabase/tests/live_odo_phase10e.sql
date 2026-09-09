begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

select has_table('public','live_odo_show_sessions','Show Director state exists');
select has_table('public','live_odo_show_actions','show action audit exists');
select has_table('public','live_music_tracks','approved music catalogue exists');
select has_table('public','live_music_session_state','synchronised music state exists');
select has_table('public','live_music_events','music action audit exists');
select has_table('public','live_odo_show_updates','content-free show invalidation exists');

select ok((select relrowsecurity from pg_class
  where oid = 'public.live_odo_show_sessions'::regclass),'show state has RLS');
select ok((select relrowsecurity from pg_class
  where oid = 'public.live_music_tracks'::regclass),'music catalogue has RLS');
select ok((select relrowsecurity from pg_class
  where oid = 'public.live_music_events'::regclass),'music audit has RLS');
select ok(not has_table_privilege('authenticated','public.live_odo_show_sessions',
  'INSERT,UPDATE,DELETE'),'authenticated users cannot write show state');
select ok(not has_table_privilege('authenticated','public.live_music_tracks',
  'SELECT,INSERT,UPDATE,DELETE'),'clients cannot enumerate or change the private catalogue');
select ok(not has_table_privilege('service_role','public.live_odo_show_actions',
  'INSERT,UPDATE,DELETE'),'service role cannot bypass show RPCs');
select ok(exists (select 1 from pg_publication_tables
  where pubname = 'supabase_realtime' and schemaname = 'public'
    and tablename = 'live_odo_show_updates'),
  'Realtime publishes the content-free show invalidation only');
select ok((select not show_director_enabled and show_director_internal_only
    and not music_auto_enabled and not music_ducking_enabled
    and not show_intermission_enabled and not show_energy_mode_enabled
    and not odo_voice_enabled and not betweener_studio_enabled
    and not betweener_studio_control_enabled and not screen_share_enabled
  from public.live_odo_configuration where id = true),
  '10E capabilities are conservative and internal by default');

select ok(has_function_privilege('authenticated',
  'public.rpc_get_live_odo_show_director_v1(uuid)','EXECUTE'),
  'Host Show Director projection is callable');
select ok(has_function_privilege('authenticated',
  'public.rpc_get_live_program_snapshot_v1(uuid)','EXECUTE'),
  'participant-safe program projection is callable');
select ok(has_function_privilege('authenticated',
  'public.rpc_enable_live_odo_show_director_v1(uuid)','EXECUTE'),
  'Host can explicitly enable Show Director');
select ok(has_function_privilege('authenticated',
  'public.rpc_host_set_live_show_scene_v1(uuid,text,bigint)','EXECUTE'),
  'Host can choose a predefined scene');
select ok(has_function_privilege('authenticated',
  'public.rpc_host_control_live_music_v1(uuid,text,uuid,uuid,numeric,text,uuid)',
  'EXECUTE'),'Host has the narrow approved music boundary');
select ok(not has_function_privilege('authenticated',
  'public.rpc_service_reconcile_live_odo_show_v1(uuid,uuid,uuid)','EXECUTE'),
  'authenticated clients cannot invoke the show reconciler');
select ok(not has_function_privilege('authenticated',
  'public.rpc_service_get_live_music_playback_v1(uuid,uuid)','EXECUTE'),
  'clients cannot choose catalogue paths through the service descriptor');
select ok(position('rpc_service_reconcile_live_odo_show_v1'
  in pg_get_functiondef('public.run_live_maintenance()'::regprocedure)) > 0,
  'server maintenance can recover a due Show Director wake');

insert into auth.users(id,email) values
  ('ea000000-0000-4000-8000-000000000001','show-host@example.test'),
  ('ea000000-0000-4000-8000-000000000002','show-member@example.test');
select set_config('app.profile_guard_write','on',true);
insert into public.profiles(
  id,user_id,full_name,age,gender,profile_completed,verification_level,
  min_age_interest,max_age_interest,age_preference_confirmed_at,
  phone_verified,phone_number,identity_status,region
) values
  ('eb000000-0000-4000-8000-000000000001','ea000000-0000-4000-8000-000000000001',
   'Show Host',35,'MALE',true,1,25,45,now(),true,'+447000020001','active','London'),
  ('eb000000-0000-4000-8000-000000000002','ea000000-0000-4000-8000-000000000002',
   'Show Member',32,'FEMALE',true,1,25,45,now(),true,'+447000020002','active','London');
select set_config('app.profile_guard_write','off',true);
insert into public.live_sessions(
  id,title,format,status,context_type,created_by_user_id,
  created_by_profile_id,provider_call_id
) values (
  'ec000000-0000-4000-8000-000000000001','Show Director test','quick_connect','live',
  'global','ea000000-0000-4000-8000-000000000001',
  'eb000000-0000-4000-8000-000000000001','odo_show_test_call'
);
insert into public.live_participants(
  session_id,user_id,profile_id,origin_context_type,role,state,stage_slot
) values
  ('ec000000-0000-4000-8000-000000000001','ea000000-0000-4000-8000-000000000001',
   'eb000000-0000-4000-8000-000000000001','global','host','on_stage',1),
  ('ec000000-0000-4000-8000-000000000001','ea000000-0000-4000-8000-000000000002',
   'eb000000-0000-4000-8000-000000000002','global','audience','audience',null);
update public.live_odo_configuration set
  odo_enabled = true,
  show_director_enabled = true,
  show_director_internal_only = true,
  music_enabled = false,
  music_auto_enabled = false,
  music_ducking_enabled = false,
  show_intermission_enabled = false,
  show_energy_mode_enabled = false,
  circuit_breaker_open = false,
  pricing_version = 'show-test-v1'
where id = true;
insert into public.live_odo_guarded_autopilot_host_allowlist(user_id,note)
values ('ea000000-0000-4000-8000-000000000001','10E pgTAP Host');

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','ea000000-0000-4000-8000-000000000001',true);
select is(public.rpc_get_live_odo_show_director_v1(
  'ec000000-0000-4000-8000-000000000001')->>'available','true',
  'an allowlisted Host sees Show Director availability');
select is(public.rpc_enable_live_odo_show_director_v1(
  'ec000000-0000-4000-8000-000000000001')->>'enabled','true',
  'Show Director requires an explicit Host start');
select is((select control_source from public.live_odo_show_sessions
  where session_id = 'ec000000-0000-4000-8000-000000000001'),'odo',
  'ODO may hold initial program control without a human lease');
select throws_ok(
  $$ select public.rpc_service_reconcile_live_odo_show_v1(
    'ec000000-0000-4000-8000-000000000001',
    'ea000000-0000-4000-8000-000000000001',
    'ed000000-0000-4000-8000-000000000001') $$,
  '42501','live_odo_service_role_required',
  'an authenticated user cannot impersonate the reconciler');
select is(public.rpc_host_control_live_music_v1(
  'ec000000-0000-4000-8000-000000000001','stop',null,null,null,null,
  'ee000000-0000-4000-8000-000000000001')->>'reasonCode','music_disabled',
  'music fails closed while the rollout flag is disabled');
select throws_ok(
  $$ insert into public.live_music_tracks(
    title,artist,storage_path,mood,duration_seconds,license_status,
    license_reference,enabled
  ) values (
    'Unsafe','Unknown','https://example.test/song.mp3','warm',30,'approved',
    'phase10e-test-license',true
  ) $$,
  '23514',null,'arbitrary external music URLs are rejected');
insert into public.live_music_tracks(
  id,title,artist,storage_path,mood,duration_seconds,license_status,
  license_reference,licensed_regions,enabled
) values (
  'ef000000-0000-4000-8000-000000000001','Approved test track',
  'Betweener Test Catalogue','programme/test/approved-track.m4a','warm',180,
  'approved','phase10e-test-license',array['*']::text[],true
);
update public.live_odo_configuration set
  music_enabled = true, circuit_breaker_open = true where id = true;
select is(public.rpc_host_control_live_music_v1(
  'ec000000-0000-4000-8000-000000000001','play_track',
  'ef000000-0000-4000-8000-000000000001',null,null,null,
  'ee000000-0000-4000-8000-000000000002')->>'reasonCode',
  'circuit_breaker_open','Safety blocks new Host music actions');
update public.live_odo_configuration set circuit_breaker_open = false where id = true;
select is(public.rpc_host_control_live_music_v1(
  'ec000000-0000-4000-8000-000000000001','play_track',
  'ef000000-0000-4000-8000-000000000001',null,null,null,
  'ee000000-0000-4000-8000-000000000003')->>'applied','true',
  'Host may play only an approved catalogue track');
select ok((select host_suppression_ends_at > timezone('utc',now())
  from public.live_odo_show_sessions
  where session_id = 'ec000000-0000-4000-8000-000000000001'),
  'Host music control suppresses immediate Odo replacement');
select is((select count(*)::integer from public.live_music_events
  where session_id = 'ec000000-0000-4000-8000-000000000001'
    and source = 'mobile_host'),1,'Host music action is idempotently audited');
update public.live_odo_show_sessions set host_suppression_ends_at = null
where session_id = 'ec000000-0000-4000-8000-000000000001';

select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claim.sub','',true);
create temporary table show_reconcile as
select public.rpc_service_reconcile_live_odo_show_v1(
  'ec000000-0000-4000-8000-000000000001',
  'ea000000-0000-4000-8000-000000000001',
  'ed000000-0000-4000-8000-000000000002'
) payload;
select is((select payload->>'allowed' from show_reconcile),'true',
  'the service reconciles a fresh authorized Show Director wake');
select is((select current_scene from public.live_odo_show_sessions
  where session_id = 'ec000000-0000-4000-8000-000000000001'),'host_focus',
  'the opening scene remains stable through its minimum dwell');
select is((select payload->>'reasonCode' from show_reconcile),
  'scene_minimum_dwell_active','the deterministic cooldown prevents scene thrash');
update public.live_odo_show_sessions set
  scene_entered_at = timezone('utc',now()) - interval '5 minutes'
where session_id = 'ec000000-0000-4000-8000-000000000001';
create temporary table show_after_dwell as
select public.rpc_service_reconcile_live_odo_show_v1(
  'ec000000-0000-4000-8000-000000000001',
  'ea000000-0000-4000-8000-000000000001',
  'ed000000-0000-4000-8000-000000000004'
) payload;
select is((select current_scene from public.live_odo_show_sessions
  where session_id = 'ec000000-0000-4000-8000-000000000001'),'host_plus_pool',
  'the deterministic baseline presents the room after dwell without selecting a pair');
select is((select status from public.live_sessions
  where id = 'ec000000-0000-4000-8000-000000000001'),'live',
  'Show Director cannot change the Live lifecycle');
select is(public.rpc_service_get_live_music_playback_v1(
  'ec000000-0000-4000-8000-000000000001',
  'ea000000-0000-4000-8000-000000000001')->>'reasonCode',
  'publisher_device_mix_unsupported',
  'publisher devices cannot run unsynchronised local program music');
select is(public.rpc_service_get_live_music_playback_v1(
  'ec000000-0000-4000-8000-000000000001',
  'ea000000-0000-4000-8000-000000000002')->>'allowed','true',
  'an eligible main-room audience member may receive approved playback state');
select is(public.rpc_service_get_live_music_playback_v1(
  'ec000000-0000-4000-8000-000000000001',
  'ea000000-0000-4000-8000-000000000002')->>'path',
  'programme/test/approved-track.m4a',
  'the service—not the caller—selects the approved private storage path');

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','ea000000-0000-4000-8000-000000000001',true);
create temporary table host_scene as
select public.rpc_host_set_live_show_scene_v1(
  'ec000000-0000-4000-8000-000000000001','odo_stage',
  (select version from public.live_odo_show_sessions
    where session_id = 'ec000000-0000-4000-8000-000000000001')
) payload;
select is((select payload->>'changed' from host_scene),'true',
  'Host may override to a predefined scene');
select is((select current_scene from public.live_odo_show_sessions
  where session_id = 'ec000000-0000-4000-8000-000000000001'),'odo_stage',
  'Host scene choice is authoritative');

select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claim.sub','',true);
select is(public.rpc_service_reconcile_live_odo_show_v1(
  'ec000000-0000-4000-8000-000000000001',
  'ea000000-0000-4000-8000-000000000001',
  'ed000000-0000-4000-8000-000000000003')->>'reasonCode',
  'host_scene_suppression_active','automatic work respects Host suppression');

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','ea000000-0000-4000-8000-000000000001',true);
select is(public.rpc_take_over_live_odo_show_v1(
  'ec000000-0000-4000-8000-000000000001')->>'takenOver','true',
  'Take Control immediately fences Show Director');
select ok((select paused_by_host and show_state = 'paused_by_host'
  from public.live_odo_show_sessions
  where session_id = 'ec000000-0000-4000-8000-000000000001'),
  'Host takeover is durable');
select is(public.rpc_resume_live_odo_show_v1(
  'ec000000-0000-4000-8000-000000000001')->>'resumed','true',
  'Show Director resumes only after a deliberate Host action');
select is(public.rpc_acquire_live_program_control_v1(
  'ec000000-0000-4000-8000-000000000001','mobile_host',
  (select version from public.live_odo_show_sessions
    where session_id = 'ec000000-0000-4000-8000-000000000001')
)->>'acquired','true','an authorized Host can acquire the fenced program lease');
update public.live_odo_show_sessions set
  control_lease_expires_at = timezone('utc',now()) - interval '1 second',
  next_wake_at = timezone('utc',now()) - interval '1 second'
where session_id = 'ec000000-0000-4000-8000-000000000001';
select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claim.sub','',true);
select is(public.rpc_service_reconcile_live_odo_show_v1(
  'ec000000-0000-4000-8000-000000000001',
  'ea000000-0000-4000-8000-000000000001',
  'ed000000-0000-4000-8000-000000000005')->>'allowed','true',
  'an expired program-control lease returns through fresh reconciliation');
select ok((select not paused_by_host and control_source = 'odo'
    and control_user_id is null and control_lease_expires_at is null
  from public.live_odo_show_sessions
  where session_id = 'ec000000-0000-4000-8000-000000000001'),
  'expired temporary control returns safely to Odo');

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','ea000000-0000-4000-8000-000000000002',true);
create temporary table public_program as
select public.rpc_get_live_program_snapshot_v1(
  'ec000000-0000-4000-8000-000000000001') payload;
select ok(not ((select payload from public_program) ? 'controlSource')
    and not ((select payload from public_program) ? 'metrics')
    and not ((select payload from public_program) ? 'leaseGeneration'),
  'participant projection strips Host control and operational metrics');
select ok(not (((select payload from public_program)->'music') ? 'storagePath')
    and not (((select payload from public_program)->'music') ? 'url'),
  'participant projection contains no catalogue path or signed URL');
select is((select count(*)::integer from public.live_director_events
  where session_id = 'ec000000-0000-4000-8000-000000000001'
    and payload ?| array['participantId','userId','profileId']),0,
  'show events expose no selected participant identity');

select * from finish();
rollback;
