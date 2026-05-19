alter table public.moments
  add column if not exists metadata jsonb not null default '{}'::jsonb;
