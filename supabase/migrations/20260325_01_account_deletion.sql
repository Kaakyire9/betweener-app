create table if not exists public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  profile_id uuid null,
  contact_email text null,
  reason_keys text[] not null,
  feedback text null,
  metadata jsonb not null default '{}'::jsonb,
  status text not null default 'requested',
  failure_reason text null,
  requested_at timestamptz not null default timezone('utc'::text, now()),
  completed_at timestamptz null,
  constraint account_deletion_requests_reason_keys_nonempty
    check (coalesce(array_length(reason_keys, 1), 0) > 0),
  constraint account_deletion_requests_status_check
    check (status in ('requested', 'completed', 'failed'))
);

create index if not exists idx_account_deletion_requests_user_id
  on public.account_deletion_requests (user_id, requested_at desc);

create index if not exists idx_account_deletion_requests_profile_id
  on public.account_deletion_requests (profile_id, requested_at desc)
  where profile_id is not null;

alter table public.account_deletion_requests enable row level security;

revoke all on table public.account_deletion_requests from public;
revoke all on table public.account_deletion_requests from anon;
revoke all on table public.account_deletion_requests from authenticated;
