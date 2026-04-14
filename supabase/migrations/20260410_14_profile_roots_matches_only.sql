-- Extend roots visibility with a premium matches-only privacy tier.

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'profiles_roots_visibility_check'
  ) then
    alter table public.profiles
      drop constraint profiles_roots_visibility_check;
  end if;

  alter table public.profiles
    add constraint profiles_roots_visibility_check
    check (roots_visibility in ('VISIBLE', 'HIDDEN', 'MATCHES_ONLY'));
end $$;

update public.profiles
set roots_visibility = 'VISIBLE'
where nullif(btrim(coalesce(roots_visibility, '')), '') is null;
