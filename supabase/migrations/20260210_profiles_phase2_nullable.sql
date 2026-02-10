-- Phase 2: allow progressive profile completion and compute profile_completed

alter table public.profiles
  alter column full_name drop not null,
  alter column age drop not null,
  alter column gender drop not null,
  alter column bio drop not null,
  alter column region drop not null,
  alter column tribe drop not null,
  alter column religion drop not null,
  alter column min_age_interest drop not null,
  alter column max_age_interest drop not null,
  alter column phone_number drop not null,
  alter column verification_level drop not null,
  alter column profile_completed set default false;

alter table public.profiles
  alter column min_age_interest set default 18,
  alter column max_age_interest set default 35;

alter table public.profiles
  drop constraint if exists profiles_diaspora_status_check;

drop index if exists profiles_diaspora_status_idx;

alter table public.profiles
  drop column if exists diaspora_status,
  drop column if exists willing_long_distance;

create or replace function public.profiles_compute_profile_completed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  has_required_fields boolean;
begin
  has_required_fields :=
    (new.full_name is not null and trim(new.full_name) <> '')
    and (new.age is not null)
    and (new.gender is not null)
    and (new.bio is not null and trim(new.bio) <> '')
    and (new.region is not null and trim(new.region) <> '')
    and (new.tribe is not null and trim(new.tribe) <> '')
    and (new.religion is not null)
    and (new.min_age_interest is not null and new.max_age_interest is not null)
    and (new.phone_verified is true and new.phone_number is not null);

  new.profile_completed := has_required_fields;
  return new;
end;
$$;

-- Ensures profile_completed updated both insert and update.
drop trigger if exists profiles_compute_profile_completed on public.profiles;
create trigger profiles_compute_profile_completed
before insert or update on public.profiles
for each row
execute function public.profiles_compute_profile_completed();

-- RLS: allow authenticated users to insert/update partial profiles
DO $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'profiles_insert_partial'
  ) then
    execute 'create policy "profiles_insert_partial"
             on public.profiles
             for insert
             to authenticated
             with check (auth.uid() = user_id)';
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'profiles_update_partial_owner'
  ) then
    execute 'create policy "profiles_update_partial_owner"
             on public.profiles
             for update
             to authenticated
             using (auth.uid() = user_id)
             with check (auth.uid() = user_id)';
  end if;
end
$$;
