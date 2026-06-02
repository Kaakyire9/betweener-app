create table if not exists public.circle_love_seats (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references public.circles(id) on delete cascade,
  featured_profile_id uuid not null references public.profiles(id) on delete cascade,
  nominated_by_profile_id uuid references public.profiles(id) on delete set null,
  approved_by_profile_id uuid references public.profiles(id) on delete set null,
  status text not null default 'pending_user_approval',
  quote text,
  reason text,
  starts_at timestamptz,
  ends_at timestamptz,
  responded_at timestamptz,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  constraint circle_love_seats_status_valid check (
    status in ('pending_user_approval', 'approved', 'active', 'declined', 'ended', 'archived')
  ),
  constraint circle_love_seats_quote_length check (
    quote is null or char_length(btrim(quote)) between 1 and 320
  ),
  constraint circle_love_seats_reason_length check (
    reason is null or char_length(btrim(reason)) <= 500
  ),
  constraint circle_love_seats_time_valid check (
    ends_at is null or starts_at is null or ends_at > starts_at
  )
);

create index if not exists circle_love_seats_circle_idx
  on public.circle_love_seats (circle_id, status, created_at desc);

create index if not exists circle_love_seats_featured_profile_idx
  on public.circle_love_seats (featured_profile_id, status, created_at desc);

create unique index if not exists circle_love_seats_profile_open_unique_idx
  on public.circle_love_seats (circle_id, featured_profile_id)
  where status in ('pending_user_approval', 'approved', 'active');

create unique index if not exists circle_love_seats_circle_active_unique_idx
  on public.circle_love_seats (circle_id)
  where status = 'active';

create unique index if not exists circle_love_seats_circle_open_unique_idx
  on public.circle_love_seats (circle_id)
  where status in ('pending_user_approval', 'approved', 'active');

drop trigger if exists circle_love_seats_set_updated_at on public.circle_love_seats;
create trigger circle_love_seats_set_updated_at
before update on public.circle_love_seats
for each row execute function public.set_updated_at();

alter table public.circle_love_seats enable row level security;
revoke all on public.circle_love_seats from anon, authenticated;

alter table public.circle_pulse_items
  add column if not exists love_seat_id uuid references public.circle_love_seats(id) on delete set null;

alter table public.circle_pulse_items
  drop constraint if exists circle_pulse_items_type_valid;

alter table public.circle_pulse_items
  add constraint circle_pulse_items_type_valid check (
    item_type in ('prompt', 'gathering', 'host_note', 'media', 'love_seat')
  );

alter table public.circle_pulse_items
  drop constraint if exists circle_pulse_items_source_valid;

alter table public.circle_pulse_items
  add constraint circle_pulse_items_source_valid check (
    (item_type = 'prompt' and prompt_id is not null and gathering_id is null and moment_id is null and love_seat_id is null)
    or (item_type = 'gathering' and gathering_id is not null and prompt_id is null and moment_id is null and love_seat_id is null)
    or (item_type = 'host_note' and prompt_id is null and gathering_id is null and moment_id is null and love_seat_id is null and nullif(btrim(coalesce(body, '')), '') is not null)
    or (
      item_type = 'media'
      and prompt_id is null
      and gathering_id is null
      and love_seat_id is null
      and (moment_id is not null or nullif(btrim(coalesce(media_url, '')), '') is not null)
    )
    or (
      item_type = 'love_seat'
      and love_seat_id is not null
      and prompt_id is null
      and gathering_id is null
      and moment_id is null
    )
  );

create unique index if not exists circle_pulse_items_love_seat_open_unique_idx
  on public.circle_pulse_items (circle_id, love_seat_id)
  where love_seat_id is not null and status in ('draft', 'active');

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

create or replace function public.rpc_get_my_circle_love_seat_nominations(
  p_profile_id uuid,
  p_circle_id uuid default null
)
returns table (
  id uuid,
  circle_id uuid,
  circle_name text,
  featured_profile_id uuid,
  nominated_by_profile_id uuid,
  nominator_name text,
  quote text,
  reason text,
  status text,
  created_at timestamptz
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

  return query
  select
    cls.id,
    cls.circle_id,
    c.name as circle_name,
    cls.featured_profile_id,
    cls.nominated_by_profile_id,
    coalesce(nullif(btrim(nominator.full_name), ''), 'Circle host') as nominator_name,
    cls.quote,
    cls.reason,
    cls.status,
    cls.created_at
  from public.circle_love_seats cls
  join public.circles c on c.id = cls.circle_id
  left join public.profiles nominator on nominator.id = cls.nominated_by_profile_id
  where cls.featured_profile_id = p_profile_id
    and cls.status = 'pending_user_approval'
    and (p_circle_id is null or cls.circle_id = p_circle_id)
  order by cls.created_at desc;
end;
$$;

create or replace function public.rpc_respond_circle_love_seat(
  p_love_seat_id uuid,
  p_profile_id uuid,
  p_accept boolean
)
returns public.circle_love_seats
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_love_seat public.circle_love_seats%rowtype;
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
    into v_love_seat
  from public.circle_love_seats cls
  where cls.id = p_love_seat_id
  for update;

  if v_love_seat.id is null then
    raise exception 'love_seat_not_found';
  end if;

  if v_love_seat.featured_profile_id <> p_profile_id then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  if v_love_seat.status <> 'pending_user_approval' then
    raise exception 'love_seat_already_answered';
  end if;

  if coalesce(p_accept, false) and exists (
    select 1
    from public.circle_love_seats cls
    where cls.circle_id = v_love_seat.circle_id
      and cls.status = 'active'
      and cls.id <> v_love_seat.id
  ) then
    raise exception 'circle_love_seat_active';
  end if;

  update public.circle_love_seats
  set status = case when coalesce(p_accept, false) then 'active' else 'declined' end,
      approved_by_profile_id = case when coalesce(p_accept, false) then p_profile_id else null end,
      starts_at = case when coalesce(p_accept, false) then timezone('utc'::text, now()) else starts_at end,
      responded_at = timezone('utc'::text, now())
  where id = p_love_seat_id
  returning * into v_love_seat;

  if coalesce(p_accept, false) then
    insert into public.circle_pulse_items (
      circle_id,
      item_type,
      love_seat_id,
      title,
      body,
      status,
      priority,
      starts_at,
      created_by_profile_id,
      created_by_user_id
    )
    values (
      v_love_seat.circle_id,
      'love_seat',
      v_love_seat.id,
      'Love Seat',
      v_love_seat.quote,
      'active',
      100,
      v_love_seat.starts_at,
      v_love_seat.nominated_by_profile_id,
      auth.uid()
    );
  end if;

  return v_love_seat;
end;
$$;

create or replace function public.rpc_end_circle_love_seat(
  p_love_seat_id uuid,
  p_actor_profile_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_love_seat public.circle_love_seats%rowtype;
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

  select *
    into v_love_seat
  from public.circle_love_seats cls
  where cls.id = p_love_seat_id
    and cls.status = 'active'
  for update;

  if v_love_seat.id is null then
    raise exception 'active_love_seat_not_found';
  end if;

  if v_love_seat.featured_profile_id <> p_actor_profile_id
    and not public.can_manage_circle_pulse(v_love_seat.circle_id, auth.uid()) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  update public.circle_love_seats
  set status = 'ended',
      ends_at = timezone('utc'::text, now())
  where id = p_love_seat_id;

  update public.circle_pulse_items
  set status = 'archived',
      expires_at = timezone('utc'::text, now())
  where love_seat_id = p_love_seat_id
    and status = 'active';

  return true;
end;
$$;

drop function if exists public.rpc_get_circle_pulse_items(uuid, boolean);

create function public.rpc_get_circle_pulse_items(
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
  love_seat_id uuid,
  featured_profile_id uuid,
  featured_profile_name text,
  featured_profile_age integer,
  featured_profile_avatar_url text,
  featured_profile_location text,
  featured_profile_badge text,
  love_seat_quote text,
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
        when cpi.item_type = 'love_seat' then 'Love Seat'::text
        else cpi.title
      end as title,
      cpi.subtitle,
      case
        when cpi.item_type = 'prompt' then cp.prompt
        when cpi.item_type = 'gathering' then g.description
        when cpi.item_type = 'love_seat' then cls.quote
        else cpi.body
      end as body,
      coalesce(cpi.image_url, g.poster_url, m.thumbnail_url, featured.avatar_url) as image_url,
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
      cpi.love_seat_id,
      featured.id as featured_profile_id,
      featured.full_name as featured_profile_name,
      featured.age as featured_profile_age,
      featured.avatar_url as featured_profile_avatar_url,
      coalesce(featured.city, featured.region) as featured_profile_location,
      case when coalesce(featured.verification_level, 0) > 0 then 'Verified'::text else null end as featured_profile_badge,
      cls.quote as love_seat_quote,
      cpi.status,
      cpi.priority,
      coalesce(cpi.starts_at, cp.starts_at, g.starts_at, cls.starts_at) as starts_at,
      coalesce(cpi.expires_at, cp.expires_at, cls.ends_at) as expires_at,
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
        when 'love_seat' then (
          cls.id is not null
          and cls.status = 'active'
          and cls.approved_by_profile_id = cls.featured_profile_id
          and featured.id is not null
          and featured.deleted_at is null
          and featured_member.id is not null
          and (cls.starts_at is null or cls.starts_at <= timezone('utc'::text, now()))
          and (cls.ends_at is null or cls.ends_at > timezone('utc'::text, now()))
        )
        else false
      end as source_available
    from public.circle_pulse_items cpi
    left join public.circle_prompts cp on cp.id = cpi.prompt_id and cp.circle_id = cpi.circle_id
    left join public.gatherings g on g.id = cpi.gathering_id and g.circle_id = cpi.circle_id
    left join public.moments m on m.id = cpi.moment_id
    left join public.circle_love_seats cls on cls.id = cpi.love_seat_id and cls.circle_id = cpi.circle_id
    left join public.profiles featured on featured.id = cls.featured_profile_id
    left join public.circle_members featured_member
      on featured_member.circle_id = cpi.circle_id
     and featured_member.profile_id = featured.id
     and featured_member.status = 'active'
     and featured_member.is_visible is not false
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
    r.love_seat_id,
    r.featured_profile_id,
    r.featured_profile_name,
    r.featured_profile_age,
    r.featured_profile_avatar_url,
    r.featured_profile_location,
    r.featured_profile_badge,
    r.love_seat_quote,
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

revoke all on function public.rpc_nominate_circle_love_seat(uuid, uuid, uuid, text, text) from public;
revoke all on function public.rpc_get_my_circle_love_seat_nominations(uuid, uuid) from public;
revoke all on function public.rpc_respond_circle_love_seat(uuid, uuid, boolean) from public;
revoke all on function public.rpc_end_circle_love_seat(uuid, uuid) from public;
revoke all on function public.rpc_get_circle_pulse_items(uuid, boolean) from public;

grant execute on function public.rpc_nominate_circle_love_seat(uuid, uuid, uuid, text, text) to authenticated;
grant execute on function public.rpc_get_my_circle_love_seat_nominations(uuid, uuid) to authenticated;
grant execute on function public.rpc_respond_circle_love_seat(uuid, uuid, boolean) to authenticated;
grant execute on function public.rpc_end_circle_love_seat(uuid, uuid) to authenticated;
grant execute on function public.rpc_get_circle_pulse_items(uuid, boolean) to authenticated;
