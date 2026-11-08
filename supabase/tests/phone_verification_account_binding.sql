-- Run inside a transaction and roll back. All actors and numbers are synthetic.
do $test$
declare
  first_user uuid := gen_random_uuid();
  second_user uuid := gen_random_uuid();
  attempt uuid := gen_random_uuid();
  other_attempt uuid := gen_random_uuid();
  phone constant text := '+12025550161';
  new_phone constant text := '+12025550162';
  missing_phone constant text := '+12025550163';
  first_sid constant text := 'VE00000000000000000000000000000161';
  second_sid constant text := 'VE00000000000000000000000000000162';
  third_sid constant text := 'VE00000000000000000000000000000163';
  missing_sid constant text := 'VE00000000000000000000000000000164';
  reserved jsonb;
  checked jsonb;
  result jsonb;
  visible_rows integer;
begin
  if has_table_privilege('anon', 'public.phone_verifications', 'SELECT')
     or has_column_privilege('anon', 'public.phone_verifications', 'phone_number', 'SELECT')
     or has_column_privilege('authenticated', 'public.phone_verifications', 'status', 'UPDATE')
     or has_table_privilege('authenticated', 'public.phone_verifications', 'INSERT')
     or has_column_privilege('authenticated', 'public.phone_verifications', 'verification_sid', 'SELECT')
     or has_function_privilege('authenticated', 'public.rpc_link_phone_verification(text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.rpc_finish_phone_check_v1(uuid,uuid,uuid,text,boolean)', 'EXECUTE')
     or has_function_privilege('anon', 'public.rpc_reserve_phone_challenge_v1(uuid,uuid,text)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.rpc_finish_phone_check_v1(uuid,uuid,uuid,text,boolean)', 'EXECUTE') then
    raise exception 'unexpected phone privileges';
  end if;
  if exists (select 1 from public.profiles where phone_number in (phone, new_phone, missing_phone)) then
    raise exception 'synthetic phone collision';
  end if;
  insert into auth.users (id, email, role, aud)
    values (first_user, first_user::text || '@example.invalid', 'authenticated', 'authenticated'),
           (second_user, second_user::text || '@example.invalid', 'authenticated', 'authenticated');
  insert into public.profiles(user_id) values (second_user);

  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  execute 'set local role service_role';
  reserved := public.rpc_reserve_phone_challenge_v1(first_user, attempt, phone);
  if reserved->>'state' is distinct from 'send' then raise exception 'initial reserve failed'; end if;
  if public.rpc_reserve_phone_challenge_v1(second_user, attempt, phone)->>'state' is distinct from 'busy'
     or public.rpc_begin_phone_check_v1(second_user, attempt, phone)->>'state' is distinct from 'missing'
     or public.rpc_begin_phone_check_v1(first_user, other_attempt, phone)->>'state' is distinct from 'missing' then
    raise exception 'challenge accepted for a different account or attempt';
  end if;
  if public.rpc_record_phone_dispatch_v1(second_user, (reserved->>'id')::uuid,
      (reserved->>'dispatch_id')::uuid, first_sid, 45) is not false then
    raise exception 'another account could bind a dispatch';
  end if;
  if public.rpc_record_phone_dispatch_v1(first_user, (reserved->>'id')::uuid,
      (reserved->>'dispatch_id')::uuid, first_sid, 45) is not true then
    raise exception 'dispatch could not be bound';
  end if;

  checked := public.rpc_begin_phone_check_v1(first_user, attempt, phone);
  if checked->>'verification_sid' is distinct from first_sid
     or public.rpc_begin_phone_check_v1(first_user, attempt, phone)->>'state' is distinct from 'busy' then
    raise exception 'verification lease was not exclusive';
  end if;
  result := public.rpc_finish_phone_check_v1(first_user, (checked->>'id')::uuid,
    (checked->>'check_id')::uuid, first_sid, false);
  if result->>'state' is distinct from 'pending'
     or exists (select 1 from public.profiles where user_id = first_user and phone_verified) then
    raise exception 'failed OTP marked the user verified';
  end if;
  checked := public.rpc_begin_phone_check_v1(first_user, attempt, phone);
  if public.rpc_finish_phone_check_v1(first_user, (checked->>'id')::uuid,
      (checked->>'check_id')::uuid, second_sid, true)->>'state' is distinct from 'missing' then
    raise exception 'wrong provider proof was accepted';
  end if;
  result := public.rpc_finish_phone_check_v1(first_user, (checked->>'id')::uuid,
    (checked->>'check_id')::uuid, first_sid, true);
  if result->>'state' is distinct from 'verified'
     or public.rpc_begin_phone_check_v1(first_user, attempt, phone) is distinct from result
     or not exists (select 1 from public.profiles where user_id = first_user and phone_verified and phone_number = phone)
     or (select count(*) from public.phone_verifications where user_id = first_user and phone_number = phone) <> 1 then
    raise exception 'approval or safe retry failed';
  end if;
  execute 'reset role';

  perform set_config('request.jwt.claims', jsonb_build_object('role','authenticated','sub',first_user)::text, true);
  execute 'set local role authenticated';
  select count(*) into visible_rows from public.phone_verifications
    where user_id = first_user and status = 'verified' and phone_number = phone;
  if visible_rows <> 1 or public.rpc_get_phone_verification_status()->>'verified' is distinct from 'true' then
    raise exception 'shipped-client verified status read failed';
  end if;
  begin
    update public.profiles set phone_number = new_phone where user_id = first_user;
    raise exception 'verified phone was directly changed';
  exception when insufficient_privilege then null;
  end;
  perform set_config('request.jwt.claims', jsonb_build_object('role','authenticated','sub',second_user)::text, true);
  select count(*) into visible_rows from public.phone_verifications where user_id = first_user;
  if visible_rows <> 0 then raise exception 'cross-account status read succeeded'; end if;
  begin
    update public.profiles set phone_verified = true, phone_number = new_phone where user_id = second_user;
    raise exception 'profile verified without server proof';
  exception when insufficient_privilege then null;
  end;
  execute 'reset role';

  update private.phone_verification_challenges set expires_at = clock_timestamp() - interval '1 second'
    where id = (reserved->>'id')::uuid;
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  execute 'set local role service_role';
  if public.rpc_begin_phone_check_v1(first_user, attempt, phone)->>'state' is distinct from 'missing' then
    raise exception 'expired proof was accepted';
  end if;
  reserved := public.rpc_reserve_phone_challenge_v1(second_user, other_attempt, phone);
  if public.rpc_record_phone_dispatch_v1(second_user, (reserved->>'id')::uuid,
      (reserved->>'dispatch_id')::uuid, first_sid, 45) is not false then
    raise exception 'provider SID was accepted for a second account';
  end if;
  if public.rpc_record_phone_dispatch_v1(second_user, (reserved->>'id')::uuid,
      (reserved->>'dispatch_id')::uuid, second_sid, 45) is not true then
    raise exception 'new provider proof could not be recorded';
  end if;
  checked := public.rpc_begin_phone_check_v1(second_user, other_attempt, phone);
  result := public.rpc_finish_phone_check_v1(second_user, (checked->>'id')::uuid,
    (checked->>'check_id')::uuid, second_sid, true);
  if result->>'state' is distinct from 'conflict'
     or public.rpc_begin_phone_check_v1(second_user, other_attempt, phone) is distinct from result
     or exists (select 1 from public.profiles where user_id = second_user and phone_verified)
     or (select count(*) from public.account_recovery_sessions where requester_user_id = second_user
          and owner_user_id = first_user and recovery_token = (result->>'recovery_token')::uuid) <> 1 then
    raise exception 'recovery conflict was not safely recorded once';
  end if;

  reserved := public.rpc_reserve_phone_challenge_v1(first_user, attempt, new_phone);
  if public.rpc_record_phone_dispatch_v1(first_user, (reserved->>'id')::uuid,
      (reserved->>'dispatch_id')::uuid, third_sid, 45) is not true then
    raise exception 'second phone challenge setup failed';
  end if;
  checked := public.rpc_begin_phone_check_v1(first_user, attempt, new_phone);
  result := public.rpc_finish_phone_check_v1(first_user, (checked->>'id')::uuid,
    (checked->>'check_id')::uuid, third_sid, true);
  if result->>'state' is distinct from 'account_unavailable'
     or not exists (select 1 from public.profiles where user_id = first_user and phone_number = phone) then
    raise exception 'signup flow replaced an established phone';
  end if;

  reserved := public.rpc_reserve_phone_challenge_v1(second_user, other_attempt, missing_phone);
  if public.rpc_record_phone_dispatch_v1(second_user, (reserved->>'id')::uuid,
      (reserved->>'dispatch_id')::uuid, missing_sid, 45) is not true then
    raise exception 'missing-provider fixture could not be bound';
  end if;
  checked := public.rpc_begin_phone_check_v1(second_user, other_attempt, missing_phone);
  if public.rpc_expire_phone_challenge_v1(first_user, (checked->>'id')::uuid,
      (checked->>'check_id')::uuid, missing_sid) is not false then
    raise exception 'another account could expire the challenge';
  end if;
  if public.rpc_expire_phone_challenge_v1(second_user, (checked->>'id')::uuid,
      (checked->>'check_id')::uuid, missing_sid) is not true
     or public.rpc_begin_phone_check_v1(second_user, other_attempt, missing_phone)->>'state' is distinct from 'missing' then
    raise exception 'missing provider challenge was not expired';
  end if;
  reserved := public.rpc_reserve_phone_challenge_v1(second_user, other_attempt, missing_phone);
  if reserved->>'state' is distinct from 'send' or reserved->>'id' = checked->>'id'
     or public.rpc_record_phone_dispatch_v1(second_user, (reserved->>'id')::uuid,
       (reserved->>'dispatch_id')::uuid, missing_sid, 45) is not false then
    raise exception 'fresh send was blocked or old provider SID became reusable';
  end if;
  execute 'reset role';
end
$test$;

select 'PHONE_VERIFICATION_ACCOUNT_BINDING_PASS' as result;
