-- Make rpc_get_phone_verification_status non-blocking to avoid timeouts

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
  -- Avoid lock hangs
  set local statement_timeout = '2s';
  set local lock_timeout = '2s';

  v_user_id := auth.uid();
  if v_user_id is null then
    return jsonb_build_object('verified', false);
  end if;

  -- Find latest verified phone for this user
  select pv.phone_number
    into v_phone
  from public.phone_verifications pv
  where pv.user_id = v_user_id
    and (pv.status = 'verified' or pv.is_verified = true)
  order by pv.verified_at desc nulls last, pv.updated_at desc nulls last
  limit 1;

  if v_phone is null then
    return jsonb_build_object('verified', false);
  end if;

  -- Ensure profile exists (Phase-2 nullable schema allows minimal row)
  insert into public.profiles (user_id)
  values (v_user_id)
  on conflict (user_id) do nothing;

  -- Persist verification on profile (non-blocking)
  update public.profiles
  set phone_verified = true,
      phone_number = coalesce(phone_number, v_phone),
      updated_at = now()
  where user_id = v_user_id
    and user_id in (
      select user_id
      from public.profiles
      where user_id = v_user_id
      for update skip locked
    );

  return jsonb_build_object('verified', true, 'phone_number', v_phone);
end;
$$;

grant execute on function public.rpc_get_phone_verification_status() to authenticated;
