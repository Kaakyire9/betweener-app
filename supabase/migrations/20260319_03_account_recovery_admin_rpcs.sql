create or replace function public.rpc_admin_get_account_recovery_requests()
returns table (
  id uuid,
  requester_user_id uuid,
  requester_profile_id uuid,
  requester_name text,
  requester_avatar_url text,
  status text,
  current_sign_in_method text,
  previous_sign_in_method text,
  contact_email text,
  previous_account_email text,
  note text,
  evidence jsonb,
  linked_merge_case_id uuid,
  reviewed_by uuid,
  review_notes text,
  reviewed_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_internal_admin() then
    raise exception 'admin access required';
  end if;

  return query
  select
    arr.id,
    arr.requester_user_id,
    arr.requester_profile_id,
    requester.full_name,
    requester.avatar_url,
    arr.status,
    arr.current_sign_in_method,
    arr.previous_sign_in_method,
    arr.contact_email,
    arr.previous_account_email,
    arr.note,
    arr.evidence,
    arr.linked_merge_case_id,
    arr.reviewed_by,
    arr.review_notes,
    arr.reviewed_at,
    arr.created_at,
    arr.updated_at
  from public.account_recovery_requests arr
  left join public.profiles requester on requester.id = arr.requester_profile_id
  order by
    case
      when arr.status in ('pending', 'reviewing') then 0
      else 1
    end,
    arr.created_at desc;
end;
$$;

create or replace function public.rpc_admin_update_account_recovery_request(
  p_request_id uuid,
  p_status text,
  p_review_notes text default null,
  p_linked_merge_case_id uuid default null
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

  if v_status not in ('pending', 'reviewing', 'resolved', 'closed') then
    raise exception 'invalid recovery request status';
  end if;

  update public.account_recovery_requests
     set status = v_status,
         linked_merge_case_id = coalesce(p_linked_merge_case_id, linked_merge_case_id),
         review_notes = coalesce(nullif(trim(coalesce(p_review_notes, '')), ''), review_notes),
         reviewed_by = case
           when v_status in ('reviewing', 'resolved', 'closed') then auth.uid()
           else reviewed_by
         end,
         reviewed_at = case
           when v_status in ('reviewing', 'resolved', 'closed') then timezone('utc'::text, now())
           else reviewed_at
         end
   where id = p_request_id;

  return found;
end;
$$;

revoke all on function public.rpc_admin_get_account_recovery_requests() from public;
revoke all on function public.rpc_admin_update_account_recovery_request(uuid, text, text, uuid) from public;

grant execute on function public.rpc_admin_get_account_recovery_requests() to authenticated;
grant execute on function public.rpc_admin_update_account_recovery_request(uuid, text, text, uuid) to authenticated;
