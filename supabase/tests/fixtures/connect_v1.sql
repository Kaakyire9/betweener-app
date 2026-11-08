-- Synthetic data only, never applied to the shared app database.
select set_config('request.jwt.claim.role','service_role',false);
select set_config('app.profile_guard_write','on',false);
insert into auth.users(id) select ('f0110000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid from generate_series(1,16)n;
insert into public.notification_prefs(user_id,push_enabled,matches) select id,false,false from auth.users where id::text like 'f0110000-%';
insert into public.profiles(id,user_id,full_name,age,gender,profile_completed,verification_level,
 min_age_interest,max_age_interest,age_preference_confirmed_at,phone_verified,phone_number,identity_status,region)
select ('f0120000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,('f0110000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 'Connect fixture '||n,30,(case when n%2=1 then 'MALE' else 'FEMALE' end)::public.gender,true,1,18,99,now(),true,'+447601'||lpad(n::text,6,'0'),'active','London'
from generate_series(1,16)n;
select set_config('app.profile_guard_write','off',false);
insert into private.connect_preferences(user_id,voice,video) select id,true,true from auth.users where id::text like 'f0110000-%';
-- Current, independently captured mutual decisions for pair 1/2 and 5/6.
select set_config('request.jwt.claim.sub','f0110000-0000-4000-8000-000000000001',false);
insert into public.swipes(swiper_id,target_id,action) values('f0120000-0000-4000-8000-000000000001','f0120000-0000-4000-8000-000000000002','LIKE');
select set_config('request.jwt.claim.sub','f0110000-0000-4000-8000-000000000002',false);
insert into public.swipes(swiper_id,target_id,action) values('f0120000-0000-4000-8000-000000000002','f0120000-0000-4000-8000-000000000001','LIKE');
select set_config('request.jwt.claim.sub','f0110000-0000-4000-8000-000000000005',false);
insert into public.swipes(swiper_id,target_id,action) values('f0120000-0000-4000-8000-000000000005','f0120000-0000-4000-8000-000000000006','LIKE');
select set_config('request.jwt.claim.sub','f0110000-0000-4000-8000-000000000006',false);
insert into public.swipes(swiper_id,target_id,action) values('f0120000-0000-4000-8000-000000000006','f0120000-0000-4000-8000-000000000005','LIKE');
insert into public.swipes(swiper_id,target_id,action) values('f0120000-0000-4000-8000-000000000006','f0120000-0000-4000-8000-000000000009','LIKE');
select set_config('request.jwt.claim.sub','f0110000-0000-4000-8000-000000000009',false);
insert into public.swipes(swiper_id,target_id,action) values('f0120000-0000-4000-8000-000000000009','f0120000-0000-4000-8000-000000000006','LIKE');
-- Uncertain historical pair retains its accepted label without a proof.
select set_config('request.jwt.claim.sub','f0110000-0000-4000-8000-000000000003',false);
insert into public.swipes(swiper_id,target_id,action) values('f0120000-0000-4000-8000-000000000003','f0120000-0000-4000-8000-000000000004','LIKE');
select set_config('request.jwt.claim.sub','f0110000-0000-4000-8000-000000000004',false);
insert into public.swipes(swiper_id,target_id,action) values('f0120000-0000-4000-8000-000000000004','f0120000-0000-4000-8000-000000000003','LIKE');
delete from private.relationship_acceptance_proofs where profile_a_id='f0120000-0000-4000-8000-000000000003';
delete from private.relationship_consent_decisions where actor_profile_id in ('f0120000-0000-4000-8000-000000000003','f0120000-0000-4000-8000-000000000004');
select set_config('request.jwt.claim.sub','f0110000-0000-4000-8000-000000000007',false);
insert into public.intent_requests(id,actor_id,recipient_id,type,status,expires_at)
values('f0140000-0000-4000-8000-000000000001','f0120000-0000-4000-8000-000000000007','f0120000-0000-4000-8000-000000000008','connect','pending',now()+interval '1 day');
select set_config('request.jwt.claim.sub','',false);
