alter table public.circle_pulse_comment_reports
  add column if not exists status text not null default 'pending',
  add column if not exists reviewed_by_profile_id uuid references public.profiles(id) on delete set null,
  add column if not exists reviewed_at timestamptz;

alter table public.circle_pulse_comment_reports
  drop constraint if exists circle_pulse_comment_reports_status_valid;

alter table public.circle_pulse_comment_reports
  add constraint circle_pulse_comment_reports_status_valid check (
    status in ('pending', 'reviewing', 'resolved', 'dismissed')
  );

create index if not exists circle_pulse_comment_reports_circle_status_idx
  on public.circle_pulse_comment_reports (circle_id, status, created_at desc);

create or replace function public.rpc_list_circle_pulse_comment_reports(
  p_circle_id uuid,
  p_actor_profile_id uuid
)
returns table (
  comment_id uuid,
  circle_id uuid,
  pulse_item_id uuid,
  pulse_item_type text,
  pulse_item_title text,
  comment_profile_id uuid,
  comment_author_name text,
  comment_body text,
  report_count integer,
  latest_reason text,
  latest_report_at timestamptz,
  status text
)
language plpgsql
security definer
stable
set search_path = public, pg_catalog
as $$
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = p_actor_profile_id
      and p.user_id = auth.uid()
      and p.deleted_at is null
  ) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  if not public.can_manage_circle_pulse(p_circle_id, auth.uid()) then
    raise exception 'host_required' using errcode = '42501';
  end if;

  return query
  select
    cpc.id as comment_id,
    cpc.circle_id,
    cpc.pulse_item_id,
    cpi.item_type as pulse_item_type,
    coalesce(
      nullif(btrim(cpi.title), ''),
      nullif(btrim(cp.title), ''),
      nullif(btrim(g.title), ''),
      initcap(replace(cpi.item_type, '_', ' '))
    ) as pulse_item_title,
    cpc.profile_id as comment_profile_id,
    coalesce(nullif(btrim(author.full_name), ''), 'Circle member') as comment_author_name,
    cpc.body as comment_body,
    count(cpcr.id)::integer as report_count,
    (array_agg(cpcr.reason order by cpcr.created_at desc, cpcr.id desc))[1] as latest_reason,
    max(cpcr.created_at) as latest_report_at,
    case
      when bool_or(cpcr.status = 'reviewing') then 'reviewing'::text
      else 'pending'::text
    end as status
  from public.circle_pulse_comment_reports cpcr
  join public.circle_pulse_comments cpc on cpc.id = cpcr.comment_id
  join public.circle_pulse_items cpi on cpi.id = cpc.pulse_item_id
  join public.profiles author on author.id = cpc.profile_id
  left join public.circle_prompts cp on cp.id = cpi.prompt_id
  left join public.gatherings g on g.id = cpi.gathering_id
  where cpcr.circle_id = p_circle_id
    and cpcr.status in ('pending', 'reviewing')
    and cpc.status = 'active'
  group by
    cpc.id,
    cpc.circle_id,
    cpc.pulse_item_id,
    cpi.item_type,
    cpi.title,
    cp.title,
    g.title,
    cpc.profile_id,
    author.full_name,
    cpc.body
  order by
    case when bool_or(cpcr.status = 'reviewing') then 1 else 0 end,
    max(cpcr.created_at) desc,
    cpc.id desc
  limit 100;
end;
$$;

create or replace function public.rpc_review_circle_pulse_comment_report(
  p_comment_id uuid,
  p_actor_profile_id uuid,
  p_action text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_comment public.circle_pulse_comments%rowtype;
  v_action text := lower(coalesce(p_action, ''));
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = p_actor_profile_id
      and p.user_id = auth.uid()
      and p.deleted_at is null
  ) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  if v_action not in ('reviewing', 'dismiss', 'remove') then
    raise exception 'invalid_action';
  end if;

  select *
    into v_comment
  from public.circle_pulse_comments cpc
  where cpc.id = p_comment_id
  for update;

  if v_comment.id is null then
    raise exception 'comment_not_found';
  end if;

  if not public.can_manage_circle_pulse(v_comment.circle_id, auth.uid()) then
    raise exception 'host_required' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.circle_pulse_comment_reports cpcr
    where cpcr.comment_id = p_comment_id
      and cpcr.status in ('pending', 'reviewing')
  ) then
    raise exception 'pulse_comment_report_not_found';
  end if;

  if v_action = 'remove' then
    update public.circle_pulse_comments
    set status = 'removed',
        deleted_at = timezone('utc'::text, now())
    where id = p_comment_id
      and status = 'active';
  end if;

  update public.circle_pulse_comment_reports
  set status = case
        when v_action = 'reviewing' then 'reviewing'
        when v_action = 'dismiss' then 'dismissed'
        else 'resolved'
      end,
      reviewed_by_profile_id = p_actor_profile_id,
      reviewed_at = case
        when v_action = 'reviewing' then reviewed_at
        else timezone('utc'::text, now())
      end
  where comment_id = p_comment_id
    and status in ('pending', 'reviewing');

  return true;
end;
$$;

revoke all on function public.rpc_list_circle_pulse_comment_reports(uuid, uuid) from public;
revoke all on function public.rpc_review_circle_pulse_comment_report(uuid, uuid, text) from public;

grant execute on function public.rpc_list_circle_pulse_comment_reports(uuid, uuid) to authenticated;
grant execute on function public.rpc_review_circle_pulse_comment_report(uuid, uuid, text) to authenticated;
