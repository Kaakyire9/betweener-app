create or replace function public.rpc_cancel_circle_role_request(
  p_request_id uuid,
  p_profile_id uuid
)
returns public.circle_role_requests
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_owner uuid;
  v_request public.circle_role_requests%rowtype;
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  select user_id into v_owner
  from public.profiles
  where id = p_profile_id
  limit 1;

  if v_owner is null or v_owner <> auth.uid() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  update public.circle_role_requests
  set status = 'cancelled',
      updated_at = timezone('utc'::text, now())
  where id = p_request_id
    and requester_profile_id = p_profile_id
    and status = 'pending'
  returning * into v_request;

  if v_request.id is null then
    raise exception 'request_not_found';
  end if;

  return v_request;
end;
$$;

grant execute on function public.rpc_cancel_circle_role_request(uuid, uuid) to authenticated;
