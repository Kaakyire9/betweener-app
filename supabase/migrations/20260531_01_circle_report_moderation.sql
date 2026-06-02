create or replace function public.rpc_list_circle_reports(
  p_circle_id uuid,
  p_profile_id uuid
)
returns table (
  id uuid,
  circle_id uuid,
  gathering_id uuid,
  prompt_response_id uuid,
  reporter_profile_id uuid,
  reason text,
  details text,
  status text,
  created_at timestamptz,
  gathering_title text,
  prompt_response_text text
)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_owner uuid;
  v_actor_role text;
  v_is_admin boolean := public.is_admin_user(auth.uid());
  v_is_circle_owner boolean := false;
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  if p_circle_id is null then
    raise exception 'circle_not_found';
  end if;

  select user_id into v_owner
  from public.profiles
  where id = p_profile_id
  limit 1;

  if v_owner is null or v_owner <> auth.uid() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  v_is_circle_owner := public.is_circle_owner(p_circle_id, auth.uid());

  if not v_is_admin and not v_is_circle_owner then
    select lower(role) into v_actor_role
    from public.circle_members
    where circle_id = p_circle_id
      and profile_id = p_profile_id
      and status = 'active'
    limit 1;

    if coalesce(v_actor_role, '') not in ('leader', 'host', 'admin', 'moderator') then
      raise exception 'host_required' using errcode = '42501';
    end if;
  end if;

  return query
  select
    cr.id,
    cr.circle_id,
    cr.gathering_id,
    cr.prompt_response_id,
    cr.reporter_profile_id,
    cr.reason,
    cr.details,
    cr.status,
    cr.created_at,
    g.title as gathering_title,
    cpr.response as prompt_response_text
  from public.circle_reports cr
  left join public.gatherings g on g.id = cr.gathering_id
  left join public.circle_prompt_responses cpr on cpr.id = cr.prompt_response_id
  where cr.circle_id = p_circle_id
  order by
    case cr.status
      when 'pending' then 0
      when 'reviewing' then 1
      else 2
    end,
    cr.created_at desc
  limit 50;
end;
$$;

grant execute on function public.rpc_list_circle_reports(uuid, uuid) to authenticated;

create or replace function public.rpc_review_circle_report(
  p_report_id uuid,
  p_profile_id uuid,
  p_status text
)
returns public.circle_reports
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_owner uuid;
  v_actor_role text;
  v_report public.circle_reports%rowtype;
  v_is_admin boolean := public.is_admin_user(auth.uid());
  v_is_circle_owner boolean := false;
  v_next_status text := lower(coalesce(p_status, ''));
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  if v_next_status not in ('reviewing', 'resolved', 'dismissed') then
    raise exception 'invalid_status';
  end if;

  select user_id into v_owner
  from public.profiles
  where id = p_profile_id
  limit 1;

  if v_owner is null or v_owner <> auth.uid() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select *
    into v_report
  from public.circle_reports
  where id = p_report_id
  for update;

  if v_report.id is null or v_report.circle_id is null then
    raise exception 'report_not_found';
  end if;

  v_is_circle_owner := public.is_circle_owner(v_report.circle_id, auth.uid());

  if not v_is_admin and not v_is_circle_owner then
    select lower(role) into v_actor_role
    from public.circle_members
    where circle_id = v_report.circle_id
      and profile_id = p_profile_id
      and status = 'active'
    limit 1;

    if coalesce(v_actor_role, '') not in ('leader', 'host', 'admin', 'moderator') then
      raise exception 'host_required' using errcode = '42501';
    end if;
  end if;

  update public.circle_reports
  set status = v_next_status
  where id = p_report_id
  returning * into v_report;

  return v_report;
end;
$$;

grant execute on function public.rpc_review_circle_report(uuid, uuid, text) to authenticated;

create or replace function public.rpc_remove_circle_prompt_response(
  p_response_id uuid,
  p_profile_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_owner uuid;
  v_actor_role text;
  v_response public.circle_prompt_responses%rowtype;
  v_is_admin boolean := public.is_admin_user(auth.uid());
  v_is_circle_owner boolean := false;
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

  select *
    into v_response
  from public.circle_prompt_responses
  where id = p_response_id
  for update;

  if v_response.id is null or v_response.circle_id is null then
    raise exception 'response_not_found';
  end if;

  v_is_circle_owner := public.is_circle_owner(v_response.circle_id, auth.uid());

  if not v_is_admin and not v_is_circle_owner then
    select lower(role) into v_actor_role
    from public.circle_members
    where circle_id = v_response.circle_id
      and profile_id = p_profile_id
      and status = 'active'
    limit 1;

    if coalesce(v_actor_role, '') not in ('leader', 'host', 'admin', 'moderator') then
      raise exception 'host_required' using errcode = '42501';
    end if;
  end if;

  delete from public.circle_prompt_responses
  where id = p_response_id;

  return found;
end;
$$;

grant execute on function public.rpc_remove_circle_prompt_response(uuid, uuid) to authenticated;
