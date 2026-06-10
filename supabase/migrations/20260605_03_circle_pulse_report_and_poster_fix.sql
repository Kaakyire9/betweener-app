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

  select p.user_id into v_owner
  from public.profiles p
  where p.id = p_profile_id
  limit 1;

  if v_owner is null or v_owner <> auth.uid() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  v_is_circle_owner := public.is_circle_owner(p_circle_id, auth.uid());

  if not v_is_admin and not v_is_circle_owner then
    select lower(cm.role) into v_actor_role
    from public.circle_members cm
    where cm.circle_id = p_circle_id
      and cm.profile_id = p_profile_id
      and cm.status = 'active'
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

  select p.user_id into v_owner
  from public.profiles p
  where p.id = p_profile_id
  limit 1;

  if v_owner is null or v_owner <> auth.uid() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select *
    into v_report
  from public.circle_reports cr
  where cr.id = p_report_id
  for update;

  if v_report.id is null or v_report.circle_id is null then
    raise exception 'report_not_found';
  end if;

  v_is_circle_owner := public.is_circle_owner(v_report.circle_id, auth.uid());

  if not v_is_admin and not v_is_circle_owner then
    select lower(cm.role) into v_actor_role
    from public.circle_members cm
    where cm.circle_id = v_report.circle_id
      and cm.profile_id = p_profile_id
      and cm.status = 'active'
    limit 1;

    if coalesce(v_actor_role, '') not in ('leader', 'host', 'admin', 'moderator') then
      raise exception 'host_required' using errcode = '42501';
    end if;
  end if;

  update public.circle_reports cr
  set status = v_next_status
  where cr.id = p_report_id
  returning * into v_report;

  return v_report;
end;
$$;

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

  select p.user_id into v_owner
  from public.profiles p
  where p.id = p_profile_id
  limit 1;

  if v_owner is null or v_owner <> auth.uid() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select *
    into v_response
  from public.circle_prompt_responses cpr
  where cpr.id = p_response_id
  for update;

  if v_response.id is null or v_response.circle_id is null then
    raise exception 'response_not_found';
  end if;

  v_is_circle_owner := public.is_circle_owner(v_response.circle_id, auth.uid());

  if not v_is_admin and not v_is_circle_owner then
    select lower(cm.role) into v_actor_role
    from public.circle_members cm
    where cm.circle_id = v_response.circle_id
      and cm.profile_id = p_profile_id
      and cm.status = 'active'
    limit 1;

    if coalesce(v_actor_role, '') not in ('leader', 'host', 'admin', 'moderator') then
      raise exception 'host_required' using errcode = '42501';
    end if;
  end if;

  delete from public.circle_prompt_responses cpr
  where cpr.id = p_response_id;

  return found;
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
      featured.id as featured_profile_id,
      featured.full_name as featured_profile_name,
      featured.age as featured_profile_age,
      featured.avatar_url as featured_profile_avatar_url,
      coalesce(featured.city, featured.region) as featured_profile_location,
      case when coalesce(featured.verification_level, 0) > 0 then 'Verified'::text else null end as featured_profile_badge,
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

revoke all on function public.rpc_list_circle_reports(uuid, uuid) from public;
revoke all on function public.rpc_review_circle_report(uuid, uuid, text) from public;
revoke all on function public.rpc_remove_circle_prompt_response(uuid, uuid) from public;
revoke all on function public.rpc_get_circle_pulse_items(uuid, boolean) from public;

grant execute on function public.rpc_list_circle_reports(uuid, uuid) to authenticated;
grant execute on function public.rpc_review_circle_report(uuid, uuid, text) to authenticated;
grant execute on function public.rpc_remove_circle_prompt_response(uuid, uuid) to authenticated;
grant execute on function public.rpc_get_circle_pulse_items(uuid, boolean) to authenticated;
