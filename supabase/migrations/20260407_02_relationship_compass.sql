-- Relationship Compass: a premium matchmaking lens stored on the member profile.
-- Kept as JSONB for now so the product can evolve without repeated schema churn.

alter table public.profiles
  add column if not exists relationship_compass jsonb not null default '{}'::jsonb;

create index if not exists profiles_relationship_compass_gin_idx
  on public.profiles
  using gin (relationship_compass);
