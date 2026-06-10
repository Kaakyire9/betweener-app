alter table public.gatherings
  add column if not exists presentation_mode text not null default 'general',
  add column if not exists featured_profile_id uuid references public.profiles(id) on delete set null,
  add column if not exists seat_context text,
  add column if not exists host_created_for_member boolean not null default false;

alter table public.gatherings
  drop constraint if exists gatherings_presentation_mode_valid;

alter table public.gatherings
  add constraint gatherings_presentation_mode_valid
  check (presentation_mode in ('general', 'seat_linked'));

alter table public.gatherings
  drop constraint if exists gatherings_seat_context_valid;

alter table public.gatherings
  add constraint gatherings_seat_context_valid
  check (seat_context in ('welcome', 'love') or seat_context is null);

alter table public.gatherings
  drop constraint if exists gatherings_seat_link_valid;

alter table public.gatherings
  add constraint gatherings_seat_link_valid
  check (
    (presentation_mode = 'general' and featured_profile_id is null and seat_context is null)
    or (presentation_mode = 'seat_linked' and featured_profile_id is not null)
  );

create index if not exists gatherings_circle_status_starts_presentation_idx
  on public.gatherings (circle_id, status, starts_at, presentation_mode);

create index if not exists gatherings_featured_profile_idx
  on public.gatherings (featured_profile_id)
  where featured_profile_id is not null;

with matched as (
  select distinct on (g.id)
    g.id as gathering_id,
    p.id as profile_id,
    case
      when cls.id is not null then 'love'
      when cm.joined_at >= timezone('utc'::text, now()) - interval '14 days' then 'welcome'
      else null
    end as seat_context
  from public.gatherings g
  join public.circle_members cm
    on cm.circle_id = g.circle_id
   and cm.status = 'active'
   and cm.is_visible is not false
  join public.profiles p
    on p.id = cm.profile_id
   and p.deleted_at is null
  left join public.circle_love_seats cls
    on cls.circle_id = g.circle_id
   and cls.featured_profile_id = p.id
   and cls.status = 'active'
  where nullif(btrim(coalesce(g.poster_url, '')), '') is not null
    and nullif(btrim(coalesce(p.avatar_url, '')), '') is not null
    and btrim(g.poster_url) = btrim(p.avatar_url)
  order by g.id, case when cls.id is not null then 0 else 1 end, cm.joined_at desc nulls last, p.id
)
update public.gatherings g
set presentation_mode = 'seat_linked',
    featured_profile_id = matched.profile_id,
    seat_context = matched.seat_context,
    host_created_for_member = true,
    updated_at = timezone('utc'::text, now())
from matched
where g.id = matched.gathering_id
  and g.featured_profile_id is null;

update public.gatherings
set presentation_mode = 'general',
    seat_context = null,
    host_created_for_member = false,
    updated_at = timezone('utc'::text, now())
where presentation_mode = 'general'
  and (seat_context is not null or host_created_for_member is distinct from false);

drop function if exists public.rpc_create_gathering_request(
  uuid, text, text, text, text, text, text, text, text, text, text, text, text, timestamptz, timestamptz, text, integer, text[], text, text
);

create or replace function public.rpc_create_gathering_request(
  p_circle_id uuid default null,
  p_title text default null,
  p_description text default null,
  p_gathering_type text default 'physical',
  p_country_code text default null,
  p_country_name text default null,
  p_region text default null,
  p_city text default null,
  p_venue_name text default null,
  p_venue_address text default null,
  p_address_visibility text default 'attendees_only',
  p_online_url text default null,
  p_platform text default null,
  p_starts_at timestamptz default null,
  p_ends_at timestamptz default null,
  p_timezone text default null,
  p_max_attendees integer default null,
  p_tags text[] default '{}',
  p_safety_note text default null,
  p_poster_url text default null,
  p_presentation_mode text default 'general',
  p_featured_profile_id uuid default null,
  p_seat_context text default null,
  p_host_created_for_member boolean default false
)
returns public.gatherings
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_is_admin boolean;
  v_can_manage_circle boolean := false;
  v_title text := nullif(btrim(coalesce(p_title, '')), '');
  v_slug_base text;
  v_slug text;
  v_gathering public.gatherings;
  v_presentation_mode text := lower(coalesce(nullif(btrim(coalesce(p_presentation_mode, '')), ''), 'general'));
  v_featured_profile_id uuid := null;
  v_seat_context text := lower(nullif(btrim(coalesce(p_seat_context, '')), ''));
begin
  if v_user_id is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  if v_title is null or char_length(v_title) < 3 or char_length(v_title) > 120 then
    raise exception 'invalid_title';
  end if;

  if p_gathering_type not in ('online', 'physical', 'hybrid', 'partner_venue', 'livestream') then
    raise exception 'invalid_gathering_type';
  end if;

  if p_starts_at is null or p_starts_at <= timezone('utc'::text, now()) then
    raise exception 'invalid_start_time';
  end if;

  if p_ends_at is not null and p_ends_at <= p_starts_at then
    raise exception 'invalid_end_time';
  end if;

  if v_presentation_mode not in ('general', 'seat_linked') then
    raise exception 'invalid_presentation_mode';
  end if;

  if v_seat_context is not null and v_seat_context not in ('welcome', 'love') then
    raise exception 'invalid_seat_context';
  end if;

  select *
    into v_profile
  from public.profiles p
  where p.user_id = v_user_id
    and p.deleted_at is null
  limit 1;

  if v_profile.id is null then
    raise exception 'profile_not_found';
  end if;

  v_is_admin := public.is_admin_user(v_user_id);
  v_can_manage_circle := p_circle_id is not null and public.can_manage_circle_pulse(p_circle_id, v_user_id);

  if not v_is_admin and not v_can_manage_circle and not public.has_gold_entitlement(v_user_id, v_profile.id) then
    raise exception 'gold_required' using errcode = '42501';
  end if;

  if p_circle_id is not null and not exists (
    select 1
    from public.circles c
    where c.id = p_circle_id
      and (c.status = 'approved' or c.created_by_user_id = v_user_id or v_is_admin)
  ) then
    raise exception 'circle_not_found';
  end if;

  if v_presentation_mode = 'seat_linked' then
    if p_circle_id is null or p_featured_profile_id is null then
      raise exception 'invalid_seat_link';
    end if;

    select p.id
      into v_featured_profile_id
    from public.circle_members cm
    join public.profiles p
      on p.id = cm.profile_id
     and p.deleted_at is null
    where cm.circle_id = p_circle_id
      and cm.profile_id = p_featured_profile_id
      and cm.status = 'active'
      and cm.is_visible is not false
    limit 1;

    if v_featured_profile_id is null then
      raise exception 'featured_profile_unavailable';
    end if;
  else
    v_featured_profile_id := null;
    v_seat_context := null;
  end if;

  v_slug_base := public.slugify(v_title);
  v_slug := v_slug_base;
  while exists (select 1 from public.gatherings g where g.slug = v_slug) loop
    v_slug := v_slug_base || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);
  end loop;

  insert into public.gatherings (
    circle_id,
    title,
    slug,
    description,
    poster_url,
    presentation_mode,
    featured_profile_id,
    seat_context,
    host_created_for_member,
    gathering_type,
    status,
    country_code,
    country_name,
    region,
    city,
    venue_name,
    venue_address,
    address_visibility,
    online_url,
    platform,
    starts_at,
    ends_at,
    timezone,
    is_official,
    is_partner_venue,
    safe_first_date_space,
    max_attendees,
    created_by_profile_id,
    created_by_user_id,
    approved_by_admin_id,
    approved_at,
    tags,
    safety_note
  )
  values (
    p_circle_id,
    v_title,
    v_slug,
    nullif(btrim(coalesce(p_description, '')), ''),
    nullif(btrim(coalesce(p_poster_url, '')), ''),
    v_presentation_mode,
    v_featured_profile_id,
    v_seat_context,
    case when v_presentation_mode = 'seat_linked' then true else false end,
    p_gathering_type,
    case when v_is_admin then 'approved' else 'pending_review' end,
    upper(nullif(btrim(coalesce(p_country_code, '')), '')),
    nullif(btrim(coalesce(p_country_name, '')), ''),
    nullif(btrim(coalesce(p_region, '')), ''),
    nullif(btrim(coalesce(p_city, '')), ''),
    nullif(btrim(coalesce(p_venue_name, '')), ''),
    nullif(btrim(coalesce(p_venue_address, '')), ''),
    case
      when v_is_admin then coalesce(nullif(p_address_visibility, ''), 'attendees_only')
      when p_gathering_type in ('physical', 'hybrid', 'partner_venue') then 'attendees_only'
      else coalesce(nullif(p_address_visibility, ''), 'hidden')
    end,
    nullif(btrim(coalesce(p_online_url, '')), ''),
    nullif(btrim(coalesce(p_platform, '')), ''),
    p_starts_at,
    p_ends_at,
    p_timezone,
    v_is_admin,
    v_is_admin and p_gathering_type = 'partner_venue',
    false,
    p_max_attendees,
    v_profile.id,
    v_user_id,
    case when v_is_admin then v_user_id else null end,
    case when v_is_admin then timezone('utc'::text, now()) else null end,
    coalesce(p_tags, '{}'),
    nullif(btrim(coalesce(p_safety_note, '')), '')
  )
  returning * into v_gathering;

  return v_gathering;
end;
$$;

drop function if exists public.rpc_update_gathering_request(
  uuid, uuid, text, text, text, text, text, text, text, text, text, text, text, text, timestamptz, timestamptz, text, integer, text[], text, text
);

create or replace function public.rpc_update_gathering_request(
  p_gathering_id uuid,
  p_circle_id uuid default null,
  p_title text default null,
  p_description text default null,
  p_gathering_type text default 'physical',
  p_country_code text default null,
  p_country_name text default null,
  p_region text default null,
  p_city text default null,
  p_venue_name text default null,
  p_venue_address text default null,
  p_address_visibility text default 'attendees_only',
  p_online_url text default null,
  p_platform text default null,
  p_starts_at timestamptz default null,
  p_ends_at timestamptz default null,
  p_timezone text default null,
  p_max_attendees integer default null,
  p_tags text[] default '{}',
  p_safety_note text default null,
  p_poster_url text default null,
  p_presentation_mode text default null,
  p_featured_profile_id uuid default null,
  p_seat_context text default null,
  p_host_created_for_member boolean default null
)
returns public.gatherings
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_is_admin boolean;
  v_can_manage_circle boolean := false;
  v_title text := nullif(btrim(coalesce(p_title, '')), '');
  v_slug_base text;
  v_slug text;
  v_gathering public.gatherings%rowtype;
  v_target_circle_id uuid;
  v_presentation_mode text;
  v_featured_profile_id uuid;
  v_seat_context text;
begin
  if v_user_id is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  if p_gathering_id is null then
    raise exception 'gathering_not_found';
  end if;

  if v_title is null or char_length(v_title) < 3 or char_length(v_title) > 120 then
    raise exception 'invalid_title';
  end if;

  if p_gathering_type not in ('online', 'physical', 'hybrid', 'partner_venue', 'livestream') then
    raise exception 'invalid_gathering_type';
  end if;

  if p_starts_at is null or p_starts_at <= timezone('utc'::text, now()) then
    raise exception 'invalid_start_time';
  end if;

  if p_ends_at is not null and p_ends_at <= p_starts_at then
    raise exception 'invalid_end_time';
  end if;

  select *
    into v_profile
  from public.profiles p
  where p.user_id = v_user_id
    and p.deleted_at is null
  limit 1;

  if v_profile.id is null then
    raise exception 'profile_not_found';
  end if;

  v_is_admin := public.is_admin_user(v_user_id);

  select *
    into v_gathering
  from public.gatherings g
  where g.id = p_gathering_id
    and (
      v_is_admin
      or g.created_by_user_id = v_user_id
      or g.created_by_profile_id = v_profile.id
      or (g.circle_id is not null and public.can_manage_circle_pulse(g.circle_id, v_user_id))
    )
  for update;

  if v_gathering.id is null then
    raise exception 'gathering_not_found';
  end if;

  v_can_manage_circle := v_gathering.circle_id is not null and public.can_manage_circle_pulse(v_gathering.circle_id, v_user_id);

  if not v_is_admin and not v_can_manage_circle and not public.has_gold_entitlement(v_user_id, v_profile.id) then
    raise exception 'gold_required' using errcode = '42501';
  end if;

  if not v_is_admin and v_gathering.status not in ('draft', 'pending_review', 'approved', 'rejected') then
    raise exception 'gathering_not_editable';
  end if;

  v_target_circle_id := coalesce(p_circle_id, v_gathering.circle_id);

  if v_target_circle_id is not null and not exists (
    select 1
    from public.circles c
    where c.id = v_target_circle_id
      and (c.status = 'approved' or c.created_by_user_id = v_user_id or v_is_admin)
  ) then
    raise exception 'circle_not_found';
  end if;

  v_presentation_mode := lower(coalesce(nullif(btrim(coalesce(p_presentation_mode, '')), ''), v_gathering.presentation_mode, 'general'));
  v_seat_context := lower(coalesce(nullif(btrim(coalesce(p_seat_context, '')), ''), v_gathering.seat_context));
  v_featured_profile_id := case
    when p_featured_profile_id is not null then p_featured_profile_id
    else v_gathering.featured_profile_id
  end;

  if v_presentation_mode not in ('general', 'seat_linked') then
    raise exception 'invalid_presentation_mode';
  end if;

  if v_seat_context is not null and v_seat_context not in ('welcome', 'love') then
    raise exception 'invalid_seat_context';
  end if;

  if v_presentation_mode = 'seat_linked' then
    if v_target_circle_id is null or v_featured_profile_id is null then
      raise exception 'invalid_seat_link';
    end if;

    select p.id
      into v_featured_profile_id
    from public.circle_members cm
    join public.profiles p
      on p.id = cm.profile_id
     and p.deleted_at is null
    where cm.circle_id = v_target_circle_id
      and cm.profile_id = v_featured_profile_id
      and cm.status = 'active'
      and cm.is_visible is not false
    limit 1;

    if v_featured_profile_id is null then
      raise exception 'featured_profile_unavailable';
    end if;
  else
    v_featured_profile_id := null;
    v_seat_context := null;
  end if;

  v_slug_base := public.slugify(v_title);
  v_slug := case
    when v_gathering.slug is null or public.slugify(coalesce(v_gathering.title, '')) <> v_slug_base then v_slug_base
    else v_gathering.slug
  end;

  while exists (
    select 1
    from public.gatherings g
    where g.id <> p_gathering_id
      and g.slug = v_slug
  ) loop
    v_slug := v_slug_base || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);
  end loop;

  update public.gatherings
  set circle_id = v_target_circle_id,
      title = v_title,
      slug = v_slug,
      description = nullif(btrim(coalesce(p_description, '')), ''),
      poster_url = nullif(btrim(coalesce(p_poster_url, '')), ''),
      presentation_mode = v_presentation_mode,
      featured_profile_id = v_featured_profile_id,
      seat_context = v_seat_context,
      host_created_for_member = case when v_presentation_mode = 'seat_linked' then true else false end,
      gathering_type = p_gathering_type,
      status = case
        when v_is_admin then 'approved'
        when v_gathering.status = 'approved' then 'approved'
        else 'pending_review'
      end,
      country_code = upper(nullif(btrim(coalesce(p_country_code, '')), '')),
      country_name = nullif(btrim(coalesce(p_country_name, '')), ''),
      region = nullif(btrim(coalesce(p_region, '')), ''),
      city = nullif(btrim(coalesce(p_city, '')), ''),
      venue_name = nullif(btrim(coalesce(p_venue_name, '')), ''),
      venue_address = nullif(btrim(coalesce(p_venue_address, '')), ''),
      address_visibility = case
        when v_is_admin then coalesce(nullif(p_address_visibility, ''), 'attendees_only')
        when p_gathering_type in ('physical', 'hybrid', 'partner_venue') then 'attendees_only'
        else coalesce(nullif(p_address_visibility, ''), 'hidden')
      end,
      online_url = nullif(btrim(coalesce(p_online_url, '')), ''),
      platform = nullif(btrim(coalesce(p_platform, '')), ''),
      starts_at = p_starts_at,
      ends_at = p_ends_at,
      timezone = p_timezone,
      is_official = v_is_admin,
      is_partner_venue = v_is_admin and p_gathering_type = 'partner_venue',
      safe_first_date_space = case when v_is_admin then v_gathering.safe_first_date_space else false end,
      max_attendees = p_max_attendees,
      approved_by_admin_id = case when v_is_admin then v_user_id else approved_by_admin_id end,
      approved_at = case when v_is_admin then timezone('utc'::text, now()) else approved_at end,
      tags = coalesce(p_tags, '{}'),
      safety_note = nullif(btrim(coalesce(p_safety_note, '')), ''),
      rejected_reason = null,
      updated_at = timezone('utc'::text, now())
  where id = p_gathering_id
  returning * into v_gathering;

  return v_gathering;
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
  welcome_profiles jsonb,
  status text,
  priority integer,
  starts_at timestamptz,
  expires_at timestamptz,
  comment_count integer,
  gathering_starts_at timestamptz,
  gathering_city text,
  gathering_type text,
  gathering_presentation_mode text,
  gathering_seat_context text,
  gathering_host_created_for_member boolean,
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
        when cpi.item_type = 'welcome' then 'Welcome new members'::text
        else cpi.title
      end as title,
      cpi.subtitle,
      case
        when cpi.item_type = 'prompt' then cp.prompt
        when cpi.item_type = 'gathering' then g.description
        when cpi.item_type = 'love_seat' then cls.quote
        else cpi.body
      end as body,
      coalesce(
        nullif(btrim(coalesce(cpi.image_url, '')), ''),
        nullif(btrim(coalesce(g.poster_url, '')), ''),
        nullif(btrim(coalesce(m.thumbnail_url, '')), ''),
        nullif(btrim(coalesce(featured.avatar_url, '')), '')
      ) as image_url,
      coalesce(
        nullif(btrim(coalesce(cpi.media_url, '')), ''),
        nullif(btrim(coalesce(m.media_url, '')), '')
      ) as media_url,
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
      case
        when cpi.item_type = 'gathering'
          and coalesce(g.presentation_mode, 'general') = 'seat_linked'
          and gathering_featured.id is not null
          and gathering_featured_member.id is not null
        then gathering_featured.id
        else featured.id
      end as featured_profile_id,
      case
        when cpi.item_type = 'gathering'
          and coalesce(g.presentation_mode, 'general') = 'seat_linked'
          and gathering_featured.id is not null
          and gathering_featured_member.id is not null
        then gathering_featured.full_name
        else featured.full_name
      end as featured_profile_name,
      case
        when cpi.item_type = 'gathering'
          and coalesce(g.presentation_mode, 'general') = 'seat_linked'
          and gathering_featured.id is not null
          and gathering_featured_member.id is not null
        then gathering_featured.age
        else featured.age
      end as featured_profile_age,
      case
        when cpi.item_type = 'gathering'
          and coalesce(g.presentation_mode, 'general') = 'seat_linked'
          and gathering_featured.id is not null
          and gathering_featured_member.id is not null
        then gathering_featured.avatar_url
        else featured.avatar_url
      end as featured_profile_avatar_url,
      case
        when cpi.item_type = 'gathering'
          and coalesce(g.presentation_mode, 'general') = 'seat_linked'
          and gathering_featured.id is not null
          and gathering_featured_member.id is not null
        then coalesce(gathering_featured.city, gathering_featured.region)
        else coalesce(featured.city, featured.region)
      end as featured_profile_location,
      case
        when cpi.item_type = 'gathering'
          and coalesce(g.presentation_mode, 'general') = 'seat_linked'
          and gathering_featured.id is not null
          and gathering_featured_member.id is not null
          and coalesce(gathering_featured.verification_level, 0) > 0
        then 'Verified'::text
        when coalesce(featured.verification_level, 0) > 0
        then 'Verified'::text
        else null
      end as featured_profile_badge,
      cls.quote as love_seat_quote,
      coalesce(welcome.profiles, '[]'::jsonb) as welcome_profiles,
      cpi.status,
      cpi.priority,
      coalesce(cpi.starts_at, cp.starts_at, g.starts_at, cls.starts_at) as starts_at,
      coalesce(cpi.expires_at, cp.expires_at, cls.ends_at) as expires_at,
      cpi.starts_at as editorial_starts_at,
      cpi.expires_at as editorial_expires_at,
      g.starts_at as gathering_starts_at,
      g.city as gathering_city,
      g.gathering_type,
      coalesce(g.presentation_mode, 'general') as gathering_presentation_mode,
      g.seat_context as gathering_seat_context,
      coalesce(g.host_created_for_member, false) as gathering_host_created_for_member,
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
        when 'welcome' then jsonb_array_length(coalesce(welcome.profiles, '[]'::jsonb)) > 0
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
    left join public.profiles gathering_featured
      on gathering_featured.id = g.featured_profile_id
     and gathering_featured.deleted_at is null
    left join public.circle_members gathering_featured_member
      on gathering_featured_member.circle_id = cpi.circle_id
     and gathering_featured_member.profile_id = gathering_featured.id
     and gathering_featured_member.status = 'active'
     and gathering_featured_member.is_visible is not false
    left join lateral (
      select jsonb_agg(
        jsonb_build_object(
          'profile_id', profile.id,
          'name', coalesce(nullif(btrim(profile.full_name), ''), 'New member'),
          'avatar_url', profile.avatar_url,
          'location', coalesce(profile.city, profile.region),
          'joined_at', recent.joined_at
        )
        order by recent.joined_at desc, recent.id desc
      ) as profiles
      from (
        select cpwm.id, cpwm.profile_id, cpwm.joined_at
        from public.circle_pulse_welcome_members cpwm
        join public.circle_members member on member.id = cpwm.membership_id
        join public.profiles eligible_profile on eligible_profile.id = cpwm.profile_id
        where cpwm.circle_id = cpi.circle_id
          and cpwm.status = 'active'
          and cpwm.expires_at > timezone('utc'::text, now())
          and member.status = 'active'
          and member.is_visible is not false
          and eligible_profile.deleted_at is null
        order by cpwm.joined_at desc, cpwm.id desc
        limit 3
      ) recent
      join public.profiles profile on profile.id = recent.profile_id
    ) welcome on cpi.item_type = 'welcome'
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
    r.welcome_profiles,
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
    r.gathering_presentation_mode,
    r.gathering_seat_context,
    r.gathering_host_created_for_member,
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
  order by
    case r.item_type
      when 'prompt' then 1
      when 'gathering' then 2
      when 'welcome' then 3
      when 'love_seat' then 4
      when 'media' then 5
      when 'host_note' then 6
      else 7
    end,
    r.priority desc,
    r.starts_at desc nulls last,
    r.id desc;
end;
$$;

revoke all on function public.rpc_create_gathering_request(
  uuid, text, text, text, text, text, text, text, text, text, text, text, text, timestamptz, timestamptz, text, integer, text[], text, text, text, uuid, text, boolean
) from public;

revoke all on function public.rpc_update_gathering_request(
  uuid, uuid, text, text, text, text, text, text, text, text, text, text, text, text, timestamptz, timestamptz, text, integer, text[], text, text, text, uuid, text, boolean
) from public;

revoke all on function public.rpc_get_circle_pulse_items(uuid, boolean) from public;

grant execute on function public.rpc_create_gathering_request(
  uuid, text, text, text, text, text, text, text, text, text, text, text, text, timestamptz, timestamptz, text, integer, text[], text, text, text, uuid, text, boolean
) to authenticated;

grant execute on function public.rpc_update_gathering_request(
  uuid, uuid, text, text, text, text, text, text, text, text, text, text, text, text, timestamptz, timestamptz, text, integer, text[], text, text, text, uuid, text, boolean
) to authenticated;

grant execute on function public.rpc_get_circle_pulse_items(uuid, boolean) to authenticated;
