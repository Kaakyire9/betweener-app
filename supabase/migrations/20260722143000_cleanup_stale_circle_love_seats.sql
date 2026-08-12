create or replace function public.cleanup_stale_circle_love_seats(
  p_circle_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_now timestamptz := timezone('utc'::text, now());
  v_rows integer := 0;
begin
  with stale as (
    select
      cls.id,
      case
        when cls.status = 'active' then 'ended'
        else 'archived'
      end as next_status
    from public.circle_love_seats cls
    left join public.profiles featured
      on featured.id = cls.featured_profile_id
    left join public.circle_members featured_member
      on featured_member.circle_id = cls.circle_id
     and featured_member.profile_id = cls.featured_profile_id
     and featured_member.status = 'active'
     and featured_member.is_visible is not false
    where cls.status in ('pending_user_approval', 'approved', 'active')
      and (p_circle_id is null or cls.circle_id = p_circle_id)
      and (
        featured.id is null
        or featured.deleted_at is not null
        or featured_member.profile_id is null
      )
  ),
  updated_love_seats as (
    update public.circle_love_seats cls
    set status = stale.next_status,
        responded_at = coalesce(cls.responded_at, v_now),
        ends_at = case
          when stale.next_status = 'ended' then coalesce(cls.ends_at, v_now)
          else cls.ends_at
        end
    from stale
    where cls.id = stale.id
    returning cls.id
  ),
  archived_items as (
    update public.circle_pulse_items cpi
    set status = 'archived',
        expires_at = coalesce(cpi.expires_at, v_now)
    where cpi.love_seat_id in (select id from updated_love_seats)
      and cpi.status in ('draft', 'active')
    returning cpi.id
  )
  select count(*)
    into v_rows
  from updated_love_seats;

  return v_rows;
end;
$$;

create or replace function public.rpc_nominate_circle_love_seat(
  p_circle_id uuid,
  p_actor_profile_id uuid,
  p_featured_profile_id uuid,
  p_quote text default null,
  p_reason text default null
)
returns public.circle_love_seats
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_love_seat public.circle_love_seats%rowtype;
  v_quote text := nullif(btrim(coalesce(p_quote, '')), '');
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
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

  if v_quote is not null and char_length(v_quote) > 320 then
    raise exception 'quote_too_long';
  end if;

  if v_reason is not null and char_length(v_reason) > 500 then
    raise exception 'reason_too_long';
  end if;

  perform public.cleanup_stale_circle_love_seats(p_circle_id);

  if exists (
    select 1
    from public.circle_love_seats cls
    where cls.circle_id = p_circle_id
      and cls.status = 'active'
  ) then
    raise exception 'circle_love_seat_active';
  end if;

  if not exists (
    select 1
    from public.circle_members cm
    join public.profiles p on p.id = cm.profile_id
    where cm.circle_id = p_circle_id
      and cm.profile_id = p_featured_profile_id
      and cm.status = 'active'
      and cm.is_visible is not false
      and p.deleted_at is null
  ) then
    raise exception 'featured_member_not_available';
  end if;

  insert into public.circle_love_seats (
    circle_id,
    featured_profile_id,
    nominated_by_profile_id,
    quote,
    reason
  )
  values (
    p_circle_id,
    p_featured_profile_id,
    p_actor_profile_id,
    v_quote,
    v_reason
  )
  returning * into v_love_seat;

  return v_love_seat;
end;
$$;

create or replace function public.rpc_list_circle_love_seats_for_host(
  p_circle_id uuid,
  p_actor_profile_id uuid
)
returns table (
  id uuid,
  circle_id uuid,
  featured_profile_id uuid,
  featured_profile_name text,
  featured_profile_avatar_url text,
  quote text,
  status text,
  created_at timestamptz,
  responded_at timestamptz
)
language plpgsql
security definer
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

  perform public.cleanup_stale_circle_love_seats(p_circle_id);

  return query
  select
    cls.id,
    cls.circle_id,
    cls.featured_profile_id,
    coalesce(nullif(btrim(featured.full_name), ''), 'Circle member') as featured_profile_name,
    featured.avatar_url as featured_profile_avatar_url,
    cls.quote,
    cls.status,
    cls.created_at,
    cls.responded_at
  from public.circle_love_seats cls
  join public.profiles featured on featured.id = cls.featured_profile_id
  where cls.circle_id = p_circle_id
    and cls.status in ('pending_user_approval', 'active')
  order by
    case cls.status when 'active' then 0 else 1 end,
    cls.created_at desc;
end;
$$;

revoke all on function public.cleanup_stale_circle_love_seats(uuid) from public;
grant execute on function public.cleanup_stale_circle_love_seats(uuid) to authenticated;
