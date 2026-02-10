-- Ensure phone verification RPCs bypass RLS safely

create or replace function public.rpc_link_phone_verification(p_signup_session_id text)
returns boolean
language plpgsql
security definer
set search_path = public
set row_security = off
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

create or replace function public.rpc_get_phone_verification_status()
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_user_id uuid;
  v_phone text;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    return jsonb_build_object('verified', false);
  end if;

  select pv.phone_number
    into v_phone
  from public.phone_verifications pv
  where pv.user_id = v_user_id
    and pv.status = 'verified'
  order by pv.verified_at desc nulls last
  limit 1;

  if v_phone is not null then
    update public.profiles
    set phone_verified = true,
        phone_number = coalesce(phone_number, v_phone)
    where user_id = v_user_id
      and (phone_verified is distinct from true or phone_number is null);

    return jsonb_build_object('verified', true, 'phone_number', v_phone);
  end if;

  return jsonb_build_object('verified', false);
end;
$$;

grant execute on function public.rpc_get_phone_verification_status() to authenticated;
