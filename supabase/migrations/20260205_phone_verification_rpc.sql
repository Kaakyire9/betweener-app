-- RPC: read phone verification status for current user (security definer)

create or replace function public.rpc_get_phone_verification_status()
returns jsonb
language plpgsql
security definer
set search_path = public
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
    where user_id = v_user_id;

    return jsonb_build_object('verified', true, 'phone_number', v_phone);
  end if;

  return jsonb_build_object('verified', false);
end;
$$;

grant execute on function public.rpc_get_phone_verification_status() to authenticated;
