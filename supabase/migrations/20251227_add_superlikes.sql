-- Add superlike quota tracking to profiles
alter table public.profiles
  add column if not exists superlikes_left integer not null default 1,
  add column if not exists superlikes_reset_at timestamp with time zone;

-- Optional: seed existing users with a daily free superlike (adjust as needed)
update public.profiles
set superlikes_left = 1
where superlikes_left is null;
