drop function if exists public.rpc_get_circle_pulse_comments_page(uuid, integer, timestamptz, uuid);
drop function if exists public.rpc_get_circle_pulse_comment_snapshot(uuid);

create function public.rpc_get_circle_pulse_comments_page(
  p_pulse_item_id uuid,
  p_limit integer default 30,
  p_before_created_at timestamptz default null,
  p_before_id uuid default null
)
returns table (
  id uuid,
  pulse_item_id uuid,
  circle_id uuid,
  profile_id uuid,
  display_name text,
  avatar_url text,
  body text,
  parent_comment_id uuid,
  created_at timestamptz,
  updated_at timestamptz,
  is_own boolean,
  can_remove boolean,
  report_count integer,
  reaction_count integer,
  my_reaction text
)
language plpgsql
security definer
stable
set search_path = public, pg_catalog
as $$
declare
  v_circle_id uuid;
  v_profile_id uuid;
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  select cpi.circle_id
    into v_circle_id
  from public.circle_pulse_items cpi
  where cpi.id = p_pulse_item_id
    and cpi.status = 'active'
    and (cpi.starts_at is null or cpi.starts_at <= timezone('utc'::text, now()))
    and (cpi.expires_at is null or cpi.expires_at > timezone('utc'::text, now()))
  limit 1;

  if v_circle_id is null then
    raise exception 'pulse_item_not_found';
  end if;

  if not public.can_manage_circle_pulse(v_circle_id, auth.uid())
    and not public.is_circle_member(v_circle_id, auth.uid())
    and not public.is_circle_owner(v_circle_id, auth.uid()) then
    raise exception 'circle_membership_required' using errcode = '42501';
  end if;

  select p.id
    into v_profile_id
  from public.profiles p
  where p.user_id = auth.uid()
    and p.deleted_at is null
  limit 1;

  return query
  with windowed as (
    select
      cpc.id,
      cpc.pulse_item_id,
      cpc.circle_id,
      cpc.profile_id,
      coalesce(nullif(btrim(p.full_name), ''), 'Member') as display_name,
      p.avatar_url,
      cpc.body,
      cpc.parent_comment_id,
      cpc.created_at,
      cpc.updated_at,
      cpc.user_id = auth.uid() as is_own,
      (
        cpc.user_id = auth.uid()
        or public.can_manage_circle_pulse(cpc.circle_id, auth.uid())
      ) as can_remove,
      cpc.report_count,
      cpc.reaction_count,
      cpcr.reaction as my_reaction
    from public.circle_pulse_comments cpc
    join public.profiles p on p.id = cpc.profile_id
    left join public.circle_pulse_comment_reactions cpcr
      on cpcr.comment_id = cpc.id
     and cpcr.profile_id = v_profile_id
    where cpc.pulse_item_id = p_pulse_item_id
      and cpc.status = 'active'
      and (
        p_before_created_at is null
        or cpc.created_at < p_before_created_at
        or (
          p_before_id is not null
          and cpc.created_at = p_before_created_at
          and cpc.id < p_before_id
        )
      )
    order by cpc.created_at desc, cpc.id desc
    limit greatest(1, least(coalesce(p_limit, 30), 100))
  )
  select
    windowed.id,
    windowed.pulse_item_id,
    windowed.circle_id,
    windowed.profile_id,
    windowed.display_name,
    windowed.avatar_url,
    windowed.body,
    windowed.parent_comment_id,
    windowed.created_at,
    windowed.updated_at,
    windowed.is_own,
    windowed.can_remove,
    windowed.report_count,
    windowed.reaction_count,
    windowed.my_reaction
  from windowed
  order by windowed.created_at asc, windowed.id asc;
end;
$$;

create function public.rpc_get_circle_pulse_comment_snapshot(
  p_comment_id uuid
)
returns table (
  id uuid,
  pulse_item_id uuid,
  circle_id uuid,
  profile_id uuid,
  display_name text,
  avatar_url text,
  body text,
  parent_comment_id uuid,
  created_at timestamptz,
  updated_at timestamptz,
  is_own boolean,
  can_remove boolean,
  report_count integer,
  reaction_count integer,
  my_reaction text
)
language plpgsql
security definer
stable
set search_path = public, pg_catalog
as $$
declare
  v_comment public.circle_pulse_comments%rowtype;
  v_profile_id uuid;
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  select *
    into v_comment
  from public.circle_pulse_comments cpc
  where cpc.id = p_comment_id
  limit 1;

  if v_comment.id is null or v_comment.status <> 'active' then
    raise exception 'comment_not_found';
  end if;

  if not public.can_manage_circle_pulse(v_comment.circle_id, auth.uid())
    and not public.is_circle_member(v_comment.circle_id, auth.uid())
    and not public.is_circle_owner(v_comment.circle_id, auth.uid()) then
    raise exception 'circle_membership_required' using errcode = '42501';
  end if;

  select p.id
    into v_profile_id
  from public.profiles p
  where p.user_id = auth.uid()
    and p.deleted_at is null
  limit 1;

  return query
  select
    cpc.id,
    cpc.pulse_item_id,
    cpc.circle_id,
    cpc.profile_id,
    coalesce(nullif(btrim(p.full_name), ''), 'Member') as display_name,
    p.avatar_url,
    cpc.body,
    cpc.parent_comment_id,
    cpc.created_at,
    cpc.updated_at,
    cpc.user_id = auth.uid() as is_own,
    (
      cpc.user_id = auth.uid()
      or public.can_manage_circle_pulse(cpc.circle_id, auth.uid())
    ) as can_remove,
    cpc.report_count,
    cpc.reaction_count,
    cpcr.reaction as my_reaction
  from public.circle_pulse_comments cpc
  join public.profiles p on p.id = cpc.profile_id
  left join public.circle_pulse_comment_reactions cpcr
    on cpcr.comment_id = cpc.id
   and cpcr.profile_id = v_profile_id
  where cpc.id = p_comment_id
    and cpc.status = 'active';
end;
$$;

revoke all on function public.rpc_get_circle_pulse_comments_page(uuid, integer, timestamptz, uuid) from public;
revoke all on function public.rpc_get_circle_pulse_comment_snapshot(uuid) from public;

grant execute on function public.rpc_get_circle_pulse_comments_page(uuid, integer, timestamptz, uuid) to authenticated;
grant execute on function public.rpc_get_circle_pulse_comment_snapshot(uuid) to authenticated;
