-- Defensive production fix: some environments still have the older
-- profiles_roots_visibility_check that only allows VISIBLE/HIDDEN.
-- Keep onboarding/profile edit compatible with MATCHES_ONLY privacy.

update public.profiles
set roots_visibility = 'VISIBLE'
where nullif(btrim(coalesce(roots_visibility, '')), '') is null;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'profiles_roots_visibility_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      drop constraint profiles_roots_visibility_check;
  end if;

  alter table public.profiles
    add constraint profiles_roots_visibility_check
    check (roots_visibility in ('VISIBLE', 'HIDDEN', 'MATCHES_ONLY'));
end $$;
