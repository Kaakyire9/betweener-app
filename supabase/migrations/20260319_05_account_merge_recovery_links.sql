create or replace function public.rpc_admin_get_account_recovery_requests_by_merge_case(
  p_merge_case_id uuid
)
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
  where arr.linked_merge_case_id = p_merge_case_id
  order by
    case
      when arr.status in ('pending', 'reviewing') then 0
      else 1
    end,
    arr.created_at desc;
end;
$$;

revoke all on function public.rpc_admin_get_account_recovery_requests_by_merge_case(uuid) from public;
grant execute on function public.rpc_admin_get_account_recovery_requests_by_merge_case(uuid) to authenticated;
