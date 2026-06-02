create table if not exists public.circle_pulse_comments (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references public.circles(id) on delete cascade,
  pulse_item_id uuid not null references public.circle_pulse_items(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  parent_comment_id uuid references public.circle_pulse_comments(id) on delete cascade,
  status text not null default 'active',
  report_count integer not null default 0,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  deleted_at timestamptz,
  constraint circle_pulse_comments_body_length check (
    char_length(btrim(body)) between 1 and 500
  ),
  constraint circle_pulse_comments_status_valid check (
    status in ('active', 'deleted', 'removed')
  ),
  constraint circle_pulse_comments_parent_valid check (
    parent_comment_id is null or parent_comment_id <> id
  ),
  constraint circle_pulse_comments_report_count_valid check (
    report_count >= 0
  )
);

create index if not exists circle_pulse_comments_item_active_idx
  on public.circle_pulse_comments (pulse_item_id, status, created_at asc);

create index if not exists circle_pulse_comments_circle_idx
  on public.circle_pulse_comments (circle_id, created_at desc);

create index if not exists circle_pulse_comments_profile_idx
  on public.circle_pulse_comments (profile_id, created_at desc);

drop trigger if exists circle_pulse_comments_set_updated_at on public.circle_pulse_comments;
create trigger circle_pulse_comments_set_updated_at
before update on public.circle_pulse_comments
for each row execute function public.set_updated_at();

create table if not exists public.circle_pulse_comment_reports (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references public.circles(id) on delete cascade,
  pulse_item_id uuid not null references public.circle_pulse_items(id) on delete cascade,
  comment_id uuid not null references public.circle_pulse_comments(id) on delete cascade,
  reporter_profile_id uuid not null references public.profiles(id) on delete cascade,
  reporter_user_id uuid not null references auth.users(id) on delete cascade,
  reason text not null default 'concern',
  created_at timestamptz not null default timezone('utc'::text, now()),
  constraint circle_pulse_comment_reports_reason_length check (
    char_length(btrim(reason)) between 1 and 120
  ),
  constraint circle_pulse_comment_reports_unique_reporter unique (
    comment_id,
    reporter_profile_id
  )
);

create index if not exists circle_pulse_comment_reports_circle_idx
  on public.circle_pulse_comment_reports (circle_id, created_at desc);

create index if not exists circle_pulse_comment_reports_comment_idx
  on public.circle_pulse_comment_reports (comment_id, created_at desc);

alter table public.circle_pulse_comments enable row level security;
alter table public.circle_pulse_comment_reports enable row level security;

revoke all on public.circle_pulse_comments from anon, authenticated;
revoke all on public.circle_pulse_comment_reports from anon, authenticated;

create or replace function public.rpc_get_circle_pulse_comments(
  p_pulse_item_id uuid,
  p_limit integer default 100
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
  report_count integer
)
language plpgsql
security definer
stable
set search_path = public, pg_catalog
as $$
declare
  v_circle_id uuid;
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
    cpc.report_count
  from public.circle_pulse_comments cpc
  join public.profiles p on p.id = cpc.profile_id
  where cpc.pulse_item_id = p_pulse_item_id
    and cpc.status = 'active'
  order by cpc.created_at asc, cpc.id asc
  limit greatest(1, least(coalesce(p_limit, 100), 200));
end;
$$;

create or replace function public.rpc_create_circle_pulse_comment(
  p_pulse_item_id uuid,
  p_profile_id uuid,
  p_body text,
  p_parent_comment_id uuid default null
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
  report_count integer
)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_circle_id uuid;
  v_comment public.circle_pulse_comments%rowtype;
  v_body text := nullif(btrim(coalesce(p_body, '')), '');
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = p_profile_id
      and p.user_id = auth.uid()
      and p.deleted_at is null
  ) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  if v_body is null or char_length(v_body) > 500 then
    raise exception 'invalid_comment';
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

  if not public.is_circle_member(v_circle_id, auth.uid())
    and not public.is_circle_owner(v_circle_id, auth.uid()) then
    raise exception 'circle_membership_required' using errcode = '42501';
  end if;

  if p_parent_comment_id is not null and not exists (
    select 1
    from public.circle_pulse_comments cpc
    where cpc.id = p_parent_comment_id
      and cpc.pulse_item_id = p_pulse_item_id
      and cpc.status = 'active'
  ) then
    raise exception 'parent_comment_not_found';
  end if;

  insert into public.circle_pulse_comments (
    circle_id,
    pulse_item_id,
    profile_id,
    user_id,
    body,
    parent_comment_id
  )
  values (
    v_circle_id,
    p_pulse_item_id,
    p_profile_id,
    auth.uid(),
    v_body,
    p_parent_comment_id
  )
  returning * into v_comment;

  return query
  select
    v_comment.id,
    v_comment.pulse_item_id,
    v_comment.circle_id,
    v_comment.profile_id,
    coalesce(nullif(btrim(p.full_name), ''), 'Member') as display_name,
    p.avatar_url,
    v_comment.body,
    v_comment.parent_comment_id,
    v_comment.created_at,
    v_comment.updated_at,
    true as is_own,
    true as can_remove,
    v_comment.report_count
  from public.profiles p
  where p.id = v_comment.profile_id;
end;
$$;

create or replace function public.rpc_delete_circle_pulse_comment(
  p_comment_id uuid,
  p_profile_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_comment public.circle_pulse_comments%rowtype;
  v_status text;
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = p_profile_id
      and p.user_id = auth.uid()
      and p.deleted_at is null
  ) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select *
    into v_comment
  from public.circle_pulse_comments cpc
  where cpc.id = p_comment_id
    and cpc.status = 'active'
  for update;

  if v_comment.id is null then
    raise exception 'comment_not_found';
  end if;

  if v_comment.user_id <> auth.uid()
    and not public.can_manage_circle_pulse(v_comment.circle_id, auth.uid()) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  v_status := case when v_comment.user_id = auth.uid() then 'deleted' else 'removed' end;

  update public.circle_pulse_comments
  set status = v_status,
      deleted_at = timezone('utc'::text, now())
  where id = p_comment_id;

  return found;
end;
$$;

create or replace function public.rpc_report_circle_pulse_comment(
  p_comment_id uuid,
  p_profile_id uuid,
  p_reason text default 'concern'
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_comment public.circle_pulse_comments%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_inserted_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = p_profile_id
      and p.user_id = auth.uid()
      and p.deleted_at is null
  ) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  if v_reason is null or char_length(v_reason) > 120 then
    raise exception 'invalid_reason';
  end if;

  select *
    into v_comment
  from public.circle_pulse_comments cpc
  where cpc.id = p_comment_id
    and cpc.status = 'active'
  for update;

  if v_comment.id is null then
    raise exception 'comment_not_found';
  end if;

  if v_comment.user_id = auth.uid() then
    raise exception 'cannot_report_own_comment';
  end if;

  if not public.is_circle_member(v_comment.circle_id, auth.uid())
    and not public.is_circle_owner(v_comment.circle_id, auth.uid()) then
    raise exception 'circle_membership_required' using errcode = '42501';
  end if;

  insert into public.circle_pulse_comment_reports (
    circle_id,
    pulse_item_id,
    comment_id,
    reporter_profile_id,
    reporter_user_id,
    reason
  )
  values (
    v_comment.circle_id,
    v_comment.pulse_item_id,
    v_comment.id,
    p_profile_id,
    auth.uid(),
    v_reason
  )
  on conflict (comment_id, reporter_profile_id) do nothing;

  get diagnostics v_inserted_count = row_count;

  if v_inserted_count > 0 then
    update public.circle_pulse_comments
    set report_count = report_count + 1
    where id = p_comment_id;
  end if;

  return true;
end;
$$;

create or replace function public.rpc_get_circle_pulse_items(
  p_circle_id uuid,
  p_include_inactive boolean default false
)
returns table (
  id uuid,
  circle_id uuid,
  item_type text,
  title text,
  subtitle text,
  body text,
  image_url text,
  media_url text,
  media_type text,
  prompt_id uuid,
  gathering_id uuid,
  moment_id uuid,
  status text,
  priority integer,
  starts_at timestamptz,
  expires_at timestamptz,
  comment_count integer,
  gathering_starts_at timestamptz,
  gathering_city text,
  gathering_type text,
  gathering_is_partner_venue boolean,
  gathering_safe_first_date_space boolean,
  gathering_attendee_count integer,
  source_available boolean
)
language plpgsql
security definer
stable
set search_path = public, pg_catalog
as $$
declare
  v_can_manage boolean := public.can_manage_circle_pulse(p_circle_id, auth.uid());
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  if p_circle_id is null then
    raise exception 'circle_not_found';
  end if;

  if not v_can_manage
    and not public.is_circle_member(p_circle_id, auth.uid())
    and not public.is_circle_owner(p_circle_id, auth.uid()) then
    raise exception 'circle_membership_required' using errcode = '42501';
  end if;

  if coalesce(p_include_inactive, false) and not v_can_manage then
    raise exception 'host_required' using errcode = '42501';
  end if;

  return query
  with resolved as (
    select
      cpi.id,
      cpi.circle_id,
      cpi.item_type,
      case
        when cpi.item_type = 'prompt' then cp.title
        when cpi.item_type = 'gathering' then g.title
        else cpi.title
      end as title,
      cpi.subtitle,
      case
        when cpi.item_type = 'prompt' then cp.prompt
        when cpi.item_type = 'gathering' then g.description
        else cpi.body
      end as body,
      coalesce(cpi.image_url, g.poster_url, m.thumbnail_url) as image_url,
      coalesce(cpi.media_url, m.media_url) as media_url,
      coalesce(
        cpi.media_type,
        case m.type
          when 'photo' then 'image'
          when 'video' then 'video'
          else null
        end
      ) as media_type,
      cpi.prompt_id,
      cpi.gathering_id,
      cpi.moment_id,
      cpi.status,
      cpi.priority,
      coalesce(cpi.starts_at, cp.starts_at, g.starts_at) as starts_at,
      coalesce(cpi.expires_at, cp.expires_at) as expires_at,
      cpi.starts_at as editorial_starts_at,
      cpi.expires_at as editorial_expires_at,
      g.starts_at as gathering_starts_at,
      g.city as gathering_city,
      g.gathering_type,
      coalesce(g.is_partner_venue, false) as gathering_is_partner_venue,
      coalesce(g.safe_first_date_space, false) as gathering_safe_first_date_space,
      coalesce(g.attendee_count, 0)::integer as gathering_attendee_count,
      case cpi.item_type
        when 'prompt' then (
          cp.id is not null
          and cp.status = 'published'
          and (cp.starts_at is null or cp.starts_at <= timezone('utc'::text, now()))
          and (cp.expires_at is null or cp.expires_at > timezone('utc'::text, now()))
        )
        when 'gathering' then (
          g.id is not null
          and g.status = 'approved'
          and g.cancelled_at is null
          and g.starts_at > timezone('utc'::text, now())
        )
        when 'host_note' then nullif(btrim(coalesce(cpi.body, '')), '') is not null
        when 'media' then (
          (
            nullif(btrim(coalesce(cpi.media_url, '')), '') is not null
            and cpi.media_type in ('image', 'video', 'audio')
          )
          or (
            m.id is not null
            and m.is_deleted = false
            and m.expires_at > timezone('utc'::text, now())
            and nullif(btrim(coalesce(m.media_url, '')), '') is not null
            and public.can_view_moment(m.id)
          )
        )
        else false
      end as source_available
    from public.circle_pulse_items cpi
    left join public.circle_prompts cp on cp.id = cpi.prompt_id and cp.circle_id = cpi.circle_id
    left join public.gatherings g on g.id = cpi.gathering_id and g.circle_id = cpi.circle_id
    left join public.moments m on m.id = cpi.moment_id
    where cpi.circle_id = p_circle_id
  )
  select
    r.id,
    r.circle_id,
    r.item_type,
    r.title,
    r.subtitle,
    r.body,
    r.image_url,
    r.media_url,
    r.media_type,
    r.prompt_id,
    r.gathering_id,
    r.moment_id,
    r.status,
    r.priority,
    r.starts_at,
    r.expires_at,
    coalesce((
      select count(*)::integer
      from public.circle_pulse_comments cpc
      where cpc.pulse_item_id = r.id
        and cpc.status = 'active'
    ), 0) as comment_count,
    r.gathering_starts_at,
    r.gathering_city,
    r.gathering_type,
    r.gathering_is_partner_venue,
    r.gathering_safe_first_date_space,
    r.gathering_attendee_count,
    r.source_available
  from resolved r
  where (
      coalesce(p_include_inactive, false)
      or (
        r.status = 'active'
        and (r.editorial_starts_at is null or r.editorial_starts_at <= timezone('utc'::text, now()))
        and (r.editorial_expires_at is null or r.editorial_expires_at > timezone('utc'::text, now()))
        and r.source_available
      )
    )
  order by r.priority desc, r.starts_at desc nulls last, r.id desc;
end;
$$;

revoke all on function public.rpc_get_circle_pulse_comments(uuid, integer) from public;
revoke all on function public.rpc_create_circle_pulse_comment(uuid, uuid, text, uuid) from public;
revoke all on function public.rpc_delete_circle_pulse_comment(uuid, uuid) from public;
revoke all on function public.rpc_report_circle_pulse_comment(uuid, uuid, text) from public;

grant execute on function public.rpc_get_circle_pulse_comments(uuid, integer) to authenticated;
grant execute on function public.rpc_create_circle_pulse_comment(uuid, uuid, text, uuid) to authenticated;
grant execute on function public.rpc_delete_circle_pulse_comment(uuid, uuid) to authenticated;
grant execute on function public.rpc_report_circle_pulse_comment(uuid, uuid, text) to authenticated;
