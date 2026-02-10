-- Sync verified phone status into profiles (source of truth)

create or replace function public.phone_verifications_set_verified_flag()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'verified' then
    new.is_verified = true;
    if new.verified_at is null then
      new.verified_at = now();
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.sync_profile_phone_verified()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.status = 'verified' or new.is_verified is true) and new.user_id is not null then
    update public.profiles
    set phone_verified = true,
        phone_number = coalesce(phone_number, new.phone_number),
        updated_at = now()
    where user_id = new.user_id
      and (phone_verified is distinct from true or phone_number is null);
  end if;
  return new;
end;
$$;

do $$
begin
  if exists (
    select 1
    from pg_trigger
    where tgname = 'phone_verifications_set_verified_flag'
  ) then
    execute 'drop trigger phone_verifications_set_verified_flag on public.phone_verifications';
  end if;
  if exists (
    select 1
    from pg_trigger
    where tgname = 'phone_verifications_sync_profile'
  ) then
    execute 'drop trigger phone_verifications_sync_profile on public.phone_verifications';
  end if;
end
$$;

create trigger phone_verifications_set_verified_flag
before insert or update of status, verified_at
on public.phone_verifications
for each row
execute function public.phone_verifications_set_verified_flag();

create trigger phone_verifications_sync_profile
after insert or update of status, is_verified, verified_at
on public.phone_verifications
for each row
execute function public.sync_profile_phone_verified();
