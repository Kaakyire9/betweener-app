create table if not exists public.circle_pulse_items (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references public.circles(id) on delete cascade,
  item_type text not null,
  prompt_id uuid references public.circle_prompts(id) on delete set null,
  gathering_id uuid references public.gatherings(id) on delete set null,
  moment_id uuid references public.moments(id) on delete set null,
  title text,
  subtitle text,
  body text,
  image_url text,
  media_url text,
  media_type text,
  status text not null default 'active',
  priority integer not null default 0,
  starts_at timestamptz,
  expires_at timestamptz,
  created_by_profile_id uuid references public.profiles(id) on delete set null,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  constraint circle_pulse_items_type_valid check (
    item_type in ('prompt', 'gathering', 'host_note', 'media')
  ),
  constraint circle_pulse_items_status_valid check (
    status in ('draft', 'active', 'expired', 'archived')
  ),
  constraint circle_pulse_items_media_type_valid check (
    media_type is null or media_type in ('image', 'video', 'audio')
  ),
  constraint circle_pulse_items_title_length check (
    title is null or char_length(btrim(title)) between 1 and 140
  ),
  constraint circle_pulse_items_subtitle_length check (
    subtitle is null or char_length(btrim(subtitle)) <= 240
  ),
  constraint circle_pulse_items_body_length check (
    body is null or char_length(btrim(body)) <= 2000
  ),
  constraint circle_pulse_items_time_valid check (
    expires_at is null or starts_at is null or expires_at > starts_at
  ),
  constraint circle_pulse_items_source_valid check (
    (item_type = 'prompt' and prompt_id is not null and gathering_id is null and moment_id is null)
    or (item_type = 'gathering' and gathering_id is not null and prompt_id is null and moment_id is null)
    or (item_type = 'host_note' and prompt_id is null and gathering_id is null and moment_id is null and nullif(btrim(coalesce(body, '')), '') is not null)
    or (
      item_type = 'media'
      and prompt_id is null
      and gathering_id is null
      and (moment_id is not null or nullif(btrim(coalesce(media_url, '')), '') is not null)
    )
  )
);

create index if not exists circle_pulse_items_circle_active_idx
  on public.circle_pulse_items (circle_id, status, priority desc, starts_at desc, created_at desc);

create index if not exists circle_pulse_items_type_idx
  on public.circle_pulse_items (item_type, status);

create unique index if not exists circle_pulse_items_prompt_open_unique_idx
  on public.circle_pulse_items (circle_id, prompt_id)
  where prompt_id is not null and status in ('draft', 'active');

create unique index if not exists circle_pulse_items_gathering_open_unique_idx
  on public.circle_pulse_items (circle_id, gathering_id)
  where gathering_id is not null and status in ('draft', 'active');

create unique index if not exists circle_pulse_items_moment_open_unique_idx
  on public.circle_pulse_items (circle_id, moment_id)
  where moment_id is not null and status in ('draft', 'active');

create unique index if not exists circle_pulse_items_host_note_active_unique_idx
  on public.circle_pulse_items (circle_id, item_type)
  where item_type = 'host_note' and status = 'active';

drop trigger if exists circle_pulse_items_set_updated_at on public.circle_pulse_items;
create trigger circle_pulse_items_set_updated_at
before update on public.circle_pulse_items
for each row execute function public.set_updated_at();

create or replace function public.can_manage_circle_pulse(
  p_circle_id uuid,
  p_user_id uuid
)
returns boolean
language plpgsql
security definer
stable
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_exists boolean := false;
begin
  if p_circle_id is null or p_user_id is null then
    return false;
  end if;

  if public.is_admin_user(p_user_id) or public.is_circle_owner(p_circle_id, p_user_id) then
    return true;
  end if;

  select exists (
    select 1
    from public.circle_members cm
    join public.profiles p on p.id = cm.profile_id
    where cm.circle_id = p_circle_id
      and p.user_id = p_user_id
      and cm.status = 'active'
      and lower(cm.role) in ('leader', 'host', 'admin', 'moderator')
  ) into v_exists;

  return coalesce(v_exists, false);
end;
$$;

revoke all on function public.can_manage_circle_pulse(uuid, uuid) from public;
grant execute on function public.can_manage_circle_pulse(uuid, uuid) to authenticated;

alter table public.circle_pulse_items enable row level security;

drop policy if exists circle_pulse_items_select_visible on public.circle_pulse_items;
create policy circle_pulse_items_select_visible
on public.circle_pulse_items
for select
to authenticated
using (
  public.can_manage_circle_pulse(circle_id, auth.uid())
  or (
    status = 'active'
    and (starts_at is null or starts_at <= timezone('utc'::text, now()))
    and (expires_at is null or expires_at > timezone('utc'::text, now()))
    and (
      public.is_circle_member(circle_id, auth.uid())
      or public.is_circle_owner(circle_id, auth.uid())
    )
  )
);

revoke all on public.circle_pulse_items from anon, authenticated;

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
    0::integer as comment_count,
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

create or replace function public.rpc_upsert_circle_pulse_item(
  p_circle_id uuid,
  p_actor_profile_id uuid,
  p_item_type text,
  p_item_id uuid default null,
  p_prompt_id uuid default null,
  p_gathering_id uuid default null,
  p_moment_id uuid default null,
  p_title text default null,
  p_subtitle text default null,
  p_body text default null,
  p_image_url text default null,
  p_media_url text default null,
  p_media_type text default null,
  p_priority integer default 0,
  p_starts_at timestamptz default null,
  p_expires_at timestamptz default null,
  p_status text default 'active'
)
returns public.circle_pulse_items
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_item public.circle_pulse_items%rowtype;
  v_circle public.circles%rowtype;
  v_item_type text := lower(coalesce(p_item_type, ''));
  v_status text := lower(coalesce(p_status, 'active'));
  v_title text := nullif(btrim(coalesce(p_title, '')), '');
  v_subtitle text := nullif(btrim(coalesce(p_subtitle, '')), '');
  v_body text := nullif(btrim(coalesce(p_body, '')), '');
  v_image_url text := nullif(btrim(coalesce(p_image_url, '')), '');
  v_media_url text := nullif(btrim(coalesce(p_media_url, '')), '');
  v_media_type text := nullif(lower(btrim(coalesce(p_media_type, ''))), '');
  v_source_available boolean := false;
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

  select *
    into v_circle
  from public.circles c
  where c.id = p_circle_id
    and c.archived_at is null
  limit 1;

  if v_circle.id is null then
    raise exception 'circle_not_found';
  end if;

  if v_item_type not in ('prompt', 'gathering', 'host_note', 'media') then
    raise exception 'invalid_item_type';
  end if;

  if v_status not in ('draft', 'active', 'expired', 'archived') then
    raise exception 'invalid_status';
  end if;

  if p_expires_at is not null and p_starts_at is not null and p_expires_at <= p_starts_at then
    raise exception 'invalid_expiry';
  end if;

  if v_item_type = 'prompt' then
    select exists (
      select 1
      from public.circle_prompts cp
      where cp.id = p_prompt_id
        and cp.circle_id = p_circle_id
        and (
          v_status <> 'active'
          or (
            cp.status = 'published'
            and (cp.starts_at is null or cp.starts_at <= timezone('utc'::text, now()))
            and (cp.expires_at is null or cp.expires_at > timezone('utc'::text, now()))
          )
        )
    ) into v_source_available;
  elsif v_item_type = 'gathering' then
    select exists (
      select 1
      from public.gatherings g
      where g.id = p_gathering_id
        and g.circle_id = p_circle_id
        and (
          v_status <> 'active'
          or (
            g.status = 'approved'
            and g.cancelled_at is null
            and g.starts_at > timezone('utc'::text, now())
          )
        )
    ) into v_source_available;
  elsif v_item_type = 'host_note' then
    v_title := coalesce(v_title, 'Host note');
    v_body := coalesce(v_body, nullif(btrim(coalesce(v_circle.host_note, '')), ''));
    v_source_available := v_body is not null;
  else
    if v_media_type is not null and v_media_type not in ('image', 'video', 'audio') then
      raise exception 'invalid_media_type';
    end if;

    if v_media_url is not null then
      v_source_available := v_media_type in ('image', 'video', 'audio');
    elsif p_moment_id is not null then
      select exists (
        select 1
        from public.moments m
        where m.id = p_moment_id
          and m.is_deleted = false
          and m.expires_at > timezone('utc'::text, now())
          and nullif(btrim(coalesce(m.media_url, '')), '') is not null
          and public.can_view_moment(m.id)
      ) into v_source_available;
    end if;
  end if;

  if not v_source_available then
    raise exception 'pulse_source_unavailable';
  end if;

  if p_item_id is null then
    insert into public.circle_pulse_items (
      circle_id,
      item_type,
      prompt_id,
      gathering_id,
      moment_id,
      title,
      subtitle,
      body,
      image_url,
      media_url,
      media_type,
      status,
      priority,
      starts_at,
      expires_at,
      created_by_profile_id,
      created_by_user_id
    )
    values (
      p_circle_id,
      v_item_type,
      case when v_item_type = 'prompt' then p_prompt_id else null end,
      case when v_item_type = 'gathering' then p_gathering_id else null end,
      case when v_item_type = 'media' then p_moment_id else null end,
      v_title,
      v_subtitle,
      v_body,
      v_image_url,
      v_media_url,
      v_media_type,
      v_status,
      coalesce(p_priority, 0),
      p_starts_at,
      p_expires_at,
      p_actor_profile_id,
      auth.uid()
    )
    returning * into v_item;
  else
    update public.circle_pulse_items cpi
    set item_type = v_item_type,
        prompt_id = case when v_item_type = 'prompt' then p_prompt_id else null end,
        gathering_id = case when v_item_type = 'gathering' then p_gathering_id else null end,
        moment_id = case when v_item_type = 'media' then p_moment_id else null end,
        title = v_title,
        subtitle = v_subtitle,
        body = v_body,
        image_url = v_image_url,
        media_url = v_media_url,
        media_type = v_media_type,
        status = v_status,
        priority = coalesce(p_priority, 0),
        starts_at = p_starts_at,
        expires_at = p_expires_at
    where cpi.id = p_item_id
      and cpi.circle_id = p_circle_id
    returning * into v_item;

    if v_item.id is null then
      raise exception 'pulse_item_not_found';
    end if;
  end if;

  return v_item;
end;
$$;

create or replace function public.rpc_reorder_circle_pulse_items(
  p_circle_id uuid,
  p_actor_profile_id uuid,
  p_item_ids uuid[]
)
returns integer
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_updated integer := 0;
  v_expected integer := coalesce(cardinality(p_item_ids), 0);
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

  if v_expected = 0
    or (select count(distinct rows.item_id) from unnest(p_item_ids) as rows(item_id)) <> v_expected
    or (
      select count(*)
      from public.circle_pulse_items cpi
      where cpi.circle_id = p_circle_id
        and cpi.id = any(p_item_ids)
        and cpi.status <> 'archived'
    ) <> v_expected then
    raise exception 'invalid_pulse_order';
  end if;

  with ordered as (
    select item_id, ordinality
    from unnest(p_item_ids) with ordinality as rows(item_id, ordinality)
  )
  update public.circle_pulse_items cpi
  set priority = v_expected - ordered.ordinality + 1
  from ordered
  where cpi.circle_id = p_circle_id
    and cpi.id = ordered.item_id;

  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

create or replace function public.rpc_archive_circle_pulse_item(
  p_item_id uuid,
  p_actor_profile_id uuid
)
returns boolean
language plpgsql
security definer
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
    where p.id = p_actor_profile_id
      and p.user_id = auth.uid()
      and p.deleted_at is null
  ) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select cpi.circle_id
    into v_circle_id
  from public.circle_pulse_items cpi
  where cpi.id = p_item_id
  for update;

  if v_circle_id is null then
    raise exception 'pulse_item_not_found';
  end if;

  if not public.can_manage_circle_pulse(v_circle_id, auth.uid()) then
    raise exception 'host_required' using errcode = '42501';
  end if;

  update public.circle_pulse_items
  set status = 'archived'
  where id = p_item_id;

  return found;
end;
$$;

create or replace function public.rpc_delete_circle_pulse_item(
  p_item_id uuid,
  p_actor_profile_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_circle_id uuid;
  v_status text;
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

  select cpi.circle_id, cpi.status
    into v_circle_id, v_status
  from public.circle_pulse_items cpi
  where cpi.id = p_item_id
  for update;

  if v_circle_id is null then
    raise exception 'pulse_item_not_found';
  end if;

  if not public.can_manage_circle_pulse(v_circle_id, auth.uid()) then
    raise exception 'host_required' using errcode = '42501';
  end if;

  if v_status = 'active' then
    raise exception 'archive_active_pulse_item_first';
  end if;

  delete from public.circle_pulse_items
  where id = p_item_id;

  return found;
end;
$$;

revoke all on function public.rpc_get_circle_pulse_items(uuid, boolean) from public;
revoke all on function public.rpc_upsert_circle_pulse_item(uuid, uuid, text, uuid, uuid, uuid, uuid, text, text, text, text, text, text, integer, timestamptz, timestamptz, text) from public;
revoke all on function public.rpc_reorder_circle_pulse_items(uuid, uuid, uuid[]) from public;
revoke all on function public.rpc_archive_circle_pulse_item(uuid, uuid) from public;
revoke all on function public.rpc_delete_circle_pulse_item(uuid, uuid) from public;

grant execute on function public.rpc_get_circle_pulse_items(uuid, boolean) to authenticated;
grant execute on function public.rpc_upsert_circle_pulse_item(uuid, uuid, text, uuid, uuid, uuid, uuid, text, text, text, text, text, text, integer, timestamptz, timestamptz, text) to authenticated;
grant execute on function public.rpc_reorder_circle_pulse_items(uuid, uuid, uuid[]) to authenticated;
grant execute on function public.rpc_archive_circle_pulse_item(uuid, uuid) to authenticated;
grant execute on function public.rpc_delete_circle_pulse_item(uuid, uuid) to authenticated;
