-- Prevent incomplete profiles from showing in Vibes.
-- Rationale: Phase-2 allows minimal profile rows to exist before onboarding completes.
-- We must ensure those rows are never "discoverable" until required fields (including phone verification) are complete.

-- Backfill: hide any existing incomplete profiles that might have been created with discoverable_in_vibes=true.
update public.profiles
set discoverable_in_vibes = false
where profile_completed is distinct from true
  and discoverable_in_vibes is distinct from false;

create or replace function public.enforce_profiles_discoverability()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Never allow incomplete profiles into Vibes.
  if new.profile_completed is distinct from true then
    new.discoverable_in_vibes := false;
    return new;
  end if;

  -- Keep helper/matchmaking-mode profiles out of Vibes.
  if coalesce(new.matchmaking_mode, false) = true then
    new.discoverable_in_vibes := false;
    return new;
  end if;

  -- When a profile transitions to "completed", default it to discoverable unless explicitly enabled already.
  -- This keeps the default behavior (users appear in Vibes once onboarding is done) while still hiding partial rows.
  if tg_op = 'UPDATE' and (old.profile_completed is distinct from true) and new.profile_completed is true then
    if new.discoverable_in_vibes is distinct from true then
      new.discoverable_in_vibes := true;
    end if;
  end if;

  return new;
end;
$$;

-- Replace older trigger that only handled matchmaking_mode changes.
drop trigger if exists profiles_enforce_matchmaking_visibility on public.profiles;
drop trigger if exists profiles_enforce_discoverability on public.profiles;

create trigger profiles_enforce_discoverability
before insert or update on public.profiles
for each row
execute function public.enforce_profiles_discoverability();

