-- Betweener Membership + Sparks Economy V1, Phase B foundation.
-- This migration creates policy/configuration, intent, audit and inbox storage.
-- RevenueCat remains authoritative for SPK balances. No debit or credit occurs here.

begin;

create table public.economy_feature_flags (
  environment text not null check (environment in ('staging', 'production')),
  flag_key text not null check (flag_key in (
    'spark_wallet_enabled',
    'spark_store_enabled',
    'member_spark_grants_enabled',
    'match_night_spark_entry_enabled',
    'match_night_extra_round_enabled',
    'profile_boost_spark_enabled',
    'super_spark_enabled',
    'premium_date_deck_enabled',
    'gold_match_night_included_enabled',
    'first_match_night_pass_enabled'
  )),
  enabled boolean not null default false,
  reason text,
  updated_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (environment, flag_key),
  constraint economy_feature_flags_reason_length check (
    reason is null or char_length(reason) between 1 and 240
  )
);

create table public.economy_action_rules (
  id uuid primary key default gen_random_uuid(),
  environment text not null check (environment in ('staging', 'production')),
  action_code text not null check (action_code in (
    'MATCH_NIGHT_ENTRY',
    'MATCH_NIGHT_EXTRA_ROUND',
    'PROFILE_BOOST_30M',
    'SUPER_SPARK',
    'PREMIUM_DATE_DECK'
  )),
  membership_tier text not null check (membership_tier in ('free', 'silver', 'gold')),
  price_sparks integer not null check (price_sparks between 0 and 1000000),
  included boolean not null default false,
  active boolean not null default true,
  version integer not null default 1 check (version > 0),
  effective_at timestamptz not null default timezone('utc', now()),
  expires_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (environment, action_code, membership_tier, version),
  constraint economy_action_rules_included_price check (
    not included or price_sparks = 0
  ),
  constraint economy_action_rules_window check (
    expires_at is null or expires_at > effective_at
  )
);

create unique index economy_action_rules_one_active_version_idx
  on public.economy_action_rules(environment, action_code, membership_tier)
  where active;

create table public.spark_spend_intents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  environment text not null check (environment in ('staging', 'production')),
  action_code text not null check (action_code in (
    'MATCH_NIGHT_ENTRY',
    'MATCH_NIGHT_EXTRA_ROUND',
    'PROFILE_BOOST_30M',
    'SUPER_SPARK',
    'PREMIUM_DATE_DECK'
  )),
  membership_tier text not null check (membership_tier in ('free', 'silver', 'gold')),
  rule_id uuid not null references public.economy_action_rules(id) on delete restrict,
  rule_version integer not null check (rule_version > 0),
  quoted_price_sparks integer not null check (quoted_price_sparks between 0 and 1000000),
  included boolean not null default false,
  status text not null default 'quoted' check (status in (
    'quoted', 'pending', 'debited', 'fulfilled', 'failed',
    'compensation_pending', 'compensated'
  )),
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 200),
  resource_type text check (resource_type is null or char_length(resource_type) <= 80),
  resource_id uuid,
  provider_transaction_id text check (
    provider_transaction_id is null or char_length(provider_transaction_id) <= 255
  ),
  failure_code text check (failure_code is null or char_length(failure_code) <= 80),
  expires_at timestamptz not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  fulfilled_at timestamptz,
  unique (environment, user_id, idempotency_key),
  constraint spark_spend_intents_included_price check (
    not included or quoted_price_sparks = 0
  )
);

create index spark_spend_intents_user_created_idx
  on public.spark_spend_intents(user_id, created_at desc);
create index spark_spend_intents_pending_idx
  on public.spark_spend_intents(environment, status, created_at)
  where status in ('quoted', 'pending', 'debited', 'compensation_pending');

create table public.spark_ledger_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  environment text not null check (environment in ('staging', 'production')),
  spend_intent_id uuid references public.spark_spend_intents(id) on delete restrict,
  delta_sparks integer not null check (
    delta_sparks between -1000000 and 1000000 and delta_sparks <> 0
  ),
  source text not null check (source in (
    'revenuecat', 'membership_grant', 'purchase', 'spend',
    'compensation', 'reconciliation'
  )),
  reason text not null check (reason in (
    'member_monthly_grant',
    'spark_pack_purchase',
    'economy_action_debit',
    'failed_fulfillment_compensation',
    'provider_reconciliation'
  )),
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 200),
  provider_transaction_id text check (
    provider_transaction_id is null or char_length(provider_transaction_id) <= 255
  ),
  observed_balance_after integer check (observed_balance_after is null or observed_balance_after >= 0),
  observed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  unique (environment, idempotency_key),
  constraint spark_ledger_observation_shape check (
    (observed_balance_after is null and observed_at is null)
    or (observed_balance_after is not null and observed_at is not null)
  )
);

comment on column public.spark_ledger_events.observed_balance_after is
  'Non-authoritative RevenueCat balance observation for reconciliation only.';

create index spark_ledger_events_user_created_idx
  on public.spark_ledger_events(user_id, created_at desc);
create index spark_ledger_events_intent_idx
  on public.spark_ledger_events(spend_intent_id)
  where spend_intent_id is not null;

create table public.revenuecat_webhook_inbox (
  id uuid primary key default gen_random_uuid(),
  revenuecat_event_id text not null unique check (
    char_length(revenuecat_event_id) between 1 and 255
  ),
  event_type text not null check (char_length(event_type) between 1 and 100),
  environment text check (environment is null or environment in ('SANDBOX', 'PRODUCTION')),
  app_user_id text check (app_user_id is null or char_length(app_user_id) <= 255),
  processing_state text not null default 'received' check (processing_state in (
    'received', 'processing', 'processed', 'ignored', 'retryable', 'failed'
  )),
  retry_count integer not null default 0 check (retry_count between 0 and 100),
  last_error_code text check (last_error_code is null or char_length(last_error_code) <= 120),
  payload jsonb not null check (
    jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 262144
  ),
  payload_sha256 text not null check (payload_sha256 ~ '^[0-9a-f]{64}$'),
  received_at timestamptz not null default timezone('utc', now()),
  processing_started_at timestamptz,
  processed_at timestamptz,
  next_retry_at timestamptz,
  updated_at timestamptz not null default timezone('utc', now())
);

create index revenuecat_webhook_inbox_processing_idx
  on public.revenuecat_webhook_inbox(processing_state, next_retry_at, received_at)
  where processing_state in ('received', 'retryable');
create index revenuecat_webhook_inbox_user_idx
  on public.revenuecat_webhook_inbox(app_user_id, received_at desc)
  where app_user_id is not null;

create table public.economy_passes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  environment text not null check (environment in ('staging', 'production')),
  pass_code text not null check (pass_code in (
    'GOLD_MATCH_NIGHT_INCLUDED',
    'FIRST_MATCH_NIGHT_PASS',
    'PROFILE_BOOST_MONTHLY'
  )),
  source text not null check (source in ('membership', 'promotion', 'support', 'migration')),
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 200),
  valid_from timestamptz not null default timezone('utc', now()),
  expires_at timestamptz,
  consumed_at timestamptz,
  consumed_for_resource_id uuid,
  created_at timestamptz not null default timezone('utc', now()),
  unique (environment, user_id, idempotency_key),
  constraint economy_passes_window check (expires_at is null or expires_at > valid_from),
  constraint economy_passes_consumption_shape check (
    (consumed_at is null and consumed_for_resource_id is null)
    or consumed_at is not null
  )
);

create index economy_passes_available_idx
  on public.economy_passes(environment, user_id, pass_code, expires_at)
  where consumed_at is null;

create table public.economy_reconciliation_runs (
  id uuid primary key default gen_random_uuid(),
  environment text not null check (environment in ('staging', 'production')),
  status text not null default 'running' check (status in (
    'running', 'completed', 'completed_with_differences', 'failed'
  )),
  cursor_value text check (cursor_value is null or char_length(cursor_value) <= 500),
  scanned_count integer not null default 0 check (scanned_count >= 0),
  matched_count integer not null default 0 check (matched_count >= 0),
  mismatch_count integer not null default 0 check (mismatch_count >= 0),
  repaired_count integer not null default 0 check (repaired_count >= 0),
  error_code text check (error_code is null or char_length(error_code) <= 120),
  started_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

create table public.economic_risk_events (
  id uuid primary key default gen_random_uuid(),
  environment text not null check (environment in ('staging', 'production')),
  user_id uuid references auth.users(id) on delete set null,
  spend_intent_id uuid references public.spark_spend_intents(id) on delete set null,
  risk_code text not null check (risk_code ~ '^[A-Z][A-Z0-9_]{2,79}$'),
  severity text not null check (severity in ('info', 'warning', 'high', 'critical')),
  disposition text not null default 'open' check (disposition in (
    'open', 'allowed', 'blocked', 'reviewed', 'resolved'
  )),
  metadata jsonb not null default '{}'::jsonb check (
    jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 8192
  ),
  created_at timestamptz not null default timezone('utc', now()),
  resolved_at timestamptz
);

create index economic_risk_events_open_idx
  on public.economic_risk_events(environment, severity, created_at desc)
  where disposition = 'open';
create index economic_risk_events_user_idx
  on public.economic_risk_events(user_id, created_at desc)
  where user_id is not null;

create trigger economy_feature_flags_set_updated_at
before update on public.economy_feature_flags
for each row execute function public.set_updated_at();

create trigger economy_action_rules_set_updated_at
before update on public.economy_action_rules
for each row execute function public.set_updated_at();

create trigger spark_spend_intents_set_updated_at
before update on public.spark_spend_intents
for each row execute function public.set_updated_at();

create trigger revenuecat_webhook_inbox_set_updated_at
before update on public.revenuecat_webhook_inbox
for each row execute function public.set_updated_at();

create or replace function public.spark_ledger_events_reject_mutation()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
begin
  raise exception 'spark_ledger_events_append_only' using errcode = '55000';
end;
$$;

create trigger spark_ledger_events_append_only
before update or delete on public.spark_ledger_events
for each row execute function public.spark_ledger_events_reject_mutation();

create or replace function public.economy_is_service_role()
returns boolean
language sql
stable
set search_path = public, pg_catalog
as $$
  select coalesce(auth.role(), '') = 'service_role';
$$;

create or replace function public.rpc_service_assert_economy_feature_enabled_v1(
  p_environment text,
  p_flag_key text
)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_enabled boolean;
begin
  if not public.economy_is_service_role() then
    raise exception 'economy_service_role_required' using errcode = '42501';
  end if;
  if p_environment not in ('staging', 'production') then
    raise exception 'economy_invalid_environment' using errcode = '22023';
  end if;

  select enabled into v_enabled
  from public.economy_feature_flags
  where environment = p_environment and flag_key = p_flag_key;

  if not coalesce(v_enabled, false) then
    raise exception 'economy_feature_disabled' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.rpc_service_get_economy_rule_v1(
  p_environment text,
  p_action_code text,
  p_membership_tier text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_rule public.economy_action_rules;
begin
  if not public.economy_is_service_role() then
    raise exception 'economy_service_role_required' using errcode = '42501';
  end if;

  select * into v_rule
  from public.economy_action_rules
  where environment = p_environment
    and action_code = p_action_code
    and membership_tier = p_membership_tier
    and active
    and effective_at <= timezone('utc', now())
    and (expires_at is null or expires_at > timezone('utc', now()))
  order by version desc
  limit 1;

  if not found then
    raise exception 'economy_action_not_found' using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'id', v_rule.id,
    'environment', v_rule.environment,
    'actionCode', v_rule.action_code,
    'membershipTier', v_rule.membership_tier,
    'priceSparks', v_rule.price_sparks,
    'included', v_rule.included,
    'version', v_rule.version
  );
end;
$$;

alter table public.economy_feature_flags enable row level security;
alter table public.economy_action_rules enable row level security;
alter table public.spark_spend_intents enable row level security;
alter table public.spark_ledger_events enable row level security;
alter table public.revenuecat_webhook_inbox enable row level security;
alter table public.economy_passes enable row level security;
alter table public.economy_reconciliation_runs enable row level security;
alter table public.economic_risk_events enable row level security;

create policy spark_spend_intents_select_own
on public.spark_spend_intents for select to authenticated
using (auth.uid() = user_id);

create policy spark_ledger_events_select_own
on public.spark_ledger_events for select to authenticated
using (auth.uid() = user_id);

create policy economy_passes_select_own
on public.economy_passes for select to authenticated
using (auth.uid() = user_id);

revoke all on table public.economy_feature_flags from anon, authenticated;
revoke all on table public.economy_action_rules from anon, authenticated;
revoke all on table public.spark_spend_intents from anon, authenticated;
revoke all on table public.spark_ledger_events from anon, authenticated;
revoke all on table public.revenuecat_webhook_inbox from anon, authenticated;
revoke all on table public.economy_passes from anon, authenticated;
revoke all on table public.economy_reconciliation_runs from anon, authenticated;
revoke all on table public.economic_risk_events from anon, authenticated;

grant select (
  id, user_id, environment, action_code, membership_tier, rule_version,
  quoted_price_sparks, included, status, resource_type, resource_id,
  failure_code, expires_at, created_at, updated_at, fulfilled_at
) on public.spark_spend_intents to authenticated;

grant select (
  id, user_id, environment, spend_intent_id, delta_sparks,
  source, reason, observed_balance_after, observed_at, created_at
) on public.spark_ledger_events to authenticated;

grant select (
  id, user_id, environment, pass_code, source, valid_from,
  expires_at, consumed_at, consumed_for_resource_id, created_at
) on public.economy_passes to authenticated;

grant all on table public.economy_feature_flags to service_role;
grant all on table public.economy_action_rules to service_role;
grant all on table public.spark_spend_intents to service_role;
grant insert, select on table public.spark_ledger_events to service_role;
grant all on table public.revenuecat_webhook_inbox to service_role;
grant all on table public.economy_passes to service_role;
grant all on table public.economy_reconciliation_runs to service_role;
grant all on table public.economic_risk_events to service_role;

revoke all on function public.spark_ledger_events_reject_mutation() from public, anon, authenticated;
revoke all on function public.economy_is_service_role() from public, anon, authenticated;
revoke all on function public.rpc_service_assert_economy_feature_enabled_v1(text, text) from public, anon, authenticated;
revoke all on function public.rpc_service_get_economy_rule_v1(text, text, text) from public, anon, authenticated;
grant execute on function public.rpc_service_assert_economy_feature_enabled_v1(text, text) to service_role;
grant execute on function public.rpc_service_get_economy_rule_v1(text, text, text) to service_role;

insert into public.economy_feature_flags(environment, flag_key, enabled, reason)
select environment, flag_key, false, 'Phase B foundation: financial actions remain disabled'
from unnest(array['staging', 'production']) as environments(environment)
cross join unnest(array[
  'spark_wallet_enabled',
  'spark_store_enabled',
  'member_spark_grants_enabled',
  'match_night_spark_entry_enabled',
  'match_night_extra_round_enabled',
  'profile_boost_spark_enabled',
  'super_spark_enabled',
  'premium_date_deck_enabled',
  'gold_match_night_included_enabled',
  'first_match_night_pass_enabled'
]) as flags(flag_key)
on conflict (environment, flag_key) do nothing;

insert into public.economy_action_rules(
  environment, action_code, membership_tier, price_sparks, included, version
)
values
  ('staging', 'MATCH_NIGHT_ENTRY', 'free', 60, false, 1),
  ('staging', 'MATCH_NIGHT_ENTRY', 'silver', 40, false, 1),
  ('staging', 'MATCH_NIGHT_ENTRY', 'gold', 0, true, 1),
  ('staging', 'MATCH_NIGHT_EXTRA_ROUND', 'free', 25, false, 1),
  ('staging', 'MATCH_NIGHT_EXTRA_ROUND', 'silver', 20, false, 1),
  ('staging', 'MATCH_NIGHT_EXTRA_ROUND', 'gold', 15, false, 1),
  ('staging', 'PROFILE_BOOST_30M', 'free', 50, false, 1),
  ('staging', 'PROFILE_BOOST_30M', 'silver', 40, false, 1),
  ('staging', 'PROFILE_BOOST_30M', 'gold', 30, false, 1),
  ('staging', 'SUPER_SPARK', 'free', 20, false, 1),
  ('staging', 'SUPER_SPARK', 'silver', 15, false, 1),
  ('staging', 'SUPER_SPARK', 'gold', 10, false, 1),
  ('staging', 'PREMIUM_DATE_DECK', 'free', 15, false, 1),
  ('staging', 'PREMIUM_DATE_DECK', 'silver', 10, false, 1),
  ('staging', 'PREMIUM_DATE_DECK', 'gold', 0, true, 1)
on conflict (environment, action_code, membership_tier, version) do nothing;

commit;
