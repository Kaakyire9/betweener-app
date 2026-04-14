-- Add premium cultural identity fields for profile display and privacy controls.
-- Keeps legacy `tribe` intact while introducing richer, multi-value `roots`.

alter table public.profiles
  add column if not exists roots text[] null,
  add column if not exists roots_note text null,
  add column if not exists roots_visibility text not null default 'VISIBLE';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_roots_visibility_check'
  ) then
    alter table public.profiles
      add constraint profiles_roots_visibility_check
      check (roots_visibility in ('VISIBLE', 'HIDDEN'));
  end if;
end $$;

update public.profiles
set
  roots = case
    when (roots is null or cardinality(roots) = 0)
      and nullif(btrim(coalesce(tribe, '')), '') is not null
      then array[nullif(btrim(tribe), '')]
    else roots
  end,
  roots_visibility = coalesce(nullif(btrim(coalesce(roots_visibility, '')), ''), 'VISIBLE')
where
  (roots is null or cardinality(roots) = 0)
  or nullif(btrim(coalesce(roots_visibility, '')), '') is null;
