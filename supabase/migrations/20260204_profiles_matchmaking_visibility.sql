-- Profiles matchmaking visibility flags

alter table public.profiles
  add column if not exists matchmaking_mode boolean not null default false,
  add column if not exists discoverable_in_vibes boolean not null default true;

-- Optional: keep helper profiles out of Vibes by default
create or replace function public.enforce_matchmaking_visibility()
returns trigger as $$
begin
  if new.matchmaking_mode = true then
    new.discoverable_in_vibes = false;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists profiles_enforce_matchmaking_visibility on public.profiles;
create trigger profiles_enforce_matchmaking_visibility
before insert or update of matchmaking_mode on public.profiles
for each row execute function public.enforce_matchmaking_visibility();
