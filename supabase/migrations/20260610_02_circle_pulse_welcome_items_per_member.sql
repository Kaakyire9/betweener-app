alter table public.circle_pulse_welcome_members
  add column if not exists pulse_item_id uuid references public.circle_pulse_items(id) on delete set null;

drop index if exists public.circle_pulse_items_welcome_active_unique_idx;

create unique index if not exists circle_pulse_welcome_members_pulse_item_unique_idx
  on public.circle_pulse_welcome_members (pulse_item_id)
  where pulse_item_id is not null;

create or replace function public.ensure_circle_pulse_welcome_member()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_joined_at timestamptz;
  v_expires_at timestamptz;
  v_welcome_member_id uuid;
  v_pulse_item_id uuid;
begin
  if not (
    new.status = 'active'
    and lower(coalesce(new.role, 'member')) = 'member'
    and (
      tg_op = 'INSERT'
      or old.status is distinct from 'active'
    )
  ) then
    return new;
  end if;

  v_joined_at := coalesce(new.joined_at, timezone('utc'::text, now()));
  v_expires_at := greatest(
    v_joined_at + interval '14 days',
    timezone('utc'::text, now()) + interval '1 minute'
  );

  insert into public.circle_pulse_welcome_members (
    circle_id,
    membership_id,
    profile_id,
    joined_at,
    expires_at
  )
  values (
    new.circle_id,
    new.id,
    new.profile_id,
    v_joined_at,
    v_expires_at
  )
  on conflict (membership_id)
  do update set status = 'active',
                joined_at = excluded.joined_at,
                expires_at = excluded.expires_at
  returning id, pulse_item_id
  into v_welcome_member_id, v_pulse_item_id;

  if v_pulse_item_id is null then
    insert into public.circle_pulse_items (
      circle_id,
      item_type,
      title,
      body,
      status,
      priority,
      starts_at,
      expires_at
    )
    values (
      new.circle_id,
      'welcome',
      'Welcome new member',
      'Say hello and help this new member feel at home in this Circle.',
      'active',
      80,
      v_joined_at,
      v_expires_at
    )
    returning id into v_pulse_item_id;

    update public.circle_pulse_welcome_members
    set pulse_item_id = v_pulse_item_id
    where id = v_welcome_member_id;
  else
    update public.circle_pulse_items
    set circle_id = new.circle_id,
        item_type = 'welcome',
        title = 'Welcome new member',
        body = 'Say hello and help this new member feel at home in this Circle.',
        status = 'active',
        priority = 80,
        starts_at = v_joined_at,
        expires_at = v_expires_at,
        updated_at = timezone('utc'::text, now())
    where id = v_pulse_item_id;
  end if;

  return new;
end;
$$;

insert into public.circle_pulse_welcome_members (
  circle_id,
  membership_id,
  profile_id,
  joined_at,
  expires_at
)
select
  cm.circle_id,
  cm.id,
  cm.profile_id,
  cm.joined_at,
  cm.joined_at + interval '14 days'
from public.circle_members cm
where cm.status = 'active'
  and lower(coalesce(cm.role, 'member')) = 'member'
  and cm.joined_at > timezone('utc'::text, now()) - interval '14 days'
on conflict (membership_id)
do update set status = 'active',
              joined_at = excluded.joined_at,
              expires_at = excluded.expires_at;

do $$
declare
  v_member record;
  v_pulse_item_id uuid;
begin
  for v_member in
    select cpwm.id, cpwm.circle_id, cpwm.joined_at, cpwm.expires_at
    from public.circle_pulse_welcome_members cpwm
    where cpwm.status = 'active'
      and cpwm.expires_at > timezone('utc'::text, now())
      and cpwm.pulse_item_id is null
    order by cpwm.joined_at desc, cpwm.id desc
  loop
    insert into public.circle_pulse_items (
      circle_id,
      item_type,
      title,
      body,
      status,
      priority,
      starts_at,
      expires_at
    )
    values (
      v_member.circle_id,
      'welcome',
      'Welcome new member',
      'Say hello and help this new member feel at home in this Circle.',
      'active',
      80,
      v_member.joined_at,
      v_member.expires_at
    )
    returning id into v_pulse_item_id;

    update public.circle_pulse_welcome_members
    set pulse_item_id = v_pulse_item_id
    where id = v_member.id;
  end loop;
end;
$$;

update public.circle_pulse_items cpi
set status = 'archived',
    updated_at = timezone('utc'::text, now())
where cpi.item_type = 'welcome'
  and cpi.status = 'active'
  and not exists (
    select 1
    from public.circle_pulse_welcome_members cpwm
    where cpwm.pulse_item_id = cpi.id
  );

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
        when cpi.item_type = 'welcome' then 'Welcome new member'::text
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
        nullif(btrim(coalesce(featured.avatar_url, '')), ''),
        nullif(btrim(coalesce(welcome.featured_avatar_url, '')), '')
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
      coalesce(cpi.expires_at, cp.expires_at, cls.ends_at, welcome.expires_at) as expires_at,
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
      select
        jsonb_agg(
          jsonb_build_object(
            'profile_id', profile.id,
            'name', coalesce(nullif(btrim(profile.full_name), ''), 'New member'),
            'avatar_url', profile.avatar_url,
            'location', coalesce(profile.city, profile.region),
            'joined_at', cpwm.joined_at
          )
          order by cpwm.joined_at desc, cpwm.id desc
        ) as profiles,
        max(cpwm.expires_at) as expires_at,
        max(profile.avatar_url) as featured_avatar_url
      from public.circle_pulse_welcome_members cpwm
      join public.circle_members member on member.id = cpwm.membership_id
      join public.profiles profile on profile.id = cpwm.profile_id
      where cpwm.pulse_item_id = cpi.id
        and cpwm.status = 'active'
        and cpwm.expires_at > timezone('utc'::text, now())
        and member.status = 'active'
        and member.is_visible is not false
        and profile.deleted_at is null
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

create or replace function public.notify_circle_pulse_comment_push()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_actor_name text := 'Someone';
  v_actor_avatar text;
  v_circle_name text := 'your Circle';
  v_item_type text;
  v_love_seat_id uuid;
  v_parent_user_id uuid;
  v_target_user_id uuid;
  v_notified_user_ids uuid[] := array[new.user_id];
  v_payload_base jsonb;
  v_recipient record;
begin
  select
    coalesce(nullif(btrim(p.full_name), ''), 'Someone'),
    p.avatar_url
  into v_actor_name, v_actor_avatar
  from public.profiles p
  where p.id = new.profile_id
  limit 1;

  select
    coalesce(nullif(btrim(c.name), ''), 'your Circle'),
    cpi.item_type,
    cpi.love_seat_id
  into v_circle_name, v_item_type, v_love_seat_id
  from public.circle_pulse_items cpi
  join public.circles c on c.id = cpi.circle_id
  where cpi.id = new.pulse_item_id
  limit 1;

  v_payload_base := jsonb_build_object(
    'circle_id', new.circle_id,
    'pulse_item_id', new.pulse_item_id,
    'comment_id', new.id,
    'parent_comment_id', new.parent_comment_id,
    'actor_profile_id', new.profile_id,
    'name', v_actor_name,
    'avatar_url', v_actor_avatar
  );

  if new.parent_comment_id is not null then
    select cpc.user_id
      into v_parent_user_id
    from public.circle_pulse_comments cpc
    where cpc.id = new.parent_comment_id
    limit 1;

    if v_parent_user_id is not null
      and not (v_parent_user_id = any(v_notified_user_ids)) then
      perform public.enqueue_circle_pulse_push(
        v_parent_user_id,
        new.user_id,
        'circle_discussions',
        v_actor_name,
        v_actor_name || ' replied to your comment in ' || v_circle_name || '.',
        v_payload_base || jsonb_build_object(
          'type', 'circle_pulse_discussion',
          'event_type', 'reply'
        )
      );
      v_notified_user_ids := array_append(v_notified_user_ids, v_parent_user_id);
    end if;
  end if;

  if v_item_type = 'love_seat' and v_love_seat_id is not null then
    select p.user_id
      into v_target_user_id
    from public.circle_love_seats cls
    join public.profiles p on p.id = cls.featured_profile_id
    where cls.id = v_love_seat_id
    limit 1;

    if v_target_user_id is not null
      and not (v_target_user_id = any(v_notified_user_ids)) then
      perform public.enqueue_circle_pulse_push(
        v_target_user_id,
        new.user_id,
        'circle_discussions',
        v_actor_name,
        v_actor_name || ' joined your Love Seat discussion in ' || v_circle_name || '.',
        v_payload_base || jsonb_build_object(
          'type', 'circle_pulse_discussion',
          'event_type', 'love_seat_discussion'
        )
      );
      v_notified_user_ids := array_append(v_notified_user_ids, v_target_user_id);
    end if;
  elsif v_item_type = 'welcome' then
    for v_recipient in
      select distinct p.user_id as user_id
      from public.circle_pulse_welcome_members cpwm
      join public.profiles p on p.id = cpwm.profile_id
      where cpwm.pulse_item_id = new.pulse_item_id
        and cpwm.status = 'active'
        and cpwm.expires_at > timezone('utc'::text, now())
        and p.user_id is not null
    loop
      if v_recipient.user_id is null
        or v_recipient.user_id = any(v_notified_user_ids) then
        continue;
      end if;

      perform public.enqueue_circle_pulse_push(
        v_recipient.user_id,
        new.user_id,
        'circle_discussions',
        v_actor_name,
        v_actor_name || ' posted in your welcome discussion in ' || v_circle_name || '.',
        v_payload_base || jsonb_build_object(
          'type', 'circle_pulse_discussion',
          'event_type', 'welcome_discussion'
        )
      );
      v_notified_user_ids := array_append(v_notified_user_ids, v_recipient.user_id);
    end loop;
  end if;

  if new.parent_comment_id is not null then
    for v_recipient in
      select distinct cpc.user_id as user_id
      from public.circle_pulse_comments cpc
      where cpc.pulse_item_id = new.pulse_item_id
        and cpc.status = 'active'
        and cpc.user_id is not null
        and cpc.id <> new.id
    loop
      if v_recipient.user_id is null
        or v_recipient.user_id = any(v_notified_user_ids) then
        continue;
      end if;

      perform public.enqueue_circle_pulse_push(
        v_recipient.user_id,
        new.user_id,
        'circle_discussions',
        v_actor_name,
        v_actor_name || ' replied in a Circle discussion you joined.',
        v_payload_base || jsonb_build_object(
          'type', 'circle_pulse_discussion',
          'event_type', 'participant_reply'
        )
      );
      v_notified_user_ids := array_append(v_notified_user_ids, v_recipient.user_id);
    end loop;
  end if;

  return new;
end;
$$;

revoke all on function public.rpc_get_circle_pulse_items(uuid, boolean) from public;
grant execute on function public.rpc_get_circle_pulse_items(uuid, boolean) to authenticated;
