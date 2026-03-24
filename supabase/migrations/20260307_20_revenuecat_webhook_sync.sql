-- RevenueCat webhook sync infrastructure.
-- Goals:
-- 1) make RevenueCat the server-side source of truth for subscription rows
-- 2) keep an idempotent event log for retries, failures, and auditability
-- 3) preserve compatibility with the existing subscriptions table and app RPCs

alter table public.subscriptions
  add column if not exists source text not null default 'manual'
    check (source in ('manual', 'revenuecat')),
  add column if not exists external_customer_id text,
  add column if not exists external_product_id text,
  add column if not exists external_entitlement text,
  add column if not exists external_environment text,
  add column if not exists updated_at timestamptz not null default timezone('utc'::text, now());

create unique index if not exists idx_subscriptions_revenuecat_sync
  on public.subscriptions (user_id, source, external_product_id, ends_at);

create table if not exists public.revenuecat_webhook_events (
  id uuid primary key default gen_random_uuid(),
  event_id text not null unique,
  event_type text not null,
  app_user_id text,
  original_app_user_id text,
  aliases text[] not null default '{}',
  transferred_from text[] not null default '{}',
  transferred_to text[] not null default '{}',
  environment text,
  event_timestamp_ms bigint,
  processing_status text not null default 'received'
    check (processing_status in ('received', 'processed', 'ignored', 'failed')),
  synced_user_ids uuid[] not null default '{}',
  last_error text,
  payload jsonb not null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  processed_at timestamptz,
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists idx_revenuecat_webhook_events_status_created
  on public.revenuecat_webhook_events (processing_status, created_at desc);

create index if not exists idx_revenuecat_webhook_events_app_user
  on public.revenuecat_webhook_events (app_user_id);

alter table public.revenuecat_webhook_events enable row level security;

revoke all on public.revenuecat_webhook_events from anon, authenticated;

drop policy if exists "Internal admins can view RevenueCat webhook events" on public.revenuecat_webhook_events;
create policy "Internal admins can view RevenueCat webhook events"
on public.revenuecat_webhook_events
for select
to authenticated
using (public.is_internal_admin());
