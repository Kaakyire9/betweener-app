create table if not exists public.circle_pulse_discussion_reads (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references public.circles(id) on delete cascade,
  pulse_item_id uuid not null references public.circle_pulse_items(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  last_seen_comment_id uuid references public.circle_pulse_comments(id) on delete set null,
  last_seen_at timestamptz not null default timezone('utc'::text, now()),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  constraint circle_pulse_discussion_reads_unique_profile unique (pulse_item_id, profile_id)
);

create index if not exists circle_pulse_discussion_reads_circle_profile_idx
  on public.circle_pulse_discussion_reads (circle_id, profile_id, updated_at desc);

create index if not exists circle_pulse_discussion_reads_user_idx
  on public.circle_pulse_discussion_reads (user_id, updated_at desc);

drop trigger if exists circle_pulse_discussion_reads_set_updated_at on public.circle_pulse_discussion_reads;
create trigger circle_pulse_discussion_reads_set_updated_at
before update on public.circle_pulse_discussion_reads
for each row execute function public.set_updated_at();

alter table public.circle_pulse_discussion_reads enable row level security;
revoke all on public.circle_pulse_discussion_reads from anon, authenticated;

create or replace function public.rpc_get_circle_pulse_discussion_read_state(
  p_pulse_item_id uuid,
  p_profile_id uuid
)
returns table (
  pulse_item_id uuid,
  last_seen_comment_id uuid,
  last_seen_at timestamptz,
  unread_count integer
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

  if not exists (
    select 1
    from public.profiles p
    where p.id = p_profile_id
      and p.user_id = auth.uid()
      and p.deleted_at is null
  ) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select cpi.circle_id
    into v_circle_id
  from public.circle_pulse_items cpi
  where cpi.id = p_pulse_item_id
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
  with read_state as (
    select dr.last_seen_comment_id, dr.last_seen_at
    from public.circle_pulse_discussion_reads dr
    where dr.pulse_item_id = p_pulse_item_id
      and dr.profile_id = p_profile_id
    limit 1
  )
  select
    p_pulse_item_id,
    rs.last_seen_comment_id,
    rs.last_seen_at,
    coalesce((
      select count(*)::integer
      from public.circle_pulse_comments cpc
      where cpc.pulse_item_id = p_pulse_item_id
        and cpc.status = 'active'
        and cpc.user_id <> auth.uid()
        and cpc.created_at > coalesce(rs.last_seen_at, '-infinity'::timestamptz)
    ), 0) as unread_count
  from read_state rs
  union all
  select
    p_pulse_item_id,
    null::uuid,
    null::timestamptz,
    coalesce((
      select count(*)::integer
      from public.circle_pulse_comments cpc
      where cpc.pulse_item_id = p_pulse_item_id
        and cpc.status = 'active'
        and cpc.user_id <> auth.uid()
    ), 0) as unread_count
  where not exists (select 1 from read_state);
end;
$$;

create or replace function public.rpc_get_circle_pulse_discussion_reads(
  p_circle_id uuid,
  p_profile_id uuid
)
returns table (
  pulse_item_id uuid,
  last_seen_comment_id uuid,
  last_seen_at timestamptz,
  unread_count integer
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
    where p.id = p_profile_id
      and p.user_id = auth.uid()
      and p.deleted_at is null
  ) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  if not public.can_manage_circle_pulse(p_circle_id, auth.uid())
    and not public.is_circle_member(p_circle_id, auth.uid())
    and not public.is_circle_owner(p_circle_id, auth.uid()) then
    raise exception 'circle_membership_required' using errcode = '42501';
  end if;

  return query
  select
    cpi.id as pulse_item_id,
    dr.last_seen_comment_id,
    dr.last_seen_at,
    coalesce((
      select count(*)::integer
      from public.circle_pulse_comments cpc
      where cpc.pulse_item_id = cpi.id
        and cpc.status = 'active'
        and cpc.user_id <> auth.uid()
        and cpc.created_at > coalesce(dr.last_seen_at, '-infinity'::timestamptz)
    ), 0) as unread_count
  from public.circle_pulse_items cpi
  left join public.circle_pulse_discussion_reads dr
    on dr.pulse_item_id = cpi.id
   and dr.profile_id = p_profile_id
  where cpi.circle_id = p_circle_id
    and (
      public.can_manage_circle_pulse(p_circle_id, auth.uid())
      or (
        cpi.status = 'active'
        and (cpi.starts_at is null or cpi.starts_at <= timezone('utc'::text, now()))
        and (cpi.expires_at is null or cpi.expires_at > timezone('utc'::text, now()))
      )
    );
end;
$$;

create or replace function public.rpc_mark_circle_pulse_discussion_seen(
  p_pulse_item_id uuid,
  p_profile_id uuid,
  p_last_seen_comment_id uuid default null,
  p_last_seen_at timestamptz default null
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_circle_id uuid;
  v_last_seen_at timestamptz := coalesce(p_last_seen_at, timezone('utc'::text, now()));
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

  select cpi.circle_id
    into v_circle_id
  from public.circle_pulse_items cpi
  where cpi.id = p_pulse_item_id
  limit 1;

  if v_circle_id is null then
    raise exception 'pulse_item_not_found';
  end if;

  if not public.can_manage_circle_pulse(v_circle_id, auth.uid())
    and not public.is_circle_member(v_circle_id, auth.uid())
    and not public.is_circle_owner(v_circle_id, auth.uid()) then
    raise exception 'circle_membership_required' using errcode = '42501';
  end if;

  if p_last_seen_comment_id is not null and not exists (
    select 1
    from public.circle_pulse_comments cpc
    where cpc.id = p_last_seen_comment_id
      and cpc.pulse_item_id = p_pulse_item_id
      and cpc.status = 'active'
  ) then
    raise exception 'comment_not_found';
  end if;

  insert into public.circle_pulse_discussion_reads (
    circle_id,
    pulse_item_id,
    profile_id,
    user_id,
    last_seen_comment_id,
    last_seen_at
  )
  values (
    v_circle_id,
    p_pulse_item_id,
    p_profile_id,
    auth.uid(),
    p_last_seen_comment_id,
    v_last_seen_at
  )
  on conflict (pulse_item_id, profile_id)
  do update
    set circle_id = excluded.circle_id,
        user_id = excluded.user_id,
        last_seen_comment_id = case
          when public.circle_pulse_discussion_reads.last_seen_at <= excluded.last_seen_at
            then excluded.last_seen_comment_id
          else public.circle_pulse_discussion_reads.last_seen_comment_id
        end,
        last_seen_at = greatest(public.circle_pulse_discussion_reads.last_seen_at, excluded.last_seen_at),
        updated_at = timezone('utc'::text, now());

  return true;
end;
$$;

revoke all on function public.rpc_get_circle_pulse_discussion_read_state(uuid, uuid) from public;
revoke all on function public.rpc_get_circle_pulse_discussion_reads(uuid, uuid) from public;
revoke all on function public.rpc_mark_circle_pulse_discussion_seen(uuid, uuid, uuid, timestamptz) from public;

grant execute on function public.rpc_get_circle_pulse_discussion_read_state(uuid, uuid) to authenticated;
grant execute on function public.rpc_get_circle_pulse_discussion_reads(uuid, uuid) to authenticated;
grant execute on function public.rpc_mark_circle_pulse_discussion_seen(uuid, uuid, uuid, timestamptz) to authenticated;
