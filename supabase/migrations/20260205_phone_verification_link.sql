-- RPC: link verified phone session to auth user (for pre-auth verification flows)

create or replace function public.rpc_link_phone_verification(p_signup_session_id text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    return false;
  end if;

  if p_signup_session_id is null or length(p_signup_session_id) = 0 then
    return false;
  end if;

  update public.phone_verifications
  set user_id = v_user_id
  where signup_session_id = p_signup_session_id
    and status = 'verified';

  return true;
end;
$$;

grant execute on function public.rpc_link_phone_verification(text) to authenticated;
