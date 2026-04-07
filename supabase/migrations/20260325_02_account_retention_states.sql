alter table public.profiles
  add column if not exists account_state text not null default 'active',
  add column if not exists paused_at timestamptz null,
  add column if not exists pause_reason text null,
  add column if not exists account_state_updated_at timestamptz not null default timezone('utc'::text, now());

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_account_state_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_account_state_check
      check (account_state in ('active', 'paused', 'hidden', 'deleted'));
  end if;
end;
$$;

update public.profiles
set
  account_state = case
    when deleted_at is not null then 'deleted'
    when discoverable_in_vibes = false then 'hidden'
    else 'active'
  end,
  account_state_updated_at = coalesce(updated_at, timezone('utc'::text, now()))
where account_state is null
   or account_state not in ('active', 'paused', 'hidden', 'deleted');

create table if not exists public.account_retention_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  profile_id uuid null,
  action text not null,
  source text not null default 'delete_flow',
  trigger_reason text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now()),
  constraint account_retention_events_action_check
    check (action in ('take_break', 'quiet_notifications', 'hide_profile'))
);

create index if not exists idx_account_retention_events_user_id
  on public.account_retention_events (user_id, created_at desc);

create index if not exists idx_account_retention_events_profile_id
  on public.account_retention_events (profile_id, created_at desc)
  where profile_id is not null;

alter table public.account_retention_events enable row level security;

revoke all on table public.account_retention_events from public;
revoke all on table public.account_retention_events from anon;
revoke all on table public.account_retention_events from authenticated;
