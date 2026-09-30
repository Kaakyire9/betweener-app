begin;

set local role postgres;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

insert into auth.users(id, email)
values ('9b100000-0000-4000-8000-000000000001', 'phase-b1-canary@example.invalid')
on conflict (id) do nothing;

select plan(46);

select has_table('public', 'economy_feature_flags', 'economy_feature_flags exists');
select has_table('public', 'economy_action_rules', 'economy_action_rules exists');
select has_table('public', 'spark_spend_intents', 'spark_spend_intents exists');
select has_table('public', 'spark_ledger_events', 'spark_ledger_events exists');
select has_table('public', 'revenuecat_webhook_inbox', 'revenuecat_webhook_inbox exists');
select has_table('public', 'economy_passes', 'economy_passes exists');
select has_table('public', 'economy_reconciliation_runs', 'economy_reconciliation_runs exists');
select has_table('public', 'economic_risk_events', 'economic_risk_events exists');

select hasnt_column('public', 'profiles', 'spark_balance', 'profiles has no authoritative Spark balance');

select is(
  (select count(*)::integer from public.economy_action_rules where environment = 'production'),
  0,
  'production economy rules are not seeded'
);
select is(
  (select count(*)::integer from public.economy_action_rules where environment = 'staging'),
  15,
  'all staging action/tier rules are seeded'
);
select ok(
  not exists (
    select 1 from public.economy_feature_flags
    where environment = 'production' and enabled
  ),
  'production economy flags are off'
);
select ok(
  not exists (
    select 1 from public.economy_feature_flags
    where environment = 'staging' and enabled
  ),
  'staging financial flags are initially off'
);
select is(
  (select count(*)::integer from public.economy_feature_flags where environment = 'staging'),
  10,
  'exactly ten staging economy flags exist'
);
select is(
  (select count(*)::integer from public.economy_feature_flags where environment = 'production'),
  10,
  'exactly ten production economy flags exist'
);
select is(
  (
    select count(*)::integer
    from (
      values
        ('MATCH_NIGHT_ENTRY', 'free', 60, false),
        ('MATCH_NIGHT_ENTRY', 'silver', 40, false),
        ('MATCH_NIGHT_ENTRY', 'gold', 0, true),
        ('MATCH_NIGHT_EXTRA_ROUND', 'free', 25, false),
        ('MATCH_NIGHT_EXTRA_ROUND', 'silver', 20, false),
        ('MATCH_NIGHT_EXTRA_ROUND', 'gold', 15, false),
        ('PROFILE_BOOST_30M', 'free', 50, false),
        ('PROFILE_BOOST_30M', 'silver', 40, false),
        ('PROFILE_BOOST_30M', 'gold', 30, false),
        ('SUPER_SPARK', 'free', 20, false),
        ('SUPER_SPARK', 'silver', 15, false),
        ('SUPER_SPARK', 'gold', 10, false),
        ('PREMIUM_DATE_DECK', 'free', 15, false),
        ('PREMIUM_DATE_DECK', 'silver', 10, false),
        ('PREMIUM_DATE_DECK', 'gold', 0, true)
    ) expected(action_code, membership_tier, price_sparks, included)
    left join public.economy_action_rules actual
      on actual.environment = 'staging'
      and actual.action_code = expected.action_code
      and actual.membership_tier = expected.membership_tier
      and actual.price_sparks = expected.price_sparks
      and actual.included = expected.included
    where actual.id is null
  ),
  0,
  'all fifteen staging economy prices and included benefits match policy'
);
select ok(
  (
    select bool_and(c.relrowsecurity)
    from pg_class c
    where c.oid = any(array[
      'public.economy_feature_flags'::regclass,
      'public.economy_action_rules'::regclass,
      'public.spark_spend_intents'::regclass,
      'public.spark_ledger_events'::regclass,
      'public.revenuecat_webhook_inbox'::regclass,
      'public.economy_passes'::regclass,
      'public.economy_reconciliation_runs'::regclass,
      'public.economic_risk_events'::regclass
    ])
  ),
  'RLS is enabled on every economy foundation table'
);
select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'public'
      and policyname in (
        'spark_spend_intents_select_own',
        'spark_ledger_events_select_own',
        'economy_passes_select_own'
      )
      and cmd = 'SELECT'
  ),
  3,
  'all intended owner-scoped read policies exist'
);

select ok(not has_table_privilege('authenticated', 'public.spark_ledger_events', 'INSERT'), 'users cannot insert ledger events');
select ok(not has_table_privilege('authenticated', 'public.spark_ledger_events', 'UPDATE'), 'users cannot update ledger events');
select ok(not has_table_privilege('authenticated', 'public.spark_ledger_events', 'DELETE'), 'users cannot delete ledger events');
select ok(not has_table_privilege('authenticated', 'public.economy_action_rules', 'INSERT'), 'users cannot insert rules');
select ok(not has_table_privilege('authenticated', 'public.economy_action_rules', 'UPDATE'), 'users cannot update rules');
select ok(not has_table_privilege('authenticated', 'public.revenuecat_webhook_inbox', 'INSERT'), 'users cannot insert inbox rows');
select ok(not has_table_privilege('authenticated', 'public.revenuecat_webhook_inbox', 'UPDATE'), 'users cannot update inbox rows');
select ok(not has_table_privilege('authenticated', 'public.economy_action_rules', 'DELETE'), 'users cannot delete rules');
select ok(
  not has_table_privilege('authenticated', 'public.economy_feature_flags', 'INSERT')
  and not has_table_privilege('authenticated', 'public.economy_feature_flags', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.economy_feature_flags', 'DELETE'),
  'users cannot mutate economy flags'
);
select ok(not has_table_privilege('authenticated', 'public.economy_passes', 'INSERT'), 'users cannot create economy passes');
select ok(not has_table_privilege('authenticated', 'public.revenuecat_webhook_inbox', 'DELETE'), 'users cannot delete inbox rows');
select ok(
  not has_table_privilege('authenticated', 'public.economy_reconciliation_runs', 'INSERT')
  and not has_table_privilege('authenticated', 'public.economy_reconciliation_runs', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.economy_reconciliation_runs', 'DELETE'),
  'users cannot mutate reconciliation runs'
);
select ok(
  not has_table_privilege('authenticated', 'public.economic_risk_events', 'INSERT')
  and not has_table_privilege('authenticated', 'public.economic_risk_events', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.economic_risk_events', 'DELETE'),
  'users cannot mutate economic risk events'
);
select ok(not has_table_privilege('authenticated', 'public.spark_spend_intents', 'INSERT'), 'users cannot create arbitrary spend intents');
select ok(
  not has_table_privilege('authenticated', 'public.economy_passes', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.economy_passes', 'DELETE'),
  'users cannot consume or delete economy passes directly'
);

select col_is_unique(
  'public',
  'revenuecat_webhook_inbox',
  'revenuecat_event_id',
  'RevenueCat event IDs are unique'
);
select ok(
  exists (
    select 1 from pg_trigger
    where tgrelid = 'public.spark_ledger_events'::regclass
      and tgname = 'spark_ledger_events_append_only'
      and not tgisinternal
  ),
  'ledger has an append-only mutation trigger'
);
select lives_ok(
  $$
    insert into public.spark_ledger_events(
      user_id, environment, delta_sparks, source, reason, idempotency_key
    )
    values (
      '9b100000-0000-4000-8000-000000000001', 'staging', 1,
      'reconciliation', 'provider_reconciliation', 'phase-b1-ledger-canary'
    )
  $$,
  'rollback-only ledger canary fixture is available'
);
select throws_ok(
  $$ update public.spark_ledger_events set delta_sparks = 2 where idempotency_key = 'phase-b1-ledger-canary' $$,
  '55000',
  'spark_ledger_events_append_only',
  'append-only trigger rejects ledger updates even for a privileged caller'
);
select throws_ok(
  $$ delete from public.spark_ledger_events where idempotency_key = 'phase-b1-ledger-canary' $$,
  '55000',
  'spark_ledger_events_append_only',
  'append-only trigger rejects ledger deletes even for a privileged caller'
);
select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'economy_passes'
      and policyname = 'economy_passes_select_own'
      and cmd = 'SELECT'
      and qual like '%auth.uid()%user_id%'
  ),
  'pass reads are owner-scoped'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.revenuecat_webhook_inbox'::regclass),
  'webhook inbox has RLS enabled'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.rpc_service_assert_economy_feature_enabled_v1(text,text)',
    'EXECUTE'
  ),
  'service role can invoke the feature guard'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.rpc_service_get_economy_rule_v1(text,text,text)',
    'EXECUTE'
  ),
  'users cannot call the authoritative rule resolver'
);
select lives_ok(
  $$
    insert into public.revenuecat_webhook_inbox(
      revenuecat_event_id, event_type, environment, app_user_id, payload, payload_sha256
    ) values (
      'phase-b1-inbox-canary', 'TEST', 'SANDBOX', null, '{}'::jsonb,
      '0000000000000000000000000000000000000000000000000000000000000000'
    )
  $$,
  'new rollback-only inbox event is accepted once'
);
select throws_ok(
  $$
    insert into public.revenuecat_webhook_inbox(
      revenuecat_event_id, event_type, environment, app_user_id, payload, payload_sha256
    ) values (
      'phase-b1-inbox-canary', 'TEST', 'SANDBOX', null, '{}'::jsonb,
      '0000000000000000000000000000000000000000000000000000000000000000'
    )
  $$,
  '23505', null,
  'duplicate inbox event IDs are rejected'
);
select ok(
  exists (
    select 1
    from public.revenuecat_webhook_inbox
    where revenuecat_event_id = 'phase-b1-inbox-canary'
      and processing_state = 'received'
      and retry_count = 0
      and environment = 'SANDBOX'
  ),
  'inbox records environment and initializes processing state and retry count'
);
select throws_ok(
  $$
    insert into public.revenuecat_webhook_inbox(
      revenuecat_event_id, event_type, environment, payload, payload_sha256
    ) values (
      '', 'TEST', 'SANDBOX', '{}'::jsonb,
      '0000000000000000000000000000000000000000000000000000000000000000'
    )
  $$,
  '23514', null,
  'malformed inbox events are rejected by constraints'
);

select * from finish();
rollback;
