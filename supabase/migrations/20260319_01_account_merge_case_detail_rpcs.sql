create or replace function public.rpc_admin_get_account_merge_case(
  p_case_id uuid
)
returns table (
  id uuid,
  status text,
  request_channel text,
  candidate_reason text,
  source_user_id uuid,
  source_profile_id uuid,
  source_name text,
  source_avatar_url text,
  target_user_id uuid,
  target_profile_id uuid,
  target_name text,
  target_avatar_url text,
  requester_user_id uuid,
  created_by uuid,
  reviewed_by uuid,
  executed_by uuid,
  created_at timestamptz,
  updated_at timestamptz,
  reviewed_at timestamptz,
  executed_at timestamptz,
  resolved_at timestamptz,
  preflight_summary jsonb,
  execution_summary jsonb,
  evidence jsonb,
  notes text
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
    amc.id,
    amc.status,
    amc.request_channel,
    amc.candidate_reason,
    amc.source_user_id,
    amc.source_profile_id,
    source_profile.full_name,
    source_profile.avatar_url,
    amc.target_user_id,
    amc.target_profile_id,
    target_profile.full_name,
    target_profile.avatar_url,
    amc.requester_user_id,
    amc.created_by,
    amc.reviewed_by,
    amc.executed_by,
    amc.created_at,
    amc.updated_at,
    amc.reviewed_at,
    amc.executed_at,
    amc.resolved_at,
    amc.preflight_summary,
    amc.execution_summary,
    amc.evidence,
    amc.notes
  from public.account_merge_cases amc
  left join public.profiles source_profile on source_profile.id = amc.source_profile_id
  left join public.profiles target_profile on target_profile.id = amc.target_profile_id
  where amc.id = p_case_id
  limit 1;
end;
$$;

create or replace function public.rpc_admin_get_account_merge_case_events(
  p_case_id uuid
)
returns table (
  id uuid,
  merge_case_id uuid,
  event_type text,
  actor_user_id uuid,
  actor_role text,
  metadata jsonb,
  created_at timestamptz
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
    ame.id,
    ame.merge_case_id,
    ame.event_type,
    ame.actor_user_id,
    ia.role,
    ame.metadata,
    ame.created_at
  from public.account_merge_events ame
  left join public.internal_admins ia on ia.user_id = ame.actor_user_id
  where ame.merge_case_id = p_case_id
  order by ame.created_at desc;
end;
$$;

revoke all on function public.rpc_admin_get_account_merge_case(uuid) from public;
revoke all on function public.rpc_admin_get_account_merge_case_events(uuid) from public;

grant execute on function public.rpc_admin_get_account_merge_case(uuid) to authenticated;
grant execute on function public.rpc_admin_get_account_merge_case_events(uuid) to authenticated;
