-- LOCAL REGRESSION ONLY. The outer transaction guarantees fixture rollback.

begin;

do $regression$
declare
  v_now timestamptz := clock_timestamp();
  v_result integer;
  v_dispatch_result boolean;
  v_claim jsonb;
  v_duplicate_claim jsonb;
  v_first_reservation_count integer;
  v_duplicate_reservation_count integer;
  v_completed boolean;
  v_completed_again boolean;
  v_status text;
  v_outcome text;
  v_completed_at timestamptz;
  v_webhook_request_id bigint;
begin
  insert into auth.users(
    id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) values (
    '11000000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'push-expiry-regression@invalid.test',
    '{}'::jsonb,
    '{}'::jsonb,
    v_now,
    v_now
  );

  insert into public.push_tokens(id, user_id, token, platform, app_version)
  values (
    '31000000-0000-4000-8000-000000000001',
    '11000000-0000-4000-8000-000000000001',
    'ExponentPushToken[push-expiry-regression]',
    'android',
    '1.2.0'
  );

  insert into private.push_notification_events(
    id, delivery_kind, recipient_user_id, event_type, title, body, data,
    idempotency_key, status, created_at, expires_at
  ) values (
    '21000000-0000-4000-8000-000000000001',
    'unicast',
    '11000000-0000-4000-8000-000000000001',
    'expiry_regression',
    'Expired before dispatch',
    'This local fixture must become terminal without delivery.',
    '{"type":"expiry_regression"}'::jsonb,
    'push-expiry-regression-before-dispatch',
    'pending',
    v_now - interval '10 minutes',
    v_now - interval '5 minutes'
  );

  v_result := private.expire_pending_push_notification_events_v1(
    1,
    '21000000-0000-4000-8000-000000000001'
  );
  select status, outcome, completed_at, webhook_request_id
  into v_status, v_outcome, v_completed_at, v_webhook_request_id
  from private.push_notification_events
  where id = '21000000-0000-4000-8000-000000000001';

  if v_result <> 1
    or v_status <> 'expired'
    or v_outcome <> 'expired_before_claim'
    or v_completed_at is null
    or v_webhook_request_id is not null then
    raise exception 'pending_expiry_transition_failed';
  end if;

  v_result := private.expire_pending_push_notification_events_v1(
    1,
    '21000000-0000-4000-8000-000000000001'
  );
  if v_result <> 0 then
    raise exception 'expiry_transition_not_idempotent';
  end if;

  v_dispatch_result := private.dispatch_push_notification_event_v1(
    '21000000-0000-4000-8000-000000000001'
  );
  select status, webhook_request_id into v_status, v_webhook_request_id
  from private.push_notification_events
  where id = '21000000-0000-4000-8000-000000000001';
  if v_dispatch_result or v_status <> 'expired' or v_webhook_request_id is not null then
    raise exception 'expired_event_was_dispatchable';
  end if;

  -- Expiry cleanup must not depend on signing or webhook availability.
  update private.push_config
  set active_signing_key_id = null,
      active_signing_secret_name = null
  where id = 1;
  if not found then
    raise exception 'push_config_fixture_missing';
  end if;

  insert into private.push_notification_events(
    id, delivery_kind, recipient_user_id, event_type, title, body, data,
    idempotency_key, status, created_at, expires_at
  ) values (
    '21000000-0000-4000-8000-000000000002',
    'unicast',
    '11000000-0000-4000-8000-000000000001',
    'expiry_regression',
    'Expired while signing disabled',
    'The minute dispatcher must terminalize this event first.',
    '{"type":"expiry_regression"}'::jsonb,
    'push-expiry-regression-signing-disabled',
    'pending',
    v_now - interval '10 minutes',
    v_now - interval '4 minutes'
  );

  perform private.dispatch_pending_push_notification_events_v1(10);
  select status, outcome into v_status, v_outcome
  from private.push_notification_events
  where id = '21000000-0000-4000-8000-000000000002';
  if v_status <> 'expired' or v_outcome <> 'expired_before_claim' then
    raise exception 'signing_independent_expiry_sweep_failed';
  end if;

  -- Terminal outcomes are immutable to expiry cleanup.
  insert into private.push_notification_events(
    id, delivery_kind, recipient_user_id, event_type, title, body, data,
    idempotency_key, status, created_at, expires_at, completed_at, outcome
  ) values (
    '21000000-0000-4000-8000-000000000003',
    'unicast',
    '11000000-0000-4000-8000-000000000001',
    'expiry_regression',
    'Already delivered',
    'This event must remain delivered.',
    '{"type":"expiry_regression"}'::jsonb,
    'push-expiry-regression-delivered',
    'delivered',
    v_now - interval '10 minutes',
    v_now - interval '5 minutes',
    v_now - interval '4 minutes',
    'delivered'
  ), (
    '21000000-0000-4000-8000-000000000004',
    'unicast',
    '11000000-0000-4000-8000-000000000001',
    'expiry_regression',
    'Already suppressed',
    'This event must remain suppressed.',
    '{"type":"expiry_regression"}'::jsonb,
    'push-expiry-regression-suppressed',
    'suppressed',
    v_now - interval '10 minutes',
    v_now - interval '5 minutes',
    v_now - interval '4 minutes',
    'canonical_authorization_denied'
  );

  v_result := private.expire_pending_push_notification_events_v1(100, null);
  if exists (
    select 1
    from private.push_notification_events
    where (id = '21000000-0000-4000-8000-000000000003' and status <> 'delivered')
       or (id = '21000000-0000-4000-8000-000000000004' and status <> 'suppressed')
  ) then
    raise exception 'terminal_event_changed_by_expiry_sweep';
  end if;

  -- A valid claim and reservation win atomically and remain non-expirable.
  insert into private.push_notification_events(
    id, delivery_kind, recipient_user_id, event_type, title, body, data,
    idempotency_key, status, created_at, expires_at
  ) values (
    '21000000-0000-4000-8000-000000000005',
    'unicast',
    '11000000-0000-4000-8000-000000000001',
    'expiry_regression',
    'Claim wins',
    'A validly claimed event must not be expired by the sweeper.',
    '{"type":"expiry_regression"}'::jsonb,
    'push-expiry-regression-claimed',
    'pending',
    v_now - interval '10 minutes',
    v_now + interval '5 minutes'
  );

  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  v_claim := public.rpc_service_claim_push_notification_event_v1(
    '21000000-0000-4000-8000-000000000005'
  );
  select count(*)::integer into v_first_reservation_count
  from public.rpc_service_reserve_push_notification_deliveries_v1(
    '21000000-0000-4000-8000-000000000005',
    array['31000000-0000-4000-8000-000000000001'::uuid]
  );
  select count(*)::integer into v_duplicate_reservation_count
  from public.rpc_service_reserve_push_notification_deliveries_v1(
    '21000000-0000-4000-8000-000000000005',
    array['31000000-0000-4000-8000-000000000001'::uuid]
  );

  update private.push_notification_events
  set expires_at = v_now - interval '1 minute'
  where id = '21000000-0000-4000-8000-000000000005';
  v_result := private.expire_pending_push_notification_events_v1(
    1,
    '21000000-0000-4000-8000-000000000005'
  );
  select status into v_status
  from private.push_notification_events
  where id = '21000000-0000-4000-8000-000000000005';

  if v_claim->>'claimStatus' <> 'claimed'
    or v_first_reservation_count <> 1
    or v_duplicate_reservation_count <> 0
    or v_result <> 0
    or v_status <> 'processing' then
    raise exception 'claim_reservation_expiry_race_invariant_failed';
  end if;

  v_completed := public.rpc_service_complete_push_notification_event_v1(
    '21000000-0000-4000-8000-000000000005', true, 1, 1, 'regression_passed'
  );
  v_completed_again := public.rpc_service_complete_push_notification_event_v1(
    '21000000-0000-4000-8000-000000000005', true, 1, 1, 'must_not_update'
  );
  v_duplicate_claim := public.rpc_service_claim_push_notification_event_v1(
    '21000000-0000-4000-8000-000000000005'
  );

  if not v_completed
    or v_completed_again
    or v_duplicate_claim->>'claimStatus' <> 'duplicate' then
    raise exception 'replay_completion_invariant_failed';
  end if;

  -- Terminal expired events become prune-eligible only after retention age.
  insert into private.push_notification_events(
    id, delivery_kind, recipient_user_id, event_type, title, body, data,
    idempotency_key, status, created_at, expires_at, completed_at, outcome
  ) values (
    '21000000-0000-4000-8000-000000000006',
    'unicast',
    '11000000-0000-4000-8000-000000000001',
    'expiry_regression',
    'Retention fixture',
    'This terminal expired fixture is older than retention.',
    '{"type":"expiry_regression"}'::jsonb,
    'push-expiry-regression-prune',
    'expired',
    v_now - interval '40 days',
    v_now - interval '39 days',
    v_now - interval '31 days',
    'expired_before_claim'
  );

  perform private.prune_push_notification_events_v1();
  if exists (
    select 1 from private.push_notification_events
    where id = '21000000-0000-4000-8000-000000000006'
  ) then
    raise exception 'terminal_expired_event_not_pruned_after_retention';
  end if;

  if private.expire_pending_push_notification_events_v1(100, null) <> 0 then
    raise exception 'final_expiry_sweep_not_idempotent';
  end if;

  raise notice 'push_notification_expiry_lifecycle_regression_passed';
end
$regression$;

rollback;
