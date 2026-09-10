-- Betweener Live Phase 10F: explicit availability and private pre-Live
-- opportunities. Presence supports freshness only; it never implies consent.

begin;

alter table public.notification_prefs
  add column if not exists live_always_on_invitations boolean not null default true;

create table public.live_odo_always_on_configuration (
  id boolean primary key default true check (id),
  availability_enabled boolean not null default false,
  shadow_detection_enabled boolean not null default false,
  invitations_enabled boolean not null default false,
  system_session_creation_enabled boolean not null default false,
  odo_start_enabled boolean not null default false,
  music_enabled boolean not null default false,
  automatic_ending_enabled boolean not null default false,
  circuit_breaker_open boolean not null default true,
  internal_only boolean not null default true,
  safety_coverage_mode text not null default 'selected_test_cohort',
  verified_users_only boolean not null default true,
  allowed_markets text[] not null default array['internal']::text[],
  availability_durations_minutes integer[] not null default array[15,30,60]::integer[],
  default_availability_minutes integer not null default 30,
  candidate_scan_limit integer not null default 40,
  edge_scan_limit integer not null default 400,
  minimum_cohort_size integer not null default 2,
  maximum_cohort_size integer not null default 8,
  invitation_ttl_seconds integer not null default 90,
  opportunity_ttl_seconds integer not null default 180,
  worker_lease_seconds integer not null default 30,
  invitation_cooldown_minutes integer not null default 30,
  post_session_cooldown_minutes integer not null default 60,
  not_tonight_hours integer not null default 12,
  maximum_invitations_per_day integer not null default 4,
  presence_freshness_seconds integer not null default 90,
  low_liquidity_seconds integer not null default 120,
  empty_room_seconds integer not null default 120,
  maximum_session_runtime_minutes integer not null default 45,
  updated_at timestamptz not null default timezone('utc', now()),
  constraint live_odo_always_on_configuration_bounds check (
    cardinality(allowed_markets) between 1 and 64
    and safety_coverage_mode in ('selected_test_cohort','automated')
    and cardinality(availability_durations_minutes) between 1 and 6
    and default_availability_minutes = any(availability_durations_minutes)
    and candidate_scan_limit between 2 and 100
    and edge_scan_limit between 1 and 2000
    and minimum_cohort_size between 2 and 8
    and maximum_cohort_size between minimum_cohort_size and 12
    and invitation_ttl_seconds between 30 and 600
    and opportunity_ttl_seconds between invitation_ttl_seconds and 900
    and worker_lease_seconds between 10 and 120
    and invitation_cooldown_minutes between 5 and 1440
    and post_session_cooldown_minutes between 5 and 1440
    and not_tonight_hours between 1 and 48
    and maximum_invitations_per_day between 1 and 12
    and presence_freshness_seconds between 30 and 300
    and low_liquidity_seconds between 30 and 900
    and empty_room_seconds between 30 and 900
    and maximum_session_runtime_minutes between 10 and 180
    and (not invitations_enabled or (availability_enabled and shadow_detection_enabled))
    and (not system_session_creation_enabled or invitations_enabled)
    and (not odo_start_enabled or system_session_creation_enabled)
    and (not odo_start_enabled or automatic_ending_enabled)
    and (not music_enabled or odo_start_enabled)
    and (not automatic_ending_enabled or system_session_creation_enabled)
  )
);

insert into public.live_odo_always_on_configuration(id) values (true)
on conflict (id) do nothing;

create table public.live_odo_always_on_access (
  user_id uuid primary key references auth.users(id) on delete cascade,
  allowed boolean not null default false,
  note text check (note is null or char_length(note) <= 240),
  granted_by_user_id uuid references auth.users(id) on delete set null,
  expires_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.live_quick_connect_availability (
  user_id uuid primary key references auth.users(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'available' check (status in (
    'available','reserved','consumed','withdrawn','expired','paused','invalidated'
  )),
  source text not null check (source in ('live_lobby','notification','post_live','internal_test')),
  market_context text not null check (
    market_context ~ '^[a-z0-9][a-z0-9:_-]{0,79}$'
  ),
  available_from timestamptz not null default timezone('utc', now()),
  expires_at timestamptz not null,
  reserved_opportunity_id uuid,
  last_invited_at timestamptz,
  cooldown_until timestamptz,
  not_tonight_until timestamptz,
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint live_quick_connect_availability_window_valid check (
    expires_at > available_from and expires_at <= available_from + interval '24 hours'
  )
);

create table public.live_quick_connect_opportunities (
  id uuid primary key default gen_random_uuid(),
  market_context text not null check (market_context ~ '^[a-z0-9][a-z0-9:_-]{0,79}$'),
  formation_bucket timestamptz not null,
  state text not null default 'detected' check (state in (
    'detected','forming','inviting','awaiting_quorum','quorum_reached',
    'creating_session','starting','live','expired','failed','cancelled','completed'
  )),
  shadow_only boolean not null default true,
  candidate_count integer not null default 0 check (candidate_count between 0 and 100),
  pair_edge_count integer not null default 0 check (pair_edge_count between 0 and 2000),
  accepted_count integer not null default 0 check (accepted_count between 0 and 100),
  accepted_pair_edge_count integer not null default 0 check (accepted_pair_edge_count between 0 and 2000),
  isolated_count integer not null default 0 check (isolated_count between 0 and 100),
  expires_at timestamptz not null,
  lease_owner uuid,
  lease_expires_at timestamptz,
  lease_generation bigint not null default 1 check (lease_generation > 0),
  live_session_id uuid unique references public.live_sessions(id) on delete set null,
  start_attempts integer not null default 0 check (start_attempts between 0 and 12),
  last_reason_code text check (
    last_reason_code is null or last_reason_code ~ '^[a-z][a-z0-9_]{0,119}$'
  ),
  ended_reason_code text check (
    ended_reason_code is null or ended_reason_code ~ '^[a-z][a-z0-9_]{0,119}$'
  ),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint live_quick_connect_opportunity_expiry_valid check (expires_at > created_at),
  constraint live_quick_connect_opportunity_lease_valid check (
    (lease_owner is null and lease_expires_at is null)
    or (lease_owner is not null and lease_expires_at is not null)
  ),
  unique(market_context, formation_bucket)
);

alter table public.live_quick_connect_availability
  add constraint live_quick_connect_availability_reservation_fk
  foreign key (reserved_opportunity_id)
  references public.live_quick_connect_opportunities(id) on delete set null;

create table public.live_quick_connect_opportunity_members (
  opportunity_id uuid not null references public.live_quick_connect_opportunities(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  state text not null default 'candidate' check (state in (
    'candidate','invited','accepted','declined','not_now','not_tonight',
    'withdrawn','expired','invalidated','consumed'
  )),
  invitation_sent_at timestamptz,
  invitation_expires_at timestamptz,
  responded_at timestamptz,
  response_reason_code text check (
    response_reason_code is null or response_reason_code ~ '^[a-z][a-z0-9_]{0,119}$'
  ),
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key(opportunity_id, user_id),
  unique(opportunity_id, profile_id)
);

create table public.live_quick_connect_opportunity_reservations (
  user_id uuid primary key references auth.users(id) on delete cascade,
  opportunity_id uuid not null references public.live_quick_connect_opportunities(id) on delete cascade,
  availability_version bigint not null check (availability_version > 0),
  reserved_at timestamptz not null default timezone('utc', now()),
  expires_at timestamptz not null,
  constraint live_quick_connect_opportunity_reservation_expiry_valid
    check (expires_at > reserved_at),
  unique(opportunity_id, user_id)
);

create table public.live_quick_connect_opportunity_events (
  id bigint generated always as identity primary key,
  opportunity_id uuid references public.live_quick_connect_opportunities(id) on delete cascade,
  event_type text not null check (event_type ~ '^[a-z][a-z0-9_]{0,79}$'),
  reason_code text not null check (reason_code ~ '^[a-z][a-z0-9_]{0,119}$'),
  candidate_count integer check (candidate_count is null or candidate_count between 0 and 100),
  pair_edge_count integer check (pair_edge_count is null or pair_edge_count between 0 and 2000),
  accepted_count integer check (accepted_count is null or accepted_count between 0 and 100),
  duration_ms integer check (duration_ms is null or duration_ms between 0 and 120000),
  metadata jsonb not null default '{}'::jsonb check (
    jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 2048
  ),
  created_at timestamptz not null default timezone('utc', now())
);

create table public.live_quick_connect_opportunity_updates (
  user_id uuid primary key references auth.users(id) on delete cascade,
  version bigint not null default 1 check (version > 0),
  updated_at timestamptz not null default timezone('utc', now())
);

create index live_qc_availability_market_expiry_idx
  on public.live_quick_connect_availability(market_context, expires_at, available_from, user_id)
  where status = 'available';
create index live_qc_availability_cooldown_idx
  on public.live_quick_connect_availability(cooldown_until)
  where status in ('available','paused');
create unique index live_qc_opportunity_active_market_idx
  on public.live_quick_connect_opportunities(market_context)
  where state in (
    'detected','forming','inviting','awaiting_quorum','quorum_reached',
    'creating_session','starting','live'
  );
create index live_qc_opportunity_wake_idx
  on public.live_quick_connect_opportunities(state, lease_expires_at, expires_at, created_at);
create index live_qc_opportunity_members_invite_idx
  on public.live_quick_connect_opportunity_members(state, invitation_expires_at, opportunity_id);
create index live_qc_opportunity_members_user_idx
  on public.live_quick_connect_opportunity_members(user_id, created_at desc);
create index live_qc_opportunity_events_recent_idx
  on public.live_quick_connect_opportunity_events(created_at desc);

alter table public.live_odo_always_on_configuration enable row level security;
alter table public.live_odo_always_on_access enable row level security;
alter table public.live_quick_connect_availability enable row level security;
alter table public.live_quick_connect_opportunities enable row level security;
alter table public.live_quick_connect_opportunity_members enable row level security;
alter table public.live_quick_connect_opportunity_reservations enable row level security;
alter table public.live_quick_connect_opportunity_events enable row level security;
alter table public.live_quick_connect_opportunity_updates enable row level security;

create policy live_qc_opportunity_updates_self_select
on public.live_quick_connect_opportunity_updates for select to authenticated
using (user_id = auth.uid());

revoke all on table
  public.live_odo_always_on_configuration,
  public.live_odo_always_on_access,
  public.live_quick_connect_availability,
  public.live_quick_connect_opportunities,
  public.live_quick_connect_opportunity_members,
  public.live_quick_connect_opportunity_reservations,
  public.live_quick_connect_opportunity_events
from public, anon, authenticated, service_role;
revoke insert, update, delete on table public.live_quick_connect_opportunity_updates
from public, anon, authenticated, service_role;
grant select on table public.live_quick_connect_opportunity_updates to authenticated;

create trigger live_odo_always_on_configuration_updated_at
before update on public.live_odo_always_on_configuration
for each row execute function public.set_updated_at();
create trigger live_odo_always_on_access_updated_at
before update on public.live_odo_always_on_access
for each row execute function public.set_updated_at();
create trigger live_qc_availability_updated_at
before update on public.live_quick_connect_availability
for each row execute function public.set_updated_at();
create trigger live_qc_opportunities_updated_at
before update on public.live_quick_connect_opportunities
for each row execute function public.set_updated_at();
create trigger live_qc_opportunity_members_updated_at
before update on public.live_quick_connect_opportunity_members
for each row execute function public.set_updated_at();

alter table public.live_quick_connect_opportunity_updates replica identity full;
alter publication supabase_realtime add table public.live_quick_connect_opportunity_updates;

comment on table public.live_quick_connect_availability is
  'Private, explicit, time-bounded permission to be considered for Always-On Quick Connect.';
comment on table public.live_quick_connect_opportunities is
  'Private pre-Live formation state. It is never a public roster or pairability projection.';
comment on table public.live_quick_connect_opportunity_events is
  'Operational metrics only. Raw candidate identities, graph edges and private responses are prohibited.';

commit;
