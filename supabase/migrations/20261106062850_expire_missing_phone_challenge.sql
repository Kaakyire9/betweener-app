-- A provider 404 means this SID cannot be checked again. Retain its binding
-- for replay protection while allowing a new challenge immediately.
create function public.rpc_expire_phone_challenge_v1(
  p_user_id uuid, p_id uuid, p_check_id uuid, p_sid text
) returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  update private.phone_verification_challenges
  set expires_at = clock_timestamp()
  where id = p_id and user_id = p_user_id and check_id = p_check_id
    and verification_sid = p_sid and result is null and expires_at > clock_timestamp();
  return found;
end;
$$;

revoke all on function public.rpc_expire_phone_challenge_v1(uuid, uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.rpc_expire_phone_challenge_v1(uuid, uuid, uuid, text)
  to service_role;
