-- Lock down verification/admin paths for launch:
-- 1) remove broad "admin" RLS policies that effectively exposed verification review
-- 2) prevent authenticated clients from mutating trust-sensitive profile fields
-- 3) provide a narrow RPC for users to acknowledge rejected verification notices

drop policy if exists "Admins can view all verification docs" on storage.objects;
drop policy if exists "Admins can view all verification requests" on public.verification_requests;
drop policy if exists "Admins can update verification requests" on public.verification_requests;

create or replace function public.profiles_guard_sensitive_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Allow trusted server-side contexts (service role / SQL editor) to manage
  -- operational fields. Regular app clients must not be able to self-verify,
  -- mark phones verified, mint superlikes, or change server-computed scores.
  if auth.uid() is null or coalesce(auth.role(), '') in ('service_role', 'supabase_admin') then
    return new;
  end if;

  if new.verification_level is distinct from old.verification_level then
    raise exception 'verification_level is server-managed';
  end if;

  if new.phone_verified is distinct from old.phone_verified then
    raise exception 'phone_verified is server-managed';
  end if;

  if new.phone_verification_score is distinct from old.phone_verification_score then
    raise exception 'phone_verification_score is server-managed';
  end if;

  if new.superlikes_left is distinct from old.superlikes_left then
    raise exception 'superlikes_left is server-managed';
  end if;

  if new.superlikes_reset_at is distinct from old.superlikes_reset_at then
    raise exception 'superlikes_reset_at is server-managed';
  end if;

  if new.ai_score is distinct from old.ai_score then
    raise exception 'ai_score is server-managed';
  end if;

  if new.ai_score_updated_at is distinct from old.ai_score_updated_at then
    raise exception 'ai_score_updated_at is server-managed';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_guard_sensitive_fields on public.profiles;
create trigger profiles_guard_sensitive_fields
before update on public.profiles
for each row
execute function public.profiles_guard_sensitive_fields();

create or replace function public.rpc_ack_verification_request(p_request_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.verification_requests
     set user_notified = true,
         updated_at = timezone('utc'::text, now())
   where id = p_request_id
     and user_id = auth.uid()
     and status = 'rejected';

  return found;
end;
$$;

revoke all on function public.rpc_ack_verification_request(uuid) from public;
grant execute on function public.rpc_ack_verification_request(uuid) to authenticated;
