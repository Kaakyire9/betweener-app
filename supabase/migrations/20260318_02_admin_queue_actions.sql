create or replace function public.rpc_admin_update_date_plan_concierge_request(
  p_request_id uuid,
  p_status text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text := lower(trim(coalesce(p_status, '')));
begin
  if not public.is_internal_admin() then
    raise exception 'admin access required';
  end if;

  if v_status not in ('pending', 'claimed', 'completed', 'cancelled') then
    raise exception 'invalid concierge request status';
  end if;

  update public.date_plan_concierge_requests
     set status = v_status,
         assigned_admin_user_id = case
           when v_status in ('claimed', 'completed', 'cancelled') then coalesce(assigned_admin_user_id, auth.uid())
           else null
         end,
         resolved_at = case
           when v_status in ('completed', 'cancelled') then timezone('utc'::text, now())
           else null
         end,
         updated_at = timezone('utc'::text, now())
   where id = p_request_id;

  return found;
end;
$$;

revoke all on function public.rpc_admin_update_date_plan_concierge_request(uuid, text) from public;
grant execute on function public.rpc_admin_update_date_plan_concierge_request(uuid, text) to authenticated;
