alter table public.profiles
  add column if not exists vibes_practice_completed_version integer not null default 0;

alter table public.profiles
  add column if not exists vibes_practice_completed_at timestamptz;
