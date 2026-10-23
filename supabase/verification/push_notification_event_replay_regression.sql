do $$
declare
  v_first jsonb;
  v_duplicate jsonb;
  v_expired jsonb;
  v_completed boolean;
  v_completed_again boolean;
  v_first_reservation_count integer;
  v_duplicate_reservation_count integer;
  v_unauthorized_rejected boolean := false;
begin
  insert into auth.users(id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (
    '10000000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'push-regression@invalid.test',
    '{}'::jsonb,
    '{}'::jsonb,
    timezone('utc', now()),
    timezone('utc', now())
  );

  insert into public.push_tokens(id, user_id, token, platform, app_version)
  values (
    '30000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    'ExponentPushToken[push-security-regression]',
    'android',
    '1.2.0'
  );

  insert into private.push_notification_events(
    id, delivery_kind, recipient_user_id, event_type, title, body, data,
    idempotency_key, expires_at, created_at
  )
  values (
    '20000000-0000-4000-8000-000000000001',
    'unicast',
    '10000000-0000-4000-8000-000000000001',
    'security_regression',
    'Regression test',
    'This fixture is deleted before commit.',
    '{"type":"security_regression"}'::jsonb,
    'push-security-regression-claim',
    timezone('utc', now()) + interval '5 minutes',
    timezone('utc', now())
  ), (
    '20000000-0000-4000-8000-000000000002',
    'unicast',
    '10000000-0000-4000-8000-000000000001',
    'security_regression',
    'Expired regression test',
    'This fixture is deleted before commit.',
    '{"type":"security_regression"}'::jsonb,
    'push-security-regression-expired',
    timezone('utc', now()) - interval '1 second',
    timezone('utc', now()) - interval '10 minutes'
  );

  perform set_config('request.jwt.claims', '{"role":"authenticated"}', true);
  begin
    perform public.rpc_service_claim_push_notification_event_v1(
      '20000000-0000-4000-8000-000000000001'
    );
  exception
    when insufficient_privilege then
      v_unauthorized_rejected := true;
  end;

  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  v_first := public.rpc_service_claim_push_notification_event_v1(
    '20000000-0000-4000-8000-000000000001'
  );
  v_duplicate := public.rpc_service_claim_push_notification_event_v1(
    '20000000-0000-4000-8000-000000000001'
  );
  select count(*)::integer into v_first_reservation_count
  from public.rpc_service_reserve_push_notification_deliveries_v1(
    '20000000-0000-4000-8000-000000000001',
    array['30000000-0000-4000-8000-000000000001'::uuid]
  );
  select count(*)::integer into v_duplicate_reservation_count
  from public.rpc_service_reserve_push_notification_deliveries_v1(
    '20000000-0000-4000-8000-000000000001',
    array['30000000-0000-4000-8000-000000000001'::uuid]
  );
  v_expired := public.rpc_service_claim_push_notification_event_v1(
    '20000000-0000-4000-8000-000000000002'
  );
  v_completed := public.rpc_service_complete_push_notification_event_v1(
    '20000000-0000-4000-8000-000000000001', true, 1, 1, 'regression_passed'
  );
  v_completed_again := public.rpc_service_complete_push_notification_event_v1(
    '20000000-0000-4000-8000-000000000001', true, 1, 1, 'must_not_update'
  );

  if not v_unauthorized_rejected
    or v_first->>'claimStatus' <> 'claimed'
    or v_duplicate->>'claimStatus' <> 'duplicate'
    or v_expired->>'claimStatus' <> 'expired'
    or v_first_reservation_count <> 1
    or v_duplicate_reservation_count <> 0
    or not v_completed
    or v_completed_again then
    raise exception 'push_security_regression_failed';
  end if;

  delete from private.push_notification_events
  where id in (
    '20000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000002'
  );
  delete from public.push_tokens where id = '30000000-0000-4000-8000-000000000001';
  delete from auth.users where id = '10000000-0000-4000-8000-000000000001';

  raise notice 'push_security_regression_passed: unauthorized, expired, replay, duplicate token and duplicate completion all fail closed';
end;
$$;
