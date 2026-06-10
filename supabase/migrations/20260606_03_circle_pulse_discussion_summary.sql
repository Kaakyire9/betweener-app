alter table public.circle_pulse_items
  add column if not exists discussion_cta text,
  add column if not exists discussion_summary text;

create or replace function public.sync_circle_pulse_item_comment_count(
  p_pulse_item_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_item_type text;
  v_comment_count integer := 0;
  v_gathering_mode text := 'general';
  v_gathering_seat_context text := null;
  v_discussion_cta text := null;
  v_discussion_summary text := null;
begin
  if p_pulse_item_id is null then
    return;
  end if;

  select
    cpi.item_type,
    coalesce(counts.comment_count, 0),
    coalesce(g.presentation_mode, 'general'),
    g.seat_context
  into
    v_item_type,
    v_comment_count,
    v_gathering_mode,
    v_gathering_seat_context
  from public.circle_pulse_items cpi
  left join public.gatherings g
    on g.id = cpi.gathering_id
   and cpi.item_type = 'gathering'
  left join (
    select
      cpc.pulse_item_id,
      count(*)::integer as comment_count
    from public.circle_pulse_comments cpc
    where cpc.pulse_item_id = p_pulse_item_id
      and cpc.status = 'active'
    group by cpc.pulse_item_id
  ) counts
    on counts.pulse_item_id = cpi.id
  where cpi.id = p_pulse_item_id;

  if v_item_type is null then
    return;
  end if;

  if v_comment_count > 0 then
    v_discussion_cta := case
      when v_item_type = 'welcome' then 'Open welcome'
      when v_item_type = 'love_seat' then 'Open conversation'
      when v_item_type = 'gathering' and v_gathering_mode = 'seat_linked' and v_gathering_seat_context = 'welcome' then 'Open welcome'
      when v_item_type = 'gathering' and v_gathering_mode = 'seat_linked' and v_gathering_seat_context = 'love' then 'Open conversation'
      else 'Open discussion'
    end;

    v_discussion_summary := case
      when v_item_type = 'welcome' then
        case
          when v_comment_count = 1 then '1 welcome note so far.'
          else v_comment_count::text || ' welcome notes so far.'
        end
      when v_item_type = 'love_seat' then
        case
          when v_comment_count = 1 then '1 thoughtful note so far.'
          else v_comment_count::text || ' thoughtful notes so far.'
        end
      when v_item_type = 'gathering' and v_gathering_mode = 'seat_linked' and v_gathering_seat_context = 'welcome' then
        case
          when v_comment_count = 1 then '1 comment already welcoming this member.'
          else v_comment_count::text || ' comments already welcoming this member.'
        end
      when v_item_type = 'gathering' and v_gathering_mode = 'seat_linked' and v_gathering_seat_context = 'love' then
        case
          when v_comment_count = 1 then '1 comment on this featured gathering.'
          else v_comment_count::text || ' comments on this featured gathering.'
        end
      when v_item_type = 'gathering' then
        case
          when v_comment_count = 1 then '1 comment on this gathering.'
          else v_comment_count::text || ' comments on this gathering.'
        end
      when v_item_type = 'prompt' then
        case
          when v_comment_count = 1 then '1 comment shaping this prompt.'
          else v_comment_count::text || ' comments shaping this prompt.'
        end
      when v_item_type = 'media' then
        case
          when v_comment_count = 1 then '1 comment on this moment.'
          else v_comment_count::text || ' comments on this moment.'
        end
      else
        case
          when v_comment_count = 1 then '1 comment on this note.'
          else v_comment_count::text || ' comments on this note.'
        end
    end;
  else
    v_discussion_cta := case
      when v_item_type = 'welcome' then 'Start the welcome'
      when v_item_type = 'love_seat' then 'Start conversation'
      when v_item_type = 'gathering' and v_gathering_mode = 'seat_linked' and v_gathering_seat_context = 'welcome' then 'Start welcome'
      when v_item_type = 'gathering' and v_gathering_mode = 'seat_linked' and v_gathering_seat_context = 'love' then 'Start conversation'
      else 'Start discussion'
    end;
    v_discussion_summary := null;
  end if;

  update public.circle_pulse_items cpi
  set comment_count = v_comment_count,
      discussion_cta = v_discussion_cta,
      discussion_summary = v_discussion_summary,
      updated_at = timezone('utc'::text, now())
  where cpi.id = p_pulse_item_id;
end;
$$;

do $$
declare
  v_item record;
begin
  for v_item in
    select cpi.id
    from public.circle_pulse_items cpi
  loop
    perform public.sync_circle_pulse_item_comment_count(v_item.id);
  end loop;
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
  discussion_cta text,
  discussion_summary text,
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
      coalesce(cpi.comment_count, 0)::integer as comment_count,
      cpi.discussion_cta,
      cpi.discussion_summary,
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
    r.comment_count,
    r.discussion_cta,
    r.discussion_summary,
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

revoke all on function public.rpc_get_circle_pulse_items(uuid, boolean) from public;
grant execute on function public.rpc_get_circle_pulse_items(uuid, boolean) to authenticated;
