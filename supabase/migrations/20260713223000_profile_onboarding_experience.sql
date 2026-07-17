-- Persist the onboarding experience independently from current residence.
-- This keeps Ghana-diaspora UI stable when a Ghanaian member lives abroad.

alter table public.profiles
  add column if not exists onboarding_variant text;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conname = 'profiles_onboarding_variant_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_onboarding_variant_check
      check (onboarding_variant is null or onboarding_variant in ('ghana', 'global'));
  end if;
end;
$$;

update public.profiles
set onboarding_variant = case
  when country_lock_policy like 'ghana_%'
    then 'ghana'
  when profile_completed is true then 'global'
  else onboarding_variant
end
where onboarding_variant is null;

create index if not exists profiles_onboarding_variant_idx
  on public.profiles (onboarding_variant)
  where onboarding_variant is not null;

comment on column public.profiles.onboarding_variant is
  'Durable onboarding experience selected by the member: ghana or global.';
