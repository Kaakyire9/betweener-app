-- Permanent deny/allow regressions. Run in the disposable clone via the local
-- runner, after its legacy fixture and migration. Every test mutation rolls back.
\set ON_ERROR_STOP on
begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions,pg_catalog;
select no_plan();
select is((select count(*) from public.intent_requests where actor_id='e0120000-0000-4000-8000-000000000001'),0::bigint,
  'M0-1: no request/recipient approval exists for the attack pair');
select is((select count(*) from public.swipes where swiper_id in ('e0120000-0000-4000-8000-000000000001','e0120000-0000-4000-8000-000000000002')),0::bigint,
  'M0-2: no independent mutual swipes exist for the attack pair');
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','e0110000-0000-4000-8000-000000000001',true);
select throws_ok($$insert into public.matches(user1_id,user2_id,status) values
 ('e0120000-0000-4000-8000-000000000001','e0120000-0000-4000-8000-000000000002','ACCEPTED')$$,
 '42501','permission denied for table matches','M0-3: authenticated forged ACCEPTED insert denied');
select is((select count(*) from public.matches where user1_id='e0120000-0000-4000-8000-000000000001'),0::bigint,
 'M0-4: forged accepted relationship was not created');
select ok(not public.can_users_chat('e0110000-0000-4000-8000-000000000001','e0110000-0000-4000-8000-000000000002'),
 'M0-5: legacy chat helper cannot trust a nonexistent forged relationship');
select set_config('request.jwt.claim.sub','e0110000-0000-4000-8000-000000000005',true);
select throws_ok($$update public.matches set status='ACCEPTED' where id='e0130000-0000-4000-8000-000000000002'$$,
 '42501','permission denied for table matches','M0-6: unilateral pending promotion denied');
set local role postgres;
select is((select status::text from public.matches where id='e0130000-0000-4000-8000-000000000002'),'PENDING',
 'M0-7: pending row remains unchanged');
set local role authenticated;
select set_config('request.jwt.claim.sub','e0110000-0000-4000-8000-000000000003',true);
select throws_ok($$insert into public.matches(user1_id,user2_id,status) values
 ('e0120000-0000-4000-8000-000000000001','e0120000-0000-4000-8000-000000000002','ACCEPTED')$$,
 '42501','permission denied for table matches','M0-8: unrelated user cannot insert an accepted pair');
set local role postgres;
select is((select count(*) from private.push_notification_events),0::bigint,'M0-9: no synthetic push events produced');

set local role authenticated;
select set_config('request.jwt.claim.sub','e0110000-0000-4000-8000-000000000001',true);
select throws_ok($$insert into public.matches(user1_id,user2_id,status) values
 ('e0120000-0000-4000-8000-000000000001','e0120000-0000-4000-8000-000000000002','ACCEPTED')
 on conflict(user1_id,user2_id) do update set status='ACCEPTED'$$,
 '42501','permission denied for table matches','direct upsert cannot bypass table grants');
select throws_ok($$insert into public.intent_requests(actor_id,recipient_id,type,status,expires_at) values
 ('e0120000-0000-4000-8000-000000000001','e0120000-0000-4000-8000-000000000002','connect','accepted',now()+interval '1 day')$$,
 '42501','permission denied for table intent_requests','sender cannot insert a forged recipient decision');
select throws_ok($$select private.relationship_finish_acceptance(null,null,'intent','fake')$$,
 '42501',null,'private acceptance helper is not callable by participants');
select throws_ok($$insert into private.relationship_consent_decisions(source_type,source_key,actor_profile_id,peer_profile_id,actor_user_id)
 values('intent','fake','e0120000-0000-4000-8000-000000000002','e0120000-0000-4000-8000-000000000001','e0110000-0000-4000-8000-000000000002')$$,
 '42501',null,'participant cannot forge private decision evidence');
select set_config('app.relationship_write','on',true);
select set_config('request.jwt.claim.role','service_role',true);
select throws_ok($$insert into public.matches(user1_id,user2_id,status) values
 ('e0120000-0000-4000-8000-000000000001','e0120000-0000-4000-8000-000000000002','ACCEPTED')$$,
 '42501','permission denied for table matches','custom GUC or role string cannot grant database write privilege');
select set_config('request.jwt.claim.role','authenticated',true);

select public.rpc_create_intent_request('e0120000-0000-4000-8000-000000000002','connect',null,null,null,
 '{"voice_allowed":true,"video_allowed":true,"accepted":true}'::jsonb) as request_id \gset
select is(public.rpc_create_intent_request('e0120000-0000-4000-8000-000000000002','connect',null,null,null,
 '{"voice_allowed":true,"video_allowed":true,"accepted":true}'::jsonb),:'request_id'::uuid,
 'identical duplicate request creation returns the same request');
select ok(not public.rpc_is_relationship_mutually_verified('e0120000-0000-4000-8000-000000000002'),
 'calling preferences and sender metadata do not create mutual acceptance');
select throws_ok(format('select public.rpc_decide_intent_request(%L,''accept'')',:'request_id'),
 '42501','intent_decision_forbidden','requester cannot perform recipient acceptance');
select throws_ok(format('select public.rpc_decide_intent_request(%L,null)',:'request_id'),
 '22023','intent_decision_invalid','null decision is rejected rather than treated as pass/accept');
select set_config('request.jwt.claim.sub','e0110000-0000-4000-8000-000000000003',true);
select throws_ok(format('select public.rpc_decide_intent_request(%L,''accept'')',:'request_id'),
 '42501','intent_decision_forbidden','forged RPC request ID cannot impersonate recipient');
select throws_ok($$select public.rpc_admin_execute_account_merge_case(gen_random_uuid())$$,
 '42501','admin access required','ordinary user cannot obtain legacy merge-copy privileges');
select throws_ok($$select private.relationship_execute_legacy_merge_v1(gen_random_uuid())$$,
 '42501',null,'original privileged merge implementation is private');
select set_config('request.jwt.claim.sub','e0110000-0000-4000-8000-000000000002',true);
select lives_ok(format('select public.rpc_decide_intent_request(%L,''accept'')',:'request_id'),
 'actual recipient can accept an unexpired sender-owned Intent Request');
select ok(public.rpc_is_relationship_mutually_verified('e0120000-0000-4000-8000-000000000001'),
 'sender request plus independent recipient action establishes verified acceptance');
select is(public.rpc_decide_intent_request(:'request_id','accept'),:'request_id'::uuid,
 'duplicate recipient acceptance is idempotent');
set local role postgres;
select is((select count(*) from public.matches where user1_id='e0120000-0000-4000-8000-000000000001'
 and user2_id='e0120000-0000-4000-8000-000000000002'),1::bigint,'one canonical match exists');
select is((select count(*) from private.relationship_consent_decisions where source_type='intent' and source_key=:'request_id'),
 2::bigint,'two independent participant decisions exist exactly once');
select is((select count(*) from private.relationship_acceptance_proofs where source_type='intent' and source_key=:'request_id'),
 1::bigint,'one accepted relationship proof exists');
select throws_ok($$insert into public.matches(user1_id,user2_id,status) values
 ('e0120000-0000-4000-8000-000000000011','e0120000-0000-4000-8000-000000000012','ACCEPTED')$$,
 '42501','relationship_mutual_consent_required','trigger rejects unproven privileged writes as well as client writes');

set local role authenticated;
select set_config('request.jwt.claim.sub','e0110000-0000-4000-8000-000000000006',true);
select throws_ok($$select public.rpc_decide_intent_request('e0140000-0000-4000-8000-000000000002','accept')$$,
 '22023','intent_request_not_pending','expired request cannot be revived');
select set_config('request.jwt.claim.sub','e0110000-0000-4000-8000-000000000008',true);
select throws_ok($$select public.rpc_decide_intent_request('e0140000-0000-4000-8000-000000000003','accept')$$,
 '22023','intent_request_not_pending','cancelled request cannot be revived');
select set_config('request.jwt.claim.sub','e0110000-0000-4000-8000-000000000010',true);
select throws_ok($$select public.rpc_decide_intent_request('e0140000-0000-4000-8000-000000000004','accept')$$,
 '42501','relationship_rejected','legitimate source cannot silently reactivate a rejected match');

select set_config('request.jwt.claim.sub','e0110000-0000-4000-8000-000000000003',true);
select is(public.rpc_get_accepted_relationship('e0120000-0000-4000-8000-000000000004'),
 'e0130000-0000-4000-8000-000000000001'::uuid,'historical chat relationship remains available');
select ok(public.can_users_chat('e0110000-0000-4000-8000-000000000003','e0110000-0000-4000-8000-000000000004'),
 'existing historical chat compatibility is retained');
select ok(not public.rpc_is_relationship_mutually_verified('e0120000-0000-4000-8000-000000000004'),
 'uncertain historical accepted label grants no new sensitive authority');
select ok(not public.rpc_reconfirm_relationship('e0120000-0000-4000-8000-000000000004'),
 'one historical participant cannot reconfirm for both');
select set_config('request.jwt.claim.sub','e0110000-0000-4000-8000-000000000004',true);
select ok(public.rpc_reconfirm_relationship('e0120000-0000-4000-8000-000000000003'),
 'two independent explicit reconfirmations verify the historical relationship');
select ok(public.rpc_reconfirm_relationship('e0120000-0000-4000-8000-000000000003'),
 'duplicate reconfirmation is idempotent');
select set_config('request.jwt.claim.sub','e0110000-0000-4000-8000-000000000003',true);
insert into public.blocks(blocker_id,blocked_id) values('e0110000-0000-4000-8000-000000000003','e0110000-0000-4000-8000-000000000004');
select ok(not public.rpc_is_relationship_mutually_verified('e0120000-0000-4000-8000-000000000004'),
 'blocking immediately denies verified authorization');
select ok(not public.can_users_chat('e0110000-0000-4000-8000-000000000003','e0110000-0000-4000-8000-000000000004'),
 'blocking still overrides chat compatibility');
select throws_ok($$select public.rpc_reconfirm_relationship('e0120000-0000-4000-8000-000000000004')$$,
 '42501','relationship_unavailable','blocked pair cannot record new acceptance');
delete from public.blocks where blocker_id='e0110000-0000-4000-8000-000000000003';
select ok(not public.rpc_is_relationship_mutually_verified('e0120000-0000-4000-8000-000000000004'),
 'unblocking does not silently resurrect previous proof');
select ok(not public.rpc_reconfirm_relationship('e0120000-0000-4000-8000-000000000004'),
 'one fresh action after unblock cannot revive the other participant consent');
select set_config('request.jwt.claim.sub','e0110000-0000-4000-8000-000000000004',true);
select ok(public.rpc_reconfirm_relationship('e0120000-0000-4000-8000-000000000003'),
 'two fresh independent reconfirmations restore eligibility');
select lives_ok($$select public.rpc_reject_relationship('e0120000-0000-4000-8000-000000000003')$$,
 'participant can explicitly reject through the authoritative backend');
select ok(not public.rpc_is_relationship_mutually_verified('e0120000-0000-4000-8000-000000000003'),
 'rejection overrides formerly verified acceptance');
select throws_ok($$select public.rpc_reconfirm_relationship('e0120000-0000-4000-8000-000000000003')$$,
 '42501','relationship_not_accepted','reconfirmation cannot reactivate rejection');

select set_config('request.jwt.claim.sub','e0110000-0000-4000-8000-000000000013',true);
insert into public.swipes(swiper_id,target_id,action) values('e0120000-0000-4000-8000-000000000013','e0120000-0000-4000-8000-000000000014','LIKE');
select ok(not public.rpc_is_relationship_mutually_verified('e0120000-0000-4000-8000-000000000014'),
 'one swipe cannot manufacture reciprocal acceptance');
select throws_ok($$update public.swipes set target_id='e0120000-0000-4000-8000-000000000015'
 where swiper_id='e0120000-0000-4000-8000-000000000013'$$,
 '42501','relationship_source_immutable','swipe identity cannot be retargeted');
select set_config('request.jwt.claim.sub','e0110000-0000-4000-8000-000000000014',true);
insert into public.swipes(swiper_id,target_id,action) values('e0120000-0000-4000-8000-000000000014','e0120000-0000-4000-8000-000000000013','LIKE');
select ok(public.rpc_is_relationship_mutually_verified('e0120000-0000-4000-8000-000000000013'),
 'two actual owner-authorized swipes preserve legitimate matching');
select throws_ok($$insert into public.swipes(swiper_id,target_id,action) values
 ('e0120000-0000-4000-8000-000000000019','e0120000-0000-4000-8000-000000000020','LIKE')$$,
 '42501',null,'user cannot spoof another swiper to fabricate reciprocal evidence');

-- Exercise the actual sender RPC, not a privileged fixture stand-in.
select set_config('request.jwt.claim.sub','e0110000-0000-4000-8000-000000000015',true);
select lives_ok($$select public.rpc_send_signal('e0120000-0000-4000-8000-000000000016','feels_intentional')$$,
 'existing authenticated signal creation workflow remains valid');
select id as signal_id from public.profile_signal_gestures where sender_profile_id='e0120000-0000-4000-8000-000000000015' \gset
select set_config('request.jwt.claim.sub','e0110000-0000-4000-8000-000000000015',true);
select throws_ok(format('select public.rpc_accept_profile_signal(%L)',:'signal_id'),
 '42501','signal_accept_forbidden','signal sender cannot impersonate recipient acceptance');
select set_config('request.jwt.claim.sub','e0110000-0000-4000-8000-000000000016',true);
select throws_ok(format('update public.profile_signal_gestures set sender_profile_id=''e0120000-0000-4000-8000-000000000019'',
 sender_user_id=''e0110000-0000-4000-8000-000000000019'' where id=%L',:'signal_id'),
 '42501','relationship_source_immutable','signal receiver cannot rewrite the sender identity');
select lives_ok(format('select public.rpc_accept_profile_signal(%L)',:'signal_id'),
 'real signal recipient acceptance succeeds');
select ok(public.rpc_is_relationship_mutually_verified('e0120000-0000-4000-8000-000000000015'),
 'signal sender and recipient establish verified mutual acceptance');
select lives_ok(format('select public.rpc_accept_profile_signal(%L)',:'signal_id'),
 'duplicate signal acceptance is idempotent');
select set_config('request.jwt.claim.sub','e0110000-0000-4000-8000-000000000018',true);
select throws_ok($$select public.rpc_accept_profile_signal('e0150000-0000-4000-8000-000000000002')$$,
 '42501','relationship_reconfirmation_required','historical mutable signal identity is not silently certified');
select lives_ok($$update public.profile_signal_gestures set status='dismissed'
 where id='e0150000-0000-4000-8000-000000000002'$$,'recipient may still dismiss a historical signal');
select throws_ok($$update public.profile_signal_gestures set status='sent'
 where id='e0150000-0000-4000-8000-000000000002'$$,'42501','relationship_source_terminal',
 'dismissed signal cannot be revived by direct API state mutation');

-- Actual server Private Spark exit workflow, with no provider invocation.
set local role postgres;
select set_config('request.jwt.claim.sub','',true);
insert into public.live_sessions(id,title,status,created_by_user_id,created_by_profile_id,provider_call_id)
 values('e0160000-0000-4000-8000-000000000001','Relationship regression Live','ended',
 'e0110000-0000-4000-8000-000000000019','e0120000-0000-4000-8000-000000000019','relationship-regression-live');
insert into public.live_match_rounds(id,session_id,client_proposal_id,created_by_user_id,participant_a_user_id,
 participant_a_profile_id,participant_b_user_id,participant_b_profile_id,state)
 values('e0170000-0000-4000-8000-000000000001','e0160000-0000-4000-8000-000000000001',gen_random_uuid(),
 'e0110000-0000-4000-8000-000000000019','e0110000-0000-4000-8000-000000000019','e0120000-0000-4000-8000-000000000019',
 'e0110000-0000-4000-8000-000000000020','e0120000-0000-4000-8000-000000000020','completed');
insert into public.live_private_sparks(id,match_round_id,session_id,participant_a_user_id,participant_a_profile_id,
 participant_b_user_id,participant_b_profile_id,state,provider_call_id,activated_at,ended_at)
 values('e0180000-0000-4000-8000-000000000001','e0170000-0000-4000-8000-000000000001','e0160000-0000-4000-8000-000000000001',
 'e0110000-0000-4000-8000-000000000019','e0120000-0000-4000-8000-000000000019',
 'e0110000-0000-4000-8000-000000000020','e0120000-0000-4000-8000-000000000020','ended','relationship-regression-spark',now()-interval '5 minutes',now());
set local role authenticated;
select set_config('request.jwt.claim.sub','e0110000-0000-4000-8000-000000000019',true);
select lives_ok($$select public.rpc_submit_live_private_spark_exit('e0180000-0000-4000-8000-000000000001','continue')$$,
 'first actual Private Spark continue action remains valid');
select ok(not public.rpc_is_relationship_mutually_verified('e0120000-0000-4000-8000-000000000020'),
 'one Private Spark exit choice cannot accept for the peer');
select set_config('request.jwt.claim.sub','e0110000-0000-4000-8000-000000000020',true);
select lives_ok($$select public.rpc_submit_live_private_spark_exit('e0180000-0000-4000-8000-000000000001','continue')$$,
 'second actual Private Spark continue action preserves matching');
select ok(public.rpc_is_relationship_mutually_verified('e0120000-0000-4000-8000-000000000019'),
 'two immutable actual Live exit choices establish verified acceptance');
select lives_ok($$select public.rpc_submit_live_private_spark_exit('e0180000-0000-4000-8000-000000000001','continue')$$,
 'Private Spark duplicate exit remains idempotent');
select throws_ok($$select public.rpc_submit_live_private_spark_exit('e0180000-0000-4000-8000-000000000001','friendship')$$,
 '23505','live_private_spark_exit_already_recorded','Private Spark user cannot rewrite a recorded exit choice');

-- Actual approved admin merge must preserve legacy chat without certifying it.
set local role postgres;
insert into public.internal_admins(user_id,role) values('e0110000-0000-4000-8000-000000000024','super_admin');
insert into public.account_merge_cases(id,source_user_id,source_profile_id,target_user_id,target_profile_id,status,request_channel)
 values('e0190000-0000-4000-8000-000000000001','e0110000-0000-4000-8000-000000000021','e0120000-0000-4000-8000-000000000021',
 'e0110000-0000-4000-8000-000000000023','e0120000-0000-4000-8000-000000000023','approved','ops');
select set_config('request.jwt.claim.sub','e0110000-0000-4000-8000-000000000024',true);
insert into public.matches(user1_id,user2_id,status) values
 ('e0120000-0000-4000-8000-000000000022','e0120000-0000-4000-8000-000000000023','REJECTED');
set local role authenticated;
select throws_ok($$select public.rpc_admin_execute_account_merge_case('e0190000-0000-4000-8000-000000000001')$$,
 '42501','relationship_merge_rejection_conflict','admin merge cannot overwrite a target relationship rejection');
set local role postgres;
-- Remove only this synthetic conflict to exercise the legitimate copy case.
delete from public.matches where user1_id='e0120000-0000-4000-8000-000000000022' and user2_id='e0120000-0000-4000-8000-000000000023';
set local role authenticated;
select public.rpc_admin_execute_account_merge_case('e0190000-0000-4000-8000-000000000001') as merge_result \gset
select is((:'merge_result'::jsonb->>'success'),
 'true','approved internal-admin account merge succeeds');
select diag(jsonb_build_object('failed_step',:'merge_result'::jsonb->>'failed_step',
  'error_message',:'merge_result'::jsonb->>'error_message','sqlstate',:'merge_result'::jsonb->>'sqlstate')::text)
 where (:'merge_result'::jsonb->>'success')='false';
select set_config('request.jwt.claim.sub','e0110000-0000-4000-8000-000000000023',true);
select ok(public.can_users_chat('e0110000-0000-4000-8000-000000000023','e0110000-0000-4000-8000-000000000022'),
 'account merge preserves the historical accepted chat');
select ok(not public.rpc_is_relationship_mutually_verified('e0120000-0000-4000-8000-000000000022'),
 'administrative copy does not manufacture fresh participant consent');

select set_config('request.jwt.claim.sub','e0110000-0000-4000-8000-000000000025',true);
insert into public.blocks(blocker_id,blocked_id) values('e0110000-0000-4000-8000-000000000025','e0110000-0000-4000-8000-000000000026');
delete from public.blocks where blocker_id='e0110000-0000-4000-8000-000000000025';
select set_config('request.jwt.claim.sub','e0110000-0000-4000-8000-000000000026',true);
select throws_ok($$select public.rpc_decide_intent_request('e0140000-0000-4000-8000-000000000005','accept')$$,
 '42501','intent_request_revoked','forged historical future timestamp cannot bypass block/revocation watermark');
select throws_ok($$select public.rpc_cancel_intent_request('e0140000-0000-4000-8000-000000000005')$$,
 '42501','intent_cancel_forbidden','recipient cannot impersonate sender cancellation');
select set_config('request.jwt.claim.sub','e0110000-0000-4000-8000-000000000025',true);
select lives_ok($$select public.rpc_cancel_intent_request('e0140000-0000-4000-8000-000000000005')$$,
 'sender can cancel a pending request after unblock');
select lives_ok($$select public.rpc_cancel_intent_request('e0140000-0000-4000-8000-000000000005')$$,
 'duplicate sender cancellation is idempotent');
select public.rpc_create_intent_request('e0120000-0000-4000-8000-000000000026','connect') as new_request_id \gset
select set_config('request.jwt.claim.sub','e0110000-0000-4000-8000-000000000026',true);
select lives_ok(format('select public.rpc_decide_intent_request(%L,''accept'')',:'new_request_id'),
 'new independent sender and recipient actions can qualify after revocation');
select ok(public.rpc_is_relationship_mutually_verified('e0120000-0000-4000-8000-000000000025'),
 'fresh request receipt, rather than historical timestamps, restores verified eligibility');

set local role postgres;
update auth.users set banned_until=now()+interval '1 day' where id='e0110000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','e0110000-0000-4000-8000-000000000002',true);
select ok(not public.rpc_is_relationship_mutually_verified('e0120000-0000-4000-8000-000000000001'),
 'current account ban overrides otherwise valid proof');
select throws_ok($$select public.rpc_get_accepted_relationship('e0120000-0000-4000-8000-000000000001')$$,
 '42501','relationship_unavailable','existing JWT does not bypass current account restriction');
set local role postgres;
update auth.users set banned_until=null where id='e0110000-0000-4000-8000-000000000001';
set local role anon;
select throws_ok($$select public.rpc_reconfirm_relationship('e0120000-0000-4000-8000-000000000001')$$,
 '42501',null,'anonymous role cannot execute acceptance/reconfirmation');

set local role postgres;
select is((select count(*) from private.relationship_legacy_merge_permits),0::bigint,'no legacy merge-copy permits leaked');
select is((select count(*) from public.matches where id='e0130000-0000-4000-8000-000000000001'),1::bigint,
 'historical relationship was not deleted or replaced');
select is((select count(*) from private.push_notification_events),0::bigint,'regressions produce no push events');
select ok(not has_table_privilege('authenticated','public.matches','INSERT'),'authenticated match INSERT grant removed');
select ok(not has_table_privilege('authenticated','public.matches','UPDATE'),'authenticated match UPDATE grant removed');
select ok(not has_function_privilege('anon','public.rpc_decide_intent_request(uuid,text)','EXECUTE'),'anonymous privileged acceptance execution removed');
select ok(not has_function_privilege('authenticated','private.relationship_finish_acceptance(uuid,uuid,text,text)','EXECUTE'),
 'private acceptance helper execution removed');
select ok(not has_schema_privilege('authenticated','public','CREATE'),
 'privileged legacy implementations resolve public objects in a schema unavailable for client CREATE');
select is((select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='private' and c.relname in ('relationship_consent_decisions','relationship_acceptance_proofs',
 'relationship_consent_revocations','relationship_legacy_merge_permits') and c.relrowsecurity),4::bigint,
 'all relationship evidence/permit tables have RLS enabled');
select is((select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private'
 and p.proname like 'relationship_%' and p.prosecdef and p.proconfig is null),0::bigint,
 'all new privileged helpers have explicit schema resolution');
select * from finish();
rollback;
