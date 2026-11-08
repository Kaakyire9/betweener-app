-- Disposable schema-only clone ONLY. Seed historical data before the repair.
select set_config('request.jwt.claim.role','service_role',false);
select set_config('app.profile_guard_write','on',false);
insert into auth.users(id)
select ('e0110000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid from generate_series(1,26) n;
insert into public.notification_prefs(user_id,push_enabled,matches)
select id,false,false from auth.users;
insert into public.profiles(id,user_id,full_name,age,gender,profile_completed,verification_level,
  min_age_interest,max_age_interest,age_preference_confirmed_at,phone_verified,phone_number,identity_status,region)
select ('e0120000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  ('e0110000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  'Relationship test '||n,30,(case when n%2=1 then 'MALE' else 'FEMALE' end)::public.gender,
  true,1,18,99,now(),true,'+447500'||lpad(n::text,6,'0'),'active','London'
from generate_series(1,26) n;
select set_config('app.profile_guard_write','off',false);
insert into public.matches(id,user1_id,user2_id,status) values
 ('e0130000-0000-4000-8000-000000000001','e0120000-0000-4000-8000-000000000003','e0120000-0000-4000-8000-000000000004','ACCEPTED'),
 ('e0130000-0000-4000-8000-000000000002','e0120000-0000-4000-8000-000000000005','e0120000-0000-4000-8000-000000000006','PENDING'),
 ('e0130000-0000-4000-8000-000000000003','e0120000-0000-4000-8000-000000000009','e0120000-0000-4000-8000-000000000010','REJECTED'),
 ('e0130000-0000-4000-8000-000000000004','e0120000-0000-4000-8000-000000000021','e0120000-0000-4000-8000-000000000022','ACCEPTED');
insert into public.intent_requests(id,actor_id,recipient_id,type,status,expires_at) values
 ('e0140000-0000-4000-8000-000000000002','e0120000-0000-4000-8000-000000000005','e0120000-0000-4000-8000-000000000006','connect','pending',now()-interval '1 hour'),
 ('e0140000-0000-4000-8000-000000000003','e0120000-0000-4000-8000-000000000007','e0120000-0000-4000-8000-000000000008','connect','cancelled',now()+interval '1 day'),
 ('e0140000-0000-4000-8000-000000000004','e0120000-0000-4000-8000-000000000009','e0120000-0000-4000-8000-000000000010','connect','pending',now()+interval '1 day');
-- The old direct INSERT path allowed forged client timestamps. They cannot
-- defeat a later revocation watermark.
insert into public.intent_requests(id,actor_id,recipient_id,type,status,created_at,expires_at)
 values('e0140000-0000-4000-8000-000000000005','e0120000-0000-4000-8000-000000000025',
 'e0120000-0000-4000-8000-000000000026','connect','pending',now()+interval '10 years',now()+interval '1 day');
-- A historical signal whose immutable origin was not attestable in the old schema.
insert into public.profile_signal_gestures(id,sender_profile_id,receiver_profile_id,sender_user_id,receiver_user_id,reason_key,reason_label)
 values('e0150000-0000-4000-8000-000000000002','e0120000-0000-4000-8000-000000000017','e0120000-0000-4000-8000-000000000018',
 'e0110000-0000-4000-8000-000000000017','e0110000-0000-4000-8000-000000000018','kindness','Kindness');
select set_config('request.jwt.claim.role','',false);
