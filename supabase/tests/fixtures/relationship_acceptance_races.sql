-- Synthetic rows committed only inside the disposable integration database.
select set_config('request.jwt.claim.role','service_role',false);
select set_config('app.profile_guard_write','on',false);
insert into auth.users(id)
select ('d0110000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid from generate_series(1,12) n;
insert into public.notification_prefs(user_id,push_enabled,matches)
select id,false,false from auth.users where id::text like 'd0110000-%';
insert into public.profiles(id,user_id,full_name,age,gender,profile_completed,verification_level,
 min_age_interest,max_age_interest,age_preference_confirmed_at,phone_verified,phone_number,identity_status,region)
select ('d0120000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 ('d0110000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 'Race test '||n,30,(case when n%2=1 then 'MALE' else 'FEMALE' end)::public.gender,
 true,1,18,99,now(),true,'+447600'||lpad(n::text,6,'0'),'active','London' from generate_series(1,12) n;
select set_config('app.profile_guard_write','off',false);
-- Insert a legacy relationship using two current independent actions, then
-- remove proof/receipts as fixture preparation to model uncertain history.
select set_config('request.jwt.claim.sub','d0110000-0000-4000-8000-000000000003',false);
insert into public.swipes(swiper_id,target_id,action) values('d0120000-0000-4000-8000-000000000003','d0120000-0000-4000-8000-000000000004','LIKE');
select set_config('request.jwt.claim.sub','d0110000-0000-4000-8000-000000000004',false);
insert into public.swipes(swiper_id,target_id,action) values('d0120000-0000-4000-8000-000000000004','d0120000-0000-4000-8000-000000000003','LIKE');
delete from private.relationship_acceptance_proofs where profile_a_id='d0120000-0000-4000-8000-000000000003';
delete from private.relationship_consent_decisions where actor_profile_id in ('d0120000-0000-4000-8000-000000000003','d0120000-0000-4000-8000-000000000004');
select set_config('request.jwt.claim.sub','d0110000-0000-4000-8000-000000000002',false);
insert into public.intent_requests(id,actor_id,recipient_id,type,status,expires_at) values
 ('d0140000-0000-4000-8000-000000000001','d0120000-0000-4000-8000-000000000002','d0120000-0000-4000-8000-000000000001','connect','pending',now()+interval '1 day');
select set_config('request.jwt.claim.sub','d0110000-0000-4000-8000-000000000007',false);
insert into public.intent_requests(id,actor_id,recipient_id,type,status,expires_at) values
 ('d0140000-0000-4000-8000-000000000002','d0120000-0000-4000-8000-000000000007','d0120000-0000-4000-8000-000000000008','connect','pending',now()+interval '1 day');
select set_config('request.jwt.claim.sub','d0110000-0000-4000-8000-000000000009',false);
insert into public.intent_requests(id,actor_id,recipient_id,type,status,expires_at) values
 ('d0140000-0000-4000-8000-000000000003','d0120000-0000-4000-8000-000000000009','d0120000-0000-4000-8000-000000000010','connect','pending',now()+interval '1 day');
select set_config('request.jwt.claim.sub','d0110000-0000-4000-8000-000000000011',false);
insert into public.intent_requests(id,actor_id,recipient_id,type,status,expires_at) values
 ('d0140000-0000-4000-8000-000000000004','d0120000-0000-4000-8000-000000000011','d0120000-0000-4000-8000-000000000012','connect','pending',now()+interval '1 day');
select set_config('request.jwt.claim.sub','',false);
