-- Ensure profile sync runs when a verified phone_verifications row is later linked to a user_id.
-- Without this, rows that become verified anonymously (user_id null) won't update profiles when
-- user_id is set in a later step.

do $$
begin
  if exists (
    select 1
    from pg_trigger
    where tgname = 'phone_verifications_sync_profile'
  ) then
    execute 'drop trigger phone_verifications_sync_profile on public.phone_verifications';
  end if;
end
$$;

create trigger phone_verifications_sync_profile
after insert or update of status, is_verified, verified_at, user_id
on public.phone_verifications
for each row
execute function public.sync_profile_phone_verified();

